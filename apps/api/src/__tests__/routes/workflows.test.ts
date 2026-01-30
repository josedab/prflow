import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { workflowRoutes } from '../../routes/workflows.js';

// Mock the database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    reviewComment: {
      findMany: vi.fn(),
    },
    generatedTest: {
      findMany: vi.fn(),
    },
  },
}));

import { db } from '@prflow/db';

describe('Workflow Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(workflowRoutes, { prefix: '/api/workflows' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/workflows/:workflowId', () => {
    it('should return workflow when found', async () => {
      const mockWorkflow = {
        id: 'wf-123',
        prNumber: 42,
        status: 'COMPLETED',
        analysis: { prType: 'FEATURE', riskLevel: 'LOW' },
        reviewComments: [],
        generatedTests: [],
        docUpdates: [],
        synthesis: { summary: 'Good PR' },
      };

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/wf-123',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('wf-123');
      expect(body.status).toBe('COMPLETED');
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/unknown',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      // Error format depends on whether error handler is registered
      expect(body.error || body.message).toBeTruthy();
    });
  });

  describe('GET /api/workflows', () => {
    it('should list workflows with pagination', async () => {
      const mockWorkflows = [
        { id: 'wf-1', prNumber: 1, status: 'COMPLETED' },
        { id: 'wf-2', prNumber: 2, status: 'PENDING' },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);
      vi.mocked(db.pRWorkflow.count).mockResolvedValue(10);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toHaveLength(2);
      expect(body.pagination.total).toBe(10);
    });

    it('should filter by repositoryId', async () => {
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([]);
      vi.mocked(db.pRWorkflow.count).mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows?repositoryId=repo-123',
      });

      expect(response.statusCode).toBe(200);
      expect(db.pRWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ repositoryId: 'repo-123' }),
        })
      );
    });

    it('should filter by status', async () => {
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([]);
      vi.mocked(db.pRWorkflow.count).mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows?status=COMPLETED',
      });

      expect(response.statusCode).toBe(200);
      expect(db.pRWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'COMPLETED' }),
        })
      );
    });

    it('should respect limit and offset', async () => {
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([]);
      vi.mocked(db.pRWorkflow.count).mockResolvedValue(0);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows?limit=10&offset=20',
      });

      expect(response.statusCode).toBe(200);
      expect(db.pRWorkflow.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        })
      );
    });
  });

  describe('GET /api/workflows/:workflowId/comments', () => {
    it('should return review comments for workflow', async () => {
      const mockComments = [
        { id: 'comment-1', severity: 'HIGH', message: 'Bug found' },
        { id: 'comment-2', severity: 'LOW', message: 'Style issue' },
      ];

      vi.mocked(db.reviewComment.findMany).mockResolvedValue(mockComments as never);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/wf-123/comments',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body[0].severity).toBe('HIGH');
    });
  });

  describe('GET /api/workflows/:workflowId/tests', () => {
    it('should return generated tests for workflow', async () => {
      const mockTests = [
        { id: 'test-1', testFile: 'test.ts', framework: 'vitest' },
        { id: 'test-2', testFile: 'test2.ts', framework: 'jest' },
      ];

      vi.mocked(db.generatedTest.findMany).mockResolvedValue(mockTests as never);

      const response = await app.inject({
        method: 'GET',
        url: '/api/workflows/wf-123/tests',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body[0].framework).toBe('vitest');
    });
  });
});
