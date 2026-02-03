/**
 * @fileoverview Semantic Versioning Bot Models
 * 
 * Types and interfaces for automatic semantic version detection
 * and release notes generation based on PR analysis.
 * 
 * @module models/semver
 */

import { z } from 'zod';

/**
 * Semantic version bump types following semver.org specification
 */
export const SemverBumpSchema = z.enum(['major', 'minor', 'patch', 'none']);
export type SemverBump = z.infer<typeof SemverBumpSchema>;

/**
 * Categories of changes for changelog generation
 */
export const ChangelogCategorySchema = z.enum([
  'breaking',
  'feature',
  'fix',
  'performance',
  'refactor',
  'documentation',
  'test',
  'chore',
  'security',
  'deprecation',
]);
export type ChangelogCategory = z.infer<typeof ChangelogCategorySchema>;

/**
 * A single change entry for release notes
 */
export interface ChangelogEntry {
  /** Category of the change */
  category: ChangelogCategory;
  /** Human-readable description of the change */
  description: string;
  /** PR number that introduced this change */
  prNumber: number;
  /** Author of the change */
  author: string;
  /** Files affected by this change */
  affectedFiles: string[];
  /** Whether this is a breaking change */
  isBreaking: boolean;
  /** Optional scope (e.g., component name) */
  scope?: string;
  /** Issue references */
  issueRefs?: string[];
}

/**
 * Version bump analysis result
 */
export interface VersionBumpAnalysis {
  /** Recommended semver bump type */
  recommendedBump: SemverBump;
  /** Current version (from package.json or similar) */
  currentVersion: string | null;
  /** Suggested next version */
  suggestedVersion: string | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Factors that influenced the decision */
  factors: VersionBumpFactor[];
  /** All detected changes */
  changes: ChangelogEntry[];
}

/**
 * A factor that influenced version bump decision
 */
export interface VersionBumpFactor {
  /** Type of factor */
  type: 'breaking_change' | 'new_feature' | 'bug_fix' | 'api_change' | 'dependency_update' | 'config_change';
  /** Description of the factor */
  description: string;
  /** Impact on version bump */
  impact: SemverBump;
  /** File or code location */
  location?: string;
}

/**
 * Generated release notes
 */
export interface ReleaseNotes {
  /** Version for these release notes */
  version: string;
  /** Release title/name */
  title: string;
  /** Release date (ISO format) */
  date: string;
  /** Grouped changelog entries */
  sections: ReleaseNotesSection[];
  /** Full markdown content */
  markdown: string;
  /** Contributors to this release */
  contributors: string[];
  /** Statistics about the release */
  stats: ReleaseStats;
}

/**
 * A section in the release notes
 */
export interface ReleaseNotesSection {
  /** Section title (e.g., "Breaking Changes", "New Features") */
  title: string;
  /** Category for this section */
  category: ChangelogCategory;
  /** Entries in this section */
  entries: ChangelogEntry[];
  /** Emoji icon for the section */
  icon: string;
}

/**
 * Statistics about a release
 */
export interface ReleaseStats {
  /** Total number of commits */
  totalCommits: number;
  /** Number of PRs merged */
  prsMerged: number;
  /** Number of issues closed */
  issuesClosed: number;
  /** Lines of code added */
  linesAdded: number;
  /** Lines of code removed */
  linesRemoved: number;
  /** Number of files changed */
  filesChanged: number;
}

/**
 * Configuration for the semver bot
 */
export interface SemverConfig {
  /** Repository ID */
  repositoryId: string;
  /** Path to version file (e.g., package.json, version.txt) */
  versionFilePath: string;
  /** Version extraction pattern */
  versionPattern?: string;
  /** Whether to auto-create releases */
  autoCreateRelease: boolean;
  /** Whether to auto-update changelog */
  autoUpdateChangelog: boolean;
  /** Changelog file path */
  changelogPath: string;
  /** Commit message prefix patterns to detect change types */
  commitPatterns: CommitPattern[];
  /** Custom section ordering for release notes */
  sectionOrder?: ChangelogCategory[];
  /** Whether to include contributor list */
  includeContributors: boolean;
  /** Whether to include PR links */
  includePRLinks: boolean;
  /** Whether to include issue links */
  includeIssueLinks: boolean;
}

/**
 * Pattern for matching commit messages to change types
 */
export interface CommitPattern {
  /** Regex pattern to match */
  pattern: string;
  /** Category to assign when matched */
  category: ChangelogCategory;
  /** Whether this pattern indicates a breaking change */
  isBreaking?: boolean;
}

/**
 * Input for semver agent
 */
export interface SemverAgentInput {
  /** Repository information */
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** PRs to analyze for version bump */
  pullRequests: SemverPRInfo[];
  /** Current version from version file */
  currentVersion: string | null;
  /** Configuration */
  config: SemverConfig;
}

/**
 * PR information needed for semver analysis
 */
export interface SemverPRInfo {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR body */
  body: string | null;
  /** Author login */
  author: string;
  /** Merge commit SHA */
  mergeCommitSha?: string;
  /** Labels on the PR */
  labels: string[];
  /** Files changed */
  files: string[];
  /** Commits in the PR */
  commits: SemverCommitInfo[];
}

/**
 * Commit information for semver analysis
 */
export interface SemverCommitInfo {
  /** Commit SHA */
  sha: string;
  /** Commit message */
  message: string;
  /** Author login */
  author: string;
}
