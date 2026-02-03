import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { conflictPreventionRoutes } from '../routes/conflict-prevention.js';

// Mock the conflict prevention service class
vi.mock('../services/conflict-prevention.js', () => ({
  ConflictPreventionService: vi.fn().mockImplementation(() => ({
    scanRepository: vi.fn(),
    getLatestScan: vi.fn(),
  })),
}));

describe('Conflict Prevention Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(conflictPreventionRoutes, { prefix: '/api/conflicts' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/conflicts/scan/:owner/:repo', () => {
    it('should scan repository for conflicts', async () => {
      const { ConflictPreventionService } = await import('../services/conflict-prevention.js');
      const mockInstance = vi.mocked(ConflictPreventionService).mock.results[0]?.value;

      if (mockInstance) {
        mockInstance.scanRepository.mockResolvedValue({
          repository: { owner: 'test', name: 'repo', fullName: 'test/repo' },
          scannedAt: new Date(),
          prsAnalyzed: 5,
          conflicts: [
            {
              id: 'conflict-1',
              type: 'overlap',
              severity: 'high',
              probability: 0.85,
              pr1: { number: 1, title: 'PR 1', author: 'user1', branch: 'feature-1' },
              pr2: { number: 2, title: 'PR 2', author: 'user2', branch: 'feature-2' },
              conflictingFiles: ['src/app.ts'],
              locations: [],
              suggestedResolution: { action: 'merge_first', description: 'Merge PR 1 first', steps: [] },
              detectedAt: new Date(),
            },
          ],
          hotspots: [
            { file: 'src/app.ts', prNumbers: [1, 2], conflictRisk: 0.9, lastModified: new Date() },
          ],
          mergeOrder: { recommended: [1, 2], reasoning: 'Based on conflict probability', alternativeOrders: [] },
        });
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/conflicts/scan/test/repo',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should handle scan errors', async () => {
      const { ConflictPreventionService } = await import('../services/conflict-prevention.js');
      const mockInstance = vi.mocked(ConflictPreventionService).mock.results[0]?.value;

      if (mockInstance) {
        mockInstance.scanRepository.mockRejectedValue(new Error('Repository not found'));
      }

      const response = await app.inject({
        method: 'POST',
        url: '/api/conflicts/scan/invalid/repo',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/conflicts/scan/:owner/:repo', () => {
    it('should get latest scan', async () => {
      const { ConflictPreventionService } = await import('../services/conflict-prevention.js');
      const mockInstance = vi.mocked(ConflictPreventionService).mock.results[0]?.value;

      if (mockInstance) {
        mockInstance.getLatestScan.mockResolvedValue({
          repository: { owner: 'test', name: 'repo', fullName: 'test/repo' },
          scannedAt: new Date(),
          prsAnalyzed: 3,
          conflicts: [],
          hotspots: [],
          mergeOrder: { recommended: [], reasoning: 'No conflicts', alternativeOrders: [] },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/conflicts/scan/test/repo',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });

    it('should return 404 when no scan found', async () => {
      const { ConflictPreventionService } = await import('../services/conflict-prevention.js');
      const mockInstance = vi.mocked(ConflictPreventionService).mock.results[0]?.value;

      if (mockInstance) {
        mockInstance.getLatestScan.mockResolvedValue(null);
      }

      const response = await app.inject({
        method: 'GET',
        url: '/api/conflicts/scan/new/repo',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });
});
