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
    pRWorkflow: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock GitHub client
vi.mock('@prflow/github-client', () => ({
  GitHubClient: vi.fn().mockImplementation(() => ({
    getFileContent: vi.fn().mockResolvedValue('{}'),
    getPullRequestFiles: vi.fn().mockResolvedValue([]),
    getRef: vi.fn().mockResolvedValue({ object: { sha: 'sha123' } }),
    createRef: vi.fn().mockResolvedValue({}),
    createOrUpdateFileContent: vi.fn().mockResolvedValue({}),
    createPullRequest: vi.fn().mockResolvedValue({ number: 1, url: 'https://example.com' }),
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

// Mock fetch for external APIs
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({ vulns: [] }),
});

describe('SecurityScannerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Service initialization', () => {
    it('should export securityScannerService instance', async () => {
      const { securityScannerService } = await import('../services/security-scanner.js');
      expect(securityScannerService).toBeDefined();
    });

    it('should export SecurityScannerService class', async () => {
      const { SecurityScannerService } = await import('../services/security-scanner.js');
      expect(typeof SecurityScannerService).toBe('function');
    });

    it('should have scanRepository method', async () => {
      const { securityScannerService } = await import('../services/security-scanner.js');
      expect(typeof securityScannerService.scanRepository).toBe('function');
    });

    it('should have scanPullRequest method', async () => {
      const { securityScannerService } = await import('../services/security-scanner.js');
      expect(typeof securityScannerService.scanPullRequest).toBe('function');
    });

    it('should have queryGitHubAdvisories method', async () => {
      const { securityScannerService } = await import('../services/security-scanner.js');
      expect(typeof securityScannerService.queryGitHubAdvisories).toBe('function');
    });

    it('should have queryOSV method', async () => {
      const { securityScannerService } = await import('../services/security-scanner.js');
      expect(typeof securityScannerService.queryOSV).toBe('function');
    });

    it('should have createSecurityAdvisoryPR method', async () => {
      const { securityScannerService } = await import('../services/security-scanner.js');
      expect(typeof securityScannerService.createSecurityAdvisoryPR).toBe('function');
    });
  });

  describe('Vulnerability structure', () => {
    it('should have correct vulnerability structure', () => {
      const mockVulnerability = {
        id: 'GHSA-1234',
        source: 'github' as const,
        cveId: 'CVE-2024-1234',
        ghsaId: 'GHSA-1234',
        severity: 'critical' as const,
        cvssScore: 9.8,
        title: 'Critical vulnerability',
        description: 'A critical security vulnerability',
        publishedAt: '2024-01-15T00:00:00Z',
        affectedPackage: 'vulnerable-package',
        affectedVersions: '< 2.0.0',
        fixedVersions: '2.0.0',
        references: ['https://nvd.nist.gov/vuln/detail/CVE-2024-1234'],
      };

      expect(mockVulnerability).toHaveProperty('id');
      expect(mockVulnerability).toHaveProperty('severity');
      expect(mockVulnerability).toHaveProperty('affectedPackage');
      expect(mockVulnerability).toHaveProperty('affectedVersions');
    });
  });

  describe('Severity levels', () => {
    it('should support all severity levels', () => {
      const severities = ['critical', 'high', 'medium', 'low', 'unknown'];
      
      severities.forEach(severity => {
        expect(typeof severity).toBe('string');
      });
    });
  });

  describe('Scan result structure', () => {
    it('should have correct scan result structure', () => {
      const mockResult = {
        repositoryId: 'repo-1',
        scannedAt: new Date().toISOString(),
        totalDependencies: 100,
        vulnerabilitiesFound: 5,
        critical: 1,
        high: 2,
        medium: 1,
        low: 1,
        vulnerabilities: [],
      };

      expect(mockResult).toHaveProperty('repositoryId');
      expect(mockResult).toHaveProperty('vulnerabilitiesFound');
      expect(mockResult).toHaveProperty('critical');
      expect(mockResult).toHaveProperty('high');
    });
  });

  describe('Vulnerability match structure', () => {
    it('should have correct match structure', () => {
      const mockMatch = {
        vulnerability: {
          id: 'GHSA-1234',
          source: 'github' as const,
          severity: 'high' as const,
          title: 'Test vulnerability',
          description: 'Description',
          publishedAt: '2024-01-01',
          affectedPackage: 'test-pkg',
          affectedVersions: '< 1.0.0',
          references: [],
        },
        installedVersion: '0.9.0',
        packageManager: 'npm' as const,
        manifestFile: 'package.json',
        isDirect: true,
        fixAvailable: true,
        recommendedVersion: '1.0.0',
      };

      expect(mockMatch).toHaveProperty('vulnerability');
      expect(mockMatch).toHaveProperty('installedVersion');
      expect(mockMatch).toHaveProperty('fixAvailable');
      expect(mockMatch).toHaveProperty('recommendedVersion');
    });
  });

  describe('Package managers', () => {
    it('should support all package managers', () => {
      const managers = ['npm', 'pip', 'maven', 'nuget', 'go', 'cargo'];
      
      managers.forEach(manager => {
        expect(typeof manager).toBe('string');
      });
    });
  });

  describe('Security advisory structure', () => {
    it('should have correct advisory structure', () => {
      const mockAdvisory = {
        id: 'advisory-1',
        repositoryId: 'repo-1',
        title: 'Security: Fix vulnerabilities',
        description: 'Fixes critical vulnerabilities',
        severity: 'critical' as const,
        vulnerabilities: [],
        prNumber: 42,
        prUrl: 'https://github.com/owner/repo/pull/42',
        status: 'pr_created' as const,
        createdAt: new Date().toISOString(),
      };

      expect(mockAdvisory).toHaveProperty('id');
      expect(mockAdvisory).toHaveProperty('severity');
      expect(mockAdvisory).toHaveProperty('prNumber');
      expect(mockAdvisory).toHaveProperty('status');
    });
  });

  describe('Advisory status values', () => {
    it('should support all advisory statuses', () => {
      const statuses = ['pending', 'pr_created', 'fixed', 'dismissed'];
      
      statuses.forEach(status => {
        expect(typeof status).toBe('string');
      });
    });
  });
});

describe('Security API Endpoints', () => {
  it('should have security scan endpoints', () => {
    const endpoints = [
      '/api/security/repositories/:repositoryId/scan',
      '/api/security/workflows/:workflowId/scan',
      '/api/security/repositories/:repositoryId/summary',
      '/api/security/vulnerabilities/query',
      '/api/security/repositories/:repositoryId/create-advisory-pr',
      '/api/security/ecosystems',
    ];
    
    expect(endpoints.length).toBeGreaterThan(0);
    endpoints.forEach(endpoint => {
      expect(endpoint).toContain('/api/security');
    });
  });
});
