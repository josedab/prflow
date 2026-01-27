import type { Octokit } from '@octokit/rest';

export interface ReviewCommentParams {
  owner: string;
  repo: string;
  pullNumber: number;
  body: string;
  commitId: string;
  path: string;
  line: number;
  side?: 'LEFT' | 'RIGHT';
}

/**
 * Client module for review and comment operations.
 * Handles PR review comments and issue comments.
 */
export class ReviewClient {
  constructor(private octokit: Octokit) {}

  async createReviewComment(params: ReviewCommentParams): Promise<number> {
    const { data } = await this.octokit.pulls.createReviewComment({
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      body: params.body,
      commit_id: params.commitId,
      path: params.path,
      line: params.line,
      side: params.side || 'RIGHT',
    });

    return data.id;
  }

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<number> {
    const { data } = await this.octokit.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    return data.id;
  }
}
