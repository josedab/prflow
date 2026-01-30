import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { teamVelocityDashboardService } from '../services/team-velocity-dashboard.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

export async function teamVelocityRoutes(fastify: FastifyInstance) {
  /**
   * Get full velocity dashboard for a team
   */
  fastify.get<{
    Params: { teamId: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>('/teams/:teamId/velocity/dashboard', {
    schema: {
      params: z.object({
        teamId: z.string(),
      }),
      querystring: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { teamId } = request.params;
    const { startDate, endDate } = request.query;

    // Default to last 30 days
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      const dashboard = await teamVelocityDashboardService.getVelocityDashboard(teamId, start, end);

      return reply.send({
        success: true,
        dashboard,
      });
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to get velocity dashboard');
      return reply.status(500).send({ error: 'Failed to get dashboard' });
    }
  });

  /**
   * Get DORA metrics for a team
   */
  fastify.get<{
    Params: { teamId: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>('/teams/:teamId/velocity/dora', {
    schema: {
      params: z.object({
        teamId: z.string(),
      }),
      querystring: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { teamId } = request.params;
    const { startDate, endDate } = request.query;

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      // Get team to find repository IDs
      const { db } = await import('@prflow/db');
      const team = await db.team.findUnique({
        where: { id: teamId },
        include: { organization: { include: { repositories: true } } },
      });

      if (!team) {
        throw new NotFoundError('Team', teamId);
      }

      const repositoryIds = team.organization?.repositories.map(r => r.id) || [];
      const dora = await teamVelocityDashboardService.calculateDORAMetrics(repositoryIds, start, end);

      return {
        success: true,
        teamId,
        period: { start, end },
        dora,
      };
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to get DORA metrics');
      throw error;
    }
  });

  /**
   * Get velocity metrics for a team
   */
  fastify.get<{
    Params: { teamId: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>('/teams/:teamId/velocity/metrics', {
    schema: {
      params: z.object({
        teamId: z.string(),
      }),
      querystring: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { teamId } = request.params;
    const { startDate, endDate } = request.query;

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      const { db } = await import('@prflow/db');
      const team = await db.team.findUnique({
        where: { id: teamId },
        include: { organization: { include: { repositories: true } } },
      });

      if (!team) {
        throw new NotFoundError('Team', teamId);
      }

      const repositoryIds = team.organization?.repositories.map(r => r.id) || [];
      const velocity = await teamVelocityDashboardService.calculateVelocityMetrics(repositoryIds, start, end);

      return {
        success: true,
        teamId,
        period: { start, end },
        velocity,
      };
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to get velocity metrics');
      throw error;
    }
  });

  /**
   * Get team health score
   */
  fastify.get<{
    Params: { teamId: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
    };
  }>('/teams/:teamId/velocity/health', {
    schema: {
      params: z.object({
        teamId: z.string(),
      }),
      querystring: z.object({
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { teamId } = request.params;
    const { startDate, endDate } = request.query;

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    try {
      const { db } = await import('@prflow/db');
      const team = await db.team.findUnique({
        where: { id: teamId },
        include: { organization: { include: { repositories: true } } },
      });

      if (!team) {
        throw new NotFoundError('Team', teamId);
      }

      const repositoryIds = team.organization?.repositories.map(r => r.id) || [];
      const healthScore = await teamVelocityDashboardService.calculateHealthScore(repositoryIds, start, end);

      return {
        success: true,
        teamId,
        period: { start, end },
        healthScore,
      };
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to get health score');
      throw error;
    }
  });

  /**
   * Get team goals
   */
  fastify.get<{
    Params: { teamId: string };
  }>('/teams/:teamId/velocity/goals', {
    schema: {
      params: z.object({
        teamId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { teamId } = request.params;

    try {
      const goals = await teamVelocityDashboardService.getTeamGoals(teamId);

      return reply.send({
        success: true,
        teamId,
        goals,
      });
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to get team goals');
      return reply.status(500).send({ error: 'Failed to get goals' });
    }
  });

  /**
   * Set a team goal
   */
  fastify.post<{
    Params: { teamId: string };
    Body: {
      metric: string;
      target: number;
      deadline?: string;
    };
  }>('/teams/:teamId/velocity/goals', {
    schema: {
      params: z.object({
        teamId: z.string(),
      }),
      body: z.object({
        metric: z.string(),
        target: z.number(),
        deadline: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { teamId } = request.params;
    const { metric, target, deadline } = request.body;

    try {
      const goal = await teamVelocityDashboardService.setTeamGoal(
        teamId,
        metric,
        target,
        deadline ? new Date(deadline) : undefined
      );

      return reply.status(201).send({
        success: true,
        goal,
      });
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to set team goal');
      return reply.status(500).send({ error: 'Failed to set goal' });
    }
  });

  /**
   * Compare team performance to benchmarks
   */
  fastify.get<{
    Params: { teamId: string };
  }>('/teams/:teamId/velocity/benchmarks', {
    schema: {
      params: z.object({
        teamId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { teamId } = request.params;

    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      const { db } = await import('@prflow/db');
      const team = await db.team.findUnique({
        where: { id: teamId },
        include: { organization: { include: { repositories: true } } },
      });

      if (!team) {
        throw new NotFoundError('Team', teamId);
      }

      const repositoryIds = team.organization?.repositories.map(r => r.id) || [];
      const dora = await teamVelocityDashboardService.calculateDORAMetrics(repositoryIds, start, end);

      // Industry benchmarks based on DORA research
      const benchmarks = [
        {
          metric: 'Deployment Frequency',
          value: dora.deploymentFrequency.value,
          eliteThreshold: 7, // per day
          highThreshold: 1,
          mediumThreshold: 0.25,
          rating: dora.deploymentFrequency.rating,
        },
        {
          metric: 'Lead Time for Changes',
          value: dora.leadTimeForChanges.value,
          eliteThreshold: 24, // hours
          highThreshold: 168,
          mediumThreshold: 720,
          rating: dora.leadTimeForChanges.rating,
        },
        {
          metric: 'Change Failure Rate',
          value: dora.changeFailureRate.value,
          eliteThreshold: 15, // percentage
          highThreshold: 30,
          mediumThreshold: 45,
          rating: dora.changeFailureRate.rating,
        },
        {
          metric: 'Mean Time to Recovery',
          value: dora.meanTimeToRecovery.value,
          eliteThreshold: 1, // hours
          highThreshold: 24,
          mediumThreshold: 168,
          rating: dora.meanTimeToRecovery.rating,
        },
      ];

      return {
        success: true,
        teamId,
        benchmarks,
        overallRating: calculateOverallRating(dora),
      };
    } catch (error) {
      logger.error({ error, teamId }, 'Failed to get benchmarks');
      throw error;
    }
  });

  logger.info('Team velocity dashboard routes registered');
}

function calculateOverallRating(dora: Awaited<ReturnType<typeof teamVelocityDashboardService.calculateDORAMetrics>>): string {
  const ratings = [
    dora.deploymentFrequency.rating,
    dora.leadTimeForChanges.rating,
    dora.changeFailureRate.rating,
    dora.meanTimeToRecovery.rating,
  ];

  const scores = ratings.map(r => {
    switch (r) {
      case 'elite': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
    }
  });

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (avg >= 3.5) return 'elite';
  if (avg >= 2.5) return 'high';
  if (avg >= 1.5) return 'medium';
  return 'low';
}
