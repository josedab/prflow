/**
 * @fileoverview Git Provider Abstraction Models
 * 
 * Common interfaces for GitHub, GitLab, and Bitbucket support.
 * 
 * @module models/git-provider
 */

import { z } from 'zod';

/**
 * Supported Git providers
 */
export const GitProviderSchema = z.enum(['github', 'gitlab', 'bitbucket']);
export type GitProvider = z.infer<typeof GitProviderSchema>;

/**
 * Common repository information
 */
export interface ProviderRepository {
  /** Provider-specific ID */
  id: string | number;
  /** Repository name */
  name: string;
  /** Full name (owner/name) */
  fullName: string;
  /** Owner/namespace */
  owner: string;
  /** Description */
  description?: string;
  /** Default branch */
  defaultBranch: string;
  /** Private repository */
  isPrivate: boolean;
  /** Clone URL */
  cloneUrl: string;
  /** Web URL */
  webUrl: string;
  /** Provider */
  provider: GitProvider;
}

/**
 * Common pull/merge request information
 */
export interface ProviderPullRequest {
  /** Provider-specific ID */
  id: string | number;
  /** PR/MR number */
  number: number;
  /** Title */
  title: string;
  /** Description/body */
  body: string;
  /** State (open, closed, merged) */
  state: 'open' | 'closed' | 'merged';
  /** Author */
  author: ProviderUser;
  /** Head/source branch */
  headBranch: string;
  /** Head commit SHA */
  headSha: string;
  /** Base/target branch */
  baseBranch: string;
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
  /** Merged at */
  mergedAt?: Date;
  /** Merged by */
  mergedBy?: ProviderUser;
  /** Draft status */
  isDraft: boolean;
  /** Mergeable status */
  mergeable: boolean | null;
  /** Labels */
  labels: string[];
  /** Reviewers */
  reviewers: ProviderUser[];
  /** Assignees */
  assignees: ProviderUser[];
  /** Web URL */
  webUrl: string;
  /** Provider */
  provider: GitProvider;
}

/**
 * Common user information
 */
export interface ProviderUser {
  /** Provider-specific ID */
  id: string | number;
  /** Username/login */
  login: string;
  /** Display name */
  name?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Profile URL */
  profileUrl: string;
}

/**
 * Common file change information
 */
export interface ProviderFile {
  /** File path */
  path: string;
  /** Previous path (for renames) */
  previousPath?: string;
  /** Change status */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
  /** Patch/diff content */
  patch?: string;
}

/**
 * Common commit information
 */
export interface ProviderCommit {
  /** Commit SHA */
  sha: string;
  /** Commit message */
  message: string;
  /** Author */
  author: {
    name: string;
    email: string;
    date: Date;
  };
  /** Committer */
  committer: {
    name: string;
    email: string;
    date: Date;
  };
  /** Web URL */
  webUrl: string;
}

/**
 * Common review information
 */
export interface ProviderReview {
  /** Review ID */
  id: string | number;
  /** Reviewer */
  reviewer: ProviderUser;
  /** State */
  state: 'approved' | 'changes_requested' | 'commented' | 'pending';
  /** Body */
  body?: string;
  /** Submitted at */
  submittedAt: Date;
}

/**
 * Common comment information
 */
export interface ProviderComment {
  /** Comment ID */
  id: string | number;
  /** Author */
  author: ProviderUser;
  /** Body */
  body: string;
  /** File path (for line comments) */
  path?: string;
  /** Line number */
  line?: number;
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
}

/**
 * Common branch information
 */
export interface ProviderBranch {
  /** Branch name */
  name: string;
  /** Head commit SHA */
  sha: string;
  /** Protected */
  protected: boolean;
}

/**
 * Common check/pipeline status
 */
export interface ProviderCheckStatus {
  /** Overall status */
  status: 'pending' | 'running' | 'success' | 'failure' | 'cancelled';
  /** Individual checks */
  checks: ProviderCheck[];
}

/**
 * Individual check/job
 */
export interface ProviderCheck {
  /** Check ID */
  id: string | number;
  /** Name */
  name: string;
  /** Status */
  status: 'pending' | 'running' | 'success' | 'failure' | 'cancelled' | 'skipped';
  /** Conclusion */
  conclusion?: string;
  /** Web URL */
  webUrl?: string;
  /** Started at */
  startedAt?: Date;
  /** Completed at */
  completedAt?: Date;
}

/**
 * Webhook event types
 */
export type ProviderWebhookEvent =
  | 'pull_request.opened'
  | 'pull_request.closed'
  | 'pull_request.merged'
  | 'pull_request.updated'
  | 'pull_request.review_requested'
  | 'review.submitted'
  | 'review.dismissed'
  | 'comment.created'
  | 'comment.updated'
  | 'comment.deleted'
  | 'check.completed'
  | 'push';

/**
 * Common webhook payload
 */
export interface ProviderWebhookPayload {
  /** Event type */
  event: ProviderWebhookEvent;
  /** Repository */
  repository: ProviderRepository;
  /** Pull request (if applicable) */
  pullRequest?: ProviderPullRequest;
  /** Sender */
  sender: ProviderUser;
  /** Provider */
  provider: GitProvider;
  /** Raw payload */
  raw: unknown;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  /** Provider type */
  provider: GitProvider;
  /** Base URL (for self-hosted) */
  baseUrl?: string;
  /** Access token */
  accessToken: string;
  /** App ID (for GitHub Apps) */
  appId?: string;
  /** Private key (for GitHub Apps) */
  privateKey?: string;
}

/**
 * Interface that all Git provider clients must implement
 */
export interface IGitProviderClient {
  /** Provider type */
  readonly provider: GitProvider;

  // Repository operations
  getRepository(owner: string, repo: string): Promise<ProviderRepository>;
  listBranches(owner: string, repo: string): Promise<ProviderBranch[]>;

  // Pull Request operations
  getPullRequest(owner: string, repo: string, number: number): Promise<ProviderPullRequest>;
  listPullRequests(owner: string, repo: string, state?: 'open' | 'closed' | 'all'): Promise<ProviderPullRequest[]>;
  getPullRequestFiles(owner: string, repo: string, number: number): Promise<ProviderFile[]>;
  getPullRequestCommits(owner: string, repo: string, number: number): Promise<ProviderCommit[]>;
  createPullRequest(owner: string, repo: string, data: CreatePullRequestData): Promise<ProviderPullRequest>;
  updatePullRequest(owner: string, repo: string, number: number, data: UpdatePullRequestData): Promise<ProviderPullRequest>;
  mergePullRequest(owner: string, repo: string, number: number, options?: MergePullRequestOptions): Promise<void>;

  // Review operations
  listReviews(owner: string, repo: string, number: number): Promise<ProviderReview[]>;
  createReview(owner: string, repo: string, number: number, data: CreateReviewData): Promise<ProviderReview>;
  requestReviewers(owner: string, repo: string, number: number, reviewers: string[]): Promise<void>;

  // Comment operations
  listComments(owner: string, repo: string, number: number): Promise<ProviderComment[]>;
  createComment(owner: string, repo: string, number: number, body: string): Promise<ProviderComment>;
  createLineComment(owner: string, repo: string, number: number, data: CreateLineCommentData): Promise<ProviderComment>;

  // Status operations
  getCheckStatus(owner: string, repo: string, ref: string): Promise<ProviderCheckStatus>;

  // File operations
  getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string>;
  compareCommits(owner: string, repo: string, base: string, head: string): Promise<ProviderFile[]>;
}

/**
 * Data for creating a pull request
 */
export interface CreatePullRequestData {
  /** Title */
  title: string;
  /** Body/description */
  body?: string;
  /** Head/source branch */
  head: string;
  /** Base/target branch */
  base: string;
  /** Draft */
  draft?: boolean;
}

/**
 * Data for updating a pull request
 */
export interface UpdatePullRequestData {
  /** Title */
  title?: string;
  /** Body */
  body?: string;
  /** State */
  state?: 'open' | 'closed';
}

/**
 * Options for merging a pull request
 */
export interface MergePullRequestOptions {
  /** Merge method */
  method?: 'merge' | 'squash' | 'rebase';
  /** Commit title */
  commitTitle?: string;
  /** Commit message */
  commitMessage?: string;
}

/**
 * Data for creating a review
 */
export interface CreateReviewData {
  /** Event */
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
  /** Body */
  body?: string;
  /** Comments */
  comments?: Array<{
    path: string;
    line: number;
    body: string;
  }>;
}

/**
 * Data for creating a line comment
 */
export interface CreateLineCommentData {
  /** Body */
  body: string;
  /** Commit SHA */
  commitSha: string;
  /** File path */
  path: string;
  /** Line number */
  line: number;
  /** Side */
  side?: 'LEFT' | 'RIGHT';
}
