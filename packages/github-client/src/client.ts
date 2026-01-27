import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import type { PullRequest, PRDiff } from '@prflow/core';
import { PRClient } from './clients/pr-client.js';
import { FileClient } from './clients/file-client.js';
import { CheckClient, type CreateCheckRunParams } from './clients/check-client.js';
import { ReviewClient, type ReviewCommentParams } from './clients/review-client.js';
import { RepoClient } from './clients/repo-client.js';
import { GitClient } from './clients/git-client.js';

export interface GitHubClientConfig {
  appId: string;
  privateKey: string;
  installationId: number;
}

// Re-export types for backward compatibility
export type { CreateCheckRunParams, ReviewCommentParams };

/**
 * Unified GitHub client that delegates to focused client modules.
 * Maintains backward compatibility while enabling better organization.
 */
export class GitHubClient {
  private octokit: Octokit;
  readonly installationId: number;
  
  // Focused clients for specific operations
  readonly pr: PRClient;
  readonly files: FileClient;
  readonly checks: CheckClient;
  readonly reviews: ReviewClient;
  readonly repos: RepoClient;
  readonly git: GitClient;

  constructor(config: GitHubClientConfig) {
    this.installationId = config.installationId;
    this.octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.appId,
        privateKey: config.privateKey,
        installationId: config.installationId,
      },
    });

    // Initialize focused clients
    this.pr = new PRClient(this.octokit);
    this.files = new FileClient(this.octokit);
    this.checks = new CheckClient(this.octokit);
    this.reviews = new ReviewClient(this.octokit);
    this.repos = new RepoClient(this.octokit);
    this.git = new GitClient(this.octokit);
  }

  // =====================================================
  // Backward-compatible methods that delegate to focused clients
  // These can be deprecated in favor of direct client access
  // =====================================================

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    return this.pr.getPullRequest(owner, repo, pullNumber);
  }

  async getPullRequestDiff(owner: string, repo: string, pullNumber: number): Promise<PRDiff> {
    return this.pr.getPullRequestDiff(owner, repo, pullNumber);
  }

  async getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string> {
    return this.files.getFileContent(owner, repo, path, ref);
  }

  async createCheckRun(params: CreateCheckRunParams): Promise<number> {
    return this.checks.createCheckRun(params);
  }

  async updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    params: Partial<CreateCheckRunParams>
  ): Promise<void> {
    return this.checks.updateCheckRun(owner, repo, checkRunId, params);
  }

  async createReviewComment(params: ReviewCommentParams): Promise<number> {
    return this.reviews.createReviewComment(params);
  }

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<number> {
    return this.reviews.createIssueComment(owner, repo, issueNumber, body);
  }

  async requestReviewers(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewers: string[]
  ): Promise<void> {
    return this.pr.requestReviewers(owner, repo, pullNumber, reviewers);
  }

  async getRepository(owner: string, repo: string) {
    return this.repos.getRepository(owner, repo);
  }

  async listBranches(owner: string, repo: string) {
    return this.repos.listBranches(owner, repo);
  }

  async listCommits(owner: string, repo: string, sha?: string, perPage = 100) {
    return this.repos.listCommits(owner, repo, sha, perPage);
  }

  async getCommit(owner: string, repo: string, ref: string) {
    return this.repos.getCommit(owner, repo, ref);
  }

  async getCodeowners(owner: string, repo: string, ref: string): Promise<string | null> {
    return this.files.getCodeowners(owner, repo, ref);
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
    return this.pr.mergePullRequest(owner, repo, pullNumber, options);
  }

  async getCombinedStatus(owner: string, repo: string, ref: string) {
    return this.checks.getCombinedStatus(owner, repo, ref);
  }

  async getCheckRuns(owner: string, repo: string, ref: string) {
    return this.checks.getCheckRuns(owner, repo, ref);
  }

  async getReviews(owner: string, repo: string, pullNumber: number) {
    return this.pr.getReviews(owner, repo, pullNumber);
  }

  async compareBranches(owner: string, repo: string, base: string, head: string) {
    return this.repos.compareBranches(owner, repo, base, head);
  }

  async updateBranch(owner: string, repo: string, pullNumber: number): Promise<void> {
    return this.pr.updateBranch(owner, repo, pullNumber);
  }

  async getChangedFiles(owner: string, repo: string, pullNumber: number) {
    return this.pr.getChangedFiles(owner, repo, pullNumber);
  }

  async removeReviewers(owner: string, repo: string, pullNumber: number, reviewers: string[]): Promise<void> {
    return this.pr.removeReviewers(owner, repo, pullNumber, reviewers);
  }

  async createOrUpdateFileContent(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    sha?: string
  ): Promise<{ sha: string; commitSha: string }> {
    return this.files.createOrUpdateFileContent(owner, repo, path, content, message, branch, sha);
  }

  async getFileSha(owner: string, repo: string, path: string, ref: string): Promise<string | null> {
    return this.files.getFileSha(owner, repo, path, ref);
  }

  async createCommit(
    owner: string,
    repo: string,
    message: string,
    tree: string,
    parents: string[]
  ): Promise<string> {
    return this.git.createCommit(owner, repo, message, tree, parents);
  }

  async createTree(
    owner: string,
    repo: string,
    baseTree: string,
    files: Array<{ path: string; content: string; mode?: '100644' | '100755' | '040000' | '160000' | '120000' }>
  ): Promise<string> {
    return this.git.createTree(owner, repo, baseTree, files);
  }

  async updateRef(owner: string, repo: string, ref: string, sha: string, force = false): Promise<void> {
    return this.git.updateRef(owner, repo, ref, sha, force);
  }

  async getRef(owner: string, repo: string, ref: string) {
    return this.git.getRef(owner, repo, ref);
  }

  async getBranchProtection(owner: string, repo: string, branch: string) {
    return this.repos.getBranchProtection(owner, repo, branch);
  }

  async getPullRequestFiles(owner: string, repo: string, pullNumber: number) {
    return this.pr.getPullRequestFiles(owner, repo, pullNumber);
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
    return this.pr.createPullRequest(owner, repo, title, head, base, body, draft);
  }

  async createRef(owner: string, repo: string, ref: string, sha: string): Promise<void> {
    return this.git.createRef(owner, repo, ref, sha);
  }
}

export function createGitHubClient(config: GitHubClientConfig): GitHubClient {
  return new GitHubClient(config);
}
