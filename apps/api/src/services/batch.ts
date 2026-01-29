import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { ValidationError } from '../lib/errors.js';

interface BatchOperationResult<T> {
  succeeded: T[];
  failed: Array<{ item: unknown; error: string }>;
  total: number;
  successCount: number;
  failureCount: number;
}

/**
 * Service for batch operations on workflows and repositories
 */
export class BatchService {
  /**
   * Retry multiple failed workflows
   */
  async retryWorkflows(
    workflowIds: string[],
    userId: string
  ): Promise<BatchOperationResult<{ id: string; status: string }>> {
    if (workflowIds.length === 0) {
      throw new ValidationError('No workflow IDs provided');
    }

    if (workflowIds.length > 100) {
      throw new ValidationError('Cannot retry more than 100 workflows at once');
    }

    const results: BatchOperationResult<{ id: string; status: string }> = {
      succeeded: [],
      failed: [],
      total: workflowIds.length,
      successCount: 0,
      failureCount: 0,
    };

    for (const workflowId of workflowIds) {
      try {
        const workflow = await db.pRWorkflow.findUnique({
          where: { id: workflowId },
          include: { repository: true },
        });

        if (!workflow) {
          results.failed.push({ item: workflowId, error: 'Workflow not found' });
          results.failureCount++;
          continue;
        }

        if (workflow.status !== 'FAILED') {
          results.failed.push({
            item: workflowId,
            error: `Workflow is not in failed state (current: ${workflow.status})`,
          });
          results.failureCount++;
          continue;
        }

        await db.pRWorkflow.update({
          where: { id: workflowId },
          data: {
            status: 'PENDING',
          },
        });

        results.succeeded.push({ id: workflowId, status: 'PENDING' });
        results.successCount++;
      } catch (error) {
        logger.error({ error, workflowId, userId }, 'Failed to retry workflow');
        results.failed.push({
          item: workflowId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.failureCount++;
      }
    }

    logger.info(
      { userId, total: results.total, succeeded: results.successCount, failed: results.failureCount },
      'Batch retry completed'
    );

    return results;
  }

  /**
   * Update settings for multiple repositories
   */
  async updateRepositorySettings(
    repositoryIds: string[],
    settings: {
      reviewEnabled?: boolean;
      testGenerationEnabled?: boolean;
      docUpdatesEnabled?: boolean;
    },
    userId: string
  ): Promise<BatchOperationResult<{ id: string; fullName: string }>> {
    if (repositoryIds.length === 0) {
      throw new ValidationError('No repository IDs provided');
    }

    if (repositoryIds.length > 50) {
      throw new ValidationError('Cannot update more than 50 repositories at once');
    }

    const results: BatchOperationResult<{ id: string; fullName: string }> = {
      succeeded: [],
      failed: [],
      total: repositoryIds.length,
      successCount: 0,
      failureCount: 0,
    };

    for (const repoId of repositoryIds) {
      try {
        const repo = await db.repository.findUnique({
          where: { id: repoId },
          include: { settings: true },
        });

        if (!repo) {
          results.failed.push({ item: repoId, error: 'Repository not found' });
          results.failureCount++;
          continue;
        }

        // Upsert settings
        await db.repositorySettings.upsert({
          where: { repositoryId: repoId },
          create: {
            repositoryId: repoId,
            reviewEnabled: settings.reviewEnabled ?? true,
            testGenerationEnabled: settings.testGenerationEnabled ?? true,
            docUpdatesEnabled: settings.docUpdatesEnabled ?? true,
          },
          update: {
            ...(settings.reviewEnabled !== undefined && { reviewEnabled: settings.reviewEnabled }),
            ...(settings.testGenerationEnabled !== undefined && { testGenerationEnabled: settings.testGenerationEnabled }),
            ...(settings.docUpdatesEnabled !== undefined && { docUpdatesEnabled: settings.docUpdatesEnabled }),
          },
        });

        results.succeeded.push({ id: repoId, fullName: repo.fullName });
        results.successCount++;
      } catch (error) {
        logger.error({ error, repoId, userId }, 'Failed to update repository settings');
        results.failed.push({
          item: repoId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.failureCount++;
      }
    }

    logger.info(
      { userId, total: results.total, succeeded: results.successCount, failed: results.failureCount },
      'Batch settings update completed'
    );

    return results;
  }

  /**
   * Delete multiple completed workflows (for cleanup)
   */
  async deleteWorkflows(
    workflowIds: string[],
    userId: string
  ): Promise<BatchOperationResult<{ id: string }>> {
    if (workflowIds.length === 0) {
      throw new ValidationError('No workflow IDs provided');
    }

    if (workflowIds.length > 100) {
      throw new ValidationError('Cannot delete more than 100 workflows at once');
    }

    const results: BatchOperationResult<{ id: string }> = {
      succeeded: [],
      failed: [],
      total: workflowIds.length,
      successCount: 0,
      failureCount: 0,
    };

    // Use transaction for bulk delete
    try {
      const deleteResult = await db.pRWorkflow.deleteMany({
        where: {
          id: { in: workflowIds },
          status: { in: ['COMPLETED', 'FAILED'] }, // Only delete finished workflows
        },
      });

      results.successCount = deleteResult.count;
      results.failureCount = workflowIds.length - deleteResult.count;

      // Since we can't know which IDs were deleted vs failed with deleteMany,
      // verify what actually exists
      const remainingWorkflows = await db.pRWorkflow.findMany({
        where: { id: { in: workflowIds } },
        select: { id: true },
      });

      const remainingIds = new Set(remainingWorkflows.map((w: { id: string }) => w.id));
      
      for (const id of workflowIds) {
        if (remainingIds.has(id)) {
          results.failed.push({ item: id, error: 'Not eligible for deletion (may be in progress)' });
        } else {
          results.succeeded.push({ id });
        }
      }
    } catch (error) {
      logger.error({ error, userId }, 'Batch delete failed');
      for (const id of workflowIds) {
        results.failed.push({
          item: id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.failureCount++;
      }
    }

    logger.info(
      { userId, total: results.total, succeeded: results.successCount, failed: results.failureCount },
      'Batch delete completed'
    );

    return results;
  }

  /**
   * Bulk enable/disable review for multiple repositories
   */
  async toggleReview(
    repositoryIds: string[],
    enabled: boolean,
    userId: string
  ): Promise<BatchOperationResult<{ id: string; fullName: string }>> {
    return this.updateRepositorySettings(
      repositoryIds,
      { reviewEnabled: enabled },
      userId
    );
  }
}

export const batchService = new BatchService();
