import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PRDependencyGraphService } from '../services/pr-dependency-graph.js';

// Mock database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

// Mock config
vi.mock('@prflow/config', () => ({
  loadConfigSafe: () => ({
    GITHUB_APP_ID: 'test-app-id',
    GITHUB_APP_PRIVATE_KEY: 'test-private-key',
  }),
}));

// Mock GitHub client
vi.mock('@prflow/github-client', () => ({
  createGitHubClient: vi.fn(() => ({
    getRef: vi.fn(),
  })),
}));

import { db } from '@prflow/db';

describe('PRDependencyGraphService', () => {
  let service: PRDependencyGraphService;

  beforeEach(() => {
    service = new PRDependencyGraphService();
    vi.clearAllMocks();
  });

  describe('buildGraph', () => {
    it('should build an empty graph when no workflows exist', async () => {
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue([]);

      const graph = await service.buildGraph('repo-1');

      expect(graph.repositoryId).toBe('repo-1');
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
      expect(graph.cycles).toHaveLength(0);
      expect(graph.criticalPath).toHaveLength(0);
    });

    it('should build nodes from workflows', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Feature A',
          headBranch: 'feature-a',
          baseBranch: 'main',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: ['src/a.ts'] },
          },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          prTitle: 'Feature B',
          headBranch: 'feature-b',
          baseBranch: 'main',
          authorLogin: 'user2',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'MEDIUM',
            impactRadius: { affectedFiles: ['src/b.ts'] },
          },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const graph = await service.buildGraph('repo-1');

      expect(graph.nodes).toHaveLength(2);
      expect(graph.nodes[0].prNumber).toBe(1);
      expect(graph.nodes[0].branch).toBe('feature-a');
      expect(graph.nodes[0].riskLevel).toBe('low');
      expect(graph.nodes[1].prNumber).toBe(2);
    });

    it('should detect branch dependencies', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Base Feature',
          headBranch: 'feature-base',
          baseBranch: 'main',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: [] },
          },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          prTitle: 'Dependent Feature',
          headBranch: 'feature-dependent',
          baseBranch: 'feature-base', // Depends on wf-1
          authorLogin: 'user1',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: [] },
          },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const graph = await service.buildGraph('repo-1');

      expect(graph.edges.some((e) => 
        e.type === 'branch_dependency' && 
        e.source === 'wf-2' && 
        e.target === 'wf-1'
      )).toBe(true);
    });

    it('should detect file conflicts', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Feature A',
          headBranch: 'feature-a',
          baseBranch: 'main',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: ['src/shared.ts', 'src/a.ts'] },
          },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          prTitle: 'Feature B',
          headBranch: 'feature-b',
          baseBranch: 'main',
          authorLogin: 'user2',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: ['src/shared.ts', 'src/b.ts'] },
          },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const graph = await service.buildGraph('repo-1');

      const conflictEdge = graph.edges.find((e) => e.type === 'file_conflict');
      expect(conflictEdge).toBeDefined();
      expect(conflictEdge?.conflictFiles).toContain('src/shared.ts');
    });

    it('should detect cycles in dependencies', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Feature A',
          headBranch: 'feature-a',
          baseBranch: 'feature-b', // Depends on wf-2
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: [] },
          },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          prTitle: 'Feature B',
          headBranch: 'feature-b',
          baseBranch: 'feature-a', // Depends on wf-1 - creates cycle
          authorLogin: 'user2',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: [] },
          },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const graph = await service.buildGraph('repo-1');

      expect(graph.cycles.length).toBeGreaterThan(0);
    });

    it('should calculate critical path', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Low Risk',
          headBranch: 'feature-a',
          baseBranch: 'main',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'LOW',
            impactRadius: { affectedFiles: [] },
          },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          prTitle: 'High Risk',
          headBranch: 'feature-b',
          baseBranch: 'main',
          authorLogin: 'user2',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: {
            riskLevel: 'HIGH',
            impactRadius: { affectedFiles: [] },
          },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const graph = await service.buildGraph('repo-1');

      expect(graph.criticalPath).toHaveLength(2);
      // Low risk should come first
      expect(graph.criticalPath[0]).toBe('wf-1');
    });
  });

  describe('getImpactAnalysis', () => {
    it('should analyze impact of a PR', async () => {
      const mockWorkflow = {
        id: 'wf-1',
        repositoryId: 'repo-1',
        repository: { fullName: 'org/repo' },
      };

      const mockAllWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Base',
          headBranch: 'feature-a',
          baseBranch: 'main',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW', impactRadius: { affectedFiles: [] } },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          prTitle: 'Dependent',
          headBranch: 'feature-b',
          baseBranch: 'feature-a',
          authorLogin: 'user2',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW', impactRadius: { affectedFiles: [] } },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockAllWorkflows as never);

      const impact = await service.getImpactAnalysis('wf-1');

      expect(impact.prId).toBe('wf-1');
      expect(impact.recommendations).toBeDefined();
      expect(impact.impactScore).toBeGreaterThanOrEqual(0);
    });

    it('should throw error for non-existent workflow', async () => {
      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(null);

      await expect(service.getImpactAnalysis('non-existent')).rejects.toThrow();
    });
  });

  describe('getMergeOrder', () => {
    it('should return optimal merge order', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Feature A',
          headBranch: 'feature-a',
          baseBranch: 'main',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW', impactRadius: { affectedFiles: [] } },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const result = await service.getMergeOrder('repo-1');

      expect(result.hasConflicts).toBe(false);
      expect(result.order).toHaveLength(1);
      expect(result.order[0].prNumber).toBe(1);
    });

    it('should detect conflicts when cycles exist', async () => {
      const mockWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          headBranch: 'feature-a',
          baseBranch: 'feature-b',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW', impactRadius: { affectedFiles: [] } },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          headBranch: 'feature-b',
          baseBranch: 'feature-a',
          authorLogin: 'user2',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW', impactRadius: { affectedFiles: [] } },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockWorkflows as never);

      const result = await service.getMergeOrder('repo-1');

      expect(result.hasConflicts).toBe(true);
      expect(result.conflictDetails.length).toBeGreaterThan(0);
    });
  });

  describe('simulateMerge', () => {
    it('should simulate merge and show unblocked PRs', async () => {
      const mockWorkflow = {
        id: 'wf-1',
        repositoryId: 'repo-1',
        repository: { fullName: 'org/repo' },
      };

      const mockAllWorkflows = [
        {
          id: 'wf-1',
          prNumber: 1,
          prTitle: 'Base',
          headBranch: 'feature-a',
          baseBranch: 'main',
          authorLogin: 'user1',
          status: 'REVIEWING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW', impactRadius: { affectedFiles: [] } },
          repository: { fullName: 'org/repo' },
        },
        {
          id: 'wf-2',
          prNumber: 2,
          prTitle: 'Dependent',
          headBranch: 'feature-b',
          baseBranch: 'feature-a',
          authorLogin: 'user2',
          status: 'ANALYZING',
          createdAt: new Date(),
          analysis: { riskLevel: 'LOW', impactRadius: { affectedFiles: [] } },
          repository: { fullName: 'org/repo' },
        },
      ];

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);
      vi.mocked(db.pRWorkflow.findMany).mockResolvedValue(mockAllWorkflows as never);

      const simulation = await service.simulateMerge('wf-1');

      expect(simulation.unblocked).toBeDefined();
      expect(simulation.newCriticalPath).toBeDefined();
    });
  });
});
