/**
 * @fileoverview Cross-PR Impact Graph Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { crossPRGraphService } from '../services/cross-pr-graph.js';

const buildGraphSchema = z.object({
  repositoryId: z.string(),
  openPRs: z.array(
    z.object({
      number: z.number(),
      title: z.string(),
      author: z.string(),
      status: z.enum(['open', 'draft', 'approved', 'changes_requested']),
      files: z.array(
        z.object({
          path: z.string(),
          additions: z.number().default(0),
          deletions: z.number().default(0),
        })
      ),
      createdAt: z.string().transform((s) => new Date(s)),
      riskLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    })
  ),
});

export async function crossPRGraphRoutes(app: FastifyInstance) {
  // Build the cross-PR impact graph
  app.post<{ Body: z.infer<typeof buildGraphSchema> }>('/build', async (request) => {
    const data = buildGraphSchema.parse(request.body);
    return crossPRGraphService.buildGraph(data.repositoryId, data.openPRs);
  });
}
