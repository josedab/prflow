import { FastifyPluginAsync } from 'fastify';
import { db } from '@prflow/db';
import { aiConflictPreventionService } from '../services/ai-conflict-prevention.js';
import { logger } from '../lib/logger.js';

/**
 * AI-Powered Conflict Prevention routes
 */
export const aiConflictPreventionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Predict conflicts for a PR
   */
  fastify.get<{
    Params: { owner: string; repo: string; prNumber: string };
    Querystring: {
      includeAutoResolution?: boolean;
      includeMergeOrder?: boolean;
    };
  }>('/api/conflict-prevention/predict/:owner/:repo/:prNumber', async (request, reply) => {
    try {
      const prediction = await aiConflictPreventionService.predictConflicts(
        request.params.owner,
        request.params.repo,
        parseInt(request.params.prNumber, 10),
        {
          includeAutoResolution: request.query.includeAutoResolution,
          includeMergeOrder: request.query.includeMergeOrder,
        }
      );

      return reply.send({
        success: true,
        prediction,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to predict conflicts');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to predict conflicts',
      });
    }
  });

  /**
   * Analyze concurrent PRs in a repository
   */
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: { prNumbers?: string };
  }>('/api/conflict-prevention/analyze/:owner/:repo', async (request, reply) => {
    try {
      const prNumbers = request.query.prNumbers
        ?.split(',')
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n));

      const analysis = await aiConflictPreventionService.analyzeConcurrentPRs(
        request.params.owner,
        request.params.repo,
        prNumbers
      );

      return reply.send({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze concurrent PRs');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze concurrent PRs',
      });
    }
  });

  /**
   * Get conflict matrix for a repository
   */
  fastify.get<{
    Params: { owner: string; repo: string };
  }>('/api/conflict-prevention/matrix/:owner/:repo', async (request, reply) => {
    try {
      const analysis = await aiConflictPreventionService.analyzeConcurrentPRs(
        request.params.owner,
        request.params.repo
      );

      return reply.send({
        success: true,
        matrix: analysis.conflictMatrix,
        highRiskCombinations: analysis.highRiskCombinations,
        safeToMerge: analysis.safeToMerge,
        recommendedSequence: analysis.recommendedSequence,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get conflict matrix');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get conflict matrix',
      });
    }
  });

  /**
   * Auto-resolve conflicts
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      strategy?: 'conservative' | 'moderate' | 'aggressive' | 'manual';
      dryRun?: boolean;
    };
  }>('/api/conflict-prevention/auto-resolve', async (request, reply) => {
    try {
      const result = await aiConflictPreventionService.autoResolveConflicts(
        request.body.owner,
        request.body.repo,
        request.body.prNumber,
        request.body.strategy,
        request.body.dryRun
      );

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to auto-resolve conflicts');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to auto-resolve conflicts',
      });
    }
  });

  /**
   * Get optimal merge order
   */
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: { prNumbers?: string };
  }>('/api/conflict-prevention/merge-order/:owner/:repo', async (request, reply) => {
    try {
      const prNumbers = request.query.prNumbers
        ?.split(',')
        .map(n => parseInt(n.trim(), 10))
        .filter(n => !isNaN(n));

      const analysis = await aiConflictPreventionService.analyzeConcurrentPRs(
        request.params.owner,
        request.params.repo,
        prNumbers
      );

      return reply.send({
        success: true,
        recommendedSequence: analysis.recommendedSequence,
        safeToMerge: analysis.safeToMerge,
        highRiskCombinations: analysis.highRiskCombinations,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get merge order');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get merge order',
      });
    }
  });

  /**
   * Get conflict alerts
   */
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: { limit?: number; severity?: 'info' | 'warning' | 'critical' };
  }>('/api/conflict-prevention/alerts/:owner/:repo', async (request, reply) => {
    try {
      const alerts = await aiConflictPreventionService.getConflictAlerts(
        request.params.owner,
        request.params.repo,
        {
          limit: request.query.limit,
          severity: request.query.severity,
        }
      );

      return reply.send({
        success: true,
        alerts,
        count: alerts.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get conflict alerts');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get conflict alerts',
      });
    }
  });

  /**
   * Create a conflict alert
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      type: 'collision_course' | 'high_probability' | 'stale_branch' | 'complex_merge';
      severity: 'info' | 'warning' | 'critical';
      involvedPRs: number[];
      message: string;
      recommendation: string;
    };
  }>('/api/conflict-prevention/alerts', async (request, reply) => {
    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${request.body.owner}/${request.body.repo}` },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const alert = await aiConflictPreventionService.createConflictAlert(
        request.body.type,
        request.body.severity,
        request.body.involvedPRs,
        request.body.message,
        request.body.recommendation,
        repository.id
      );

      return reply.send({
        success: true,
        alert,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create conflict alert');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create conflict alert',
      });
    }
  });
};
