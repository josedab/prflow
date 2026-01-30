import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { multiRepoOrchestrationService } from '../services/multi-repo-orchestration.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';

interface ChangeSetParams {
  changeSetId: string;
}

interface CreateChangeSetBody {
  name: string;
  description?: string;
  repositories: Array<{
    repositoryId: string;
    branchName: string;
    dependencies?: string[];
  }>;
  userId: string;
}

export default async function multiRepoOrchestrationRoutes(fastify: FastifyInstance): Promise<void> {
  // Create a new change set
  fastify.post<{ Body: CreateChangeSetBody }>(
    '/api/multi-repo/change-sets',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'repositories', 'userId'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            description: { type: 'string', maxLength: 1000 },
            repositories: {
              type: 'array',
              minItems: 2,
              items: {
                type: 'object',
                required: ['repositoryId', 'branchName'],
                properties: {
                  repositoryId: { type: 'string' },
                  branchName: { type: 'string' },
                  dependencies: { type: 'array', items: { type: 'string' } },
                },
              },
            },
            userId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateChangeSetBody }>, reply: FastifyReply) => {
      const { name, description, repositories, userId } = request.body;

      logger.info({ name, repositoryCount: repositories.length }, 'Creating change set');

      const changeSet = await multiRepoOrchestrationService.createChangeSet(
        name,
        description || '',
        repositories,
        userId
      );

      return reply.code(201).send({
        success: true,
        data: changeSet,
      });
    }
  );

  // Get a change set
  fastify.get<{ Params: ChangeSetParams }>(
    '/api/multi-repo/change-sets/:changeSetId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['changeSetId'],
          properties: {
            changeSetId: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: ChangeSetParams }>, reply: FastifyReply) => {
      const { changeSetId } = request.params;

      logger.info({ changeSetId }, 'Getting change set');

      const changeSet = await multiRepoOrchestrationService.getChangeSet(changeSetId);

      if (!changeSet) {
        throw new NotFoundError('Change set not found');
      }

      return reply.code(200).send({
        success: true,
        data: changeSet,
      });
    }
  );

  // NOTE: updateChangeSet and deleteChangeSet are not implemented in the service
  // These routes would require extending the service

  // Create pull requests for a change set
  fastify.post<{ Params: ChangeSetParams; Body: { installationId: number } }>(
    '/api/multi-repo/change-sets/:changeSetId/create-prs',
    {
      schema: {
        params: {
          type: 'object',
          required: ['changeSetId'],
          properties: {
            changeSetId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['installationId'],
          properties: {
            installationId: { type: 'number' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: ChangeSetParams; Body: { installationId: number } }>,
      reply: FastifyReply
    ) => {
      const { changeSetId } = request.params;
      const { installationId } = request.body;

      logger.info({ changeSetId }, 'Creating PRs for change set');

      const existing = await multiRepoOrchestrationService.getChangeSet(changeSetId);
      if (!existing) {
        throw new NotFoundError('Change set not found');
      }
      if (existing.status !== 'draft') {
        throw new BadRequestError('Can only create PRs for change sets in draft status');
      }

      const result = await multiRepoOrchestrationService.createPullRequests(changeSetId, installationId);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    }
  );

  // Check merge readiness for a change set
  fastify.get<{ Params: ChangeSetParams; Querystring: { installationId: number } }>(
    '/api/multi-repo/change-sets/:changeSetId/merge-readiness',
    {
      schema: {
        params: {
          type: 'object',
          required: ['changeSetId'],
          properties: {
            changeSetId: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          required: ['installationId'],
          properties: {
            installationId: { type: 'number' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: ChangeSetParams; Querystring: { installationId: number } }>,
      reply: FastifyReply
    ) => {
      const { changeSetId } = request.params;
      const { installationId } = request.query;

      logger.info({ changeSetId }, 'Checking merge readiness');

      const existing = await multiRepoOrchestrationService.getChangeSet(changeSetId);
      if (!existing) {
        throw new NotFoundError('Change set not found');
      }

      const readiness = await multiRepoOrchestrationService.checkMergeReadiness(changeSetId, installationId);

      return reply.code(200).send({
        success: true,
        data: readiness,
      });
    }
  );

  // Execute atomic merge for a change set
  fastify.post<{ Params: ChangeSetParams; Body: { installationId: number } }>(
    '/api/multi-repo/change-sets/:changeSetId/merge',
    {
      schema: {
        params: {
          type: 'object',
          required: ['changeSetId'],
          properties: {
            changeSetId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['installationId'],
          properties: {
            installationId: { type: 'number' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: ChangeSetParams; Body: { installationId: number } }>,
      reply: FastifyReply
    ) => {
      const { changeSetId } = request.params;
      const { installationId } = request.body;

      logger.info({ changeSetId }, 'Executing merge for change set');

      const existing = await multiRepoOrchestrationService.getChangeSet(changeSetId);
      if (!existing) {
        throw new NotFoundError('Change set not found');
      }
      if (!['in_progress', 'ready'].includes(existing.status)) {
        throw new BadRequestError('Change set is not ready for merge');
      }

      const result = await multiRepoOrchestrationService.executeMerge(changeSetId, installationId);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    }
  );

  // Rollback a change set
  fastify.post<{ Params: ChangeSetParams; Body: { installationId: number } }>(
    '/api/multi-repo/change-sets/:changeSetId/rollback',
    {
      schema: {
        params: {
          type: 'object',
          required: ['changeSetId'],
          properties: {
            changeSetId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['installationId'],
          properties: {
            installationId: { type: 'number' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: ChangeSetParams; Body: { installationId: number } }>,
      reply: FastifyReply
    ) => {
      const { changeSetId } = request.params;
      const { installationId } = request.body;

      logger.info({ changeSetId }, 'Rolling back change set');

      const existing = await multiRepoOrchestrationService.getChangeSet(changeSetId);
      if (!existing) {
        throw new NotFoundError('Change set not found');
      }
      if (!['completed', 'failed'].includes(existing.status)) {
        throw new BadRequestError('Can only rollback completed or failed change sets');
      }

      const result = await multiRepoOrchestrationService.rollback(changeSetId, installationId);

      return reply.code(200).send({
        success: true,
        data: result,
      });
    }
  );

  // List all change sets
  fastify.get<{ Querystring: { userId?: string } }>(
    '/api/multi-repo/change-sets',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            userId: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: { userId?: string } }>,
      reply: FastifyReply
    ) => {
      const { userId } = request.query;

      logger.info({ userId }, 'Listing change sets');

      const changeSets = await multiRepoOrchestrationService.listChangeSets(userId);

      return reply.code(200).send({
        success: true,
        data: changeSets,
      });
    }
  );
}
