/**
 * @fileoverview Enhanced PR Decomposition Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prDecompositionEnhancedService } from '../services/pr-decomposition-enhanced.js';

const analyzeSchema = z.object({
  prNumber: z.number(),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
      patch: z.string().optional(),
      status: z.string().default('modified'),
    })
  ),
});

const executeSplitSchema = z.object({
  prNumber: z.number(),
  plan: z.any(),
  owner: z.string(),
  repo: z.string(),
});

export async function prDecompositionEnhancedRoutes(app: FastifyInstance) {
  // Analyze a PR for decomposition
  app.post<{ Body: z.infer<typeof analyzeSchema> }>('/analyze', async (request) => {
    const data = analyzeSchema.parse(request.body);
    return prDecompositionEnhancedService.analyze(data.prNumber, data.files);
  });

  // Check if decomposition should be suggested
  app.post<{ Body: { files: Array<{ path: string; additions: number; deletions: number }> } }>(
    '/should-split',
    async (request) => {
      const should = prDecompositionEnhancedService.shouldSuggestDecomposition(
        request.body.files.map((f) => ({ ...f, status: 'modified' }))
      );
      return { shouldSplit: should, thresholds: prDecompositionEnhancedService.getThresholds() };
    }
  );

  // Execute a split plan
  app.post<{ Body: z.infer<typeof executeSplitSchema> }>('/execute', async (request) => {
    const data = executeSplitSchema.parse(request.body);
    return prDecompositionEnhancedService.executeSplit(
      data.prNumber,
      data.plan,
      data.owner,
      data.repo
    );
  });

  // Get execution status
  app.get<{ Params: { executionId: string } }>(
    '/executions/:executionId',
    async (request, reply) => {
      const execution = prDecompositionEnhancedService.getExecution(request.params.executionId);
      if (!execution) {
        reply.status(404);
        return { error: 'Execution not found' };
      }
      return execution;
    }
  );

  // Get/update thresholds
  app.get('/thresholds', async () => {
    return prDecompositionEnhancedService.getThresholds();
  });

  app.put<{ Body: Record<string, unknown> }>('/thresholds', async (request) => {
    return prDecompositionEnhancedService.updateThresholds(request.body as any);
  });
}
