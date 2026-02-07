/**
 * @fileoverview Review Quality Calibration Models
 *
 * Types for post-merge outcome tracking, review accuracy
 * calibration, confidence scoring, and accuracy reporting.
 *
 * @module models/review-calibration
 */

// ============================================
// Outcome Tracking Types
// ============================================

/**
 * Post-merge outcome type
 */
export type PostMergeOutcomeType = 'none' | 'bug_report' | 'revert' | 'hotfix' | 'incident' | 'security_vulnerability' | 'performance_regression';

/**
 * Post-merge outcome record
 */
export interface PostMergeOutcome {
  /** Outcome ID */
  id: string;
  /** Merged PR number */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Workflow ID */
  workflowId: string;
  /** Outcome type */
  outcomeType: PostMergeOutcomeType;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Description */
  description: string;
  /** Related issue/PR numbers */
  relatedIssues: number[];
  /** Detected at */
  detectedAt: Date;
  /** Merged at */
  mergedAt: Date;
  /** Time to detection (hours) */
  timeToDetectionHours: number;
  /** Root cause file */
  rootCauseFile?: string;
  /** Root cause line */
  rootCauseLine?: number;
}

/**
 * Association between a review suggestion and an outcome
 */
export interface SuggestionOutcomeLink {
  /** Link ID */
  id: string;
  /** Review comment ID */
  reviewCommentId: string;
  /** Outcome ID */
  outcomeId: string;
  /** Was the suggestion relevant to the outcome? */
  relevant: boolean;
  /** Was the suggestion dismissed by the developer? */
  wasDismissed: boolean;
  /** Would following the suggestion have prevented the outcome? */
  wouldHavePrevented: boolean;
  /** Attribution confidence */
  attributionConfidence: number;
}

// ============================================
// Calibration Types
// ============================================

/**
 * Calibration profile for a pattern type
 */
export interface CalibrationProfile {
  /** Profile ID */
  id: string;
  /** Repository (or null for global) */
  repositoryId?: string;
  /** Pattern type (e.g., 'sql_injection', 'null_pointer', 'missing_tests') */
  patternType: string;
  /** Category */
  category: string;
  /** Current sensitivity (0-1, higher = more sensitive) */
  sensitivity: number;
  /** Base false positive rate */
  baseFalsePositiveRate: number;
  /** Calibrated false positive rate */
  calibratedFalsePositiveRate: number;
  /** Total observations */
  totalObservations: number;
  /** True positives */
  truePositives: number;
  /** False positives */
  falsePositives: number;
  /** True negatives */
  trueNegatives: number;
  /** False negatives */
  falseNegatives: number;
  /** Last calibrated at */
  lastCalibratedAt: Date;
  /** Confidence decay factor */
  confidenceDecayDays: number;
}

/**
 * Calibration adjustment record
 */
export interface CalibrationAdjustment {
  /** Adjustment ID */
  id: string;
  /** Profile ID */
  profileId: string;
  /** Previous sensitivity */
  previousSensitivity: number;
  /** New sensitivity */
  newSensitivity: number;
  /** Reason */
  reason: string;
  /** Evidence count */
  evidenceCount: number;
  /** Adjusted at */
  adjustedAt: Date;
}

// ============================================
// Confidence Scoring Types
// ============================================

/**
 * Confidence score for a review comment
 */
export interface ReviewConfidenceScore {
  /** Comment ID */
  commentId: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Pattern type */
  patternType: string;
  /** Evidence basis */
  evidenceBasis: {
    /** Similar patterns observed */
    similarPatternsObserved: number;
    /** Historical accuracy for this pattern */
    historicalAccuracy: number;
    /** Code context quality */
    codeContextQuality: number;
    /** LLM confidence */
    llmConfidence: number;
  };
  /** Display text */
  displayText: string;
}

// ============================================
// Accuracy Report Types
// ============================================

/**
 * Accuracy report for a period
 */
export interface AccuracyReport {
  /** Report ID */
  id: string;
  /** Repository (or org-wide) */
  repositoryId?: string;
  /** Period */
  period: { start: Date; end: Date };
  /** Overall accuracy */
  overallAccuracy: number;
  /** Overall precision */
  precision: number;
  /** Overall recall */
  recall: number;
  /** F1 score */
  f1Score: number;
  /** Accuracy by category */
  byCategory: Record<string, CategoryAccuracy>;
  /** Accuracy trend (vs previous period) */
  trend: 'improving' | 'stable' | 'declining';
  /** Trend detail */
  trendDetail: {
    accuracyChange: number;
    falsePositiveRateChange: number;
    falseNegativeRateChange: number;
  };
  /** Top false positive patterns */
  topFalsePositives: Array<{ pattern: string; count: number; rate: number }>;
  /** Missed issues (false negatives) */
  missedIssues: Array<{ pattern: string; count: number; severity: string }>;
  /** Recommendations */
  recommendations: string[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * Category-level accuracy
 */
export interface CategoryAccuracy {
  /** Category name */
  category: string;
  /** Precision */
  precision: number;
  /** Recall */
  recall: number;
  /** F1 score */
  f1Score: number;
  /** Total suggestions */
  totalSuggestions: number;
  /** Accepted */
  accepted: number;
  /** Dismissed */
  dismissed: number;
  /** Led to outcome */
  ledToOutcome: number;
}
