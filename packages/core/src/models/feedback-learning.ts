/**
 * @fileoverview Types for Incremental Learning from Feedback
 */

import { z } from 'zod';

export const FeedbackActionSchema = z.enum(['accepted', 'dismissed', 'false_positive', 'modified']);
export type FeedbackAction = z.infer<typeof FeedbackActionSchema>;

export interface ReviewFeedbackEvent {
  id: string;
  organizationId: string;
  repositoryId: string;
  workflowId: string;
  commentId: string;
  rule: string;
  category: string;
  severity: string;
  action: FeedbackAction;
  fileType: string;
  language: string;
  timestamp: Date;
}

export interface RuleConfidenceScore {
  rule: string;
  category: string;
  organizationId: string;
  totalFeedback: number;
  acceptedCount: number;
  dismissedCount: number;
  falsePositiveCount: number;
  confidenceScore: number;
  lastUpdated: Date;
}

export interface FeedbackLearningStats {
  organizationId: string;
  totalFeedback: number;
  byAction: Record<FeedbackAction, number>;
  acceptanceRate: number;
  falsePositiveRate: number;
  topDismissedRules: Array<{ rule: string; dismissals: number }>;
  topAcceptedRules: Array<{ rule: string; acceptances: number }>;
  improvementOverTime: Array<{ period: string; acceptanceRate: number }>;
}

export interface AdaptiveReviewConfig {
  organizationId: string;
  suppressedRules: string[];
  boostedRules: string[];
  adjustedSeverities: Record<string, string>;
  lastCalibrated: Date;
}
