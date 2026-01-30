import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MLTrainingPipeline } from '../services/ml-training-pipeline.js';

// Mock database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    analyticsEvent: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    reviewFeedback: {
      findMany: vi.fn(),
    },
    reviewPattern: {
      findMany: vi.fn(),
    },
    codebaseContext: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { db } from '@prflow/db';

describe('MLTrainingPipeline', () => {
  let pipeline: MLTrainingPipeline;

  beforeEach(() => {
    pipeline = new MLTrainingPipeline();
    vi.clearAllMocks();
  });

  describe('collectTrainingData', () => {
    it('should collect training data from completed workflows', async () => {
      const mockWorkflows = Array(50).fill(null).map((_, i) => ({
        id: `wf-${i}`,
        prNumber: i + 1,
        prTitle: `PR ${i}`,
        authorLogin: 'user1',
        status: 'COMPLETED',
        createdAt: new Date(Date.now() - (i + 2) * 86400000),
        completedAt: new Date(Date.now() - (i + 1) * 86400000),
        analysis: {
          filesModified: i + 1,
          linesAdded: (i + 1) * 10,
          linesRemoved: i * 5,
          riskLevel: i % 4 === 0 ? 'HIGH' : 'LOW',
          complexity: (i + 1) * 0.1,
        },
        reviewComments: Array(i % 3).fill({ severity: 'MEDIUM' }),
        generatedTests: i % 2 === 0 ? [{ id: 'test' }] : [],
      }));

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);
      vi.mocked(db.pRWorkflow.groupBy).mockResolvedValue([] as never);

      const data = await pipeline.collectTrainingData('repo-1');

      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty('features');
      expect(data[0]).toHaveProperty('labels');
      expect(data[0]).toHaveProperty('metadata');
    });

    it('should handle workflows with missing analysis', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: '',
          authorLogin: 'user1',
          status: 'COMPLETED',
          createdAt: new Date(Date.now() - 48 * 3600000),
          completedAt: new Date(Date.now() - 24 * 3600000),
          analysis: null,
          reviewComments: [],
          generatedTests: [],
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);
      vi.mocked(db.pRWorkflow.groupBy).mockResolvedValue([] as never);

      const data = await pipeline.collectTrainingData('repo-1');

      // Workflows without analysis should be skipped
      expect(data.length).toBe(0);
    });
  });

  describe('trainModel', () => {
    it('should return default weights with insufficient data', async () => {
      const trainingData = Array(20).fill(null).map((_, i) => ({
        features: {
          filesChanged: i + 1,
          linesAdded: (i + 1) * 10,
          linesDeleted: i * 5,
          riskScore: 0.3,
          criticalIssues: 0,
          highIssues: 0,
          mediumIssues: 0,
          authorPreviousPRs: 5,
          authorAvgMergeTime: 24,
          repoAvgMergeTime: 24,
          hourOfDay: 14,
          dayOfWeek: 2,
          hasTests: true,
          hasDescription: true,
        },
        labels: {
          mergeTimeHours: 24,
          wasMerged: true,
          hadReviewCycles: 1,
          wasReverted: false,
        },
        metadata: {
          prNumber: i + 1,
          repositoryId: 'repo-1',
          createdAt: new Date(),
        },
      }));

      vi.mocked(db.codebaseContext.upsert).mockResolvedValue({} as never);

      const result = await pipeline.trainModel('repo-1', trainingData);

      expect(result.modelVersion).toContain('default');
      expect(result.weights).toBeDefined();
      expect(result.metrics).toBeDefined();
    });

    it('should train model with sufficient data', async () => {
      const trainingData = Array(50).fill(null).map((_, i) => ({
        features: {
          filesChanged: i + 1,
          linesAdded: (i + 1) * 10,
          linesDeleted: i * 5,
          riskScore: i % 4 === 0 ? 0.8 : 0.2,
          criticalIssues: i % 5 === 0 ? 1 : 0,
          highIssues: i % 3 === 0 ? 1 : 0,
          mediumIssues: i % 2,
          authorPreviousPRs: 5 + i,
          authorAvgMergeTime: 24,
          repoAvgMergeTime: 24,
          hourOfDay: (i % 24),
          dayOfWeek: i % 7,
          hasTests: i % 2 === 0,
          hasDescription: i % 3 !== 0,
        },
        labels: {
          mergeTimeHours: 10 + i * 0.5,
          wasMerged: i % 5 !== 0,
          hadReviewCycles: i % 3,
          wasReverted: i % 10 === 0,
        },
        metadata: {
          prNumber: i + 1,
          repositoryId: 'repo-1',
          createdAt: new Date(),
        },
      }));

      vi.mocked(db.codebaseContext.upsert).mockResolvedValue({} as never);

      const result = await pipeline.trainModel('repo-1', trainingData);

      expect(result.modelVersion).toBeDefined();
      expect(result.trainedAt).toBeInstanceOf(Date);
      expect(result.dataPoints).toBe(50);
      expect(result.weights).toBeDefined();
      expect(result.weights.mergeTime).toBeDefined();
      expect(result.weights.mergeProbability).toBeDefined();
      expect(result.metrics).toBeDefined();
    });
  });

  describe('loadModel', () => {
    it('should load model from codebase context', async () => {
      const mockWeights = {
        mergeTime: { sizeWeight: 0.1, complexityWeight: 0.2 },
        mergeProbability: { sizeWeight: 0.1 },
        blockerProbability: { riskWeight: 0.3 },
      };

      vi.mocked(db.codebaseContext.findUnique).mockResolvedValue({
        learnedPatterns: {
          predictiveModel: mockWeights,
        },
      } as never);

      const model = await pipeline.loadModel('repo-1');

      expect(model).toBeDefined();
    });

    it('should return null for repository without model', async () => {
      vi.mocked(db.codebaseContext.findUnique).mockResolvedValue(null);

      const model = await pipeline.loadModel('repo-1');

      expect(model).toBeNull();
    });
  });

  describe('getModelWeights', () => {
    it('should return default weights when no model exists', async () => {
      vi.mocked(db.codebaseContext.findUnique).mockResolvedValue(null);

      const weights = await pipeline.getModelWeights('repo-1');

      expect(weights).toBeDefined();
      expect(weights.mergeTime).toBeDefined();
      expect(weights.mergeTime.intercept).toBe(24);
    });
  });
});
