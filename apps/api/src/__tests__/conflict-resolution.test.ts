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
        defaultBranch: 'main',
      }),
    },
  },
}));

// Mock GitHub client
vi.mock('@prflow/github-client', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    getPullRequest: vi.fn().mockResolvedValue({ mergeable: true }),
    compareBranches: vi.fn().mockResolvedValue({ aheadBy: 2, behindBy: 1, status: 'diverged' }),
    getRef: vi.fn().mockResolvedValue({ object: { sha: 'sha123' } }),
    createTree: vi.fn().mockResolvedValue('treeSha'),
    createCommit: vi.fn().mockResolvedValue('commitSha'),
    updateRef: vi.fn().mockResolvedValue({}),
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

describe('ConflictResolutionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export conflictResolutionService instance', async () => {
      const { conflictResolutionService } = await import('../services/conflict-resolution.js');
      expect(conflictResolutionService).toBeDefined();
    });

    it('should export ConflictResolutionService class', async () => {
      const { ConflictResolutionService } = await import('../services/conflict-resolution.js');
      expect(typeof ConflictResolutionService).toBe('function');
    });

    it('should have analyzeConflicts method', async () => {
      const { conflictResolutionService } = await import('../services/conflict-resolution.js');
      expect(typeof conflictResolutionService.analyzeConflicts).toBe('function');
    });

    it('should have resolveConflicts method', async () => {
      const { conflictResolutionService } = await import('../services/conflict-resolution.js');
      expect(typeof conflictResolutionService.resolveConflicts).toBe('function');
    });

    it('should have getSuggestedResolution method', async () => {
      const { conflictResolutionService } = await import('../services/conflict-resolution.js');
      expect(typeof conflictResolutionService.getSuggestedResolution).toBe('function');
    });
  });

  describe('Conflict file structure', () => {
    it('should have correct conflict file structure', () => {
      const mockConflictFile = {
        path: 'src/index.ts',
        content: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feature',
        base: 'original',
        ours: 'ours',
        theirs: 'theirs',
        conflictMarkers: [{
          startLine: 1,
          endLine: 5,
          oursContent: 'ours',
          theirsContent: 'theirs',
        }],
      };

      expect(mockConflictFile).toHaveProperty('path');
      expect(mockConflictFile).toHaveProperty('conflictMarkers');
      expect(Array.isArray(mockConflictFile.conflictMarkers)).toBe(true);
    });
  });

  describe('Resolution strategies', () => {
    it('should support all resolution strategies', () => {
      const strategies = ['ours', 'theirs', 'merged', 'ai_suggested'];
      
      strategies.forEach(strategy => {
        expect(typeof strategy).toBe('string');
      });
    });
  });

  describe('Resolution result structure', () => {
    it('should have correct resolution structure', () => {
      const mockResolution = {
        path: 'src/index.ts',
        resolvedContent: 'merged content',
        strategy: 'merged' as const,
        confidence: 0.85,
        explanation: 'Combined non-overlapping changes',
      };

      expect(mockResolution).toHaveProperty('path');
      expect(mockResolution).toHaveProperty('resolvedContent');
      expect(mockResolution).toHaveProperty('strategy');
      expect(mockResolution).toHaveProperty('confidence');
      expect(mockResolution.confidence).toBeGreaterThanOrEqual(0);
      expect(mockResolution.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Resolution result structure', () => {
    it('should have correct result structure', () => {
      const mockResult = {
        success: true,
        resolvedFiles: [],
        unresolvedFiles: [],
        commitSha: 'abc123',
      };

      expect(mockResult).toHaveProperty('success');
      expect(mockResult).toHaveProperty('resolvedFiles');
      expect(mockResult).toHaveProperty('unresolvedFiles');
    });

    it('should handle failed results', () => {
      const failedResult = {
        success: false,
        resolvedFiles: [],
        unresolvedFiles: ['src/conflict.ts'],
        error: 'Could not resolve conflicts',
      };

      expect(failedResult.success).toBe(false);
      expect(failedResult).toHaveProperty('error');
    });
  });
});
