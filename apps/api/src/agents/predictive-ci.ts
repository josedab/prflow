import type {
  PredictiveCIInput,
  PredictiveCIResult,
  TestPrediction,
  TestSelection,
  SelectedTest,
  SkippedTest,
  TestStatistics,
  FlakyTestAnalysis,
  TestPriority,
  PredictionConfidence,
  SelectionStrategy,
  FileTestMapping,
  TestResult,
} from '@prflow/core';
import { BaseAgent } from './base.js';
import { logger } from '../lib/logger.js';

interface TestHistoryData {
  testId: string;
  runs: Array<{
    result: 'passed' | 'failed' | 'skipped' | 'error';
    duration: number;
    changedFiles: string[];
    timestamp: Date;
  }>;
}

export class PredictiveCIAgent extends BaseAgent<PredictiveCIInput, PredictiveCIResult> {
  readonly name = 'predictive-ci';
  readonly description = 'Predicts test failures and optimizes CI test selection';

  // In-memory storage (would be database in production)
  private testHistory: Map<string, TestHistoryData[]> = new Map();
  private testStatistics: Map<string, Map<string, TestStatistics>> = new Map();
  private fileTestMappings: Map<string, FileTestMapping[]> = new Map();

  async execute(input: PredictiveCIInput, _context: unknown): Promise<{
    success: boolean;
    data?: PredictiveCIResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result) {
      return this.createErrorResult('Predictive CI operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(input: PredictiveCIInput): Promise<PredictiveCIResult> {
    const { operation, repositoryId, prNumber, changedFiles, strategy, testResults, commit } = input;

    switch (operation) {
      case 'predict':
        if (!changedFiles) {
          return { operation, success: false, error: 'changedFiles is required' };
        }
        return this.predictTestFailures(repositoryId, changedFiles, prNumber);
      
      case 'select':
        if (!changedFiles) {
          return { operation, success: false, error: 'changedFiles is required' };
        }
        return this.selectTests(repositoryId, changedFiles, prNumber, strategy);
      
      case 'analyze':
        return this.analyzeRunResults(repositoryId, prNumber);
      
      case 'record':
        if (!testResults || !commit) {
          return { operation, success: false, error: 'testResults and commit are required' };
        }
        return this.recordResults(repositoryId, prNumber, commit, testResults);
      
      case 'flaky_detection':
        return this.detectFlakyTests(repositoryId);
      
      default:
        return { operation, success: false, error: `Unknown operation: ${operation}` };
    }
  }

  private async predictTestFailures(
    repositoryId: string,
    changedFiles: string[],
    prNumber?: number
  ): Promise<PredictiveCIResult> {
    logger.info({ repositoryId, fileCount: changedFiles.length, prNumber }, 'Predicting test failures');

    const predictions: TestPrediction[] = [];
    const statistics = this.testStatistics.get(repositoryId) || new Map();
    const mappings = this.fileTestMappings.get(repositoryId) || [];

    // Find affected tests based on file changes
    const affectedTestIds = new Set<string>();
    for (const file of changedFiles) {
      const mapping = mappings.find(m => m.file === file);
      if (mapping) {
        mapping.directTests.forEach(t => affectedTestIds.add(t));
        mapping.indirectTests.forEach(t => affectedTestIds.add(t));
      }
    }

    // If no mappings exist, generate predictions based on file patterns
    if (affectedTestIds.size === 0) {
      const generatedPredictions = this.generatePredictionsFromPatterns(changedFiles, repositoryId);
      predictions.push(...generatedPredictions);
    } else {
      // Generate predictions for affected tests
      for (const testId of affectedTestIds) {
        const stats = statistics.get(testId);
        const prediction = this.generatePrediction(testId, stats, changedFiles);
        predictions.push(prediction);
      }
    }

    // Sort by failure probability (highest first)
    predictions.sort((a, b) => b.failureProbability - a.failureProbability);

    return {
      operation: 'predict',
      success: true,
      data: { predictions },
    };
  }

  private generatePredictionsFromPatterns(
    changedFiles: string[],
    _repositoryId: string
  ): TestPrediction[] {
    const predictions: TestPrediction[] = [];

    for (const file of changedFiles) {
      // Infer test file from source file
      const testFile = this.inferTestFile(file);
      if (!testFile) continue;

      const testId = `test:${testFile}`;
      const isSourceChange = this.isSourceFile(file);
      const isTestChange = this.isTestFile(file);
      const isConfigChange = this.isConfigFile(file);

      let failureProbability = 0.1;  // Base probability
      let priority: TestPriority = 'medium';
      const reasons: Array<{ type: string; description: string; weight: number }> = [];

      if (isSourceChange) {
        failureProbability += 0.3;
        reasons.push({
          type: 'file_change',
          description: `Source file ${file} was modified`,
          weight: 0.3,
        });
      }

      if (isTestChange) {
        failureProbability += 0.2;
        reasons.push({
          type: 'file_change',
          description: 'Test file was modified',
          weight: 0.2,
        });
      }

      if (isConfigChange) {
        failureProbability += 0.15;
        reasons.push({
          type: 'dependency_change',
          description: 'Configuration file changed',
          weight: 0.15,
        });
      }

      // Set priority based on probability
      if (failureProbability >= 0.5) priority = 'critical';
      else if (failureProbability >= 0.3) priority = 'high';
      else if (failureProbability >= 0.15) priority = 'medium';
      else priority = 'low';

      predictions.push({
        testId,
        testName: testFile.split('/').pop()?.replace(/\.(test|spec)\.[jt]sx?$/, '') || testFile,
        testFile,
        priority,
        failureProbability: Math.min(failureProbability, 0.95),
        confidence: 'medium',
        reasons: reasons as TestPrediction['reasons'],
        estimatedDuration: 5000,  // Default 5s
        failureRate: 0.1,
        affectedBy: [file],
      });
    }

    return predictions;
  }

  private generatePrediction(
    testId: string,
    stats: TestStatistics | undefined,
    changedFiles: string[]
  ): TestPrediction {
    let failureProbability = 0.1;
    let priority: TestPriority = 'medium';
    const reasons: TestPrediction['reasons'] = [];

    if (stats) {
      // Use historical failure rate
      const baseFailureRate = 1 - stats.passRate;
      failureProbability = baseFailureRate;

      if (baseFailureRate > 0.2) {
        reasons.push({
          type: 'historical_failure',
          description: `Test has ${Math.round(baseFailureRate * 100)}% historical failure rate`,
          weight: baseFailureRate * 0.5,
        });
      }

      // Check if flaky
      if (stats.flakyScore > 0.3) {
        failureProbability += stats.flakyScore * 0.2;
        reasons.push({
          type: 'flaky_test',
          description: `Test has ${Math.round(stats.flakyScore * 100)}% flakiness score`,
          weight: stats.flakyScore * 0.2,
        });
      }

      // Recent trend
      if (stats.recentTrend === 'degrading') {
        failureProbability += 0.15;
        reasons.push({
          type: 'historical_failure',
          description: 'Test reliability has been degrading recently',
          weight: 0.15,
        });
      }
    }

    // File change impact
    reasons.push({
      type: 'file_change',
      description: `${changedFiles.length} related files were modified`,
      weight: Math.min(changedFiles.length * 0.05, 0.3),
    });
    failureProbability += Math.min(changedFiles.length * 0.05, 0.3);

    // Determine priority
    if (failureProbability >= 0.5) priority = 'critical';
    else if (failureProbability >= 0.3) priority = 'high';
    else if (failureProbability >= 0.15) priority = 'medium';
    else if (failureProbability >= 0.05) priority = 'low';
    else priority = 'skip';

    // Determine confidence
    let confidence: PredictionConfidence = 'medium';
    if (stats && stats.totalRuns >= 100) confidence = 'very_high';
    else if (stats && stats.totalRuns >= 50) confidence = 'high';
    else if (stats && stats.totalRuns >= 10) confidence = 'medium';
    else confidence = 'low';

    return {
      testId,
      testName: stats?.testName || testId,
      testFile: stats?.testFile || testId,
      priority,
      failureProbability: Math.min(failureProbability, 0.95),
      confidence,
      reasons,
      estimatedDuration: stats?.avgDuration || 5000,
      lastFailedAt: stats?.lastFailed,
      failureRate: stats ? 1 - stats.passRate : 0.1,
      affectedBy: changedFiles,
    };
  }

  private async selectTests(
    repositoryId: string,
    changedFiles: string[],
    prNumber?: number,
    strategy?: SelectionStrategy
  ): Promise<PredictiveCIResult> {
    logger.info({ repositoryId, fileCount: changedFiles.length, strategy: strategy?.type }, 'Selecting tests');

    const selectionStrategy = strategy || { type: 'optimized' as const };

    // Get predictions first
    const predictResult = await this.predictTestFailures(repositoryId, changedFiles, prNumber);
    const predictions = predictResult.data?.predictions || [];

    const selectedTests: SelectedTest[] = [];
    const skippedTests: SkippedTest[] = [];
    let totalDuration = 0;
    const fullSuiteTime = predictions.reduce((sum, p) => sum + p.estimatedDuration, 0);

    // Selection logic based on strategy
    for (const prediction of predictions) {
      let shouldInclude = true;
      let skipReason: SkippedTest['reason'] | null = null;

      switch (selectionStrategy.type) {
        case 'all':
          shouldInclude = true;
          break;
        
        case 'critical_only':
          shouldInclude = prediction.priority === 'critical';
          if (!shouldInclude) skipReason = 'low_impact';
          break;
        
        case 'optimized':
          if (prediction.priority === 'skip') {
            shouldInclude = false;
            skipReason = 'low_impact';
          }
          if (selectionStrategy.maxDuration && totalDuration + prediction.estimatedDuration > selectionStrategy.maxDuration) {
            shouldInclude = prediction.priority === 'critical';
            if (!shouldInclude) skipReason = 'time_constraint';
          }
          break;
        
        case 'affected':
          shouldInclude = prediction.affectedBy.length > 0;
          if (!shouldInclude) skipReason = 'no_file_change';
          break;
      }

      // Check failure threshold
      if (selectionStrategy.failureThreshold && prediction.failureProbability < selectionStrategy.failureThreshold) {
        shouldInclude = prediction.priority === 'critical';
        if (!shouldInclude) skipReason = 'low_impact';
      }

      // Handle flaky tests
      if (prediction.reasons.some(r => r.type === 'flaky_test')) {
        if (!selectionStrategy.includeFlaky && prediction.priority !== 'critical') {
          shouldInclude = false;
          skipReason = 'flaky';
        }
      }

      if (shouldInclude) {
        selectedTests.push({
          testId: prediction.testId,
          testName: prediction.testName,
          testFile: prediction.testFile,
          priority: prediction.priority,
          failureProbability: prediction.failureProbability,
          estimatedDuration: prediction.estimatedDuration,
          order: selectedTests.length + 1,
        });
        totalDuration += prediction.estimatedDuration;
      } else if (skipReason) {
        skippedTests.push({
          testId: prediction.testId,
          testName: prediction.testName,
          testFile: prediction.testFile,
          reason: skipReason,
          confidence: prediction.confidence,
        });
      }
    }

    // Sort selected tests by priority
    selectedTests.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3, skip: 4 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // Update order
    selectedTests.forEach((t, i) => t.order = i + 1);

    const optimizedTime = selectedTests.reduce((sum, t) => sum + t.estimatedDuration, 0);

    const selection: TestSelection = {
      id: `sel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      prNumber: prNumber || 0,
      repositoryId,
      changedFiles,
      selectedTests,
      skippedTests,
      estimatedTime: {
        fullSuiteTime,
        optimizedTime,
        timeSaved: fullSuiteTime - optimizedTime,
        timeSavedPercent: fullSuiteTime > 0 ? ((fullSuiteTime - optimizedTime) / fullSuiteTime) * 100 : 0,
        parallelFactor: 4,  // Assume 4 parallel workers
      },
      strategy: selectionStrategy,
      createdAt: new Date(),
    };

    return {
      operation: 'select',
      success: true,
      data: { selection },
    };
  }

  private analyzeRunResults(
    repositoryId: string,
    _prNumber?: number
  ): Promise<PredictiveCIResult> {
    const statistics = Array.from(this.testStatistics.get(repositoryId)?.values() || []);

    return Promise.resolve({
      operation: 'analyze',
      success: true,
      data: { statistics },
    });
  }

  private recordResults(
    repositoryId: string,
    prNumber: number | undefined,
    commit: string,
    testResults: TestResult[]
  ): PredictiveCIResult {
    logger.info({ repositoryId, prNumber, testCount: testResults.length }, 'Recording test results');

    // Get or create statistics map for repository
    if (!this.testStatistics.has(repositoryId)) {
      this.testStatistics.set(repositoryId, new Map());
    }
    const stats = this.testStatistics.get(repositoryId)!;

    // Update statistics for each test
    for (const result of testResults) {
      let testStats = stats.get(result.testId);

      if (!testStats) {
        testStats = {
          testId: result.testId,
          testName: result.testName,
          testFile: result.testFile,
          totalRuns: 0,
          passCount: 0,
          failCount: 0,
          skipCount: 0,
          errorCount: 0,
          passRate: 0,
          avgDuration: 0,
          p50Duration: result.duration,
          p95Duration: result.duration,
          flakyScore: 0,
          recentTrend: 'stable',
        };
      }

      testStats.totalRuns++;
      testStats.lastRun = new Date();

      switch (result.result) {
        case 'passed':
          testStats.passCount++;
          break;
        case 'failed':
          testStats.failCount++;
          testStats.lastFailed = new Date();
          break;
        case 'skipped':
          testStats.skipCount++;
          break;
        case 'error':
          testStats.errorCount++;
          testStats.lastFailed = new Date();
          break;
      }

      // Update pass rate
      const relevantRuns = testStats.totalRuns - testStats.skipCount;
      testStats.passRate = relevantRuns > 0 ? testStats.passCount / relevantRuns : 0;

      // Update average duration (simple moving average)
      testStats.avgDuration = Math.round(
        (testStats.avgDuration * (testStats.totalRuns - 1) + result.duration) / testStats.totalRuns
      );

      stats.set(result.testId, testStats);
    }

    return {
      operation: 'record',
      success: true,
      data: {
        statistics: Array.from(stats.values()),
      },
    };
  }

  private detectFlakyTests(repositoryId: string): PredictiveCIResult {
    logger.info({ repositoryId }, 'Detecting flaky tests');

    const statistics = this.testStatistics.get(repositoryId);
    if (!statistics) {
      return {
        operation: 'flaky_detection',
        success: true,
        data: { flakyAnalysis: [] },
      };
    }

    const flakyAnalysis: FlakyTestAnalysis[] = [];

    for (const stats of statistics.values()) {
      // Skip tests with too few runs
      if (stats.totalRuns < 10) continue;

      const indicators: FlakyTestAnalysis['indicators'] = [];
      let flakyScore = 0;

      // Check for inconsistent results
      const inconsistencyRate = Math.min(stats.failCount, stats.passCount) / stats.totalRuns;
      if (inconsistencyRate > 0.1) {
        flakyScore += inconsistencyRate * 0.5;
        indicators.push({
          type: 'inconsistent_results',
          description: `Test alternates between pass/fail ${Math.round(inconsistencyRate * 100)}% of the time`,
          evidence: [`Pass: ${stats.passCount}, Fail: ${stats.failCount}`],
          score: inconsistencyRate,
        });
      }

      // Check for high duration variance (timing sensitive)
      if (stats.p95Duration > stats.avgDuration * 2) {
        const varianceScore = 0.2;
        flakyScore += varianceScore;
        indicators.push({
          type: 'timing_sensitive',
          description: 'High duration variance suggests timing sensitivity',
          evidence: [`Avg: ${stats.avgDuration}ms, P95: ${stats.p95Duration}ms`],
          score: varianceScore,
        });
      }

      if (indicators.length > 0) {
        // Determine confidence
        let confidence: PredictionConfidence = 'medium';
        if (stats.totalRuns >= 100) confidence = 'very_high';
        else if (stats.totalRuns >= 50) confidence = 'high';
        else if (stats.totalRuns >= 20) confidence = 'medium';
        else confidence = 'low';

        const recommendations: string[] = [];
        if (indicators.some(i => i.type === 'inconsistent_results')) {
          recommendations.push('Add retry logic or investigate root cause of intermittent failures');
        }
        if (indicators.some(i => i.type === 'timing_sensitive')) {
          recommendations.push('Review test for race conditions or timing-dependent assertions');
        }

        flakyAnalysis.push({
          testId: stats.testId,
          testName: stats.testName,
          testFile: stats.testFile,
          flakyScore: Math.min(flakyScore, 1),
          confidence,
          indicators,
          recommendations,
          lastAnalyzedAt: new Date(),
        });
      }
    }

    // Sort by flaky score (highest first)
    flakyAnalysis.sort((a, b) => b.flakyScore - a.flakyScore);

    return {
      operation: 'flaky_detection',
      success: true,
      data: { flakyAnalysis },
    };
  }

  // Helper methods
  private inferTestFile(sourceFile: string): string | null {
    // Convert source file to test file path
    const patterns = [
      { match: /^src\/(.+)\.(ts|tsx|js|jsx)$/, replace: 'src/__tests__/$1.test.$2' },
      { match: /^src\/(.+)\.(ts|tsx|js|jsx)$/, replace: 'tests/$1.test.$2' },
      { match: /^lib\/(.+)\.(ts|tsx|js|jsx)$/, replace: 'lib/__tests__/$1.test.$2' },
    ];

    for (const pattern of patterns) {
      if (pattern.match.test(sourceFile)) {
        return sourceFile.replace(pattern.match, pattern.replace);
      }
    }

    // If already a test file, return as is
    if (this.isTestFile(sourceFile)) {
      return sourceFile;
    }

    return null;
  }

  private isSourceFile(file: string): boolean {
    return /\.(ts|tsx|js|jsx|py|go|java|rb)$/.test(file) && !this.isTestFile(file);
  }

  private isTestFile(file: string): boolean {
    return /\.(test|spec)\.[jt]sx?$/.test(file) || 
           file.includes('__tests__') ||
           file.includes('tests/');
  }

  private isConfigFile(file: string): boolean {
    return /\.(json|yaml|yml|toml|env)$/.test(file) ||
           file.includes('config') ||
           file === 'package.json' ||
           file.includes('.config.');
  }

  // Public methods for external access
  getTestStatistics(repositoryId: string): TestStatistics[] {
    return Array.from(this.testStatistics.get(repositoryId)?.values() || []);
  }

  updateFileTestMapping(repositoryId: string, mapping: FileTestMapping): void {
    if (!this.fileTestMappings.has(repositoryId)) {
      this.fileTestMappings.set(repositoryId, []);
    }
    const mappings = this.fileTestMappings.get(repositoryId)!;
    const existingIndex = mappings.findIndex(m => m.file === mapping.file);
    if (existingIndex >= 0) {
      mappings[existingIndex] = mapping;
    } else {
      mappings.push(mapping);
    }
  }
}

export const predictiveCIAgent = new PredictiveCIAgent();
