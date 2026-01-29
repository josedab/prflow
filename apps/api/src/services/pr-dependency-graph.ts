import { db } from '@prflow/db';
import { createGitHubClient, type GitHubClient } from '@prflow/github-client';
import { loadConfigSafe } from '@prflow/config';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const config = loadConfigSafe();

/**
 * Represents a node in the PR dependency graph
 */
export interface PRNode {
  id: string;
  prNumber: number;
  title: string;
  branch: string;
  baseBranch: string;
  author: string;
  status: 'open' | 'closed' | 'merged' | 'draft';
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  filesChanged: string[];
}

/**
 * Represents an edge (dependency) between PRs
 */
export interface PREdge {
  source: string;
  target: string;
  type: 'branch_dependency' | 'file_conflict' | 'semantic_dependency' | 'explicit';
  strength: number; // 0-1, how strong the dependency is
  description: string;
  conflictFiles?: string[];
}

/**
 * Full dependency graph for a repository
 */
export interface PRDependencyGraph {
  repositoryId: string;
  nodes: PRNode[];
  edges: PREdge[];
  cycles: string[][]; // Arrays of PR IDs forming cycles
  criticalPath: string[]; // Optimal merge order
  generatedAt: Date;
}

/**
 * Impact analysis result
 */
export interface ImpactAnalysis {
  prId: string;
  directlyBlocks: string[];
  transitivelyBlocks: string[];
  blockedBy: string[];
  impactScore: number;
  mergeOrderPosition: number;
  recommendations: string[];
}

export class PRDependencyGraphService {
  private getGitHubClient(installationId: number): GitHubClient {
    return createGitHubClient({
      appId: config.GITHUB_APP_ID!,
      privateKey: config.GITHUB_APP_PRIVATE_KEY!,
      installationId,
    });
  }

  /**
   * Build the complete dependency graph for a repository
   */
  async buildGraph(repositoryId: string, _installationId?: number): Promise<PRDependencyGraph> {
    logger.info({ repositoryId }, 'Building PR dependency graph');

    // Get all open workflows (PRs) for the repository
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        status: { notIn: ['COMPLETED', 'FAILED'] },
      },
      include: {
        analysis: true,
        repository: true,
      },
    });

    if (workflows.length === 0) {
      return {
        repositoryId,
        nodes: [],
        edges: [],
        cycles: [],
        criticalPath: [],
        generatedAt: new Date(),
      };
    }

    // Build nodes
    const nodes: PRNode[] = workflows.map((w) => ({
      id: w.id,
      prNumber: w.prNumber,
      title: w.prTitle,
      branch: w.headBranch,
      baseBranch: w.baseBranch,
      author: w.authorLogin,
      status: this.mapWorkflowStatus(w.status),
      riskLevel: (w.analysis?.riskLevel?.toLowerCase() as PRNode['riskLevel']) || 'medium',
      createdAt: w.createdAt,
      filesChanged: (w.analysis?.impactRadius as { affectedFiles?: string[] })?.affectedFiles || [],
    }));

    // Build edges (dependencies)
    const edges: PREdge[] = [];

    // 1. Branch dependencies (PR A's base is PR B's head)
    for (const nodeA of nodes) {
      for (const nodeB of nodes) {
        if (nodeA.id === nodeB.id) continue;

        // Branch dependency: A depends on B if A's base is B's head
        if (nodeA.baseBranch === nodeB.branch) {
          edges.push({
            source: nodeA.id,
            target: nodeB.id,
            type: 'branch_dependency',
            strength: 1.0, // Strong dependency
            description: `PR #${nodeA.prNumber} is based on PR #${nodeB.prNumber}'s branch`,
          });
        }
      }
    }

    // 2. File conflicts
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const conflictFiles = this.findConflictingFiles(nodeA.filesChanged, nodeB.filesChanged);
        if (conflictFiles.length > 0) {
          const strength = Math.min(conflictFiles.length / 10, 1.0);
          edges.push({
            source: nodeA.id,
            target: nodeB.id,
            type: 'file_conflict',
            strength,
            description: `${conflictFiles.length} file(s) modified by both PRs`,
            conflictFiles,
          });
        }
      }
    }

    // 3. Semantic dependencies (same module/package)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        const semanticOverlap = this.calculateSemanticOverlap(nodeA.filesChanged, nodeB.filesChanged);
        if (semanticOverlap > 0.3 && !this.hasEdge(edges, nodeA.id, nodeB.id)) {
          edges.push({
            source: nodeA.id,
            target: nodeB.id,
            type: 'semantic_dependency',
            strength: semanticOverlap,
            description: `PRs modify related code areas`,
          });
        }
      }
    }

    // Detect cycles
    const cycles = this.detectCycles(nodes, edges);

    // Calculate critical path (optimal merge order)
    const criticalPath = this.calculateCriticalPath(nodes, edges);

    const graph: PRDependencyGraph = {
      repositoryId,
      nodes,
      edges,
      cycles,
      criticalPath,
      generatedAt: new Date(),
    };

    logger.info(
      { repositoryId, nodeCount: nodes.length, edgeCount: edges.length, cycleCount: cycles.length },
      'PR dependency graph built'
    );

    return graph;
  }

  /**
   * Get impact analysis for a specific PR
   */
  async getImpactAnalysis(workflowId: string, installationId?: number): Promise<ImpactAnalysis> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    const graph = await this.buildGraph(workflow.repositoryId, installationId);

    const directlyBlocks: string[] = [];
    const blockedBy: string[] = [];

    // Find direct dependencies
    for (const edge of graph.edges) {
      if (edge.source === workflowId) {
        directlyBlocks.push(edge.target);
      }
      if (edge.target === workflowId) {
        blockedBy.push(edge.source);
      }
    }

    // Find transitive dependencies
    const transitivelyBlocks = this.findTransitiveDependencies(workflowId, graph);

    // Calculate impact score
    const impactScore = this.calculateImpactScore(
      directlyBlocks.length,
      transitivelyBlocks.length,
      blockedBy.length
    );

    // Find merge order position
    const mergeOrderPosition = graph.criticalPath.indexOf(workflowId);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      workflowId,
      graph,
      directlyBlocks,
      blockedBy
    );

    return {
      prId: workflowId,
      directlyBlocks,
      transitivelyBlocks: transitivelyBlocks.filter((id) => !directlyBlocks.includes(id)),
      blockedBy,
      impactScore,
      mergeOrderPosition: mergeOrderPosition >= 0 ? mergeOrderPosition + 1 : graph.nodes.length,
      recommendations,
    };
  }

  /**
   * Get optimal merge order for all open PRs
   */
  async getMergeOrder(repositoryId: string): Promise<{
    order: Array<{ prId: string; prNumber: number; reason: string }>;
    hasConflicts: boolean;
    conflictDetails: string[];
  }> {
    const graph = await this.buildGraph(repositoryId);

    if (graph.cycles.length > 0) {
      return {
        order: [],
        hasConflicts: true,
        conflictDetails: graph.cycles.map(
          (cycle) => `Circular dependency detected: ${cycle.join(' → ')} → ${cycle[0]}`
        ),
      };
    }

    const order = graph.criticalPath.map((prId) => {
      const node = graph.nodes.find((n) => n.id === prId);
      const blockedBy = graph.edges.filter((e) => e.source === prId).length;
      const reason =
        blockedBy > 0
          ? `Blocks ${blockedBy} other PR(s)`
          : node?.riskLevel === 'low'
          ? 'Low risk, safe to merge'
          : 'Standard priority';

      return {
        prId,
        prNumber: node?.prNumber || 0,
        reason,
      };
    });

    return {
      order,
      hasConflicts: false,
      conflictDetails: [],
    };
  }

  /**
   * Check if merging a PR would cause conflicts
   */
  async checkMergeConflicts(
    workflowId: string,
    installationId: number
  ): Promise<{
    canMerge: boolean;
    blockers: string[];
    warnings: string[];
  }> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    const graph = await this.buildGraph(workflow.repositoryId, installationId);
    const blockers: string[] = [];
    const warnings: string[] = [];

    // Check if blocked by other PRs
    const blockedByEdges = graph.edges.filter((e) => e.target === workflowId && e.type === 'branch_dependency');
    for (const edge of blockedByEdges) {
      const blockingNode = graph.nodes.find((n) => n.id === edge.source);
      if (blockingNode && blockingNode.status !== 'merged') {
        blockers.push(`Blocked by PR #${blockingNode.prNumber} (${blockingNode.title})`);
      }
    }

    // Check for file conflicts
    const conflictEdges = graph.edges.filter(
      (e) => (e.source === workflowId || e.target === workflowId) && e.type === 'file_conflict'
    );
    for (const edge of conflictEdges) {
      const otherNodeId = edge.source === workflowId ? edge.target : edge.source;
      const otherNode = graph.nodes.find((n) => n.id === otherNodeId);
      if (otherNode) {
        warnings.push(
          `Potential conflict with PR #${otherNode.prNumber}: ${edge.conflictFiles?.slice(0, 3).join(', ')}${
            (edge.conflictFiles?.length || 0) > 3 ? '...' : ''
          }`
        );
      }
    }

    // Check if part of a cycle
    const inCycle = graph.cycles.some((cycle) => cycle.includes(workflowId));
    if (inCycle) {
      blockers.push('Part of a circular dependency - manual resolution required');
    }

    return {
      canMerge: blockers.length === 0,
      blockers,
      warnings,
    };
  }

  /**
   * Simulate what happens if a PR is merged
   */
  async simulateMerge(workflowId: string): Promise<{
    unblocked: Array<{ prId: string; prNumber: number; title: string }>;
    newConflicts: Array<{ prId: string; prNumber: number; reason: string }>;
    newCriticalPath: string[];
  }> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    // Build graph without this PR
    const fullGraph = await this.buildGraph(workflow.repositoryId);
    const simulatedNodes = fullGraph.nodes.filter((n) => n.id !== workflowId);
    const simulatedEdges = fullGraph.edges.filter(
      (e) => e.source !== workflowId && e.target !== workflowId
    );

    // Find PRs that would be unblocked
    const unblockedEdges = fullGraph.edges.filter(
      (e) => e.target === workflowId && e.type === 'branch_dependency'
    );
    const unblocked = unblockedEdges
      .map((e) => {
        const node = fullGraph.nodes.find((n) => n.id === e.source);
        return node
          ? { prId: node.id, prNumber: node.prNumber, title: node.title }
          : null;
      })
      .filter((n): n is NonNullable<typeof n> => n !== null);

    // Recalculate critical path
    const newCriticalPath = this.calculateCriticalPath(simulatedNodes, simulatedEdges);

    // Find any new conflicts that might arise
    const newConflicts: Array<{ prId: string; prNumber: number; reason: string }> = [];
    // In reality, this would check if merging creates new base branch conflicts
    // For now, we return empty as we can't predict git conflicts without actual merge

    return {
      unblocked,
      newConflicts,
      newCriticalPath,
    };
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  private mapWorkflowStatus(status: string): PRNode['status'] {
    switch (status) {
      case 'COMPLETED':
        return 'merged';
      case 'FAILED':
        return 'closed';
      default:
        return 'open';
    }
  }

  private findConflictingFiles(filesA: string[], filesB: string[]): string[] {
    const setA = new Set(filesA);
    return filesB.filter((f) => setA.has(f));
  }

  private calculateSemanticOverlap(filesA: string[], filesB: string[]): number {
    if (filesA.length === 0 || filesB.length === 0) return 0;

    // Extract directories/modules
    const getModules = (files: string[]): Set<string> => {
      const modules = new Set<string>();
      for (const file of files) {
        const parts = file.split('/');
        if (parts.length > 1) {
          modules.add(parts.slice(0, -1).join('/'));
        }
      }
      return modules;
    };

    const modulesA = getModules(filesA);
    const modulesB = getModules(filesB);

    let overlap = 0;
    for (const mod of modulesA) {
      if (modulesB.has(mod)) {
        overlap++;
      }
    }

    const total = Math.max(modulesA.size, modulesB.size);
    return total > 0 ? overlap / total : 0;
  }

  private hasEdge(edges: PREdge[], sourceId: string, targetId: string): boolean {
    return edges.some(
      (e) =>
        (e.source === sourceId && e.target === targetId) ||
        (e.source === targetId && e.target === sourceId)
    );
  }

  private detectCycles(nodes: PRNode[], edges: PREdge[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const adjacencyList = new Map<string, string[]>();
    for (const node of nodes) {
      adjacencyList.set(node.id, []);
    }
    for (const edge of edges) {
      if (edge.type === 'branch_dependency') {
        adjacencyList.get(edge.source)?.push(edge.target);
      }
    }

    const dfs = (nodeId: string, path: string[]): void => {
      visited.add(nodeId);
      recStack.add(nodeId);
      path.push(nodeId);

      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          dfs(neighbor, path);
        } else if (recStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          cycles.push(path.slice(cycleStart));
        }
      }

      path.pop();
      recStack.delete(nodeId);
    };

    for (const node of nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id, []);
      }
    }

    return cycles;
  }

  private calculateCriticalPath(nodes: PRNode[], edges: PREdge[]): string[] {
    // Topological sort with priority based on risk and dependencies
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    }

    for (const edge of edges) {
      if (edge.type === 'branch_dependency') {
        adjacencyList.get(edge.target)?.push(edge.source);
        inDegree.set(edge.source, (inDegree.get(edge.source) || 0) + 1);
      }
    }

    // Priority queue (nodes with 0 in-degree, sorted by risk)
    const queue: string[] = [];
    const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

    for (const node of nodes) {
      if (inDegree.get(node.id) === 0) {
        queue.push(node.id);
      }
    }

    // Sort by risk level (lower risk first)
    queue.sort((a, b) => {
      const nodeA = nodes.find((n) => n.id === a);
      const nodeB = nodes.find((n) => n.id === b);
      return (riskOrder[nodeA?.riskLevel || 'medium'] || 1) - (riskOrder[nodeB?.riskLevel || 'medium'] || 1);
    });

    const result: string[] = [];

    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      const neighbors = adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);

        if (newDegree === 0) {
          queue.push(neighbor);
          // Re-sort
          queue.sort((a, b) => {
            const nodeA = nodes.find((n) => n.id === a);
            const nodeB = nodes.find((n) => n.id === b);
            return (riskOrder[nodeA?.riskLevel || 'medium'] || 1) - (riskOrder[nodeB?.riskLevel || 'medium'] || 1);
          });
        }
      }
    }

    return result;
  }

  private findTransitiveDependencies(prId: string, graph: PRDependencyGraph): string[] {
    const visited = new Set<string>();
    const queue = [prId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = graph.edges
        .filter((e) => e.target === current && e.type === 'branch_dependency')
        .map((e) => e.source);

      for (const dep of dependents) {
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }

    return Array.from(visited);
  }

  private calculateImpactScore(directBlocks: number, transitiveBlocks: number, blockedBy: number): number {
    // Higher score = higher impact
    const directWeight = 3;
    const transitiveWeight = 1;
    const blockedByPenalty = 0.5;

    const rawScore = directBlocks * directWeight + transitiveBlocks * transitiveWeight - blockedBy * blockedByPenalty;
    return Math.max(0, Math.min(100, rawScore * 10));
  }

  private generateRecommendations(
    prId: string,
    graph: PRDependencyGraph,
    directlyBlocks: string[],
    blockedBy: string[]
  ): string[] {
    const recommendations: string[] = [];
    const node = graph.nodes.find((n) => n.id === prId);

    if (blockedBy.length > 0) {
      recommendations.push(`Wait for ${blockedBy.length} blocking PR(s) to merge first`);
    }

    if (directlyBlocks.length > 2) {
      recommendations.push('High-impact PR - consider expedited review');
    }

    if (node?.riskLevel === 'high' || node?.riskLevel === 'critical') {
      recommendations.push('High-risk PR - ensure thorough review before merge');
    }

    if (graph.cycles.some((c) => c.includes(prId))) {
      recommendations.push('Part of circular dependency - coordinate with dependent PR authors');
    }

    if (directlyBlocks.length === 0 && blockedBy.length === 0) {
      recommendations.push('Independent PR - safe to merge at any time');
    }

    return recommendations;
  }
}

export const prDependencyGraphService = new PRDependencyGraphService();
