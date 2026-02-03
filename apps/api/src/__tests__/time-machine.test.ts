import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { timeMachineRoutes } from '../routes/time-machine.js';

// Mock the database
vi.mock('@prflow/db', () => ({
  db: {
    repository: {
      findFirst: vi.fn(),
    },
    pRWorkflow: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock the time machine service
vi.mock('../services/time-machine.js', () => ({
  timeMachineService: {
    captureSnapshot: vi.fn(),
    getTimeline: vi.fn(),
    getSnapshotDiff: vi.fn(),
    getSinceLastReview: vi.fn(),
    timeTravel: vi.fn(),
    recordEvent: vi.fn(),
  },
}));

describe('Time Machine Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(timeMachineRoutes, { prefix: '/api/time-machine' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/time-machine/:owner/:repo/:prNumber/timeline', () => {
    it('should return timeline for a PR', async () => {
      const { timeMachineService } = await import('../services/time-machine.js');

      // Use 'as any' for mock data - tests care about route behavior not type alignment
      vi.mocked(timeMachineService.getTimeline).mockResolvedValue({
        workflowId: 'workflow-1',
        repository: { owner: 'test-owner', name: 'test-repo' },
        prNumber: 123,
        title: 'Test PR',
        author: 'testuser',
        createdAt: new Date(),
        currentStatus: 'open',
        snapshots: [],
        events: [],
        milestones: [],
        stats: {
          totalCommits: 0,
          totalReviewRounds: 0,
          totalComments: 0,
          averageReviewTime: 0,
          timeToFirstReview: 0,
          totalCIRuns: 0,
        },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/time-machine/test-owner/test-repo/123/timeline',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.prNumber).toBe(123);
    });

    it('should handle errors gracefully', async () => {
      const { timeMachineService } = await import('../services/time-machine.js');

      vi.mocked(timeMachineService.getTimeline).mockRejectedValue(
        new Error('PR not found')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/time-machine/test-owner/test-repo/999/timeline',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('POST /api/time-machine/:owner/:repo/:prNumber/snapshot', () => {
    it('should capture a snapshot', async () => {
      const { timeMachineService } = await import('../services/time-machine.js');

      vi.mocked(timeMachineService.captureSnapshot).mockResolvedValue({
        id: 'snapshot-1',
        workflowId: 'workflow-1',
        repositoryId: 'repo-1',
        prNumber: 123,
        commitSha: 'abc123',
        headBranch: 'feature',
        baseBranch: 'main',
        title: 'Test PR',
        description: 'Test description',
        files: [],
        linesAdded: 10,
        linesRemoved: 5,
        labels: [],
        assignees: [],
        reviewStatus: 'pending',
        commentCount: 0,
        ciStatus: 'success',
        capturedAt: new Date(),
        previousSnapshotId: null,
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/time-machine/test-owner/test-repo/123/snapshot',
        payload: {
          trigger: 'commit_pushed',
        },
      });

      // Route returns 200, not 201
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('snapshot-1');
    });
  });

  describe('POST /api/time-machine/:owner/:repo/:prNumber/event', () => {
    it('should record a timeline event', async () => {
      const { timeMachineService } = await import('../services/time-machine.js');

      vi.mocked(timeMachineService.recordEvent).mockResolvedValue({
        id: 'event-1',
        workflowId: 'workflow-1',
        type: 'review_submitted',
        actor: 'reviewer1',
        timestamp: new Date(),
        metadata: { type: 'review', reviewType: 'approved' },
        isSignificant: true,
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/time-machine/test-owner/test-repo/123/event',
        payload: {
          type: 'review_submitted',
          actor: 'reviewer1',
          metadata: { type: 'review', reviewType: 'approved' },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('event-1');
    });
  });

  describe('GET /api/time-machine/:owner/:repo/:prNumber/significant-events', () => {
    it('should return significant events', async () => {
      const { timeMachineService } = await import('../services/time-machine.js');

      vi.mocked(timeMachineService.getTimeline).mockResolvedValue({
        workflowId: 'workflow-1',
        repository: { owner: 'test-owner', name: 'test-repo' },
        prNumber: 123,
        title: 'Test PR',
        author: 'testuser',
        createdAt: new Date(),
        currentStatus: 'open',
        snapshots: [],
        events: [
          {
            id: 'event-1',
            workflowId: 'workflow-1',
            type: 'pr_opened',
            actor: 'testuser',
            timestamp: new Date(),
            isSignificant: true,
            metadata: { type: 'pr' },
          },
          {
            id: 'event-2',
            workflowId: 'workflow-1',
            type: 'commit_pushed',
            actor: 'testuser',
            timestamp: new Date(),
            isSignificant: false,
            metadata: { type: 'commit' },
          },
        ],
        milestones: [],
        stats: {
          totalCommits: 2,
          totalReviewRounds: 0,
          totalComments: 0,
          averageReviewTime: 0,
          timeToFirstReview: 0,
          totalCIRuns: 0,
        },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/time-machine/test-owner/test-repo/123/significant-events',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      // Only significant events should be returned
      expect(body.data.events).toHaveLength(1);
      expect(body.data.events[0].isSignificant).toBe(true);
    });
  });
});
