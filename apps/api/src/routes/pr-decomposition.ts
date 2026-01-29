import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prDecompositionWizardService } from '../services/pr-decomposition-wizard.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

export async function prDecompositionRoutes(fastify: FastifyInstance) {
  /**
   * Start a new decomposition wizard
   */
  fastify.post<{
    Body: {
      workflowId: string;
      installationId: number;
    };
  }>('/decomposition/wizard/start', {
    schema: {
      body: z.object({
        workflowId: z.string(),
        installationId: z.number(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId, installationId } = request.body;

    try {
      const state = await prDecompositionWizardService.startWizard(workflowId, installationId);

      return reply.status(201).send({
        success: true,
        wizardId: state.id,
        state,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, workflowId }, 'Failed to start decomposition wizard');
      throw error;
    }
  });

  /**
   * Get wizard state
   */
  fastify.get<{
    Params: { wizardId: string };
  }>('/decomposition/wizard/:wizardId', {
    schema: {
      params: z.object({
        wizardId: z.string(),
      }),
    },
  }, async (request) => {
    const { wizardId } = request.params;

    const state = prDecompositionWizardService.getWizardState(wizardId);

    return {
      success: true,
      state,
    };
  });

  /**
   * Get AI recommendations for splitting
   */
  fastify.get<{
    Params: { wizardId: string };
  }>('/decomposition/wizard/:wizardId/recommendations', {
    schema: {
      params: z.object({
        wizardId: z.string(),
      }),
    },
  }, async (request) => {
    const { wizardId } = request.params;

    try {
      const recommendations = await prDecompositionWizardService.getAIRecommendations(wizardId);

      return {
        success: true,
        wizardId,
        count: recommendations.length,
        recommendations,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, wizardId }, 'Failed to get AI recommendations');
      throw error;
    }
  });

  /**
   * Compare splitting strategies
   */
  fastify.get<{
    Params: { wizardId: string };
  }>('/decomposition/wizard/:wizardId/strategies', {
    schema: {
      params: z.object({
        wizardId: z.string(),
      }),
    },
  }, async (request) => {
    const { wizardId } = request.params;

    try {
      const strategies = await prDecompositionWizardService.compareStrategies(wizardId);

      return {
        success: true,
        wizardId,
        strategies,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, wizardId }, 'Failed to compare strategies');
      throw error;
    }
  });

  /**
   * Customize splits
   */
  fastify.post<{
    Params: { wizardId: string };
    Body: {
      selectedStrategy?: string;
      customSplits?: Array<{ name: string; files: string[] }>;
      excludedFiles?: string[];
      mergeOrder?: string[];
    };
  }>('/decomposition/wizard/:wizardId/customize', {
    schema: {
      params: z.object({
        wizardId: z.string(),
      }),
      body: z.object({
        selectedStrategy: z.string().optional(),
        customSplits: z.array(z.object({
          name: z.string(),
          files: z.array(z.string()),
        })).optional(),
        excludedFiles: z.array(z.string()).optional(),
        mergeOrder: z.array(z.string()).optional(),
      }),
    },
  }, async (request) => {
    const { wizardId } = request.params;
    const customizations = request.body;

    try {
      const state = await prDecompositionWizardService.customizeSplits(wizardId, customizations);

      return {
        success: true,
        state,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, wizardId }, 'Failed to customize splits');
      throw error;
    }
  });

  /**
   * Generate preview
   */
  fastify.get<{
    Params: { wizardId: string };
  }>('/decomposition/wizard/:wizardId/preview', {
    schema: {
      params: z.object({
        wizardId: z.string(),
      }),
    },
  }, async (request) => {
    const { wizardId } = request.params;

    try {
      const preview = await prDecompositionWizardService.generatePreview(wizardId);

      return {
        success: true,
        wizardId,
        preview,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, wizardId }, 'Failed to generate preview');
      throw error;
    }
  });

  /**
   * Execute decomposition
   */
  fastify.post<{
    Params: { wizardId: string };
    Body: {
      installationId: number;
      userId: string;
    };
  }>('/decomposition/wizard/:wizardId/execute', {
    schema: {
      params: z.object({
        wizardId: z.string(),
      }),
      body: z.object({
        installationId: z.number(),
        userId: z.string(),
      }),
    },
  }, async (request) => {
    const { wizardId } = request.params;
    const { installationId, userId } = request.body;

    try {
      const result = await prDecompositionWizardService.executeDecomposition(
        wizardId,
        installationId,
        userId
      );

      return {
        success: result.success,
        result,
      };
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, wizardId }, 'Failed to execute decomposition');
      throw error;
    }
  });

  /**
   * Cancel wizard
   */
  fastify.delete<{
    Params: { wizardId: string };
  }>('/decomposition/wizard/:wizardId', {
    schema: {
      params: z.object({
        wizardId: z.string(),
      }),
    },
  }, async (request) => {
    const { wizardId } = request.params;

    prDecompositionWizardService.cancelWizard(wizardId);

    return {
      success: true,
      message: 'Wizard cancelled',
    };
  });

  logger.info('PR decomposition wizard routes registered');
}
