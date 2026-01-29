import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { autoRemediationService, type RemediationConfig } from '../services/auto-remediation.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

const RemediationConfigSchema = z.object({
  autoApplyThreshold: z.number().min(0).max(1).optional(),
  includeSeverities: z.array(z.enum(['critical', 'high', 'medium', 'low', 'nitpick'])).optional(),
  includeCategories: z.array(z.enum(['security', 'bug', 'performance', 'error_handling', 'style', 'maintainability'])).optional(),
  skipBreakingChanges: z.boolean().optional(),
  triggerReanalysis: z.boolean().optional(),
  commitStrategy: z.enum(['single', 'per-phase', 'per-file']).optional(),
  dryRun: z.boolean().optional(),
});

export async function autoRemediationRoutes(fastify: FastifyInstance) {
  /**
   * Analyze fix applicability for a workflow
   */
  fastify.get<{
    Params: { workflowId: string };
  }>('/workflows/:workflowId/remediation/analyze', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;

    try {
      const applicabilities = await autoRemediationService.analyzeFixApplicability(workflowId);

      return reply.send({
        workflowId,
        totalFixes: applicabilities.length,
        autoApplicable: applicabilities.filter((a) => a.canAutoApply).length,
        manualRequired: applicabilities.filter((a) => !a.canAutoApply).length,
        breakingChanges: applicabilities.filter((a) => a.isBreaking).length,
        fixes: applicabilities,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, workflowId }, 'Failed to analyze fix applicability');
      return reply.status(500).send({ error: 'Failed to analyze fixes' });
    }
  });

  /**
   * Generate remediation plan
   */
  fastify.post<{
    Params: { workflowId: string };
    Body: Partial<RemediationConfig>;
  }>('/workflows/:workflowId/remediation/plan', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
      body: RemediationConfigSchema,
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;
    const config = request.body;

    try {
      const plan = await autoRemediationService.generateRemediationPlan(workflowId, config);

      return reply.send({
        success: true,
        plan,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, workflowId }, 'Failed to generate remediation plan');
      return reply.status(500).send({ error: 'Failed to generate plan' });
    }
  });

  /**
   * Execute auto-remediation
   */
  fastify.post<{
    Params: { workflowId: string };
    Body: {
      installationId: number;
      userId: string;
      config?: Partial<RemediationConfig>;
    };
  }>('/workflows/:workflowId/remediation/execute', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
      body: z.object({
        installationId: z.number(),
        userId: z.string(),
        config: RemediationConfigSchema.optional(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;
    const { installationId, userId, config } = request.body;

    try {
      const result = await autoRemediationService.executeRemediation(
        workflowId,
        config || {},
        installationId,
        userId
      );

      return reply.send({
        success: result.success,
        result,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, workflowId }, 'Failed to execute remediation');
      return reply.status(500).send({ error: 'Failed to execute remediation' });
    }
  });

  /**
   * Apply all safe fixes with one click
   */
  fastify.post<{
    Params: { workflowId: string };
    Body: {
      installationId: number;
      userId: string;
    };
  }>('/workflows/:workflowId/remediation/apply-all-safe', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
      body: z.object({
        installationId: z.number(),
        userId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;
    const { installationId, userId } = request.body;

    try {
      const result = await autoRemediationService.applyAllSafeFixes(
        workflowId,
        installationId,
        userId
      );

      return reply.send({
        success: result.success,
        message: result.success 
          ? `Successfully applied ${result.summary.totalFixed} fixes`
          : `Completed with ${result.failedFixes.length} failures`,
        result,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, workflowId }, 'Failed to apply all safe fixes');
      return reply.status(500).send({ error: 'Failed to apply fixes' });
    }
  });

  /**
   * Get fix statistics for a workflow
   */
  fastify.get<{
    Params: { workflowId: string };
  }>('/workflows/:workflowId/remediation/stats', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;

    try {
      const stats = await autoRemediationService.getFixStatistics(workflowId);

      return reply.send({
        workflowId,
        stats,
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to get fix statistics');
      return reply.status(500).send({ error: 'Failed to get statistics' });
    }
  });

  /**
   * Dry run remediation (preview changes without applying)
   */
  fastify.post<{
    Params: { workflowId: string };
    Body: {
      installationId: number;
      userId: string;
      config?: Partial<RemediationConfig>;
    };
  }>('/workflows/:workflowId/remediation/dry-run', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
      body: z.object({
        installationId: z.number(),
        userId: z.string(),
        config: RemediationConfigSchema.optional(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;
    const { installationId, userId, config } = request.body;

    try {
      const dryRunConfig = { ...(config || {}), dryRun: true };
      const result = await autoRemediationService.executeRemediation(
        workflowId,
        dryRunConfig,
        installationId,
        userId
      );

      return reply.send({
        success: true,
        message: 'Dry run completed - no changes were made',
        wouldApply: result.appliedFixes.length,
        wouldSkip: result.skippedFixes.length,
        preview: result,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error({ error, workflowId }, 'Failed to run dry-run remediation');
      return reply.status(500).send({ error: 'Failed to run dry-run' });
    }
  });

  logger.info('Auto-remediation routes registered');
}
