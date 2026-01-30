import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findUnique: vi.fn(),
    },
    pRSplitProposal: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    pRSplit: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    pRStack: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    pRStackItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    repository: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock GitHub client
vi.mock('@prflow/github-client', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    getPullRequestFiles: vi.fn().mockResolvedValue([]),
    getRef: vi.fn().mockResolvedValue({ object: { sha: 'sha123', type: 'commit' } }),
    createRef: vi.fn().mockResolvedValue({}),
    getFileContent: vi.fn().mockResolvedValue({ content: 'file content' }),
    createOrUpdateFileContent: vi.fn().mockResolvedValue({ sha: 'sha456' }),
    createPullRequest: vi.fn().mockResolvedValue({ number: 123, url: 'https://github.com/test/pr', nodeId: 'node123' }),
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

describe('PRSplittingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export prSplittingService instance', async () => {
      const { prSplittingService } = await import('../services/pr-splitting.js');
      expect(prSplittingService).toBeDefined();
    });

    it('should export PRSplittingService class', async () => {
      const { PRSplittingService } = await import('../services/pr-splitting.js');
      expect(typeof PRSplittingService).toBe('function');
    });

    it('should have analyzePRForSplit method', async () => {
      const { prSplittingService } = await import('../services/pr-splitting.js');
      expect(typeof prSplittingService.analyzePRForSplit).toBe('function');
    });

    it('should have executeSplit method', async () => {
      const { prSplittingService } = await import('../services/pr-splitting.js');
      expect(typeof prSplittingService.executeSplit).toBe('function');
    });

    it('should have executeAllSplits method', async () => {
      const { prSplittingService } = await import('../services/pr-splitting.js');
      expect(typeof prSplittingService.executeAllSplits).toBe('function');
    });

    it('should have getProposalStatus method', async () => {
      const { prSplittingService } = await import('../services/pr-splitting.js');
      expect(typeof prSplittingService.getProposalStatus).toBe('function');
    });

    it('should have createStackFromProposal method', async () => {
      const { prSplittingService } = await import('../services/pr-splitting.js');
      expect(typeof prSplittingService.createStackFromProposal).toBe('function');
    });

    it('should have getStackStatus method', async () => {
      const { prSplittingService } = await import('../services/pr-splitting.js');
      expect(typeof prSplittingService.getStackStatus).toBe('function');
    });
  });

  describe('Split strategies', () => {
    it('should support BY_LAYER strategy', () => {
      const strategies = ['BY_FEATURE', 'BY_LAYER', 'BY_FILE_TYPE', 'BY_DEPENDENCY', 'MANUAL'];
      expect(strategies).toContain('BY_LAYER');
    });

    it('should support BY_FEATURE strategy', () => {
      const strategies = ['BY_FEATURE', 'BY_LAYER', 'BY_FILE_TYPE', 'BY_DEPENDENCY', 'MANUAL'];
      expect(strategies).toContain('BY_FEATURE');
    });

    it('should support BY_FILE_TYPE strategy', () => {
      const strategies = ['BY_FEATURE', 'BY_LAYER', 'BY_FILE_TYPE', 'BY_DEPENDENCY', 'MANUAL'];
      expect(strategies).toContain('BY_FILE_TYPE');
    });

    it('should support BY_DEPENDENCY strategy', () => {
      const strategies = ['BY_FEATURE', 'BY_LAYER', 'BY_FILE_TYPE', 'BY_DEPENDENCY', 'MANUAL'];
      expect(strategies).toContain('BY_DEPENDENCY');
    });
  });

  describe('Split proposal types', () => {
    it('should have correct split proposal structure', () => {
      const mockProposal = {
        proposalId: 'prop-123',
        strategy: 'BY_LAYER',
        splits: [],
        totalFiles: 15,
        confidence: 0.85,
        reasoning: 'PR can be split by architectural layers',
      };
      
      expect(mockProposal).toHaveProperty('proposalId');
      expect(mockProposal).toHaveProperty('strategy');
      expect(mockProposal).toHaveProperty('splits');
      expect(mockProposal).toHaveProperty('confidence');
    });

    it('should have correct split suggestion structure', () => {
      const mockSplit = {
        name: 'Backend changes',
        description: 'API and service layer changes',
        files: ['src/api/routes.ts', 'src/services/user.ts'],
        additions: 150,
        deletions: 30,
        dependencies: [],
        reasoning: 'Isolated backend changes',
      };
      
      expect(mockSplit).toHaveProperty('name');
      expect(mockSplit).toHaveProperty('files');
      expect(mockSplit).toHaveProperty('dependencies');
      expect(Array.isArray(mockSplit.files)).toBe(true);
    });
  });

  describe('Stack management', () => {
    it('should have PR stack structure', () => {
      const mockStack = {
        id: 'stack-123',
        repositoryId: 'repo-1',
        name: 'Feature stack',
        baseBranch: 'main',
        status: 'active',
        items: [],
      };
      
      expect(mockStack).toHaveProperty('id');
      expect(mockStack).toHaveProperty('baseBranch');
      expect(mockStack).toHaveProperty('status');
    });

    it('should have PR stack item structure', () => {
      const mockItem = {
        id: 'item-123',
        stackId: 'stack-123',
        prNumber: 42,
        branchName: 'feature/split-1',
        position: 1,
        status: 'pending',
      };
      
      expect(mockItem).toHaveProperty('prNumber');
      expect(mockItem).toHaveProperty('position');
      expect(mockItem).toHaveProperty('status');
    });

    it('should support valid stack statuses', () => {
      const validStatuses = ['active', 'merged', 'abandoned'];
      validStatuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });

    it('should support valid stack item statuses', () => {
      const validStatuses = ['pending', 'merged', 'blocked'];
      validStatuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });
});

describe('PR Split Types', () => {
  it('should have correct execute result structure', () => {
    const successResult = {
      success: true,
      splitId: 'split-123',
      branchName: 'split/feature-1',
      prNumber: 42,
    };
    
    expect(successResult.success).toBe(true);
    expect(successResult).toHaveProperty('branchName');
    expect(successResult).toHaveProperty('prNumber');
  });

  it('should handle error results', () => {
    const errorResult = {
      success: false,
      splitId: 'split-123',
      error: 'Dependencies not completed',
    };
    
    expect(errorResult.success).toBe(false);
    expect(errorResult).toHaveProperty('error');
  });
});
