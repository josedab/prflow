import { FastifyPluginAsync } from 'fastify';
import { intelligentSplittingService } from '../services/intelligent-splitting.js';
import { logger } from '../lib/logger.js';

/**
 * Intelligent PR Auto-Splitting routes
 */
export const intelligentSplittingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Analyze a PR for intelligent auto-splitting
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      strategy?: string;
      maxSubPRs?: number;
    };
  }>('/auto-split/analyze', async (request, reply) => {
    try {
      const analysis = await intelligentSplittingService.analyzeForSplit(request.body);

      return reply.send({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze PR for auto-splitting');
      return reply.status(500).send({
        success: false,
        error: 'Failed to analyze PR for auto-splitting',
      });
    }
  });

  /**
   * Execute an auto-split
   */
  fastify.post<{
    Body: {
      analysisId: string;
      owner: string;
      repo: string;
      installationId: number;
      createTrackingIssue?: boolean;
    };
  }>('/auto-split/execute', async (request, reply) => {
    try {
      const result = await intelligentSplittingService.executeSplit(request.body);

      return reply.send({
        ...result,
        success: true,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to execute auto-split');
      return reply.status(500).send({
        success: false,
        error: 'Failed to execute auto-split',
      });
    }
  });

  /**
   * Get split analysis history
   */
  fastify.get<{
    Querystring: { owner: string; repo: string; limit?: number };
  }>('/auto-split/history', async (request, reply) => {
    try {
      const history = await intelligentSplittingService.getSplitHistory({
        owner: request.query.owner,
        repo: request.query.repo,
        limit: request.query.limit,
      });

      return reply.send({
        success: true,
        history,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get split history');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get split history',
      });
    }
  });
};
