import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reviewReplayLearningService } from '../services/review-replay-learning.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

export async function reviewReplayRoutes(fastify: FastifyInstance) {
  /**
   * Record a review decision
   */
  fastify.post<{
    Params: { repositoryId: string };
    Body: {
      workflowId: string;
      commentId: string;
      reviewerGithubId: string;
      reviewerLogin: string;
      action: 'accepted' | 'dismissed' | 'modified' | 'resolved_other';
      aiSuggestion: string;
      humanResponse?: string;
      context: {
        file: string;
        line: number;
        codeContext: string;
        language: string;
        category: string;
        severity: string;
      };
      feedback?: {
        helpful: boolean;
        accuracyRating?: number;
        explanation?: string;
      };
    };
  }>('/repositories/:repositoryId/learning/decisions', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
      body: z.object({
        workflowId: z.string(),
        commentId: z.string(),
        reviewerGithubId: z.string(),
        reviewerLogin: z.string(),
        action: z.enum(['accepted', 'dismissed', 'modified', 'resolved_other']),
        aiSuggestion: z.string(),
        humanResponse: z.string().optional(),
        context: z.object({
          file: z.string(),
          line: z.number(),
          codeContext: z.string(),
          language: z.string(),
          category: z.string(),
          severity: z.string(),
        }),
        feedback: z.object({
          helpful: z.boolean(),
          accuracyRating: z.number().min(1).max(5).optional(),
          explanation: z.string().optional(),
        }).optional(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;
    const body = request.body;

    try {
      const decision = await reviewReplayLearningService.recordDecision({
        ...body,
        repositoryId,
      });

      return reply.status(201).send({
        success: true,
        decision,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to record decision');
      return reply.status(500).send({ error: 'Failed to record decision' });
    }
  });

  /**
   * Get recorded decisions for a repository
   */
  fastify.get<{
    Params: { repositoryId: string };
    Querystring: {
      limit?: number;
      offset?: number;
      action?: string;
      reviewerId?: string;
      since?: string;
    };
  }>('/repositories/:repositoryId/learning/decisions', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
      querystring: z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
        action: z.string().optional(),
        reviewerId: z.string().optional(),
        since: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;
    const { limit, offset, action, reviewerId, since } = request.query;

    try {
      const result = await reviewReplayLearningService.getDecisions(repositoryId, {
        limit,
        offset,
        action,
        reviewerId,
        since: since ? new Date(since) : undefined,
      });

      return reply.send({
        repositoryId,
        ...result,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to get decisions');
      return reply.status(500).send({ error: 'Failed to get decisions' });
    }
  });

  /**
   * Get preference model for a repository
   */
  fastify.get<{
    Params: { repositoryId: string };
  }>('/repositories/:repositoryId/learning/model', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;

    try {
      const model = await reviewReplayLearningService.getPreferenceModel(repositoryId);

      return reply.send({
        success: true,
        model,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to get preference model');
      return reply.status(500).send({ error: 'Failed to get model' });
    }
  });

  /**
   * Get learning statistics for a repository
   */
  fastify.get<{
    Params: { repositoryId: string };
  }>('/repositories/:repositoryId/learning/stats', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;

    try {
      const stats = await reviewReplayLearningService.getLearningStats(repositoryId);

      return reply.send({
        success: true,
        stats,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to get learning stats');
      return reply.status(500).send({ error: 'Failed to get stats' });
    }
  });

  /**
   * Generate training data for model fine-tuning
   */
  fastify.post<{
    Params: { repositoryId: string };
    Body: {
      minDecisions?: number;
      maxAge?: number;
    };
  }>('/repositories/:repositoryId/learning/training-data', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
      body: z.object({
        minDecisions: z.number().min(10).optional(),
        maxAge: z.number().min(1).max(365).optional(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;
    const { minDecisions, maxAge } = request.body;

    try {
      const trainingData = await reviewReplayLearningService.generateTrainingData(
        repositoryId,
        { minDecisions, maxAge }
      );

      return reply.send({
        success: true,
        repositoryId,
        dataPoints: trainingData.length,
        trainingData,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to generate training data');
      return reply.status(500).send({ error: 'Failed to generate training data' });
    }
  });

  /**
   * Apply learned preferences to suggestions
   */
  fastify.post<{
    Params: { repositoryId: string };
    Body: {
      suggestions: Array<{
        category: string;
        severity: string;
        confidence: number;
        message: string;
      }>;
    };
  }>('/repositories/:repositoryId/learning/apply', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
      body: z.object({
        suggestions: z.array(z.object({
          category: z.string(),
          severity: z.string(),
          confidence: z.number(),
          message: z.string(),
        })),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;
    const { suggestions } = request.body;

    try {
      const adjusted = await reviewReplayLearningService.applyLearnedPreferences(
        repositoryId,
        suggestions
      );

      const adjustedCount = adjusted.filter((s) => s.adjusted).length;

      return reply.send({
        success: true,
        repositoryId,
        totalSuggestions: suggestions.length,
        adjustedCount,
        suggestions: adjusted,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to apply learned preferences');
      return reply.status(500).send({ error: 'Failed to apply preferences' });
    }
  });

  /**
   * Submit feedback on a decision
   */
  fastify.post<{
    Params: { decisionId: string };
    Body: {
      helpful: boolean;
      accuracyRating?: number;
      explanation?: string;
    };
  }>('/learning/decisions/:decisionId/feedback', {
    schema: {
      params: z.object({
        decisionId: z.string(),
      }),
      body: z.object({
        helpful: z.boolean(),
        accuracyRating: z.number().min(1).max(5).optional(),
        explanation: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { decisionId } = request.params;
    const feedback = request.body;

    try {
      await reviewReplayLearningService.submitFeedback(decisionId, feedback);

      return reply.send({
        success: true,
        message: 'Feedback recorded',
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, decisionId }, 'Failed to submit feedback');
      return reply.status(500).send({ error: 'Failed to submit feedback' });
    }
  });

  logger.info('Review replay learning routes registered');
}
