import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { batchService } from '../services/batch.js';
import { logger } from '../lib/logger.js';

const batchRetrySchema = z.object({
  workflowIds: z.array(z.string()).min(1).max(100),
});

const batchSettingsSchema = z.object({
  repositoryIds: z.array(z.string()).min(1).max(50),
  settings: z.object({
    reviewEnabled: z.boolean().optional(),
    testGenerationEnabled: z.boolean().optional(),
    docUpdatesEnabled: z.boolean().optional(),
  }),
});

const batchDeleteSchema = z.object({
  workflowIds: z.array(z.string()).min(1).max(100),
});

const batchToggleReviewSchema = z.object({
  repositoryIds: z.array(z.string()).min(1).max(50),
  enabled: z.boolean(),
});

export async function registerBatchRoutes(app: FastifyInstance) {
  /**
   * POST /api/batch/workflows/retry
   * Retry multiple failed workflows
   */
  app.post(
    '/api/batch/workflows/retry',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = batchRetrySchema.parse(request.body);
      const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id || 'anonymous';

      logger.info({ workflowCount: body.workflowIds.length, userId }, 'Batch retry request');

      const result = await batchService.retryWorkflows(body.workflowIds, userId);

      return reply.status(result.failureCount > 0 ? 207 : 200).send(result);
    }
  );

  /**
   * DELETE /api/batch/workflows
   * Delete multiple completed or failed workflows
   */
  app.delete(
    '/api/batch/workflows',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = batchDeleteSchema.parse(request.body);
      const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id || 'anonymous';

      logger.info({ workflowCount: body.workflowIds.length, userId }, 'Batch delete request');

      const result = await batchService.deleteWorkflows(body.workflowIds, userId);

      return reply.status(result.failureCount > 0 ? 207 : 200).send(result);
    }
  );

  /**
   * PATCH /api/batch/repositories/settings
   * Update settings for multiple repositories
   */
  app.patch(
    '/api/batch/repositories/settings',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = batchSettingsSchema.parse(request.body);
      const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id || 'anonymous';

      logger.info(
        { repositoryCount: body.repositoryIds.length, settings: body.settings, userId },
        'Batch settings update request'
      );

      const result = await batchService.updateRepositorySettings(
        body.repositoryIds,
        body.settings,
        userId
      );

      return reply.status(result.failureCount > 0 ? 207 : 200).send(result);
    }
  );

  /**
   * POST /api/batch/repositories/toggle-review
   * Enable or disable review for multiple repositories
   */
  app.post(
    '/api/batch/repositories/toggle-review',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = batchToggleReviewSchema.parse(request.body);
      const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id || 'anonymous';

      logger.info(
        { repositoryCount: body.repositoryIds.length, enabled: body.enabled, userId },
        'Batch toggle review request'
      );

      const result = await batchService.toggleReview(
        body.repositoryIds,
        body.enabled,
        userId
      );

      return reply.status(result.failureCount > 0 ? 207 : 200).send(result);
    }
  );
}
