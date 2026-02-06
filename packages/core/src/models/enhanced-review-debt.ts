/**
 * @fileoverview Enhanced Review Debt Dashboard Models
 *
 * Additional types for reviewer burnout tracking, stale PR detection,
 * blocked work analysis, and sprint planning integration.
 *
 * @module models/enhanced-review-debt
 */

// ============================================
// Stale PR Tracking
// ============================================

/**
 * A stale PR in the review queue
 */
export interface StalePR {
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** PR title */
  title: string;
  /** Author */
  author: string;
  /** Days since opened */
  ageInDays: number;
  /** Days since last activity */
  daysSinceActivity: number;
  /** Current status */
  status: StalePRStatus;
  /** Stale reason */
  reason: StaleReason;
  /** Assigned reviewers */
  assignedReviewers: string[];
  /** Pending reviewers (haven't responded) */
  pendingReviewers: string[];
  /** Blocking other work */
  blockedItems: BlockedItem[];
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Recommended action */
  recommendedAction: RecommendedAction;
  /** Estimated cost of delay (story points/hours) */
  delayImpact: {
    blockedStoryPoints: number;
    blockedDevelopers: number;
    estimatedRevenueLoss?: number;
  };
  /** Created at */
  createdAt: Date;
  /** Last activity at */
  lastActivityAt: Date;
}

/**
 * Stale PR status
 */
export type StalePRStatus =
  | 'waiting_for_review'
  | 'changes_requested'
  | 'waiting_for_author'
  | 'merge_conflict'
  | 'ci_failing'
  | 'blocked_by_dependency'
  | 'abandoned';

/**
 * Reason for staleness
 */
export type StaleReason =
  | 'no_reviewer_assigned'
  | 'reviewer_overloaded'
  | 'reviewer_unavailable'
  | 'author_not_responding'
  | 'unclear_requirements'
  | 'technical_disagreement'
  | 'waiting_for_dependency'
  | 'low_priority'
  | 'forgotten';

/**
 * An item blocked by a stale PR
 */
export interface BlockedItem {
  /** Item type */
  type: 'pr' | 'issue' | 'feature' | 'release';
  /** Item ID/number */
  id: string;
  /** Description */
  description: string;
  /** Owner/assignee */
  owner: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Days blocked */
  daysBlocked: number;
}

/**
 * Recommended action for stale PR
 */
export interface RecommendedAction {
  /** Action type */
  action: 'reassign_reviewer' | 'ping_reviewer' | 'ping_author' | 'split_pr' | 'close_pr' | 'escalate' | 'schedule_pairing';
  /** Action description */
  description: string;
  /** Suggested assignee */
  suggestedAssignee?: string;
  /** Priority */
  urgency: 'low' | 'medium' | 'high' | 'immediate';
}

// ============================================
// Reviewer Burnout Tracking
// ============================================

/**
 * Reviewer workload and burnout metrics
 */
export interface ReviewerMetrics {
  /** Reviewer login */
  login: string;
  /** Display name */
  displayName: string;
  /** Team */
  team?: string;
  /** Workload metrics */
  workload: WorkloadMetrics;
  /** Health indicators */
  health: ReviewerHealth;
  /** Historical trends */
  trends: ReviewerTrends;
  /** Current assignments */
  currentAssignments: ReviewAssignment[];
  /** Recommendations */
  recommendations: string[];
  /** Last updated */
  lastUpdatedAt: Date;
}

/**
 * Workload metrics
 */
export interface WorkloadMetrics {
  /** PRs currently assigned */
  assignedPRs: number;
  /** PRs reviewed this week */
  reviewedThisWeek: number;
  /** PRs reviewed this month */
  reviewedThisMonth: number;
  /** Average reviews per week */
  avgReviewsPerWeek: number;
  /** Average time to first review (hours) */
  avgTimeToFirstReview: number;
  /** Average review cycles per PR */
  avgCyclesPerPR: number;
  /** Comments per review */
  avgCommentsPerReview: number;
  /** Lines reviewed this week */
  linesReviewedThisWeek: number;
  /** Hours spent on reviews (estimated) */
  estimatedHoursThisWeek: number;
}

/**
 * Reviewer health indicators
 */
export interface ReviewerHealth {
  /** Overall health score (0-100) */
  score: number;
  /** Burnout risk */
  burnoutRisk: 'low' | 'moderate' | 'high' | 'critical';
  /** Workload status */
  workloadStatus: 'underutilized' | 'optimal' | 'high' | 'overloaded';
  /** Warning indicators */
  warnings: HealthWarning[];
  /** Positive indicators */
  strengths: string[];
}

/**
 * Health warning
 */
export interface HealthWarning {
  /** Warning type */
  type: 'high_workload' | 'review_quality_decline' | 'response_time_increase' | 'overtime' | 'stale_reviews';
  /** Severity */
  severity: 'info' | 'warning' | 'alert';
  /** Message */
  message: string;
  /** Metric that triggered the warning */
  metric: string;
  /** Current value */
  currentValue: number;
  /** Threshold */
  threshold: number;
}

/**
 * Reviewer trends
 */
export interface ReviewerTrends {
  /** Trend period */
  period: 'week' | 'month';
  /** Workload trend */
  workloadTrend: 'decreasing' | 'stable' | 'increasing';
  /** Quality trend */
  qualityTrend: 'declining' | 'stable' | 'improving';
  /** Response time trend */
  responseTimeTrend: 'improving' | 'stable' | 'degrading';
  /** Data points */
  dataPoints: Array<{
    date: Date;
    reviewCount: number;
    avgResponseHours: number;
    healthScore: number;
  }>;
}

/**
 * Current review assignment
 */
export interface ReviewAssignment {
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: string;
  /** Title */
  title: string;
  /** Author */
  author: string;
  /** Assigned date */
  assignedAt: Date;
  /** Days waiting */
  daysWaiting: number;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Status */
  status: 'pending' | 'in_progress' | 'changes_requested' | 'approved';
}

// ============================================
// Team Debt Overview
// ============================================

/**
 * Team-level review debt dashboard
 */
export interface TeamDebtDashboard {
  /** Team ID */
  teamId: string;
  /** Team name */
  teamName: string;
  /** Dashboard period */
  period: {
    start: Date;
    end: Date;
  };
  /** Stale PRs summary */
  stalePRs: {
    total: number;
    critical: number;
    blocking: number;
    oldest: StalePR | null;
    byReason: Record<string, number>;
  };
  /** Review debt summary */
  reviewDebt: {
    totalItems: number;
    criticalItems: number;
    estimatedHoursToResolve: number;
    healthScore: number;
    trend: 'improving' | 'stable' | 'degrading';
  };
  /** Reviewer health summary */
  reviewerHealth: {
    totalReviewers: number;
    overloadedReviewers: number;
    atRiskReviewers: number;
    avgHealthScore: number;
    topContributors: Array<{ login: string; reviewCount: number }>;
    needsAttention: Array<{ login: string; reason: string }>;
  };
  /** Blocked work summary */
  blockedWork: {
    totalBlockedItems: number;
    totalBlockedDays: number;
    estimatedImpact: {
      storyPoints: number;
      developers: number;
    };
    criticalBlocked: BlockedItem[];
  };
  /** Recommendations */
  recommendations: TeamRecommendation[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * Team recommendation
 */
export interface TeamRecommendation {
  /** Recommendation ID */
  id: string;
  /** Category */
  category: 'process' | 'workload' | 'quality' | 'tooling';
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Actions */
  actions: string[];
  /** Expected impact */
  expectedImpact: string;
  /** Effort required */
  effort: 'trivial' | 'small' | 'medium' | 'large';
}

// ============================================
// Sprint Integration
// ============================================

/**
 * Debt items for sprint planning
 */
export interface SprintDebtPlanning {
  /** Sprint ID */
  sprintId: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** Suggested debt items to include */
  suggestedItems: Array<{
    item: string; // Debt item ID
    title: string;
    category: string;
    priority: number;
    estimatedHours: number;
    reason: string;
  }>;
  /** Total suggested hours */
  totalSuggestedHours: number;
  /** Recommended debt budget (% of sprint capacity) */
  recommendedDebtBudget: number;
  /** Current debt health score */
  currentHealthScore: number;
  /** Projected health score if completed */
  projectedHealthScore: number;
  /** Quick wins (< 2 hours each) */
  quickWins: string[];
  /** High impact items */
  highImpact: string[];
}

// ============================================
// Notification & Alert Types
// ============================================

/**
 * Review debt alert
 */
export interface DebtAlert {
  /** Alert ID */
  id: string;
  /** Alert type */
  type: DebtAlertType;
  /** Severity */
  severity: 'info' | 'warning' | 'critical';
  /** Title */
  title: string;
  /** Message */
  message: string;
  /** Related entities */
  related: {
    prNumbers?: number[];
    reviewers?: string[];
    debtItemIds?: string[];
  };
  /** Actions */
  actions: Array<{
    label: string;
    action: string;
    payload: Record<string, unknown>;
  }>;
  /** Created at */
  createdAt: Date;
  /** Acknowledged */
  acknowledged: boolean;
  /** Acknowledged by */
  acknowledgedBy?: string;
}

/**
 * Alert types
 */
export type DebtAlertType =
  | 'reviewer_overloaded'
  | 'pr_stale_critical'
  | 'debt_threshold_exceeded'
  | 'burnout_risk'
  | 'blocked_release'
  | 'review_velocity_drop'
  | 'quality_decline';

// ============================================
// API Request/Response Types
// ============================================

/**
 * Get dashboard request
 */
export interface GetDebtDashboardRequest {
  /** Repository or team ID */
  repositoryId?: string;
  teamId?: string;
  /** Time period */
  period?: 'week' | 'month' | 'quarter';
  /** Include details */
  includeStaleRPs?: boolean;
  includeReviewerMetrics?: boolean;
  includeRecommendations?: boolean;
}

/**
 * Get reviewer metrics request
 */
export interface GetReviewerMetricsRequest {
  /** Reviewer login */
  login: string;
  /** Repository filter */
  repositoryId?: string;
  /** Time period */
  period?: 'week' | 'month' | 'quarter';
}

/**
 * Rebalance workload request
 */
export interface RebalanceWorkloadRequest {
  /** Team ID */
  teamId: string;
  /** Reviewers to consider */
  reviewers?: string[];
  /** Strategy */
  strategy: 'even' | 'by_expertise' | 'by_availability';
  /** Dry run */
  dryRun?: boolean;
}

/**
 * Rebalance result
 */
export interface RebalanceResult {
  /** Reassignments */
  reassignments: Array<{
    prNumber: number;
    fromReviewer: string;
    toReviewer: string;
    reason: string;
  }>;
  /** Before metrics */
  before: {
    avgWorkload: number;
    maxWorkload: number;
    variance: number;
  };
  /** After metrics (projected) */
  after: {
    avgWorkload: number;
    maxWorkload: number;
    variance: number;
  };
  /** Applied */
  applied: boolean;
}
