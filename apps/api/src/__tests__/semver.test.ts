import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { semverRoutes } from '../routes/semver.js';

// Mock the database
vi.mock('@prflow/db', () => ({
  db: {
    repository: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock the semver service
vi.mock('../services/semver.js', () => ({
  semverService: {
    analyzeVersionBump: vi.fn(),
    generateReleaseNotes: vi.fn(),
    getConfig: vi.fn(),
    updateConfig: vi.fn(),
  },
}));

describe('Semver Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(semverRoutes, { prefix: '/api/semver' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/semver/:owner/:repo/analyze', () => {
    it('should return 500 when service throws error', async () => {
      const { semverService } = await import('../services/semver.js');

      vi.mocked(semverService.analyzeVersionBump).mockRejectedValue(
        new Error('Repository not found')
      );

      const response = await app.inject({
        method: 'GET',
        url: '/api/semver/test-owner/test-repo/analyze',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });

    it('should analyze version bump successfully', async () => {
      const { semverService } = await import('../services/semver.js');

      // Use 'as any' for mock data - tests care about route behavior not type alignment
      vi.mocked(semverService.analyzeVersionBump).mockResolvedValue({
        recommendedBump: 'minor',
        currentVersion: '1.0.0',
        suggestedVersion: '1.1.0',
        confidence: 0.9,
        factors: [],
        changes: [],
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/semver/test-owner/test-repo/analyze',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.suggestedVersion).toBe('1.1.0');
    });

    it('should pass query parameters to service', async () => {
      const { semverService } = await import('../services/semver.js');

      vi.mocked(semverService.analyzeVersionBump).mockResolvedValue({
        recommendedBump: 'patch',
        currentVersion: '1.0.0',
        suggestedVersion: '1.0.1',
        confidence: 0.85,
        factors: [],
        changes: [],
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/semver/test-owner/test-repo/analyze?branch=develop&sinceTag=v1.0.0',
      });

      expect(response.statusCode).toBe(200);
      expect(semverService.analyzeVersionBump).toHaveBeenCalledWith(
        'test-owner',
        'test-repo',
        expect.objectContaining({
          branch: 'develop',
          sinceTag: 'v1.0.0',
        })
      );
    });
  });

  describe('POST /api/semver/:owner/:repo/release-notes', () => {
    it('should generate release notes', async () => {
      const { semverService } = await import('../services/semver.js');

      vi.mocked(semverService.generateReleaseNotes).mockResolvedValue({
        version: '1.1.0',
        title: 'Release 1.1.0',
        date: '2024-01-15',
        sections: [],
        markdown: '# Release 1.1.0\n\n## Features\n- New feature',
        contributors: [],
        pullRequests: [],
      } as any);

      const response = await app.inject({
        method: 'POST',
        url: '/api/semver/test-owner/test-repo/release-notes',
        payload: {
          version: '1.1.0',
          analysis: {
            recommendedBump: 'minor',
            currentVersion: '1.0.0',
            suggestedVersion: '1.1.0',
            confidence: 0.9,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.version).toBe('1.1.0');
    });
  });

  describe('GET /api/semver/:owner/:repo/config', () => {
    it('should return semver config', async () => {
      const { db } = await import('@prflow/db');
      const { semverService } = await import('../services/semver.js');

      // Full repository mock
      vi.mocked(db.repository.findFirst).mockResolvedValue({
        id: 'repo-1',
        githubId: 12345,
        name: 'test-repo',
        fullName: 'test-owner/test-repo',
        owner: 'test-owner',
        organizationId: null,
        isPrivate: false,
        defaultBranch: 'main',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      vi.mocked(semverService.getConfig).mockResolvedValue({
        repositoryId: 'repo-1',
        versionFilePath: 'package.json',
        versionPattern: '"version": "([^"]+)"',
        autoCreateRelease: true,
        autoUpdateChangelog: true,
        changelogPath: 'CHANGELOG.md',
        includeContributors: true,
        includePRLinks: true,
        includeIssueLinks: true,
        commitPatterns: {},
      } as any);

      const response = await app.inject({
        method: 'GET',
        url: '/api/semver/test-owner/test-repo/config',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.autoCreateRelease).toBe(true);
    });
  });
});
