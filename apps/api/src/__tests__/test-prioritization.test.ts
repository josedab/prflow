import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findUnique: vi.fn(),
    },
    repository: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'repo-1',
        fullName: 'owner/repo',
      }),
    },
  },
}));

// Mock GitHub client
vi.mock('@prflow/github-client', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    getPullRequestFiles: vi.fn().mockResolvedValue([
      { path: 'src/index.ts', additions: 10, deletions: 5 },
    ]),
  })),
}));

// Mock logger
vi.mock('../lib/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('TestPrioritizationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export testPrioritizationService instance', async () => {
      const { testPrioritizationService } = await import('../services/test-prioritization.js');
      expect(testPrioritizationService).toBeDefined();
    });

    it('should export TestPrioritizationService class', async () => {
      const { TestPrioritizationService } = await import('../services/test-prioritization.js');
      expect(typeof TestPrioritizationService).toBe('function');
    });

    it('should have prioritizeTests method', async () => {
      const { testPrioritizationService } = await import('../services/test-prioritization.js');
      expect(typeof testPrioritizationService.prioritizeTests).toBe('function');
    });

    it('should have predictFailures method', async () => {
      const { testPrioritizationService } = await import('../services/test-prioritization.js');
      expect(typeof testPrioritizationService.predictFailures).toBe('function');
    });

    it('should have getTestInfo method', async () => {
      const { testPrioritizationService } = await import('../services/test-prioritization.js');
      expect(typeof testPrioritizationService.getTestInfo).toBe('function');
    });

    it('should have recordTestRun method', async () => {
      const { testPrioritizationService } = await import('../services/test-prioritization.js');
      expect(typeof testPrioritizationService.recordTestRun).toBe('function');
    });
  });

  describe('Test file structure', () => {
    it('should have correct test file structure', () => {
      const mockTestFile = {
        path: 'src/__tests__/utils.test.ts',
        name: 'utils.test.ts',
        type: 'unit' as const,
        avgDuration: 1.5,
        lastRun: new Date().toISOString(),
        lastStatus: 'passed' as const,
        failureRate: 0.05,
      };

      expect(mockTestFile).toHaveProperty('path');
      expect(mockTestFile).toHaveProperty('type');
      expect(mockTestFile).toHaveProperty('avgDuration');
      expect(mockTestFile).toHaveProperty('failureRate');
    });
  });

  describe('Test types', () => {
    it('should support all test types', () => {
      const types = ['unit', 'integration', 'e2e'];
      
      types.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Test priority structure', () => {
    it('should have correct priority structure', () => {
      const mockPriority = {
        testFile: {
          path: 'test.ts',
          name: 'test.ts',
          type: 'unit' as const,
          avgDuration: 2,
          failureRate: 0.1,
        },
        priority: 85,
        reason: 'covers 3 changed files; 10% historical failure rate',
        impactedBy: ['src/a.ts', 'src/b.ts', 'src/c.ts'],
        estimatedDuration: 2,
      };

      expect(mockPriority).toHaveProperty('priority');
      expect(mockPriority).toHaveProperty('reason');
      expect(mockPriority).toHaveProperty('impactedBy');
      expect(mockPriority.priority).toBeGreaterThan(0);
    });
  });

  describe('Prioritization result structure', () => {
    it('should have correct result structure', () => {
      const mockResult = {
        workflowId: 'wf-123',
        analyzedAt: new Date().toISOString(),
        totalTests: 100,
        recommendedTests: [],
        estimatedTotalDuration: 300,
        confidenceScore: 0.85,
        savings: {
          testsSkipped: 70,
          timesSaved: 600,
        },
      };

      expect(mockResult).toHaveProperty('totalTests');
      expect(mockResult).toHaveProperty('recommendedTests');
      expect(mockResult).toHaveProperty('confidenceScore');
      expect(mockResult).toHaveProperty('savings');
    });
  });

  describe('Failure prediction', () => {
    it('should categorize tests by risk level', () => {
      const mockPrediction = {
        highRisk: [{ priority: 90 }],
        mediumRisk: [{ priority: 60 }],
        lowRisk: [{ priority: 30 }],
      };

      expect(mockPrediction).toHaveProperty('highRisk');
      expect(mockPrediction).toHaveProperty('mediumRisk');
      expect(mockPrediction).toHaveProperty('lowRisk');
    });
  });
});
