/**
 * @fileoverview Smart Conflict Prevention Models
 * 
 * Types and interfaces for proactively detecting and preventing
 * merge conflicts between concurrent PRs.
 * 
 * @module models/conflict-prevention
 */

import { z } from 'zod';

/**
 * Severity of predicted conflict
 */
export const ConflictSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type ConflictSeverity = z.infer<typeof ConflictSeveritySchema>;

/**
 * Type of conflict
 */
export const PRConflictTypeSchema = z.enum([
  'file_overlap',      // Same file modified in multiple PRs
  'function_overlap',  // Same function modified
  'import_conflict',   // Conflicting imports
  'schema_conflict',   // Database schema conflicts
  'config_conflict',   // Configuration conflicts
  'dependency_conflict', // Package dependency conflicts
  'semantic_conflict', // Logically incompatible changes
  'merge_order',       // Would cause issues if merged in wrong order
]);
export type PRConflictType = z.infer<typeof PRConflictTypeSchema>;

/**
 * A predicted conflict between PRs
 */
export interface PredictedConflict {
  /** Unique ID */
  id: string;
  /** First PR in the conflict */
  prA: ConflictPRInfo;
  /** Second PR in the conflict */
  prB: ConflictPRInfo;
  /** Type of conflict */
  type: PRConflictType;
  /** Severity */
  severity: ConflictSeverity;
  /** Confidence score (0-1) */
  confidence: number;
  /** Files involved */
  affectedFiles: string[];
  /** Specific locations within files */
  locations: ConflictLocation[];
  /** Description of the conflict */
  description: string;
  /** Suggested resolution */
  resolution: PRConflictResolution;
  /** When predicted */
  predictedAt: Date;
  /** Whether conflict has been acknowledged */
  acknowledged: boolean;
  /** Whether conflict was resolved */
  resolved: boolean;
  /** Resolution notes */
  resolutionNotes?: string;
}

/**
 * PR information for conflict detection
 */
export interface ConflictPRInfo {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** Author */
  author: string;
  /** Head branch */
  branch: string;
  /** Head commit SHA */
  headSha: string;
  /** Files changed */
  filesChanged: string[];
  /** When PR was created */
  createdAt: Date;
}

/**
 * Location of a conflict
 */
export interface ConflictLocation {
  /** File path */
  file: string;
  /** Start line */
  startLine?: number;
  /** End line */
  endLine?: number;
  /** Symbol (function, class, etc.) */
  symbol?: string;
  /** Code snippet from PR A */
  snippetA?: string;
  /** Code snippet from PR B */
  snippetB?: string;
}

/**
 * Suggested resolution for a conflict
 */
export interface PRConflictResolution {
  /** Resolution strategy */
  strategy: 'merge_a_first' | 'merge_b_first' | 'coordinate' | 'rebase' | 'split' | 'combine';
  /** Explanation */
  explanation: string;
  /** Steps to resolve */
  steps: string[];
  /** Estimated effort (minutes) */
  estimatedEffort: number;
  /** Automation available */
  canAutoResolve: boolean;
  /** Auto-resolution script (if available) */
  autoResolveScript?: string;
}

/**
 * Optimal merge order recommendation
 */
export interface MergeOrderRecommendation {
  /** Repository */
  repository: string;
  /** Recommended order */
  order: MergeOrderItem[];
  /** Why this order */
  reasoning: string;
  /** Conflicts that would occur with wrong order */
  potentialConflicts: PredictedConflict[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * Item in merge order
 */
export interface MergeOrderItem {
  /** PR number */
  prNumber: number;
  /** PR title */
  title: string;
  /** Position in order */
  position: number;
  /** Dependencies (must be merged before) */
  dependsOn: number[];
  /** Blocks (must be merged after) */
  blocks: number[];
  /** Reason for this position */
  reason: string;
}

/**
 * Conflict detection result for a repository
 */
export interface ConflictScan {
  /** Scan ID */
  id: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** Open PRs analyzed */
  prsAnalyzed: number;
  /** Conflicts found */
  conflicts: PredictedConflict[];
  /** Merge order recommendation */
  mergeOrder: MergeOrderRecommendation;
  /** High-risk files (in multiple PRs) */
  hotspots: FileHotspot[];
  /** Scan timestamp */
  scannedAt: Date;
  /** Next recommended scan */
  nextScanAt: Date;
}

/**
 * A file that appears in multiple PRs
 */
export interface FileHotspot {
  /** File path */
  file: string;
  /** Number of PRs touching this file */
  prCount: number;
  /** PRs touching this file */
  prs: number[];
  /** Risk level */
  riskLevel: ConflictSeverity;
  /** Total lines modified across all PRs */
  totalLinesModified: number;
}

/**
 * Notification for conflict warning
 */
export interface ConflictNotification {
  /** Notification ID */
  id: string;
  /** Conflict ID */
  conflictId: string;
  /** Recipients (PR authors) */
  recipients: string[];
  /** Channel */
  channel: 'github_comment' | 'slack' | 'email';
  /** Sent at */
  sentAt: Date;
  /** Message content */
  message: string;
}

/**
 * Conflict prevention configuration
 */
export interface ConflictPreventionConfig {
  /** Repository ID */
  repositoryId: string;
  /** Enable automatic scanning */
  autoScanEnabled: boolean;
  /** Scan interval (minutes) */
  scanIntervalMinutes: number;
  /** Minimum confidence to report */
  minConfidence: number;
  /** Minimum severity to notify */
  minSeverityToNotify: ConflictSeverity;
  /** Auto-comment on PRs */
  autoCommentEnabled: boolean;
  /** Slack webhook for notifications */
  slackWebhook?: string;
  /** Files to always flag as high-risk */
  highRiskFiles: string[];
  /** Files to ignore */
  ignoreFiles: string[];
}
