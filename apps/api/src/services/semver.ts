/**
 * @fileoverview Semantic Versioning Service for PRFlow.
 *
 * Provides version management capabilities:
 * - Analyze PRs for version bump recommendations
 * - Generate release notes
 * - Update changelog files
 * - Create GitHub releases
 *
 * @module services/semver
 */

import { db } from '@prflow/db';
import { GitHubClient, createGitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';
import { SemverAgent } from '../agents/semver.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

import type {
  VersionBumpAnalysis,
  ReleaseNotes,
  ReleaseNotesSection,
  SemverConfig,
  ChangelogEntry,
  ChangelogCategory,
  SemverAgentInput,
  SemverPRInfo,
  ReleaseStats,
} from '@prflow/core';

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * Get raw octokit for operations not exposed by the client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOctokit(github: GitHubClient): any {
  // Access internal octokit for operations not yet exposed by focused clients
  return (github as unknown as { octokit: unknown }).octokit;
}

/**
 * Section configuration for release notes
 */
const SECTION_CONFIG: Record<ChangelogCategory, { title: string; icon: string; order: number }> = {
  breaking: { title: '⚠️ Breaking Changes', icon: '⚠️', order: 0 },
  security: { title: '🔒 Security', icon: '🔒', order: 1 },
  feature: { title: '✨ Features', icon: '✨', order: 2 },
  fix: { title: '🐛 Bug Fixes', icon: '🐛', order: 3 },
  performance: { title: '⚡ Performance', icon: '⚡', order: 4 },
  refactor: { title: '♻️ Refactoring', icon: '♻️', order: 5 },
  documentation: { title: '📚 Documentation', icon: '📚', order: 6 },
  test: { title: '🧪 Tests', icon: '🧪', order: 7 },
  deprecation: { title: '🗑️ Deprecations', icon: '🗑️', order: 8 },
  chore: { title: '🔧 Maintenance', icon: '🔧', order: 9 },
};

/**
 * Default semver configuration
 */
const DEFAULT_CONFIG: Partial<SemverConfig> = {
  versionFilePath: 'package.json',
  changelogPath: 'CHANGELOG.md',
  autoCreateRelease: false,
  autoUpdateChangelog: false,
  includeContributors: true,
  includePRLinks: true,
  includeIssueLinks: true,
  commitPatterns: [],
};

export class SemverService {
  private agent = new SemverAgent();

  /**
   * Analyze PRs to determine version bump
   */
  async analyzeVersionBump(
    owner: string,
    repo: string,
    options: {
      branch?: string;
      sinceTag?: string;
      untilSha?: string;
      prNumbers?: number[];
    } = {}
  ): Promise<VersionBumpAnalysis> {
    const repoFullName = `${owner}/${repo}`;
    logger.info({ repo: repoFullName, options }, 'Analyzing version bump');

    // Get repository from database
    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    // Get GitHub client using installation from repository
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);

    // Get current version from package.json or version file
    const currentVersion = await this.getCurrentVersion(github, owner, repo);

    // Get PRs to analyze
    const prs = await this.getPRsForAnalysis(github, owner, repo, options);

    // Build agent input
    const config: SemverConfig = {
      ...DEFAULT_CONFIG,
      repositoryId: repository.id,
    } as SemverConfig;

    const agentInput: SemverAgentInput = {
      repository: {
        owner,
        name: repo,
        fullName: repoFullName,
      },
      pullRequests: prs,
      currentVersion,
      config,
    };

    // Run agent - semver agent doesn't need PR context, passing placeholder
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.agent.execute(agentInput, {} as any);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Version analysis failed');
    }

    // Store analysis result
    await this.storeAnalysis(repository.id, result.data);

    return result.data;
  }

  /**
   * Generate release notes from analysis
   */
  async generateReleaseNotes(
    owner: string,
    repo: string,
    analysis: VersionBumpAnalysis,
    options: {
      version?: string;
      title?: string;
      includeStats?: boolean;
    } = {}
  ): Promise<ReleaseNotes> {
    const version = options.version || analysis.suggestedVersion || 'Unreleased';
    const title = options.title || `Release ${version}`;
    const date = new Date().toISOString().split('T')[0];

    // Group changes by category
    const sections = this.groupChangesByCategory(analysis.changes);

    // Get contributors
    const contributors = [...new Set(analysis.changes.map(c => c.author).filter(Boolean))];

    // Calculate stats
    const stats: ReleaseStats = {
      totalCommits: analysis.changes.length,
      prsMerged: [...new Set(analysis.changes.map(c => c.prNumber).filter(n => n > 0))].length,
      issuesClosed: analysis.changes.flatMap(c => c.issueRefs || []).length,
      linesAdded: 0,
      linesRemoved: 0,
      filesChanged: [...new Set(analysis.changes.flatMap(c => c.affectedFiles))].length,
    };

    // Generate markdown
    const markdown = this.generateMarkdown(version, title, date, sections, contributors, stats, owner, repo);

    return {
      version,
      title,
      date,
      sections,
      markdown,
      contributors,
      stats,
    };
  }

  /**
   * Update CHANGELOG.md file
   */
  async updateChangelog(
    owner: string,
    repo: string,
    releaseNotes: ReleaseNotes,
    branch: string = 'main'
  ): Promise<{ success: boolean; commitSha?: string }> {
    // Get repository to find installationId
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });
    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);

    try {
      // Get current changelog content
      let existingContent = '';
      try {
        const { data } = await getOctokit(github).repos.getContent({
          owner,
          repo,
          path: 'CHANGELOG.md',
          ref: branch,
        });
        if ('content' in data) {
          existingContent = Buffer.from(data.content, 'base64').toString('utf-8');
        }
      } catch {
        // Changelog doesn't exist, create new one
        existingContent = '# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n';
      }

      // Insert new release notes after header
      const headerEnd = existingContent.indexOf('\n## ');
      const newContent = headerEnd > 0
        ? existingContent.slice(0, headerEnd) + '\n' + releaseNotes.markdown + existingContent.slice(headerEnd)
        : existingContent + '\n' + releaseNotes.markdown;

      // Get file sha if it exists
      let sha: string | undefined;
      try {
        const { data } = await getOctokit(github).repos.getContent({
          owner,
          repo,
          path: 'CHANGELOG.md',
          ref: branch,
        });
        if ('sha' in data) {
          sha = data.sha;
        }
      } catch {
        // File doesn't exist
      }

      // Commit the change using createOrUpdateFileContents
      const result = await getOctokit(github).repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'CHANGELOG.md',
        message: `docs: update CHANGELOG for ${releaseNotes.version}`,
        content: Buffer.from(newContent).toString('base64'),
        branch,
        ...(sha ? { sha } : {}),
      });

      logger.info({ repo: `${owner}/${repo}`, version: releaseNotes.version }, 'Changelog updated');
      return { success: true, commitSha: result.data.commit.sha };
    } catch (error) {
      logger.error({ error }, 'Failed to update changelog');
      return { success: false };
    }
  }

  /**
   * Create GitHub release
   */
  async createRelease(
    owner: string,
    repo: string,
    releaseNotes: ReleaseNotes,
    options: {
      tagName?: string;
      targetCommitish?: string;
      draft?: boolean;
      prerelease?: boolean;
    } = {}
  ): Promise<{ success: boolean; releaseUrl?: string; releaseId?: number }> {
    // Get repository to find installationId
    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });
    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);

    try {
      const tagName = options.tagName || `v${releaseNotes.version}`;
      
      const { data: release } = await getOctokit(github).repos.createRelease({
        owner,
        repo,
        tag_name: tagName,
        target_commitish: options.targetCommitish,
        name: releaseNotes.title,
        body: releaseNotes.markdown,
        draft: options.draft ?? false,
        prerelease: options.prerelease ?? false,
      });

      logger.info({ repo: `${owner}/${repo}`, tag: tagName, releaseId: release.id }, 'Release created');
      return { success: true, releaseUrl: release.html_url, releaseId: release.id };
    } catch (error) {
      logger.error({ error }, 'Failed to create release');
      return { success: false };
    }
  }

  /**
   * Get configuration for a repository
   */
  async getConfig(repositoryId: string): Promise<SemverConfig | null> {
    const config = await dbAny.semverConfig.findUnique({
      where: { repositoryId },
    });

    if (!config) return null;

    return {
      repositoryId: config.repositoryId,
      versionFilePath: config.versionFilePath,
      versionPattern: config.versionPattern || undefined,
      autoCreateRelease: config.autoCreateRelease,
      autoUpdateChangelog: config.autoUpdateChangelog,
      changelogPath: config.changelogPath,
      commitPatterns: config.commitPatterns as SemverConfig['commitPatterns'],
      sectionOrder: config.sectionOrder as ChangelogCategory[] | undefined,
      includeContributors: config.includeContributors,
      includePRLinks: config.includePRLinks,
      includeIssueLinks: config.includeIssueLinks,
    };
  }

  /**
   * Update configuration for a repository
   */
  async updateConfig(repositoryId: string, config: Partial<SemverConfig>): Promise<SemverConfig> {
    const updated = await dbAny.semverConfig.upsert({
      where: { repositoryId },
      create: {
        repositoryId,
        versionFilePath: config.versionFilePath || 'package.json',
        versionPattern: config.versionPattern,
        autoCreateRelease: config.autoCreateRelease ?? false,
        autoUpdateChangelog: config.autoUpdateChangelog ?? false,
        changelogPath: config.changelogPath || 'CHANGELOG.md',
        commitPatterns: config.commitPatterns || [],
        sectionOrder: config.sectionOrder || [],
        includeContributors: config.includeContributors ?? true,
        includePRLinks: config.includePRLinks ?? true,
        includeIssueLinks: config.includeIssueLinks ?? true,
      },
      update: {
        versionFilePath: config.versionFilePath,
        versionPattern: config.versionPattern,
        autoCreateRelease: config.autoCreateRelease,
        autoUpdateChangelog: config.autoUpdateChangelog,
        changelogPath: config.changelogPath,
        commitPatterns: config.commitPatterns,
        sectionOrder: config.sectionOrder,
        includeContributors: config.includeContributors,
        includePRLinks: config.includePRLinks,
        includeIssueLinks: config.includeIssueLinks,
      },
    });

    return this.getConfig(repositoryId) as Promise<SemverConfig>;
  }

  // Private helpers

  private async getCurrentVersion(
    github: GitHubClient,
    owner: string,
    repo: string
  ): Promise<string | null> {
    try {
      const content = await github.files.getFileContent(owner, repo, 'package.json', 'HEAD');
      if (content) {
        const pkg = JSON.parse(content);
        return pkg.version || null;
      }
    } catch {
      // Try other version file patterns
      const patterns = ['VERSION', 'version.txt', 'VERSION.txt'];
      for (const path of patterns) {
        try {
          const versionContent = await github.files.getFileContent(owner, repo, path, 'HEAD');
          if (versionContent) {
            return versionContent.trim();
          }
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  private async getPRsForAnalysis(
    github: GitHubClient,
    owner: string,
    repo: string,
    options: {
      sinceTag?: string;
      untilSha?: string;
      prNumbers?: number[];
    }
  ): Promise<SemverPRInfo[]> {
    const prs: SemverPRInfo[] = [];

    if (options.prNumbers && options.prNumbers.length > 0) {
      // Get specific PRs
      for (const prNumber of options.prNumbers) {
        const pr = await this.getPRInfo(github, owner, repo, prNumber);
        if (pr) prs.push(pr);
      }
    } else {
      // Get recently merged PRs
      const { data: pulls } = await getOctokit(github).pulls.list({
        owner,
        repo,
        state: 'closed',
        sort: 'updated',
        direction: 'desc',
        per_page: 50,
      });

      for (const pull of pulls) {
        if (!pull.merged_at) continue;
        
        // Check if merged after sinceTag
        if (options.sinceTag) {
          // Would need to compare with tag date
        }

        const pr = await this.getPRInfo(github, owner, repo, pull.number);
        if (pr) prs.push(pr);
      }
    }

    return prs;
  }

  private async getPRInfo(
    github: GitHubClient,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<SemverPRInfo | null> {
    try {
      const { data: pr } = await getOctokit(github).pulls.get({ owner, repo, pull_number: prNumber });
      const { data: files } = await getOctokit(github).pulls.listFiles({ owner, repo, pull_number: prNumber });
      const { data: commits } = await getOctokit(github).pulls.listCommits({ owner, repo, pull_number: prNumber });

      return {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        author: pr.user?.login || 'unknown',
        mergeCommitSha: pr.merge_commit_sha || undefined,
        labels: pr.labels.map((l: { name?: string }) => l.name || ''),
        files: files.map((f: { filename: string }) => f.filename),
        commits: commits.map((c: { sha: string; commit: { message: string; author?: { name?: string } }; author?: { login?: string } }) => ({
          sha: c.sha,
          message: c.commit.message,
          author: c.author?.login || c.commit.author?.name || 'unknown',
        })),
      };
    } catch (error) {
      logger.warn({ prNumber, error }, 'Failed to get PR info');
      return null;
    }
  }

  private groupChangesByCategory(changes: ChangelogEntry[]): ReleaseNotesSection[] {
    const grouped = new Map<ChangelogCategory, ChangelogEntry[]>();

    for (const change of changes) {
      const existing = grouped.get(change.category) || [];
      existing.push(change);
      grouped.set(change.category, existing);
    }

    const sections: ReleaseNotesSection[] = [];
    for (const [category, entries] of grouped) {
      const config = SECTION_CONFIG[category];
      sections.push({
        title: config.title,
        category,
        entries,
        icon: config.icon,
      });
    }

    // Sort by configured order
    sections.sort((a, b) => SECTION_CONFIG[a.category].order - SECTION_CONFIG[b.category].order);

    return sections;
  }

  private generateMarkdown(
    version: string,
    title: string,
    date: string,
    sections: ReleaseNotesSection[],
    contributors: string[],
    stats: ReleaseStats,
    owner: string,
    repo: string
  ): string {
    let md = `## [${version}] - ${date}\n\n`;

    for (const section of sections) {
      if (section.entries.length === 0) continue;

      md += `### ${section.title}\n\n`;
      for (const entry of section.entries) {
        let line = `- ${entry.description}`;
        if (entry.scope) {
          line = `- **${entry.scope}**: ${entry.description}`;
        }
        if (entry.prNumber > 0) {
          line += ` ([#${entry.prNumber}](https://github.com/${owner}/${repo}/pull/${entry.prNumber}))`;
        }
        if (entry.author) {
          line += ` by @${entry.author}`;
        }
        md += line + '\n';
      }
      md += '\n';
    }

    if (contributors.length > 0) {
      md += `### Contributors\n\n`;
      md += contributors.map(c => `- @${c}`).join('\n') + '\n\n';
    }

    md += `### Stats\n\n`;
    md += `- ${stats.prsMerged} PRs merged\n`;
    md += `- ${stats.filesChanged} files changed\n`;

    return md;
  }

  private async storeAnalysis(repositoryId: string, analysis: VersionBumpAnalysis): Promise<void> {
    await dbAny.versionBumpAnalysis.create({
      data: {
        repositoryId,
        recommendedBump: analysis.recommendedBump,
        currentVersion: analysis.currentVersion,
        suggestedVersion: analysis.suggestedVersion,
        confidence: analysis.confidence,
        factors: analysis.factors as object,
        changes: analysis.changes as object,
        analyzedAt: new Date(),
      },
    });
  }
}

export const semverService = new SemverService();
