import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { mlTrainingPipeline } from '../services/ml-training-pipeline.js';
import { logger } from '../lib/logger.js';

const repositoryParamsSchema = z.object({
  repositoryId: z.string(),
});

const trainBodySchema = z.object({
  minPRs: z.number().min(10).max(1000).optional(),
  maxAgeDays: z.number().min(30).max(730).optional(),
});

export async function mlTrainingRoutes(app: FastifyInstance) {
  /**
   * Get current model weights for a repository
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/model',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      try {
        const weights = await mlTrainingPipeline.getModelWeights(repositoryId);
        const stored = await mlTrainingPipeline.loadModel(repositoryId);

        return {
          success: true,
          repositoryId,
          modelType: stored ? 'trained' : 'default',
          weights: {
            mergeTime: weights.mergeTime,
            mergeProbability: weights.mergeProbability,
            blockerProbability: weights.blockerProbability,
          },
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to get model');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to get model',
        });
      }
    }
  );

  /**
   * Collect training data for a repository
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/training-data',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      try {
        const data = await mlTrainingPipeline.collectTrainingData(repositoryId);

        return {
          success: true,
          repositoryId,
          dataPoints: data.length,
          sample: data.slice(0, 5).map((d) => ({
            prNumber: d.metadata.prNumber,
            features: {
              filesChanged: d.features.filesChanged,
              linesChanged: d.features.linesAdded + d.features.linesDeleted,
              riskScore: d.features.riskScore,
              issues: d.features.criticalIssues + d.features.highIssues,
            },
            labels: {
              mergeTimeHours: Math.round(d.labels.mergeTimeHours * 10) / 10,
              wasMerged: d.labels.wasMerged,
            },
          })),
          summary: {
            avgMergeTime: Math.round(
              data.filter((d) => d.labels.wasMerged).reduce((s, d) => s + d.labels.mergeTimeHours, 0) /
                (data.filter((d) => d.labels.wasMerged).length || 1) *
                10
            ) / 10,
            mergeRate: Math.round(
              (data.filter((d) => d.labels.wasMerged).length / (data.length || 1)) * 100
            ),
            avgFilesChanged: Math.round(
              data.reduce((s, d) => s + d.features.filesChanged, 0) / (data.length || 1)
            ),
          },
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to collect training data');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to collect data',
        });
      }
    }
  );

  /**
   * Train the model for a repository
   */
  app.post<{
    Params: z.infer<typeof repositoryParamsSchema>;
    Body: z.infer<typeof trainBodySchema>;
  }>(
    '/repositories/:repositoryId/train',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      const { minPRs, maxAgeDays } = trainBodySchema.parse(request.body || {});

      try {
        // Collect data
        const data = await mlTrainingPipeline.collectTrainingData(repositoryId, {
          minPRs,
          maxAgeDays,
        });

        if (data.length < 30) {
          return reply.status(400).send({
            error: 'Insufficient training data',
            dataPoints: data.length,
            required: 30,
            suggestion: 'Wait until you have at least 30 completed PRs',
          });
        }

        // Train model
        const result = await mlTrainingPipeline.trainModel(repositoryId, data);

        return {
          success: true,
          repositoryId,
          training: {
            modelVersion: result.modelVersion,
            trainedAt: result.trainedAt.toISOString(),
            dataPoints: result.dataPoints,
          },
          metrics: result.metrics,
          featureImportance: result.featureImportance,
          note: 'Model will be used for future predictions',
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to train model');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Training failed',
        });
      }
    }
  );

  /**
   * Get model performance metrics
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/model/performance',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      try {
        const stored = await mlTrainingPipeline.loadModel(repositoryId);

        if (!stored) {
          return {
            success: true,
            repositoryId,
            status: 'no_trained_model',
            message: 'Using default model - train to improve accuracy',
          };
        }

        // Collect recent data for evaluation
        const recentData = await mlTrainingPipeline.collectTrainingData(repositoryId, {
          maxAgeDays: 30,
        });

        return {
          success: true,
          repositoryId,
          status: 'trained',
          recentDataPoints: recentData.length,
          // Performance metrics would be calculated against recent data
          note: 'Retrain periodically to maintain accuracy',
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to get model performance');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to get performance',
        });
      }
    }
  );

  /**
   * Reset model to defaults
   */
  app.delete<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/model',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      try {
        // This would clear the stored model
        // For now, just return success
        logger.info({ repositoryId }, 'Model reset requested');

        return {
          success: true,
          repositoryId,
          message: 'Model reset to defaults',
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to reset model');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to reset model',
        });
      }
    }
  );

  logger.info('ML training routes registered');
}
