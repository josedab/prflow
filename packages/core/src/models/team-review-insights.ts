/**
 * @fileoverview Types for Team Review Insights Dashboard
 *
 * Review quality metrics, team load, rule effectiveness, and ROI tracking.
 */

export interface ReviewQualityMetrics {
  organizationId: string;
  period: { start: Date; end: Date };
  falsePositiveRate: number;
  precision: number;
  recall: number;
  averageSeverityAccuracy: number;
  totalReviews: number;
  totalComments: number;
  acceptedComments: number;
  dismissedComments: number;
}

export interface ReviewerLoadMetrics {
  reviewerId: string;
  reviewerName: string;
  assignedReviews: number;
  completedReviews: number;
  averageResponseTimeHours: number;
  averageReviewDurationMinutes: number;
  pendingReviews: number;
  loadScore: number;
}

export interface TeamLoadSnapshot {
  organizationId: string;
  timestamp: Date;
  reviewers: ReviewerLoadMetrics[];
  totalPendingReviews: number;
  averageQueueDepth: number;
  bottleneckReviewers: string[];
}

export interface InsightRuleEffectiveness {
  rule: string;
  category: string;
  totalTriggered: number;
  acceptedCount: number;
  dismissedCount: number;
  falsePositiveCount: number;
  effectivenessScore: number;
  trend: 'improving' | 'stable' | 'declining';
  trendDelta: number;
}

export interface ROIMetrics {
  organizationId: string;
  period: { start: Date; end: Date };
  reviewsAutomated: number;
  estimatedHoursSaved: number;
  bugsDetectedPreMerge: number;
  securityIssuesCaught: number;
  averagePRCycleTimeReduction: number;
  costPerReview: number;
  monthlyROIMultiplier: number;
}

export interface TeamReviewInsightsDashboard {
  organizationId: string;
  generatedAt: Date;
  quality: ReviewQualityMetrics;
  teamLoad: TeamLoadSnapshot;
  ruleEffectiveness: InsightRuleEffectiveness[];
  roi: ROIMetrics;
  alerts: InsightAlert[];
}

export interface InsightAlert {
  id: string;
  type: 'backlog_spike' | 'quality_drop' | 'reviewer_overload' | 'rule_degradation';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metric: string;
  currentValue: number;
  threshold: number;
  timestamp: Date;
}

export interface InsightReviewEvent {
  id: string;
  type: 'created' | 'commented' | 'approved' | 'dismissed' | 'merged' | 'closed';
  repositoryId: string;
  organizationId: string;
  pullRequestNumber: number;
  reviewerId?: string;
  timestamp: Date;
  metadata: Record<string, unknown>;
}
