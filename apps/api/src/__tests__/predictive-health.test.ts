import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PredictiveHealthService } from '../services/predictive-health.js';

// Mock database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    reviewComment: {
      groupBy: vi.fn(),
    },
    analyticsEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { db } from '@prflow/db';

describe('PredictiveHealthService', () => {
  let service: PredictiveHealthService;

  beforeEach(() => {
    service = new PredictiveHealthService();
    vi.clearAllMocks();
  });

  describe('extractFeatures', () => {
    it('should extract features from a workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        prNumber: 123,
        prTitle: 'Test PR with a good description',
        authorLogin: 'testuser',
        repositoryId: 'repo-1',
        createdAt: new Date(),
        generatedTests: [{ id: 'test-1' }],
        analysis: {
          filesModified: 5,
          linesAdded: 100,
          linesRemoved: 50,
          riskLevel: 'MEDIUM',
        },
        reviewComments: [
          { severity: 'CRITICAL' },
          { severity: 'HIGH' },
          { severity: 'MEDIUM' },
        ],
      };

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([] as never);

      const features = await service.extractFeatures('workflow-1');

      expect(features).toBeDefined();
      expect(features.filesChanged).toBe(5);
      expect(features.linesAdded).toBe(100);
      expect(features.linesDeleted).toBe(50);
      expect(features.totalChanges).toBe(150);
      expect(features.criticalIssues).toBe(1);
      expect(features.highIssues).toBe(1);
      expect(features.mediumIssues).toBe(1);
      expect(features.hasTests).toBe(true);
      expect(features.hasDescription).toBe(true);
    });

    it('should handle missing analysis data', async () => {
      const mockWorkflow = {
        id: 'workflow-2',
        prNumber: 456,
        prTitle: '',
        authorLogin: 'testuser',
        repositoryId: 'repo-1',
        createdAt: new Date(),
        generatedTests: [],
        analysis: null,
        reviewComments: [],
      };

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([] as never);

      const features = await service.extractFeatures('workflow-2');

      expect(features.filesChanged).toBe(0);
      expect(features.linesAdded).toBe(0);
      expect(features.linesDeleted).toBe(0);
      expect(features.hasTests).toBe(false);
      expect(features.hasDescription).toBe(false);
    });
  });

  describe('predictMergeOutcome', () => {
    it('should generate prediction for a workflow', async () => {
      const mockWorkflow = {
        id: 'workflow-3',
        prNumber: 789,
        prTitle: 'Feature implementation',
        authorLogin: 'testuser',
        repositoryId: 'repo-1',
        createdAt: new Date(),
        generatedTests: [{ id: 'test-1' }],
        analysis: {
          filesModified: 3,
          linesAdded: 50,
          linesRemoved: 20,
          riskLevel: 'LOW',
        },
        reviewComments: [],
      };

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([] as never);
      vi.mocked(db.analyticsEvent.create).mockResolvedValue({} as never);

      const prediction = await service.predictMergeOutcome('workflow-3');

      expect(prediction).toBeDefined();
      expect(prediction.workflowId).toBe('workflow-3');
      expect(prediction.prNumber).toBe(789);
      expect(prediction.predictedMergeTimeHours).toBeGreaterThan(0);
      expect(prediction.mergeProbability).toBeGreaterThan(0);
      expect(prediction.mergeProbability).toBeLessThanOrEqual(1);
      expect(prediction.predictedAt).toBeInstanceOf(Date);
    });

    it('should identify blockers for high-risk PRs', async () => {
      const mockWorkflow = {
        id: 'workflow-4',
        prNumber: 999,
        prTitle: '',
        authorLogin: 'testuser',
        repositoryId: 'repo-1',
        createdAt: new Date(Date.now() - 86400000), // 1 day old
        generatedTests: [],
        analysis: {
          filesModified: 50,
          linesAdded: 5000,
          linesRemoved: 2000,
          riskLevel: 'CRITICAL',
        },
        reviewComments: [
          { severity: 'CRITICAL' },
          { severity: 'CRITICAL' },
          { severity: 'CRITICAL' },
        ],
      };

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([] as never);
      vi.mocked(db.analyticsEvent.create).mockResolvedValue({} as never);

      const prediction = await service.predictMergeOutcome('workflow-4');

      expect(prediction.blockerProbability).toBeGreaterThan(0.3);
      expect(prediction.predictedBlockers.length).toBeGreaterThan(0);
    });
  });

  describe('trainModel', () => {
    it('should train model with historical data', async () => {
      const mockWorkflows = Array(15).fill(null).map((_, i) => ({
        id: `workflow-${i}`,
        prNumber: i,
        prTitle: `Test PR ${i}`,
        authorLogin: 'testuser',
        repositoryId: 'repo-1',
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - (i + 1) * 86400000),
        completedAt: new Date(Date.now() - i * 86400000),
        generatedTests: [],
        analysis: {
          filesModified: i + 1,
          linesAdded: (i + 1) * 10,
          linesRemoved: i * 5,
          riskLevel: i % 4 === 0 ? 'HIGH' : 'LOW',
        },
        reviewComments: [],
      }));

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);
      vi.mocked(db.analyticsEvent.create).mockResolvedValue({} as never);

      const result = await service.trainModel('repo-1');

      expect(result).toBeDefined();
      expect(result.trainedOn).toBe(15);
      expect(result.modelVersion).toMatch(/^v\d+$/);
      expect(result.featureImportance).toBeDefined();
      expect(result.metrics.avgError).toBeGreaterThanOrEqual(0);
    });

    it('should throw error with insufficient training data', async () => {
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([] as never);

      await expect(service.trainModel('repo-1')).rejects.toThrow(
        'Insufficient data for training'
      );
    });
  });

  describe('getModelAccuracy', () => {
    it('should return accuracy metrics', async () => {
      vi.mocked(db.analyticsEvent.findMany).mockResolvedValue([]);

      const accuracy = await service.getModelAccuracy('repo-1');

      expect(accuracy).toBeDefined();
      expect(accuracy.totalPredictions).toBe(0);
      expect(accuracy.avgMergeTimeError).toBe(0);
    });
  });
});
