import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { createGitHubClient } from '@prflow/github-client';
import { loadConfigSafe } from '@prflow/config';
import { getMergeQueueService, type MergeQueueConfig } from '../services/merge-queue.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const config = loadConfigSafe();

const addToQueueSchema = z.object({
  prNumber: z.number(),
  priority: z.number().optional().default(0),
});

const configSchema = z.object({
  enabled: z.boolean().optional(),
  autoMergeEnabled: z.boolean().optional(),
  requireApprovals: z.number().min(0).max(10).optional(),
  requireChecks: z.boolean().optional(),
  requireUpToDate: z.boolean().optional(),
  checkConflicts: z.boolean().optional(),
  autoResolveConflicts: z.boolean().optional(),
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
  batchSize: z.number().min(1).max(10).optional(),
  maxWaitTimeMinutes: z.number().min(5).max(1440).optional(),
});

export async function mergeQueueRoutes(app: FastifyInstance) {
  const mergeQueue = getMergeQueueService();

  // Get merge queue for a repository
  app.get<{
    Params: { owner: string; repo: string };
  }>('/repositories/:owner/:repo/merge-queue', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      const queue = await mergeQueue.getQueue(repository.id);
      const queueConfig = await mergeQueue.getConfig(repository.id);

      return {
        repository: {
          owner,
          repo,
          fullName: `${owner}/${repo}`,
        },
        config: queueConfig,
        queue,
        stats: {
          total: queue.length,
          queued: queue.filter((i) => i.status === 'queued').length,
          checking: queue.filter((i) => i.status === 'checking').length,
          ready: queue.filter((i) => i.status === 'ready').length,
          merging: queue.filter((i) => i.status === 'merging').length,
          blocked: queue.filter((i) => i.status === 'blocked').length,
        },
      };
    } catch (error) {
      logger.error({ error, owner, repo }, 'Failed to get merge queue');
      throw error;
    }
  });

  // Add PR to merge queue
  app.post<{
    Params: { owner: string; repo: string };
    Body: z.infer<typeof addToQueueSchema>;
  }>('/repositories/:owner/:repo/merge-queue', async (request, reply) => {
    const { owner, repo } = request.params;
    const { prNumber, priority } = addToQueueSchema.parse(request.body);

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
        include: { organization: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      const installationId = repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('GitHub App not installed');
      }

      const github = createGitHubClient({
        appId: config.GITHUB_APP_ID!,
        privateKey: config.GITHUB_APP_PRIVATE_KEY!,
        installationId,
      });

      const item = await mergeQueue.addToQueue(
        github,
        owner,
        repo,
        repository.id,
        prNumber,
        priority
      );

      return reply.status(201).send(item);
    } catch (error) {
      logger.error({ error, owner, repo, prNumber }, 'Failed to add to merge queue');
      throw error;
    }
  });

  // Remove PR from merge queue
  app.delete<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/repositories/:owner/:repo/merge-queue/:prNumber', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      await mergeQueue.removeFromQueue(repository.id, parseInt(prNumber, 10));

      return { success: true };
    } catch (error) {
      logger.error({ error, owner, repo, prNumber }, 'Failed to remove from merge queue');
      throw error;
    }
  });

  // Get merge queue configuration
  app.get<{
    Params: { owner: string; repo: string };
  }>('/repositories/:owner/:repo/merge-queue/config', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      const queueConfig = await mergeQueue.getConfig(repository.id);

      return queueConfig;
    } catch (error) {
      logger.error({ error, owner, repo }, 'Failed to get merge queue config');
      throw error;
    }
  });

  // Update merge queue configuration
  app.patch<{
    Params: { owner: string; repo: string };
    Body: z.infer<typeof configSchema>;
  }>('/repositories/:owner/:repo/merge-queue/config', async (request, reply) => {
    const { owner, repo } = request.params;
    const updates = configSchema.parse(request.body);

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      await mergeQueue.setConfig(repository.id, updates as Partial<MergeQueueConfig>);
      const newConfig = await mergeQueue.getConfig(repository.id);

      return newConfig;
    } catch (error) {
      logger.error({ error, owner, repo }, 'Failed to update merge queue config');
      throw error;
    }
  });

  // Trigger queue processing (admin endpoint)
  app.post<{
    Params: { owner: string; repo: string };
  }>('/repositories/:owner/:repo/merge-queue/process', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
        include: { organization: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      const installationId = repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('GitHub App not installed');
      }

      const github = createGitHubClient({
        appId: config.GITHUB_APP_ID!,
        privateKey: config.GITHUB_APP_PRIVATE_KEY!,
        installationId,
      });

      await mergeQueue.processQueue(github, owner, repo, repository.id);

      return { success: true, message: 'Queue processing triggered' };
    } catch (error) {
      logger.error({ error, owner, repo }, 'Failed to process merge queue');
      throw error;
    }
  });

  // Get conflicts for a PR in the queue
  app.get<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/repositories/:owner/:repo/merge-queue/:prNumber/conflicts', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
        include: { organization: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      const installationId = repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('GitHub App not installed');
      }

      const github = createGitHubClient({
        appId: config.GITHUB_APP_ID!,
        privateKey: config.GITHUB_APP_PRIVATE_KEY!,
        installationId,
      });

      const conflicts = await mergeQueue.getConflictingPRs(
        github,
        owner,
        repo,
        repository.id,
        parseInt(prNumber, 10)
      );

      return {
        prNumber: parseInt(prNumber, 10),
        hasConflicts: conflicts.length > 0,
        conflicts,
      };
    } catch (error) {
      logger.error({ error, owner, repo, prNumber }, 'Failed to check conflicts');
      throw error;
    }
  });

  // Manually trigger rebase for a PR in the queue
  app.post<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/repositories/:owner/:repo/merge-queue/:prNumber/rebase', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
        include: { organization: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      const installationId = repository.organization?.installationId;
      if (!installationId) {
        throw new ValidationError('GitHub App not installed');
      }

      const github = createGitHubClient({
        appId: config.GITHUB_APP_ID!,
        privateKey: config.GITHUB_APP_PRIVATE_KEY!,
        installationId,
      });

      const result = await mergeQueue.rebaseAndRetry(
        github,
        owner,
        repo,
        repository.id,
        parseInt(prNumber, 10)
      );

      if (result.success) {
        return { success: true, message: result.message };
      } else {
        throw new ValidationError(result.message);
      }
    } catch (error) {
      logger.error({ error, owner, repo, prNumber }, 'Failed to rebase PR');
      throw error;
    }
  });

  // Get queue statistics
  app.get<{
    Params: { owner: string; repo: string };
  }>('/repositories/:owner/:repo/merge-queue/stats', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        throw new NotFoundError('Repository', `${owner}/${repo}`);
      }

      const queue = await mergeQueue.getQueue(repository.id);
      const queueConfig = await mergeQueue.getConfig(repository.id);

      const stats = {
        totalInQueue: queue.length,
        byStatus: {
          queued: queue.filter(i => i.status === 'queued').length,
          checking: queue.filter(i => i.status === 'checking').length,
          ready: queue.filter(i => i.status === 'ready').length,
          merging: queue.filter(i => i.status === 'merging').length,
          blocked: queue.filter(i => i.status === 'blocked').length,
          conflicted: queue.filter(i => i.status === 'conflicted').length,
          failed: queue.filter(i => i.status === 'failed').length,
        },
        config: {
          autoMergeEnabled: queueConfig.autoMergeEnabled,
          autoResolveConflicts: queueConfig.autoResolveConflicts,
          batchSize: queueConfig.batchSize,
        },
        oldestItem: queue.length > 0 
          ? { prNumber: queue[0].prNumber, addedAt: queue[0].addedAt }
          : null,
      };

      return stats;
    } catch (error) {
      logger.error({ error, owner, repo }, 'Failed to get queue stats');
      throw error;
    }
  });
}
