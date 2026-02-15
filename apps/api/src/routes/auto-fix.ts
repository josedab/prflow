/**
 * @fileoverview Auto-Fix Pipeline Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { autoFixService } from '../services/auto-fix-pipeline.js';

const generateFixSchema = z.object({
  issueId: z.string(),
  rule: z.string(),
  filePath: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  originalCode: z.string(),
  category: z.string(),
});

const createBatchSchema = z.object({
  workflowId: z.string(),
  repositoryId: z.string(),
  pullRequestNumber: z.number(),
  fixIds: z.array(z.string()),
});

export async function autoFixRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof generateFixSchema> }>('/generate', async (request) => {
    const data = generateFixSchema.parse(request.body);
    return autoFixService.generateFix(data);
  });

  app.post<{ Params: { fixId: string } }>('/validate/:fixId', async (request) => {
    return autoFixService.validateFix(request.params.fixId);
  });

  app.post<{ Body: z.infer<typeof createBatchSchema> }>('/batch', async (request) => {
    const data = createBatchSchema.parse(request.body);
    return autoFixService.createBatch(
      data.workflowId,
      data.repositoryId,
      data.pullRequestNumber,
      data.fixIds
    );
  });

  app.post<{ Params: { batchId: string } }>('/batch/:batchId/validate', async (request) => {
    return autoFixService.validateBatch(request.params.batchId);
  });

  app.post<{ Params: { batchId: string }; Body: { baseBranch: string } }>(
    '/batch/:batchId/create-pr',
    async (request) => {
      const pr = autoFixService.createAutoFixPR(request.params.batchId, request.body.baseBranch);
      if (!pr) return { error: 'Batch not ready or not found' };
      return pr;
    }
  );

  app.get<{ Params: { batchId: string } }>('/batch/:batchId', async (request) => {
    const batch = autoFixService.getBatch(request.params.batchId);
    if (!batch) return { error: 'Batch not found' };
    return batch;
  });

  app.get('/config', async () => {
    return autoFixService.getConfig();
  });

  app.put<{ Body: Partial<import('@prflow/core').FixPipelineConfig> }>(
    '/config',
    async (request) => {
      return autoFixService.updateConfig(request.body);
    }
  );

  app.get<{ Params: { orgId: string } }>('/stats/:orgId', async (request) => {
    return autoFixService.getStats(request.params.orgId);
  });
}
