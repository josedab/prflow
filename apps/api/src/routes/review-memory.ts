/**
 * @fileoverview Review Memory Graph Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reviewMemoryService } from '../services/review-memory.js';

const entrySchema = z.object({
  repositoryId: z.string(),
  organizationId: z.string(),
  pullRequestNumber: z.number(),
  rule: z.string(),
  decision: z.enum(['accepted', 'rejected', 'modified', 'deferred']),
  context: z.string(),
  codeSnippet: z.string(),
  filePath: z.string(),
  reasoning: z.string().optional(),
  author: z.string(),
  reviewer: z.string(),
  tags: z.array(z.string()).default([]),
});

const searchSchema = z.object({
  organizationId: z.string(),
  text: z.string().optional(),
  rule: z.string().optional(),
  filePath: z.string().optional(),
  repository: z.string().optional(),
  limit: z.number().optional(),
  minSimilarity: z.number().optional(),
});

export async function reviewMemoryRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof entrySchema> }>('/entries', async (request) => {
    const data = entrySchema.parse(request.body);
    const entry = {
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      timestamp: new Date(),
    };
    reviewMemoryService.addEntry(entry);
    return entry;
  });

  app.post<{ Body: z.infer<typeof searchSchema> }>('/search', async (request) => {
    const query = searchSchema.parse(request.body);
    return reviewMemoryService.search(query);
  });

  app.get<{
    Params: { orgId: string };
    Querystring: { rule: string; context: string; currentPR: string; limit?: string };
  }>('/references/:orgId', async (request) => {
    const { rule, context, currentPR, limit } = request.query;
    return reviewMemoryService.findCrossPRReferences(
      request.params.orgId,
      rule,
      context,
      parseInt(currentPR, 10),
      limit ? parseInt(limit, 10) : 5
    );
  });

  app.get<{ Params: { orgId: string }; Querystring: { limit?: string } }>(
    '/graph/:orgId',
    async (request) => {
      const limit = request.query.limit ? parseInt(request.query.limit, 10) : 100;
      return reviewMemoryService.buildGraph(request.params.orgId, limit);
    }
  );

  app.get<{ Params: { orgId: string } }>('/stats/:orgId', async (request) => {
    return reviewMemoryService.getStats(request.params.orgId);
  });
}
