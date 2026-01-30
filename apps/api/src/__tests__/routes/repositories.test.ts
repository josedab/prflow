import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { repositoryRoutes } from '../../routes/repositories.js';

// Mock the database
vi.mock('@prflow/db', () => ({
  db: {
    repository: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    repositorySettings: {
      upsert: vi.fn(),
    },
  },
}));

import { db } from '@prflow/db';

describe('Repository Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(repositoryRoutes, { prefix: '/api/repositories' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/repositories/:owner/:repo', () => {
    it('should return repository when found', async () => {
      const mockRepo = {
        id: 'repo-123',
        fullName: 'test-owner/test-repo',
        name: 'test-repo',
        owner: 'test-owner',
        defaultBranch: 'main',
        settings: {
          reviewEnabled: true,
          testGenerationEnabled: true,
        },
      };

      vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as never);

      const response = await app.inject({
        method: 'GET',
        url: '/api/repositories/test-owner/test-repo',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.fullName).toBe('test-owner/test-repo');
      expect(body.settings.reviewEnabled).toBe(true);
    });

    it('should return 404 when repository not found', async () => {
      vi.mocked(db.repository.findUnique).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/repositories/unknown/repo',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      // Error format depends on whether error handler is registered
      expect(body.error || body.message).toBeTruthy();
    });
  });

  describe('PATCH /api/repositories/:owner/:repo/settings', () => {
    it('should update repository settings', async () => {
      const mockRepo = { id: 'repo-123', fullName: 'test-owner/test-repo' };
      const mockSettings = {
        id: 'settings-123',
        repositoryId: 'repo-123',
        reviewEnabled: false,
        testGenerationEnabled: true,
      };

      vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as never);
      vi.mocked(db.repositorySettings.upsert).mockResolvedValue(mockSettings as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repositories/test-owner/test-repo/settings',
        payload: { reviewEnabled: false },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.reviewEnabled).toBe(false);
    });

    it('should return 404 when repository not found for settings update', async () => {
      vi.mocked(db.repository.findUnique).mockResolvedValue(null);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repositories/unknown/repo/settings',
        payload: { reviewEnabled: false },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should accept valid severity threshold values', async () => {
      const mockRepo = { id: 'repo-123', fullName: 'test-owner/test-repo' };
      const mockSettings = {
        id: 'settings-123',
        repositoryId: 'repo-123',
        severityThreshold: 'HIGH',
      };

      vi.mocked(db.repository.findUnique).mockResolvedValue(mockRepo as never);
      vi.mocked(db.repositorySettings.upsert).mockResolvedValue(mockSettings as never);

      const response = await app.inject({
        method: 'PATCH',
        url: '/api/repositories/test-owner/test-repo/settings',
        payload: { severityThreshold: 'HIGH' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.severityThreshold).toBe('HIGH');
    });
  });

  describe('GET /api/repositories', () => {
    it('should list all repositories', async () => {
      const mockRepos = [
        { id: 'repo-1', fullName: 'owner/repo1' },
        { id: 'repo-2', fullName: 'owner/repo2' },
      ];

      vi.mocked(db.repository.findMany).mockResolvedValue(mockRepos as never);

      const response = await app.inject({
        method: 'GET',
        url: '/api/repositories',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
    });

    it('should filter by installationId', async () => {
      const mockRepos = [{ id: 'repo-1', fullName: 'owner/repo1' }];

      vi.mocked(db.repository.findMany).mockResolvedValue(mockRepos as never);

      const response = await app.inject({
        method: 'GET',
        url: '/api/repositories?installationId=12345',
      });

      expect(response.statusCode).toBe(200);
      expect(db.repository.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organization: { installationId: 12345 } },
        })
      );
    });
  });
});
