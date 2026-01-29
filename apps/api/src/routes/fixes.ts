import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { fixApplicationService } from '../services/fix-application.js';
import { requireAuth } from '../lib/auth.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const applyFixBodySchema = z.object({
  commentId: z.string(),
});

const applyBatchFixBodySchema = z.object({
  commentIds: z.array(z.string()).min(1).max(50),
  commitMessage: z.string().max(500).optional(),
});

const previewFixParamsSchema = z.object({
  commentId: z.string(),
});

const revertFixParamsSchema = z.object({
  fixId: z.string(),
});

const getFixParamsSchema = z.object({
  fixId: z.string(),
});

const listFixesQuerySchema = z.object({
  workflowId: z.string().optional(),
  repositoryId: z.string().optional(),
  status: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

export async function fixRoutes(app: FastifyInstance) {
  // Apply a single fix
  app.post<{ Body: z.infer<typeof applyFixBodySchema> }>(
    '/apply',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = applyFixBodySchema.parse(request.body);
      const user = request.user!;

      // Get installation ID from the comment's repository
      const comment = await db.reviewComment.findUnique({
        where: { id: body.commentId },
        include: {
          workflow: {
            include: {
              repository: {
                include: { organization: true },
              },
            },
          },
        },
      });

      if (!comment) {
        throw new NotFoundError('Comment', body.commentId);
      }

      const installationId = comment.workflow.repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('Repository not connected to GitHub App');
      }

      const result = await fixApplicationService.applySingleFix({
        commentId: body.commentId,
        userId: user.id,
        installationId,
      });

      if (!result.success) {
        return reply.status(400).send({
          error: 'Fix application failed',
          details: result.error,
          fixId: result.fixId,
        });
      }

      return {
        success: true,
        fixId: result.fixId,
        commitSha: result.commitSha,
        message: 'Fix applied successfully',
      };
    }
  );

  // Apply multiple fixes in a batch
  app.post<{ Body: z.infer<typeof applyBatchFixBodySchema> }>(
    '/apply-batch',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const body = applyBatchFixBodySchema.parse(request.body);
      const user = request.user!;

      // Get installation ID from the first comment
      const firstComment = await db.reviewComment.findFirst({
        where: { id: { in: body.commentIds } },
        include: {
          workflow: {
            include: {
              repository: {
                include: { organization: true },
              },
            },
          },
        },
      });

      if (!firstComment) {
        throw new NotFoundError('Comments');
      }

      const installationId = firstComment.workflow.repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('Repository not connected to GitHub App');
      }

      const result = await fixApplicationService.applyBatchFix({
        commentIds: body.commentIds,
        userId: user.id,
        installationId,
        commitMessage: body.commitMessage,
      });

      if (!result.success && result.appliedFixes.length === 0) {
        return reply.status(400).send({
          error: 'Batch fix failed',
          batchId: result.batchId,
          failedFixes: result.failedFixes,
        });
      }

      return {
        success: result.success,
        batchId: result.batchId,
        commitSha: result.commitSha,
        appliedCount: result.appliedFixes.length,
        failedCount: result.failedFixes.length,
        appliedFixes: result.appliedFixes,
        failedFixes: result.failedFixes,
        message: result.success
          ? `Successfully applied ${result.appliedFixes.length} fixes`
          : `Partially applied ${result.appliedFixes.length} of ${body.commentIds.length} fixes`,
      };
    }
  );

  // Preview a fix before applying
  app.get<{ Params: z.infer<typeof previewFixParamsSchema> }>(
    '/preview/:commentId',
    { preHandler: [requireAuth] },
    async (request) => {
      const params = previewFixParamsSchema.parse(request.params);

      const comment = await db.reviewComment.findUnique({
        where: { id: params.commentId },
        include: {
          workflow: {
            include: {
              repository: {
                include: { organization: true },
              },
            },
          },
        },
      });

      if (!comment) {
        throw new NotFoundError('Comment', params.commentId);
      }

      const installationId = comment.workflow.repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('Repository not connected to GitHub App');
      }

      const preview = await fixApplicationService.previewFix(params.commentId, installationId);

      return {
        commentId: params.commentId,
        ...preview,
      };
    }
  );

  // Revert an applied fix
  app.post<{ Params: z.infer<typeof revertFixParamsSchema> }>(
    '/revert/:fixId',
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const params = revertFixParamsSchema.parse(request.params);
      const user = request.user!;

      const fix = await db.fixApplication.findUnique({
        where: { id: params.fixId },
        include: {
          comment: {
            include: {
              workflow: {
                include: {
                  repository: {
                    include: { organization: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!fix) {
        throw new NotFoundError('Fix', params.fixId);
      }

      const installationId = fix.comment.workflow.repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('Repository not connected to GitHub App');
      }

      const result = await fixApplicationService.revertFix(params.fixId, user.id, installationId);

      if (!result.success) {
        return reply.status(400).send({
          error: 'Revert failed',
          details: result.error,
        });
      }

      return {
        success: true,
        fixId: params.fixId,
        commitSha: result.commitSha,
        message: 'Fix reverted successfully',
      };
    }
  );

  // Get fix application details
  app.get<{ Params: z.infer<typeof getFixParamsSchema> }>(
    '/:fixId',
    async (request) => {
      const params = getFixParamsSchema.parse(request.params);

      const fix = await db.fixApplication.findUnique({
        where: { id: params.fixId },
        include: {
          comment: {
            select: {
              id: true,
              file: true,
              line: true,
              severity: true,
              category: true,
              message: true,
            },
          },
        },
      });

      if (!fix) {
        throw new NotFoundError('Fix', params.fixId);
      }

      return fix;
    }
  );

  // List fix applications
  app.get<{ Querystring: z.infer<typeof listFixesQuerySchema> }>(
    '/',
    async (request) => {
      const query = listFixesQuerySchema.parse(request.query);

      const where: Record<string, unknown> = {};

      if (query.repositoryId) {
        where.repositoryId = query.repositoryId;
      }

      if (query.workflowId) {
        where.comment = { workflowId: query.workflowId };
      }

      if (query.status) {
        where.status = query.status;
      }

      const [fixes, total] = await Promise.all([
        db.fixApplication.findMany({
          where,
          include: {
            comment: {
              select: {
                id: true,
                file: true,
                line: true,
                severity: true,
                category: true,
                message: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: query.limit,
          skip: query.offset,
        }),
        db.fixApplication.count({ where }),
      ]);

      return {
        data: fixes,
        pagination: {
          total,
          limit: query.limit,
          offset: query.offset,
        },
      };
    }
  );

  // Get fixable comments for a workflow (comments with suggestions that haven't been applied)
  app.get<{ Params: { workflowId: string } }>(
    '/fixable/:workflowId',
    async (request, _reply) => {
      const { workflowId } = request.params;

      const comments = await db.reviewComment.findMany({
        where: {
          workflowId,
          suggestion: { not: { equals: null } },
          status: { notIn: ['FIX_APPLIED', 'DISMISSED', 'RESOLVED'] },
        },
        orderBy: [{ severity: 'asc' }, { file: 'asc' }, { line: 'asc' }],
      });

      const grouped = comments.reduce<Record<string, typeof comments>>((acc, comment) => {
        if (!acc[comment.file]) {
          acc[comment.file] = [];
        }
        acc[comment.file].push(comment);
        return acc;
      }, {});

      return {
        totalFixable: comments.length,
        byFile: grouped,
        comments,
      };
    }
  );
}
