import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { interactiveTrainingService } from '../services/interactive-training.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const repositoryParamsSchema = z.object({
  repositoryId: z.string(),
});

const scenarioParamsSchema = z.object({
  scenarioId: z.string(),
});

const generateScenariosSchema = z.object({
  count: z.number().min(1).max(20).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  category: z.string().optional(),
});

const submitResponseSchema = z.object({
  identifiedIssues: z.array(
    z.object({
      line: z.number(),
      type: z.string(),
      severity: z.string(),
      message: z.string(),
    })
  ),
  timeSpentSeconds: z.number().min(0),
});

export async function interactiveTrainingRoutes(app: FastifyInstance) {
  /**
   * Generate training scenarios for a repository
   */
  app.post<{
    Params: z.infer<typeof repositoryParamsSchema>;
    Body: z.infer<typeof generateScenariosSchema>;
  }>(
    '/repositories/:repositoryId/training/scenarios',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      const options = generateScenariosSchema.parse(request.body || {});

      try {
        const scenarios = await interactiveTrainingService.generateScenarios(repositoryId, options);

        return {
          success: true,
          repositoryId,
          count: scenarios.length,
          scenarios: scenarios.map((s) => ({
            id: s.id,
            title: s.title,
            description: s.description,
            difficulty: s.difficulty,
            category: s.category,
            language: s.language,
            codeSnippet: s.codeSnippet,
            hints: s.hints,
            tags: s.tags,
            // Don't include correctIssues - that's for validation
          })),
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to generate scenarios');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to generate scenarios',
        });
      }
    }
  );

  /**
   * Submit a response to a training scenario
   */
  app.post<{
    Params: z.infer<typeof repositoryParamsSchema> & z.infer<typeof scenarioParamsSchema>;
    Body: z.infer<typeof submitResponseSchema>;
  }>(
    '/repositories/:repositoryId/training/scenarios/:scenarioId/submit',
    async (request, reply) => {
      const { repositoryId, scenarioId } = request.params;
      const response = submitResponseSchema.parse(request.body);
      const userId = (request.headers['x-user-id'] as string) || 'anonymous';

      try {
        // Get the scenario (in real implementation, would fetch from storage)
        const scenarios = await interactiveTrainingService.generateScenarios(repositoryId, {
          count: 1,
        });

        const scenario = scenarios.find((s) => s.id === scenarioId) || scenarios[0];

        if (!scenario) {
          throw new NotFoundError('Scenario', scenarioId);
        }

        // Evaluate the response
        const score = await interactiveTrainingService.evaluateResponse(scenario, {
          scenarioId,
          userId,
          identifiedIssues: response.identifiedIssues,
          timeSpentSeconds: response.timeSpentSeconds,
          completedAt: new Date(),
        });

        // Update user progress
        const progress = await interactiveTrainingService.updateProgress(userId, repositoryId, score);

        return {
          success: true,
          score: {
            total: score.score,
            issuesFound: score.issuesFound,
            issuesMissed: score.issuesMissed,
            falsePositives: score.falsePositives,
            accuracy: score.accuracy,
          },
          feedback: score.feedback,
          improvement: score.improvement,
          badge: score.badge,
          correctAnswers: scenario.correctIssues,
          progress: {
            completedScenarios: progress.completedScenarios,
            avgScore: Math.round(progress.avgScore),
            streak: progress.streak,
            badges: progress.badges.length,
          },
        };
      } catch (error) {
        logger.error({ error, scenarioId }, 'Failed to evaluate response');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to evaluate response',
        });
      }
    }
  );

  /**
   * Get user progress
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/training/progress',
    async (request) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      const userId = (request.headers['x-user-id'] as string) || 'anonymous';

      const progress = await interactiveTrainingService.getUserProgress(userId, repositoryId);

      return {
        success: true,
        progress: {
          completedScenarios: progress.completedScenarios,
          avgScore: Math.round(progress.avgScore),
          strengthAreas: progress.strengthAreas,
          improvementAreas: progress.improvementAreas,
          badges: progress.badges,
          streak: progress.streak,
          lastActivity: progress.lastActivityAt.toISOString(),
        },
      };
    }
  );

  /**
   * Get personalized recommendations
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/training/recommendations',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      const userId = (request.headers['x-user-id'] as string) || 'anonymous';

      try {
        const recommendations = await interactiveTrainingService.getRecommendations(
          userId,
          repositoryId
        );

        return {
          success: true,
          recommendations: {
            focusAreas: recommendations.focus,
            tips: recommendations.tips,
            suggestedScenarios: recommendations.nextScenarios.map((s) => ({
              id: s.id,
              title: s.title,
              difficulty: s.difficulty,
              category: s.category,
            })),
          },
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to get recommendations');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Failed to get recommendations',
        });
      }
    }
  );

  /**
   * Get team leaderboard
   */
  app.get<{ Params: z.infer<typeof repositoryParamsSchema> }>(
    '/repositories/:repositoryId/training/leaderboard',
    async (request) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      const leaderboard = await interactiveTrainingService.getLeaderboard(repositoryId);

      return {
        success: true,
        repositoryId,
        leaderboard,
      };
    }
  );

  /**
   * Get available training categories
   */
  app.get(
    '/training/categories',
    async () => {
      return {
        success: true,
        categories: [
          {
            id: 'security',
            name: 'Security',
            description: 'Learn to identify security vulnerabilities',
            icon: '🔒',
          },
          {
            id: 'bug',
            name: 'Bug Detection',
            description: 'Find potential bugs and logic errors',
            icon: '🐛',
          },
          {
            id: 'performance',
            name: 'Performance',
            description: 'Identify performance issues and optimizations',
            icon: '⚡',
          },
          {
            id: 'error_handling',
            name: 'Error Handling',
            description: 'Spot missing or improper error handling',
            icon: '🛡️',
          },
          {
            id: 'style',
            name: 'Code Style',
            description: 'Learn best practices and conventions',
            icon: '✨',
          },
        ],
      };
    }
  );

  logger.info('Interactive training routes registered');
}
