import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prDependencyGraphService } from '../services/pr-dependency-graph.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const repositoryParamsSchema = z.object({
  repositoryId: z.string(),
});

const workflowParamsSchema = z.object({
  workflowId: z.string(),
});

const graphQuerySchema = z.object({
  includeClosedPRs: z.coerce.boolean().optional().default(false),
  maxDepth: z.coerce.number().min(1).max(10).optional().default(5),
});

export async function prDependencyGraphRoutes(app: FastifyInstance) {
  /**
   * Get the full dependency graph for a repository
   */
  app.get<{
    Params: z.infer<typeof repositoryParamsSchema>;
    Querystring: z.infer<typeof graphQuerySchema>;
  }>(
    '/repositories/:repositoryId/dependency-graph',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      graphQuerySchema.parse(request.query);

      try {
        const graph = await prDependencyGraphService.buildGraph(repositoryId);

        return {
          success: true,
          graph: {
            repositoryId: graph.repositoryId,
            stats: {
              totalNodes: graph.nodes.length,
              totalEdges: graph.edges.length,
              cycleCount: graph.cycles.length,
              hasCycles: graph.cycles.length > 0,
            },
            nodes: graph.nodes.map((n) => ({
              id: n.id,
              prNumber: n.prNumber,
              title: n.title,
              branch: n.branch,
              baseBranch: n.baseBranch,
              author: n.author,
              status: n.status,
              riskLevel: n.riskLevel,
              filesChangedCount: n.filesChanged.length,
            })),
            edges: graph.edges.map((e) => ({
              source: e.source,
              target: e.target,
              type: e.type,
              strength: Math.round(e.strength * 100),
              description: e.description,
              conflictFileCount: e.conflictFiles?.length || 0,
            })),
            cycles: graph.cycles.map((cycle) => {
              const nodeNames = cycle.map((id) => {
                const node = graph.nodes.find((n) => n.id === id);
                return node ? `PR #${node.prNumber}` : id;
              });
              return {
                nodeIds: cycle,
                display: nodeNames.join(' → ') + ' → ' + nodeNames[0],
              };
            }),
            criticalPath: graph.criticalPath.map((id, index) => {
              const node = graph.nodes.find((n) => n.id === id);
              return {
                position: index + 1,
                prId: id,
                prNumber: node?.prNumber || 0,
                title: node?.title || '',
              };
            }),
            generatedAt: graph.generatedAt.toISOString(),
          },
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to build dependency graph');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to build graph',
        });
      }
    }
  );

  /**
   * Get impact analysis for a specific PR
   */
  app.get<{ Params: z.infer<typeof workflowParamsSchema> }>(
    '/workflows/:workflowId/impact',
    async (request, reply) => {
      const { workflowId } = workflowParamsSchema.parse(request.params);

      try {
        const impact = await prDependencyGraphService.getImpactAnalysis(workflowId);

        return {
          success: true,
          impact: {
            prId: impact.prId,
            directlyBlocks: impact.directlyBlocks.length,
            transitivelyBlocks: impact.transitivelyBlocks.length,
            blockedBy: impact.blockedBy.length,
            impactScore: Math.round(impact.impactScore),
            mergeOrderPosition: impact.mergeOrderPosition,
            recommendations: impact.recommendations,
            details: {
              directlyBlocksPRs: impact.directlyBlocks,
              transitivelyBlocksPRs: impact.transitivelyBlocks,
              blockedByPRs: impact.blockedBy,
            },
          },
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, workflowId }, 'Failed to get impact analysis');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to analyze impact',
        });
      }
    }
  );

  /**
   * Get optimal merge order for a repository
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/merge-order',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      try {
        const result = await prDependencyGraphService.getMergeOrder(repositoryId);

        return {
          success: true,
          repositoryId,
          hasConflicts: result.hasConflicts,
          conflictDetails: result.conflictDetails,
          mergeOrder: result.order.map((item, index) => ({
            position: index + 1,
            prId: item.prId,
            prNumber: item.prNumber,
            reason: item.reason,
          })),
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to get merge order');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to calculate merge order',
        });
      }
    }
  );

  /**
   * Check if a PR can be merged (no blocking dependencies)
   */
  app.get<{ Params: z.infer<typeof workflowParamsSchema> }>(
    '/workflows/:workflowId/merge-check',
    async (request, reply) => {
      const { workflowId } = workflowParamsSchema.parse(request.params);
      const installationId = parseInt(request.headers['x-installation-id'] as string) || 0;

      try {
        const result = await prDependencyGraphService.checkMergeConflicts(workflowId, installationId);

        return {
          success: true,
          workflowId,
          canMerge: result.canMerge,
          blockers: result.blockers,
          warnings: result.warnings,
          summary: result.canMerge
            ? result.warnings.length > 0
              ? 'Can merge with warnings'
              : 'Ready to merge'
            : `Blocked by ${result.blockers.length} issue(s)`,
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, workflowId }, 'Failed to check merge conflicts');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to check merge',
        });
      }
    }
  );

  /**
   * Simulate merging a PR and see what gets unblocked
   */
  app.post<{ Params: z.infer<typeof workflowParamsSchema> }>(
    '/workflows/:workflowId/simulate-merge',
    async (request, reply) => {
      const { workflowId } = workflowParamsSchema.parse(request.params);

      try {
        const simulation = await prDependencyGraphService.simulateMerge(workflowId);

        return {
          success: true,
          workflowId,
          simulation: {
            unblockedPRs: simulation.unblocked,
            unblockedCount: simulation.unblocked.length,
            newConflicts: simulation.newConflicts,
            newCriticalPathLength: simulation.newCriticalPath.length,
            summary:
              simulation.unblocked.length > 0
                ? `Merging will unblock ${simulation.unblocked.length} PR(s)`
                : 'No PRs will be directly unblocked',
          },
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          throw error;
        }
        logger.error({ error, workflowId }, 'Failed to simulate merge');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to simulate merge',
        });
      }
    }
  );

  /**
   * Get visual representation data for graph rendering
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/dependency-graph/visual',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      try {
        const graph = await prDependencyGraphService.buildGraph(repositoryId);

        // Format for visualization libraries (D3.js, Cytoscape, etc.)
        const visualData = {
          nodes: graph.nodes.map((n) => ({
            id: n.id,
            label: `#${n.prNumber}`,
            title: n.title,
            group: n.riskLevel,
            size: Math.max(10, Math.min(30, n.filesChanged.length)),
            color: {
              low: '#22c55e',
              medium: '#eab308',
              high: '#f97316',
              critical: '#ef4444',
            }[n.riskLevel],
          })),
          edges: graph.edges.map((e, index) => ({
            id: `edge-${index}`,
            from: e.source,
            to: e.target,
            label: e.type.replace('_', ' '),
            width: Math.round(e.strength * 3) + 1,
            dashes: e.type === 'file_conflict',
            color: {
              branch_dependency: '#3b82f6',
              file_conflict: '#ef4444',
              semantic_dependency: '#a855f7',
              explicit: '#6b7280',
            }[e.type],
          })),
          legend: {
            nodeColors: {
              low: 'Low Risk',
              medium: 'Medium Risk',
              high: 'High Risk',
              critical: 'Critical Risk',
            },
            edgeTypes: {
              branch_dependency: 'Branch Dependency',
              file_conflict: 'File Conflict',
              semantic_dependency: 'Semantic Overlap',
              explicit: 'Explicit Dependency',
            },
          },
        };

        return {
          success: true,
          repositoryId,
          visualData,
          generatedAt: graph.generatedAt.toISOString(),
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to generate visual data');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to generate visual data',
        });
      }
    }
  );

  logger.info('PR dependency graph routes registered');
}
