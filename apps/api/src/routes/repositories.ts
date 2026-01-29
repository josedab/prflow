import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { NotFoundError } from '../lib/errors.js';

const getRepoParamsSchema = z.object({
  owner: z.string(),
  repo: z.string(),
});

const updateSettingsSchema = z.object({
  reviewEnabled: z.boolean().optional(),
  testGenerationEnabled: z.boolean().optional(),
  docUpdatesEnabled: z.boolean().optional(),
  assignmentEnabled: z.boolean().optional(),
  mergeEnabled: z.boolean().optional(),
  severityThreshold: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NITPICK']).optional(),
  autoFixStyle: z.boolean().optional(),
  blockOnCritical: z.boolean().optional(),
  ignorePaths: z.array(z.string()).optional(),
});

export async function repositoryRoutes(app: FastifyInstance) {
  // Get repository by owner/name
  app.get<{ Params: { owner: string; repo: string } }>(
    '/:owner/:repo',
    async (request) => {
      const params = getRepoParamsSchema.parse(request.params);
      const fullName = `${params.owner}/${params.repo}`;

      const repository = await db.repository.findUnique({
        where: { fullName },
        include: { settings: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', fullName);
      }

      return repository;
    }
  );

  // Update repository settings
  app.patch<{
    Params: { owner: string; repo: string };
    Body: z.infer<typeof updateSettingsSchema>;
  }>('/:owner/:repo/settings', async (request) => {
    const params = getRepoParamsSchema.parse(request.params);
    const body = updateSettingsSchema.parse(request.body);
    const fullName = `${params.owner}/${params.repo}`;

    const repository = await db.repository.findUnique({
      where: { fullName },
    });

    if (!repository) {
      throw new NotFoundError('Repository', fullName);
    }

    const settings = await db.repositorySettings.upsert({
      where: { repositoryId: repository.id },
      update: body,
      create: {
        repositoryId: repository.id,
        ...body,
      },
    });

    return settings;
  });

  // List repositories for installation
  app.get<{ Querystring: { installationId?: string } }>(
    '/',
    async (request) => {
      const { installationId } = request.query;

      const where = installationId
        ? { organization: { installationId: parseInt(installationId) } }
        : {};

      const repositories = await db.repository.findMany({
        where,
        include: { settings: true },
        orderBy: { updatedAt: 'desc' },
        take: 100,
      });

      return repositories;
    }
  );
}
