import { FastifyPluginAsync } from 'fastify';
import { crossRepoImpactService } from '../services/cross-repo-impact.js';
import { logger } from '../lib/logger.js';
import type { CrossRepoDependencyGraph } from '@prflow/core';

/**
 * Cross-Repository Impact Analysis routes
 */
export const crossRepoImpactRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Analyze cross-repo impact of a PR
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      includeTransitive?: boolean;
      maxDepth?: number;
    };
  }>('/api/cross-repo/analyze', async (request, reply) => {
    try {
      const analysis = await crossRepoImpactService.analyzeImpact(request.body);

      return reply.send({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze cross-repo impact');
      return reply.status(500).send({
        success: false,
        error: 'Failed to analyze cross-repo impact',
      });
    }
  });

  /**
   * Get impact analysis for a PR
   */
  fastify.get<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/api/cross-repo/impact/:owner/:repo/:prNumber', async (request, reply) => {
    try {
      const analysis = await crossRepoImpactService.analyzeImpact({
        owner: request.params.owner,
        repo: request.params.repo,
        prNumber: parseInt(request.params.prNumber, 10),
      });

      return reply.send({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get impact analysis');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get impact analysis',
      });
    }
  });

  /**
   * Get blast radius summary
   */
  fastify.get<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/api/cross-repo/blast-radius/:owner/:repo/:prNumber', async (request, reply) => {
    try {
      const analysis = await crossRepoImpactService.analyzeImpact({
        owner: request.params.owner,
        repo: request.params.repo,
        prNumber: parseInt(request.params.prNumber, 10),
        includeTransitive: true,
      });

      return reply.send({
        success: true,
        blastRadius: analysis.blastRadius,
        riskAssessment: analysis.riskAssessment,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get blast radius');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get blast radius',
      });
    }
  });

  /**
   * Build dependency graph for an organization
   */
  fastify.post<{
    Body: {
      organization: string;
      repositories?: string[];
    };
  }>('/api/cross-repo/graph/build', async (request, reply) => {
    try {
      const graph: CrossRepoDependencyGraph = await crossRepoImpactService.buildOrganizationGraph(
        request.body.organization
      );

      return reply.send({
        success: true,
        graph: {
          id: graph.id,
          organization: graph.organization,
          stats: graph.stats,
          builtAt: graph.builtAt,
          buildDurationMs: graph.buildDurationMs,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to build dependency graph');
      return reply.status(500).send({
        success: false,
        error: 'Failed to build dependency graph',
      });
    }
  });

  /**
   * Get impact alerts
   */
  fastify.get<{
    Querystring: {
      repository?: string;
      severity?: string;
      status?: string;
      limit?: number;
    };
  }>('/api/cross-repo/alerts', async (request, reply) => {
    try {
      const alerts = await crossRepoImpactService.getAlerts({
        repository: request.query.repository,
        severity: request.query.severity?.split(','),
        status: request.query.status?.split(','),
        limit: request.query.limit,
      });

      return reply.send({
        success: true,
        alerts,
        total: alerts.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get alerts');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get alerts',
      });
    }
  });

  /**
   * Acknowledge an alert
   */
  fastify.post<{
    Params: { alertId: string };
  }>('/api/cross-repo/alerts/:alertId/acknowledge', async (request, reply) => {
    try {
      const userId = (request as { userId?: string }).userId || 'anonymous';

      await crossRepoImpactService.acknowledgeAlert(
        request.params.alertId,
        userId
      );

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to acknowledge alert');
      return reply.status(500).send({
        success: false,
        error: 'Failed to acknowledge alert',
      });
    }
  });
};
