import { FastifyPluginAsync } from 'fastify';
import { reviewCalibrationService } from '../services/review-calibration.js';
import { logger } from '../lib/logger.js';

/**
 * Review Quality Calibration routes
 */
export const reviewCalibrationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Record a post-merge outcome
   */
  fastify.post<{
    Body: {
      prNumber: number;
      owner: string;
      repo: string;
      outcomeType: string;
      severity: string;
      description: string;
      relatedIssues?: number[];
      rootCauseFile?: string;
    };
  }>('/outcomes', async (request, reply) => {
    try {
      const outcome = await reviewCalibrationService.recordOutcome(request.body);

      return reply.status(201).send({ success: true, outcome });
    } catch (error) {
      logger.error({ error }, 'Failed to record outcome');
      return reply.status(500).send({ success: false, error: 'Failed to record outcome' });
    }
  });

  /**
   * Get post-merge outcomes
   */
  fastify.get<{
    Querystring: { owner?: string; repo?: string; outcomeType?: string; limit?: number };
  }>('/outcomes', async (request, reply) => {
    try {
      const outcomes = await reviewCalibrationService.getOutcomes(request.query);

      return reply.send({ success: true, outcomes, total: outcomes.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get outcomes');
      return reply.status(500).send({ success: false, error: 'Failed to get outcomes' });
    }
  });

  /**
   * Record feedback on a review suggestion
   */
  fastify.post<{
    Body: {
      commentId: string;
      action: 'accepted' | 'dismissed' | 'false_positive';
      patternType: string;
    };
  }>('/feedback', async (request, reply) => {
    try {
      await reviewCalibrationService.recordFeedback(request.body);

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to record feedback');
      return reply.status(500).send({ success: false, error: 'Failed to record feedback' });
    }
  });

  /**
   * Get confidence score for a pattern
   */
  fastify.get<{
    Params: { patternType: string };
  }>('/confidence/:patternType', async (request, reply) => {
    try {
      const score = await reviewCalibrationService.getConfidenceScore(request.params.patternType);

      return reply.send({ success: true, ...score });
    } catch (error) {
      logger.error({ error }, 'Failed to get confidence score');
      return reply.status(500).send({ success: false, error: 'Failed to get confidence' });
    }
  });

  /**
   * Get calibration profiles
   */
  fastify.get<{
    Querystring: { repositoryId?: string };
  }>('/profiles', async (request, reply) => {
    try {
      const profiles = await reviewCalibrationService.getCalibrationProfiles(request.query.repositoryId);

      return reply.send({ success: true, profiles, total: profiles.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get calibration profiles');
      return reply.status(500).send({ success: false, error: 'Failed to get profiles' });
    }
  });

  /**
   * Generate accuracy report
   */
  fastify.get<{
    Querystring: { repositoryId?: string; periodDays?: number };
  }>('/accuracy-report', async (request, reply) => {
    try {
      const report = await reviewCalibrationService.generateAccuracyReport({
        repositoryId: request.query.repositoryId,
        periodDays: request.query.periodDays,
      });

      return reply.send({ success: true, report });
    } catch (error) {
      logger.error({ error }, 'Failed to generate accuracy report');
      return reply.status(500).send({ success: false, error: 'Failed to generate report' });
    }
  });
};
