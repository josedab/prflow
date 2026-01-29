import { createGitHubClient, type GitHubClient } from '@prflow/github-client';
import type { PullRequest, PRDiff, ReviewResult } from '@prflow/core';
import { logger } from '../lib/logger.js';

export interface GitHubServiceConfig {
  appId: string;
  privateKey: string;
  installationId: number;
}

export interface ReviewCommentData {
  severity: string;
  category: string;
  message: string;
  file: string;
  line: number;
  suggestion?: {
    originalCode: string;
    suggestedCode: string;
    language: string;
  };
  learnMoreUrl?: string;
}

/**
 * Service for GitHub API interactions during workflow processing
 */
export class GitHubInteractionService {
  private client: GitHubClient;

  constructor(config: GitHubServiceConfig) {
    this.client = createGitHubClient({
      appId: config.appId,
      privateKey: config.privateKey,
      installationId: config.installationId,
    });
  }

  async getPullRequest(owner: string, repo: string, prNumber: number): Promise<PullRequest> {
    return this.client.getPullRequest(owner, repo, prNumber);
  }

  async getPullRequestDiff(owner: string, repo: string, prNumber: number): Promise<PRDiff> {
    return this.client.getPullRequestDiff(owner, repo, prNumber);
  }

  async createCheckRun(
    owner: string,
    repo: string,
    headSha: string,
    title: string,
    summary: string
  ): Promise<number> {
    return this.client.createCheckRun({
      owner,
      repo,
      name: 'PRFlow Analysis',
      headSha,
      status: 'in_progress',
      title,
      summary,
    });
  }

  async completeCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    conclusion: 'success' | 'failure' | 'neutral',
    title: string,
    summary: string
  ): Promise<void> {
    await this.client.updateCheckRun(owner, repo, checkRunId, {
      status: 'completed',
      conclusion,
      title,
      summary,
    });
  }

  async postSummaryComment(
    owner: string,
    repo: string,
    prNumber: number,
    comment: string
  ): Promise<void> {
    await this.client.createIssueComment(owner, repo, prNumber, comment);
  }

  async postReviewComments(
    owner: string,
    repo: string,
    prNumber: number,
    headSha: string,
    reviewResult: ReviewResult,
    severityThreshold: string
  ): Promise<void> {
    const severityOrder = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'NITPICK'];
    const thresholdIndex = severityOrder.indexOf(severityThreshold);

    for (const comment of reviewResult.comments) {
      const commentIndex = severityOrder.indexOf(comment.severity.toUpperCase());
      if (commentIndex <= thresholdIndex) {
        try {
          await this.client.createReviewComment({
            owner,
            repo,
            pullNumber: prNumber,
            body: this.formatReviewComment(comment),
            commitId: headSha,
            path: comment.file,
            line: comment.line,
          });
        } catch (err) {
          logger.warn({ error: err, comment }, 'Failed to post review comment');
        }
      }
    }
  }

  private formatReviewComment(comment: ReviewCommentData): string {
    const severityEmoji: Record<string, string> = {
      critical: '🔴',
      high: '🟠',
      medium: '🟡',
      low: '🔵',
      nitpick: '✨',
    };

    let body = `## ${severityEmoji[comment.severity] || '⚪'} PRFlow: ${comment.category}\n\n`;
    body += `${comment.message}\n\n`;

    if (comment.suggestion) {
      body += '```suggestion\n';
      body += comment.suggestion.suggestedCode;
      body += '\n```\n\n';
    }

    if (comment.learnMoreUrl) {
      body += `[Learn more](${comment.learnMoreUrl})\n`;
    }

    return body;
  }

  getCheckConclusion(reviewResult?: ReviewResult): 'success' | 'failure' | 'neutral' {
    if (!reviewResult) return 'neutral';
    if (reviewResult.summary.critical > 0) return 'failure';
    if (reviewResult.summary.high > 0) return 'neutral';
    return 'success';
  }
}

export function createGitHubInteractionService(config: GitHubServiceConfig): GitHubInteractionService {
  return new GitHubInteractionService(config);
}
