import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { enhancedMultiRepoOrchestrationService } from '../services/enhanced-multi-repo.js';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

export async function enhancedMultiRepoRoutes(fastify: FastifyInstance) {
  /**
   * Register a service in the dependency graph
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      serviceId: string;
      serviceName: string;
      repositoryId: string;
      dependsOn?: string[];
      breakingChangeIndicators?: string[];
    };
  }>('/organizations/:organizationId/services', {
    schema: {
      params: z.object({
        organizationId: z.string(),
      }),
      body: z.object({
        serviceId: z.string(),
        serviceName: z.string(),
        repositoryId: z.string(),
        dependsOn: z.array(z.string()).optional(),
        breakingChangeIndicators: z.array(z.string()).optional(),
      }),
    },
  }, async (request, reply) => {
    const { organizationId } = request.params;
    const service = request.body;

    try {
      await enhancedMultiRepoOrchestrationService.registerService(organizationId, {
        ...service,
        dependsOn: service.dependsOn || [],
        breakingChangeIndicators: service.breakingChangeIndicators || [],
      });

      return reply.status(201).send({
        success: true,
        message: 'Service registered',
      });
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to register service');
      return reply.status(500).send({ error: 'Failed to register service' });
    }
  });

  /**
   * Get service graph for an organization
   */
  fastify.get<{
    Params: { organizationId: string };
  }>('/organizations/:organizationId/services/graph', {
    schema: {
      params: z.object({
        organizationId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { organizationId } = request.params;

    try {
      const graph = await enhancedMultiRepoOrchestrationService.getServiceGraph(organizationId);

      if (!graph) {
        throw new NotFoundError('Service graph', organizationId);
      }

      return reply.send({
        success: true,
        graph,
      });
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to get service graph');
      return reply.status(500).send({ error: 'Failed to get graph' });
    }
  });

  /**
   * Analyze cross-repo impact
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      sourceRepositoryId: string;
      changedFiles: string[];
    };
  }>('/organizations/:organizationId/impact-analysis', {
    schema: {
      params: z.object({
        organizationId: z.string(),
      }),
      body: z.object({
        sourceRepositoryId: z.string(),
        changedFiles: z.array(z.string()),
      }),
    },
  }, async (request, reply) => {
    const { organizationId } = request.params;
    const { sourceRepositoryId, changedFiles } = request.body;

    try {
      const impact = await enhancedMultiRepoOrchestrationService.analyzeCrossRepoImpact(
        organizationId,
        sourceRepositoryId,
        changedFiles
      );

      return reply.send({
        success: true,
        impact,
      });
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to analyze impact');
      return reply.status(500).send({ error: 'Failed to analyze impact' });
    }
  });

  /**
   * Create coordinated multi-repo change
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      name: string;
      description: string;
      sourceChange: {
        repositoryId: string;
        branchName: string;
        changedFiles: string[];
      };
      userId: string;
    };
  }>('/organizations/:organizationId/coordinated-changes', {
    schema: {
      params: z.object({
        organizationId: z.string(),
      }),
      body: z.object({
        name: z.string(),
        description: z.string(),
        sourceChange: z.object({
          repositoryId: z.string(),
          branchName: z.string(),
          changedFiles: z.array(z.string()),
        }),
        userId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { organizationId } = request.params;
    const { name, description, sourceChange, userId } = request.body;

    try {
      const result = await enhancedMultiRepoOrchestrationService.createCoordinatedChange(
        organizationId,
        name,
        description,
        sourceChange,
        userId
      );

      return reply.status(201).send({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to create coordinated change');
      return reply.status(500).send({ error: 'Failed to create change' });
    }
  });

  /**
   * Execute coordinated deployment
   */
  fastify.post<{
    Params: { planId: string };
    Body: {
      installationId: number;
      dryRun?: boolean;
      notifySlack?: boolean;
      pauseBetweenPhases?: boolean;
    };
  }>('/coordination/:planId/execute', {
    schema: {
      params: z.object({
        planId: z.string(),
      }),
      body: z.object({
        installationId: z.number(),
        dryRun: z.boolean().optional(),
        notifySlack: z.boolean().optional(),
        pauseBetweenPhases: z.boolean().optional(),
      }),
    },
  }, async (request, reply) => {
    const { planId } = request.params;
    const options = request.body;

    try {
      const status = await enhancedMultiRepoOrchestrationService.executeCoordinatedDeployment(
        planId,
        options.installationId,
        options
      );

      return reply.send({
        success: true,
        status,
      });
    } catch (error) {
      logger.error({ error, planId }, 'Failed to execute coordination');
      return reply.status(500).send({ error: 'Failed to execute' });
    }
  });

  /**
   * Get coordination status
   */
  fastify.get<{
    Params: { planId: string };
  }>('/coordination/:planId/status', {
    schema: {
      params: z.object({
        planId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { planId } = request.params;

    const status = enhancedMultiRepoOrchestrationService.getCoordinationStatus(planId);

    if (!status) {
      throw new NotFoundError('Coordination plan', planId);
    }

    return reply.send({
      success: true,
      status,
    });
  });

  /**
   * Detect conflicts between concurrent changes
   */
  fastify.post<{
    Params: { organizationId: string };
    Body: {
      changes: Array<{
        changeId: string;
        repositoryId: string;
        files: string[];
      }>;
    };
  }>('/organizations/:organizationId/conflicts', {
    schema: {
      params: z.object({
        organizationId: z.string(),
      }),
      body: z.object({
        changes: z.array(z.object({
          changeId: z.string(),
          repositoryId: z.string(),
          files: z.array(z.string()),
        })),
      }),
    },
  }, async (request, reply) => {
    const { organizationId } = request.params;
    const { changes } = request.body;

    try {
      const conflicts = await enhancedMultiRepoOrchestrationService.detectConflicts(
        organizationId,
        changes
      );

      return reply.send({
        success: true,
        hasConflicts: conflicts.length > 0,
        conflicts,
      });
    } catch (error) {
      logger.error({ error, organizationId }, 'Failed to detect conflicts');
      return reply.status(500).send({ error: 'Failed to detect conflicts' });
    }
  });

  /**
   * Get deployment readiness
   */
  fastify.get<{
    Params: { changeId: string };
    Querystring: { installationId: number };
  }>('/multi-repo/:changeId/readiness', {
    schema: {
      params: z.object({
        changeId: z.string(),
      }),
      querystring: z.object({
        installationId: z.coerce.number(),
      }),
    },
  }, async (request, reply) => {
    const { changeId } = request.params;
    const { installationId } = request.query;

    try {
      const readiness = await enhancedMultiRepoOrchestrationService.getDeploymentReadiness(
        changeId,
        installationId
      );

      return reply.send({
        success: true,
        changeId,
        ...readiness,
      });
    } catch (error) {
      logger.error({ error, changeId }, 'Failed to get readiness');
      return reply.status(500).send({ error: 'Failed to get readiness' });
    }
  });

  logger.info('Enhanced multi-repo orchestration routes registered');
}
