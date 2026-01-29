import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

export interface TestFile {
  path: string;
  name: string;
  type: 'unit' | 'integration' | 'e2e';
  avgDuration: number;
  lastRun?: string;
  lastStatus?: 'passed' | 'failed' | 'skipped';
  failureRate: number;
}

export interface TestPriority {
  testFile: TestFile;
  priority: number;
  reason: string;
  impactedBy: string[];
  estimatedDuration: number;
}

export interface PrioritizationResult {
  workflowId: string;
  analyzedAt: string;
  totalTests: number;
  recommendedTests: TestPriority[];
  estimatedTotalDuration: number;
  confidenceScore: number;
  savings: {
    testsSkipped: number;
    timesSaved: number;
  };
}

export interface TestImpactMap {
  [sourcePath: string]: string[]; // source file -> test files that cover it
}

export class TestPrioritizationService {
  
  /**
   * Analyze PR changes and prioritize tests
   */
  async prioritizeTests(
    workflowId: string,
    installationId: number,
    options: {
      maxTests?: number;
      maxDuration?: number; // seconds
      includeTypes?: ('unit' | 'integration' | 'e2e')[];
    } = {}
  ): Promise<PrioritizationResult> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const github = this.createGitHubClient(installationId);
    const [owner, repo] = workflow.repository.fullName.split('/');

    // Get changed files in PR
    const changedFiles = await github.getPullRequestFiles(owner, repo, workflow.prNumber);
    
    // Get all test files in repo
    const testFiles = await this.discoverTestFiles(github, owner, repo);
    
    // Build impact map
    const impactMap = await this.buildImpactMap(github, owner, repo, testFiles);
    
    // Calculate test priorities
    const priorities = this.calculatePriorities(
      changedFiles.map(f => f.path),
      testFiles,
      impactMap
    );

    // Apply filters
    let recommendedTests = priorities;
    
    if (options.includeTypes?.length) {
      recommendedTests = recommendedTests.filter(t => 
        options.includeTypes!.includes(t.testFile.type)
      );
    }
    
    if (options.maxTests) {
      recommendedTests = recommendedTests.slice(0, options.maxTests);
    }

    if (options.maxDuration) {
      let totalDuration = 0;
      recommendedTests = recommendedTests.filter(t => {
        if (totalDuration + t.estimatedDuration <= options.maxDuration!) {
          totalDuration += t.estimatedDuration;
          return true;
        }
        return false;
      });
    }

    const estimatedTotalDuration = recommendedTests.reduce(
      (sum, t) => sum + t.estimatedDuration, 0
    );
    
    const fullDuration = testFiles.reduce((sum, t) => sum + t.avgDuration, 0);
    const timeSaved = fullDuration - estimatedTotalDuration;

    return {
      workflowId,
      analyzedAt: new Date().toISOString(),
      totalTests: testFiles.length,
      recommendedTests,
      estimatedTotalDuration,
      confidenceScore: this.calculateConfidence(recommendedTests, changedFiles.length),
      savings: {
        testsSkipped: testFiles.length - recommendedTests.length,
        timesSaved: Math.max(0, timeSaved),
      },
    };
  }

  /**
   * Get predicted test failures based on historical data
   */
  async predictFailures(
    workflowId: string,
    installationId: number
  ): Promise<{
    highRisk: TestPriority[];
    mediumRisk: TestPriority[];
    lowRisk: TestPriority[];
  }> {
    const result = await this.prioritizeTests(workflowId, installationId);
    
    const highRisk = result.recommendedTests.filter(t => t.testFile.failureRate > 0.2);
    const mediumRisk = result.recommendedTests.filter(
      t => t.testFile.failureRate > 0.05 && t.testFile.failureRate <= 0.2
    );
    const lowRisk = result.recommendedTests.filter(t => t.testFile.failureRate <= 0.05);

    return { highRisk, mediumRisk, lowRisk };
  }

  /**
   * Get test file info
   */
  async getTestInfo(
    _repositoryId: string,
    _testPath: string
  ): Promise<TestFile | null> {
    // In production, would query test history from database
    return null;
  }

  /**
   * Record test run results for learning
   */
  async recordTestRun(
    repositoryId: string,
    results: Array<{
      testPath: string;
      duration: number;
      status: 'passed' | 'failed' | 'skipped';
    }>
  ): Promise<void> {
    // In production, would store in database for historical analysis
    logger.info({ repositoryId, testCount: results.length }, 'Recorded test run results');
  }

  // Private helpers

  private createGitHubClient(installationId: number): GitHubClient {
    return new GitHubClient({
      appId: process.env.GITHUB_APP_ID || '',
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
      installationId,
    });
  }

  private async discoverTestFiles(
    _github: GitHubClient,
    _owner: string,
    _repo: string
  ): Promise<TestFile[]> {
    const testFiles: TestFile[] = [];
    
    // Common test file patterns - listed for documentation purposes
    // These will be used in production when implementing tree API scanning

    try {
      // This is simplified - in production would use tree API to scan repo
      // For now, return empty - actual implementation would discover tests
      return testFiles;
    } catch (error) {
      logger.error({ error }, 'Failed to discover test files');
      return [];
    }
  }

  private async buildImpactMap(
    github: GitHubClient,
    owner: string,
    repo: string,
    testFiles: TestFile[]
  ): Promise<TestImpactMap> {
    const impactMap: TestImpactMap = {};

    // Build a mapping of source files to their tests
    // In production, this would:
    // 1. Analyze imports in test files
    // 2. Use code coverage data if available
    // 3. Use historical correlation data

    for (const testFile of testFiles) {
      // Simple heuristic: test files test files with similar names
      const baseName = testFile.path
        .replace(/\.(test|spec)\.(ts|js|tsx|jsx)$/, '')
        .replace(/__tests__\//, '');
      
      const sourceFile = `${baseName}.ts`;
      
      if (!impactMap[sourceFile]) {
        impactMap[sourceFile] = [];
      }
      impactMap[sourceFile].push(testFile.path);
    }

    return impactMap;
  }

  private calculatePriorities(
    changedFiles: string[],
    testFiles: TestFile[],
    impactMap: TestImpactMap
  ): TestPriority[] {
    const priorities: TestPriority[] = [];
    const impactedTests = new Set<string>();

    // Find tests directly impacted by changed files
    for (const changedFile of changedFiles) {
      // Check if it's a test file itself
      if (this.isTestFile(changedFile)) {
        impactedTests.add(changedFile);
      }

      // Check impact map
      const tests = impactMap[changedFile] || [];
      tests.forEach(t => impactedTests.add(t));

      // Heuristic: if source file changed, look for corresponding test
      for (const testFile of testFiles) {
        if (this.testCoversFile(testFile.path, changedFile)) {
          impactedTests.add(testFile.path);
        }
      }
    }

    // Calculate priorities for impacted tests
    for (const testPath of impactedTests) {
      const testFile = testFiles.find(t => t.path === testPath);
      if (!testFile) continue;

      const impactedBy = changedFiles.filter(f => 
        impactMap[f]?.includes(testPath) || this.testCoversFile(testPath, f)
      );

      // Priority score based on multiple factors
      let priority = 0;
      
      // Higher priority for tests that cover more changed files
      priority += impactedBy.length * 10;
      
      // Higher priority for tests with higher failure rates
      priority += testFile.failureRate * 50;
      
      // Higher priority for unit tests (faster feedback)
      if (testFile.type === 'unit') priority += 20;
      else if (testFile.type === 'integration') priority += 10;
      
      // Lower priority for slow tests
      if (testFile.avgDuration > 60) priority -= 10;

      priorities.push({
        testFile,
        priority,
        reason: this.generateReason(testFile, impactedBy),
        impactedBy,
        estimatedDuration: testFile.avgDuration,
      });
    }

    // Sort by priority (highest first)
    return priorities.sort((a, b) => b.priority - a.priority);
  }

  private isTestFile(path: string): boolean {
    return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(path) ||
           path.includes('__tests__/') ||
           path.includes('/test/') ||
           path.includes('/tests/');
  }

  private testCoversFile(testPath: string, sourcePath: string): boolean {
    // Extract base names and compare
    const testBase = testPath
      .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '')
      .replace(/.*\//, '');
    
    const sourceBase = sourcePath
      .replace(/\.(ts|tsx|js|jsx)$/, '')
      .replace(/.*\//, '');

    return testBase.toLowerCase().includes(sourceBase.toLowerCase()) ||
           sourceBase.toLowerCase().includes(testBase.toLowerCase());
  }

  private generateReason(testFile: TestFile, impactedBy: string[]): string {
    const reasons: string[] = [];

    if (impactedBy.length > 0) {
      reasons.push(`covers ${impactedBy.length} changed file(s)`);
    }

    if (testFile.failureRate > 0.1) {
      reasons.push(`${Math.round(testFile.failureRate * 100)}% historical failure rate`);
    }

    if (testFile.type === 'unit') {
      reasons.push('fast feedback (unit test)');
    }

    return reasons.length > 0 ? reasons.join('; ') : 'general coverage';
  }

  private calculateConfidence(
    priorities: TestPriority[],
    changedFileCount: number
  ): number {
    if (priorities.length === 0) return 0.5;
    
    // Higher confidence when:
    // 1. We found relevant tests for most changed files
    const coverage = priorities.reduce((sum, p) => sum + p.impactedBy.length, 0) / 
                    Math.max(1, changedFileCount);
    
    // 2. Tests have good historical data
    const hasHistory = priorities.filter(p => p.testFile.lastRun).length / priorities.length;

    return Math.min(0.95, 0.5 + (coverage * 0.3) + (hasHistory * 0.2));
  }
}

export const testPrioritizationService = new TestPrioritizationService();
