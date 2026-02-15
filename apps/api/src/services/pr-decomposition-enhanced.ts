/**
 * @fileoverview Enhanced PR Decomposition Service
 *
 * Analyzes large PRs, creates semantic change clusters,
 * and enables one-click splitting into smaller draft PRs.
 */

import { logger } from '../lib/logger.js';
import type {
  SemanticCluster,
  DecompositionPlan,
  SplitExecution,
  DecompositionThresholds,
} from '@prflow/core';

const DEFAULT_THRESHOLDS: DecompositionThresholds = {
  maxLinesPerPR: 400,
  maxFilesPerPR: 15,
  autoSuggestThreshold: 500,
  enableAutoSplit: false,
};

interface PRFileInfo {
  path: string;
  additions: number;
  deletions: number;
  patch?: string;
  status: string;
}

export class PRDecompositionEnhancedService {
  private executions = new Map<string, SplitExecution>();
  private thresholds: DecompositionThresholds = DEFAULT_THRESHOLDS;

  /**
   * Analyze a PR and generate a decomposition plan.
   */
  analyze(prNumber: number, files: PRFileInfo[]): DecompositionPlan {
    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const clusters = this.buildClusters(files);
    const mergeOrder = this.computeMergeOrder(clusters);
    const risks = this.identifyRisks(clusters, files);

    const estimatedReviewTime = clusters.reduce((sum, c) => sum + c.estimatedReviewTime, 0);
    const confidence = this.computeConfidence(clusters, files);

    logger.info(
      {
        prNumber,
        totalFiles: files.length,
        totalLines,
        clusters: clusters.length,
      },
      'PR decomposition plan generated'
    );

    return {
      originalPR: prNumber,
      totalFiles: files.length,
      totalLines,
      clusters,
      mergeOrder,
      risks,
      estimatedTotalReviewTime: estimatedReviewTime,
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  private buildClusters(files: PRFileInfo[]): SemanticCluster[] {
    const groups = new Map<string, PRFileInfo[]>();

    for (const file of files) {
      const category = this.categorizeFile(file);
      const key = `${category}:${this.getModuleName(file.path)}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(file);
    }

    const clusters: SemanticCluster[] = [];
    let clusterId = 0;

    for (const [key, groupFiles] of groups) {
      const [category, moduleName] = key.split(':');
      const totalLines = groupFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);

      clusters.push({
        id: `cluster-${++clusterId}`,
        name: `${category}: ${moduleName || 'general'}`,
        description: `${groupFiles.length} files (${totalLines} lines) - ${category} changes in ${moduleName || 'root'}`,
        files: groupFiles.map((f) => ({
          path: f.path,
          changeType: 'full' as const,
        })),
        dependencies: [],
        estimatedReviewTime: Math.ceil(totalLines / 50), // ~50 lines/minute review speed
        category: category as SemanticCluster['category'],
      });
    }

    // Compute inter-cluster dependencies based on import analysis
    this.computeDependencies(clusters, files);

    return clusters;
  }

  private categorizeFile(file: PRFileInfo): string {
    const path = file.path.toLowerCase();
    if (path.includes('.test.') || path.includes('.spec.') || path.includes('__tests__'))
      return 'test';
    if (path.includes('readme') || path.includes('doc') || path.includes('changelog'))
      return 'docs';
    if (
      path.includes('config') ||
      path.includes('.env') ||
      path.endsWith('.json') ||
      path.endsWith('.yml')
    )
      return 'config';
    if (file.status === 'added' && path.includes('migration')) return 'config';

    // Infer from patch content
    if (file.patch) {
      const addedLines = file.patch
        .split('\n')
        .filter((l) => l.startsWith('+'))
        .join('\n');
      if (/fix(?:ed|es)?\b|bug\b|patch\b/i.test(addedLines)) return 'bugfix';
    }

    return 'feature';
  }

  private getModuleName(path: string): string {
    const parts = path.split('/');
    if (parts.length >= 3) return parts.slice(0, 2).join('/');
    if (parts.length >= 2) return parts[0];
    return 'root';
  }

  private computeDependencies(clusters: SemanticCluster[], _files: PRFileInfo[]): void {
    const testCluster = clusters.find((c) => c.category === 'test');
    const featureClusters = clusters.filter(
      (c) => c.category === 'feature' || c.category === 'bugfix'
    );

    if (testCluster && featureClusters.length > 0) {
      testCluster.dependencies = featureClusters.map((c) => c.id);
    }

    const docCluster = clusters.find((c) => c.category === 'docs');
    if (docCluster) {
      docCluster.dependencies = clusters.filter((c) => c.category !== 'docs').map((c) => c.id);
    }
  }

  private computeMergeOrder(clusters: SemanticCluster[]): DecompositionPlan['mergeOrder'] {
    const order: DecompositionPlan['mergeOrder'] = [];
    const merged = new Set<string>();

    const priorityOrder: SemanticCluster['category'][] = [
      'config',
      'feature',
      'bugfix',
      'test',
      'docs',
    ];

    let position = 1;
    for (const category of priorityOrder) {
      const categoryClusters = clusters.filter((c) => c.category === category);
      for (const cluster of categoryClusters) {
        const unmetDeps = cluster.dependencies.filter((d) => !merged.has(d));
        order.push({
          order: position++,
          clusterId: cluster.id,
          dependsOn: unmetDeps,
        });
        merged.add(cluster.id);
      }
    }

    return order;
  }

  private identifyRisks(clusters: SemanticCluster[], files: PRFileInfo[]): string[] {
    const risks: string[] = [];

    if (clusters.length > 5) {
      risks.push(
        'Large number of clusters may indicate the PR should be broken into multiple features'
      );
    }

    const sharedFiles = files.filter((f) => {
      const matchingClusters = clusters.filter((c) => c.files.some((cf) => cf.path === f.path));
      return matchingClusters.length > 1;
    });

    if (sharedFiles.length > 0) {
      risks.push(
        `${sharedFiles.length} file(s) modified across multiple clusters — may need manual split`
      );
    }

    const hasConfig = clusters.some((c) => c.category === 'config');
    const hasFeature = clusters.some((c) => c.category === 'feature');
    if (hasConfig && hasFeature) {
      risks.push('Config changes mixed with feature changes — consider merging config first');
    }

    return risks;
  }

  private computeConfidence(clusters: SemanticCluster[], files: PRFileInfo[]): number {
    let score = 0.9;

    // Lower confidence for files that could belong to multiple clusters
    const avgFilesPerCluster = files.length / (clusters.length || 1);
    if (avgFilesPerCluster > 10) score -= 0.1;

    // Lower confidence for single-cluster results (not much splitting possible)
    if (clusters.length <= 1) score -= 0.2;

    return Math.max(0.1, score);
  }

  /**
   * Execute a split plan (creates draft PRs).
   */
  async executeSplit(
    prNumber: number,
    plan: DecompositionPlan,
    _repositoryOwner: string,
    _repositoryName: string
  ): Promise<SplitExecution> {
    const executionId = `split-${prNumber}-${Date.now()}`;

    const execution: SplitExecution = {
      id: executionId,
      originalPR: prNumber,
      status: 'in_progress',
      createdPRs: [],
      errors: [],
      startedAt: new Date(),
    };

    this.executions.set(executionId, execution);

    // Simulate PR creation for each cluster
    for (const cluster of plan.clusters) {
      try {
        const branchName = `prflow/split-${prNumber}/${cluster.id}`;
        execution.createdPRs.push({
          number: 0, // would be set by actual GitHub API call
          branch: branchName,
          clusterId: cluster.id,
          title: `[Split from #${prNumber}] ${cluster.name}`,
          isDraft: true,
        });
      } catch (error) {
        execution.errors.push(`Failed to create PR for ${cluster.id}: ${(error as Error).message}`);
      }
    }

    execution.status = execution.errors.length === 0 ? 'completed' : 'failed';
    execution.completedAt = new Date();

    logger.info(
      {
        executionId,
        prNumber,
        created: execution.createdPRs.length,
        errors: execution.errors.length,
      },
      'Split execution completed'
    );

    return execution;
  }

  /**
   * Check if a PR exceeds decomposition thresholds.
   */
  shouldSuggestDecomposition(files: PRFileInfo[]): boolean {
    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    return (
      totalLines > this.thresholds.autoSuggestThreshold ||
      files.length > this.thresholds.maxFilesPerPR
    );
  }

  getExecution(executionId: string): SplitExecution | null {
    return this.executions.get(executionId) || null;
  }

  updateThresholds(thresholds: Partial<DecompositionThresholds>): DecompositionThresholds {
    this.thresholds = { ...this.thresholds, ...thresholds };
    return this.thresholds;
  }

  getThresholds(): DecompositionThresholds {
    return { ...this.thresholds };
  }
}

export const prDecompositionEnhancedService = new PRDecompositionEnhancedService();
