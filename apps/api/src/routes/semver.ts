/**
 * @fileoverview Semantic Versioning Bot API Routes
 *
 * REST API endpoints for:
 * - Analyzing PRs for version bump recommendations
 * - Generating release notes
 * - Managing semver configuration
 * - Creating releases and updating changelogs
 *
 * @module routes/semver
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '@prflow/db';
import { semverService } from '../services/semver.js';
import { logger } from '../lib/logger.js';

interface RepoParams {
  owner: string;
  repo: string;
}

interface AnalyzeQuery {
  branch?: string;
  sinceTag?: string;
  untilSha?: string;
  prNumbers?: string;
}

interface GenerateNotesBody {
  version?: string;
  title?: string;
  includeStats?: boolean;
}

interface UpdateChangelogBody {
  branch?: string;
}

interface CreateReleaseBody {
  tagName?: string;
  targetCommitish?: string;
  draft?: boolean;
  prerelease?: boolean;
}

interface ConfigBody {
  versionFilePath?: string;
  versionPattern?: string;
  autoCreateRelease?: boolean;
  autoUpdateChangelog?: boolean;
  changelogPath?: string;
  includeContributors?: boolean;
  includePRLinks?: boolean;
  includeIssueLinks?: boolean;
}

export async function semverRoutes(app: FastifyInstance) {
  /**
   * Analyze PRs for version bump recommendation
   * GET /api/semver/:owner/:repo/analyze
   */
  app.get<{
    Params: RepoParams;
    Querystring: AnalyzeQuery;
  }>('/:owner/:repo/analyze', async (request, reply) => {
    const { owner, repo } = request.params;
    const { branch, sinceTag, untilSha, prNumbers } = request.query;

    try {
      const prNumberList = prNumbers 
        ? prNumbers.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n))
        : undefined;

      const analysis = await semverService.analyzeVersionBump(owner, repo, {
        branch,
        sinceTag,
        untilSha,
        prNumbers: prNumberList,
      });

      return reply.send({
        success: true,
        data: analysis,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed';
      logger.error({ error, owner, repo }, 'Semver analysis failed');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Generate release notes from analysis
   * POST /api/semver/:owner/:repo/release-notes
   */
  app.post<{
    Params: RepoParams;
    Body: GenerateNotesBody & { analysis?: object };
  }>('/:owner/:repo/release-notes', async (request, reply) => {
    const { owner, repo } = request.params;
    const { version, title, includeStats, analysis: providedAnalysis } = request.body;

    try {
      // Either use provided analysis or run fresh analysis
      const analysis = providedAnalysis 
        ? providedAnalysis as Awaited<ReturnType<typeof semverService.analyzeVersionBump>>
        : await semverService.analyzeVersionBump(owner, repo);

      const releaseNotes = await semverService.generateReleaseNotes(owner, repo, analysis, {
        version,
        title,
        includeStats,
      });

      return reply.send({
        success: true,
        data: releaseNotes,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Release notes generation failed';
      logger.error({ error, owner, repo }, 'Release notes generation failed');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Update CHANGELOG.md with release notes
   * POST /api/semver/:owner/:repo/changelog
   */
  app.post<{
    Params: RepoParams;
    Body: UpdateChangelogBody & { releaseNotes: object };
  }>('/:owner/:repo/changelog', async (request, reply) => {
    const { owner, repo } = request.params;
    const { branch, releaseNotes } = request.body;

    try {
      if (!releaseNotes) {
        return reply.status(400).send({
          success: false,
          error: 'releaseNotes is required',
        });
      }

      const result = await semverService.updateChangelog(
        owner,
        repo,
        releaseNotes as Awaited<ReturnType<typeof semverService.generateReleaseNotes>>,
        branch
      );

      return reply.send({
        success: result.success,
        data: result.success ? { commitSha: result.commitSha } : undefined,
        error: result.success ? undefined : 'Failed to update changelog',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Changelog update failed';
      logger.error({ error, owner, repo }, 'Changelog update failed');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Create GitHub release
   * POST /api/semver/:owner/:repo/release
   */
  app.post<{
    Params: RepoParams;
    Body: CreateReleaseBody & { releaseNotes: object };
  }>('/:owner/:repo/release', async (request, reply) => {
    const { owner, repo } = request.params;
    const { tagName, targetCommitish, draft, prerelease, releaseNotes } = request.body;

    try {
      if (!releaseNotes) {
        return reply.status(400).send({
          success: false,
          error: 'releaseNotes is required',
        });
      }

      const result = await semverService.createRelease(
        owner,
        repo,
        releaseNotes as Awaited<ReturnType<typeof semverService.generateReleaseNotes>>,
        { tagName, targetCommitish, draft, prerelease }
      );

      return reply.send({
        success: result.success,
        data: result.success ? { releaseUrl: result.releaseUrl, releaseId: result.releaseId } : undefined,
        error: result.success ? undefined : 'Failed to create release',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Release creation failed';
      logger.error({ error, owner, repo }, 'Release creation failed');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get semver configuration for a repository
   * GET /api/semver/:owner/:repo/config
   */
  app.get<{
    Params: RepoParams;
  }>('/:owner/:repo/config', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const config = await semverService.getConfig(repository.id);

      return reply.send({
        success: true,
        data: config || {
          versionFilePath: 'package.json',
          changelogPath: 'CHANGELOG.md',
          autoCreateRelease: false,
          autoUpdateChangelog: false,
          includeContributors: true,
          includePRLinks: true,
          includeIssueLinks: true,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get config';
      logger.error({ error, owner, repo }, 'Failed to get semver config');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Update semver configuration for a repository
   * PATCH /api/semver/:owner/:repo/config
   */
  app.patch<{
    Params: RepoParams;
    Body: ConfigBody;
  }>('/:owner/:repo/config', async (request, reply) => {
    const { owner, repo } = request.params;
    const config = request.body;

    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const updated = await semverService.updateConfig(repository.id, config);

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update config';
      logger.error({ error, owner, repo }, 'Failed to update semver config');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * One-click release: analyze, generate notes, update changelog, create release
   * POST /api/semver/:owner/:repo/auto-release
   */
  app.post<{
    Params: RepoParams;
    Body: {
      branch?: string;
      sinceTag?: string;
      draft?: boolean;
      prerelease?: boolean;
      skipChangelog?: boolean;
      skipRelease?: boolean;
    };
  }>('/:owner/:repo/auto-release', async (request, reply) => {
    const { owner, repo } = request.params;
    const { branch, sinceTag, draft, prerelease, skipChangelog, skipRelease } = request.body;

    try {
      // Step 1: Analyze
      logger.info({ owner, repo }, 'Starting auto-release: analyzing');
      const analysis = await semverService.analyzeVersionBump(owner, repo, { sinceTag });

      if (analysis.recommendedBump === 'none') {
        return reply.send({
          success: true,
          data: {
            skipped: true,
            reason: 'No releasable changes detected',
            analysis,
          },
        });
      }

      // Step 2: Generate release notes
      logger.info({ owner, repo }, 'Auto-release: generating release notes');
      const releaseNotes = await semverService.generateReleaseNotes(owner, repo, analysis);

      const result: Record<string, unknown> = {
        analysis,
        releaseNotes,
      };

      // Step 3: Update changelog (optional)
      if (!skipChangelog) {
        logger.info({ owner, repo }, 'Auto-release: updating changelog');
        const changelogResult = await semverService.updateChangelog(owner, repo, releaseNotes, branch);
        result.changelog = changelogResult;
      }

      // Step 4: Create release (optional)
      if (!skipRelease) {
        logger.info({ owner, repo }, 'Auto-release: creating release');
        const releaseResult = await semverService.createRelease(owner, repo, releaseNotes, {
          draft,
          prerelease,
        });
        result.release = releaseResult;
      }

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Auto-release failed';
      logger.error({ error, owner, repo }, 'Auto-release failed');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
}
