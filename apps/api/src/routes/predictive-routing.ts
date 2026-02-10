import { FastifyPluginAsync } from 'fastify';
import { predictiveRoutingService } from '../services/predictive-routing.js';
import { logger } from '../lib/logger.js';

/**
 * Predictive Review Routing routes
 */
export const predictiveRoutingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Route a PR to reviewers
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      filesChanged: string[];
      prAuthor: string;
      teamMembers: string[];
      requiredReviewerCount?: number;
    };
  }>('/route', async (request, reply) => {
    try {
      const decision = await predictiveRoutingService.routePR(request.body);

      return reply.send({ success: true, decision });
    } catch (error) {
      logger.error({ error }, 'Failed to route PR');
      return reply.status(500).send({ success: false, error: 'Failed to route PR' });
    }
  });

  /**
   * Get reviewer capacity
   */
  fastify.get<{
    Params: { login: string };
  }>('/capacity/:login', async (request, reply) => {
    try {
      const capacity = await predictiveRoutingService.getReviewerCapacity(request.params.login);

      return reply.send({ success: true, capacity });
    } catch (error) {
      logger.error({ error }, 'Failed to get reviewer capacity');
      return reply.status(500).send({ success: false, error: 'Failed to get capacity' });
    }
  });

  /**
   * Get team load distribution
   */
  fastify.post<{
    Body: { teamMembers: string[]; periodDays?: number };
  }>('/team-load', async (request, reply) => {
    try {
      const distribution = await predictiveRoutingService.getTeamLoadDistribution(request.body);

      return reply.send({ success: true, distribution });
    } catch (error) {
      logger.error({ error }, 'Failed to get team load distribution');
      return reply.status(500).send({ success: false, error: 'Failed to get team load' });
    }
  });

  /**
   * Get routing model metrics
   */
  fastify.get('/model/metrics', async (request, reply) => {
    try {
      const metrics = await predictiveRoutingService.getModelMetrics();

      return reply.send({ success: true, metrics });
    } catch (error) {
      logger.error({ error }, 'Failed to get model metrics');
      return reply.status(500).send({ success: false, error: 'Failed to get model metrics' });
    }
  });
};
