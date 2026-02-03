/**
 * @fileoverview Merge Queue Service for PRFlow.
 *
 * Implements an intelligent merge queue that orchestrates PR merging:
 *
 * **Features:**
 * - Priority-based queue ordering
 * - CI status checks before merge
 * - Merge conflict detection and handling
 * - Auto-rebase capabilities
 * - Batch merging support
 * - Real-time status updates via WebSocket
 *
 * **Queue States:**
 * - `queued`: PR is waiting in queue
 * - `checking`: Running pre-merge checks
 * - `ready`: All checks passed, ready to merge
 * - `merging`: Currently being merged
 * - `merged`: Successfully merged
 * - `blocked`: Blocked by failing checks or reviews
 * - `conflicted`: Has merge conflicts
 * - `failed`: Merge attempt failed
 *
 * **Configuration Options:**
 * - Required approvals count
 * - CI check requirements
 * - Up-to-date branch requirement
 * - Conflict detection/resolution
 * - Merge method (merge, squash, rebase)
 * - Batch size for parallel merging
 *
 * @module services/merge-queue
 */

import type { GitHubClient } from '@prflow/github-client';
import { db } from '@prflow/db';
import { getRedisClient } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { notifyWorkflowUpdate } from '../lib/websocket.js';

/**
 * Represents a PR in the merge queue.
 */
export interface MergeQueueItem {
  id: string;
  repositoryId: string;
  prNumber: number;
  prTitle: string;
  authorLogin: string;
  headSha: string;
  baseBranch: string;
  status: 'queued' | 'checking' | 'ready' | 'merging' | 'merged' | 'failed' | 'blocked' | 'conflicted';
  position: number;
  addedAt: Date;
  checksPassedAt?: Date;
  mergedAt?: Date;
  failureReason?: string;
  priority: number;
  conflictsWith?: number[];
}

export interface MergeQueueConfig {
  enabled: boolean;
  autoMergeEnabled: boolean;
  requireApprovals: number;
  requireChecks: boolean;
  requireUpToDate: boolean;
  checkConflicts: boolean;
  autoResolveConflicts: boolean;
  mergeMethod: 'merge' | 'squash' | 'rebase';
  batchSize: number;
  maxWaitTimeMinutes: number;
}

const DEFAULT_CONFIG: MergeQueueConfig = {
  enabled: true,
  autoMergeEnabled: false,
  requireApprovals: 1,
  requireChecks: true,
  requireUpToDate: true,
  checkConflicts: true,
  autoResolveConflicts: false,
  mergeMethod: 'squash',
  batchSize: 1,
  maxWaitTimeMinutes: 60,
};

export class MergeQueueService {
  private redis = getRedisClient();

  async addToQueue(
    github: GitHubClient,
    owner: string,
    repo: string,
    repositoryId: string,
    prNumber: number,
    priority = 0
  ): Promise<MergeQueueItem> {
    const pr = await github.getPullRequest(owner, repo, prNumber);
    
    const queueKey = this.getQueueKey(repositoryId);
    const itemId = `${repositoryId}:${prNumber}`;

    // Check if already in queue
    const existing = await this.getQueueItem(repositoryId, prNumber);
    if (existing) {
      logger.info({ prNumber, repositoryId }, 'PR already in merge queue');
      return existing;
    }

    // Get current queue position
    const queueLength = await this.redis.zcard(queueKey);

    const item: MergeQueueItem = {
      id: itemId,
      repositoryId,
      prNumber,
      prTitle: pr.title,
      authorLogin: pr.author.login,
      headSha: pr.head.sha,
      baseBranch: pr.base.ref,
      status: 'queued',
      position: queueLength + 1,
      addedAt: new Date(),
      priority,
    };

    // Add to Redis sorted set (score = timestamp - priority * 1000000 for ordering)
    const score = Date.now() - priority * 1000000;
    await this.redis.zadd(queueKey, score.toString(), JSON.stringify(item));

    logger.info({ prNumber, repositoryId, position: item.position }, 'PR added to merge queue');

    // Notify via WebSocket
    await notifyWorkflowUpdate(repositoryId, itemId, 'merge_queue_joined', {
      prNumber,
      position: item.position,
    });

    // Trigger queue processing
    await this.processQueue(github, owner, repo, repositoryId);

    return item;
  }

  async removeFromQueue(repositoryId: string, prNumber: number): Promise<void> {
    const queueKey = this.getQueueKey(repositoryId);
    const itemId = `${repositoryId}:${prNumber}`;

    // Find and remove the item
    const items = await this.redis.zrange(queueKey, 0, -1);
    for (const itemJson of items) {
      const item: MergeQueueItem = JSON.parse(itemJson);
      if (item.prNumber === prNumber) {
        await this.redis.zrem(queueKey, itemJson);
        logger.info({ prNumber, repositoryId }, 'PR removed from merge queue');
        
        await notifyWorkflowUpdate(repositoryId, itemId, 'merge_queue_left', { prNumber });
        break;
      }
    }

    // Reposition remaining items
    await this.updatePositions(repositoryId);
  }

  async getQueueItem(repositoryId: string, prNumber: number): Promise<MergeQueueItem | null> {
    const queueKey = this.getQueueKey(repositoryId);
    const items = await this.redis.zrange(queueKey, 0, -1);
    
    for (const itemJson of items) {
      const item: MergeQueueItem = JSON.parse(itemJson);
      if (item.prNumber === prNumber) {
        return item;
      }
    }
    
    return null;
  }

  async getQueue(repositoryId: string): Promise<MergeQueueItem[]> {
    const queueKey = this.getQueueKey(repositoryId);
    const items = await this.redis.zrange(queueKey, 0, -1);
    
    return items.map((itemJson, index) => {
      const item: MergeQueueItem = JSON.parse(itemJson);
      item.position = index + 1;
      return item;
    });
  }

  async processQueue(
    github: GitHubClient,
    owner: string,
    repo: string,
    repositoryId: string
  ): Promise<void> {
    const config = await this.getConfig(repositoryId);
    
    if (!config.enabled) {
      logger.debug({ repositoryId }, 'Merge queue disabled');
      return;
    }

    const queue = await this.getQueue(repositoryId);
    
    if (queue.length === 0) {
      logger.debug({ repositoryId }, 'Merge queue empty');
      return;
    }

    // Process items at the front of the queue
    const itemsToProcess = queue.slice(0, config.batchSize);

    for (const item of itemsToProcess) {
      try {
        await this.processQueueItem(github, owner, repo, item, config);
      } catch (error) {
        logger.error({ error, prNumber: item.prNumber }, 'Failed to process merge queue item');
        await this.updateItemStatus(repositoryId, item.prNumber, 'failed', {
          failureReason: (error as Error).message,
        });
      }
    }
  }

  private async processQueueItem(
    github: GitHubClient,
    owner: string,
    repo: string,
    item: MergeQueueItem,
    config: MergeQueueConfig
  ): Promise<void> {
    const { prNumber, repositoryId } = item;

    // Update status to checking
    await this.updateItemStatus(repositoryId, prNumber, 'checking');

    // Get current PR state
    const pr = await github.getPullRequest(owner, repo, prNumber);

    // Check if PR is still open
    if (pr.state !== 'open') {
      await this.removeFromQueue(repositoryId, prNumber);
      return;
    }

    // Check if PR is draft
    if (pr.draft) {
      await this.updateItemStatus(repositoryId, prNumber, 'blocked', {
        failureReason: 'PR is in draft state',
      });
      return;
    }

    // Check required status checks
    if (config.requireChecks) {
      const checksPass = await this.checkStatusChecks(github, owner, repo, pr.head.sha);
      if (!checksPass) {
        await this.updateItemStatus(repositoryId, prNumber, 'blocked', {
          failureReason: 'Required status checks have not passed',
        });
        return;
      }
    }

    // Check required approvals
    if (config.requireApprovals > 0) {
      const hasApprovals = await this.checkApprovals(github, owner, repo, prNumber, config.requireApprovals);
      if (!hasApprovals) {
        await this.updateItemStatus(repositoryId, prNumber, 'blocked', {
          failureReason: `Requires ${config.requireApprovals} approval(s)`,
        });
        return;
      }
    }

    // Check if branch is up to date
    if (config.requireUpToDate) {
      const isUpToDate = await this.checkUpToDate(github, owner, repo, prNumber);
      if (!isUpToDate) {
        // Try to auto-update if enabled
        if (config.autoResolveConflicts) {
          const updated = await this.tryAutoUpdateBranch(github, owner, repo, prNumber);
          if (updated) {
            logger.info({ prNumber, repositoryId }, 'Branch auto-updated, re-queuing for checks');
            await this.updateItemStatus(repositoryId, prNumber, 'queued', {
              failureReason: undefined,
            });
            // Re-trigger processing after a delay to allow CI to run
            return;
          }
        }
        await this.updateItemStatus(repositoryId, prNumber, 'blocked', {
          failureReason: 'Branch is not up to date with base branch',
        });
        return;
      }
    }

    // Check for merge conflicts
    if (config.checkConflicts) {
      const conflictResult = await this.checkConflicts(github, owner, repo, repositoryId, item);
      if (conflictResult.hasConflicts) {
        // Try to auto-resolve if enabled
        if (config.autoResolveConflicts) {
          const resolved = await this.tryAutoResolveConflicts(github, owner, repo, prNumber, conflictResult.conflictsWith);
          if (resolved) {
            logger.info({ prNumber, repositoryId }, 'Conflicts auto-resolved, re-queuing for checks');
            await this.updateItemStatus(repositoryId, prNumber, 'queued', {
              failureReason: undefined,
              conflictsWith: undefined,
            });
            return;
          }
        }
        await this.updateItemStatus(repositoryId, prNumber, 'conflicted', {
          failureReason: `Merge conflicts detected with ${conflictResult.conflictsWith.length} other PR(s)`,
          conflictsWith: conflictResult.conflictsWith,
        });
        return;
      }
    }

    // All checks passed - ready to merge
    await this.updateItemStatus(repositoryId, prNumber, 'ready', {
      checksPassedAt: new Date(),
    });

    // Auto-merge if enabled
    if (config.autoMergeEnabled) {
      await this.mergePR(github, owner, repo, repositoryId, prNumber, config);
    }
  }

  private async checkStatusChecks(
    github: GitHubClient,
    owner: string,
    repo: string,
    sha: string
  ): Promise<boolean> {
    try {
      // Check both status API and check runs API
      const [statusResult, checksResult] = await Promise.all([
        github.getCombinedStatus(owner, repo, sha),
        github.getCheckRuns(owner, repo, sha),
      ]);

      // Status API check
      if (statusResult.state === 'failure') {
        logger.debug({ sha, state: statusResult.state }, 'Status checks failed');
        return false;
      }

      // Check Runs API check
      if (checksResult.conclusion === 'failure') {
        logger.debug({ sha, conclusion: checksResult.conclusion }, 'Check runs failed');
        return false;
      }

      // If any are still pending, consider it not passing yet
      if (statusResult.state === 'pending' || checksResult.conclusion === 'pending') {
        logger.debug({ sha }, 'Status checks still pending');
        return false;
      }

      return true;
    } catch (error) {
      logger.warn({ error, sha }, 'Failed to check status');
      return false;
    }
  }

  private async checkApprovals(
    github: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number,
    required: number
  ): Promise<boolean> {
    try {
      const reviews = await github.getReviews(owner, repo, prNumber);
      
      // Get the latest review state per user (a user can review multiple times)
      const latestReviewByUser = new Map<string, string>();
      
      for (const review of reviews) {
        const login = review.user.login;
        // Only count approved or changes_requested as the latest state
        if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED') {
          latestReviewByUser.set(login, review.state);
        }
      }

      // Count approvals (excluding any users who later requested changes)
      const approvalCount = Array.from(latestReviewByUser.values())
        .filter((state) => state === 'APPROVED').length;

      // Check if any reviewer has requested changes
      const hasChangesRequested = Array.from(latestReviewByUser.values())
        .some((state) => state === 'CHANGES_REQUESTED');

      if (hasChangesRequested) {
        logger.debug({ prNumber }, 'PR has changes requested');
        return false;
      }

      logger.debug({ prNumber, approvalCount, required }, 'Checking approvals');
      return approvalCount >= required;
    } catch (error) {
      logger.warn({ error, prNumber }, 'Failed to check approvals');
      return false;
    }
  }

  private async checkUpToDate(
    github: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<boolean> {
    try {
      const pr = await github.getPullRequest(owner, repo, prNumber);
      const comparison = await github.compareBranches(
        owner,
        repo,
        pr.base.ref,
        pr.head.ref
      );

      // PR is up to date if the head branch is not behind the base branch
      const isUpToDate = comparison.behindBy === 0;
      
      logger.debug({ 
        prNumber, 
        behindBy: comparison.behindBy, 
        status: comparison.status,
        isUpToDate 
      }, 'Branch comparison result');

      return isUpToDate;
    } catch (error) {
      logger.warn({ error, prNumber }, 'Failed to check if branch is up to date');
      return false;
    }
  }

  private async tryAutoUpdateBranch(
    github: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<boolean> {
    try {
      logger.info({ prNumber, owner, repo }, 'Attempting to auto-update branch');
      
      // Use GitHub's update branch API
      await github.updateBranch(owner, repo, prNumber);
      
      logger.info({ prNumber, owner, repo }, 'Branch auto-updated successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Check if it's a merge conflict that can't be auto-resolved
      if (errorMessage.includes('merge conflict') || errorMessage.includes('Merge conflict')) {
        logger.info({ prNumber, error: errorMessage }, 'Cannot auto-update: merge conflicts exist');
        return false;
      }
      
      logger.warn({ error, prNumber }, 'Failed to auto-update branch');
      return false;
    }
  }

  private async tryAutoResolveConflicts(
    github: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number,
    conflictingPRs: number[]
  ): Promise<boolean> {
    try {
      logger.info({ prNumber, conflictingPRs }, 'Attempting to auto-resolve conflicts');

      // Strategy: Update the PR branch with the base branch
      // This works when the conflicts are just about being behind, not actual code conflicts
      const pr = await github.getPullRequest(owner, repo, prNumber);
      
      // First try to update the branch
      try {
        await github.updateBranch(owner, repo, prNumber);
        
        // Check if update resolved the issue
        const newComparison = await github.compareBranches(
          owner,
          repo,
          pr.base.ref,
          pr.head.ref
        );

        if (newComparison.behindBy === 0) {
          logger.info({ prNumber }, 'Conflicts resolved by updating branch');
          return true;
        }
      } catch (updateError) {
        // Update failed, likely due to actual merge conflicts
        logger.debug({ prNumber, error: updateError }, 'Branch update failed');
      }

      // If we get here, we couldn't auto-resolve
      // In a more advanced implementation, we could:
      // 1. Create a temporary merge commit
      // 2. Use GitHub's merge-upstream API
      // 3. Attempt automatic conflict resolution for simple cases
      
      logger.info({ prNumber }, 'Could not auto-resolve conflicts');
      return false;
    } catch (error) {
      logger.warn({ error, prNumber }, 'Failed to auto-resolve conflicts');
      return false;
    }
  }

  async rebaseAndRetry(
    github: GitHubClient,
    owner: string,
    repo: string,
    repositoryId: string,
    prNumber: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      const item = await this.getQueueItem(repositoryId, prNumber);
      if (!item) {
        return { success: false, message: 'PR not found in queue' };
      }

      // Try to update the branch
      const updated = await this.tryAutoUpdateBranch(github, owner, repo, prNumber);
      
      if (updated) {
        // Reset status and re-queue
        await this.updateItemStatus(repositoryId, prNumber, 'queued', {
          failureReason: undefined,
          conflictsWith: undefined,
        });

        // Notify
        await notifyWorkflowUpdate(repositoryId, item.id, 'rebase_started', {
          prNumber,
        });

        // Trigger re-processing
        await this.processQueue(github, owner, repo, repositoryId);

        return { success: true, message: 'Branch updated and re-queued for processing' };
      }

      return { success: false, message: 'Could not update branch - manual rebase required' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error, prNumber }, 'Failed to rebase and retry');
      return { success: false, message: `Rebase failed: ${errorMessage}` };
    }
  }

  private async checkConflicts(
    github: GitHubClient,
    owner: string,
    repo: string,
    repositoryId: string,
    currentItem: MergeQueueItem
  ): Promise<{ hasConflicts: boolean; conflictsWith: number[] }> {
    const conflictsWith: number[] = [];

    try {
      // Get the current PR's files
      const currentPR = await github.getPullRequest(owner, repo, currentItem.prNumber);
      const currentFiles = await github.getChangedFiles(owner, repo, currentItem.prNumber);
      const currentFileSet = new Set(currentFiles.map(f => f.filename));

      // Get all other PRs in the queue
      const queue = await this.getQueue(repositoryId);
      const otherItems = queue.filter(item =>
        item.prNumber !== currentItem.prNumber &&
        item.baseBranch === currentPR.base.ref &&
        item.position < currentItem.position // Only check against PRs ahead in queue
      );

      // Check each PR for overlapping files
      for (const otherItem of otherItems) {
        try {
          const otherFiles = await github.getChangedFiles(owner, repo, otherItem.prNumber);
          const overlappingFiles = otherFiles.filter(f => currentFileSet.has(f.filename));

          if (overlappingFiles.length > 0) {
            // Files overlap - check if there are actual conflicts
            const hasActualConflict = await this.detectActualConflict(
              github,
              owner,
              repo,
              currentItem.prNumber,
              otherItem.prNumber,
              overlappingFiles.map(f => f.filename)
            );

            if (hasActualConflict) {
              conflictsWith.push(otherItem.prNumber);
              logger.info({
                currentPR: currentItem.prNumber,
                conflictingPR: otherItem.prNumber,
                overlappingFiles: overlappingFiles.map(f => f.filename),
              }, 'Potential merge conflict detected');
            }
          }
        } catch (error) {
          logger.warn({ error, prNumber: otherItem.prNumber }, 'Failed to check files for other PR');
        }
      }

      return {
        hasConflicts: conflictsWith.length > 0,
        conflictsWith,
      };
    } catch (error) {
      logger.warn({ error, prNumber: currentItem.prNumber }, 'Failed to check conflicts');
      return { hasConflicts: false, conflictsWith: [] };
    }
  }

  private async detectActualConflict(
    github: GitHubClient,
    owner: string,
    repo: string,
    prNumber1: number,
    prNumber2: number,
    overlappingFiles: string[]
  ): Promise<boolean> {
    try {
      // Get the file changes for both PRs
      const [files1, files2] = await Promise.all([
        github.getChangedFiles(owner, repo, prNumber1),
        github.getChangedFiles(owner, repo, prNumber2),
      ]);

      // Check overlapping files for line overlap
      for (const filename of overlappingFiles) {
        const file1 = files1.find(f => f.filename === filename);
        const file2 = files2.find(f => f.filename === filename);

        if (!file1 || !file2) continue;

        // If both files have patches, check for line overlap
        if (file1.patch && file2.patch) {
          const ranges1 = this.extractChangedLineRanges(file1.patch);
          const ranges2 = this.extractChangedLineRanges(file2.patch);

          if (this.rangesOverlap(ranges1, ranges2)) {
            logger.debug({
              filename,
              prNumber1,
              prNumber2,
              ranges1,
              ranges2,
            }, 'Line ranges overlap - conflict detected');
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      logger.warn({ error, prNumber1, prNumber2 }, 'Failed to detect actual conflict');
      // Conservative approach: if we can't check, assume no conflict
      return false;
    }
  }

  private extractChangedLineRanges(patch: string): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const hunkHeaderRegex = /@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/g;

    let match;
    while ((match = hunkHeaderRegex.exec(patch)) !== null) {
      const start = parseInt(match[1], 10);
      const length = match[2] ? parseInt(match[2], 10) : 1;
      ranges.push({ start, end: start + length - 1 });
    }

    return ranges;
  }

  private rangesOverlap(
    ranges1: Array<{ start: number; end: number }>,
    ranges2: Array<{ start: number; end: number }>
  ): boolean {
    for (const r1 of ranges1) {
      for (const r2 of ranges2) {
        // Check if ranges overlap (with a buffer of 3 lines for context)
        const buffer = 3;
        if (r1.start - buffer <= r2.end && r1.end + buffer >= r2.start) {
          return true;
        }
      }
    }
    return false;
  }

  async getConflictingPRs(
    github: GitHubClient,
    owner: string,
    repo: string,
    repositoryId: string,
    prNumber: number
  ): Promise<{ prNumber: number; title: string; files: string[] }[]> {
    const currentItem = await this.getQueueItem(repositoryId, prNumber);
    if (!currentItem) {
      return [];
    }

    const result = await this.checkConflicts(github, owner, repo, repositoryId, currentItem);
    if (!result.hasConflicts) {
      return [];
    }

    const conflictingPRs: { prNumber: number; title: string; files: string[] }[] = [];
    const currentFiles = await github.getChangedFiles(owner, repo, prNumber);
    const currentFileSet = new Set(currentFiles.map(f => f.filename));

    for (const conflictingPrNumber of result.conflictsWith) {
      try {
        const pr = await github.getPullRequest(owner, repo, conflictingPrNumber);
        const otherFiles = await github.getChangedFiles(owner, repo, conflictingPrNumber);
        const overlappingFiles = otherFiles
          .filter(f => currentFileSet.has(f.filename))
          .map(f => f.filename);

        conflictingPRs.push({
          prNumber: conflictingPrNumber,
          title: pr.title,
          files: overlappingFiles,
        });
      } catch (error) {
        logger.warn({ error, prNumber: conflictingPrNumber }, 'Failed to get conflicting PR details');
      }
    }

    return conflictingPRs;
  }

  private async mergePR(
    github: GitHubClient,
    owner: string,
    repo: string,
    repositoryId: string,
    prNumber: number,
    config: MergeQueueConfig
  ): Promise<void> {
    await this.updateItemStatus(repositoryId, prNumber, 'merging');

    try {
      await github.mergePullRequest(owner, repo, prNumber, {
        mergeMethod: config.mergeMethod,
      });

      await this.updateItemStatus(repositoryId, prNumber, 'merged', {
        mergedAt: new Date(),
      });

      // Remove from queue
      await this.removeFromQueue(repositoryId, prNumber);

      logger.info({ prNumber, repositoryId }, 'PR merged successfully');

      // Notify via WebSocket
      await notifyWorkflowUpdate(repositoryId, `${repositoryId}:${prNumber}`, 'merged', {
        prNumber,
      });

      // Process next item in queue
      await this.processQueue(github, owner, repo, repositoryId);
    } catch (error) {
      await this.updateItemStatus(repositoryId, prNumber, 'failed', {
        failureReason: (error as Error).message,
      });
      throw error;
    }
  }

  private async updateItemStatus(
    repositoryId: string,
    prNumber: number,
    status: MergeQueueItem['status'],
    updates: Partial<MergeQueueItem> = {}
  ): Promise<void> {
    const queueKey = this.getQueueKey(repositoryId);
    // Use zrange with WITHSCORES option
    const itemsWithScores = await this.redis.zrange(queueKey, 0, -1, 'WITHSCORES');

    for (let i = 0; i < itemsWithScores.length; i += 2) {
      const itemJson = itemsWithScores[i];
      const score = itemsWithScores[i + 1];
      const item: MergeQueueItem = JSON.parse(itemJson);
      
      if (item.prNumber === prNumber) {
        const updatedItem = { ...item, status, ...updates };
        
        await this.redis.zrem(queueKey, itemJson);
        await this.redis.zadd(queueKey, parseFloat(score), JSON.stringify(updatedItem));
        
        // Notify via WebSocket
        await notifyWorkflowUpdate(repositoryId, item.id, 'merge_queue_status', {
          prNumber,
          status,
          ...updates,
        });
        
        break;
      }
    }
  }

  private async updatePositions(repositoryId: string): Promise<void> {
    const queue = await this.getQueue(repositoryId);
    
    for (let i = 0; i < queue.length; i++) {
      if (queue[i].position !== i + 1) {
        await this.updateItemStatus(repositoryId, queue[i].prNumber, queue[i].status, {
          position: i + 1,
        });
      }
    }
  }

  async getConfig(repositoryId: string): Promise<MergeQueueConfig> {
    try {
      const settings = await db.repositorySettings.findUnique({
        where: { repositoryId },
      });

      if (settings?.customRules) {
        const rules = settings.customRules as Record<string, unknown>;
        const mergeQueue = rules.mergeQueue as Partial<MergeQueueConfig> | undefined;
        
        if (mergeQueue) {
          return { ...DEFAULT_CONFIG, ...mergeQueue };
        }
      }
    } catch {
      // Use defaults
    }

    return DEFAULT_CONFIG;
  }

  async setConfig(repositoryId: string, config: Partial<MergeQueueConfig>): Promise<void> {
    const settings = await db.repositorySettings.findUnique({
      where: { repositoryId },
    });

    const customRules = (settings?.customRules || {}) as Record<string, unknown>;
    customRules.mergeQueue = { ...DEFAULT_CONFIG, ...config };

    await db.repositorySettings.update({
      where: { repositoryId },
      data: { customRules: JSON.parse(JSON.stringify(customRules)) },
    });
  }

  private getQueueKey(repositoryId: string): string {
    return `merge_queue:${repositoryId}`;
  }
}

// Singleton instance
let mergeQueueService: MergeQueueService | null = null;

export function getMergeQueueService(): MergeQueueService {
  if (!mergeQueueService) {
    mergeQueueService = new MergeQueueService();
  }
  return mergeQueueService;
}
