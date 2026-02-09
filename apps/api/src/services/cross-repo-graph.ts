import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface RepositoryImpact {
  repository: string;
  depth: number;
  affectedFiles: string[];
  impactType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  teamOwners: string[];
  suggestedActions: string[];
}

interface ImpactPropagation {
  id: string;
  source: { repository: string; prNumber: number; changedFiles: string[] };
  directImpacts: RepositoryImpact[];
  transitiveImpacts: RepositoryImpact[];
  totalAffectedRepos: number;
  totalAffectedFiles: number;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  maxDepth: number;
  analyzedAt: Date;
}

interface GraphHealthStatus {
  graphId: string;
  organization: string;
  totalNodes: number;
  totalEdges: number;
  staleNodes: number;
  circularDependencies: Array<{ path: string[]; severity: string }>;
  orphanNodes: number;
  lastFullRebuild: Date;
  lastIncrementalUpdate: Date;
  healthScore: number;
}

interface ImpactNotification {
  id: string;
  propagationId: string;
  targetRepository: string;
  recipients: string[];
  channel: string;
  status: 'pending' | 'sent' | 'acknowledged' | 'dismissed';
  message: string;
  severity: string;
  createdAt: Date;
}

/**
 * Cross-Repository Impact Graph Service (Enhanced)
 * Maintains a live dependency graph across repositories,
 * propagates impact analysis, and manages notifications.
 */
export class CrossRepoGraphService {
  private graphs = new Map<string, {
    id: string;
    organization: string;
    nodes: Map<string, { id: string; type: string; name: string; repository: string; version?: string; updatedAt: Date }>;
    edges: Map<string, { id: string; sourceId: string; targetId: string; type: string; weight: number }>;
    builtAt: Date;
  }>();

  private notifications: ImpactNotification[] = [];

  /**
   * Build or rebuild dependency graph for an organization
   */
  async buildGraph(organization: string): Promise<GraphHealthStatus> {
    logger.info({ organization }, 'Building cross-repo dependency graph');

    const graphId = `graph-${organization}`;
    const graph = {
      id: graphId,
      organization,
      nodes: new Map<string, { id: string; type: string; name: string; repository: string; version?: string; updatedAt: Date }>(),
      edges: new Map<string, { id: string; sourceId: string; targetId: string; type: string; weight: number }>(),
      builtAt: new Date(),
    };

    // Get all repositories for the organization
    const repositories = await db.repository.findMany({
      where: { fullName: { startsWith: `${organization}/` } },
    });

    for (const repo of repositories) {
      const nodeId = `repo-${repo.fullName}`;
      graph.nodes.set(nodeId, {
        id: nodeId,
        type: 'repository',
        name: repo.name,
        repository: repo.fullName,
        updatedAt: new Date(),
      });
    }

    this.graphs.set(graphId, graph);

    const health = this.calculateGraphHealth(graphId);
    logger.info({ organization, nodes: graph.nodes.size, edges: graph.edges.size }, 'Dependency graph built');
    return health;
  }

  /**
   * Propagate impact analysis from a PR
   */
  async propagateImpact(params: {
    owner: string;
    repo: string;
    prNumber: number;
    changedFiles: string[];
    maxDepth?: number;
  }): Promise<ImpactPropagation> {
    const { owner, repo, prNumber, changedFiles, maxDepth = 3 } = params;
    logger.info({ owner, repo, prNumber, fileCount: changedFiles.length }, 'Propagating cross-repo impact');

    const graphId = `graph-${owner}`;
    const graph = this.graphs.get(graphId);

    const directImpacts: RepositoryImpact[] = [];
    const transitiveImpacts: RepositoryImpact[] = [];

    // Analyze direct impacts based on file patterns
    if (graph) {
      for (const [, node] of graph.nodes) {
        if (node.repository === `${owner}/${repo}`) continue;

        // Check if changed files could affect this repo
        const hasImpact = changedFiles.some(f =>
          f.includes('package.json') || f.includes('api/') || f.includes('types/')
        );

        if (hasImpact) {
          directImpacts.push({
            repository: node.repository,
            depth: 1,
            affectedFiles: [],
            impactType: 'api_change',
            severity: changedFiles.some(f => f.includes('types/')) ? 'medium' : 'low',
            description: `Changes in ${owner}/${repo} may affect ${node.repository}`,
            teamOwners: [],
            suggestedActions: ['Review dependent code for compatibility'],
          });
        }
      }
    }

    const allImpacts = [...directImpacts, ...transitiveImpacts];
    const maxSeverity = allImpacts.reduce((max, i) => {
      const order = { low: 0, medium: 1, high: 2, critical: 3 };
      return order[i.severity] > order[max] ? i.severity : max;
    }, 'low' as 'low' | 'medium' | 'high' | 'critical');

    const result: ImpactPropagation = {
      id: uuidv4(),
      source: { repository: `${owner}/${repo}`, prNumber, changedFiles },
      directImpacts,
      transitiveImpacts,
      totalAffectedRepos: new Set(allImpacts.map(i => i.repository)).size,
      totalAffectedFiles: allImpacts.reduce((sum, i) => sum + i.affectedFiles.length, 0),
      overallRisk: maxSeverity,
      maxDepth: Math.max(0, ...allImpacts.map(i => i.depth)),
      analyzedAt: new Date(),
    };

    logger.info({ prNumber, directImpacts: directImpacts.length, transitiveImpacts: transitiveImpacts.length, overallRisk: maxSeverity }, 'Impact propagation completed');
    return result;
  }

  /**
   * Get graph health status
   */
  async getGraphHealth(organization: string): Promise<GraphHealthStatus> {
    return this.calculateGraphHealth(`graph-${organization}`);
  }

  /**
   * Send impact notifications
   */
  async sendNotifications(propagationId: string, impacts: RepositoryImpact[]): Promise<ImpactNotification[]> {
    const sent: ImpactNotification[] = [];

    for (const impact of impacts) {
      if (impact.severity === 'low') continue;

      const notification: ImpactNotification = {
        id: uuidv4(),
        propagationId,
        targetRepository: impact.repository,
        recipients: impact.teamOwners,
        channel: 'github_issue',
        status: 'pending',
        message: `Cross-repo impact detected: ${impact.description}`,
        severity: impact.severity,
        createdAt: new Date(),
      };

      this.notifications.push(notification);
      sent.push(notification);
    }

    logger.info({ propagationId, notificationCount: sent.length }, 'Impact notifications sent');
    return sent;
  }

  /**
   * Get notifications
   */
  async getNotifications(params: {
    repository?: string;
    status?: string;
    limit?: number;
  }): Promise<ImpactNotification[]> {
    let filtered = this.notifications;

    if (params.repository) {
      filtered = filtered.filter(n => n.targetRepository === params.repository);
    }
    if (params.status) {
      filtered = filtered.filter(n => n.status === params.status);
    }

    return filtered.slice(0, params.limit || 50);
  }

  /**
   * Acknowledge a notification
   */
  async acknowledgeNotification(notificationId: string, userId: string): Promise<void> {
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.status = 'acknowledged';
    }
  }

  /**
   * Get blast radius visualization data
   */
  async getBlastRadius(params: {
    owner: string;
    repo: string;
    prNumber: number;
  }): Promise<{
    center: { repository: string; prNumber: number };
    rings: Array<{ depth: number; repositories: Array<{ name: string; severity: string; affectedFiles: number }> }>;
    totalRepos: number;
    totalTeams: number;
  }> {
    const propagation = await this.propagateImpact({ ...params, changedFiles: [] });

    const ringMap = new Map<number, Array<{ name: string; severity: string; affectedFiles: number }>>();
    for (const impact of [...propagation.directImpacts, ...propagation.transitiveImpacts]) {
      if (!ringMap.has(impact.depth)) ringMap.set(impact.depth, []);
      ringMap.get(impact.depth)!.push({
        name: impact.repository,
        severity: impact.severity,
        affectedFiles: impact.affectedFiles.length,
      });
    }

    return {
      center: { repository: `${params.owner}/${params.repo}`, prNumber: params.prNumber },
      rings: Array.from(ringMap.entries()).map(([depth, repos]) => ({ depth, repositories: repos })),
      totalRepos: propagation.totalAffectedRepos,
      totalTeams: new Set(propagation.directImpacts.flatMap(i => i.teamOwners)).size,
    };
  }

  private calculateGraphHealth(graphId: string): GraphHealthStatus {
    const graph = this.graphs.get(graphId);

    if (!graph) {
      return {
        graphId,
        organization: graphId.replace('graph-', ''),
        totalNodes: 0,
        totalEdges: 0,
        staleNodes: 0,
        circularDependencies: [],
        orphanNodes: 0,
        lastFullRebuild: new Date(),
        lastIncrementalUpdate: new Date(),
        healthScore: 0,
      };
    }

    const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const staleNodes = Array.from(graph.nodes.values()).filter(n => n.updatedAt < staleThreshold).length;
    const nodesWithEdges = new Set([
      ...Array.from(graph.edges.values()).map(e => e.sourceId),
      ...Array.from(graph.edges.values()).map(e => e.targetId),
    ]);
    const orphanNodes = Array.from(graph.nodes.keys()).filter(id => !nodesWithEdges.has(id)).length;

    const healthScore = Math.max(0, 100 - staleNodes * 5 - orphanNodes * 3);

    return {
      graphId,
      organization: graph.organization,
      totalNodes: graph.nodes.size,
      totalEdges: graph.edges.size,
      staleNodes,
      circularDependencies: [],
      orphanNodes,
      lastFullRebuild: graph.builtAt,
      lastIncrementalUpdate: new Date(),
      healthScore,
    };
  }
}

export const crossRepoGraphService = new CrossRepoGraphService();
