/**
 * @fileoverview Team Review Insights Dashboard Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { teamReviewInsightsService } from '../services/team-review-insights.js';

const eventSchema = z.object({
  type: z.enum(['created', 'commented', 'approved', 'dismissed', 'merged', 'closed']),
  repositoryId: z.string(),
  organizationId: z.string(),
  pullRequestNumber: z.number(),
  reviewerId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export async function teamReviewInsightsRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof eventSchema> }>('/events', async (request) => {
    const data = eventSchema.parse(request.body);
    teamReviewInsightsService.recordEvent({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      timestamp: new Date(),
    });
    return { success: true };
  });

  app.get<{ Params: { orgId: string } }>('/dashboard/:orgId', async (request) => {
    return teamReviewInsightsService.generateDashboard(request.params.orgId);
  });

  app.get<{ Params: { orgId: string }; Querystring: { start?: string; end?: string } }>(
    '/quality/:orgId',
    async (request) => {
      const start = request.query.start
        ? new Date(request.query.start)
        : new Date(Date.now() - 30 * 86400000);
      const end = request.query.end ? new Date(request.query.end) : new Date();
      return teamReviewInsightsService.getQualityMetrics(request.params.orgId, start, end);
    }
  );

  app.get<{ Params: { orgId: string } }>('/load/:orgId', async (request) => {
    return teamReviewInsightsService.getTeamLoad(request.params.orgId);
  });

  app.get<{ Params: { orgId: string } }>('/rules/:orgId', async (request) => {
    return teamReviewInsightsService.getRuleEffectiveness(request.params.orgId);
  });

  app.get<{ Params: { orgId: string }; Querystring: { start?: string; end?: string } }>(
    '/roi/:orgId',
    async (request) => {
      const start = request.query.start
        ? new Date(request.query.start)
        : new Date(Date.now() - 30 * 86400000);
      const end = request.query.end ? new Date(request.query.end) : new Date();
      return teamReviewInsightsService.getROIMetrics(request.params.orgId, start, end);
    }
  );
}
