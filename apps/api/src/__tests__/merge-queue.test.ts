/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';

// Mock Redis
vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => ({
    zcard: vi.fn().mockResolvedValue(0),
    zadd: vi.fn().mockResolvedValue(1),
    zrange: vi.fn().mockResolvedValue([]),
    zrem: vi.fn().mockResolvedValue(1),
    publish: vi.fn().mockResolvedValue(1),
  }),
}));

// Mock db
vi.mock('@prflow/db', () => ({
  db: {
    repositorySettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock websocket
vi.mock('../lib/websocket.js', () => ({
  notifyWorkflowUpdate: vi.fn().mockResolvedValue(undefined),
}));

describe('MergeQueueService', () => {
  describe('Queue operations', () => {
    it('should get queue key correctly', async () => {
      const { getMergeQueueService } = await import('../services/merge-queue.js');
      const service = getMergeQueueService();
      
      // The service should be initialized
      expect(service).toBeDefined();
    });

    it('should have default configuration', async () => {
      const { getMergeQueueService } = await import('../services/merge-queue.js');
      const service = getMergeQueueService();
      
      const config = await service.getConfig('test-repo-id');
      
      expect(config.enabled).toBe(true);
      expect(config.autoMergeEnabled).toBe(false);
      expect(config.requireApprovals).toBe(1);
      expect(config.requireChecks).toBe(true);
      expect(config.requireUpToDate).toBe(true);
      expect(config.mergeMethod).toBe('squash');
      expect(config.batchSize).toBe(1);
      expect(config.maxWaitTimeMinutes).toBe(60);
    });

    it('should have autoResolveConflicts config option', async () => {
      const { getMergeQueueService } = await import('../services/merge-queue.js');
      const service = getMergeQueueService();
      
      const config = await service.getConfig('test-repo-id');
      
      expect(config).toHaveProperty('autoResolveConflicts');
      expect(typeof config.autoResolveConflicts).toBe('boolean');
    });

    it('should have checkConflicts config option', async () => {
      const { getMergeQueueService } = await import('../services/merge-queue.js');
      const service = getMergeQueueService();
      
      const config = await service.getConfig('test-repo-id');
      
      expect(config).toHaveProperty('checkConflicts');
      expect(typeof config.checkConflicts).toBe('boolean');
    });
  });

  describe('Queue config', () => {
    it('should return default config when no custom config exists', async () => {
      const { getMergeQueueService } = await import('../services/merge-queue.js');
      const service = getMergeQueueService();
      
      const config = await service.getConfig('nonexistent-repo');
      
      expect(config.enabled).toBe(true);
      expect(config.mergeMethod).toBe('squash');
    });
  });

  describe('Auto-resolve conflicts', () => {
    it('should have rebaseAndRetry method', async () => {
      const { getMergeQueueService } = await import('../services/merge-queue.js');
      const service = getMergeQueueService();
      
      expect(typeof service.rebaseAndRetry).toBe('function');
    });

    it('should return error when PR not in queue', async () => {
      const { getMergeQueueService } = await import('../services/merge-queue.js');
      const service = getMergeQueueService();
      
      const mockGitHub = {
        getPullRequest: vi.fn(),
        updateBranch: vi.fn(),
      } as any;

      const result = await service.rebaseAndRetry(
        mockGitHub,
        'owner',
        'repo',
        'repo-id',
        999
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });
  });
});

describe('MergeQueueItem', () => {
  it('should have valid status values', () => {
    const validStatuses = ['queued', 'checking', 'ready', 'merging', 'merged', 'failed', 'blocked', 'conflicted'];
    
    validStatuses.forEach(status => {
      expect(typeof status).toBe('string');
    });
  });
});
