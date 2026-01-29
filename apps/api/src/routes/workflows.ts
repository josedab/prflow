import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { NotFoundError } from '../lib/errors.js';

const getWorkflowParamsSchema = z.object({
  workflowId: z.string(),
});

const listWorkflowsQuerySchema = z.object({
  repositoryId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function workflowRoutes(app: FastifyInstance) {
  // Get workflow by ID
  app.get<{ Params: { workflowId: string } }>(
    '/:workflowId',
    async (request) => {
      const params = getWorkflowParamsSchema.parse(request.params);

      const workflow = await db.pRWorkflow.findUnique({
        where: { id: params.workflowId },
        include: {
          analysis: true,
          reviewComments: true,
          generatedTests: true,
          docUpdates: true,
          synthesis: true,
        },
      });

      if (!workflow) {
        throw new NotFoundError('Workflow', params.workflowId);
      }

      return workflow;
    }
  );

  // List workflows
  app.get<{ Querystring: z.infer<typeof listWorkflowsQuerySchema> }>(
    '/',
    async (request) => {
      const query = listWorkflowsQuerySchema.parse(request.query);

      const where: Record<string, unknown> = {};
      if (query.repositoryId) {
        where.repositoryId = query.repositoryId;
      }
      if (query.status) {
        where.status = query.status;
      }

      const [workflows, total] = await Promise.all([
        db.pRWorkflow.findMany({
          where,
          include: {
            analysis: true,
            synthesis: true,
          },
          orderBy: { createdAt: 'desc' },
          take: query.limit,
          skip: query.offset,
        }),
        db.pRWorkflow.count({ where }),
      ]);

      return {
        data: workflows,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
        },
      };
    }
  );

  // Get workflow comments
  app.get<{ Params: { workflowId: string } }>(
    '/:workflowId/comments',
    async (request) => {
      const params = getWorkflowParamsSchema.parse(request.params);

      const comments = await db.reviewComment.findMany({
        where: { workflowId: params.workflowId },
        orderBy: [{ severity: 'asc' }, { createdAt: 'asc' }],
      });

      return comments;
    }
  );

  // Get workflow generated tests
  app.get<{ Params: { workflowId: string } }>(
    '/:workflowId/tests',
    async (request) => {
      const params = getWorkflowParamsSchema.parse(request.params);

      const tests = await db.generatedTest.findMany({
        where: { workflowId: params.workflowId },
        orderBy: { createdAt: 'asc' },
      });

      return tests;
    }
  );
}
