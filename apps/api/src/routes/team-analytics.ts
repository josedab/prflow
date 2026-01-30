import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { teamAnalyticsService } from '../services/team-analytics.js';

const dateRangeQuerySchema = z.object({
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  extended: z.string().optional().transform((s) => s === 'true'),
});

const exportQuerySchema = dateRangeQuerySchema.extend({
  format: z.enum(['json', 'csv']).default('json'),
});

export async function teamAnalyticsRoutes(app: FastifyInstance) {
  // Get full team analytics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate,
      query.extended
    );

    return analytics;
  });

  // Get developer productivity metrics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/developers', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate,
      true
    );

    return { developers: analytics.developerProductivity || [] };
  });

  // Get collaboration metrics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/collaboration', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate,
      true
    );

    return analytics.collaboration || { crossTeamReviews: 0, reviewNetworkDensity: 0, knowledgeDistribution: 0, topCollaborators: [], siloPotential: [] };
  });

  // Get code health metrics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/code-health', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate,
      true
    );

    return { repositories: analytics.codeHealth || [] };
  });

  // Get team overview
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/overview', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate
    );

    return analytics.overview;
  });

  // Get cycle time metrics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/cycle-time', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate
    );

    return analytics.cycleTime;
  });

  // Get review metrics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/reviews', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate
    );

    return analytics.reviews;
  });

  // Get throughput metrics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/throughput', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate
    );

    return analytics.throughput;
  });

  // Get quality metrics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/quality', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate
    );

    return analytics.quality;
  });

  // Get bottlenecks
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/bottlenecks', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate
    );

    return { bottlenecks: analytics.bottlenecks };
  });

  // Get benchmarks comparison
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof dateRangeQuerySchema>;
  }>('/:teamId/benchmarks', async (request) => {
    const { teamId } = request.params;
    const query = dateRangeQuerySchema.parse(request.query);

    const analytics = await teamAnalyticsService.getTeamAnalytics(
      teamId,
      query.startDate,
      query.endDate
    );

    return { benchmarks: analytics.benchmarks };
  });

  // Export analytics
  app.get<{
    Params: { teamId: string };
    Querystring: z.infer<typeof exportQuerySchema>;
  }>('/:teamId/export', async (request, reply) => {
    const { teamId } = request.params;
    const query = exportQuerySchema.parse(request.query);

    const data = await teamAnalyticsService.exportAnalytics(
      teamId,
      query.startDate,
      query.endDate,
      query.format
    );

    if (query.format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename=team-analytics-${teamId}.csv`);
    } else {
      reply.header('Content-Type', 'application/json');
    }

    return data;
  });
}
