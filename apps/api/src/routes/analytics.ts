import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { analyticsService } from '../services/analytics.js';
import { NotFoundError } from '../lib/errors.js';

const metricsQuerySchema = z.object({
  repositoryIds: z.string().transform((s) => s.split(',')),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
});

const trendsQuerySchema = metricsQuerySchema.extend({
  metric: z.enum(['prs', 'issues', 'tests']),
  interval: z.enum(['day', 'week', 'month']).optional(),
});

const exportQuerySchema = metricsQuerySchema.extend({
  format: z.enum(['json', 'csv']).optional(),
});

export async function analyticsRoutes(app: FastifyInstance) {
  // Get team metrics
  app.get<{ Querystring: z.infer<typeof metricsQuerySchema> }>(
    '/metrics',
    async (request) => {
      const query = metricsQuerySchema.parse(request.query);

      const metrics = await analyticsService.getTeamMetrics(
        query.repositoryIds,
        query.startDate,
        query.endDate
      );

      return metrics;
    }
  );

  // Get PR-specific metrics
  app.get<{ Params: { workflowId: string } }>(
    '/workflows/:workflowId/metrics',
    async (request) => {
      const { workflowId } = request.params;

      const metrics = await analyticsService.getPRMetrics(workflowId);

      if (!metrics) {
        throw new NotFoundError('Workflow', workflowId);
      }

      return metrics;
    }
  );

  // Get trends
  app.get<{ Querystring: z.infer<typeof trendsQuerySchema> }>(
    '/trends',
    async (request) => {
      const query = trendsQuerySchema.parse(request.query);

      const trends = await analyticsService.getTrends(
        query.repositoryIds,
        query.metric,
        query.startDate,
        query.endDate,
        query.interval
      );

      return trends;
    }
  );

  // Get false positive rate
  app.get<{ Querystring: z.infer<typeof metricsQuerySchema> }>(
    '/false-positive-rate',
    async (request) => {
      const query = metricsQuerySchema.parse(request.query);

      const rate = await analyticsService.getFalsePositiveRate(
        query.repositoryIds,
        query.startDate,
        query.endDate
      );

      return { rate };
    }
  );

  // Export metrics
  app.get<{ Querystring: z.infer<typeof exportQuerySchema> }>(
    '/export',
    async (request, reply) => {
      const query = exportQuerySchema.parse(request.query);

      const data = await analyticsService.exportMetrics(
        query.repositoryIds,
        query.startDate,
        query.endDate,
        query.format
      );

      if (query.format === 'csv') {
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', 'attachment; filename=prflow-metrics.csv');
      }

      return data;
    }
  );
}
