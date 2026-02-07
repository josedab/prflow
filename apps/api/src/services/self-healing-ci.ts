import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { callLLM } from '../agents/base.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  CIRun,
  CIFailureAnalysis,
  DetectedFailure,
  RootCauseAnalysis,
  CIFix,
  FlakyTest,
  AutoHealingResult,
  AppliedFix,
  CIHealthDashboard,
  FailureCategory,
  CIProvider,
  SelfHealingRecommendation,
  SelfHealingConfig,
} from '@prflow/core';

/**
 * Self-Healing CI Service
 * Automatic CI failure detection, diagnosis, and remediation
 */
export class SelfHealingCIService {
  // Default config
  private readonly defaultConfig: SelfHealingConfig = {
    enabled: true,
    autoFixEnabled: true,
    autoRetryFlaky: true,
    maxAutoRetries: 2,
    autoQuarantineFlaky: false,
    flakinessThreshold: 30,
    allowedFixTypes: ['retry', 'increase_timeout', 'add_retry', 'dependency_update'],
    notifications: {
      onFailure: true,
      onAutoFix: true,
      onFlakyDetected: true,
      channels: ['slack'],
    },
  };

  /**
   * Analyze a CI failure
   */
  async analyzeCIFailure(
    owner: string,
    repo: string,
    runId: string,
    options: {
      provider?: CIProvider;
      includeFixes?: boolean;
      includeFlakinessAnalysis?: boolean;
    } = {}
  ): Promise<CIFailureAnalysis> {
    const { provider = 'github_actions', includeFixes = true, includeFlakinessAnalysis = true } = options;

    logger.info({ owner, repo, runId, provider }, 'Analyzing CI failure');

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    // Get CI run data (in real implementation, would fetch from CI provider)
    const ciRun = await this.getCIRun(runId, provider);

    // Detect failures
    const failures = this.detectFailures(ciRun);

    // Analyze root cause
    const rootCause = await this.analyzeRootCause(failures, ciRun);

    // Check for flakiness
    let isFlaky = false;
    let flakinessConfidence = 0;

    if (includeFlakinessAnalysis) {
      const flakinessResult = await this.analyzeFlakinessFor(failures, owner, repo);
      isFlaky = flakinessResult.isFlaky;
      flakinessConfidence = flakinessResult.confidence;
    }

    // Generate fix suggestions
    let suggestedFixes: CIFix[] = [];
    if (includeFixes) {
      suggestedFixes = await this.generateFixes(failures, rootCause, isFlaky);
    }

    const analysis: CIFailureAnalysis = {
      id: uuidv4(),
      run: ciRun,
      failures,
      rootCause,
      isFlaky,
      flakinessConfidence,
      suggestedFixes,
      autoFixable: suggestedFixes.some(f => f.autoApplicable),
      confidence: rootCause.confidence,
      analyzedAt: new Date(),
    };

    // Store analysis
    await db.analyticsEvent.create({
      data: {
        repositoryId: repository.id,
        eventType: 'ci_failure_analysis',
        eventData: JSON.parse(JSON.stringify(analysis)),
      },
    });

    logger.info(
      { analysisId: analysis.id, failureCount: failures.length, isFlaky },
      'CI failure analysis completed'
    );

    return analysis;
  }

  /**
   * Apply fixes to a CI failure
   */
  async applyFixes(
    owner: string,
    repo: string,
    runId: string,
    fixIds: string[],
    options: {
      createCommit?: boolean;
      triggerRerun?: boolean;
      dryRun?: boolean;
    } = {}
  ): Promise<AutoHealingResult> {
    const { createCommit = true, triggerRerun = true, dryRun = false } = options;

    logger.info({ owner, repo, runId, fixIds, dryRun }, 'Applying CI fixes');

    // Get the analysis
    const analysis = await this.getAnalysis(owner, repo, runId);
    if (!analysis) {
      throw new Error(`Analysis for run ${runId} not found`);
    }

    const fixesApplied: AppliedFix[] = [];
    const fixesSkipped: Array<{ fix: CIFix; reason: string }> = [];

    for (const fixId of fixIds) {
      const fix = analysis.suggestedFixes.find(f => f.id === fixId);
      if (!fix) {
        continue;
      }

      if (!fix.autoApplicable && !dryRun) {
        fixesSkipped.push({ fix, reason: 'Not auto-applicable' });
        continue;
      }

      if (dryRun) {
        fixesApplied.push({
          fix,
          changesMade: this.describeChanges(fix),
          success: true,
        });
        continue;
      }

      // Apply the fix
      const result = await this.applyFix(fix, owner, repo);
      fixesApplied.push(result);
    }

    // Create commit if requested and fixes were applied
    let commitSha: string | undefined;
    if (createCommit && !dryRun && fixesApplied.some(f => f.success)) {
      commitSha = `fix-${uuidv4().slice(0, 8)}`;
      // In real implementation, would create actual commit via GitHub API
    }

    // Trigger re-run if requested
    let newRunId: string | undefined;
    let newRunTriggered = false;
    if (triggerRerun && !dryRun && fixesApplied.some(f => f.success)) {
      newRunId = `run-${uuidv4().slice(0, 8)}`;
      newRunTriggered = true;
      // In real implementation, would trigger CI re-run
    }

    const result: AutoHealingResult = {
      id: uuidv4(),
      runId,
      fixesApplied,
      fixesSkipped,
      newRunTriggered,
      newRunId,
      success: fixesApplied.some(f => f.success),
      commitSha,
      appliedAt: new Date(),
    };

    logger.info(
      { resultId: result.id, applied: fixesApplied.length, skipped: fixesSkipped.length },
      'CI fixes applied'
    );

    return result;
  }

  /**
   * Get flaky tests for a repository
   */
  async getFlakyTests(
    owner: string,
    repo: string,
    options: {
      minScore?: number;
      status?: FlakyTest['status'];
      limit?: number;
    } = {}
  ): Promise<FlakyTest[]> {
    const { minScore = 10, limit = 50 } = options;

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      return [];
    }

    // Get flaky test records
    const events = await db.analyticsEvent.findMany({
      where: {
        repositoryId: repository.id,
        eventType: 'flaky_test',
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2, // Get more to filter
    });

    let tests = events.map(e => e.eventData as unknown as FlakyTest);

    // Filter by score
    tests = tests.filter(t => t.flakinessScore >= minScore);

    // Filter by status
    if (options.status) {
      tests = tests.filter(t => t.status === options.status);
    }

    // Deduplicate by test name
    const uniqueTests = new Map<string, FlakyTest>();
    for (const test of tests) {
      if (!uniqueTests.has(test.name)) {
        uniqueTests.set(test.name, test);
      }
    }

    return Array.from(uniqueTests.values())
      .sort((a, b) => b.flakinessScore - a.flakinessScore)
      .slice(0, limit);
  }

  /**
   * Record a flaky test
   */
  async recordFlakyTest(
    owner: string,
    repo: string,
    testName: string,
    testFile: string,
    passed: boolean,
    errorMessage?: string
  ): Promise<FlakyTest> {
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    // Get existing record
    const existingEvent = await db.analyticsEvent.findFirst({
      where: {
        repositoryId: repository.id,
        eventType: 'flaky_test',
        eventData: {
          path: ['name'],
          equals: testName,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let flakyTest: FlakyTest;

    if (existingEvent) {
      const existing = existingEvent.eventData as unknown as FlakyTest;
      flakyTest = {
        ...existing,
        totalRuns: existing.totalRuns + 1,
        passes: existing.passes + (passed ? 1 : 0),
        failures: existing.failures + (passed ? 0 : 1),
        passRate: (existing.passes + (passed ? 1 : 0)) / (existing.totalRuns + 1),
        flakinessScore: this.calculateFlakinessScore(
          existing.passes + (passed ? 1 : 0),
          existing.failures + (passed ? 0 : 1)
        ),
        lastFailure: passed ? existing.lastFailure : new Date(),
      };
    } else {
      flakyTest = {
        id: uuidv4(),
        name: testName,
        file: testFile,
        repository: { owner, name: repo },
        flakinessScore: passed ? 0 : 50,
        passRate: passed ? 1 : 0,
        totalRuns: 1,
        passes: passed ? 1 : 0,
        failures: passed ? 0 : 1,
        firstDetected: new Date(),
        lastFailure: passed ? undefined : new Date(),
        failurePatterns: errorMessage ? [{ type: 'unknown', description: errorMessage, frequency: 1 }] : [],
        status: 'active',
      };
    }

    await db.analyticsEvent.create({
      data: {
        repositoryId: repository.id,
        eventType: 'flaky_test',
        eventData: JSON.parse(JSON.stringify(flakyTest)),
      },
    });

    return flakyTest;
  }

  /**
   * Quarantine a flaky test
   */
  async quarantineTest(
    owner: string,
    repo: string,
    testId: string,
    reason: string
  ): Promise<FlakyTest> {
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const event = await db.analyticsEvent.findFirst({
      where: {
        repositoryId: repository.id,
        eventType: 'flaky_test',
        eventData: {
          path: ['id'],
          equals: testId,
        },
      },
    });

    if (!event) {
      throw new Error(`Flaky test ${testId} not found`);
    }

    const flakyTest = event.eventData as unknown as FlakyTest;
    flakyTest.status = 'quarantined';

    await db.analyticsEvent.create({
      data: {
        repositoryId: repository.id,
        eventType: 'flaky_test',
        eventData: JSON.parse(JSON.stringify(flakyTest)),
      },
    });

    logger.info({ testId, reason }, 'Test quarantined');

    return flakyTest;
  }

  /**
   * Get CI health dashboard
   */
  async getCIHealthDashboard(
    owner: string,
    repo: string,
    periodDays = 30
  ): Promise<CIHealthDashboard> {
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Get CI analysis events
    const events = await db.analyticsEvent.findMany({
      where: {
        repositoryId: repository.id,
        eventType: 'ci_failure_analysis',
        createdAt: { gte: periodStart },
      },
    });

    const analyses = events.map(e => e.eventData as unknown as CIFailureAnalysis);

    // Calculate metrics
    const totalRuns = analyses.length + 100; // Assume some successful runs
    const failedRuns = analyses.length;
    const successfulRuns = totalRuns - failedRuns;
    const successRate = successfulRuns / totalRuns;

    // Get flaky tests
    const flakyTests = await this.getFlakyTests(owner, repo);

    // Calculate failure breakdown
    const failureBreakdown: Record<FailureCategory, number> = {
      test_failure: 0,
      build_failure: 0,
      lint_error: 0,
      type_error: 0,
      dependency_error: 0,
      timeout: 0,
      infrastructure: 0,
      flaky_test: 0,
      resource_exhaustion: 0,
      configuration_error: 0,
      unknown: 0,
    };

    for (const analysis of analyses) {
      for (const failure of analysis.failures) {
        failureBreakdown[failure.category]++;
      }
    }

    // Get top failures
    const errorCounts = new Map<string, { count: number; lastOccurred: Date }>();
    for (const analysis of analyses) {
      for (const failure of analysis.failures) {
        const key = failure.errorMessage.slice(0, 100);
        const existing = errorCounts.get(key) || { count: 0, lastOccurred: new Date(0) };
        existing.count++;
        if (analysis.analyzedAt > existing.lastOccurred) {
          existing.lastOccurred = analysis.analyzedAt;
        }
        errorCounts.set(key, existing);
      }
    }

    const topFailures = Array.from(errorCounts.entries())
      .map(([error, data]) => ({ error, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Generate recommendations
    const recommendations = this.generateRecommendations(failureBreakdown, flakyTests, successRate);

    // Calculate trends
    const trends = this.calculateTrends(analyses, periodStart);

    // Calculate health score
    const healthScore = this.calculateHealthScore(successRate, flakyTests.length, failureBreakdown);

    return {
      repository: { owner, name: repo },
      period: { start: periodStart, end: new Date() },
      healthScore,
      successRate,
      avgDurationMs: 300000, // 5 minutes placeholder
      totalRuns,
      successfulRuns,
      failedRuns,
      flakyTestCount: flakyTests.length,
      autoHealedCount: analyses.filter(a => a.autoFixable).length,
      failureBreakdown,
      trends,
      topFailures,
      recommendations,
      generatedAt: new Date(),
    };
  }

  /**
   * Get configuration for a repository
   */
  async getConfig(_owner: string, _repo: string): Promise<SelfHealingConfig> {
    // In real implementation, would fetch from database
    return this.defaultConfig;
  }

  /**
   * Update configuration for a repository
   */
  async updateConfig(
    owner: string,
    repo: string,
    updates: Partial<SelfHealingConfig>
  ): Promise<SelfHealingConfig> {
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    const config = { ...this.defaultConfig, ...updates };

    await db.analyticsEvent.create({
      data: {
        repositoryId: repository.id,
        eventType: 'self_healing_config',
        eventData: JSON.parse(JSON.stringify(config)),
      },
    });

    return config;
  }

  // Private helpers

  private async getCIRun(runId: string, _provider: CIProvider): Promise<CIRun> {
    // In real implementation, would fetch from CI provider API
    return {
      id: runId,
      provider: 'github_actions',
      workflowName: 'CI',
      runNumber: parseInt(runId.replace(/\D/g, '') || '1', 10),
      status: 'failure',
      conclusion: 'failure',
      branch: 'main',
      commitSha: 'abc123',
      jobs: [
        {
          id: 'job-1',
          name: 'test',
          status: 'failure',
          conclusion: 'failure',
          steps: [
            { number: 1, name: 'Checkout', status: 'success', conclusion: 'success' },
            { number: 2, name: 'Install', status: 'success', conclusion: 'success' },
            { number: 3, name: 'Test', status: 'failure', conclusion: 'failure', log: 'Error: Test failed' },
          ],
        },
      ],
      startedAt: new Date(Date.now() - 300000),
      completedAt: new Date(),
      durationMs: 300000,
      url: `https://github.com/owner/repo/actions/runs/${runId}`,
    };
  }

  private detectFailures(run: CIRun): DetectedFailure[] {
    const failures: DetectedFailure[] = [];

    for (const job of run.jobs) {
      if (job.conclusion !== 'failure') continue;

      for (const step of job.steps) {
        if (step.conclusion !== 'failure') continue;

        const category = this.categorizeFailure(step.name, step.log);

        failures.push({
          id: uuidv4(),
          job: job.name,
          step: step.name,
          category,
          errorMessage: step.log || 'Unknown error',
          similarPastFailures: 0,
        });
      }
    }

    return failures;
  }

  private categorizeFailure(stepName: string, log?: string): FailureCategory {
    const stepLower = stepName.toLowerCase();
    const logLower = (log || '').toLowerCase();

    if (stepLower.includes('test') || logLower.includes('test failed')) return 'test_failure';
    if (stepLower.includes('build') || logLower.includes('build failed')) return 'build_failure';
    if (stepLower.includes('lint') || logLower.includes('lint error')) return 'lint_error';
    if (stepLower.includes('type') || logLower.includes('type error')) return 'type_error';
    if (logLower.includes('npm err') || logLower.includes('dependency')) return 'dependency_error';
    if (logLower.includes('timeout')) return 'timeout';
    if (logLower.includes('out of memory') || logLower.includes('oom')) return 'resource_exhaustion';

    return 'unknown';
  }

  private async analyzeRootCause(failures: DetectedFailure[], _run: CIRun): Promise<RootCauseAnalysis> {
    if (failures.length === 0) {
      return {
        primaryCause: 'Unknown',
        category: 'unknown',
        confidence: 0,
        contributingFactors: [],
        evidence: [],
        affectedComponents: [],
      };
    }

    // Use LLM for complex analysis
    const prompt = `Analyze these CI failures and determine the root cause:

Failures:
${failures.map(f => `- ${f.job}/${f.step}: ${f.category} - ${f.errorMessage}`).join('\n')}

Provide:
1. Primary cause
2. Contributing factors
3. Affected components

Format as JSON: { primaryCause, contributingFactors: [], affectedComponents: [] }`;

    try {
      const response = await callLLM([
        { role: 'system', content: 'You are a CI/CD expert analyzing build failures.' },
        { role: 'user', content: prompt },
      ], {
        maxTokens: 500,
      });

      const parsed = JSON.parse(response.content);
      return {
        primaryCause: parsed.primaryCause || failures[0].errorMessage,
        category: failures[0].category,
        confidence: 0.8,
        contributingFactors: parsed.contributingFactors || [],
        evidence: failures.map(f => f.errorMessage),
        affectedComponents: parsed.affectedComponents || [],
      };
    } catch {
      return {
        primaryCause: failures[0].errorMessage,
        category: failures[0].category,
        confidence: 0.5,
        contributingFactors: [],
        evidence: failures.map(f => f.errorMessage),
        affectedComponents: [],
      };
    }
  }

  private async analyzeFlakinessFor(
    failures: DetectedFailure[],
    _owner: string,
    _repo: string
  ): Promise<{ isFlaky: boolean; confidence: number }> {
    // Check if failures look flaky
    const flakyIndicators = failures.filter(f =>
      f.category === 'flaky_test' ||
      f.errorMessage.toLowerCase().includes('timeout') ||
      f.errorMessage.toLowerCase().includes('connection') ||
      f.errorMessage.toLowerCase().includes('race')
    );

    return {
      isFlaky: flakyIndicators.length > 0,
      confidence: flakyIndicators.length / Math.max(1, failures.length),
    };
  }

  private async generateFixes(
    failures: DetectedFailure[],
    rootCause: RootCauseAnalysis,
    isFlaky: boolean
  ): Promise<CIFix[]> {
    const fixes: CIFix[] = [];

    // Retry fix for flaky failures
    if (isFlaky) {
      fixes.push({
        id: uuidv4(),
        type: 'retry',
        title: 'Retry the failing job',
        description: 'The failure appears to be flaky. Retrying may succeed.',
        priority: 'high',
        autoApplicable: true,
        confidence: 0.7,
        expectedOutcome: 'Job passes on retry',
        riskLevel: 'low',
      });

      fixes.push({
        id: uuidv4(),
        type: 'add_retry',
        title: 'Add automatic retry to workflow',
        description: 'Configure the workflow to automatically retry on failure.',
        priority: 'medium',
        autoApplicable: true,
        confidence: 0.8,
        ciConfigChanges: [
          {
            file: '.github/workflows/ci.yml',
            path: 'jobs.test.strategy.fail-fast',
            original: true,
            newValue: false,
            explanation: 'Disable fail-fast to allow retries',
          },
        ],
        expectedOutcome: 'Reduced flaky failure impact',
        riskLevel: 'low',
      });
    }

    // Category-specific fixes
    for (const failure of failures) {
      switch (failure.category) {
        case 'timeout':
          fixes.push({
            id: uuidv4(),
            type: 'increase_timeout',
            title: 'Increase job timeout',
            description: `Job ${failure.job} timed out. Increasing timeout may help.`,
            priority: 'medium',
            autoApplicable: true,
            confidence: 0.6,
            ciConfigChanges: [
              {
                file: '.github/workflows/ci.yml',
                path: `jobs.${failure.job}.timeout-minutes`,
                original: 10,
                newValue: 20,
                explanation: 'Double the timeout duration',
              },
            ],
            expectedOutcome: 'Job completes within new timeout',
            riskLevel: 'low',
          });
          break;

        case 'dependency_error':
          fixes.push({
            id: uuidv4(),
            type: 'dependency_update',
            title: 'Clear dependency cache and reinstall',
            description: 'Dependency resolution failed. Clearing cache may help.',
            priority: 'high',
            autoApplicable: true,
            confidence: 0.7,
            commands: ['rm -rf node_modules', 'npm cache clean --force', 'npm install'],
            expectedOutcome: 'Dependencies install successfully',
            riskLevel: 'medium',
          });
          break;

        case 'test_failure':
          if (!isFlaky) {
            fixes.push({
              id: uuidv4(),
              type: 'test_fix',
              title: 'Fix failing test',
              description: `Test in ${failure.job} failed. Manual fix required.`,
              priority: 'high',
              autoApplicable: false,
              confidence: 0.4,
              expectedOutcome: 'Test passes',
              riskLevel: 'medium',
            });
          }
          break;
      }
    }

    // Use LLM for code-level fixes
    if (rootCause.confidence > 0.7) {
      const llmFix = await this.getLLMFix(failures, rootCause);
      if (llmFix) {
        fixes.push(llmFix);
      }
    }

    return fixes;
  }

  private async getLLMFix(
    failures: DetectedFailure[],
    rootCause: RootCauseAnalysis
  ): Promise<CIFix | null> {
    const prompt = `Suggest a code fix for this CI failure:

Root cause: ${rootCause.primaryCause}
Category: ${rootCause.category}
Errors:
${failures.map(f => `- ${f.errorMessage}`).join('\n')}

If a code change can fix this, provide it.
Format as JSON: { title, description, file, original, fixed, explanation }
Return null if no code fix is appropriate.`;

    try {
      const response = await callLLM([
        { role: 'system', content: 'You are a CI/CD expert suggesting code fixes.' },
        { role: 'user', content: prompt },
      ], {
        maxTokens: 500,
      });

      if (response.content === 'null' || !response.content.trim()) return null;

      const parsed = JSON.parse(response.content);
      if (!parsed.title) return null;

      return {
        id: uuidv4(),
        type: 'code_fix',
        title: parsed.title,
        description: parsed.description,
        priority: 'medium',
        autoApplicable: false,
        confidence: 0.6,
        codeChanges: parsed.file ? [
          {
            file: parsed.file,
            original: parsed.original,
            fixed: parsed.fixed,
            explanation: parsed.explanation,
          },
        ] : undefined,
        expectedOutcome: 'Fix applied successfully',
        riskLevel: 'medium',
      };
    } catch {
      return null;
    }
  }

  private async getAnalysis(
    owner: string,
    repo: string,
    runId: string
  ): Promise<CIFailureAnalysis | null> {
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) return null;

    const event = await db.analyticsEvent.findFirst({
      where: {
        repositoryId: repository.id,
        eventType: 'ci_failure_analysis',
        eventData: {
          path: ['run', 'id'],
          equals: runId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return event?.eventData as unknown as CIFailureAnalysis | null;
  }

  private async applyFix(fix: CIFix, _owner: string, _repo: string): Promise<AppliedFix> {
    // In real implementation, would apply changes via GitHub API
    return {
      fix,
      changesMade: this.describeChanges(fix),
      success: true,
    };
  }

  private describeChanges(fix: CIFix): string[] {
    const changes: string[] = [];

    if (fix.codeChanges) {
      for (const change of fix.codeChanges) {
        changes.push(`Modified ${change.file}: ${change.explanation}`);
      }
    }

    if (fix.ciConfigChanges) {
      for (const change of fix.ciConfigChanges) {
        changes.push(`Updated ${change.file} at ${change.path}: ${change.explanation}`);
      }
    }

    if (fix.commands) {
      changes.push(`Would run: ${fix.commands.join(' && ')}`);
    }

    if (fix.type === 'retry') {
      changes.push('Triggered job retry');
    }

    return changes;
  }

  private calculateFlakinessScore(passes: number, failures: number): number {
    const total = passes + failures;
    if (total < 2) return 0;

    const passRate = passes / total;
    // Flakiness is highest when pass rate is around 50%
    const flakiness = 1 - Math.abs(passRate - 0.5) * 2;
    return Math.round(flakiness * 100);
  }

  private generateRecommendations(
    failureBreakdown: Record<FailureCategory, number>,
    flakyTests: FlakyTest[],
    successRate: number
  ): SelfHealingRecommendation[] {
    const recommendations: SelfHealingRecommendation[] = [];

    if (flakyTests.length > 5) {
      recommendations.push({
        id: uuidv4(),
        type: 'flakiness',
        priority: 'high',
        title: 'Address flaky test backlog',
        description: `${flakyTests.length} flaky tests detected. This impacts CI reliability.`,
        actions: [
          'Review and fix top flaky tests',
          'Consider quarantining persistent flaky tests',
          'Add retry logic for tests prone to timing issues',
        ],
        expectedImpact: 'Improved CI reliability and developer productivity',
      });
    }

    if (successRate < 0.8) {
      recommendations.push({
        id: uuidv4(),
        type: 'reliability',
        priority: 'high',
        title: 'Improve CI success rate',
        description: `CI success rate is ${Math.round(successRate * 100)}%. Target: >90%`,
        actions: [
          'Investigate top failure causes',
          'Add better error handling',
          'Improve test isolation',
        ],
        expectedImpact: 'Higher success rate and faster feedback',
      });
    }

    if (failureBreakdown.timeout > 5) {
      recommendations.push({
        id: uuidv4(),
        type: 'performance',
        priority: 'medium',
        title: 'Reduce timeout failures',
        description: `${failureBreakdown.timeout} timeout failures detected.`,
        actions: [
          'Optimize slow tests',
          'Consider test parallelization',
          'Review resource allocation',
        ],
        expectedImpact: 'Fewer timeout-related failures',
      });
    }

    return recommendations;
  }

  private calculateTrends(
    analyses: CIFailureAnalysis[],
    periodStart: Date
  ): CIHealthDashboard['trends'] {
    // Group by day
    const byDay = new Map<string, CIFailureAnalysis[]>();
    for (const analysis of analyses) {
      const day = analysis.analyzedAt.toISOString().split('T')[0];
      const existing = byDay.get(day) || [];
      existing.push(analysis);
      byDay.set(day, existing);
    }

    const history: CIHealthDashboard['trends']['history'] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let d = periodStart.getTime(); d <= Date.now(); d += dayMs) {
      const date = new Date(d);
      const day = date.toISOString().split('T')[0];
      const dayAnalyses = byDay.get(day) || [];

      const totalRuns = dayAnalyses.length + 10; // Assume some successful runs
      const successRate = (totalRuns - dayAnalyses.length) / totalRuns;
      const flakyTests = dayAnalyses.filter(a => a.isFlaky).length;

      history.push({
        date,
        successRate,
        avgDuration: 300000,
        flakyTests,
      });
    }

    // Calculate trends
    const firstHalf = history.slice(0, Math.floor(history.length / 2));
    const secondHalf = history.slice(Math.floor(history.length / 2));

    const firstAvg = firstHalf.reduce((sum, h) => sum + h.successRate, 0) / Math.max(1, firstHalf.length);
    const secondAvg = secondHalf.reduce((sum, h) => sum + h.successRate, 0) / Math.max(1, secondHalf.length);

    const successRateTrend = secondAvg > firstAvg + 0.05 ? 'improving' : secondAvg < firstAvg - 0.05 ? 'degrading' : 'stable';

    return {
      successRateTrend,
      durationTrend: 'stable',
      flakinessTrend: 'stable',
      history,
    };
  }

  private calculateHealthScore(
    successRate: number,
    flakyTestCount: number,
    failureBreakdown: Record<FailureCategory, number>
  ): number {
    let score = successRate * 100;

    // Penalize for flaky tests
    score -= Math.min(20, flakyTestCount * 2);

    // Penalize for critical failure types
    score -= failureBreakdown.test_failure * 0.5;
    score -= failureBreakdown.build_failure * 1;
    score -= failureBreakdown.infrastructure * 2;

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}

export const selfHealingCIService = new SelfHealingCIService();
