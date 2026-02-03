import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { impactSimulatorRoutes } from '../routes/impact-simulator.js';

// Mock the database
vi.mock('@prflow/db', () => ({
  db: {
    repository: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock the impact simulator service
vi.mock('../services/impact-simulator.js', () => ({
  impactSimulatorService: {
    runSimulation: vi.fn(),
    getLatestSimulation: vi.fn(),
    getSimulationsForPR: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
  },
}));

describe('Impact Simulator Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(impactSimulatorRoutes, { prefix: '/api/impact' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/impact/:owner/:repo/:prNumber/simulate', () => {
    it('should run impact simulation', async () => {
      const { impactSimulatorService } = await import('../services/impact-simulator.js');

      // Use 'as any' for mock data - tests care about route behavior not type alignment
      vi.mocked(impactSimulatorService.runSimulation).mockResolvedValue({
        id: 'sim-1',
        prNumber: 123,
        commitSha: 'abc123',
        simulatedAt: new Date(),
        impacts: [
          {
            id: 'impact-1',
            type: 'test_failure',
            severity: 'high',
            confidence: 0.85,
            description: 'Test suite X may fail',
            file: 'src/app.ts',
            line: 42,
            suggestedAction: 'Update tests',
            relatedTests: ['test/app.test.ts'],
          },
        ],
        testPredictions: [
          {
            testFile: 'test/app.test.ts',
            testName: 'should handle edge case',
            failureProbability: 0.75,
            reasoning: 'Related code changed',
            affectedBy: ['src/app.ts'],
          },
        ],
        apiCompatibility: [],
        dependencyGraph: {
          nodes: [],
          edges: [],
          changedNodes: [],
          affectedNodes: [],
          totalImpactScore: 0,
        },
        summary: {
          totalImpacts: 1,
          criticalCount: 0,
          highCount: 1,
          mediumCount: 0,
          lowCount: 0,
          riskLevel: 'medium',
          recommendedActions: [],
        },
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/impact/test/repo/123/simulate',
        payload: {
          includeTestPredictions: true,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.summary.riskLevel).toBe('medium');
    });

    it('should handle simulation errors', async () => {
      const { impactSimulatorService } = await import('../services/impact-simulator.js');

      vi.mocked(impactSimulatorService.runSimulation).mockRejectedValue(
        new Error('PR not found')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/impact/test/repo/999/simulate',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/impact/:owner/:repo/:prNumber/latest', () => {
    it('should return latest simulation', async () => {
      const { impactSimulatorService } = await import('../services/impact-simulator.js');

      vi.mocked(impactSimulatorService.getLatestSimulation).mockResolvedValue({
        id: 'sim-2',
        prNumber: 123,
        commitSha: 'def456',
        simulatedAt: new Date(),
        impacts: [],
        testPredictions: [],
        apiCompatibility: [],
        dependencyGraph: {
          nodes: [],
          edges: [],
          changedNodes: [],
          affectedNodes: [],
          totalImpactScore: 0,
        },
        summary: {
          totalImpacts: 2,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 2,
          riskLevel: 'low',
          recommendedActions: [],
        },
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/impact/test/repo/123/latest',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.summary.riskLevel).toBe('low');
    });

    it('should return 404 when no simulation exists', async () => {
      const { impactSimulatorService } = await import('../services/impact-simulator.js');

      vi.mocked(impactSimulatorService.getLatestSimulation).mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/impact/test/repo/456/latest',
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/impact/:owner/:repo/config', () => {
    it('should return impact config', async () => {
      const { db } = await import('@prflow/db');
      const { impactSimulatorService } = await import('../services/impact-simulator.js');

      vi.mocked(db.repository.findFirst).mockResolvedValue({
        id: 'repo-1',
        githubId: 12345,
        name: 'repo',
        fullName: 'test/repo',
        owner: 'test',
        organizationId: null,
        isPrivate: false,
        defaultBranch: 'main',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(impactSimulatorService.getConfig).mockResolvedValue({
        repositoryId: 'repo-1',
        enableTestPrediction: true,
        enableCrossRepoAnalysis: false,
        linkedRepositories: [],
        riskThresholds: { low: 25, medium: 50, high: 75 },
        ignorePatterns: ['*.md'],
        highRiskPatterns: ['**/security/**'],
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/impact/test/repo/config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.enableTestPrediction).toBe(true);
    });
  });
});
