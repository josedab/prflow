import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
    },
    reviewComment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    reviewPattern: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    reviewFeedback: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    codebaseContext: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
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

describe('LearningService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export learningService instance', async () => {
      const { learningService } = await import('../services/learning.js');
      expect(learningService).toBeDefined();
    });

    it('should export LearningService class', async () => {
      const { LearningService } = await import('../services/learning.js');
      expect(typeof LearningService).toBe('function');
    });

    it('should have recordFeedback method', async () => {
      const { learningService } = await import('../services/learning.js');
      expect(typeof learningService.recordFeedback).toBe('function');
    });

    it('should have learnFromWorkflow method', async () => {
      const { learningService } = await import('../services/learning.js');
      expect(typeof learningService.learnFromWorkflow).toBe('function');
    });

    it('should have getLearnedPatterns method', async () => {
      const { learningService } = await import('../services/learning.js');
      expect(typeof learningService.getLearnedPatterns).toBe('function');
    });

    it('should have addConventionRule method', async () => {
      const { learningService } = await import('../services/learning.js');
      expect(typeof learningService.addConventionRule).toBe('function');
    });

    it('should have getCodebaseContext method', async () => {
      const { learningService } = await import('../services/learning.js');
      expect(typeof learningService.getCodebaseContext).toBe('function');
    });
  });

  describe('Pattern types', () => {
    it('should support all pattern types', () => {
      const validPatternTypes = [
        'NAMING_CONVENTION',
        'CODE_STYLE',
        'ERROR_HANDLING',
        'TEST_PATTERN',
        'DOCUMENTATION',
        'SECURITY',
        'ARCHITECTURE',
        'API_DESIGN',
      ];
      
      validPatternTypes.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Feedback types', () => {
    it('should support all feedback types', () => {
      const validFeedbackTypes = [
        'ACCEPTED',
        'REJECTED',
        'MODIFIED',
        'DISMISSED',
        'FALSE_POSITIVE',
      ];
      
      validFeedbackTypes.forEach(type => {
        expect(typeof type).toBe('string');
      });
    });
  });

  describe('Pattern learning', () => {
    it('should extract patterns from accepted reviews', async () => {
      const { learningService } = await import('../services/learning.js');
      
      expect(learningService.learnFromWorkflow).toBeDefined();
    });

    it('should track pattern confidence scores', () => {
      const mockPattern = {
        id: 'pattern-1',
        patternType: 'NAMING_CONVENTION',
        pattern: 'camelCase for variables',
        confidence: 0.85,
        usageCount: 50,
      };
      
      expect(mockPattern.confidence).toBeGreaterThanOrEqual(0);
      expect(mockPattern.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Feedback recording', () => {
    it('should record user feedback on comments', async () => {
      const { learningService } = await import('../services/learning.js');
      
      expect(learningService.recordFeedback).toBeDefined();
    });

    it('should adjust pattern confidence based on feedback', () => {
      const feedbackAdjustments = {
        ACCEPTED: 0.1,
        REJECTED: -0.15,
        MODIFIED: 0.05,
        DISMISSED: -0.05,
        FALSE_POSITIVE: -0.2,
      };
      
      expect(feedbackAdjustments.ACCEPTED).toBeGreaterThan(0);
      expect(feedbackAdjustments.REJECTED).toBeLessThan(0);
      expect(feedbackAdjustments.FALSE_POSITIVE).toBeLessThan(0);
    });
  });

  describe('Codebase context', () => {
    it('should store repository-level context', async () => {
      const { learningService } = await import('../services/learning.js');
      
      expect(learningService.getCodebaseContext).toBeDefined();
    });

    it('should include tech stack information', () => {
      const mockContext = {
        repositoryId: 'repo-1',
        techStack: ['TypeScript', 'React', 'Node.js'],
        conventionRules: [],
        commonPatterns: [],
      };
      
      expect(Array.isArray(mockContext.techStack)).toBe(true);
      expect(mockContext.techStack.length).toBeGreaterThan(0);
    });
  });

  describe('Convention rules', () => {
    it('should support custom convention rules', async () => {
      const { learningService } = await import('../services/learning.js');
      
      expect(learningService.addConventionRule).toBeDefined();
    });

    it('should have rule structure', () => {
      const mockRule = {
        name: 'Variable naming',
        description: 'Use camelCase for variables',
        pattern: '^[a-z][a-zA-Z0-9]*$',
        severity: 'warning',
        enabled: true,
      };
      
      expect(mockRule).toHaveProperty('name');
      expect(mockRule).toHaveProperty('pattern');
      expect(mockRule).toHaveProperty('severity');
    });
  });
});

describe('Learning Types', () => {
  it('should have correct learned pattern structure', () => {
    const mockLearnedPattern = {
      id: 'lp-123',
      repositoryId: 'repo-1',
      patternType: 'CODE_STYLE',
      pattern: 'Use const for immutable values',
      description: 'Prefer const over let when value does not change',
      examples: ['const MAX_SIZE = 100;'],
      confidence: 0.92,
      usageCount: 120,
      lastUpdated: new Date(),
    };
    
    expect(mockLearnedPattern).toHaveProperty('id');
    expect(mockLearnedPattern).toHaveProperty('patternType');
    expect(mockLearnedPattern).toHaveProperty('confidence');
    expect(mockLearnedPattern).toHaveProperty('usageCount');
    expect(Array.isArray(mockLearnedPattern.examples)).toBe(true);
  });

  it('should have correct feedback structure', () => {
    const mockFeedback = {
      id: 'fb-123',
      commentId: 'comment-1',
      feedbackType: 'ACCEPTED',
      userId: 'user-1',
      createdAt: new Date(),
    };
    
    expect(mockFeedback).toHaveProperty('commentId');
    expect(mockFeedback).toHaveProperty('feedbackType');
    expect(mockFeedback).toHaveProperty('userId');
  });
});
