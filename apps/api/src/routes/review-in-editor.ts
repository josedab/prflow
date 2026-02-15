/**
 * @fileoverview Review-in-Editor / LSP Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reviewInEditorService } from '../services/review-in-editor.js';

const analyzeSchema = z.object({
  filePath: z.string(),
  content: z.string(),
  languageId: z.string().optional().default('unknown'),
  version: z.number().optional().default(1),
  repositoryId: z.string().optional(),
});

const batchAnalyzeSchema = z.object({
  files: z.array(analyzeSchema),
});

export async function reviewInEditorRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof analyzeSchema> }>('/analyze', async (request) => {
    const data = analyzeSchema.parse(request.body);
    return reviewInEditorService.analyze(data);
  });

  app.post<{ Body: z.infer<typeof batchAnalyzeSchema> }>('/analyze/batch', async (request) => {
    const { files } = batchAnalyzeSchema.parse(request.body);
    return reviewInEditorService.batchAnalyze(files);
  });

  app.post<{ Body: { filePath: string; content: string } }>('/preflight', async (request) => {
    return reviewInEditorService.preflight(request.body.filePath, request.body.content);
  });

  app.get('/stats', async () => {
    return reviewInEditorService.getStats();
  });

  app.post('/fix-applied', async () => {
    reviewInEditorService.recordFixApplied();
    return { success: true };
  });

  app.get('/config', async () => {
    return reviewInEditorService.getConfig();
  });

  app.put<{ Body: Partial<import('@prflow/core').LSPServerConfig> }>('/config', async (request) => {
    return reviewInEditorService.updateConfig(request.body);
  });
}
