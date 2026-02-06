import { FastifyPluginAsync } from 'fastify';
import { nlPRCreationService } from '../services/nl-pr-creation.js';
import { logger } from '../lib/logger.js';

/**
 * Natural Language PR Creation routes
 */
export const nlPRCreationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Analyze intent from natural language description
   */
  fastify.post<{
    Body: { description: string };
  }>('/api/nl-pr/analyze', async (request, reply) => {
    try {
      const analysis = await nlPRCreationService.analyzeIntent(request.body.description);

      return reply.send({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze intent');
      return reply.status(500).send({
        success: false,
        error: 'Failed to analyze intent',
      });
    }
  });

  /**
   * Create a PR creation plan
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      description: string;
      targetBranch?: string;
      context?: {
        relatedIssues?: number[];
        focusFiles?: string[];
        requirements?: string[];
        constraints?: string[];
      };
      options?: {
        generateTests?: boolean;
        generateDocs?: boolean;
        dryRun?: boolean;
        customBranchName?: string;
      };
    };
  }>('/api/nl-pr/plan', async (request, reply) => {
    try {
      const plan = await nlPRCreationService.createPlan(request.body);

      return reply.send({
        success: true,
        plan,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create plan');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create plan',
      });
    }
  });

  /**
   * Execute a PR creation plan
   */
  fastify.post<{
    Params: { planId: string };
    Body: { installationId?: number };
  }>('/api/nl-pr/plan/:planId/execute', async (request, reply) => {
    try {
      const installationId = request.body.installationId || 0;
      const result = await nlPRCreationService.executePlan(
        request.params.planId,
        installationId
      );

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to execute plan');
      return reply.status(500).send({
        success: false,
        error: 'Failed to execute plan',
      });
    }
  });

  /**
   * Create PR directly from natural language (plan + execute)
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      description: string;
      targetBranch?: string;
      options?: {
        generateTests?: boolean;
        generateDocs?: boolean;
      };
    };
  }>('/api/nl-pr/create', async (request, reply) => {
    try {
      // Create plan
      const plan = await nlPRCreationService.createPlan(request.body);

      // Execute plan
      const result = await nlPRCreationService.executePlan(plan.id, 0);

      return reply.send({
        success: result.success,
        plan,
        result,
        pullRequest: result.pullRequest,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create PR');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create PR',
      });
    }
  });

  /**
   * Get suggestions for improving a description
   */
  fastify.post<{
    Body: { description: string };
  }>('/api/nl-pr/suggestions', async (request, reply) => {
    try {
      const suggestions = await nlPRCreationService.getSuggestions(request.body.description);

      return reply.send({
        success: true,
        suggestions,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get suggestions');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get suggestions',
      });
    }
  });

  /**
   * Get PR creation history
   */
  fastify.get<{
    Querystring: { limit?: number };
  }>('/api/nl-pr/history', async (request, reply) => {
    try {
      const userId = (request as { userId?: string }).userId || 'anonymous';
      const history = await nlPRCreationService.getHistory(userId, request.query.limit);

      return reply.send({
        success: true,
        history,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get history');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get history',
      });
    }
  });
};
