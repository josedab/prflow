/**
 * @fileoverview PR Time Machine Service
 *
 * Provides capabilities for visualizing PR evolution over time:
 * - Capture snapshots at key events
 * - Track timeline events
 * - Generate diffs between points in time
 * - "Since last review" functionality
 * - AI-powered change summaries
 *
 * @module services/time-machine
 */

import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';
import { callLLM, type LLMMessage } from '../agents/base.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * Get raw octokit for operations not exposed by the client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOctokit(github: GitHubClient): any {
  return (github as unknown as { octokit: unknown }).octokit;
}

import type {
  PRSnapshot,
  PRTimeline,
  TimelineEvent,
  TimelineEventType,
  TimelineEventMetadata,
  TimelineMilestone,
  TimelineStats,
  SnapshotDiff,
  SnapshotFile,
  SinceLastReviewResponse,
  TimeTravelResponse,
} from '@prflow/core';

// DB record types
interface DBSnapshot {
  id: string;
  workflowId: string;
  repositoryId: string;
  prNumber: number;
  commitSha: string;
  headBranch: string;
  baseBranch: string;
  title: string;
  description: string | null;
  files: unknown;
  linesAdded: number;
  linesRemoved: number;
  labels: string[];
  assignees: string[];
  reviewStatus: string;
  commentCount: number;
  ciStatus: string | null;
  capturedAt: Date;
  previousSnapshotId: string | null;
}

interface DBEvent {
  id: string;
  workflowId: string;
  type: string;
  actor: string;
  timestamp: Date;
  snapshotId: string | null;
  metadata: unknown;
  isSignificant: boolean;
}

interface DBMilestone {
  id: string;
  workflowId: string;
  type: string;
  reachedAt: Date;
  eventId: string | null;
  description: string;
}

export class TimeMachineService {
  /**
   * Capture a snapshot of the current PR state
   */
  async captureSnapshot(
    owner: string,
    repo: string,
    prNumber: number,
    trigger: TimelineEventType
  ): Promise<PRSnapshot> {
    const repoFullName = `${owner}/${repo}`;
    logger.info({ repo: repoFullName, prNumber, trigger }, 'Capturing PR snapshot');

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    // Get installationId from repository
    const installationId = (repository as { installationId?: number }).installationId || 0;

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!workflow) {
      throw new Error(`Workflow not found for PR #${prNumber}`);
    }

    const github = getGitHubClient(installationId);

    // Get current PR state
    const { data: pr } = await getOctokit(github).pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get files
    const { data: filesData } = await getOctokit(github).pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const files: SnapshotFile[] = filesData.map((f: { filename: string; status: string; additions: number; deletions: number; patch?: string; previous_filename?: string }) => ({
      path: f.filename,
      status: f.status as SnapshotFile['status'],
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch?.substring(0, 5000), // Truncate large patches
      previousPath: f.previous_filename,
    }));

    // Get reviews to determine status
    const { data: reviews } = await getOctokit(github).pulls.listReviews({
      owner,
      repo,
      pull_number: prNumber,
    });

    let reviewStatus: PRSnapshot['reviewStatus'] = 'pending';
    const lastReview = reviews.filter((r: { state: string }) => r.state !== 'PENDING').pop();
    if (lastReview) {
      switch (lastReview.state) {
        case 'APPROVED':
          reviewStatus = 'approved';
          break;
        case 'CHANGES_REQUESTED':
          reviewStatus = 'changes_requested';
          break;
        case 'COMMENTED':
          reviewStatus = 'commented';
          break;
      }
    }

    // Get comments count
    const { data: comments } = await getOctokit(github).issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
    });

    // Get CI status
    const { data: checks } = await getOctokit(github).checks.listForRef({
      owner,
      repo,
      ref: pr.head.sha,
    });

    let ciStatus: PRSnapshot['ciStatus'] = null;
    if (checks.check_runs.length > 0) {
      const allSuccess = checks.check_runs.every((c: { conclusion: string }) => c.conclusion === 'success');
      const anyFailure = checks.check_runs.some((c: { conclusion: string }) => c.conclusion === 'failure');
      if (allSuccess) ciStatus = 'success';
      else if (anyFailure) ciStatus = 'failure';
      else ciStatus = 'pending';
    }

    // Get previous snapshot
    const previousSnapshot = await dbAny.pRSnapshot.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { capturedAt: 'desc' },
    });

    // Create snapshot
    const snapshot = await dbAny.pRSnapshot.create({
      data: {
        workflowId: workflow.id,
        repositoryId: repository.id,
        prNumber,
        commitSha: pr.head.sha,
        headBranch: pr.head.ref,
        baseBranch: pr.base.ref,
        title: pr.title,
        description: pr.body,
        files: files as object,
        linesAdded: filesData.reduce((sum: number, f: { additions: number }) => sum + f.additions, 0),
        linesRemoved: filesData.reduce((sum: number, f: { deletions: number }) => sum + f.deletions, 0),
        labels: pr.labels.map((l: { name?: string }) => l.name || ''),
        assignees: pr.assignees?.map((a: { login: string }) => a.login) || [],
        reviewStatus,
        commentCount: comments.length,
        ciStatus,
        previousSnapshotId: previousSnapshot?.id || null,
      },
    });

    logger.info({ snapshotId: snapshot.id, commitSha: pr.head.sha }, 'Snapshot captured');

    return this.mapSnapshot(snapshot);
  }

  /**
   * Record a timeline event
   */
  async recordEvent(
    owner: string,
    repo: string,
    prNumber: number,
    type: TimelineEventType,
    actor: string,
    metadata: TimelineEventMetadata,
    captureSnapshot: boolean = true
  ): Promise<TimelineEvent> {
    const repoFullName = `${owner}/${repo}`;

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!workflow) {
      throw new Error(`Workflow not found for PR #${prNumber}`);
    }

    // Capture snapshot if requested
    let snapshotId: string | undefined;
    if (captureSnapshot && this.shouldCaptureSnapshot(type)) {
      const snapshot = await this.captureSnapshot(owner, repo, prNumber, type);
      snapshotId = snapshot.id;
    }

    // Determine if this is a significant event
    const isSignificant = this.isSignificantEvent(type, metadata);

    const event = await dbAny.pRTimelineEvent.create({
      data: {
        workflowId: workflow.id,
        repositoryId: repository.id,
        prNumber,
        type,
        actor,
        snapshotId,
        metadata: metadata as object,
        isSignificant,
      },
    });

    // Check for milestones
    await this.checkMilestones(workflow.id, type, event.id);

    return this.mapEvent(event);
  }

  /**
   * Get complete PR timeline
   */
  async getTimeline(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PRTimeline> {
    const repoFullName = `${owner}/${repo}`;

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!workflow) {
      throw new Error(`Workflow not found for PR #${prNumber}`);
    }

    // Get all snapshots
    const snapshots = await dbAny.pRSnapshot.findMany({
      where: { workflowId: workflow.id },
      orderBy: { capturedAt: 'asc' },
    });

    // Get all events
    const events = await dbAny.pRTimelineEvent.findMany({
      where: { workflowId: workflow.id },
      orderBy: { timestamp: 'asc' },
    });

    // Get milestones
    const milestones = await dbAny.pRTimelineMilestone.findMany({
      where: { workflowId: workflow.id },
      orderBy: { reachedAt: 'asc' },
    });

    // Calculate stats
    const stats = this.calculateStats(snapshots, events, milestones, workflow);

    return {
      workflowId: workflow.id,
      repository: { owner, name: repo },
      prNumber,
      title: workflow.prTitle,
      author: workflow.authorLogin,
      createdAt: workflow.createdAt,
      currentStatus: workflow.status === 'COMPLETED' ? 'merged' : 'open',
      snapshots: snapshots.map((s: DBSnapshot) => this.mapSnapshot(s)),
      events: events.map((e: DBEvent) => this.mapEvent(e)),
      milestones: milestones.map((m: DBMilestone) => this.mapMilestone(m)),
      stats,
    };
  }

  /**
   * Get diff between two snapshots
   */
  async getSnapshotDiff(
    fromSnapshotId: string,
    toSnapshotId: string,
    includeAISummary: boolean = false
  ): Promise<SnapshotDiff> {
    const [fromSnapshot, toSnapshot] = await Promise.all([
      dbAny.pRSnapshot.findUnique({ where: { id: fromSnapshotId } }),
      dbAny.pRSnapshot.findUnique({ where: { id: toSnapshotId } }),
    ]);

    if (!fromSnapshot || !toSnapshot) {
      throw new Error('Snapshots not found');
    }

    const fromFiles = fromSnapshot.files as SnapshotFile[];
    const toFiles = toSnapshot.files as SnapshotFile[];

    const fromPaths = new Set(fromFiles.map(f => f.path));
    const toPaths = new Set(toFiles.map(f => f.path));

    const filesAdded = toFiles.filter(f => !fromPaths.has(f.path));
    const filesDeleted = fromFiles.filter(f => !toPaths.has(f.path));
    const filesModified = toFiles.filter(f => {
      if (!fromPaths.has(f.path)) return false;
      const fromFile = fromFiles.find(ff => ff.path === f.path);
      return fromFile && (fromFile.additions !== f.additions || fromFile.deletions !== f.deletions);
    });

    // Get events between snapshots
    const eventsBetween = await dbAny.pRTimelineEvent.findMany({
      where: {
        workflowId: fromSnapshot.workflowId,
        timestamp: {
          gt: fromSnapshot.capturedAt,
          lte: toSnapshot.capturedAt,
        },
      },
      orderBy: { timestamp: 'asc' },
    });

    const diff: SnapshotDiff = {
      fromSnapshotId,
      toSnapshotId,
      filesAdded,
      filesModified,
      filesDeleted,
      netAdditions: toSnapshot.linesAdded - fromSnapshot.linesAdded,
      netDeletions: toSnapshot.linesRemoved - fromSnapshot.linesRemoved,
      commitsBetween: eventsBetween.filter((e: { type: string }) => e.type === 'commit_pushed' || e.type === 'force_push').length,
      eventsBetween: eventsBetween.map((e: DBEvent) => this.mapEvent(e)),
    };

    if (includeAISummary && (filesAdded.length + filesModified.length + filesDeleted.length) > 0) {
      diff.aiSummary = await this.generateAISummary(diff);
    }

    return diff;
  }

  /**
   * Get changes since last review
   */
  async getSinceLastReview(
    owner: string,
    repo: string,
    prNumber: number,
    reviewerLogin?: string
  ): Promise<SinceLastReviewResponse> {
    const repoFullName = `${owner}/${repo}`;

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!workflow) {
      throw new Error(`Workflow not found for PR #${prNumber}`);
    }

    // Find last review event
    const reviewEvents = await dbAny.pRTimelineEvent.findMany({
      where: {
        workflowId: workflow.id,
        type: 'review_submitted',
        ...(reviewerLogin ? { actor: reviewerLogin } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });

    const lastReviewEvent = reviewEvents[0];
    if (!lastReviewEvent) {
      return {
        lastReview: null,
        diff: null,
        commitsSinceReview: [],
      };
    }

    const metadata = lastReviewEvent.metadata as { reviewId?: number; state?: string };

    // Get snapshot at last review
    const reviewSnapshot = lastReviewEvent.snapshotId
      ? await dbAny.pRSnapshot.findUnique({ where: { id: lastReviewEvent.snapshotId } })
      : await dbAny.pRSnapshot.findFirst({
          where: {
            workflowId: workflow.id,
            capturedAt: { lte: lastReviewEvent.timestamp },
          },
          orderBy: { capturedAt: 'desc' },
        });

    // Get current snapshot
    const currentSnapshot = await dbAny.pRSnapshot.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { capturedAt: 'desc' },
    });

    let diff: SnapshotDiff | null = null;
    if (reviewSnapshot && currentSnapshot && reviewSnapshot.id !== currentSnapshot.id) {
      diff = await this.getSnapshotDiff(reviewSnapshot.id, currentSnapshot.id, true);
    }

    // Get commits since review
    const commitEvents = await dbAny.pRTimelineEvent.findMany({
      where: {
        workflowId: workflow.id,
        type: { in: ['commit_pushed', 'force_push'] },
        timestamp: { gt: lastReviewEvent.timestamp },
      },
      orderBy: { timestamp: 'asc' },
    });

    const commitsSinceReview = commitEvents.map((e: { metadata: unknown; actor: string; timestamp: Date }) => {
      const meta = e.metadata as { commitSha?: string; commitMessage?: string };
      return {
        sha: meta.commitSha || '',
        message: meta.commitMessage || '',
        author: e.actor,
        timestamp: e.timestamp,
      };
    });

    return {
      lastReview: {
        reviewId: metadata.reviewId || 0,
        reviewer: lastReviewEvent.actor,
        state: metadata.state || 'commented',
        submittedAt: lastReviewEvent.timestamp,
        snapshotId: reviewSnapshot?.id || '',
      },
      diff,
      commitsSinceReview,
      aiSummary: diff?.aiSummary,
    };
  }

  /**
   * Time travel to a specific point
   */
  async timeTravel(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      targetTime?: Date;
      targetSnapshotId?: string;
      targetCommitSha?: string;
    }
  ): Promise<TimeTravelResponse> {
    const repoFullName = `${owner}/${repo}`;

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!workflow) {
      throw new Error(`Workflow not found for PR #${prNumber}`);
    }

    // Find target snapshot
    let targetSnapshot;
    if (options.targetSnapshotId) {
      targetSnapshot = await dbAny.pRSnapshot.findUnique({ where: { id: options.targetSnapshotId } });
    } else if (options.targetCommitSha) {
      targetSnapshot = await dbAny.pRSnapshot.findFirst({
        where: { workflowId: workflow.id, commitSha: options.targetCommitSha },
      });
    } else if (options.targetTime) {
      targetSnapshot = await dbAny.pRSnapshot.findFirst({
        where: {
          workflowId: workflow.id,
          capturedAt: { lte: options.targetTime },
        },
        orderBy: { capturedAt: 'desc' },
      });
    }

    if (!targetSnapshot) {
      throw new Error('Target snapshot not found');
    }

    // Get events up to target
    const eventsToDate = await dbAny.pRTimelineEvent.findMany({
      where: {
        workflowId: workflow.id,
        timestamp: { lte: targetSnapshot.capturedAt },
      },
      orderBy: { timestamp: 'asc' },
    });

    // Get current snapshot
    const currentSnapshot = await dbAny.pRSnapshot.findFirst({
      where: { workflowId: workflow.id },
      orderBy: { capturedAt: 'desc' },
    });

    // Calculate diff from current
    const diffFromCurrent = currentSnapshot
      ? await this.getSnapshotDiff(targetSnapshot.id, currentSnapshot.id)
      : {
          fromSnapshotId: targetSnapshot.id,
          toSnapshotId: targetSnapshot.id,
          filesAdded: [],
          filesModified: [],
          filesDeleted: [],
          netAdditions: 0,
          netDeletions: 0,
          commitsBetween: 0,
          eventsBetween: [],
        };

    // Get future changes preview
    const futureEvents = await dbAny.pRTimelineEvent.count({
      where: {
        workflowId: workflow.id,
        timestamp: { gt: targetSnapshot.capturedAt },
      },
    });

    const futureCommits = await dbAny.pRTimelineEvent.count({
      where: {
        workflowId: workflow.id,
        type: { in: ['commit_pushed', 'force_push'] },
        timestamp: { gt: targetSnapshot.capturedAt },
      },
    });

    return {
      snapshot: this.mapSnapshot(targetSnapshot),
      eventsToDate: eventsToDate.map((e: DBEvent) => this.mapEvent(e)),
      diffFromCurrent,
      futureChangesPreview: {
        commitsAfter: futureCommits,
        eventsAfter: futureEvents,
        filesChangedAfter: diffFromCurrent.filesAdded.length + diffFromCurrent.filesModified.length + diffFromCurrent.filesDeleted.length,
      },
    };
  }

  // Private helpers

  private shouldCaptureSnapshot(type: TimelineEventType): boolean {
    const snapshotTriggers: TimelineEventType[] = [
      'pr_opened',
      'pr_updated',
      'commit_pushed',
      'force_push',
      'review_submitted',
      'merge_conflict',
      'conflict_resolved',
    ];
    return snapshotTriggers.includes(type);
  }

  private isSignificantEvent(type: TimelineEventType, metadata: TimelineEventMetadata): boolean {
    const significantTypes: TimelineEventType[] = [
      'pr_opened',
      'pr_merged',
      'pr_closed',
      'force_push',
      'review_submitted',
      'merge_conflict',
    ];

    if (significantTypes.includes(type)) return true;

    if (type === 'review_submitted' && 'state' in metadata) {
      return metadata.state === 'approved' || metadata.state === 'changes_requested';
    }

    return false;
  }

  private async checkMilestones(workflowId: string, type: TimelineEventType, eventId: string): Promise<void> {
    const milestoneMap: Partial<Record<TimelineEventType, string>> = {
      'review_submitted': 'first_review',
      'pr_merged': 'merged',
    };

    const milestoneType = milestoneMap[type];
    if (!milestoneType) return;

    // Check if milestone already exists
    const existing = await dbAny.pRTimelineMilestone.findFirst({
      where: { workflowId, type: milestoneType },
    });

    if (!existing) {
      await dbAny.pRTimelineMilestone.create({
        data: {
          workflowId,
          type: milestoneType,
          reachedAt: new Date(),
          eventId,
          description: `${milestoneType.replace('_', ' ')} reached`,
        },
      });
    }
  }

  private calculateStats(
    snapshots: unknown[],
    events: unknown[],
    milestones: unknown[],
    workflow: { createdAt: Date; completedAt: Date | null }
  ): TimelineStats {
    const duration = workflow.completedAt
      ? (workflow.completedAt.getTime() - workflow.createdAt.getTime()) / (1000 * 60 * 60)
      : (Date.now() - workflow.createdAt.getTime()) / (1000 * 60 * 60);

    const typedEvents = events as Array<{ type: string; timestamp: Date }>;
    const typedMilestones = milestones as Array<{ type: string; reachedAt: Date }>;
    const typedSnapshots = snapshots as Array<{ linesAdded: number; linesRemoved: number }>;

    const firstReview = typedMilestones.find(m => m.type === 'first_review');
    const timeToFirstReview = firstReview
      ? (firstReview.reachedAt.getTime() - workflow.createdAt.getTime()) / (1000 * 60 * 60)
      : null;

    const firstApproval = typedMilestones.find(m => m.type === 'first_approval');
    const timeToFirstApproval = firstApproval
      ? (firstApproval.reachedAt.getTime() - workflow.createdAt.getTime()) / (1000 * 60 * 60)
      : null;

    const forcePushes = typedEvents.filter(e => e.type === 'force_push');
    const commits = typedEvents.filter(e => e.type === 'commit_pushed' || e.type === 'force_push');
    const comments = typedEvents.filter(e => e.type === 'comment_added');
    const reviews = typedEvents.filter(e => e.type === 'review_submitted');

    const peakLines = Math.max(...typedSnapshots.map(s => s.linesAdded + s.linesRemoved), 0);
    const lastSnapshot = typedSnapshots[typedSnapshots.length - 1];
    const finalLines = lastSnapshot ? lastSnapshot.linesAdded + lastSnapshot.linesRemoved : 0;

    return {
      totalDurationHours: Math.round(duration * 10) / 10,
      timeToFirstReviewHours: timeToFirstReview ? Math.round(timeToFirstReview * 10) / 10 : null,
      timeToFirstApprovalHours: timeToFirstApproval ? Math.round(timeToFirstApproval * 10) / 10 : null,
      reviewCycles: reviews.length,
      forcePushCount: forcePushes.length,
      totalCommits: commits.length,
      totalComments: comments.length,
      totalReviews: reviews.length,
      peakLinesChanged: peakLines,
      finalLinesChanged: finalLines,
    };
  }

  private async generateAISummary(diff: SnapshotDiff): Promise<string> {
    try {
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: 'You are a code review assistant. Summarize the changes between two PR snapshots in 2-3 sentences.',
        },
        {
          role: 'user',
          content: `Summarize these changes:
- Files added: ${diff.filesAdded.map(f => f.path).join(', ') || 'none'}
- Files modified: ${diff.filesModified.map(f => f.path).join(', ') || 'none'}
- Files deleted: ${diff.filesDeleted.map(f => f.path).join(', ') || 'none'}
- Net lines: +${diff.netAdditions} -${diff.netDeletions}
- Commits: ${diff.commitsBetween}`,
        },
      ];

      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 200 });
      return response.content;
    } catch (error) {
      logger.warn({ error }, 'Failed to generate AI summary');
      return '';
    }
  }

  private mapSnapshot(snapshot: {
    id: string;
    workflowId: string;
    repositoryId: string;
    prNumber: number;
    commitSha: string;
    headBranch: string;
    baseBranch: string;
    title: string;
    description: string | null;
    files: unknown;
    linesAdded: number;
    linesRemoved: number;
    labels: string[];
    assignees: string[];
    reviewStatus: string;
    commentCount: number;
    ciStatus: string | null;
    capturedAt: Date;
    previousSnapshotId: string | null;
  }): PRSnapshot {
    return {
      id: snapshot.id,
      workflowId: snapshot.workflowId,
      repositoryId: snapshot.repositoryId,
      prNumber: snapshot.prNumber,
      commitSha: snapshot.commitSha,
      headBranch: snapshot.headBranch,
      baseBranch: snapshot.baseBranch,
      title: snapshot.title,
      description: snapshot.description,
      files: snapshot.files as SnapshotFile[],
      linesAdded: snapshot.linesAdded,
      linesRemoved: snapshot.linesRemoved,
      labels: snapshot.labels,
      assignees: snapshot.assignees,
      reviewStatus: snapshot.reviewStatus as PRSnapshot['reviewStatus'],
      commentCount: snapshot.commentCount,
      ciStatus: snapshot.ciStatus as PRSnapshot['ciStatus'],
      capturedAt: snapshot.capturedAt,
      previousSnapshotId: snapshot.previousSnapshotId,
    };
  }

  private mapEvent(event: {
    id: string;
    workflowId: string;
    type: string;
    actor: string;
    timestamp: Date;
    snapshotId: string | null;
    metadata: unknown;
    isSignificant: boolean;
  }): TimelineEvent {
    return {
      id: event.id,
      workflowId: event.workflowId,
      type: event.type as TimelineEventType,
      actor: event.actor,
      timestamp: event.timestamp,
      snapshotId: event.snapshotId || undefined,
      metadata: event.metadata as TimelineEventMetadata,
      isSignificant: event.isSignificant,
    };
  }

  private mapMilestone(milestone: {
    id: string;
    workflowId: string;
    type: string;
    reachedAt: Date;
    eventId: string | null;
    description: string;
  }): TimelineMilestone {
    return {
      type: milestone.type as TimelineMilestone['type'],
      reachedAt: milestone.reachedAt,
      eventId: milestone.eventId || undefined,
      description: milestone.description,
    };
  }
}

export const timeMachineService = new TimeMachineService();
