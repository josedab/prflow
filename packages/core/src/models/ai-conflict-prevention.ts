/**
 * @fileoverview AI-Powered Conflict Prevention Models
 *
 * Types for predicting merge conflicts before they happen,
 * analyzing concurrent PRs, and suggesting optimal merge ordering.
 *
 * @module models/ai-conflict-prevention
 */

// ============================================
// Conflict Prediction Types
// ============================================

/**
 * Conflict prediction result
 */
export interface ConflictPrediction {
  /** Prediction ID */
  id: string;
  /** Source PR */
  sourcePR: PRReference;
  /** Potential conflicts */
  potentialConflicts: PotentialConflict[];
  /** Overall conflict probability */
  conflictProbability: number;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Recommended actions */
  recommendations: ConflictRecommendation[];
  /** Optimal merge order */
  suggestedMergeOrder?: MergeOrder;
  /** Predicted at */
  predictedAt: Date;
  /** Valid until */
  validUntil: Date;
}

/**
 * PR reference
 */
export interface PRReference {
  /** Repository */
  repository: { owner: string; name: string };
  /** PR number */
  number: number;
  /** Title */
  title: string;
  /** Branch */
  branch: string;
  /** Author */
  author: string;
}

/**
 * A potential conflict
 */
export interface PotentialConflict {
  /** Conflict ID */
  id: string;
  /** Conflicting PR */
  conflictingPR: PRReference;
  /** Conflict type */
  type: ConflictPreventionType;
  /** Severity */
  severity: 'trivial' | 'minor' | 'moderate' | 'severe';
  /** Affected files */
  affectedFiles: AffectedFile[];
  /** Conflict probability */
  probability: number;
  /** Estimated resolution time (minutes) */
  estimatedResolutionMinutes: number;
  /** Auto-resolvable */
  autoResolvable: boolean;
  /** Description */
  description: string;
}

/**
 * Conflict types
 */
export type ConflictPreventionType =
  | 'same_lines' // Direct line overlap
  | 'adjacent_lines' // Changes near each other
  | 'same_function' // Same function modified
  | 'dependency_conflict' // Dependency changes conflict
  | 'schema_conflict' // Database/API schema conflicts
  | 'import_conflict' // Import statement conflicts
  | 'rename_conflict' // File/function renamed differently
  | 'delete_modify'; // One deletes, other modifies

/**
 * Affected file details
 */
export interface AffectedFile {
  /** File path */
  path: string;
  /** Conflicting regions */
  regions: ConflictRegion[];
  /** Total lines at risk */
  linesAtRisk: number;
  /** Complexity of merge */
  mergeComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
}

/**
 * Conflict region in a file
 */
export interface ConflictRegion {
  /** Start line in source PR */
  sourceStart: number;
  /** End line in source PR */
  sourceEnd: number;
  /** Start line in conflicting PR */
  targetStart: number;
  /** End line in conflicting PR */
  targetEnd: number;
  /** Overlap type */
  overlapType: 'direct' | 'adjacent' | 'contextual';
}

/**
 * Conflict recommendation
 */
export interface ConflictRecommendation {
  /** Recommendation ID */
  id: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Action type */
  action: 'merge_first' | 'rebase' | 'coordinate' | 'split_pr' | 'wait' | 'auto_resolve';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Affected PRs */
  affectedPRs: number[];
  /** Expected outcome */
  expectedOutcome: string;
}

/**
 * Suggested merge order
 */
export interface MergeOrder {
  /** Ordered list of PRs */
  order: Array<{
    prNumber: number;
    reason: string;
    dependencies: number[];
  }>;
  /** Total conflict reduction */
  conflictReduction: number;
  /** Confidence */
  confidence: number;
}

// ============================================
// Concurrent PR Analysis
// ============================================

/**
 * Analysis of concurrent PRs
 */
export interface ConcurrentPRAnalysis {
  /** Repository */
  repository: { owner: string; name: string };
  /** Open PRs analyzed */
  openPRs: PRReference[];
  /** Conflict matrix */
  conflictMatrix: ConflictMatrixEntry[];
  /** High-risk combinations */
  highRiskCombinations: Array<{
    prs: number[];
    reason: string;
    probability: number;
  }>;
  /** Safe to merge (no conflicts) */
  safeToMerge: number[];
  /** Recommended merge sequence */
  recommendedSequence: number[];
  /** Analysis timestamp */
  analyzedAt: Date;
}

/**
 * Entry in conflict matrix
 */
export interface ConflictMatrixEntry {
  /** PR A */
  prA: number;
  /** PR B */
  prB: number;
  /** Conflict probability */
  probability: number;
  /** Shared files count */
  sharedFilesCount: number;
  /** Conflict severity if merged */
  severity: 'none' | 'trivial' | 'minor' | 'moderate' | 'severe';
}

// ============================================
// Auto-Resolution Types
// ============================================

/**
 * Auto-resolution result
 */
export interface AutoResolutionResult {
  /** Resolution ID */
  id: string;
  /** PR number */
  prNumber: number;
  /** Conflicts resolved */
  conflictsResolved: ResolvedConflict[];
  /** Conflicts unresolved */
  conflictsUnresolved: UnresolvedConflict[];
  /** Success */
  success: boolean;
  /** Commit SHA (if applied) */
  commitSha?: string;
  /** Resolution strategy used */
  strategy: ResolutionStrategy;
}

/**
 * Resolved conflict
 */
export interface ResolvedConflict {
  /** File path */
  file: string;
  /** Resolution method */
  method: 'keep_ours' | 'keep_theirs' | 'merge' | 'ai_generated';
  /** Confidence */
  confidence: number;
  /** Diff preview */
  diffPreview: string;
}

/**
 * Unresolved conflict
 */
export interface UnresolvedConflict {
  /** File path */
  file: string;
  /** Reason unresolved */
  reason: string;
  /** Suggested manual action */
  suggestion: string;
}

/**
 * Resolution strategy
 */
export type ResolutionStrategy =
  | 'conservative' // Only resolve trivial conflicts
  | 'moderate' // Resolve most non-semantic conflicts
  | 'aggressive' // Use AI for complex resolutions
  | 'manual'; // Require human resolution

// ============================================
// Request/Response Types
// ============================================

/**
 * Predict conflicts request
 */
export interface PredictConflictsRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number to analyze */
  prNumber: number;
  /** Include auto-resolution suggestions */
  includeAutoResolution?: boolean;
  /** Include merge order optimization */
  includeMergeOrder?: boolean;
}

/**
 * Analyze concurrent PRs request
 */
export interface AnalyzeConcurrentRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Specific PRs to analyze (empty = all open) */
  prNumbers?: number[];
}

/**
 * Auto-resolve request
 */
export interface AutoResolveRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** Resolution strategy */
  strategy?: ResolutionStrategy;
  /** Dry run */
  dryRun?: boolean;
}

/**
 * Conflict prevention alert
 */
export interface ConflictAlert {
  /** Alert ID */
  id: string;
  /** Alert type */
  type: 'collision_course' | 'high_probability' | 'stale_branch' | 'complex_merge';
  /** Severity */
  severity: 'info' | 'warning' | 'critical';
  /** PRs involved */
  involvedPRs: number[];
  /** Message */
  message: string;
  /** Recommendation */
  recommendation: string;
  /** Created at */
  createdAt: Date;
}
