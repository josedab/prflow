import { FastifyPluginAsync } from 'fastify';
import { db } from '@prflow/db';
import { enhancedPredictiveHealthService } from '../services/enhanced-predictive-health.js';
import { logger } from '../lib/logger.js';
import type { ComprehensivePRHealthScore } from '@prflow/core';

/**
 * Enhanced Predictive Health routes
 * Comprehensive health scoring, predictions, and team dashboards
 */
export const enhancedPredictiveHealthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get comprehensive health score for a PR
   */
  fastify.get<{
    Params: { workflowId: string };
    Querystring: {
      includePredictions?: boolean;
      includeRecommendations?: boolean;
    };
  }>('/api/health-score/:workflowId/comprehensive', async (request, reply) => {
    try {
      const healthScore: ComprehensivePRHealthScore = await enhancedPredictiveHealthService.calculateHealthScore(
        request.params.workflowId
      );

      // Filter based on query params
      const response: Record<string, unknown> = {
        success: true,
        healthScore: {
          workflowId: healthScore.workflowId,
          prNumber: healthScore.prNumber,
          repository: healthScore.repository,
          overallScore: healthScore.overallScore,
          grade: healthScore.grade,
          factors: healthScore.factors,
          breakdown: healthScore.breakdown,
          risks: healthScore.risks,
          comparison: healthScore.comparison,
          confidence: healthScore.confidence,
          calculatedAt: healthScore.calculatedAt,
        },
      };

      if (request.query.includePredictions !== false) {
        (response.healthScore as Record<string, unknown>).predictions = healthScore.predictions;
      }

      if (request.query.includeRecommendations !== false) {
        (response.healthScore as Record<string, unknown>).recommendations = healthScore.recommendations;
      }

      return reply.send(response);
    } catch (error) {
      logger.error({ error }, 'Failed to calculate health score');
      return reply.status(500).send({
        success: false,
        error: 'Failed to calculate health score',
      });
    }
  });

  /**
   * Get health score summary (lighter response)
   */
  fastify.get<{
    Params: { workflowId: string };
  }>('/api/health-score/:workflowId/summary', async (request, reply) => {
    try {
      const healthScore: ComprehensivePRHealthScore = await enhancedPredictiveHealthService.calculateHealthScore(
        request.params.workflowId
      );

      return reply.send({
        success: true,
        summary: {
          workflowId: healthScore.workflowId,
          prNumber: healthScore.prNumber,
          overallScore: healthScore.overallScore,
          grade: healthScore.grade,
          mergeProbability: healthScore.predictions.merge.probability,
          predictedMergeTimeHours: healthScore.predictions.merge.timeToMergeHours,
          topRisks: healthScore.risks.slice(0, 3).map((r) => ({
            type: r.type,
            level: r.level,
            description: r.description,
          })),
          topRecommendations: healthScore.recommendations.slice(0, 3).map((r) => ({
            title: r.title,
            priority: r.priority,
            estimatedImprovement: r.estimatedImprovement.healthScore,
          })),
          confidence: healthScore.confidence,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get health score summary');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get health score summary',
      });
    }
  });

  /**
   * Get team health dashboard
   */
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: {
      startDate?: string;
      endDate?: string;
      includeTrends?: boolean;
    };
  }>('/api/health-score/team/:owner/:repo', async (request, reply) => {
    try {
      // Default to last 30 days
      const endDate = request.query.endDate
        ? new Date(request.query.endDate)
        : new Date();
      const startDate = request.query.startDate
        ? new Date(request.query.startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get repository ID from the database
      const repository = await db.repository.findFirst({
        where: {
          fullName: `${request.params.owner}/${request.params.repo}`,
        },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const dashboard = await enhancedPredictiveHealthService.getTeamHealthDashboard(
        repository.id,
        startDate,
        endDate
      );

      return reply.send({
        success: true,
        dashboard,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get team health dashboard');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get team health dashboard',
      });
    }
  });

  /**
   * Get merge prediction for a PR
   */
  fastify.get<{
    Params: { workflowId: string };
  }>('/api/health-score/:workflowId/predict', async (request, reply) => {
    try {
      const healthScore: ComprehensivePRHealthScore = await enhancedPredictiveHealthService.calculateHealthScore(
        request.params.workflowId
      );

      return reply.send({
        success: true,
        predictions: healthScore.predictions,
        confidence: healthScore.confidence,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get predictions');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get predictions',
      });
    }
  });

  /**
   * Get blockers analysis
   */
  fastify.get<{
    Params: { workflowId: string };
  }>('/api/health-score/:workflowId/blockers', async (request, reply) => {
    try {
      const healthScore: ComprehensivePRHealthScore = await enhancedPredictiveHealthService.calculateHealthScore(
        request.params.workflowId
      );

      return reply.send({
        success: true,
        blockers: {
          probability: healthScore.predictions.blockers.probability,
          items: healthScore.predictions.blockers.blockers,
          severityScore: healthScore.predictions.blockers.severityScore,
        },
        risks: healthScore.risks,
        recommendedActions: healthScore.recommendations
          .filter((r) => r.priority === 'critical' || r.priority === 'high')
          .map((r) => ({
            title: r.title,
            actions: r.actions,
            estimatedImprovement: r.estimatedImprovement,
          })),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get blockers');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get blockers',
      });
    }
  });

  /**
   * Compare PR health to repository baseline
   */
  fastify.get<{
    Params: { workflowId: string };
  }>('/api/health-score/:workflowId/compare', async (request, reply) => {
    try {
      const healthScore: ComprehensivePRHealthScore = await enhancedPredictiveHealthService.calculateHealthScore(
        request.params.workflowId
      );

      return reply.send({
        success: true,
        comparison: {
          current: {
            score: healthScore.overallScore,
            grade: healthScore.grade,
          },
          author: {
            avgScore: healthScore.comparison.authorAvgScore,
            percentile: healthScore.comparison.authorPercentile,
            trend: healthScore.comparison.authorTrend,
          },
          repository: {
            avgScore: healthScore.comparison.repoAvgScore,
            percentile: healthScore.comparison.repoPercentile,
          },
          similarPRs: healthScore.comparison.similarPRs,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to compare health score');
      return reply.status(500).send({
        success: false,
        error: 'Failed to compare health score',
      });
    }
  });
};
