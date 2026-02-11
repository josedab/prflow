import { FastifyPluginAsync } from 'fastify';
import { crossRepoGraphService } from '../services/cross-repo-graph.js';
import { logger } from '../lib/logger.js';

/**
 * Cross-Repository Impact Graph routes
 */
export const crossRepoGraphRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Build dependency graph for an organization
   */
  fastify.post<{
    Body: { organization: string };
  }>('/graph/build', async (request, reply) => {
    try {
      const health = await crossRepoGraphService.buildGraph(request.body.organization);

      return reply.send({ success: true, health });
    } catch (error) {
      logger.error({ error }, 'Failed to build dependency graph');
      return reply.status(500).send({ success: false, error: 'Failed to build graph' });
    }
  });

  /**
   * Get graph health status
   */
  fastify.get<{
    Params: { organization: string };
  }>('/graph/:organization/health', async (request, reply) => {
    try {
      const health = await crossRepoGraphService.getGraphHealth(request.params.organization);

      return reply.send({ success: true, health });
    } catch (error) {
      logger.error({ error }, 'Failed to get graph health');
      return reply.status(500).send({ success: false, error: 'Failed to get graph health' });
    }
  });

  /**
   * Propagate impact from a PR
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      changedFiles: string[];
      maxDepth?: number;
    };
  }>('/impact/propagate', async (request, reply) => {
    try {
      const propagation = await crossRepoGraphService.propagateImpact(request.body);

      return reply.send({ success: true, propagation });
    } catch (error) {
      logger.error({ error }, 'Failed to propagate impact');
      return reply.status(500).send({ success: false, error: 'Failed to propagate impact' });
    }
  });

  /**
   * Get blast radius visualization
   */
  fastify.get<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/impact/blast-radius/:owner/:repo/:prNumber', async (request, reply) => {
    try {
      const blastRadius = await crossRepoGraphService.getBlastRadius({
        owner: request.params.owner,
        repo: request.params.repo,
        prNumber: parseInt(request.params.prNumber, 10),
      });

      return reply.send({ success: true, blastRadius });
    } catch (error) {
      logger.error({ error }, 'Failed to get blast radius');
      return reply.status(500).send({ success: false, error: 'Failed to get blast radius' });
    }
  });

  /**
   * Send impact notifications
   */
  fastify.post<{
    Body: {
      propagationId: string;
      impacts: Array<{
        repository: string;
        severity: string;
        description: string;
        teamOwners: string[];
        affectedFiles: string[];
        depth: number;
        impactType: string;
        suggestedActions: string[];
      }>;
    };
  }>('/impact/notify', async (request, reply) => {
    try {
      const notifications = await crossRepoGraphService.sendNotifications(
        request.body.propagationId,
        request.body.impacts as Parameters<typeof crossRepoGraphService.sendNotifications>[1]
      );

      return reply.send({ success: true, notifications, total: notifications.length });
    } catch (error) {
      logger.error({ error }, 'Failed to send notifications');
      return reply.status(500).send({ success: false, error: 'Failed to send notifications' });
    }
  });

  /**
   * Get notifications
   */
  fastify.get<{
    Querystring: { repository?: string; status?: string; limit?: number };
  }>('/impact/notifications', async (request, reply) => {
    try {
      const notifications = await crossRepoGraphService.getNotifications(request.query);

      return reply.send({ success: true, notifications, total: notifications.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get notifications');
      return reply.status(500).send({ success: false, error: 'Failed to get notifications' });
    }
  });

  /**
   * Acknowledge a notification
   */
  fastify.post<{
    Params: { notificationId: string };
    Body: { userId: string };
  }>('/impact/notifications/:notificationId/acknowledge', async (request, reply) => {
    try {
      await crossRepoGraphService.acknowledgeNotification(
        request.params.notificationId,
        request.body.userId
      );

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to acknowledge notification');
      return reply.status(500).send({ success: false, error: 'Failed to acknowledge' });
    }
  });
};
