import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { predictiveHealthService, type PRPrediction } from '../services/predictive-health.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const getPredictionParamsSchema = z.object({
  workflowId: z.string(),
});

const getRepositoryPredictionsParamsSchema = z.object({
  repositoryId: z.string(),
});

const getRepositoryPredictionsQuerySchema = z.object({
  status: z.enum(['PENDING', 'ANALYZING', 'REVIEWING', 'COMPLETED']).optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

const batchPredictSchema = z.object({
  workflowIds: z.array(z.string()).min(1).max(50),
});

export async function predictiveHealthRoutes(app: FastifyInstance) {
  /**
   * Get prediction for a single PR
   */
  app.get<{ Params: z.infer<typeof getPredictionParamsSchema> }>(
    '/predict/:workflowId',
    async (request) => {
      const { workflowId } = getPredictionParamsSchema.parse(request.params);

      try {
        const prediction = await predictiveHealthService.predictMergeOutcome(workflowId);
        return formatPredictionResponse(prediction);
      } catch (error) {
        logger.error({ error, workflowId }, 'Failed to generate prediction');
        
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('Workflow', workflowId);
        }
        
        throw error;
      }
    }
  );

  /**
   * Get feature vector for a PR (for debugging/transparency)
   */
  app.get<{ Params: z.infer<typeof getPredictionParamsSchema> }>(
    '/features/:workflowId',
    async (request) => {
      const { workflowId } = getPredictionParamsSchema.parse(request.params);

      try {
        const features = await predictiveHealthService.extractFeatures(workflowId);
        return {
          workflowId,
          features,
          extractedAt: new Date().toISOString(),
        };
      } catch (error) {
        logger.error({ error, workflowId }, 'Failed to extract features');
        
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('Workflow', workflowId);
        }
        
        throw error;
      }
    }
  );

  /**
   * Get predictions for all open PRs in a repository
   */
  app.get<{
    Params: z.infer<typeof getRepositoryPredictionsParamsSchema>;
    Querystring: z.infer<typeof getRepositoryPredictionsQuerySchema>;
  }>(
    '/repository/:repositoryId',
    async (request) => {
      const { repositoryId } = getRepositoryPredictionsParamsSchema.parse(request.params);
      const { status, limit, offset } = getRepositoryPredictionsQuerySchema.parse(request.query);

      // Get workflows
      const where: Record<string, unknown> = { repositoryId };
      if (status) {
        where.status = status;
      } else {
        where.status = { not: 'COMPLETED' };
      }

      const workflows = await db.pRWorkflow.findMany({
        where,
        select: { id: true, prNumber: true, prTitle: true, status: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      // Generate predictions for each
      const predictions = await Promise.all(
        workflows.map(async (w) => {
          try {
            const prediction = await predictiveHealthService.predictMergeOutcome(w.id);
            return {
              ...formatPredictionResponse(prediction),
              prTitle: w.prTitle,
              status: w.status,
            };
          } catch (error) {
            logger.warn({ error, workflowId: w.id }, 'Failed to predict for workflow');
            return {
              workflowId: w.id,
              prNumber: w.prNumber,
              prTitle: w.prTitle,
              status: w.status,
              error: 'Prediction failed',
            };
          }
        })
      );

      const total = await db.pRWorkflow.count({ where });

      return {
        repositoryId,
        predictions,
        pagination: {
          total,
          limit,
          offset,
        },
      };
    }
  );

  /**
   * Batch predict for multiple workflows
   */
  app.post<{ Body: z.infer<typeof batchPredictSchema> }>(
    '/batch',
    async (request, _reply) => {
      const { workflowIds } = batchPredictSchema.parse(request.body);

      const results = await Promise.allSettled(
        workflowIds.map((id) => predictiveHealthService.predictMergeOutcome(id))
      );

      const predictions = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return formatPredictionResponse(result.value);
        }
        return {
          workflowId: workflowIds[index],
          error: result.reason instanceof Error ? result.reason.message : 'Prediction failed',
        };
      });

      return {
        predictions,
        successCount: results.filter((r) => r.status === 'fulfilled').length,
        failureCount: results.filter((r) => r.status === 'rejected').length,
      };
    }
  );

  /**
   * Get prediction summary/dashboard for a repository
   */
  app.get<{ Params: z.infer<typeof getRepositoryPredictionsParamsSchema> }>(
    '/dashboard/:repositoryId',
    async (request) => {
      const { repositoryId } = getRepositoryPredictionsParamsSchema.parse(request.params);

      // Get open PRs
      const openWorkflows = await db.pRWorkflow.findMany({
        where: {
          repositoryId,
          status: { not: 'COMPLETED' },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // Generate predictions
      const predictions = await Promise.all(
        openWorkflows.map(async (w) => {
          try {
            return await predictiveHealthService.predictMergeOutcome(w.id);
          } catch {
            return null;
          }
        })
      );

      const validPredictions = predictions.filter((p): p is PRPrediction => p !== null);

      // Calculate aggregates
      const avgMergeTime = validPredictions.length > 0
        ? validPredictions.reduce((sum, p) => sum + p.predictedMergeTimeHours, 0) / validPredictions.length
        : 0;

      const avgMergeProbability = validPredictions.length > 0
        ? validPredictions.reduce((sum, p) => sum + p.mergeProbability, 0) / validPredictions.length
        : 0;

      const atRiskPRs = validPredictions.filter((p) => p.blockerProbability > 0.5);
      const healthyPRs = validPredictions.filter((p) => p.mergeProbability > 0.8);

      // Aggregate blockers
      const blockerCounts: Record<string, number> = {};
      for (const p of validPredictions) {
        for (const blocker of p.predictedBlockers) {
          blockerCounts[blocker] = (blockerCounts[blocker] || 0) + 1;
        }
      }
      const topBlockers = Object.entries(blockerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([blocker, count]) => ({ blocker, count }));

      // Group by predicted merge time
      const mergeTimeDistribution = {
        lessThan4Hours: validPredictions.filter((p) => p.predictedMergeTimeHours < 4).length,
        fourTo24Hours: validPredictions.filter((p) => 
          p.predictedMergeTimeHours >= 4 && p.predictedMergeTimeHours < 24
        ).length,
        oneToThreeDays: validPredictions.filter((p) => 
          p.predictedMergeTimeHours >= 24 && p.predictedMergeTimeHours < 72
        ).length,
        moreThanThreeDays: validPredictions.filter((p) => p.predictedMergeTimeHours >= 72).length,
      };

      return {
        repositoryId,
        summary: {
          totalOpenPRs: openWorkflows.length,
          predictedPRs: validPredictions.length,
          avgPredictedMergeTimeHours: Math.round(avgMergeTime * 10) / 10,
          avgMergeProbability: Math.round(avgMergeProbability * 100),
          atRiskCount: atRiskPRs.length,
          healthyCount: healthyPRs.length,
        },
        mergeTimeDistribution,
        topBlockers,
        prList: validPredictions.slice(0, 10).map((p) => ({
          workflowId: p.workflowId,
          prNumber: p.prNumber,
          predictedMergeTimeHours: p.predictedMergeTimeHours,
          mergeProbability: Math.round(p.mergeProbability * 100),
          blockerProbability: Math.round(p.blockerProbability * 100),
          blockerCount: p.predictedBlockers.length,
        })),
        generatedAt: new Date().toISOString(),
      };
    }
  );

  /**
   * Get model accuracy metrics (for model monitoring)
   */
  app.get<{ Params: z.infer<typeof getRepositoryPredictionsParamsSchema> }>(
    '/accuracy/:repositoryId',
    async (request) => {
      const { repositoryId } = getRepositoryPredictionsParamsSchema.parse(request.params);

      const accuracy = await predictiveHealthService.getModelAccuracy(repositoryId);

      return {
        repositoryId,
        accuracy,
        note: 'Accuracy metrics are calculated by comparing predictions to actual outcomes',
      };
    }
  );

  /**
   * Get prediction explanation for a specific PR
   */
  app.get<{ Params: z.infer<typeof getPredictionParamsSchema> }>(
    '/explain/:workflowId',
    async (request) => {
      const { workflowId } = getPredictionParamsSchema.parse(request.params);

      try {
        const [prediction, features] = await Promise.all([
          predictiveHealthService.predictMergeOutcome(workflowId),
          predictiveHealthService.extractFeatures(workflowId),
        ]);

        // Generate human-readable explanation
        const explanation = generateExplanation(prediction, features);

        return {
          workflowId,
          prediction: formatPredictionResponse(prediction),
          explanation,
          featureBreakdown: {
            sizeImpact: features.normalizedSize > 0.5 ? 'Large PR - may slow review' : 'Manageable size',
            complexityImpact: features.normalizedComplexity > 0.5 
              ? 'High complexity - expect longer review' 
              : 'Moderate complexity',
            riskImpact: features.normalizedRisk > 0.5 
              ? 'Elevated risk - may need extra approval' 
              : 'Standard risk level',
            timingImpact: features.isWeekend 
              ? 'Weekend submission - expect delays' 
              : features.hourOfDay >= 10 && features.hourOfDay <= 16 
                ? 'Prime review time' 
                : 'Off-peak hours',
            availabilityImpact: features.reviewerAvailability > 0.7 
              ? 'Good reviewer availability' 
              : 'Limited reviewer availability',
          },
        };
      } catch (error) {
        logger.error({ error, workflowId }, 'Failed to generate explanation');
        
        if (error instanceof Error && error.message.includes('not found')) {
          throw new NotFoundError('Workflow', workflowId);
        }
        
        throw error;
      }
    }
  );
}

/**
 * Format prediction response for API
 */
function formatPredictionResponse(prediction: PRPrediction): object {
  return {
    workflowId: prediction.workflowId,
    prNumber: prediction.prNumber,
    predictions: {
      mergeTime: {
        hours: prediction.predictedMergeTimeHours,
        confidence: Math.round(prediction.mergeTimeConfidence * 100),
        humanReadable: formatHoursToReadable(prediction.predictedMergeTimeHours),
      },
      mergeProbability: Math.round(prediction.mergeProbability * 100),
      blockerProbability: Math.round(prediction.blockerProbability * 100),
    },
    blockers: prediction.predictedBlockers,
    recommendations: {
      optimalReviewTime: prediction.optimalReviewTime,
      estimatedFirstReview: formatHoursToReadable(prediction.estimatedFirstReviewHours),
    },
    featureImportance: prediction.featureImportance,
    predictedAt: prediction.predictedAt.toISOString(),
  };
}

/**
 * Format hours to human-readable string
 */
function formatHoursToReadable(hours: number): string {
  if (hours < 1) {
    return `${Math.round(hours * 60)} minutes`;
  }
  if (hours < 24) {
    return `${Math.round(hours)} hour${hours >= 2 ? 's' : ''}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days >= 2 ? 's' : ''}`;
}

/**
 * Generate human-readable explanation
 */
function generateExplanation(
  prediction: PRPrediction,
  features: { normalizedSize: number; normalizedComplexity: number; normalizedRisk: number }
): string {
  const parts: string[] = [];

  parts.push(
    `This PR is predicted to merge in approximately ${formatHoursToReadable(prediction.predictedMergeTimeHours)}`
  );

  if (prediction.mergeProbability > 0.8) {
    parts.push('with a high likelihood of successful merge.');
  } else if (prediction.mergeProbability > 0.6) {
    parts.push('with a moderate likelihood of successful merge.');
  } else {
    parts.push('but faces some challenges that may delay or prevent merge.');
  }

  if (prediction.predictedBlockers.length > 0) {
    parts.push(`\n\nKey factors affecting this prediction:\n- ${prediction.predictedBlockers.join('\n- ')}`);
  }

  if (features.normalizedSize > 0.7) {
    parts.push('\n\nConsider breaking this PR into smaller changes for faster review.');
  }

  return parts.join(' ');
}
