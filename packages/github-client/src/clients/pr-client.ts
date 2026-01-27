import type { Octokit } from '@octokit/rest';
import type { PullRequest, PRFile, PRDiff } from '@prflow/core';

/**
 * Client module for Pull Request operations.
 * Handles PR fetching, files, reviews, merging, and branch operations.
 */
export class PRClient {
  constructor(private octokit: Octokit) {}

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    const { data } = await this.octokit.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return {
      number: data.number,
      title: data.title,
      body: data.body,
      url: data.url,
      htmlUrl: data.html_url,
      state: data.state as 'open' | 'closed',
      draft: data.draft || false,
      head: {
        ref: data.head.ref,
        sha: data.head.sha,
      },
      base: {
        ref: data.base.ref,
        sha: data.base.sha,
      },
      author: {
        login: data.user?.login || 'unknown',
        avatarUrl: data.user?.avatar_url,
      },
      repository: {
        owner,
        name: repo,
        fullName: `${owner}/${repo}`,
      },
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  }

  async getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<PRDiff> {
    const { data } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    const files: PRFile[] = data.map((file) => ({
      filename: file.filename,
      status: file.status as PRFile['status'],
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
      previousFilename: file.previous_filename,
    }));

    return {
      files,
      totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
      totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
      totalChanges: files.reduce((sum, f) => sum + f.changes, 0),
    };
  }

  async getPullRequestFiles(owner: string, repo: string, pullNumber: number): Promise<Array<{
    path: string;
    additions: number;
    deletions: number;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
    patch?: string;
  }>> {
    const files: Array<{
      path: string;
      additions: number;
      deletions: number;
      status: 'added' | 'modified' | 'deleted' | 'renamed';
      patch?: string;
    }> = [];
    
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const { data } = await this.octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
        page,
      });
      
      for (const file of data) {
        files.push({
          path: file.filename,
          additions: file.additions,
          deletions: file.deletions,
          status: file.status as 'added' | 'modified' | 'deleted' | 'renamed',
          patch: file.patch,
        });
      }
      
      hasMore = data.length === 100;
      page++;
    }
    
    return files;
  }

  async getChangedFiles(owner: string, repo: string, pullNumber: number): Promise<Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    changes: number;
    patch?: string;
  }>> {
    const { data } = await this.octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    return data.map((file) => ({
      filename: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patch,
    }));
  }

  async getReviews(owner: string, repo: string, pullNumber: number): Promise<Array<{
    user: { login: string };
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
    submittedAt: string | undefined;
  }>> {
    const { data } = await this.octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return data.map((review) => ({
      user: { login: review.user?.login || 'unknown' },
      state: review.state as 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING',
      submittedAt: review.submitted_at,
    }));
  }

  async requestReviewers(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewers: string[]
  ): Promise<void> {
    await this.octokit.pulls.requestReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers,
    });
  }

  async removeReviewers(owner: string, repo: string, pullNumber: number, reviewers: string[]): Promise<void> {
    await this.octokit.pulls.removeRequestedReviewers({
      owner,
      repo,
      pull_number: pullNumber,
      reviewers,
    });
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options: {
      mergeMethod?: 'merge' | 'squash' | 'rebase';
      commitTitle?: string;
      commitMessage?: string;
    } = {}
  ): Promise<void> {
    await this.octokit.pulls.merge({
      owner,
      repo,
      pull_number: pullNumber,
      merge_method: options.mergeMethod || 'squash',
      commit_title: options.commitTitle,
      commit_message: options.commitMessage,
    });
  }

  async updateBranch(owner: string, repo: string, pullNumber: number): Promise<void> {
    await this.octokit.pulls.updateBranch({
      owner,
      repo,
      pull_number: pullNumber,
    });
  }

  async createPullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string,
    draft = false
  ): Promise<{ number: number; url: string; nodeId: string }> {
    const { data } = await this.octokit.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body,
      draft,
    });

    return {
      number: data.number,
      url: data.html_url,
      nodeId: data.node_id,
    };
  }
}
