/**
 * @fileoverview Shift-Left Pre-Commit Analysis Types for PRFlow.
 *
 * This module defines types for analyzing code changes before they
 * are committed, catching issues at the earliest possible stage.
 *
 * Features:
 * - Local analysis before commit
 * - AI-powered issue detection
 * - Quick feedback loop
 * - Integration with git hooks
 *
 * @module models/shift-left
 */

/**
 * Input for pre-commit analysis
 */
export interface ShiftLeftInput {
  /** Repository identifier */
  repositoryId: string;
  /** Staged file changes */
  stagedChanges: StagedChange[];
  /** Current branch name */
  branchName: string;
  /** Commit message (if available) */
  commitMessage?: string;
  /** Previous commit SHA for context */
  baseCommit?: string;
  /** User preferences for analysis */
  preferences?: ShiftLeftPreferences;
  /** Quick mode for faster feedback */
  quickMode?: boolean;
}

/**
 * Staged change information
 */
export interface StagedChange {
  /** File path */
  filename: string;
  /** Change status */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
  /** Diff patch */
  patch?: string;
  /** Full file content (for new files) */
  content?: string;
  /** Previous filename (for renames) */
  previousFilename?: string;
}

/**
 * User preferences for shift-left analysis
 */
export interface ShiftLeftPreferences {
  /** Enable security checks */
  securityChecks: boolean;
  /** Enable style checks */
  styleChecks: boolean;
  /** Enable complexity analysis */
  complexityChecks: boolean;
  /** Enable test coverage hints */
  testHints: boolean;
  /** Enable documentation suggestions */
  docSuggestions: boolean;
  /** Severity threshold to report */
  severityThreshold: 'all' | 'medium' | 'high' | 'critical';
  /** Custom rules to apply */
  customRules?: string[];
  /** Paths to ignore */
  ignorePaths?: string[];
}

/**
 * Result of pre-commit analysis
 */
export interface ShiftLeftResult {
  /** Overall commit readiness */
  commitReady: boolean;
  /** Blocking issues count */
  blockingIssues: number;
  /** Warning count */
  warnings: number;
  /** Issues found */
  issues: ShiftLeftIssue[];
  /** Suggestions for improvement */
  suggestions: ShiftLeftSuggestion[];
  /** Quick fixes available */
  quickFixes: QuickFix[];
  /** Analysis summary */
  summary: ShiftLeftSummary;
  /** Commit message suggestions */
  commitMessageSuggestions?: string[];
  /** Test suggestions */
  testSuggestions?: TestSuggestion[];
  /** Time to analyze (ms) */
  analysisTimeMs: number;
}

/**
 * Issue found during pre-commit analysis
 */
export interface ShiftLeftIssue {
  /** Unique issue ID */
  id: string;
  /** Issue severity */
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  /** Issue category */
  category: ShiftLeftCategory;
  /** File affected */
  file: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Issue message */
  message: string;
  /** Detailed description */
  description?: string;
  /** Related rule ID */
  ruleId?: string;
  /** Whether this blocks commit */
  blocking: boolean;
  /** Whether auto-fix is available */
  autoFixable: boolean;
  /** Code snippet showing the issue */
  codeSnippet?: string;
}

/**
 * Categories for shift-left issues
 */
export type ShiftLeftCategory =
  | 'security'
  | 'performance'
  | 'style'
  | 'complexity'
  | 'documentation'
  | 'testing'
  | 'best_practice'
  | 'deprecated'
  | 'type_safety'
  | 'error_handling';

/**
 * Suggestion for improvement
 */
export interface ShiftLeftSuggestion {
  /** Suggestion ID */
  id: string;
  /** Suggestion type */
  type: 'refactor' | 'test' | 'documentation' | 'improvement' | 'warning';
  /** File affected */
  file: string;
  /** Line range */
  lineRange?: { start: number; end: number };
  /** Suggestion message */
  message: string;
  /** Why this matters */
  rationale: string;
  /** Effort estimate */
  effort: 'trivial' | 'small' | 'medium' | 'large';
  /** Priority */
  priority: number;
}

/**
 * Quick fix that can be auto-applied
 */
export interface QuickFix {
  /** Fix ID */
  id: string;
  /** Related issue ID */
  issueId: string;
  /** Fix description */
  description: string;
  /** File to modify */
  file: string;
  /** Original code */
  original: string;
  /** Fixed code */
  replacement: string;
  /** Line range */
  lineRange: { start: number; end: number };
  /** Confidence level */
  confidence: number;
}

/**
 * Analysis summary
 */
export interface ShiftLeftSummary {
  /** Total files analyzed */
  filesAnalyzed: number;
  /** Total lines changed */
  linesChanged: number;
  /** Issues by severity */
  issuesBySeverity: Record<ShiftLeftIssue['severity'], number>;
  /** Issues by category */
  issuesByCategory: Record<ShiftLeftCategory, number>;
  /** Overall score (0-100) */
  score: number;
  /** Comparison with team average */
  teamComparison?: {
    avgScore: number;
    percentile: number;
  };
}

/**
 * Test suggestion for new/changed code
 */
export interface TestSuggestion {
  /** File to test */
  sourceFile: string;
  /** Suggested test file path */
  testFile: string;
  /** Test type */
  testType: 'unit' | 'integration' | 'e2e';
  /** Functions/methods to test */
  targetsToTest: string[];
  /** Test scenario descriptions */
  scenarios: string[];
  /** Generated test code (if available) */
  generatedCode?: string;
  /** Priority */
  priority: number;
}

/**
 * Configuration for shift-left analysis
 */
export interface ShiftLeftConfig {
  /** Enable pre-commit hooks */
  enableHooks: boolean;
  /** Block commit on critical issues */
  blockOnCritical: boolean;
  /** Block commit on high severity issues */
  blockOnHigh: boolean;
  /** Maximum issues before blocking */
  maxIssuesBeforeBlock: number;
  /** Enable AI-powered analysis */
  enableAIAnalysis: boolean;
  /** Quick mode timeout (ms) */
  quickModeTimeout: number;
  /** Full mode timeout (ms) */
  fullModeTimeout: number;
  /** Custom rules */
  customRules: ShiftLeftRule[];
  /** Paths to always ignore */
  globalIgnorePaths: string[];
}

/**
 * Custom rule definition
 */
export interface ShiftLeftRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Severity */
  severity: ShiftLeftIssue['severity'];
  /** Category */
  category: ShiftLeftCategory;
  /** File pattern to apply to */
  filePattern?: string;
  /** Regex pattern to match */
  pattern: string;
  /** Message template */
  messageTemplate: string;
  /** Whether to block commit */
  blocking: boolean;
  /** Auto-fix template (if available) */
  autoFix?: {
    searchPattern: string;
    replacement: string;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_SHIFT_LEFT_CONFIG: ShiftLeftConfig = {
  enableHooks: true,
  blockOnCritical: true,
  blockOnHigh: false,
  maxIssuesBeforeBlock: 10,
  enableAIAnalysis: true,
  quickModeTimeout: 5000,
  fullModeTimeout: 30000,
  customRules: [],
  globalIgnorePaths: [
    'node_modules/',
    'dist/',
    'build/',
    '.git/',
    '*.min.js',
    '*.min.css',
    '*.lock',
  ],
};

/**
 * Default preferences
 */
export const DEFAULT_SHIFT_LEFT_PREFERENCES: ShiftLeftPreferences = {
  securityChecks: true,
  styleChecks: true,
  complexityChecks: true,
  testHints: true,
  docSuggestions: true,
  severityThreshold: 'medium',
};
