/**
 * @fileoverview Predictive PR Health Score Models
 *
 * Types for ML-powered PR merge prediction, health scoring,
 * blocker detection, and proactive recommendations.
 *
 * @module models/predictive-pr-health
 */

// ============================================
// Health Score Types
// ============================================

/**
 * Comprehensive PR health score
 */
export interface ComprehensivePRHealthScore {
  /** Workflow ID */
  workflowId: string;
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** Overall health score (0-100) */
  overallScore: number;
  /** Health grade */
  grade: HealthGrade;
  /** Individual factor scores */
  factors: HealthFactors;
  /** Detailed breakdown */
  breakdown: HealthBreakdown;
  /** Predictions */
  predictions: PRPredictions;
  /** Risk indicators */
  risks: RiskIndicator[];
  /** Recommendations */
  recommendations: HealthRecommendation[];
  /** Historical comparison */
  comparison: HistoricalComparison;
  /** Confidence level */
  confidence: number;
  /** Calculated at */
  calculatedAt: Date;
  /** Valid until */
  validUntil: Date;
}

/**
 * Health grade
 */
export type HealthGrade = 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Health factors with individual scores (0-100)
 */
export interface HealthFactors {
  /** Size factor - smaller is better */
  size: number;
  /** Complexity factor */
  complexity: number;
  /** Risk factor */
  risk: number;
  /** Test coverage factor */
  testCoverage: number;
  /** Documentation quality */
  documentation: number;
  /** Review readiness */
  reviewReadiness: number;
  /** Author track record */
  authorHistory: number;
  /** Timing factor */
  timing: number;
}

/**
 * Detailed health breakdown
 */
export interface HealthBreakdown {
  /** Size metrics */
  size: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    totalChanges: number;
    score: number;
    assessment: 'excellent' | 'good' | 'moderate' | 'large' | 'too_large';
  };
  /** Complexity metrics */
  complexity: {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    nestingDepth: number;
    functionsModified: number;
    score: number;
    assessment: 'simple' | 'moderate' | 'complex' | 'very_complex';
  };
  /** Quality metrics */
  quality: {
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    autoFixable: number;
    score: number;
    assessment: 'clean' | 'minor_issues' | 'needs_attention' | 'problematic';
  };
  /** Test metrics */
  testing: {
    hasNewTests: boolean;
    testFilesAdded: number;
    estimatedCoverageChange: number;
    untestedCodePaths: number;
    score: number;
    assessment: 'excellent' | 'good' | 'needs_tests' | 'no_tests';
  };
  /** Documentation metrics */
  documentation: {
    hasDescription: boolean;
    descriptionQuality: 'excellent' | 'good' | 'minimal' | 'poor' | 'none';
    hasLinkedIssues: boolean;
    hasChangelog: boolean;
    publicApiDocumented: boolean;
    score: number;
  };
  /** Review metrics */
  review: {
    suggestedReviewers: number;
    availableReviewers: number;
    expertiseMatch: number;
    previousReviewHistory: number;
    score: number;
  };
}

// ============================================
// Prediction Types
// ============================================

/**
 * PR predictions
 */
export interface PRPredictions {
  /** Merge prediction */
  merge: MergePrediction;
  /** Review prediction */
  review: ReviewPrediction;
  /** Blocker prediction */
  blockers: BlockerPrediction;
  /** CI prediction */
  ci: CIPrediction;
}

/**
 * Merge prediction
 */
export interface MergePrediction {
  /** Probability of successful merge (0-1) */
  probability: number;
  /** Predicted time to merge (hours) */
  timeToMergeHours: number;
  /** Confidence interval */
  confidenceInterval: {
    lower: number;
    upper: number;
  };
  /** Predicted merge date */
  predictedMergeDate: Date | null;
  /** Factors affecting merge */
  factors: Array<{
    name: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
    description: string;
  }>;
}

/**
 * Review prediction
 */
export interface ReviewPrediction {
  /** Expected time to first review (hours) */
  timeToFirstReviewHours: number;
  /** Expected review cycles */
  expectedCycles: number;
  /** Optimal review time */
  optimalReviewTime: string;
  /** Likely reviewers */
  likelyReviewers: Array<{
    login: string;
    probability: number;
    availableIn: string;
  }>;
}

/**
 * Blocker prediction
 */
export interface BlockerPrediction {
  /** Overall blocker probability */
  probability: number;
  /** Predicted blockers */
  blockers: PredictedBlocker[];
  /** Total severity score */
  severityScore: number;
}

/**
 * A predicted blocker
 */
export interface PredictedBlocker {
  /** Blocker type */
  type: BlockerType;
  /** Probability */
  probability: number;
  /** Description */
  description: string;
  /** Severity */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** Mitigation */
  mitigation: string;
  /** Estimated delay (hours) */
  estimatedDelayHours: number;
}

/**
 * Blocker types
 */
export type BlockerType =
  | 'critical_issue'
  | 'security_vulnerability'
  | 'failing_tests'
  | 'merge_conflict'
  | 'reviewer_unavailable'
  | 'missing_approval'
  | 'branch_protection'
  | 'size_too_large'
  | 'dependencies_outdated'
  | 'breaking_change'
  | 'insufficient_coverage'
  | 'documentation_missing';

/**
 * CI prediction
 */
export interface CIPrediction {
  /** Probability of CI success */
  successProbability: number;
  /** Predicted failures */
  predictedFailures: Array<{
    type: 'build' | 'test' | 'lint' | 'security' | 'coverage';
    probability: number;
    reason: string;
  }>;
  /** Expected CI duration (minutes) */
  expectedDurationMinutes: number;
}

// ============================================
// Risk Types
// ============================================

/**
 * Risk indicator
 */
export interface RiskIndicator {
  /** Risk ID */
  id: string;
  /** Risk type */
  type: RiskType;
  /** Risk level */
  level: 'critical' | 'high' | 'medium' | 'low';
  /** Description */
  description: string;
  /** Affected files */
  affectedFiles?: string[];
  /** Impact score */
  impactScore: number;
  /** Mitigation suggestions */
  mitigations: string[];
}

/**
 * Risk types
 */
export type RiskType =
  | 'security'
  | 'performance'
  | 'stability'
  | 'maintainability'
  | 'compatibility'
  | 'data_integrity'
  | 'scalability'
  | 'operational';

// ============================================
// Recommendation Types
// ============================================

/**
 * Health recommendation
 */
export interface HealthRecommendation {
  /** Recommendation ID */
  id: string;
  /** Category */
  category: RecommendationCategory;
  /** Priority */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Action items */
  actions: string[];
  /** Estimated improvement */
  estimatedImprovement: {
    healthScore: number;
    mergeTime: number; // hours reduction
  };
  /** Effort required */
  effort: 'trivial' | 'small' | 'medium' | 'large';
}

/**
 * Recommendation categories
 */
export type RecommendationCategory =
  | 'split_pr'
  | 'add_tests'
  | 'improve_description'
  | 'address_issues'
  | 'reduce_complexity'
  | 'improve_timing'
  | 'request_reviewers'
  | 'update_dependencies'
  | 'add_documentation';

// ============================================
// Historical Comparison
// ============================================

/**
 * Historical comparison data
 */
export interface HistoricalComparison {
  /** Author's average health score */
  authorAvgScore: number;
  /** Author's percentile */
  authorPercentile: number;
  /** Repository average health score */
  repoAvgScore: number;
  /** Repository percentile */
  repoPercentile: number;
  /** Trend over author's recent PRs */
  authorTrend: 'improving' | 'stable' | 'declining';
  /** Similar PR comparison */
  similarPRs: {
    avgMergeTimeHours: number;
    avgCycles: number;
    avgScore: number;
  };
}

// ============================================
// Team Health Metrics
// ============================================

/**
 * Team health dashboard metrics
 */
export interface TeamHealthDashboard {
  /** Team ID */
  teamId: string;
  /** Repository ID */
  repositoryId: string;
  /** Time period */
  period: {
    start: Date;
    end: Date;
  };
  /** Overview metrics */
  overview: {
    avgHealthScore: number;
    healthScoreTrend: 'improving' | 'stable' | 'declining';
    totalPRs: number;
    mergedPRs: number;
    mergeRate: number;
    avgMergeTimeHours: number;
    avgReviewCycles: number;
  };
  /** PR distribution by health grade */
  gradeDistribution: Record<HealthGrade, number>;
  /** Common issues */
  commonIssues: Array<{
    type: string;
    count: number;
    trend: 'increasing' | 'stable' | 'decreasing';
  }>;
  /** Top performers */
  topPerformers: Array<{
    login: string;
    avgHealthScore: number;
    prCount: number;
  }>;
  /** Bottleneck analysis */
  bottlenecks: Array<{
    area: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    impact: string;
    recommendation: string;
  }>;
  /** Trends */
  trends: {
    healthScore: HealthTrendData[];
    mergeTime: HealthTrendData[];
    issueCount: HealthTrendData[];
  };
}

/**
 * Trend data point
 */
export interface HealthTrendData {
  /** Date */
  date: Date;
  /** Value */
  value: number;
}

// ============================================
// Model Training Types
// ============================================

/**
 * Model configuration
 */
export interface PredictionModelConfig {
  /** Model ID */
  modelId: string;
  /** Model version */
  version: string;
  /** Repository ID (for repo-specific models) */
  repositoryId?: string;
  /** Model type */
  type: 'merge_time' | 'merge_probability' | 'blocker' | 'ci_success';
  /** Feature weights */
  weights: Record<string, number>;
  /** Training metadata */
  training: {
    trainedAt: Date;
    samplesUsed: number;
    r2Score: number;
    maeScore: number;
  };
  /** Enabled */
  enabled: boolean;
}

/**
 * Model performance metrics
 */
export interface ModelPerformance {
  /** Model ID */
  modelId: string;
  /** Accuracy metrics */
  accuracy: {
    mergeTimeMae: number; // Mean Absolute Error in hours
    mergeProbabilityAuc: number; // Area Under Curve
    blockerPrecision: number;
    blockerRecall: number;
  };
  /** Predictions made */
  predictionsCount: number;
  /** Feedback received */
  feedbackCount: number;
  /** Last evaluated */
  lastEvaluatedAt: Date;
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Get health score request
 */
export interface GetHealthScoreRequest {
  /** Workflow ID or PR identifier */
  workflowId?: string;
  owner?: string;
  repo?: string;
  prNumber?: number;
  /** Include predictions */
  includePredictions?: boolean;
  /** Include recommendations */
  includeRecommendations?: boolean;
}

/**
 * Get team health request
 */
export interface GetTeamHealthRequest {
  /** Repository identifier */
  owner: string;
  repo: string;
  /** Time period */
  startDate: Date;
  endDate: Date;
  /** Include trends */
  includeTrends?: boolean;
}

/**
 * Health score webhook payload
 */
export interface HealthScoreWebhook {
  /** Event type */
  event: 'health_score_calculated' | 'health_degraded' | 'blocker_predicted';
  /** PR info */
  pullRequest: {
    number: number;
    title: string;
    url: string;
  };
  /** Health score */
  healthScore: {
    overall: number;
    grade: HealthGrade;
    previousGrade?: HealthGrade;
  };
  /** Alert details (if applicable) */
  alert?: {
    type: string;
    message: string;
    severity: string;
  };
  /** Timestamp */
  timestamp: Date;
}
