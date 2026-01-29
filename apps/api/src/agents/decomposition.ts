import type {
  DecompositionAgentInput,
  DecompositionResult,
  DecompositionAnalysis,
  ChangeCluster,
  ClusterFile,
  SplitSuggestion,
  DecompositionStrategy,
  SplitPR,
  ClusterDependencyGraph,
  DecompositionRisk,
  MergeQueueItem,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

interface LLMClusterAnalysis {
  clusters: Array<{
    name: string;
    description: string;
    type: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'config' | 'mixed';
    files: string[];
    semanticLabels: string[];
    risk: 'low' | 'medium' | 'high';
    dependencies: string[];
  }>;
  mergeOrder: string[];
  risks: string[];
  recommendations: string[];
}

export class DecompositionAgent extends BaseAgent<DecompositionAgentInput, DecompositionResult> {
  readonly name = 'decomposition';
  readonly description = 'Analyzes and splits large PRs into smaller, reviewable chunks';

  private readonly maxFilesPerCluster = 15;
  private readonly maxLinesPerCluster = 500;
  private readonly minFilesPerCluster = 2;

  async execute(input: DecompositionAgentInput, _context: unknown): Promise<{
    success: boolean;
    data?: DecompositionResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.decomposePR(input);
    });

    if (!result) {
      return this.createErrorResult('PR decomposition failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async decomposePR(input: DecompositionAgentInput): Promise<DecompositionResult> {
    const { pr, diff, strategy = 'semantic', createPRs = false } = input;
    const analysisId = `decomp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    logger.info({ prNumber: pr.number, fileCount: diff.files.length, strategy }, 'Starting PR decomposition');

    // Step 1: Analyze the PR and create clusters
    const analysis = await this.analyzePR(pr, diff, strategy);

    // Step 2: Find the best split suggestion
    const bestSplit = analysis.suggestedSplits[0];
    if (!bestSplit || bestSplit.clusters.length <= 1) {
      // PR doesn't need splitting
      return {
        analysisId,
        prNumber: pr.number,
        strategy,
        splitPRs: [],
        parentPR: {
          number: pr.number,
          status: 'open',
        },
        mergeQueue: [],
        status: 'completed',
        createdAt: new Date(),
        completedAt: new Date(),
      };
    }

    // Step 3: Create split PRs (if requested)
    const splitPRs: SplitPR[] = [];
    const mergeQueue: MergeQueueItem[] = [];

    for (let i = 0; i < bestSplit.clusters.length; i++) {
      const cluster = bestSplit.clusters[i];
      const splitPR: SplitPR = {
        id: `split-${analysisId}-${i}`,
        parentPRNumber: pr.number,
        clusterId: cluster.id,
        clusterName: cluster.name,
        branch: `${pr.head.ref}-split-${i + 1}`,
        title: this.generateSplitTitle(pr.title, cluster, i + 1, bestSplit.clusters.length),
        body: this.generateSplitBody(pr, cluster, i + 1, bestSplit.clusters.length),
        files: cluster.files,
        status: createPRs ? 'splitting' : 'ready',
        dependencies: cluster.dependencies,
      };
      splitPRs.push(splitPR);

      // Add to merge queue
      const blockedBy = cluster.dependencies.map(depId => {
        const depIndex = bestSplit.clusters.findIndex(c => c.id === depId);
        return depIndex >= 0 ? splitPRs[depIndex]?.id : null;
      }).filter((id): id is string => id !== null);

      mergeQueue.push({
        splitPRId: splitPR.id,
        order: i + 1,
        status: blockedBy.length > 0 ? 'blocked' : 'ready',
        blockedBy,
      });
    }

    return {
      analysisId,
      prNumber: pr.number,
      strategy,
      splitPRs,
      parentPR: {
        number: pr.number,
        status: 'open',
      },
      mergeQueue,
      status: createPRs ? 'splitting' : 'ready',
      createdAt: new Date(),
    };
  }

  private async analyzePR(
    pr: { number: number; title: string; body: string | null; head: { ref: string } },
    diff: { files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>; totalAdditions: number; totalDeletions: number },
    preferredStrategy: DecompositionStrategy
  ): Promise<DecompositionAnalysis> {
    const originalSize = {
      files: diff.files.length,
      additions: diff.totalAdditions,
      deletions: diff.totalDeletions,
    };

    // Generate suggestions for multiple strategies
    const suggestions: SplitSuggestion[] = [];

    // Semantic strategy (uses LLM)
    if (preferredStrategy === 'semantic' || diff.files.length > 10) {
      const semanticSuggestion = await this.analyzeSemanticClusters(pr, diff);
      suggestions.push(semanticSuggestion);
    }

    // Directory strategy
    const directorySuggestion = this.analyzeDirectoryClusters(diff);
    suggestions.push(directorySuggestion);

    // Size-based strategy
    const sizeSuggestion = this.analyzeSizeClusters(diff);
    suggestions.push(sizeSuggestion);

    // Sort by confidence
    suggestions.sort((a, b) => b.confidence - a.confidence);

    // Build dependency graph from best suggestion
    const bestClusters = suggestions[0]?.clusters || [];
    const dependencyGraph = this.buildDependencyGraph(bestClusters);

    // Calculate merge order using topological sort
    const mergeOrder = this.calculateMergeOrder(bestClusters);

    // Identify risks
    const risks = this.identifyRisks(bestClusters, dependencyGraph);

    // Generate recommendations
    const recommendations = this.generateRecommendations(pr, diff, bestClusters, risks);

    return {
      prNumber: pr.number,
      originalSize,
      suggestedSplits: suggestions,
      dependencyGraph,
      mergeOrder,
      risks,
      recommendations,
    };
  }

  private async analyzeSemanticClusters(
    pr: { title: string; body: string | null; head: { ref: string } },
    diff: { files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }> }
  ): Promise<SplitSuggestion> {
    const systemPrompt = buildSystemPrompt('PR decomposition specialist', `
PR Title: ${pr.title}
PR Description: ${pr.body || 'No description'}
Branch: ${pr.head.ref}
Files changed: ${diff.files.length}
`);

    const filesSummary = diff.files.map(f => 
      `- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`
    ).join('\n');

    const userPrompt = `Analyze this PR and suggest how to split it into logical, independently reviewable clusters.

Files changed:
${filesSummary}

Guidelines:
1. Each cluster should be a cohesive unit (related functionality)
2. Minimize dependencies between clusters
3. Keep clusters small enough for easy review (ideally <10 files, <300 lines)
4. Consider file types (tests with their code, configs together)
5. Identify any dependencies between clusters

Respond with a JSON object:
{
  "clusters": [
    {
      "name": "short cluster name",
      "description": "what this cluster does",
      "type": "feature|bugfix|refactor|docs|test|config|mixed",
      "files": ["file1.ts", "file2.ts"],
      "semanticLabels": ["authentication", "api"],
      "risk": "low|medium|high",
      "dependencies": ["other cluster names this depends on"]
    }
  ],
  "mergeOrder": ["cluster name 1", "cluster name 2"],
  "risks": ["potential risk 1", "potential risk 2"],
  "recommendations": ["recommendation 1"]
}

Respond with ONLY the JSON object.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 3000 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{') ? content :
                      content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;
      
      const llmAnalysis: LLMClusterAnalysis = JSON.parse(jsonStr);

      // Convert LLM analysis to clusters
      const clusters: ChangeCluster[] = llmAnalysis.clusters.map((c, index) => {
        const clusterFiles: ClusterFile[] = c.files.map(filename => {
          const file = diff.files.find(f => f.filename === filename);
          return {
            path: filename,
            status: (file?.status || 'modified') as 'added' | 'modified' | 'deleted' | 'renamed',
            additions: file?.additions || 0,
            deletions: file?.deletions || 0,
            hunks: [],
          };
        });

        const totalLines = clusterFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);

        return {
          id: `cluster-${index}`,
          name: c.name,
          description: c.description,
          type: c.type,
          files: clusterFiles,
          priority: index + 1,
          dependencies: c.dependencies.map(depName => {
            const depIndex = llmAnalysis.clusters.findIndex(cl => cl.name === depName);
            return depIndex >= 0 ? `cluster-${depIndex}` : '';
          }).filter(id => id),
          dependents: [],
          risk: c.risk,
          estimatedReviewTime: Math.max(5, Math.ceil(totalLines / 50)), // ~50 lines per minute
          suggestedReviewers: [],
          metadata: {
            semanticLabels: c.semanticLabels,
            affectedModules: [...new Set(clusterFiles.map(f => f.path.split('/')[0]))],
            testCoverage: null,
            complexity: Math.ceil(clusterFiles.length * (totalLines / 100)),
            couplingScore: c.dependencies.length * 0.2,
          },
        };
      });

      // Fill in dependents
      for (const cluster of clusters) {
        for (const depId of cluster.dependencies) {
          const dep = clusters.find(c => c.id === depId);
          if (dep && !dep.dependents.includes(cluster.id)) {
            dep.dependents.push(cluster.id);
          }
        }
      }

      return {
        strategy: 'semantic',
        clusters,
        confidence: 0.85,
        pros: [
          'Semantically cohesive changes grouped together',
          'Easier for reviewers to understand context',
          'Clear dependency ordering',
        ],
        cons: [
          'May require more careful merge coordination',
          'Some files might logically belong to multiple clusters',
        ],
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to analyze semantic clusters with LLM, falling back to directory');
      return this.analyzeDirectoryClusters(diff);
    }
  }

  private analyzeDirectoryClusters(
    diff: { files: Array<{ filename: string; status: string; additions: number; deletions: number }> }
  ): SplitSuggestion {
    // Group files by top-level directory
    const dirGroups = new Map<string, typeof diff.files>();

    for (const file of diff.files) {
      const parts = file.filename.split('/');
      const dir = parts.length > 1 ? parts[0] : 'root';
      
      if (!dirGroups.has(dir)) {
        dirGroups.set(dir, []);
      }
      dirGroups.get(dir)!.push(file);
    }

    const clusters: ChangeCluster[] = [];
    let index = 0;

    for (const [dir, files] of dirGroups) {
      if (files.length < this.minFilesPerCluster && dirGroups.size > 1) {
        // Too small, might merge with another cluster later
        continue;
      }

      const clusterFiles: ClusterFile[] = files.map(f => ({
        path: f.filename,
        status: f.status as 'added' | 'modified' | 'deleted' | 'renamed',
        additions: f.additions,
        deletions: f.deletions,
        hunks: [],
      }));

      const totalLines = clusterFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);

      clusters.push({
        id: `cluster-dir-${index}`,
        name: `${dir} changes`,
        description: `Changes in the ${dir} directory`,
        type: this.inferTypeFromDirectory(dir),
        files: clusterFiles,
        priority: index + 1,
        dependencies: [],
        dependents: [],
        risk: 'low',
        estimatedReviewTime: Math.max(5, Math.ceil(totalLines / 50)),
        suggestedReviewers: [],
        metadata: {
          semanticLabels: [dir],
          affectedModules: [dir],
          testCoverage: null,
          complexity: files.length,
          couplingScore: 0.1,
        },
      });
      index++;
    }

    return {
      strategy: 'directory',
      clusters,
      confidence: 0.6,
      pros: [
        'Simple and predictable grouping',
        'Low risk of splitting related changes',
      ],
      cons: [
        'May not reflect semantic relationships',
        'Could result in uneven cluster sizes',
      ],
    };
  }

  private analyzeSizeClusters(
    diff: { files: Array<{ filename: string; status: string; additions: number; deletions: number }> }
  ): SplitSuggestion {
    const clusters: ChangeCluster[] = [];
    let currentCluster: typeof diff.files = [];
    let currentLines = 0;
    let clusterIndex = 0;

    // Sort files by size (largest first for better distribution)
    const sortedFiles = [...diff.files].sort((a, b) => 
      (b.additions + b.deletions) - (a.additions + a.deletions)
    );

    for (const file of sortedFiles) {
      const fileLines = file.additions + file.deletions;

      if (currentLines + fileLines > this.maxLinesPerCluster && currentCluster.length >= this.minFilesPerCluster) {
        // Create cluster from current files
        clusters.push(this.createSizeCluster(currentCluster, clusterIndex));
        clusterIndex++;
        currentCluster = [];
        currentLines = 0;
      }

      currentCluster.push(file);
      currentLines += fileLines;
    }

    // Don't forget the last cluster
    if (currentCluster.length > 0) {
      clusters.push(this.createSizeCluster(currentCluster, clusterIndex));
    }

    return {
      strategy: 'size',
      clusters,
      confidence: 0.5,
      pros: [
        'Even distribution of review workload',
        'Predictable cluster sizes',
      ],
      cons: [
        'May split semantically related changes',
        'Dependencies not considered',
      ],
    };
  }

  private createSizeCluster(
    files: Array<{ filename: string; status: string; additions: number; deletions: number }>,
    index: number
  ): ChangeCluster {
    const clusterFiles: ClusterFile[] = files.map(f => ({
      path: f.filename,
      status: f.status as 'added' | 'modified' | 'deleted' | 'renamed',
      additions: f.additions,
      deletions: f.deletions,
      hunks: [],
    }));

    const totalLines = clusterFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);

    return {
      id: `cluster-size-${index}`,
      name: `Batch ${index + 1}`,
      description: `Size-based grouping batch ${index + 1}`,
      type: 'mixed',
      files: clusterFiles,
      priority: index + 1,
      dependencies: index > 0 ? [`cluster-size-${index - 1}`] : [],
      dependents: [],
      risk: 'medium',
      estimatedReviewTime: Math.max(5, Math.ceil(totalLines / 50)),
      suggestedReviewers: [],
      metadata: {
        semanticLabels: [],
        affectedModules: [...new Set(files.map(f => f.filename.split('/')[0]))],
        testCoverage: null,
        complexity: files.length,
        couplingScore: 0.5,
      },
    };
  }

  private inferTypeFromDirectory(dir: string): ChangeCluster['type'] {
    const dirLower = dir.toLowerCase();
    if (dirLower.includes('test') || dirLower.includes('spec')) return 'test';
    if (dirLower.includes('doc')) return 'docs';
    if (dirLower.includes('config') || dirLower === 'src') return 'config';
    return 'feature';
  }

  private buildDependencyGraph(clusters: ChangeCluster[]): ClusterDependencyGraph {
    const nodes = clusters.map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
    }));

    const edges: Array<{ from: string; to: string; type: 'hard' | 'soft' }> = [];

    for (const cluster of clusters) {
      for (const depId of cluster.dependencies) {
        edges.push({
          from: cluster.id,
          to: depId,
          type: 'hard',
        });
      }
    }

    return { nodes, edges };
  }

  private calculateMergeOrder(clusters: ChangeCluster[]): string[] {
    // Topological sort based on dependencies
    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (cluster: ChangeCluster) => {
      if (visited.has(cluster.id)) return;
      visited.add(cluster.id);

      // Visit dependencies first
      for (const depId of cluster.dependencies) {
        const dep = clusters.find(c => c.id === depId);
        if (dep) visit(dep);
      }

      order.push(cluster.name);
    };

    for (const cluster of clusters) {
      visit(cluster);
    }

    return order;
  }

  private identifyRisks(
    clusters: ChangeCluster[],
    graph: ClusterDependencyGraph
  ): DecompositionRisk[] {
    const risks: DecompositionRisk[] = [];

    // Check for dependency cycles
    const hasCycle = this.detectCycle(graph);
    if (hasCycle) {
      risks.push({
        type: 'dependency_cycle',
        severity: 'high',
        description: 'Circular dependency detected between clusters',
        affectedClusters: clusters.map(c => c.id),
        mitigation: 'Consider merging tightly coupled clusters',
      });
    }

    // Check for high-risk clusters
    for (const cluster of clusters) {
      if (cluster.risk === 'high') {
        risks.push({
          type: 'semantic_split',
          severity: 'medium',
          description: `High-risk changes in cluster "${cluster.name}"`,
          affectedClusters: [cluster.id],
          mitigation: 'Ensure thorough review and testing before merge',
        });
      }
    }

    // Check for potential merge conflicts
    const fileToCluster = new Map<string, string[]>();
    for (const cluster of clusters) {
      for (const file of cluster.files) {
        if (!fileToCluster.has(file.path)) {
          fileToCluster.set(file.path, []);
        }
        fileToCluster.get(file.path)!.push(cluster.id);
      }
    }

    for (const [file, clusterIds] of fileToCluster) {
      if (clusterIds.length > 1) {
        risks.push({
          type: 'merge_conflict',
          severity: 'medium',
          description: `File ${file} is modified in multiple clusters`,
          affectedClusters: clusterIds,
          mitigation: 'Merge clusters in dependency order to minimize conflicts',
        });
      }
    }

    return risks;
  }

  private detectCycle(graph: ClusterDependencyGraph): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleDFS = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const outgoing = graph.edges.filter(e => e.from === nodeId);
      for (const edge of outgoing) {
        if (!visited.has(edge.to)) {
          if (hasCycleDFS(edge.to)) return true;
        } else if (recursionStack.has(edge.to)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        if (hasCycleDFS(node.id)) return true;
      }
    }

    return false;
  }

  private generateRecommendations(
    pr: { title: string },
    diff: { files: Array<{ filename: string }>; totalAdditions: number; totalDeletions: number },
    clusters: ChangeCluster[],
    risks: DecompositionRisk[]
  ): string[] {
    const recommendations: string[] = [];

    if (clusters.length === 0) {
      recommendations.push('This PR is small enough that splitting may not be necessary');
    }

    if (clusters.length > 5) {
      recommendations.push('Consider if all these changes need to be in the same PR');
    }

    const totalLines = diff.totalAdditions + diff.totalDeletions;
    if (totalLines > 1000) {
      recommendations.push('Large PR: strongly recommend splitting for easier review');
    }

    if (risks.some(r => r.type === 'dependency_cycle')) {
      recommendations.push('Resolve circular dependencies before splitting');
    }

    if (risks.some(r => r.type === 'merge_conflict')) {
      recommendations.push('Follow the suggested merge order to minimize conflicts');
    }

    const highRiskClusters = clusters.filter(c => c.risk === 'high');
    if (highRiskClusters.length > 0) {
      recommendations.push(`High-risk clusters (${highRiskClusters.map(c => c.name).join(', ')}) should be reviewed first`);
    }

    return recommendations;
  }

  private generateSplitTitle(
    originalTitle: string,
    cluster: ChangeCluster,
    partNumber: number,
    totalParts: number
  ): string {
    const prefix = `[${partNumber}/${totalParts}]`;
    const clusterSuffix = cluster.name.toLowerCase().includes(originalTitle.toLowerCase())
      ? ''
      : ` - ${cluster.name}`;
    
    return `${prefix} ${originalTitle}${clusterSuffix}`;
  }

  private generateSplitBody(
    pr: { number: number; title: string; body: string | null },
    cluster: ChangeCluster,
    partNumber: number,
    totalParts: number
  ): string {
    const parts = [
      `## Part ${partNumber} of ${totalParts}: ${cluster.name}`,
      '',
      `> This PR is part of a split from #${pr.number}`,
      '',
      `### Description`,
      cluster.description,
      '',
      `### Changes`,
      ...cluster.files.map(f => `- \`${f.path}\` (${f.status}, +${f.additions}/-${f.deletions})`),
      '',
      `### Risk Level: ${cluster.risk}`,
      `### Estimated Review Time: ${cluster.estimatedReviewTime} minutes`,
    ];

    if (cluster.dependencies.length > 0) {
      parts.push('', `### Dependencies`, `This PR depends on: ${cluster.dependencies.join(', ')}`);
    }

    if (pr.body) {
      parts.push('', '---', '', '### Original PR Description', pr.body);
    }

    return parts.join('\n');
  }

  // Public method to get analysis for a PR
  async analyze(input: DecompositionAgentInput): Promise<DecompositionAnalysis> {
    const { pr, diff, strategy = 'semantic' } = input;
    return this.analyzePR(pr, diff, strategy);
  }
}

export const decompositionAgent = new DecompositionAgent();
