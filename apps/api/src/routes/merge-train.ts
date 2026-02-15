/**
 * @fileoverview Intelligent Merge Train Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mergeTrainService } from '../services/merge-train.js';

const enqueueSchema = z.object({
  repositoryId: z.string(),
  number: z.number(),
  title: z.string(),
  author: z.string(),
  priority: z.number().optional(),
  changedFiles: z.array(z.string()).optional(),
});

export async function mergeTrainRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof enqueueSchema> }>('/enqueue', async (request) => {
    const data = enqueueSchema.parse(request.body);
    return mergeTrainService.enqueue(data.repositoryId, data);
  });

  app.delete<{ Params: { repositoryId: string; entryId: string } }>(
    '/:repositoryId/entry/:entryId',
    async (request) => {
      return {
        removed: mergeTrainService.dequeue(request.params.repositoryId, request.params.entryId),
      };
    }
  );

  app.post<{ Params: { repositoryId: string } }>('/:repositoryId/batch', async (request) => {
    const batch = mergeTrainService.createBatch(request.params.repositoryId);
    if (!batch) return { error: 'No entries to batch' };
    return batch;
  });

  app.post<{ Params: { batchId: string }; Body: { passed: boolean; failedPR?: number } }>(
    '/batch/:batchId/result',
    async (request) => {
      mergeTrainService.recordBatchResult(
        request.params.batchId,
        request.body.passed,
        request.body.failedPR
      );
      return { success: true };
    }
  );

  app.get<{ Params: { repositoryId: string } }>('/:repositoryId/state', async (request) => {
    return mergeTrainService.getState(request.params.repositoryId);
  });

  app.get<{ Params: { repositoryId: string }; Querystring: { start?: string; end?: string } }>(
    '/:repositoryId/metrics',
    async (request) => {
      const start = request.query.start
        ? new Date(request.query.start)
        : new Date(Date.now() - 30 * 86400000);
      const end = request.query.end ? new Date(request.query.end) : new Date();
      return mergeTrainService.getMetrics(request.params.repositoryId, start, end);
    }
  );

  app.get('/config', async () => {
    return mergeTrainService.getConfig();
  });

  app.put<{ Body: Partial<import('@prflow/core').MergeTrainConfig> }>(
    '/config',
    async (request) => {
      return mergeTrainService.updateConfig(request.body);
    }
  );
}
