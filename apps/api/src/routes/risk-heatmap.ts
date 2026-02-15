/**
 * @fileoverview Risk Heatmap Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { riskHeatmapService } from '../services/risk-heatmap.js';

const generateSchema = z.object({
  workflowId: z.string(),
  prNumber: z.number(),
  diff: z.object({
    files: z.array(
      z.object({
        filename: z.string(),
        status: z.enum([
          'added',
          'removed',
          'modified',
          'renamed',
          'copied',
          'changed',
          'unchanged',
        ]),
        additions: z.number(),
        deletions: z.number(),
        changes: z.number(),
        patch: z.string().optional(),
      })
    ),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
    totalChanges: z.number(),
  }),
  analysis: z.object({
    prNumber: z.number(),
    type: z.string(),
    riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
    changes: z.object({
      filesModified: z.number(),
      linesAdded: z.number(),
      linesRemoved: z.number(),
    }),
    semanticChanges: z.array(z.any()),
    impactRadius: z.object({
      directDependents: z.number(),
      transitiveDependents: z.number(),
      affectedFiles: z.array(z.string()),
      testCoverage: z.number().nullable(),
    }),
    risks: z.array(z.string()),
    suggestedReviewers: z.array(z.any()),
    analyzedAt: z.string().transform((s) => new Date(s)),
    latencyMs: z.number(),
  }),
});

export async function riskHeatmapRoutes(app: FastifyInstance) {
  // Generate risk heatmap for a PR
  app.post<{ Body: z.infer<typeof generateSchema> }>('/generate', async (request) => {
    const data = generateSchema.parse(request.body);
    return riskHeatmapService.generateHeatmap(
      data.workflowId,
      data.prNumber,
      data.diff,
      data.analysis as any
    );
  });
}
