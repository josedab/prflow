import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SecurityComplianceService } from '../services/security-compliance.js';

// Mock database
vi.mock('@prflow/db', () => ({
  db: {
    pRWorkflow: {
      findUnique: vi.fn(),
    },
    reviewComment: {
      findMany: vi.fn(),
    },
    analyticsEvent: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { db } from '@prflow/db';

describe('SecurityComplianceService', () => {
  let service: SecurityComplianceService;

  beforeEach(() => {
    service = new SecurityComplianceService();
    vi.clearAllMocks();
  });

  describe('configureRepository', () => {
    it('should configure compliance settings for a repository', async () => {
      const config = await service.configureRepository('repo-1', {
        enabledFrameworks: ['SOC2', 'HIPAA'],
        blockingThreshold: 'high',
      });

      expect(config).toBeDefined();
      expect(config.repositoryId).toBe('repo-1');
      expect(config.enabledFrameworks).toContain('SOC2');
      expect(config.enabledFrameworks).toContain('HIPAA');
    });
  });

  describe('getConfiguration', () => {
    it('should return default configuration for new repository', async () => {
      const config = await service.getConfiguration('new-repo');
      
      expect(config).toBeDefined();
      expect(config.repositoryId).toBe('new-repo');
      expect(config.enabledFrameworks).toBeInstanceOf(Array);
    });

    it('should return stored configuration if exists', async () => {
      // First configure
      await service.configureRepository('configured-repo', {
        enabledFrameworks: ['PCI_DSS'],
      });

      const config = await service.getConfiguration('configured-repo');
      expect(config.enabledFrameworks).toContain('PCI_DSS');
    });
  });

  describe('scanWorkflow', () => {
    it('should scan a workflow for compliance violations', async () => {
      const mockWorkflow = {
        id: 'workflow-1',
        prNumber: 123,
        repositoryId: 'repo-1',
        repository: { id: 'repo-1', name: 'test-repo', owner: 'test-owner' },
        analysis: {
          filesModified: 5,
          linesAdded: 100,
          linesRemoved: 50,
        },
      };

      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(mockWorkflow as never);

      // Configure the repository first
      await service.configureRepository('repo-1', {
        enabledFrameworks: ['SOC2'],
      });

      const result = await service.scanWorkflow('workflow-1', ['SOC2']);

      expect(result).toBeDefined();
      expect(result.workflowId).toBe('workflow-1');
      expect(result.frameworks).toContain('SOC2');
      expect(Array.isArray(result.violations)).toBe(true);
      expect(typeof result.complianceScore).toBe('number');
    });

    it('should throw error for non-existent workflow', async () => {
      vi.mocked(db.pRWorkflow.findUnique).mockResolvedValue(null);

      await expect(service.scanWorkflow('nonexistent')).rejects.toThrow(
        'Workflow nonexistent not found'
      );
    });
  });
});
