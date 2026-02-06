import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  CrossRepoDependencyGraph,
  CrossRepoDependencyNode,
  CrossRepoDependencyEdge,
  ImpactAnalysis,
  ChangedEntity,
  Impact,
  BlastRadius,
  ImpactRiskAssessment,
  ImpactRecommendation,
  ImpactAlert,
  DependencyManifest,
} from '@prflow/core';

/**
 * Cross-Repository Impact Analysis Service
 * Traces dependencies and analyzes impact across repositories
 */
export class CrossRepoImpactService {
  private graphCache = new Map<string, CrossRepoDependencyGraph>();

  /**
   * Analyze cross-repository impact of a PR
   */
  async analyzeImpact(params: {
    owner: string;
    repo: string;
    prNumber: number;
    includeTransitive?: boolean;
    maxDepth?: number;
  }): Promise<ImpactAnalysis> {
    const { owner, repo, prNumber, includeTransitive = true, maxDepth = 3 } = params;

    logger.info({ owner, repo, prNumber }, 'Analyzing cross-repo impact');

    // Get the workflow for this PR
    const workflow = await db.pRWorkflow.findFirst({
      where: {
        prNumber,
        repository: {
          fullName: `${owner}/${repo}`,
        },
      },
      include: {
        repository: true,
        analysis: true,
      },
    });

    if (!workflow) {
      throw new Error(`PR ${owner}/${repo}#${prNumber} not found`);
    }

    // Get or build dependency graph for the organization
    const orgName = owner;
    let graph = this.graphCache.get(orgName);
    if (!graph) {
      graph = await this.buildOrganizationGraph(orgName);
      this.graphCache.set(orgName, graph);
    }

    // Identify changed entities
    const changedEntities = await this.identifyChangedEntities(workflow);

    // Find direct impacts
    const directImpacts = await this.findDirectImpacts(changedEntities, graph, workflow.repository.fullName);

    // Find transitive impacts if requested
    const transitiveImpacts = includeTransitive
      ? await this.findTransitiveImpacts(directImpacts, graph, maxDepth)
      : [];

    // Calculate blast radius
    const blastRadius = this.calculateBlastRadius(directImpacts, transitiveImpacts, workflow.repository.fullName);

    // Assess risk
    const riskAssessment = this.assessRisk(changedEntities, directImpacts, transitiveImpacts);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      changedEntities,
      directImpacts,
      transitiveImpacts,
      riskAssessment
    );

    const analysis: ImpactAnalysis = {
      id: uuidv4(),
      sourcePR: {
        owner,
        repo,
        number: prNumber,
        title: workflow.prTitle,
      },
      changedEntities,
      directImpacts,
      transitiveImpacts,
      blastRadius,
      riskAssessment,
      recommendations,
      analyzedAt: new Date(),
    };

    // Store analysis
    await this.storeAnalysis(analysis);

    // Create alerts for high-severity impacts
    await this.createAlerts(analysis);

    logger.info({
      prNumber,
      directImpacts: directImpacts.length,
      transitiveImpacts: transitiveImpacts.length,
      riskLevel: riskAssessment.level,
    }, 'Impact analysis completed');

    return analysis;
  }

  /**
   * Build dependency graph for an organization
   */
  async buildOrganizationGraph(organization: string): Promise<CrossRepoDependencyGraph> {
    logger.info({ organization }, 'Building organization dependency graph');

    const startTime = Date.now();
    const nodes: CrossRepoDependencyNode[] = [];
    const edges: CrossRepoDependencyEdge[] = [];

    // Get all repositories in the organization
    const repositories = await db.repository.findMany({
      where: {
        fullName: { startsWith: `${organization}/` },
      },
    });

    // Create repository nodes
    for (const repo of repositories) {
      const [owner, name] = repo.fullName.split('/');
      nodes.push({
        id: `repo:${repo.fullName}`,
        type: 'repository',
        name: repo.name,
        path: repo.fullName,
        repository: { owner, name, fullName: repo.fullName },
        metadata: {},
        lastUpdatedAt: new Date(),
      });
    }

    // Parse dependency manifests for each repository
    for (const repo of repositories) {
      const manifests = await this.parseManifests(repo.fullName);

      for (const manifest of manifests) {
        // Create package node
        const packageNodeId = `pkg:${manifest.packageName}@${repo.fullName}`;
        nodes.push({
          id: packageNodeId,
          type: 'package',
          name: manifest.packageName,
          path: manifest.path,
          repository: {
            owner: manifest.repository.owner,
            name: manifest.repository.name,
            fullName: `${manifest.repository.owner}/${manifest.repository.name}`,
          },
          version: manifest.version,
          metadata: { manifestType: manifest.type },
          lastUpdatedAt: manifest.parsedAt,
        });

        // Create edges for dependencies
        for (const dep of manifest.dependencies) {
          if (dep.internal) {
            // Find the internal package node
            const targetNode = nodes.find(
              n => n.type === 'package' && n.name === dep.name
            );

            if (targetNode) {
              edges.push({
                id: uuidv4(),
                sourceId: packageNodeId,
                targetId: targetNode.id,
                type: 'depends_on',
                weight: 1,
                direct: true,
                metadata: { version: dep.version },
              });
            }
          }
        }
      }
    }

    const buildDurationMs = Date.now() - startTime;

    const graph: CrossRepoDependencyGraph = {
      id: uuidv4(),
      organization,
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        repositoryCount: repositories.length,
        avgConnections: edges.length > 0 ? (edges.length * 2) / nodes.length : 0,
        hubNodes: this.findHubNodes(nodes, edges),
        isolatedNodes: this.findIsolatedNodes(nodes, edges),
      },
      builtAt: new Date(),
      buildDurationMs,
    };

    // Store graph
    await this.storeGraph(graph);

    logger.info({
      organization,
      nodes: nodes.length,
      edges: edges.length,
      durationMs: buildDurationMs,
    }, 'Dependency graph built');

    return graph;
  }

  /**
   * Get alerts for a repository or organization
   */
  async getAlerts(params: {
    repository?: string;
    organization?: string;
    severity?: string[];
    status?: string[];
    limit?: number;
  }): Promise<ImpactAlert[]> {
    const events = await db.analyticsEvent.findMany({
      where: {
        eventType: 'cross_repo_alert',
        ...(params.repository && {
          eventData: {
            path: ['affectedRepo', 'fullName'],
            equals: params.repository,
          },
        }),
      },
      orderBy: { createdAt: 'desc' },
      take: params.limit || 50,
    });

    return events.map(e => e.eventData as unknown as ImpactAlert);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, userId: string): Promise<void> {
    await db.analyticsEvent.updateMany({
      where: {
        eventType: 'cross_repo_alert',
        eventData: {
          path: ['id'],
          equals: alertId,
        },
      },
      data: {
        eventData: {
          status: 'acknowledged',
          acknowledgedBy: userId,
          acknowledgedAt: new Date().toISOString(),
        },
      },
    });
  }

  // Private helper methods

  private async identifyChangedEntities(
    workflow: {
      analysis?: unknown;
    }
  ): Promise<ChangedEntity[]> {
    const entities: ChangedEntity[] = [];

    // Parse semantic changes from analysis
    const analysisObj = workflow.analysis as { semanticChanges?: unknown } | null | undefined;
    if (analysisObj?.semanticChanges) {
      const changes = analysisObj.semanticChanges as Array<{
        type: string;
        name: string;
        file: string;
        impact: string;
        breaking?: boolean;
        description?: string;
      }>;

      for (const change of changes) {
        let entityType: ChangedEntity['type'] = 'function';
        if (change.type.includes('class')) entityType = 'class';
        else if (change.type.includes('api')) entityType = 'api_endpoint';
        else if (change.type.includes('config')) entityType = 'config';

        let changeType: ChangedEntity['changeType'] = 'modified';
        if (change.type.includes('new') || change.type.includes('added')) changeType = 'added';
        else if (change.type.includes('deleted') || change.type.includes('removed')) changeType = 'deleted';

        entities.push({
          type: entityType,
          name: change.name,
          file: change.file,
          changeType,
          isBreaking: change.breaking || false,
          description: change.description || `${changeType} ${change.name}`,
          linesChanged: 0,
        });
      }
    }

    return entities;
  }

  private async findDirectImpacts(
    changedEntities: ChangedEntity[],
    graph: CrossRepoDependencyGraph,
    sourceRepo: string
  ): Promise<Impact[]> {
    const impacts: Impact[] = [];

    // Find all nodes that depend on the source repository
    const sourceNodes = graph.nodes.filter(
      n => n.repository.fullName === sourceRepo
    );
    const sourceNodeIds = new Set(sourceNodes.map(n => n.id));

    // Find edges where source is in our changed repo
    const dependentEdges = graph.edges.filter(e => sourceNodeIds.has(e.targetId));

    for (const edge of dependentEdges) {
      const dependentNode = graph.nodes.find(n => n.id === edge.sourceId);
      if (!dependentNode || dependentNode.repository.fullName === sourceRepo) {
        continue;
      }

      // Check if any changed entity affects this dependency
      for (const entity of changedEntities) {
        const targetNode = graph.nodes.find(n => n.id === edge.targetId);
        if (!targetNode) continue;

        // Determine impact type and severity
        let impactType: Impact['impactType'] = 'behavior_change';
        let severity: Impact['severity'] = 'medium';

        if (entity.isBreaking) {
          impactType = 'api_breaking_change';
          severity = 'critical';
        } else if (entity.type === 'api_endpoint') {
          impactType = 'api_signature_change';
          severity = 'high';
        } else if (entity.changeType === 'deleted') {
          impactType = 'api_breaking_change';
          severity = 'critical';
        }

        impacts.push({
          id: uuidv4(),
          entity: {
            type: dependentNode.type,
            name: dependentNode.name,
            path: dependentNode.path,
          },
          repository: dependentNode.repository,
          impactType,
          severity,
          confidence: 0.8,
          description: `${entity.name} change may affect ${dependentNode.name}`,
          affectedFiles: [dependentNode.path],
          suggestedAction: `Review usage of ${entity.name} in ${dependentNode.repository.fullName}`,
        });
      }
    }

    return impacts;
  }

  private async findTransitiveImpacts(
    directImpacts: Impact[],
    graph: CrossRepoDependencyGraph,
    maxDepth: number
  ): Promise<Impact[]> {
    const transitiveImpacts: Impact[] = [];
    const visited = new Set<string>();

    // Mark direct impacts as visited
    for (const impact of directImpacts) {
      visited.add(impact.repository.fullName);
    }

    // BFS to find transitive impacts
    let currentLevel = directImpacts.map(i => i.repository.fullName);
    let depth = 1;

    while (currentLevel.length > 0 && depth < maxDepth) {
      const nextLevel: string[] = [];

      for (const repoFullName of currentLevel) {
        // Find nodes in this repo
        const repoNodes = graph.nodes.filter(
          n => n.repository.fullName === repoFullName
        );
        const repoNodeIds = new Set(repoNodes.map(n => n.id));

        // Find dependencies on this repo
        const dependentEdges = graph.edges.filter(e => repoNodeIds.has(e.targetId));

        for (const edge of dependentEdges) {
          const dependentNode = graph.nodes.find(n => n.id === edge.sourceId);
          if (!dependentNode) continue;

          const dependentRepo = dependentNode.repository.fullName;
          if (visited.has(dependentRepo)) continue;

          visited.add(dependentRepo);
          nextLevel.push(dependentRepo);

          transitiveImpacts.push({
            id: uuidv4(),
            entity: {
              type: dependentNode.type,
              name: dependentNode.name,
              path: dependentNode.path,
            },
            repository: dependentNode.repository,
            impactType: 'dependency_update',
            severity: 'low',
            confidence: Math.max(0.3, 0.8 - depth * 0.2),
            description: `Transitive impact at depth ${depth}`,
            affectedFiles: [dependentNode.path],
            suggestedAction: 'Monitor for issues after deployment',
          });
        }
      }

      currentLevel = nextLevel;
      depth++;
    }

    return transitiveImpacts;
  }

  private calculateBlastRadius(
    directImpacts: Impact[],
    transitiveImpacts: Impact[],
    sourceRepo: string
  ): BlastRadius {
    const allImpacts = [...directImpacts, ...transitiveImpacts];
    const repoMap = new Map<string, { count: number; maxSeverity: string }>();

    for (const impact of allImpacts) {
      const repoName = impact.repository.fullName;
      const current = repoMap.get(repoName) || { count: 0, maxSeverity: 'low' };
      current.count++;

      // Update max severity
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      if (severityOrder[impact.severity] > severityOrder[current.maxSeverity as keyof typeof severityOrder]) {
        current.maxSeverity = impact.severity;
      }

      repoMap.set(repoName, current);
    }

    const repositories = Array.from(repoMap.entries()).map(([fullName, data]) => {
      const [owner, name] = fullName.split('/');
      return { owner, name, impactCount: data.count, maxSeverity: data.maxSeverity };
    });

    // Build visualization rings
    const directRepos = new Set(directImpacts.map(i => i.repository.fullName));
    const transitiveRepos = new Set(transitiveImpacts.map(i => i.repository.fullName));

    return {
      repositoriesAffected: repoMap.size,
      repositories,
      filesAffected: allImpacts.reduce((sum, i) => sum + i.affectedFiles.length, 0),
      consumersAffected: allImpacts.length,
      maxDepth: transitiveImpacts.length > 0 ? 2 : 1,
      visualization: {
        centerNode: sourceRepo,
        rings: [
          { depth: 1, nodes: Array.from(directRepos) },
          { depth: 2, nodes: Array.from(transitiveRepos).filter(r => !directRepos.has(r)) },
        ],
      },
    };
  }

  private assessRisk(
    changedEntities: ChangedEntity[],
    directImpacts: Impact[],
    transitiveImpacts: Impact[]
  ): ImpactRiskAssessment {
    const factors: ImpactRiskAssessment['factors'] = [];
    let score = 0;

    // Breaking changes factor
    const breakingChanges = changedEntities.filter(e => e.isBreaking).length;
    if (breakingChanges > 0) {
      const contribution = Math.min(40, breakingChanges * 20);
      score += contribution;
      factors.push({
        factor: 'Breaking changes',
        contribution,
        description: `${breakingChanges} breaking change(s) detected`,
      });
    }

    // Direct impacts factor
    const criticalImpacts = directImpacts.filter(i => i.severity === 'critical').length;
    const highImpacts = directImpacts.filter(i => i.severity === 'high').length;

    if (criticalImpacts > 0) {
      const contribution = Math.min(30, criticalImpacts * 15);
      score += contribution;
      factors.push({
        factor: 'Critical impacts',
        contribution,
        description: `${criticalImpacts} critical downstream impact(s)`,
      });
    }

    if (highImpacts > 0) {
      const contribution = Math.min(20, highImpacts * 5);
      score += contribution;
      factors.push({
        factor: 'High impacts',
        contribution,
        description: `${highImpacts} high-severity downstream impact(s)`,
      });
    }

    // Blast radius factor
    const uniqueRepos = new Set([
      ...directImpacts.map(i => i.repository.fullName),
      ...transitiveImpacts.map(i => i.repository.fullName),
    ]).size;

    if (uniqueRepos > 3) {
      const contribution = Math.min(20, uniqueRepos * 3);
      score += contribution;
      factors.push({
        factor: 'Blast radius',
        contribution,
        description: `${uniqueRepos} repositories potentially affected`,
      });
    }

    // Determine level
    let level: ImpactRiskAssessment['level'] = 'low';
    if (score >= 70) level = 'critical';
    else if (score >= 50) level = 'high';
    else if (score >= 30) level = 'medium';

    // Generate mitigations
    const mitigations: string[] = [];
    if (breakingChanges > 0) {
      mitigations.push('Consider adding migration guide for breaking changes');
      mitigations.push('Notify downstream teams before merging');
    }
    if (uniqueRepos > 1) {
      mitigations.push('Coordinate deployment with affected teams');
    }
    if (score >= 50) {
      mitigations.push('Consider splitting into smaller, incremental changes');
    }

    return { level, score, factors, mitigations };
  }

  private generateRecommendations(
    changedEntities: ChangedEntity[],
    directImpacts: Impact[],
    _transitiveImpacts: Impact[],
    riskAssessment: ImpactRiskAssessment
  ): ImpactRecommendation[] {
    const recommendations: ImpactRecommendation[] = [];

    // Notification recommendation for high risk
    if (riskAssessment.level === 'critical' || riskAssessment.level === 'high') {
      const affectedRepos = [...new Set(directImpacts.map(i => i.repository.fullName))];
      recommendations.push({
        id: uuidv4(),
        priority: 'critical',
        title: 'Notify affected teams',
        description: 'This change has significant downstream impact',
        actions: [
          'Send notification to affected repository owners',
          'Schedule coordination meeting if needed',
          'Document breaking changes in PR description',
        ],
        affectedRepos,
      });
    }

    // Breaking change recommendation
    const breakingChanges = changedEntities.filter(e => e.isBreaking);
    if (breakingChanges.length > 0) {
      recommendations.push({
        id: uuidv4(),
        priority: 'high',
        title: 'Document breaking changes',
        description: `${breakingChanges.length} breaking change(s) require documentation`,
        actions: [
          'Add migration instructions to PR description',
          'Update CHANGELOG with breaking changes',
          'Consider version bump (semver major)',
        ],
        affectedRepos: [],
      });
    }

    // Test recommendation
    if (directImpacts.length > 0) {
      recommendations.push({
        id: uuidv4(),
        priority: 'medium',
        title: 'Run cross-repository tests',
        description: 'Verify changes work with downstream consumers',
        actions: [
          'Run integration tests against affected repositories',
          'Verify API contract compatibility',
          'Check for deprecation warnings',
        ],
        affectedRepos: [...new Set(directImpacts.map(i => i.repository.fullName))],
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private async parseManifests(repoFullName: string): Promise<DependencyManifest[]> {
    // In a real implementation, this would fetch and parse actual manifests
    // For now, return a simulated manifest
    const [owner, name] = repoFullName.split('/');

    return [{
      repository: { owner, name },
      type: 'package.json',
      path: 'package.json',
      packageName: name,
      version: '1.0.0',
      dependencies: [],
      devDependencies: [],
      peerDependencies: [],
      parsedAt: new Date(),
    }];
  }

  private findHubNodes(nodes: CrossRepoDependencyNode[], edges: CrossRepoDependencyEdge[]): string[] {
    const connectionCount = new Map<string, number>();

    for (const edge of edges) {
      connectionCount.set(edge.sourceId, (connectionCount.get(edge.sourceId) || 0) + 1);
      connectionCount.set(edge.targetId, (connectionCount.get(edge.targetId) || 0) + 1);
    }

    return Array.from(connectionCount.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([nodeId]) => nodeId);
  }

  private findIsolatedNodes(nodes: CrossRepoDependencyNode[], edges: CrossRepoDependencyEdge[]): string[] {
    const connectedNodes = new Set<string>();

    for (const edge of edges) {
      connectedNodes.add(edge.sourceId);
      connectedNodes.add(edge.targetId);
    }

    return nodes
      .filter(n => !connectedNodes.has(n.id))
      .map(n => n.id);
  }

  private async createAlerts(analysis: ImpactAnalysis): Promise<void> {
    const criticalImpacts = analysis.directImpacts.filter(i => i.severity === 'critical');

    for (const impact of criticalImpacts) {
      const alert: ImpactAlert = {
        id: uuidv4(),
        type: impact.impactType === 'api_breaking_change' ? 'breaking_change' : 'api_change',
        severity: 'critical',
        sourcePR: {
          ...analysis.sourcePR,
          url: `https://github.com/${analysis.sourcePR.owner}/${analysis.sourcePR.repo}/pull/${analysis.sourcePR.number}`,
        },
        affectedRepo: {
          owner: impact.repository.owner,
          name: impact.repository.name,
        },
        title: `Breaking change affects ${impact.repository.fullName}`,
        message: impact.description,
        details: {
          changedEntity: analysis.changedEntities[0]?.name || 'Unknown',
          impactedEntities: [impact.entity.name],
          suggestedAction: impact.suggestedAction,
        },
        status: 'active',
        createdAt: new Date(),
      };

      await db.analyticsEvent.create({
        data: {
          repositoryId: '',
          eventType: 'cross_repo_alert',
          eventData: JSON.parse(JSON.stringify(alert)),
        },
      });
    }
  }

  private async storeAnalysis(analysis: ImpactAnalysis): Promise<void> {
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'cross_repo_impact',
        eventData: JSON.parse(JSON.stringify({
          id: analysis.id,
          sourcePR: analysis.sourcePR,
          directImpactsCount: analysis.directImpacts.length,
          transitiveImpactsCount: analysis.transitiveImpacts.length,
          blastRadius: analysis.blastRadius.repositoriesAffected,
          riskLevel: analysis.riskAssessment.level,
          analyzedAt: analysis.analyzedAt.toISOString(),
        })),
      },
    });
  }

  private async storeGraph(graph: CrossRepoDependencyGraph): Promise<void> {
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'dependency_graph',
        eventData: JSON.parse(JSON.stringify({
          id: graph.id,
          organization: graph.organization,
          stats: graph.stats,
          builtAt: graph.builtAt.toISOString(),
          buildDurationMs: graph.buildDurationMs,
        })),
      },
    });
  }
}

export const crossRepoImpactService = new CrossRepoImpactService();
