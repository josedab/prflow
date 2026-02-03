/**
 * @fileoverview PR Time Machine Models
 * 
 * Types and interfaces for visualizing PR evolution over time,
 * tracking commits, comments, and changes throughout the PR lifecycle.
 * 
 * @module models/time-machine
 */

import { z } from 'zod';

/**
 * Types of events that can occur in PR timeline
 */
export const TimelineEventTypeSchema = z.enum([
  'pr_opened',
  'pr_updated',
  'pr_closed',
  'pr_merged',
  'pr_reopened',
  'commit_pushed',
  'force_push',
  'review_requested',
  'review_submitted',
  'comment_added',
  'comment_resolved',
  'label_added',
  'label_removed',
  'assignee_added',
  'assignee_removed',
  'status_check',
  'merge_conflict',
  'conflict_resolved',
  'branch_updated',
  'title_changed',
  'description_changed',
  'draft_ready',
  'converted_to_draft',
]);
export type TimelineEventType = z.infer<typeof TimelineEventTypeSchema>;

/**
 * A snapshot of the PR at a specific point in time
 */
export interface PRSnapshot {
  /** Unique snapshot ID */
  id: string;
  /** PR workflow ID */
  workflowId: string;
  /** Repository ID */
  repositoryId: string;
  /** PR number */
  prNumber: number;
  /** Commit SHA at this snapshot */
  commitSha: string;
  /** Head branch name */
  headBranch: string;
  /** Base branch name */
  baseBranch: string;
  /** PR title at this point */
  title: string;
  /** PR description at this point */
  description: string | null;
  /** Files changed at this snapshot */
  files: SnapshotFile[];
  /** Total lines added */
  linesAdded: number;
  /** Total lines removed */
  linesRemoved: number;
  /** Labels at this point */
  labels: string[];
  /** Assignees at this point */
  assignees: string[];
  /** Review status at this point */
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'commented';
  /** Number of comments at this point */
  commentCount: number;
  /** CI status at this point */
  ciStatus: 'pending' | 'success' | 'failure' | 'neutral' | null;
  /** When this snapshot was captured */
  capturedAt: Date;
  /** Previous snapshot ID for diff calculation */
  previousSnapshotId: string | null;
}

/**
 * A file in a snapshot
 */
export interface SnapshotFile {
  /** File path */
  path: string;
  /** Change status */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Lines added */
  additions: number;
  /** Lines removed */
  deletions: number;
  /** Diff patch (truncated for large files) */
  patch?: string;
  /** Previous path if renamed */
  previousPath?: string;
}

/**
 * An event in the PR timeline
 */
export interface TimelineEvent {
  /** Unique event ID */
  id: string;
  /** PR workflow ID */
  workflowId: string;
  /** Event type */
  type: TimelineEventType;
  /** Actor who triggered the event */
  actor: string;
  /** Event timestamp */
  timestamp: Date;
  /** Associated snapshot ID */
  snapshotId?: string;
  /** Event-specific metadata */
  metadata: TimelineEventMetadata;
  /** Whether this is a significant event */
  isSignificant: boolean;
}

/**
 * Metadata for different event types
 */
export type TimelineEventMetadata = 
  | CommitPushedMetadata
  | ReviewSubmittedMetadata
  | CommentAddedMetadata
  | LabelChangedMetadata
  | StatusCheckMetadata
  | TitleChangedMetadata
  | GenericMetadata;

export interface CommitPushedMetadata {
  type: 'commit_pushed' | 'force_push';
  commitSha: string;
  commitMessage: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  parentSha?: string;
}

export interface ReviewSubmittedMetadata {
  type: 'review_submitted';
  reviewId: number;
  state: 'approved' | 'changes_requested' | 'commented';
  body?: string;
  commentCount: number;
}

export interface CommentAddedMetadata {
  type: 'comment_added' | 'comment_resolved';
  commentId: number;
  body: string;
  file?: string;
  line?: number;
  isReply: boolean;
}

export interface LabelChangedMetadata {
  type: 'label_added' | 'label_removed';
  label: string;
  color: string;
}

export interface StatusCheckMetadata {
  type: 'status_check';
  checkName: string;
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped';
  detailsUrl?: string;
}

export interface TitleChangedMetadata {
  type: 'title_changed' | 'description_changed';
  previousValue: string;
  newValue: string;
}

export interface GenericMetadata {
  type: string;
  [key: string]: unknown;
}

/**
 * Diff between two snapshots
 */
export interface SnapshotDiff {
  /** From snapshot ID */
  fromSnapshotId: string;
  /** To snapshot ID */
  toSnapshotId: string;
  /** Files added since fromSnapshot */
  filesAdded: SnapshotFile[];
  /** Files modified since fromSnapshot */
  filesModified: SnapshotFile[];
  /** Files deleted since fromSnapshot */
  filesDeleted: SnapshotFile[];
  /** Net lines added */
  netAdditions: number;
  /** Net lines removed */
  netDeletions: number;
  /** Commits between snapshots */
  commitsBetween: number;
  /** Events between snapshots */
  eventsBetween: TimelineEvent[];
  /** AI summary of changes */
  aiSummary?: string;
}

/**
 * Complete PR timeline with all events and snapshots
 */
export interface PRTimeline {
  /** PR workflow ID */
  workflowId: string;
  /** Repository information */
  repository: {
    owner: string;
    name: string;
  };
  /** PR number */
  prNumber: number;
  /** PR title */
  title: string;
  /** PR author */
  author: string;
  /** PR created at */
  createdAt: Date;
  /** PR current status */
  currentStatus: 'open' | 'closed' | 'merged';
  /** All snapshots ordered by time */
  snapshots: PRSnapshot[];
  /** All events ordered by time */
  events: TimelineEvent[];
  /** Key milestones in the PR */
  milestones: TimelineMilestone[];
  /** Statistics about the PR */
  stats: TimelineStats;
}

/**
 * A milestone in the PR lifecycle
 */
export interface TimelineMilestone {
  /** Milestone type */
  type: 'first_review' | 'first_approval' | 'all_checks_passed' | 'ready_for_merge' | 'merged';
  /** When milestone was reached */
  reachedAt: Date;
  /** Related event ID */
  eventId?: string;
  /** Description */
  description: string;
}

/**
 * Statistics about the PR timeline
 */
export interface TimelineStats {
  /** Total duration in hours */
  totalDurationHours: number;
  /** Time to first review in hours */
  timeToFirstReviewHours: number | null;
  /** Time to first approval in hours */
  timeToFirstApprovalHours: number | null;
  /** Number of review cycles */
  reviewCycles: number;
  /** Number of force pushes */
  forcePushCount: number;
  /** Total commits */
  totalCommits: number;
  /** Total comments */
  totalComments: number;
  /** Total reviews */
  totalReviews: number;
  /** Peak lines changed */
  peakLinesChanged: number;
  /** Final lines changed */
  finalLinesChanged: number;
}

/**
 * Request for "since last review" diff
 */
export interface SinceLastReviewRequest {
  workflowId: string;
  reviewerLogin?: string;
}

/**
 * Response for "since last review" diff
 */
export interface SinceLastReviewResponse {
  /** Last review by this reviewer (or any reviewer) */
  lastReview: {
    reviewId: number;
    reviewer: string;
    state: string;
    submittedAt: Date;
    snapshotId: string;
  } | null;
  /** Diff since last review */
  diff: SnapshotDiff | null;
  /** Commits since last review */
  commitsSinceReview: Array<{
    sha: string;
    message: string;
    author: string;
    timestamp: Date;
  }>;
  /** AI summary of changes since review */
  aiSummary?: string;
}

/**
 * Time travel request
 */
export interface TimeTravelRequest {
  workflowId: string;
  targetTime?: Date;
  targetSnapshotId?: string;
  targetCommitSha?: string;
}

/**
 * Time travel response
 */
export interface TimeTravelResponse {
  /** The snapshot at or before the target time */
  snapshot: PRSnapshot;
  /** Events up to this point */
  eventsToDate: TimelineEvent[];
  /** Diff from current state */
  diffFromCurrent: SnapshotDiff;
  /** What changed after this point (preview) */
  futureChangesPreview: {
    commitsAfter: number;
    eventsAfter: number;
    filesChangedAfter: number;
  };
}
