/**
 * @fileoverview PR Time Machine API Routes
 *
 * REST API endpoints for:
 * - Viewing PR timeline and evolution
 * - Capturing snapshots
 * - Getting diffs between points in time
 * - "Since last review" functionality
 * - Time travel to past states
 *
 * @module routes/time-machine
 */

import type { FastifyInstance } from 'fastify';
import { timeMachineService } from '../services/time-machine.js';
import { logger } from '../lib/logger.js';
import type { TimelineEventType, TimelineEventMetadata } from '@prflow/core';

interface RepoParams {
  owner: string;
  repo: string;
}

interface PRParams extends RepoParams {
  prNumber: string;
}

export async function timeMachineRoutes(app: FastifyInstance) {
  /**
   * Get complete PR timeline
   * GET /api/time-machine/:owner/:repo/:prNumber/timeline
   */
  app.get<{
    Params: PRParams;
  }>('/:owner/:repo/:prNumber/timeline', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;

    try {
      const timeline = await timeMachineService.getTimeline(owner, repo, parseInt(prNumber, 10));

      return reply.send({
        success: true,
        data: timeline,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get timeline';
      logger.error({ error, owner, repo, prNumber }, 'Failed to get PR timeline');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Capture a snapshot manually
   * POST /api/time-machine/:owner/:repo/:prNumber/snapshot
   */
  app.post<{
    Params: PRParams;
    Body: { trigger?: TimelineEventType };
  }>('/:owner/:repo/:prNumber/snapshot', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const { trigger = 'pr_updated' } = request.body;

    try {
      const snapshot = await timeMachineService.captureSnapshot(
        owner,
        repo,
        parseInt(prNumber, 10),
        trigger
      );

      return reply.send({
        success: true,
        data: snapshot,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to capture snapshot';
      logger.error({ error, owner, repo, prNumber }, 'Failed to capture snapshot');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Record a timeline event
   * POST /api/time-machine/:owner/:repo/:prNumber/event
   */
  app.post<{
    Params: PRParams;
    Body: {
      type: TimelineEventType;
      actor: string;
      metadata: TimelineEventMetadata;
      captureSnapshot?: boolean;
    };
  }>('/:owner/:repo/:prNumber/event', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const { type, actor, metadata, captureSnapshot = true } = request.body;

    try {
      const event = await timeMachineService.recordEvent(
        owner,
        repo,
        parseInt(prNumber, 10),
        type,
        actor,
        metadata,
        captureSnapshot
      );

      return reply.send({
        success: true,
        data: event,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record event';
      logger.error({ error, owner, repo, prNumber }, 'Failed to record event');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get diff between two snapshots
   * GET /api/time-machine/diff/:fromSnapshotId/:toSnapshotId
   */
  app.get<{
    Params: { fromSnapshotId: string; toSnapshotId: string };
    Querystring: { includeAISummary?: string };
  }>('/diff/:fromSnapshotId/:toSnapshotId', async (request, reply) => {
    const { fromSnapshotId, toSnapshotId } = request.params;
    const includeAISummary = request.query.includeAISummary === 'true';

    try {
      const diff = await timeMachineService.getSnapshotDiff(
        fromSnapshotId,
        toSnapshotId,
        includeAISummary
      );

      return reply.send({
        success: true,
        data: diff,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get diff';
      logger.error({ error, fromSnapshotId, toSnapshotId }, 'Failed to get snapshot diff');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get changes since last review
   * GET /api/time-machine/:owner/:repo/:prNumber/since-last-review
   */
  app.get<{
    Params: PRParams;
    Querystring: { reviewer?: string };
  }>('/:owner/:repo/:prNumber/since-last-review', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const { reviewer } = request.query;

    try {
      const result = await timeMachineService.getSinceLastReview(
        owner,
        repo,
        parseInt(prNumber, 10),
        reviewer
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get changes since review';
      logger.error({ error, owner, repo, prNumber }, 'Failed to get since last review');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Time travel to a specific point
   * POST /api/time-machine/:owner/:repo/:prNumber/time-travel
   */
  app.post<{
    Params: PRParams;
    Body: {
      targetTime?: string;
      targetSnapshotId?: string;
      targetCommitSha?: string;
    };
  }>('/:owner/:repo/:prNumber/time-travel', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const { targetTime, targetSnapshotId, targetCommitSha } = request.body;

    try {
      const result = await timeMachineService.timeTravel(
        owner,
        repo,
        parseInt(prNumber, 10),
        {
          targetTime: targetTime ? new Date(targetTime) : undefined,
          targetSnapshotId,
          targetCommitSha,
        }
      );

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Time travel failed';
      logger.error({ error, owner, repo, prNumber }, 'Time travel failed');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get snapshots for a PR
   * GET /api/time-machine/:owner/:repo/:prNumber/snapshots
   */
  app.get<{
    Params: PRParams;
    Querystring: { limit?: string; offset?: string };
  }>('/:owner/:repo/:prNumber/snapshots', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const limit = parseInt(request.query.limit || '50', 10);
    const offset = parseInt(request.query.offset || '0', 10);

    try {
      const timeline = await timeMachineService.getTimeline(owner, repo, parseInt(prNumber, 10));

      const snapshots = timeline.snapshots.slice(offset, offset + limit);

      return reply.send({
        success: true,
        data: {
          snapshots,
          total: timeline.snapshots.length,
          limit,
          offset,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get snapshots';
      logger.error({ error, owner, repo, prNumber }, 'Failed to get snapshots');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get significant events only
   * GET /api/time-machine/:owner/:repo/:prNumber/significant-events
   */
  app.get<{
    Params: PRParams;
  }>('/:owner/:repo/:prNumber/significant-events', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;

    try {
      const timeline = await timeMachineService.getTimeline(owner, repo, parseInt(prNumber, 10));

      const significantEvents = timeline.events.filter(e => e.isSignificant);

      return reply.send({
        success: true,
        data: {
          events: significantEvents,
          milestones: timeline.milestones,
          stats: timeline.stats,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get significant events';
      logger.error({ error, owner, repo, prNumber }, 'Failed to get significant events');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Compare two commits
   * GET /api/time-machine/:owner/:repo/:prNumber/compare/:baseSha/:headSha
   */
  app.get<{
    Params: PRParams & { baseSha: string; headSha: string };
    Querystring: { includeAISummary?: string };
  }>('/:owner/:repo/:prNumber/compare/:baseSha/:headSha', async (request, reply) => {
    const { owner, repo, prNumber, baseSha, headSha } = request.params;
    const includeAISummary = request.query.includeAISummary === 'true';

    try {
      // Find snapshots for these commits
      const timeline = await timeMachineService.getTimeline(owner, repo, parseInt(prNumber, 10));

      const baseSnapshot = timeline.snapshots.find(s => s.commitSha === baseSha);
      const headSnapshot = timeline.snapshots.find(s => s.commitSha === headSha);

      if (!baseSnapshot || !headSnapshot) {
        return reply.status(404).send({
          success: false,
          error: 'Snapshots for specified commits not found',
        });
      }

      const diff = await timeMachineService.getSnapshotDiff(
        baseSnapshot.id,
        headSnapshot.id,
        includeAISummary
      );

      return reply.send({
        success: true,
        data: {
          baseSnapshot,
          headSnapshot,
          diff,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to compare commits';
      logger.error({ error, owner, repo, prNumber, baseSha, headSha }, 'Failed to compare commits');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
}
