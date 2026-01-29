import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

export interface MultiRepoChange {
  id: string;
  name: string;
  description: string;
  repositories: RepositoryChange[];
  status: 'draft' | 'in_progress' | 'ready' | 'merging' | 'completed' | 'failed' | 'rolled_back';
  mergeOrder: string[]; // repository IDs in merge order
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface RepositoryChange {
  repositoryId: string;
  repositoryName: string;
  prNumber?: number;
  prUrl?: string;
  branchName: string;
  status: 'pending' | 'pr_created' | 'approved' | 'merged' | 'failed';
  dependencies: string[]; // repository IDs this depends on
  files: string[];
}

export interface OrchestrationResult {
  changeId: string;
  success: boolean;
  mergedRepositories: string[];
  failedRepositories: string[];
  pendingRepositories: string[];
  rollbackPerformed: boolean;
  error?: string;
}

export class MultiRepoOrchestrationService {
  
  // In-memory store (would use database in production)
  private changes = new Map<string, MultiRepoChange>();

  /**
   * Create a new multi-repo change set
   */
  async createChangeSet(
    name: string,
    description: string,
    repositories: Array<{
      repositoryId: string;
      branchName: string;
      dependencies?: string[];
    }>,
    userId: string
  ): Promise<MultiRepoChange> {
    const id = `mrc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    // Resolve repository names
    const repoChanges: RepositoryChange[] = [];
    for (const repo of repositories) {
      const repository = await db.repository.findUnique({
        where: { id: repo.repositoryId },
      });
      
      if (!repository) {
        throw new Error(`Repository ${repo.repositoryId} not found`);
      }

      repoChanges.push({
        repositoryId: repo.repositoryId,
        repositoryName: repository.fullName,
        branchName: repo.branchName,
        status: 'pending',
        dependencies: repo.dependencies || [],
        files: [],
      });
    }

    // Calculate merge order based on dependencies
    const mergeOrder = this.calculateMergeOrder(repoChanges);

    const change: MultiRepoChange = {
      id,
      name,
      description,
      repositories: repoChanges,
      status: 'draft',
      mergeOrder,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.changes.set(id, change);
    
    logger.info({ changeId: id, repositories: repoChanges.length }, 'Multi-repo change set created');
    
    return change;
  }

  /**
   * Create PRs for all repositories in the change set
   */
  async createPullRequests(
    changeId: string,
    installationId: number,
    options: {
      draft?: boolean;
      labels?: string[];
    } = {}
  ): Promise<{
    success: boolean;
    created: string[];
    failed: string[];
  }> {
    const change = this.changes.get(changeId);
    if (!change) {
      throw new Error(`Change set ${changeId} not found`);
    }

    const created: string[] = [];
    const failed: string[] = [];

    for (const repo of change.repositories) {
      try {
        const github = this.createGitHubClient(installationId);
        const [owner, repoName] = repo.repositoryName.split('/');
        
        const repository = await db.repository.findUnique({
          where: { id: repo.repositoryId },
        });

        if (!repository) {
          failed.push(repo.repositoryId);
          continue;
        }

        // Create PR
        const pr = await github.createPullRequest(
          owner,
          repoName,
          `[Multi-Repo] ${change.name}`,
          repo.branchName,
          repository.defaultBranch,
          this.generatePRBody(change, repo),
          options.draft
        );

        repo.prNumber = pr.number;
        repo.prUrl = pr.url;
        repo.status = 'pr_created';
        
        created.push(repo.repositoryId);
      } catch (error) {
        logger.error({ repositoryId: repo.repositoryId, error }, 'Failed to create PR');
        failed.push(repo.repositoryId);
        repo.status = 'failed';
      }
    }

    change.status = failed.length === 0 ? 'in_progress' : 'draft';
    change.updatedAt = new Date().toISOString();

    return { success: failed.length === 0, created, failed };
  }

  /**
   * Check if all PRs are ready to merge
   */
  async checkMergeReadiness(
    changeId: string,
    installationId: number
  ): Promise<{
    ready: boolean;
    approved: string[];
    pending: string[];
    blocked: string[];
  }> {
    const change = this.changes.get(changeId);
    if (!change) {
      throw new Error(`Change set ${changeId} not found`);
    }

    const approved: string[] = [];
    const pending: string[] = [];
    const blocked: string[] = [];

    for (const repo of change.repositories) {
      if (!repo.prNumber) {
        pending.push(repo.repositoryId);
        continue;
      }

      try {
        const github = this.createGitHubClient(installationId);
        const [owner, repoName] = repo.repositoryName.split('/');
        
        const pr = await github.getPullRequest(owner, repoName, repo.prNumber);
        
        // Check mergeable and approved
        if (!pr.mergeable) {
          blocked.push(repo.repositoryId);
        } else {
          // Check reviews
          const reviews = await github.getReviews(owner, repoName, repo.prNumber);
          const hasApproval = reviews.some(r => r.state === 'APPROVED');
          
          if (hasApproval) {
            repo.status = 'approved';
            approved.push(repo.repositoryId);
          } else {
            pending.push(repo.repositoryId);
          }
        }
      } catch (error) {
        blocked.push(repo.repositoryId);
      }
    }

    const ready = approved.length === change.repositories.length;
    if (ready) {
      change.status = 'ready';
    }
    change.updatedAt = new Date().toISOString();

    return { ready, approved, pending, blocked };
  }

  /**
   * Execute atomic merge of all PRs in order
   */
  async executeMerge(
    changeId: string,
    installationId: number,
    options: {
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      autoRollback?: boolean;
    } = {}
  ): Promise<OrchestrationResult> {
    const change = this.changes.get(changeId);
    if (!change) {
      throw new Error(`Change set ${changeId} not found`);
    }

    if (change.status !== 'ready') {
      return {
        changeId,
        success: false,
        mergedRepositories: [],
        failedRepositories: change.repositories.map(r => r.repositoryId),
        pendingRepositories: [],
        rollbackPerformed: false,
        error: 'Change set is not ready for merge',
      };
    }

    change.status = 'merging';
    change.updatedAt = new Date().toISOString();

    const mergedRepositories: string[] = [];
    const failedRepositories: string[] = [];

    // Merge in dependency order
    for (const repoId of change.mergeOrder) {
      const repo = change.repositories.find(r => r.repositoryId === repoId);
      if (!repo || !repo.prNumber) {
        failedRepositories.push(repoId);
        continue;
      }

      // Check dependencies are merged
      const unmergedDeps = repo.dependencies.filter(d => !mergedRepositories.includes(d));
      if (unmergedDeps.length > 0) {
        failedRepositories.push(repoId);
        logger.warn({ repoId, unmergedDeps }, 'Dependencies not merged');
        continue;
      }

      try {
        const github = this.createGitHubClient(installationId);
        const [owner, repoName] = repo.repositoryName.split('/');

        await github.mergePullRequest(
          owner,
          repoName,
          repo.prNumber,
          {
            commitTitle: `[Multi-Repo] ${change.name}`,
            mergeMethod: options.mergeMethod || 'squash',
          }
        );

        repo.status = 'merged';
        mergedRepositories.push(repoId);
        
        logger.info({ repoId, prNumber: repo.prNumber }, 'PR merged in multi-repo change');
      } catch (error) {
        logger.error({ repoId, error }, 'Failed to merge PR');
        repo.status = 'failed';
        failedRepositories.push(repoId);

        // Stop and potentially rollback
        if (options.autoRollback && mergedRepositories.length > 0) {
          await this.rollback(changeId, installationId, mergedRepositories);
          
          return {
            changeId,
            success: false,
            mergedRepositories: [],
            failedRepositories: change.repositories.map(r => r.repositoryId),
            pendingRepositories: [],
            rollbackPerformed: true,
            error: `Merge failed for ${repoId}, rolled back previous merges`,
          };
        }

        break;
      }
    }

    const pendingRepositories = change.repositories
      .filter(r => r.status !== 'merged' && r.status !== 'failed')
      .map(r => r.repositoryId);

    const success = failedRepositories.length === 0 && pendingRepositories.length === 0;
    change.status = success ? 'completed' : 'failed';
    change.updatedAt = new Date().toISOString();

    return {
      changeId,
      success,
      mergedRepositories,
      failedRepositories,
      pendingRepositories,
      rollbackPerformed: false,
    };
  }

  /**
   * Get change set details
   */
  async getChangeSet(changeId: string): Promise<MultiRepoChange | null> {
    return this.changes.get(changeId) || null;
  }

  /**
   * List all change sets
   */
  async listChangeSets(userId?: string): Promise<MultiRepoChange[]> {
    const all = Array.from(this.changes.values());
    if (userId) {
      return all.filter(c => c.createdBy === userId);
    }
    return all;
  }

  /**
   * Rollback merged changes
   */
  async rollback(
    changeId: string,
    installationId: number,
    repositories?: string[]
  ): Promise<{ reverted: string[]; failed: string[] }> {
    const change = this.changes.get(changeId);
    if (!change) {
      throw new Error(`Change set ${changeId} not found`);
    }

    const toRevert = repositories || 
      change.repositories.filter(r => r.status === 'merged').map(r => r.repositoryId);

    const reverted: string[] = [];
    const failed: string[] = [];

    // Revert in reverse merge order
    for (const repoId of [...toRevert].reverse()) {
      const repo = change.repositories.find(r => r.repositoryId === repoId);
      if (!repo || !repo.prNumber) continue;

      try {
        const github = this.createGitHubClient(installationId);
        const [owner, repoName] = repo.repositoryName.split('/');

        // Create revert PR
        await github.createPullRequest(
          owner,
          repoName,
          `Revert: ${change.name}`,
          `revert-mrc-${changeId}`,
          repo.branchName,
          `Reverting changes from multi-repo change: ${change.name}`
        );

        reverted.push(repoId);
      } catch (error) {
        logger.error({ repoId, error }, 'Failed to revert');
        failed.push(repoId);
      }
    }

    if (reverted.length > 0) {
      change.status = 'rolled_back';
      change.updatedAt = new Date().toISOString();
    }

    return { reverted, failed };
  }

  // Private helpers

  private createGitHubClient(installationId: number): GitHubClient {
    return new GitHubClient({
      appId: process.env.GITHUB_APP_ID || '',
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
      installationId,
    });
  }

  private calculateMergeOrder(repositories: RepositoryChange[]): string[] {
    const order: string[] = [];
    const remaining = [...repositories];
    const added = new Set<string>();

    while (remaining.length > 0) {
      const ready = remaining.filter(r => 
        r.dependencies.every(d => added.has(d))
      );

      if (ready.length === 0) {
        // Circular dependency or missing dependency
        logger.warn('Circular or missing dependencies detected');
        remaining.forEach(r => order.push(r.repositoryId));
        break;
      }

      for (const r of ready) {
        order.push(r.repositoryId);
        added.add(r.repositoryId);
        remaining.splice(remaining.indexOf(r), 1);
      }
    }

    return order;
  }

  private generatePRBody(change: MultiRepoChange, repo: RepositoryChange): string {
    const lines = [
      `## Multi-Repository Change: ${change.name}`,
      '',
      change.description,
      '',
      '### Related Repositories',
      '',
    ];

    for (const r of change.repositories) {
      const marker = r.repositoryId === repo.repositoryId ? '👉' : '  ';
      const status = r.prUrl ? `[#${r.prNumber}](${r.prUrl})` : 'pending';
      lines.push(`${marker} **${r.repositoryName}**: ${status}`);
    }

    lines.push('');
    lines.push('---');
    lines.push(`*Part of multi-repo change: \`${change.id}\`*`);

    return lines.join('\n');
  }
}

export const multiRepoOrchestrationService = new MultiRepoOrchestrationService();
