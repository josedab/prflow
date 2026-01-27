import { z } from 'zod';

// ============================================
// PR Types
// ============================================

/**
 * Types of pull requests based on their purpose
 */
export const PRTypeSchema = z.enum(['feature', 'bugfix', 'refactor', 'docs', 'chore', 'test', 'deps']);
export type PRType = z.infer<typeof PRTypeSchema>;

/**
 * Risk levels for pull request changes
 */
export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * Severity levels for review comments
 */
export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'nitpick']);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Categories for code review findings
 */
export const ReviewCategorySchema = z.enum([
  'security',
  'bug',
  'performance',
  'error_handling',
  'testing',
  'documentation',
  'style',
  'maintainability',
]);
export type ReviewCategory = z.infer<typeof ReviewCategorySchema>;

// ============================================
// Pull Request
// ============================================

/**
 * Represents a GitHub Pull Request with all relevant metadata
 */
export interface PullRequest {
  /** PR number within the repository */
  number: number;
  /** Title of the pull request */
  title: string;
  /** Description body of the PR (markdown) */
  body: string | null;
  /** API URL for the PR */
  url: string;
  /** Web URL for viewing the PR */
  htmlUrl: string;
  /** Current state of the PR */
  state: 'open' | 'closed';
  /** Whether this is a draft PR */
  draft: boolean;
  /** Whether the PR can be merged (null if unknown) */
  mergeable?: boolean | null;
  /** Source branch information */
  head: {
    ref: string;
    sha: string;
  };
  /** Target branch information */
  base: {
    ref: string;
    sha: string;
  };
  /** Author of the PR */
  author: {
    login: string;
    avatarUrl?: string;
  };
  /** Repository the PR belongs to */
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** ISO timestamp when the PR was created */
  createdAt: string;
  /** ISO timestamp when the PR was last updated */
  updatedAt: string;
}

/**
 * Represents a file changed in a pull request
 */
export interface PRFile {
  /** Path to the file */
  filename: string;
  /** Type of change made to the file */
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Total number of changes */
  changes: number;
  /** Unified diff patch (may be truncated for large files) */
  patch?: string;
  /** Previous filename if the file was renamed */
  previousFilename?: string;
}

/**
 * Represents the complete diff of a pull request
 */
export interface PRDiff {
  /** List of all changed files */
  files: PRFile[];
  /** Total lines added across all files */
  totalAdditions: number;
  /** Total lines deleted across all files */
  totalDeletions: number;
  /** Total changes across all files */
  totalChanges: number;
}

// ============================================
// Semantic Changes
// ============================================

/**
 * Types of semantic changes that can be detected in code
 */
export const SemanticChangeTypeSchema = z.enum([
  'new_function',
  'modified_function',
  'deleted_function',
  'new_class',
  'modified_class',
  'deleted_class',
  'new_api',
  'modified_api',
  'deleted_api',
  'dependency_added',
  'dependency_removed',
  'dependency_updated',
  'config_change',
  'schema_change',
  'test_added',
  'test_modified',
]);
export type SemanticChangeType = z.infer<typeof SemanticChangeTypeSchema>;

/**
 * Represents a semantic change detected in the code
 */
export interface SemanticChange {
  /** Type of semantic change */
  type: SemanticChangeType;
  /** Name of the changed entity (function, class, etc.) */
  name: string;
  /** File where the change occurred */
  file: string;
  /** Starting line of the change */
  startLine?: number;
  /** Ending line of the change */
  endLine?: number;
  /** Estimated impact of this change */
  impact: 'low' | 'medium' | 'high';
  /** Whether this is a breaking change */
  breaking?: boolean;
  /** Human-readable description of the change */
  description?: string;
}

/**
 * Represents the impact radius of changes in a PR
 */
export interface ImpactRadius {
  /** Number of files directly depending on changed code */
  directDependents: number;
  /** Number of files transitively affected */
  transitiveDependents: number;
  /** List of affected file paths */
  affectedFiles: string[];
  /** Test coverage percentage for affected code (null if unknown) */
  testCoverage: number | null;
}

// ============================================
// PR Analysis
// ============================================

/**
 * Complete analysis result for a pull request
 */
export interface PRAnalysis {
  /** PR number within the repository */
  prNumber: number;
  /** Detected type of the PR */
  type: PRType;
  /** Assessed risk level */
  riskLevel: RiskLevel;
  /** Change statistics */
  changes: {
    filesModified: number;
    linesAdded: number;
    linesRemoved: number;
  };
  /** List of semantic changes detected */
  semanticChanges: SemanticChange[];
  /** Impact radius of the changes */
  impactRadius: ImpactRadius;
  /** Identified risks in the PR */
  risks: string[];
  /** Suggested reviewers based on code ownership */
  suggestedReviewers: ReviewerSuggestion[];
  /** Timestamp when analysis was performed */
  analyzedAt: Date;
  /** Time taken for analysis in milliseconds */
  latencyMs: number;
}

/**
 * A suggested reviewer for a pull request
 */
export interface ReviewerSuggestion {
  /** GitHub username */
  login: string;
  /** Reason for the suggestion */
  reason: string;
  /** Relevance score (0-1) */
  score: number;
  /** Whether this reviewer is required */
  required: boolean;
  /** Current availability status */
  availability?: 'online' | 'offline' | 'busy' | 'unknown';
}

// ============================================
// Review Comments
// ============================================

/**
 * A code suggestion with before/after comparison
 */
export interface CodeSuggestion {
  /** Original code to be replaced */
  originalCode: string;
  /** Suggested replacement code */
  suggestedCode: string;
  /** Programming language for syntax highlighting */
  language: string;
}

/**
 * A review comment on a specific location in the code
 */
export interface ReviewComment {
  /** Unique identifier for the comment */
  id: string;
  /** File path where the comment applies */
  file: string;
  /** Starting line number */
  line: number;
  /** Ending line number (for multi-line comments) */
  endLine?: number;
  /** Severity of the issue */
  severity: Severity;
  /** Category of the issue */
  category: ReviewCategory;
  /** Human-readable message explaining the issue */
  message: string;
  /** Optional code suggestion for fixing the issue */
  suggestion?: CodeSuggestion;
  /** Confidence score (0-1) of the finding */
  confidence: number;
  /** URL to documentation about this type of issue */
  learnMoreUrl?: string;
}

/**
 * Complete result of a code review
 */
export interface ReviewResult {
  /** List of review comments */
  comments: ReviewComment[];
  /** Summary counts by severity */
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    nitpick: number;
  };
  /** List of issues that were automatically fixed */
  autoFixed: string[];
}

// ============================================
// Generated Tests
// ============================================

/** Supported test frameworks */
export type TestFramework = 'jest' | 'vitest' | 'mocha' | 'pytest' | 'go_test' | 'rspec' | 'unknown';

/**
 * A generated test file for a source file
 */
export interface GeneratedTest {
  /** Path where the test file should be created */
  testFile: string;
  /** Path to the source file being tested */
  targetFile: string;
  /** Test framework used */
  framework: TestFramework;
  /** Complete test code */
  testCode: string;
  /** List of functions/methods being covered */
  coverageTargets: string[];
  /** Names of individual test cases */
  testNames: string[];
}

/**
 * Result of test generation for a PR
 */
export interface TestGenerationResult {
  /** List of generated tests */
  tests: GeneratedTest[];
  /** Estimated coverage improvement percentage */
  coverageImprovement: number | null;
  /** Detected test framework in the repository */
  frameworkDetected: TestFramework;
}

// ============================================
// Documentation Updates
// ============================================

/** Types of documentation that can be updated */
export type DocType = 'jsdoc' | 'readme' | 'changelog' | 'api_docs' | 'inline_comment';

/**
 * A documentation update suggestion
 */
export interface DocUpdate {
  /** Type of documentation being updated */
  docType: DocType;
  /** File path for the documentation */
  file: string;
  /** New or updated content */
  content: string;
  /** Explanation for why this update is needed */
  reason: string;
  /** Starting line for inline updates */
  startLine?: number;
  /** Ending line for inline updates */
  endLine?: number;
}

/**
 * Result of documentation generation for a PR
 */
export interface DocUpdateResult {
  /** List of documentation updates */
  updates: DocUpdate[];
  /** Generated changelog entry for this PR */
  changelogEntry?: string;
}

// ============================================
// Synthesis
// ============================================

/**
 * Risk assessment for a pull request
 */
export interface RiskAssessment {
  /** Overall risk level */
  level: RiskLevel;
  /** Factors contributing to the risk */
  factors: string[];
  /** Suggested mitigations */
  mitigations: string[];
}

/**
 * Summary of all findings from the review
 */
export interface FindingsSummary {
  /** Total number of issues found */
  totalIssues: number;
  /** Issue counts by severity */
  bySeverity: Record<Severity, number>;
  /** Issue counts by category */
  byCategory: Record<ReviewCategory, number>;
  /** Number of issues automatically fixed */
  autoFixed: number;
}

/**
 * A checklist item for human reviewers
 */
export interface ChecklistItem {
  /** Description of the item to check */
  item: string;
  /** Why this check is important */
  reason: string;
  /** Priority level for this item */
  priority: 'required' | 'recommended' | 'optional';
}

/**
 * An asset generated during PR processing
 */
export interface GeneratedAsset {
  /** Type of asset */
  type: 'test' | 'doc' | 'changelog' | 'fix';
  /** Description of the asset */
  description: string;
  /** File path of the asset */
  file: string;
  /** URL to view the asset (if applicable) */
  url?: string;
}

/**
 * Complete synthesis of PR analysis, review, and generated assets
 */
export interface PRSynthesis {
  /** Human-readable summary of the PR */
  summary: string;
  /** Risk assessment */
  riskAssessment: RiskAssessment;
  /** Summary of all findings */
  findingsSummary: FindingsSummary;
  /** Checklist for human reviewers */
  humanReviewChecklist: ChecklistItem[];
  /** List of generated assets (tests, docs, etc.) */
  generatedAssets: GeneratedAsset[];
  /** Suggested reviewers */
  suggestedReviewers: ReviewerSuggestion[];
  /** Overall confidence score (0-1) */
  confidence: number;
}

// ============================================
// Workflow
// ============================================

/** Possible states of a PR workflow */
export type WorkflowStatus =
  | 'pending'
  | 'analyzing'
  | 'reviewing'
  | 'generating_tests'
  | 'updating_docs'
  | 'synthesizing'
  | 'completed'
  | 'failed';

/**
 * Complete result of a PR workflow execution
 */
export interface PRWorkflowResult {
  /** Unique workflow identifier */
  workflowId: string;
  /** Current status */
  status: WorkflowStatus;
  /** Analysis results (if completed) */
  analysis?: PRAnalysis;
  /** Review results (if completed) */
  review?: ReviewResult;
  /** Generated tests (if any) */
  tests?: TestGenerationResult;
  /** Documentation updates (if any) */
  docs?: DocUpdateResult;
  /** Synthesis results (if completed) */
  synthesis?: PRSynthesis;
  /** Error message (if failed) */
  error?: string;
  /** When the workflow started */
  startedAt: Date;
  /** When the workflow completed */
  completedAt?: Date;
}

// ============================================
// Fix Application (Interactive Fix Feature)
// ============================================

export type FixStatus = 'pending' | 'applying' | 'applied' | 'failed' | 'conflicted' | 'reverted';

export interface FixApplication {
  id: string;
  commentId: string;
  repositoryId: string;
  prNumber: number;
  headBranch: string;
  file: string;
  originalCode: string;
  suggestedCode: string;
  commitSha?: string;
  commitMessage?: string;
  status: FixStatus;
  errorMessage?: string;
  appliedBy?: string;
  appliedAt?: Date;
  createdAt: Date;
}

export interface FixPreview {
  file: string;
  originalCode: string;
  suggestedCode: string;
  previewDiff: string;
  canApply: boolean;
  reason?: string;
}

export interface BatchFixResult {
  success: boolean;
  batchId: string;
  commitSha?: string;
  appliedFixes: string[];
  failedFixes: Array<{ commentId: string; error: string }>;
}

// ============================================
// PR Health Score (Dashboard Feature)
// ============================================

export interface HealthScoreFactors {
  reviewLatencyScore: number;
  commentDensityScore: number;
  approvalVelocityScore: number;
  riskScore: number;
  testCoverageScore: number;
}

export interface PRHealthScore {
  workflowId: string;
  prNumber: number;
  overallScore: number;
  factors: HealthScoreFactors;
  reviewLatencyMinutes: number | null;
  commentCount: number;
  approvalCount: number;
  changeRequestCount: number;
  predictedMergeDate: Date | null;
  blockers: string[];
  recommendations: string[];
  calculatedAt: Date;
}

export interface TeamHealthMetrics {
  repositoryId: string;
  period: { start: Date; end: Date };
  avgReviewLatencyMinutes: number;
  avgCycleTimeHours: number;
  avgPRsPerWeek: number;
  avgCommentsPerPR: number;
  throughputScore: number;
  qualityScore: number;
  velocityScore: number;
  topBlockers: string[];
  trends: {
    reviewLatency: 'improving' | 'stable' | 'degrading';
    cycleTime: 'improving' | 'stable' | 'degrading';
    quality: 'improving' | 'stable' | 'degrading';
  };
}

// ============================================
// Codebase Learning Engine
// ============================================

export type PatternType =
  | 'naming_convention'
  | 'code_style'
  | 'error_handling'
  | 'test_pattern'
  | 'documentation'
  | 'security'
  | 'architecture'
  | 'api_design';

export type FeedbackType = 'accepted' | 'rejected' | 'modified' | 'dismissed' | 'false_positive';

export interface LearnedPattern {
  patternType: PatternType;
  pattern: string;
  context: Record<string, unknown>;
  frequency: number;
  confidence: number;
}

export interface ConventionRule {
  id: string;
  type: PatternType;
  description: string;
  pattern: string;
  severity: 'error' | 'warning' | 'info';
  autoFix?: string;
  enabled: boolean;
}

export interface CodebaseContext {
  repositoryId: string;
  detectedFrameworks: string[];
  detectedLanguages: string[];
  testFramework: string | null;
  styleGuide: Record<string, unknown> | null;
  learnedPatterns: Record<string, LearnedPattern[]>;
  conventionRules: ConventionRule[];
  lastAnalyzedAt: Date;
}

export interface ReviewFeedback {
  commentId: string;
  feedbackType: FeedbackType;
  originalSuggestion?: string;
  userAction?: string;
}

export interface LearningStats {
  total: number;
  byType: Record<FeedbackType, number>;
  acceptanceRate: number;
  falsePositiveRate: number;
}

// ============================================
// Code Migration (Feature 1)
// ============================================
export * from './migration.js';

// ============================================
// Knowledge Graph (Feature 2)
// ============================================
export * from './knowledge-graph.js';

// ============================================
// PR Decomposition (Feature 3)
// ============================================
export * from './decomposition.js';

// ============================================
// Security Compliance (Feature 4)
// ============================================
export * from './compliance.js';

// ============================================
// Collaborative Review (Feature 5)
// ============================================
export * from './collaborative-review.js';

// ============================================
// Predictive CI (Feature 6)
// ============================================
export * from './predictive-ci.js';

// ============================================
// Multi-Repository Orchestration (Feature 7)
// ============================================
export * from './multi-repo.js';

// ============================================
// Review Personas (Feature 8)
// ============================================
export * from './review-personas.js';

// ============================================
// Natural Language Queries (Feature 9)
// ============================================
export * from './nl-query.js';

// ============================================
// Developer Learning Paths (Feature 10)
// ============================================
export * from './learning-paths.js';

// ============================================
// Code Intent Understanding (Next-Gen Feature 1)
// ============================================
export * from './code-intent.js';

// ============================================
// Review Debt Dashboard (Next-Gen Feature 5)
// ============================================
export * from './review-debt.js';
