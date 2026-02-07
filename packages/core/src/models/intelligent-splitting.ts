/**
 * @fileoverview Intelligent PR Auto-Splitting Models
 *
 * Types for AST-level analysis, seam boundary detection,
 * split quality scoring, and automated sub-PR creation
 * with dependency ordering.
 *
 * @module models/intelligent-splitting
 */

import { z } from 'zod';

// ============================================
// Split Analysis Types
// ============================================

/**
 * Strategy for detecting split boundaries
 */
export const SplitBoundaryStrategySchema = z.enum([
  'ast_module',       // Split by AST module boundaries
  'feature_seam',     // Split along feature seam lines
  'layer_boundary',   // Split by architectural layers
  'dependency_cut',   // Split at minimal dependency cut points
  'risk_isolation',   // Isolate high-risk changes
  'auto',            // Automatically select best strategy
]);
export type SplitBoundaryStrategy = z.infer<typeof SplitBoundaryStrategySchema>;

/**
 * Split quality tier
 */
export type SplitQualityTier = 'excellent' | 'good' | 'acceptable' | 'poor';

/**
 * AST node reference within a file
 */
export interface ASTNodeReference {
  /** File path */
  file: string;
  /** Node type (function, class, interface, import, etc.) */
  nodeType: string;
  /** Node name */
  name: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Exported symbol */
  exported: boolean;
  /** Symbols this node depends on */
  dependencies: string[];
  /** Symbols that depend on this node */
  dependents: string[];
}

/**
 * Seam boundary detected in the codebase
 */
export interface SeamBoundary {
  /** Boundary ID */
  id: string;
  /** Boundary type */
  type: 'module' | 'layer' | 'feature' | 'dependency' | 'file_group';
  /** Human-readable name */
  name: string;
  /** Files on side A */
  sideA: string[];
  /** Files on side B */
  sideB: string[];
  /** Cross-boundary dependencies (lower is better for splitting) */
  crossDependencyCount: number;
  /** Confidence this is a natural split point */
  confidence: number;
}

// ============================================
// Split Proposal Types
// ============================================

/**
 * A proposed sub-PR from the auto-splitting analysis
 */
export interface SubPRProposal {
  /** Proposal ID */
  id: string;
  /** Ordering index (1-based) */
  order: number;
  /** Suggested title */
  title: string;
  /** Suggested description body */
  body: string;
  /** Branch name to create */
  branch: string;
  /** Files included in this sub-PR */
  files: SubPRFile[];
  /** AST nodes included */
  astNodes: ASTNodeReference[];
  /** IDs of sub-PRs this depends on (must merge first) */
  dependsOn: string[];
  /** IDs of sub-PRs that depend on this */
  blockedBy: string[];
  /** Estimated review time (minutes) */
  estimatedReviewMinutes: number;
  /** Risk level */
  risk: 'low' | 'medium' | 'high';
  /** Labels to apply */
  labels: string[];
  /** Suggested reviewers */
  suggestedReviewers: string[];
}

/**
 * A file included in a sub-PR proposal
 */
export interface SubPRFile {
  /** File path */
  path: string;
  /** Change type */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
  /** Specific hunks to include (null = entire file) */
  hunks: SubPRHunk[] | null;
}

/**
 * A specific hunk within a file for partial splitting
 */
export interface SubPRHunk {
  /** Start line in the original diff */
  startLine: number;
  /** End line in the original diff */
  endLine: number;
  /** The patch content */
  patch: string;
}

// ============================================
// Split Quality Types
// ============================================

/**
 * Quality assessment of a split proposal
 */
export interface SplitQualityScore {
  /** Overall quality score (0-100) */
  overall: number;
  /** Quality tier */
  tier: SplitQualityTier;
  /** Individual factor scores */
  factors: SplitQualityFactors;
  /** Issues found */
  issues: SplitQualityIssue[];
  /** Recommendations for improvement */
  recommendations: string[];
}

/**
 * Individual quality factor scores
 */
export interface SplitQualityFactors {
  /** Can each sub-PR compile independently? (0-100) */
  independence: number;
  /** Are the sub-PRs balanced in size? (0-100) */
  sizeBalance: number;
  /** Are semantic units kept together? (0-100) */
  semanticCohesion: number;
  /** Is the dependency chain minimal? (0-100) */
  dependencyMinimality: number;
  /** Is each sub-PR reviewable in isolation? (0-100) */
  reviewability: number;
}

/**
 * A quality issue with the split
 */
export interface SplitQualityIssue {
  /** Issue severity */
  severity: 'error' | 'warning' | 'info';
  /** Which sub-PR(s) affected */
  affectedSubPRs: string[];
  /** Issue description */
  message: string;
  /** Suggestion for fixing */
  suggestion?: string;
}

// ============================================
// Auto-Split Result Types
// ============================================

/**
 * Complete result of the auto-splitting analysis
 */
export interface AutoSplitAnalysis {
  /** Analysis ID */
  id: string;
  /** Source PR number */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Strategy used */
  strategy: SplitBoundaryStrategy;
  /** Whether splitting is recommended */
  shouldSplit: boolean;
  /** Reason for recommendation */
  reason: string;
  /** Original PR stats */
  originalStats: {
    files: number;
    additions: number;
    deletions: number;
    estimatedReviewMinutes: number;
  };
  /** Seam boundaries detected */
  seamBoundaries: SeamBoundary[];
  /** Proposed sub-PRs (ordered by dependency) */
  subPRs: SubPRProposal[];
  /** Quality assessment */
  quality: SplitQualityScore;
  /** Expected improvement metrics */
  expectedImprovement: {
    /** Reduction in review time per sub-PR vs original */
    reviewTimeReductionPercent: number;
    /** Expected faster time-to-merge */
    mergeTimeReductionPercent: number;
    /** Risk reduction from isolation */
    riskReductionPercent: number;
  };
  /** Analyzed at */
  analyzedAt: Date;
  /** Analysis duration (ms) */
  analysisDurationMs: number;
}

/**
 * Result of executing an auto-split
 */
export interface AutoSplitExecutionResult {
  /** Execution ID */
  id: string;
  /** Source analysis ID */
  analysisId: string;
  /** Created sub-PRs */
  createdPRs: CreatedSubPR[];
  /** Tracking issue number (if created) */
  trackingIssueNumber?: number;
  /** Overall success */
  success: boolean;
  /** Errors encountered */
  errors: Array<{ subPRId: string; error: string }>;
  /** Executed at */
  executedAt: Date;
}

/**
 * A sub-PR that was actually created on GitHub
 */
export interface CreatedSubPR {
  /** Original proposal ID */
  proposalId: string;
  /** Created PR number */
  prNumber: number;
  /** Created branch */
  branch: string;
  /** PR URL */
  url: string;
  /** Status */
  status: 'created' | 'failed';
}

// ============================================
// Agent Input/Output Types
// ============================================

/**
 * Input for the intelligent splitting agent
 */
export interface IntelligentSplitAgentInput {
  /** PR to analyze */
  pr: {
    number: number;
    title: string;
    body: string | null;
    head: { ref: string; sha: string };
    base: { ref: string };
  };
  /** Diff data */
  diff: {
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;
    totalAdditions: number;
    totalDeletions: number;
  };
  /** Repository context */
  repository: { owner: string; name: string };
  /** Strategy override */
  strategy?: SplitBoundaryStrategy;
  /** Maximum number of sub-PRs to create */
  maxSubPRs?: number;
  /** Minimum lines per sub-PR */
  minLinesPerSubPR?: number;
  /** Whether to auto-execute or just analyze */
  autoExecute?: boolean;
}
