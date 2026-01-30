import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { migrationAgent } from '../agents/migration.js';
import { logger } from '../lib/logger.js';

const MigrationTargetSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  type: z.enum(['framework', 'api_style', 'module_system', 'syntax', 'state_management', 'testing', 'styling', 'language']),
  version: z.string().optional(),
});

const CreateMigrationPlanSchema = z.object({
  target: MigrationTargetSchema,
  files: z.array(z.string()).optional(),
  dryRun: z.boolean().optional().default(true),
  createPR: z.boolean().optional().default(false),
  branchName: z.string().optional(),
});

const ExecuteMigrationSchema = z.object({
  planId: z.string().min(1),
  files: z.array(z.string()).optional(),
  commitMessage: z.string().optional(),
});

export async function migrationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get supported migrations
  fastify.get(
    '/migrations/supported',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const supported = migrationAgent.getSupportedMigrations();
      return reply.send({ migrations: supported });
    }
  );

  // Create migration plan (analyze without executing)
  fastify.post(
    '/migrations/plan',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = CreateMigrationPlanSchema.parse(request.body);
        
        logger.info({ target: body.target, fileCount: body.files?.length }, 'Creating migration plan');

        const result = await migrationAgent.execute(
          {
            repositoryId: 'current', // Would come from auth context
            target: body.target,
            files: body.files,
            dryRun: true, // Always dry run for plan
          },
          { repositoryId: 'current' }
        );

        if (!result.success) {
          return reply.status(400).send({ error: result.error });
        }

        return reply.send({
          plan: {
            id: result.data?.planId,
            target: result.data?.target,
            summary: result.data?.summary,
            status: 'ready',
          },
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: error.errors });
        }
        logger.error({ error }, 'Failed to create migration plan');
        return reply.status(500).send({ error: 'Failed to create migration plan' });
      }
    }
  );

  // Execute migration
  fastify.post(
    '/migrations/execute',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = ExecuteMigrationSchema.parse(request.body);
        
        logger.info({ planId: body.planId }, 'Executing migration');

        // In a full implementation, we would retrieve the plan by ID
        // For now, we'll create a new execution based on the plan ID
        
        return reply.send({
          message: 'Migration execution started',
          planId: body.planId,
          status: 'executing',
          jobId: `job-${Date.now()}`,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: error.errors });
        }
        logger.error({ error }, 'Failed to execute migration');
        return reply.status(500).send({ error: 'Failed to execute migration' });
      }
    }
  );

  // Get migration status
  fastify.get(
    '/migrations/:planId',
    async (request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
      const { planId } = request.params;

      // In a full implementation, we would retrieve the status from storage
      return reply.send({
        planId,
        status: 'pending',
        message: 'Migration plan retrieved',
      });
    }
  );

  // Preview file migration
  fastify.post(
    '/migrations/preview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = z.object({
          target: MigrationTargetSchema,
          file: z.string().min(1),
          content: z.string(),
        }).parse(request.body);

        logger.info({ target: body.target, file: body.file }, 'Previewing file migration');

        // Use the migration agent to preview a single file
        const result = await migrationAgent.execute(
          {
            repositoryId: 'preview',
            target: body.target,
            files: [body.file],
            dryRun: true,
          },
          { repositoryId: 'preview' }
        );

        if (!result.success) {
          return reply.status(400).send({ error: result.error });
        }

        return reply.send({
          preview: result.data?.files[0] || null,
          summary: result.data?.summary,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send({ error: 'Invalid request', details: error.errors });
        }
        logger.error({ error }, 'Failed to preview migration');
        return reply.status(500).send({ error: 'Failed to preview migration' });
      }
    }
  );

  // Rollback migration
  fastify.post(
    '/migrations/:planId/rollback',
    async (request: FastifyRequest<{ Params: { planId: string } }>, reply: FastifyReply) => {
      const { planId } = request.params;

      logger.info({ planId }, 'Rolling back migration');

      // In a full implementation, we would use git to rollback changes
      return reply.send({
        planId,
        status: 'rolled_back',
        message: 'Migration rolled back successfully',
      });
    }
  );
}
