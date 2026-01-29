import {
  IntentAgentInput,
  IntentAgentResult,
  IntentAnalysis,
  IntentCategory,
  IntentConfidence,
  BranchNameSignal,
  CommitMessageSignal,
  ConventionalCommit,
  CodeChangeSignal,
  PRMetadataSignal,
  IntentBasedReviewStrategy,
  IntentSummary,
  DEFAULT_BRANCH_PATTERNS,
  DEFAULT_COMMIT_CONVENTIONS,
  DEFAULT_INTENT_KEYWORDS,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

const AGENT_TYPE = 'intent';
const AGENT_DESCRIPTION = 'Analyzes PR to understand developer intent for context-aware reviews';
const ANALYSIS_VERSION = '1.0.0';

export class IntentAgent extends BaseAgent<IntentAgentInput, IntentAgentResult> {
  readonly name = AGENT_TYPE;
  readonly description = AGENT_DESCRIPTION;

  async execute(input: IntentAgentInput, context: { repositoryId: string }): Promise<{
    success: boolean;
    data?: IntentAgentResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input, context.repositoryId);
    });

    if (!result || !result.success) {
      return this.createErrorResult(result?.error || 'Operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(
    input: IntentAgentInput,
    repositoryId: string
  ): Promise<IntentAgentResult> {
    switch (input.operation) {
      case 'analyze':
        return this.analyzeIntent(input, repositoryId);
      case 'feedback':
        return this.recordFeedback(input);
      case 'configure':
        return this.updateConfiguration(input);
      case 'get_stats':
        return this.getStats(input, repositoryId);
      default:
        return {
          operation: input.operation,
          success: false,
          error: `Unknown operation: ${input.operation}`,
        };
    }
  }

  private async analyzeIntent(
    input: IntentAgentInput,
    repositoryId: string
  ): Promise<IntentAgentResult> {
    if (!input.prData) {
      return {
        operation: 'analyze',
        success: false,
        error: 'PR data required for intent analysis',
      };
    }

    const { prData } = input;

    logger.info(
      { prNumber: prData.prNumber, title: prData.title },
      'Analyzing PR intent'
    );

    // Extract signals from various sources
    const branchNameSignal = this.analyzeBranchName(prData.headBranch);
    const commitMessageSignal = this.analyzeCommitMessages(prData.commits);
    const codeChangeSignal = this.analyzeCodeChanges(prData.files);
    const prMetadataSignal = this.analyzePRMetadata(prData);

    // Calculate intent scores from signals
    const intentScores = this.calculateIntentScores({
      branchNameSignal,
      commitMessageSignal,
      codeChangeSignal,
      prMetadataSignal,
    });

    // Get primary and secondary intents
    const sortedIntents = Object.entries(intentScores)
      .sort(([, a], [, b]) => b - a)
      .filter(([, score]) => score > 0);

    const primaryIntent = sortedIntents[0]?.[0] as IntentCategory || 'unknown';
    const primaryScore = sortedIntents[0]?.[1] || 0;

    const secondaryIntents = sortedIntents
      .slice(1, 4)
      .filter(([, score]) => score >= 20)
      .map(([category, score]) => ({
        category: category as IntentCategory,
        confidence: this.scoreToConfidence(score),
        reason: this.getIntentReason(category as IntentCategory, {
          branchNameSignal,
          commitMessageSignal,
          codeChangeSignal,
          prMetadataSignal,
        }),
      }));

    // Generate summary and review strategy using LLM
    const summary = await this.generateIntentSummary(prData, primaryIntent, primaryScore);
    const reviewStrategy = this.generateReviewStrategy(primaryIntent, prData);

    const analysis: IntentAnalysis = {
      prNumber: prData.prNumber,
      repositoryId,
      primaryIntent,
      primaryConfidence: this.scoreToConfidence(primaryScore).level,
      primaryConfidenceScore: primaryScore,
      secondaryIntents,
      signals: {
        branchName: branchNameSignal,
        commitMessages: commitMessageSignal,
        codeChanges: codeChangeSignal,
        prMetadata: prMetadataSignal,
      },
      summary,
      reviewStrategy,
      analyzedAt: new Date(),
      analysisVersion: ANALYSIS_VERSION,
    };

    logger.info(
      {
        prNumber: prData.prNumber,
        primaryIntent,
        confidence: primaryScore,
      },
      'Intent analysis completed'
    );

    return {
      operation: 'analyze',
      success: true,
      data: { analysis },
    };
  }

  private analyzeBranchName(branchName: string): BranchNameSignal {
    const normalized = branchName.toLowerCase();
    const keywords: string[] = [];
    let pattern: string | null = null;
    let issueNumber: string | null = null;
    let suggestedCategory: IntentCategory | null = null;

    // Extract issue/ticket number
    const issueMatch = normalized.match(/(?:issue|ticket|bug|feat|fix)[_-]?(\d+)/i)
      || normalized.match(/(\d{3,})/);
    if (issueMatch) {
      issueNumber = issueMatch[1];
    }

    // Match against known patterns
    for (const bp of DEFAULT_BRANCH_PATTERNS) {
      const regex = new RegExp(bp.pattern, 'i');
      if (regex.test(normalized)) {
        pattern = bp.pattern;
        suggestedCategory = bp.category;
        break;
      }
    }

    // Extract keywords
    const words = normalized.split(/[/_-]+/);
    for (const word of words) {
      for (const [category, categoryKeywords] of Object.entries(DEFAULT_INTENT_KEYWORDS)) {
        if (categoryKeywords.some(kw => word.includes(kw.toLowerCase()))) {
          keywords.push(word);
          if (!suggestedCategory) {
            suggestedCategory = category as IntentCategory;
          }
        }
      }
    }

    return {
      raw: branchName,
      pattern,
      issueNumber,
      keywords,
      suggestedCategory,
    };
  }

  private analyzeCommitMessages(
    commits: Array<{ sha: string; message: string }>
  ): CommitMessageSignal {
    const messages = commits.map(c => c.message);
    const conventionalCommits: ConventionalCommit[] = [];
    const keywords: string[] = [];
    let hasIssueReferences = false;

    // Parse conventional commits
    for (const message of messages) {
      const ccMatch = message.match(
        /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+?)(?:\n\n([\s\S]*))?$/
      );
      
      if (ccMatch) {
        const [, type, scope, breaking, description, body] = ccMatch;
        const footers: Record<string, string> = {};
        
        if (body) {
          const footerMatches = body.matchAll(/^([a-zA-Z-]+):\s*(.+)$/gm);
          for (const match of footerMatches) {
            footers[match[1]] = match[2];
          }
        }

        conventionalCommits.push({
          type,
          scope: scope || null,
          description,
          body: body || null,
          breakingChange: !!breaking || !!footers['BREAKING CHANGE'],
          footers,
        });
      }

      // Check for issue references
      if (/#\d+|closes|fixes|resolves/i.test(message)) {
        hasIssueReferences = true;
      }

      // Extract keywords
      for (const [, categoryKeywords] of Object.entries(DEFAULT_INTENT_KEYWORDS)) {
        for (const kw of categoryKeywords) {
          if (message.toLowerCase().includes(kw.toLowerCase())) {
            keywords.push(kw);
          }
        }
      }
    }

    // Determine suggested category from conventional commits
    let suggestedCategory: IntentCategory | null = null;
    if (conventionalCommits.length > 0) {
      const typeCounts = new Map<string, number>();
      for (const cc of conventionalCommits) {
        typeCounts.set(cc.type, (typeCounts.get(cc.type) || 0) + 1);
      }
      const dominantType = Array.from(typeCounts.entries())
        .sort(([, a], [, b]) => b - a)[0]?.[0];
      
      const convention = DEFAULT_COMMIT_CONVENTIONS.find(c => c.type === dominantType);
      if (convention) {
        suggestedCategory = convention.category;
      }
    }

    return {
      messages,
      conventionalCommits,
      keywords: [...new Set(keywords)],
      suggestedCategory,
      averageLength: messages.length > 0
        ? messages.reduce((sum, m) => sum + m.length, 0) / messages.length
        : 0,
      hasIssueReferences,
    };
  }

  private analyzeCodeChanges(
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>
  ): CodeChangeSignal {
    const filePatterns: CodeChangeSignal['filePatterns'] = [];
    const changePatterns: CodeChangeSignal['changePatterns'] = [];
    const semanticSignals: CodeChangeSignal['semanticSignals'] = [];

    const totalFiles = files.length;
    let totalAdditions = 0;
    let totalDeletions = 0;

    // Categorize files
    let testFiles = 0;
    let configFiles = 0;
    let docsFiles = 0;
    let sourceFiles = 0;
    let dependencyFiles = 0;
    let ciFiles = 0;

    for (const file of files) {
      totalAdditions += file.additions;
      totalDeletions += file.deletions;

      const filename = file.filename.toLowerCase();

      if (filename.includes('.test.') || filename.includes('.spec.') || filename.includes('__tests__')) {
        testFiles++;
      } else if (filename.endsWith('.md') || filename.includes('/docs/')) {
        docsFiles++;
      } else if (
        filename.includes('config') ||
        filename.endsWith('.yaml') ||
        filename.endsWith('.yml') ||
        filename.endsWith('.json') ||
        filename.endsWith('.env')
      ) {
        configFiles++;
      } else if (
        filename === 'package.json' ||
        filename === 'package-lock.json' ||
        filename === 'pnpm-lock.yaml' ||
        filename === 'yarn.lock' ||
        filename.includes('requirements') ||
        filename === 'go.mod' ||
        filename === 'go.sum' ||
        filename === 'Cargo.toml'
      ) {
        dependencyFiles++;
      } else if (
        filename.includes('.github/') ||
        filename.includes('Dockerfile') ||
        filename.includes('docker-compose') ||
        filename.includes('.gitlab-ci')
      ) {
        ciFiles++;
      } else {
        sourceFiles++;
      }

      // Analyze patches for semantic signals
      if (file.patch) {
        this.extractSemanticSignals(file.filename, file.patch, semanticSignals);
      }
    }

    // Build file patterns
    if (testFiles > 0) {
      filePatterns.push({
        pattern: 'test_files',
        fileCount: testFiles,
        percentage: (testFiles / totalFiles) * 100,
      });
    }
    if (configFiles > 0) {
      filePatterns.push({
        pattern: 'config_files',
        fileCount: configFiles,
        percentage: (configFiles / totalFiles) * 100,
      });
    }
    if (docsFiles > 0) {
      filePatterns.push({
        pattern: 'docs_files',
        fileCount: docsFiles,
        percentage: (docsFiles / totalFiles) * 100,
      });
    }
    if (sourceFiles > 0) {
      filePatterns.push({
        pattern: 'source_files',
        fileCount: sourceFiles,
        percentage: (sourceFiles / totalFiles) * 100,
      });
    }
    if (dependencyFiles > 0) {
      filePatterns.push({
        pattern: 'dependency_files',
        fileCount: dependencyFiles,
        percentage: (dependencyFiles / totalFiles) * 100,
      });
    }
    if (ciFiles > 0) {
      filePatterns.push({
        pattern: 'ci_files',
        fileCount: ciFiles,
        percentage: (ciFiles / totalFiles) * 100,
      });
    }

    // Determine change pattern
    const totalChanges = totalAdditions + totalDeletions;
    if (totalChanges > 0) {
      const additionRatio = totalAdditions / totalChanges;
      
      if (additionRatio > 0.8) {
        changePatterns.push({
          pattern: 'mostly_additions',
          confidence: additionRatio,
          description: 'Predominantly new code being added',
        });
      } else if (additionRatio < 0.2) {
        changePatterns.push({
          pattern: 'mostly_deletions',
          confidence: 1 - additionRatio,
          description: 'Predominantly removing code',
        });
      } else if (Math.abs(totalAdditions - totalDeletions) / totalChanges < 0.3) {
        changePatterns.push({
          pattern: 'refactor_signature',
          confidence: 0.7,
          description: 'Similar additions and deletions suggests refactoring',
        });
      } else {
        changePatterns.push({
          pattern: 'balanced',
          confidence: 0.5,
          description: 'Mix of additions and deletions',
        });
      }
    }

    // Determine suggested category
    let suggestedCategory: IntentCategory | null = null;
    
    if (docsFiles > 0 && sourceFiles === 0 && testFiles === 0) {
      suggestedCategory = 'documentation';
    } else if (testFiles > 0 && sourceFiles === 0) {
      suggestedCategory = 'testing';
    } else if (dependencyFiles > 0 && sourceFiles === 0) {
      suggestedCategory = 'dependency_update';
    } else if (ciFiles > 0 && sourceFiles === 0) {
      suggestedCategory = 'infrastructure';
    } else if (configFiles > 0 && sourceFiles === 0) {
      suggestedCategory = 'configuration';
    } else if (changePatterns.some(p => p.pattern === 'refactor_signature')) {
      suggestedCategory = 'refactoring';
    }

    return {
      filePatterns,
      changePatterns,
      semanticSignals,
      suggestedCategory,
    };
  }

  private extractSemanticSignals(
    filename: string,
    patch: string,
    signals: CodeChangeSignal['semanticSignals']
  ): void {
    const lines = patch.split('\n');
    
    const patterns = [
      { pattern: /^\+.*function\s+(\w+)/, type: 'new_function' as const },
      { pattern: /^\+.*class\s+(\w+)/, type: 'new_class' as const },
      { pattern: /^\+.*catch\s*\(/, type: 'error_handling' as const },
      { pattern: /^\+.*logger?\.(log|info|warn|error|debug)/, type: 'logging' as const },
      { pattern: /^\+.*(validate|sanitize|check)/, type: 'validation' as const },
      { pattern: /^[-+].*@(Get|Post|Put|Delete|Patch|Route)/, type: 'api_change' as const },
    ];

    for (const line of lines) {
      for (const { pattern, type } of patterns) {
        if (pattern.test(line)) {
          const existing = signals.find(s => s.type === type);
          if (existing) {
            existing.count++;
            if (!existing.files.includes(filename)) {
              existing.files.push(filename);
            }
          } else {
            signals.push({ type, count: 1, files: [filename] });
          }
        }
      }
    }
  }

  private analyzePRMetadata(prData: NonNullable<IntentAgentInput['prData']>): PRMetadataSignal {
    const title = prData.title;
    const body = prData.body || '';
    const labels = prData.labels;

    // Extract keywords from title
    const titleKeywords: string[] = [];
    for (const [, categoryKeywords] of Object.entries(DEFAULT_INTENT_KEYWORDS)) {
      for (const kw of categoryKeywords) {
        if (title.toLowerCase().includes(kw.toLowerCase())) {
          titleKeywords.push(kw);
        }
      }
    }

    // Extract keywords from body
    const bodyKeywords: string[] = [];
    for (const [, categoryKeywords] of Object.entries(DEFAULT_INTENT_KEYWORDS)) {
      for (const kw of categoryKeywords) {
        if (body.toLowerCase().includes(kw.toLowerCase())) {
          bodyKeywords.push(kw);
        }
      }
    }

    // Check for PR template sections
    const hasPRTemplate = body.includes('##') || body.includes('### ');
    const templateSections: string[] = [];
    const sectionMatches = body.matchAll(/^##?\s+(.+)$/gm);
    for (const match of sectionMatches) {
      templateSections.push(match[1].trim());
    }

    // Determine category from labels
    let suggestedCategory: IntentCategory | null = null;
    const labelMap: Record<string, IntentCategory> = {
      bug: 'bug_fix',
      fix: 'bug_fix',
      feature: 'feature_addition',
      enhancement: 'feature_addition',
      documentation: 'documentation',
      docs: 'documentation',
      refactor: 'refactoring',
      performance: 'performance_optimization',
      security: 'security_fix',
      dependencies: 'dependency_update',
      test: 'testing',
      tests: 'testing',
      chore: 'cleanup',
      ci: 'infrastructure',
    };

    for (const label of labels) {
      const normalized = label.toLowerCase().replace(/[^a-z]/g, '');
      if (labelMap[normalized]) {
        suggestedCategory = labelMap[normalized];
        break;
      }
    }

    return {
      title,
      titleKeywords,
      bodyKeywords,
      labels,
      suggestedCategory,
      hasPRTemplate,
      templateSections,
    };
  }

  private calculateIntentScores(signals: {
    branchNameSignal: BranchNameSignal;
    commitMessageSignal: CommitMessageSignal;
    codeChangeSignal: CodeChangeSignal;
    prMetadataSignal: PRMetadataSignal;
  }): Record<IntentCategory, number> {
    const scores: Record<IntentCategory, number> = {} as Record<IntentCategory, number>;
    const categories: IntentCategory[] = [
      'feature_addition', 'bug_fix', 'refactoring', 'performance_optimization',
      'security_fix', 'dependency_update', 'documentation', 'testing',
      'configuration', 'cleanup', 'styling', 'migration', 'infrastructure', 'unknown',
    ];

    for (const category of categories) {
      scores[category] = 0;
    }

    // Weight: Branch name (25%)
    if (signals.branchNameSignal.suggestedCategory) {
      scores[signals.branchNameSignal.suggestedCategory] += 25;
    }

    // Weight: Commit messages (30%)
    if (signals.commitMessageSignal.suggestedCategory) {
      scores[signals.commitMessageSignal.suggestedCategory] += 30;
    }

    // Weight: Code changes (25%)
    if (signals.codeChangeSignal.suggestedCategory) {
      scores[signals.codeChangeSignal.suggestedCategory] += 25;
    }

    // Weight: PR metadata (20%)
    if (signals.prMetadataSignal.suggestedCategory) {
      scores[signals.prMetadataSignal.suggestedCategory] += 20;
    }

    // Bonus points for keyword matches
    const allKeywords = [
      ...signals.branchNameSignal.keywords,
      ...signals.commitMessageSignal.keywords,
      ...signals.prMetadataSignal.titleKeywords,
      ...signals.prMetadataSignal.bodyKeywords,
    ];

    for (const keyword of allKeywords) {
      for (const [category, categoryKeywords] of Object.entries(DEFAULT_INTENT_KEYWORDS)) {
        if (categoryKeywords.includes(keyword)) {
          scores[category as IntentCategory] += 5;
        }
      }
    }

    // Cap at 100
    for (const category of categories) {
      scores[category] = Math.min(100, scores[category]);
    }

    return scores;
  }

  private scoreToConfidence(score: number): { level: IntentConfidence; score: number } {
    let level: IntentConfidence;
    if (score >= 90) level = 'very_high';
    else if (score >= 70) level = 'high';
    else if (score >= 50) level = 'medium';
    else if (score >= 30) level = 'low';
    else level = 'very_low';

    return { level, score };
  }

  private getIntentReason(
    category: IntentCategory,
    signals: {
      branchNameSignal: BranchNameSignal;
      commitMessageSignal: CommitMessageSignal;
      codeChangeSignal: CodeChangeSignal;
      prMetadataSignal: PRMetadataSignal;
    }
  ): string {
    const reasons: string[] = [];

    if (signals.branchNameSignal.suggestedCategory === category) {
      reasons.push(`branch name pattern "${signals.branchNameSignal.pattern || signals.branchNameSignal.raw}"`);
    }
    if (signals.commitMessageSignal.suggestedCategory === category) {
      reasons.push('commit message conventions');
    }
    if (signals.codeChangeSignal.suggestedCategory === category) {
      reasons.push('code change patterns');
    }
    if (signals.prMetadataSignal.suggestedCategory === category) {
      reasons.push('PR labels/metadata');
    }

    return reasons.length > 0
      ? `Detected from ${reasons.join(', ')}`
      : 'Inferred from overall context';
  }

  private async generateIntentSummary(
    prData: NonNullable<IntentAgentInput['prData']>,
    primaryIntent: IntentCategory,
    confidenceScore: number
  ): Promise<IntentSummary> {
    try {
      const systemPrompt = buildSystemPrompt(AGENT_TYPE, `
PR Title: ${prData.title}
PR Description: ${prData.body || 'No description'}
Files changed: ${prData.files.length}
Detected intent: ${primaryIntent} (${confidenceScore}% confidence)
`);

      const userPrompt = `Based on this PR, generate a JSON response with:
{
  "oneLiner": "One sentence describing what this PR does",
  "detailedExplanation": "2-3 sentences explaining the PR's purpose",
  "keyChanges": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
  "suggestedFocusAreas": ["What reviewers should focus on"],
  "potentialRisks": ["Potential risks to watch for"]
}

PR Title: ${prData.title}
Files: ${prData.files.map(f => f.filename).slice(0, 20).join(', ')}
Detected Intent: ${primaryIntent}`;

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 800 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{')
        ? content
        : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;

      return JSON.parse(jsonStr);
    } catch (error) {
      logger.warn({ error }, 'Failed to generate intent summary via LLM, using fallback');
      return this.getDefaultSummary(prData, primaryIntent);
    }
  }

  private getDefaultSummary(
    prData: NonNullable<IntentAgentInput['prData']>,
    primaryIntent: IntentCategory
  ): IntentSummary {
    const intentDescriptions: Record<IntentCategory, string> = {
      feature_addition: 'adds new functionality',
      bug_fix: 'fixes a bug',
      refactoring: 'refactors existing code',
      performance_optimization: 'improves performance',
      security_fix: 'addresses security concerns',
      dependency_update: 'updates dependencies',
      documentation: 'updates documentation',
      testing: 'adds or modifies tests',
      configuration: 'changes configuration',
      cleanup: 'cleans up code',
      styling: 'updates code style',
      migration: 'migrates code or data',
      infrastructure: 'updates CI/CD or infrastructure',
      unknown: 'makes various changes',
    };

    return {
      oneLiner: `This PR ${intentDescriptions[primaryIntent]}: ${prData.title}`,
      detailedExplanation: `Based on the changes and context, this appears to be a ${primaryIntent.replace(/_/g, ' ')} PR that modifies ${prData.files.length} file(s).`,
      keyChanges: prData.files.slice(0, 5).map(f => `Modified ${f.filename}`),
      suggestedFocusAreas: ['Review the main changes', 'Verify test coverage', 'Check for edge cases'],
      potentialRisks: ['Ensure backward compatibility', 'Verify no regressions'],
    };
  }

  private generateReviewStrategy(
    intent: IntentCategory,
    _prData: NonNullable<IntentAgentInput['prData']>
  ): IntentBasedReviewStrategy {
    const strategies: Record<IntentCategory, Partial<IntentBasedReviewStrategy>> = {
      feature_addition: {
        reviewDepth: 'thorough',
        focusAreas: [
          { area: 'New functionality', importance: 'critical', reason: 'Core of the PR' },
          { area: 'Test coverage', importance: 'high', reason: 'New code needs tests' },
          { area: 'API design', importance: 'high', reason: 'New features shape the API' },
        ],
        reviewQuestions: [
          'Does this feature meet the requirements?',
          'Is the implementation approach sound?',
          'Are there edge cases not handled?',
        ],
        suggestedExpertise: ['domain expert', 'tech lead'],
        testingExpectations: {
          required: true,
          types: ['unit', 'integration'],
          minimumCoverage: 80,
          specificTests: [],
        },
        documentationExpectations: {
          required: true,
          types: ['code_comments', 'api_docs'],
          specificRequirements: [],
        },
      },
      bug_fix: {
        reviewDepth: 'thorough',
        focusAreas: [
          { area: 'Root cause', importance: 'critical', reason: 'Verify the fix addresses the root cause' },
          { area: 'Regression risk', importance: 'high', reason: 'Ensure no new bugs introduced' },
          { area: 'Test for the bug', importance: 'high', reason: 'Prevent future regressions' },
        ],
        reviewQuestions: [
          'Does this fix the root cause or just symptoms?',
          'Could this break other functionality?',
          'Is there a test that would have caught this bug?',
        ],
        suggestedExpertise: ['qa engineer', 'domain expert'],
        testingExpectations: {
          required: true,
          types: ['unit'],
          minimumCoverage: null,
          specificTests: ['Test case that reproduces the bug'],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
      refactoring: {
        reviewDepth: 'thorough',
        focusAreas: [
          { area: 'Behavior preservation', importance: 'critical', reason: 'Refactoring should not change behavior' },
          { area: 'Code quality improvement', importance: 'high', reason: 'Verify the refactor achieves its goals' },
          { area: 'Test coverage', importance: 'high', reason: 'Tests validate behavior preservation' },
        ],
        reviewQuestions: [
          'Is the behavior identical before and after?',
          'Does this improve readability/maintainability?',
          'Are existing tests still passing?',
        ],
        suggestedExpertise: ['senior architect'],
        testingExpectations: {
          required: true,
          types: ['unit', 'integration'],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
      security_fix: {
        reviewDepth: 'deep_dive',
        focusAreas: [
          { area: 'Vulnerability mitigation', importance: 'critical', reason: 'Security is paramount' },
          { area: 'No new vulnerabilities', importance: 'critical', reason: 'Fix should not introduce new issues' },
          { area: 'Security best practices', importance: 'high', reason: 'Follow security guidelines' },
        ],
        reviewQuestions: [
          'Does this fully mitigate the vulnerability?',
          'Could this be bypassed?',
          'Are there similar patterns elsewhere that need fixing?',
        ],
        suggestedExpertise: ['security engineer'],
        testingExpectations: {
          required: true,
          types: ['unit', 'security'],
          minimumCoverage: null,
          specificTests: ['Test that verifies the vulnerability is fixed'],
        },
        documentationExpectations: {
          required: true,
          types: ['changelog'],
          specificRequirements: ['Security advisory if applicable'],
        },
      },
      dependency_update: {
        reviewDepth: 'standard',
        focusAreas: [
          { area: 'Breaking changes', importance: 'high', reason: 'Dependencies may have breaking changes' },
          { area: 'Security advisories', importance: 'high', reason: 'Check for known vulnerabilities' },
        ],
        reviewQuestions: [
          'Are there breaking changes in the updated dependencies?',
          'Have you reviewed the changelog?',
          'Do all tests pass with the new versions?',
        ],
        suggestedExpertise: ['devops engineer'],
        testingExpectations: {
          required: false,
          types: [],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
      documentation: {
        reviewDepth: 'quick_scan',
        focusAreas: [
          { area: 'Accuracy', importance: 'high', reason: 'Documentation must be correct' },
          { area: 'Clarity', importance: 'medium', reason: 'Should be easy to understand' },
        ],
        reviewQuestions: [
          'Is the documentation accurate?',
          'Is it clear and well-organized?',
          'Are code examples correct?',
        ],
        suggestedExpertise: ['domain expert'],
        testingExpectations: {
          required: false,
          types: [],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: true,
          types: ['readme'],
          specificRequirements: [],
        },
      },
      testing: {
        reviewDepth: 'standard',
        focusAreas: [
          { area: 'Test quality', importance: 'high', reason: 'Tests should be meaningful' },
          { area: 'Coverage', importance: 'medium', reason: 'Tests should cover important paths' },
        ],
        reviewQuestions: [
          'Do the tests test the right things?',
          'Are edge cases covered?',
          'Are the tests maintainable?',
        ],
        suggestedExpertise: ['qa engineer'],
        testingExpectations: {
          required: true,
          types: ['unit'],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
      configuration: {
        reviewDepth: 'standard',
        focusAreas: [
          { area: 'Security', importance: 'high', reason: 'Config can expose secrets' },
          { area: 'Correctness', importance: 'high', reason: 'Wrong config can break systems' },
        ],
        reviewQuestions: [
          'Are there any security implications?',
          'Is this config backwards compatible?',
          'Are environment-specific values handled correctly?',
        ],
        suggestedExpertise: ['devops engineer'],
        testingExpectations: {
          required: false,
          types: [],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: true,
          types: ['code_comments'],
          specificRequirements: [],
        },
      },
      cleanup: {
        reviewDepth: 'quick_scan',
        focusAreas: [
          { area: 'No accidental deletions', importance: 'medium', reason: 'Ensure only dead code removed' },
        ],
        reviewQuestions: [
          'Is the removed code truly unused?',
          'Could this break anything?',
        ],
        suggestedExpertise: [],
        testingExpectations: {
          required: false,
          types: [],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
      styling: {
        reviewDepth: 'quick_scan',
        focusAreas: [
          { area: 'Consistency', importance: 'low', reason: 'Style should be consistent' },
        ],
        reviewQuestions: [
          'Does this follow our style guide?',
        ],
        suggestedExpertise: [],
        testingExpectations: {
          required: false,
          types: [],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
      migration: {
        reviewDepth: 'deep_dive',
        focusAreas: [
          { area: 'Data integrity', importance: 'critical', reason: 'Migrations must preserve data' },
          { area: 'Rollback plan', importance: 'high', reason: 'Must be able to rollback' },
        ],
        reviewQuestions: [
          'Is the migration reversible?',
          'Has this been tested with production-like data?',
          'What is the rollback plan?',
        ],
        suggestedExpertise: ['database expert', 'senior architect'],
        testingExpectations: {
          required: true,
          types: ['integration'],
          minimumCoverage: null,
          specificTests: ['Migration test with sample data'],
        },
        documentationExpectations: {
          required: true,
          types: ['migration_guide'],
          specificRequirements: ['Rollback instructions'],
        },
      },
      infrastructure: {
        reviewDepth: 'standard',
        focusAreas: [
          { area: 'Security', importance: 'high', reason: 'CI/CD can expose secrets' },
          { area: 'Reliability', importance: 'high', reason: 'Infrastructure must be stable' },
        ],
        reviewQuestions: [
          'Are there any security implications?',
          'Has this been tested in a staging environment?',
        ],
        suggestedExpertise: ['devops engineer'],
        testingExpectations: {
          required: false,
          types: [],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
      performance_optimization: {
        reviewDepth: 'thorough',
        focusAreas: [
          { area: 'Benchmarks', importance: 'high', reason: 'Performance claims need proof' },
          { area: 'No regressions', importance: 'high', reason: 'Optimization should not break things' },
        ],
        reviewQuestions: [
          'Are there benchmarks showing improvement?',
          'Could this negatively impact other areas?',
        ],
        suggestedExpertise: ['performance engineer'],
        testingExpectations: {
          required: true,
          types: ['performance'],
          minimumCoverage: null,
          specificTests: ['Performance benchmark'],
        },
        documentationExpectations: {
          required: true,
          types: ['code_comments'],
          specificRequirements: ['Performance improvement metrics'],
        },
      },
      unknown: {
        reviewDepth: 'standard',
        focusAreas: [
          { area: 'Overall quality', importance: 'medium', reason: 'General review' },
        ],
        reviewQuestions: [
          'What is the purpose of this change?',
          'Are there tests?',
        ],
        suggestedExpertise: [],
        testingExpectations: {
          required: false,
          types: [],
          minimumCoverage: null,
          specificTests: [],
        },
        documentationExpectations: {
          required: false,
          types: [],
          specificRequirements: [],
        },
      },
    };

    const base = strategies[intent] || strategies.unknown;

    return {
      reviewDepth: base.reviewDepth || 'standard',
      focusAreas: base.focusAreas || [],
      reviewQuestions: base.reviewQuestions || [],
      suggestedExpertise: base.suggestedExpertise || [],
      testingExpectations: base.testingExpectations || {
        required: false,
        types: [],
        minimumCoverage: null,
        specificTests: [],
      },
      documentationExpectations: base.documentationExpectations || {
        required: false,
        types: [],
        specificRequirements: [],
      },
    };
  }

  private async recordFeedback(input: IntentAgentInput): Promise<IntentAgentResult> {
    if (!input.feedback) {
      return {
        operation: 'feedback',
        success: false,
        error: 'Feedback data required',
      };
    }

    logger.info({ feedback: input.feedback }, 'Recording intent feedback');

    // In production, this would store feedback in the database
    // for improving the intent detection model

    return {
      operation: 'feedback',
      success: true,
    };
  }

  private async updateConfiguration(input: IntentAgentInput): Promise<IntentAgentResult> {
    if (!input.configuration) {
      return {
        operation: 'configure',
        success: false,
        error: 'Configuration data required',
      };
    }

    logger.info({ configuration: input.configuration }, 'Updating intent configuration');

    // In production, this would persist the configuration
    
    return {
      operation: 'configure',
      success: true,
      data: {
        configuration: {
          repositoryId: input.configuration.repositoryId || '',
          branchPatterns: input.configuration.branchPatterns || DEFAULT_BRANCH_PATTERNS,
          commitConventions: input.configuration.commitConventions || DEFAULT_COMMIT_CONVENTIONS,
          intentKeywords: input.configuration.intentKeywords || DEFAULT_INTENT_KEYWORDS,
          signalWeights: input.configuration.signalWeights || {
            branchName: 0.25,
            commitMessages: 0.30,
            codeChanges: 0.25,
            prMetadata: 0.20,
          },
          minimumConfidence: input.configuration.minimumConfidence || 'medium',
        },
      },
    };
  }

  private async getStats(
    input: IntentAgentInput,
    repositoryId: string
  ): Promise<IntentAgentResult> {
    // In production, this would retrieve stats from the database
    
    return {
      operation: 'get_stats',
      success: true,
      data: {
        stats: {
          repositoryId,
          totalAnalyses: 0,
          feedbackCount: 0,
          accuracyRate: 0,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- categoryAccuracy populated dynamically
          categoryAccuracy: {} as any,
          signalEffectiveness: {
            branchName: 0.25,
            commitMessages: 0.30,
            codeChanges: 0.25,
            prMetadata: 0.20,
          },
          lastUpdated: new Date(),
        },
      },
    };
  }
}

export const intentAgent = new IntentAgent();
