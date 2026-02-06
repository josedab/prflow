import { FastifyPluginAsync } from 'fastify';
import { db } from '@prflow/db';
import { enhancedReviewDebtService } from '../services/enhanced-review-debt.js';
import { logger } from '../lib/logger.js';

/**
 * Enhanced Review Debt Dashboard routes
 */
export const enhancedReviewDebtRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get stale PRs for a repository
   */
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: { minAgeDays?: number; limit?: number };
  }>('/api/review-debt/stale-prs/:owner/:repo', async (request, reply) => {
    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${request.params.owner}/${request.params.repo}` },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const stalePRs = await enhancedReviewDebtService.getStalePRs(
        repository.id,
        {
          minAgeDays: request.query.minAgeDays,
          limit: request.query.limit,
        }
      );

      return reply.send({
        success: true,
        stalePRs,
        summary: {
          total: stalePRs.length,
          critical: stalePRs.filter(p => p.riskLevel === 'critical').length,
          oldestDays: stalePRs.length > 0 ? stalePRs[0].ageInDays : 0,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get stale PRs');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get stale PRs',
      });
    }
  });

  /**
   * Get reviewer metrics
   */
  fastify.get<{
    Params: { login: string };
    Querystring: { repositoryId?: string; periodDays?: number };
  }>('/api/review-debt/reviewer/:login', async (request, reply) => {
    try {
      const metrics = await enhancedReviewDebtService.getReviewerMetrics(
        request.params.login,
        request.query.repositoryId,
        request.query.periodDays
      );

      return reply.send({
        success: true,
        metrics,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get reviewer metrics');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get reviewer metrics',
      });
    }
  });

  /**
   * Get team debt dashboard
   */
  fastify.get<{
    Params: { teamId: string };
    Querystring: { repositoryIds?: string; periodDays?: number };
  }>('/api/review-debt/team/:teamId/dashboard', async (request, reply) => {
    try {
      const repositoryIds = request.query.repositoryIds?.split(',') || [];

      const dashboard = await enhancedReviewDebtService.getTeamDashboard(
        request.params.teamId,
        repositoryIds,
        request.query.periodDays
      );

      return reply.send({
        success: true,
        dashboard,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get team dashboard');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get team dashboard',
      });
    }
  });

  /**
   * Rebalance reviewer workload
   */
  fastify.post<{
    Body: {
      teamId: string;
      reviewers?: string[];
      strategy?: 'even' | 'by_expertise' | 'by_availability';
      dryRun?: boolean;
    };
  }>('/api/review-debt/rebalance', async (request, reply) => {
    try {
      const result = await enhancedReviewDebtService.rebalanceWorkload({
        teamId: request.body.teamId,
        reviewers: request.body.reviewers || [],
        strategy: request.body.strategy || 'even',
        dryRun: request.body.dryRun,
      });

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to rebalance workload');
      return reply.status(500).send({
        success: false,
        error: 'Failed to rebalance workload',
      });
    }
  });

  /**
   * Create a debt alert
   */
  fastify.post<{
    Body: {
      type: string;
      severity: 'info' | 'warning' | 'critical';
      title: string;
      message: string;
      prNumbers?: number[];
      reviewers?: string[];
    };
  }>('/api/review-debt/alerts', async (request, reply) => {
    try {
      const alert = await enhancedReviewDebtService.createAlert(
        request.body.type,
        request.body.severity,
        request.body.title,
        request.body.message,
        {
          prNumbers: request.body.prNumbers,
          reviewers: request.body.reviewers,
        }
      );

      return reply.send({
        success: true,
        alert,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create alert');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create alert',
      });
    }
  });
};
