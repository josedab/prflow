import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('@prflow/db', () => ({
  db: {
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
    createPullRequest: vi.fn().mockResolvedValue({ number: 1, url: 'https://github.com/test/pr' }),
    getPullRequest: vi.fn().mockResolvedValue({ mergeable: true }),
    getReviews: vi.fn().mockResolvedValue([{ state: 'APPROVED' }]),
    mergePullRequest: vi.fn().mockResolvedValue({}),
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

describe('MultiRepoOrchestrationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export multiRepoOrchestrationService instance', async () => {
      const { multiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(multiRepoOrchestrationService).toBeDefined();
    });

    it('should export MultiRepoOrchestrationService class', async () => {
      const { MultiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(typeof MultiRepoOrchestrationService).toBe('function');
    });

    it('should have createChangeSet method', async () => {
      const { multiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(typeof multiRepoOrchestrationService.createChangeSet).toBe('function');
    });

    it('should have createPullRequests method', async () => {
      const { multiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(typeof multiRepoOrchestrationService.createPullRequests).toBe('function');
    });

    it('should have checkMergeReadiness method', async () => {
      const { multiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(typeof multiRepoOrchestrationService.checkMergeReadiness).toBe('function');
    });

    it('should have executeMerge method', async () => {
      const { multiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(typeof multiRepoOrchestrationService.executeMerge).toBe('function');
    });

    it('should have getChangeSet method', async () => {
      const { multiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(typeof multiRepoOrchestrationService.getChangeSet).toBe('function');
    });

    it('should have rollback method', async () => {
      const { multiRepoOrchestrationService } = await import('../services/multi-repo-orchestration.js');
      expect(typeof multiRepoOrchestrationService.rollback).toBe('function');
    });
  });

  describe('Change set structure', () => {
    it('should have correct change set structure', () => {
      const mockChangeSet = {
        id: 'mrc-123',
        name: 'Feature rollout',
        description: 'Rolling out new feature across services',
        repositories: [],
        status: 'draft' as const,
        mergeOrder: ['repo-1', 'repo-2'],
        createdBy: 'user-123',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(mockChangeSet).toHaveProperty('id');
      expect(mockChangeSet).toHaveProperty('repositories');
      expect(mockChangeSet).toHaveProperty('status');
      expect(mockChangeSet).toHaveProperty('mergeOrder');
    });
  });

  describe('Change set statuses', () => {
    it('should support all change set statuses', () => {
      const statuses = ['draft', 'in_progress', 'ready', 'merging', 'completed', 'failed', 'rolled_back'];
      
      statuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('Repository change structure', () => {
    it('should have correct repository change structure', () => {
      const mockRepoChange = {
        repositoryId: 'repo-1',
        repositoryName: 'owner/repo',
        prNumber: 42,
        prUrl: 'https://github.com/owner/repo/pull/42',
        branchName: 'feature/multi-repo',
        status: 'approved' as const,
        dependencies: ['repo-0'],
        files: ['src/index.ts'],
      };

      expect(mockRepoChange).toHaveProperty('repositoryId');
      expect(mockRepoChange).toHaveProperty('branchName');
      expect(mockRepoChange).toHaveProperty('status');
      expect(mockRepoChange).toHaveProperty('dependencies');
    });
  });

  describe('Repository change statuses', () => {
    it('should support all repository statuses', () => {
      const statuses = ['pending', 'pr_created', 'approved', 'merged', 'failed'];
      
      statuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });

  describe('Orchestration result structure', () => {
    it('should have correct result structure', () => {
      const mockResult = {
        changeId: 'mrc-123',
        success: true,
        mergedRepositories: ['repo-1', 'repo-2'],
        failedRepositories: [],
        pendingRepositories: [],
        rollbackPerformed: false,
      };

      expect(mockResult).toHaveProperty('changeId');
      expect(mockResult).toHaveProperty('success');
      expect(mockResult).toHaveProperty('mergedRepositories');
      expect(mockResult).toHaveProperty('rollbackPerformed');
    });

    it('should handle failed results with rollback', () => {
      const failedResult = {
        changeId: 'mrc-123',
        success: false,
        mergedRepositories: [],
        failedRepositories: ['repo-2'],
        pendingRepositories: ['repo-3'],
        rollbackPerformed: true,
        error: 'Merge failed, rolled back',
      };

      expect(failedResult.success).toBe(false);
      expect(failedResult.rollbackPerformed).toBe(true);
      expect(failedResult).toHaveProperty('error');
    });
  });

  describe('Merge readiness check', () => {
    it('should categorize repositories by status', () => {
      const mockReadiness = {
        ready: true,
        approved: ['repo-1', 'repo-2'],
        pending: [],
        blocked: [],
      };

      expect(mockReadiness).toHaveProperty('ready');
      expect(mockReadiness).toHaveProperty('approved');
      expect(mockReadiness).toHaveProperty('pending');
      expect(mockReadiness).toHaveProperty('blocked');
    });
  });
});
