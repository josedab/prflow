import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { conflictResolutionService, ConflictFile } from '../services/conflict-resolution.js';
import { logger } from '../lib/logger.js';

interface WorkflowParams {
  workflowId: string;
}

interface ConflictResolutionBody {
  installationId: number;
  preferStrategy?: 'ours' | 'theirs' | 'merge';
  excludeFiles?: string[];
}

interface SuggestResolutionBody {
  conflictFile: ConflictFile;
}

export default async function conflictResolutionRoutes(fastify: FastifyInstance): Promise<void> {
  // Analyze conflicts in a workflow's PR
  fastify.get<{ Params: WorkflowParams; Querystring: { installationId: number } }>(
    '/api/workflows/:workflowId/conflicts',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string' },
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
      request: FastifyRequest<{ Params: WorkflowParams; Querystring: { installationId: number } }>,
      reply: FastifyReply
    ) => {
      const { workflowId } = request.params;
      const { installationId } = request.query;

      logger.info({ workflowId }, 'Analyzing conflicts');

      const analysis = await conflictResolutionService.analyzeConflicts(workflowId, installationId);

      return reply.code(200).send({
        success: true,
        data: analysis,
      });
    }
  );

  // Resolve conflicts in a workflow's PR
  fastify.post<{ Params: WorkflowParams; Body: ConflictResolutionBody }>(
    '/api/workflows/:workflowId/conflicts/resolve',
    {
      schema: {
        params: {
          type: 'object',
          required: ['workflowId'],
          properties: {
            workflowId: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['installationId'],
          properties: {
            installationId: { type: 'number' },
            preferStrategy: { type: 'string', enum: ['ours', 'theirs', 'merge'] },
            excludeFiles: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: WorkflowParams; Body: ConflictResolutionBody }>,
      reply: FastifyReply
    ) => {
      const { workflowId } = request.params;
      const { installationId, preferStrategy, excludeFiles } = request.body;

      logger.info({ workflowId, preferStrategy }, 'Resolving conflicts');

      const result = await conflictResolutionService.resolveConflicts(workflowId, installationId, {
        preferStrategy,
        excludeFiles,
      });

      return reply.code(200).send({
        success: true,
        data: result,
      });
    }
  );

  // Get AI-suggested resolution for a specific conflict file
  fastify.post<{ Body: SuggestResolutionBody }>(
    '/api/conflicts/suggest',
    {
      schema: {
        body: {
          type: 'object',
          required: ['conflictFile'],
          properties: {
            conflictFile: {
              type: 'object',
              required: ['path', 'content', 'base', 'ours', 'theirs', 'conflictMarkers'],
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
                base: { type: 'string' },
                ours: { type: 'string' },
                theirs: { type: 'string' },
                conflictMarkers: { type: 'array' },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: SuggestResolutionBody }>, reply: FastifyReply) => {
      const { conflictFile } = request.body;

      logger.info({ path: conflictFile.path }, 'Getting AI resolution suggestion');

      const resolution = await conflictResolutionService.getSuggestedResolution(conflictFile);

      return reply.code(200).send({
        success: true,
        data: resolution,
      });
    }
  );
}
