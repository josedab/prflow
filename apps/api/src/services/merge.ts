import { db } from '@prflow/db';
import { createGitHubClient, type GitHubClientConfig } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

interface MergeQueueItem {
  id: string;
  repositoryId: string;
  prNumber: number;
  priority: number;
  status: 'queued' | 'checking' | 'ready' | 'merging' | 'merged' | 'failed';
  owner: string;
  repo: string;
  headSha: string;
  addedAt: Date;
}

export interface MergeConfig {
  method: 'merge' | 'squash' | 'rebase';
  deleteSourceBranch: boolean;
  requireApprovals: number;
  requireChecks: boolean;
}

export class MergeOrchestrator {
  private github: ReturnType<typeof createGitHubClient>;
  private queue: Map<string, MergeQueueItem> = new Map();
  private processing = false;
  readonly config: GitHubClientConfig;

  constructor(config: GitHubClientConfig) {
    this.config = config;
    this.github = createGitHubClient(config);
  }

  async addToQueue(
    repositoryId: string,
    prNumber: number,
    owner: string,
    repo: string,
    headSha: string,
    priority: number = 0
  ): Promise<string> {
    const id = `${owner}/${repo}#${prNumber}`;

    const item: MergeQueueItem = {
      id,
      repositoryId,
      prNumber,
      priority,
      status: 'queued',
      owner,
      repo,
      headSha,
      addedAt: new Date(),
    };

    this.queue.set(id, item);
    logger.info({ id, priority }, 'Added PR to merge queue');

    // Trigger processing
    this.processQueue();

    return id;
  }

  async removeFromQueue(id: string): Promise<void> {
    this.queue.delete(id);
    logger.info({ id }, 'Removed PR from merge queue');
  }

  getQueueStatus(): MergeQueueItem[] {
    return Array.from(this.queue.values())
      .sort((a, b) => b.priority - a.priority || a.addedAt.getTime() - b.addedAt.getTime());
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const items = this.getQueueStatus();

      for (const item of items) {
        if (item.status !== 'queued' && item.status !== 'ready') continue;

        try {
          // Check if PR is mergeable
          if (item.status === 'queued') {
            item.status = 'checking';
            const canMerge = await this.checkMergeability(item);
            
            if (canMerge) {
              item.status = 'ready';
            } else {
              // Keep in queue for retry
              item.status = 'queued';
              continue;
            }
          }

          // Attempt merge
          if (item.status === 'ready') {
            item.status = 'merging';
            await this.mergePR(item);
            item.status = 'merged';
            this.queue.delete(item.id);
            logger.info({ id: item.id }, 'Successfully merged PR');
          }
        } catch (error) {
          item.status = 'failed';
          logger.error({ id: item.id, error }, 'Failed to process merge queue item');
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async checkMergeability(item: MergeQueueItem): Promise<boolean> {
    try {
      const pr = await this.github.getPullRequest(item.owner, item.repo, item.prNumber);

      // Check if PR is still open
      if (pr.state !== 'open') {
        logger.info({ id: item.id }, 'PR is no longer open');
        return false;
      }

      // Check if PR is a draft
      if (pr.draft) {
        logger.info({ id: item.id }, 'PR is still a draft');
        return false;
      }

      // Get merge status (would check branch protection, reviews, etc.)
      // This is simplified - production would check GitHub's merge status API

      return true;
    } catch (error) {
      logger.error({ id: item.id, error }, 'Failed to check mergeability');
      return false;
    }
  }

  private async mergePR(item: MergeQueueItem): Promise<void> {
    // Get repository settings for merge method (currently unused but retrieved for future features)
    await db.repositorySettings.findFirst({
      where: { repositoryId: item.repositoryId },
    });

    const mergeMethod = 'squash'; // Default, could come from settings

    await this.github.mergePullRequest(item.owner, item.repo, item.prNumber, {
      mergeMethod,
      commitTitle: `Merge PR #${item.prNumber}`,
    });
  }

  async checkConflicts(_owner: string, _repo: string, _prNumber: number): Promise<{
    hasConflicts: boolean;
    conflictingFiles: string[];
  }> {
    try {
      // Simple conflict detection - in production, would use GitHub's mergeable field
      // and potentially fetch merge-base to analyze conflicts
      
      return {
        hasConflicts: false,
        conflictingFiles: [],
      };
    } catch (error) {
      logger.error({ error }, 'Failed to check conflicts');
      return {
        hasConflicts: true,
        conflictingFiles: [],
      };
    }
  }

  async resolveSimpleConflicts(
    _owner: string,
    _repo: string,
    prNumber: number
  ): Promise<boolean> {
    // In production, this would:
    // 1. Fetch the PR branch
    // 2. Attempt to merge base branch
    // 3. For simple conflicts (like package-lock.json), auto-resolve
    // 4. Push the resolution
    
    logger.info({ prNumber }, 'Simple conflict resolution not implemented');
    return false;
  }
}

export function createMergeOrchestrator(config: GitHubClientConfig): MergeOrchestrator {
  return new MergeOrchestrator(config);
}
