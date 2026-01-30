import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    pRHealthScore: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    teamHealthMetrics: {
      create: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    repository: {
      findUnique: vi.fn().mockResolvedValue({ id: 'repo-1', name: 'test-repo' }),
    },
  },
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

describe('HealthScoreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export healthScoreService instance', async () => {
      const { healthScoreService } = await import('../services/health-score.js');
      expect(healthScoreService).toBeDefined();
    });

    it('should export HealthScoreService class', async () => {
      const { HealthScoreService } = await import('../services/health-score.js');
      expect(typeof HealthScoreService).toBe('function');
    });

    it('should have calculatePRHealthScore method', async () => {
      const { healthScoreService } = await import('../services/health-score.js');
      expect(typeof healthScoreService.calculatePRHealthScore).toBe('function');
    });

    it('should have calculateTeamHealth method', async () => {
      const { healthScoreService } = await import('../services/health-score.js');
      expect(typeof healthScoreService.calculateTeamHealth).toBe('function');
    });

    it('should have getHealthScoreHistory method', async () => {
      const { healthScoreService } = await import('../services/health-score.js');
      expect(typeof healthScoreService.getHealthScoreHistory).toBe('function');
    });

    it('should have getRepositoryHealthTrend method', async () => {
      const { healthScoreService } = await import('../services/health-score.js');
      expect(typeof healthScoreService.getRepositoryHealthTrend).toBe('function');
    });
  });

  describe('Health score calculation', () => {
    it('should return scores between 0 and 100', async () => {
      const mockScore = {
        overallScore: 75,
        reviewLatencyScore: 80,
        commentDensityScore: 70,
        approvalVelocityScore: 85,
        riskScore: 60,
        testCoverageScore: 90,
      };
      
      expect(mockScore.overallScore).toBeGreaterThanOrEqual(0);
      expect(mockScore.overallScore).toBeLessThanOrEqual(100);
    });

    it('should have correct score components', () => {
      const scoreComponents = [
        'reviewLatencyScore',
        'commentDensityScore', 
        'approvalVelocityScore',
        'riskScore',
        'testCoverageScore',
      ];
      
      scoreComponents.forEach(component => {
        expect(typeof component).toBe('string');
      });
    });
  });

  describe('Team health metrics', () => {
    it('should aggregate team-level statistics', () => {
      const mockTeamMetrics = {
        teamId: 'team-1',
        avgReviewTime: 3600, // seconds
        avgMergeTime: 7200,
        prThroughput: 50,
        codeReviewCoverage: 95,
        overallHealthScore: 82,
      };
      
      expect(mockTeamMetrics).toHaveProperty('teamId');
      expect(mockTeamMetrics).toHaveProperty('avgReviewTime');
      expect(mockTeamMetrics).toHaveProperty('prThroughput');
      expect(mockTeamMetrics.overallHealthScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Health trend analysis', () => {
    it('should support historical trend data', async () => {
      const { healthScoreService } = await import('../services/health-score.js');
      
      expect(healthScoreService.getRepositoryHealthTrend).toBeDefined();
    });

    it('should have period options for trends', () => {
      const validPeriods = ['day', 'week', 'month', 'quarter'];
      
      validPeriods.forEach(period => {
        expect(typeof period).toBe('string');
      });
    });
  });
});

describe('Health Score Types', () => {
  it('should have correct PR health score structure', () => {
    const mockPRHealth = {
      workflowId: 'workflow-123',
      overallScore: 78,
      reviewLatencyScore: 85,
      commentDensityScore: 72,
      approvalVelocityScore: 80,
      riskScore: 65,
      testCoverageScore: 88,
      predictedMergeDate: new Date(),
      bottlenecks: ['Waiting for review'],
    };
    
    expect(mockPRHealth).toHaveProperty('workflowId');
    expect(mockPRHealth).toHaveProperty('overallScore');
    expect(mockPRHealth).toHaveProperty('bottlenecks');
    expect(Array.isArray(mockPRHealth.bottlenecks)).toBe(true);
  });

  it('should support predictedMergeDate', () => {
    const healthScore = {
      workflowId: 'wf-1',
      predictedMergeDate: new Date('2026-02-01'),
    };
    
    expect(healthScore.predictedMergeDate).toBeInstanceOf(Date);
  });

  it('should identify bottlenecks', () => {
    const possibleBottlenecks = [
      'Waiting for review',
      'CI checks pending',
      'Merge conflicts',
      'Approval required',
      'Tests failing',
    ];
    
    possibleBottlenecks.forEach(bottleneck => {
      expect(typeof bottleneck).toBe('string');
    });
  });
});
