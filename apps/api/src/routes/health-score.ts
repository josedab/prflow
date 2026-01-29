import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { healthScoreService } from '../services/health-score.js';
import { NotFoundError } from '../lib/errors.js';

const getPRHealthParamsSchema = z.object({
  workflowId: z.string(),
});

const getTeamHealthParamsSchema = z.object({
  repositoryId: z.string(),
});

const getTeamHealthQuerySchema = z.object({
  days: z.coerce.number().min(7).max(365).default(30),
});

const getTrendQuerySchema = z.object({
  days: z.coerce.number().min(7).max(365).default(90),
});

const listHealthScoresQuerySchema = z.object({
  repositoryId: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function healthScoreRoutes(app: FastifyInstance) {
  // Calculate and get PR health score
  app.get<{ Params: z.infer<typeof getPRHealthParamsSchema> }>(
    '/pr/:workflowId',
    async (request) => {
      const params = getPRHealthParamsSchema.parse(request.params);

      const healthScore = await healthScoreService.calculatePRHealthScore(params.workflowId);
      return healthScore;
    }
  );

  // Get cached PR health score (without recalculating)
  app.get<{ Params: z.infer<typeof getPRHealthParamsSchema> }>(
    '/pr/:workflowId/cached',
    async (request) => {
      const params = getPRHealthParamsSchema.parse(request.params);

      const cached = await db.pRHealthScore.findUnique({
        where: { workflowId: params.workflowId },
      });

      if (!cached) {
        throw new NotFoundError('Health score', params.workflowId);
      }

      return {
        workflowId: cached.workflowId,
        prNumber: cached.prNumber,
        overallScore: cached.overallScore,
        factors: {
          reviewLatencyScore: cached.reviewLatencyScore,
          commentDensityScore: cached.commentDensityScore,
          approvalVelocityScore: cached.approvalVelocityScore,
          riskScore: cached.riskScore,
          testCoverageScore: cached.testCoverageScore,
        },
        reviewLatencyMinutes: cached.reviewLatencyMinutes,
        commentCount: cached.commentCount,
        approvalCount: cached.approvalCount,
        changeRequestCount: cached.changeRequestCount,
        predictedMergeDate: cached.predictedMergeDate,
        blockers: cached.blockers,
        recommendations: cached.recommendations,
        calculatedAt: cached.calculatedAt,
      };
    }
  );

  // Get PR health score history
  app.get<{ Params: z.infer<typeof getPRHealthParamsSchema> }>(
    '/pr/:workflowId/history',
    async (request) => {
      const params = getPRHealthParamsSchema.parse(request.params);

      const history = await healthScoreService.getHealthScoreHistory(params.workflowId);

      if (history.length === 0) {
        throw new NotFoundError('Health score history', params.workflowId);
      }

      return { workflowId: params.workflowId, history };
    }
  );

  // Calculate and get team health summary
  app.get<{
    Params: z.infer<typeof getTeamHealthParamsSchema>;
    Querystring: z.infer<typeof getTeamHealthQuerySchema>;
  }>(
    '/team/:repositoryId',
    async (request) => {
      const params = getTeamHealthParamsSchema.parse(request.params);
      const query = getTeamHealthQuerySchema.parse(request.query);

      const teamHealth = await healthScoreService.calculateTeamHealth(params.repositoryId, query.days);
      return teamHealth;
    }
  );

  // Get repository health trend over time
  app.get<{
    Params: z.infer<typeof getTeamHealthParamsSchema>;
    Querystring: z.infer<typeof getTrendQuerySchema>;
  }>(
    '/team/:repositoryId/trend',
    async (request) => {
      const params = getTeamHealthParamsSchema.parse(request.params);
      const query = getTrendQuerySchema.parse(request.query);

      const trend = await healthScoreService.getRepositoryHealthTrend(params.repositoryId, query.days);

      return {
        repositoryId: params.repositoryId,
        days: query.days,
        trend,
      };
    }
  );

  // List health scores with filtering
  app.get<{ Querystring: z.infer<typeof listHealthScoresQuerySchema> }>(
    '/scores',
    async (request) => {
      const query = listHealthScoresQuerySchema.parse(request.query);

      const where: Record<string, unknown> = {};

      if (query.repositoryId) {
        where.repositoryId = query.repositoryId;
      }

      if (query.minScore !== undefined || query.maxScore !== undefined) {
        where.overallScore = {};
        if (query.minScore !== undefined) {
          (where.overallScore as Record<string, number>).gte = query.minScore;
        }
        if (query.maxScore !== undefined) {
          (where.overallScore as Record<string, number>).lte = query.maxScore;
        }
      }

      const [scores, total] = await Promise.all([
        db.pRHealthScore.findMany({
          where,
          orderBy: { calculatedAt: 'desc' },
          take: query.limit,
          skip: query.offset,
        }),
        db.pRHealthScore.count({ where }),
      ]);

      return {
        data: scores.map((s) => ({
          workflowId: s.workflowId,
          prNumber: s.prNumber,
          overallScore: s.overallScore,
          factors: {
            reviewLatencyScore: s.reviewLatencyScore,
            commentDensityScore: s.commentDensityScore,
            approvalVelocityScore: s.approvalVelocityScore,
            riskScore: s.riskScore,
            testCoverageScore: s.testCoverageScore,
          },
          blockers: s.blockers,
          calculatedAt: s.calculatedAt,
        })),
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
        },
      };
    }
  );

  // Get dashboard summary for a repository
  app.get<{ Params: z.infer<typeof getTeamHealthParamsSchema> }>(
    '/dashboard/:repositoryId',
    async (request) => {
      const params = getTeamHealthParamsSchema.parse(request.params);

      // Get recent PRs with health scores
      const recentPRs = await db.pRHealthScore.findMany({
        where: { repositoryId: params.repositoryId },
        orderBy: { calculatedAt: 'desc' },
        take: 10,
      });

      // Get team health
      const teamHealth = await healthScoreService.calculateTeamHealth(params.repositoryId, 30);

      // Get trend
      const trend = await healthScoreService.getRepositoryHealthTrend(params.repositoryId, 30);

      // Calculate summary stats
      const avgScore = recentPRs.length > 0
        ? recentPRs.reduce((sum, pr) => sum + pr.overallScore, 0) / recentPRs.length
        : 0;

      const healthyPRs = recentPRs.filter((pr) => pr.overallScore >= 70).length;
      const atRiskPRs = recentPRs.filter((pr) => pr.overallScore < 50).length;

      // Get score distribution
      const scoreDistribution = {
        excellent: recentPRs.filter((pr) => pr.overallScore >= 90).length,
        good: recentPRs.filter((pr) => pr.overallScore >= 70 && pr.overallScore < 90).length,
        fair: recentPRs.filter((pr) => pr.overallScore >= 50 && pr.overallScore < 70).length,
        poor: recentPRs.filter((pr) => pr.overallScore < 50).length,
      };

      return {
        repositoryId: params.repositoryId,
        summary: {
          avgScore: Math.round(avgScore * 100) / 100,
          totalPRs: recentPRs.length,
          healthyPRs,
          atRiskPRs,
          scoreDistribution,
        },
        teamHealth: {
          throughputScore: teamHealth.throughputScore,
          qualityScore: teamHealth.qualityScore,
          velocityScore: teamHealth.velocityScore,
          avgCycleTimeHours: teamHealth.avgCycleTimeHours,
          avgReviewLatencyMinutes: teamHealth.avgReviewLatencyMinutes,
          trends: teamHealth.trends,
        },
        topBlockers: teamHealth.topBlockers,
        recentPRs: recentPRs.map((pr) => ({
          workflowId: pr.workflowId,
          prNumber: pr.prNumber,
          score: pr.overallScore,
          blockers: pr.blockers.length,
          calculatedAt: pr.calculatedAt,
        })),
        trendData: trend,
      };
    }
  );

  // Get health insights for a specific time range
  app.get<{
    Params: z.infer<typeof getTeamHealthParamsSchema>;
  }>(
    '/insights/:repositoryId',
    async (request) => {
      const params = getTeamHealthParamsSchema.parse(request.params);

      // Get metrics for different time periods
      const [daily, weekly, monthly] = await Promise.all([
        healthScoreService.calculateTeamHealth(params.repositoryId, 1),
        healthScoreService.calculateTeamHealth(params.repositoryId, 7),
        healthScoreService.calculateTeamHealth(params.repositoryId, 30),
      ]);

      // Generate insights based on comparisons
      const insights: string[] = [];

      if (weekly.avgReviewLatencyMinutes > monthly.avgReviewLatencyMinutes * 1.2) {
        insights.push('Review latency has increased 20%+ this week compared to monthly average');
      } else if (weekly.avgReviewLatencyMinutes < monthly.avgReviewLatencyMinutes * 0.8) {
        insights.push('Great job! Review latency improved 20%+ this week');
      }

      if (weekly.qualityScore < monthly.qualityScore - 10) {
        insights.push('Code quality score dropped this week - consider focusing on code reviews');
      }

      if (weekly.throughputScore > monthly.throughputScore + 10) {
        insights.push('Team velocity is up! Throughput improved this week');
      }

      if (daily.topBlockers.length > 0) {
        insights.push(`Today's top blocker: ${daily.topBlockers[0]}`);
      }

      if (insights.length === 0) {
        insights.push('Team metrics are stable and healthy');
      }

      return {
        repositoryId: params.repositoryId,
        insights,
        comparison: {
          daily: {
            throughput: daily.throughputScore,
            quality: daily.qualityScore,
            velocity: daily.velocityScore,
          },
          weekly: {
            throughput: weekly.throughputScore,
            quality: weekly.qualityScore,
            velocity: weekly.velocityScore,
          },
          monthly: {
            throughput: monthly.throughputScore,
            quality: monthly.qualityScore,
            velocity: monthly.velocityScore,
          },
        },
      };
    }
  );
}
