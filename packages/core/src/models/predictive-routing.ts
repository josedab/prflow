/**
 * @fileoverview Predictive Review Routing Models
 *
 * Types for ML-based reviewer assignment, load balancing,
 * capacity tracking, and routing optimization.
 *
 * @module models/predictive-routing
 */

// ============================================
// Routing Types
// ============================================

/**
 * A routing decision for a PR
 */
export interface RoutingDecision {
  /** Decision ID */
  id: string;
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Ranked candidate reviewers */
  candidates: RoutingCandidate[];
  /** Selected reviewers */
  selectedReviewers: SelectedReviewer[];
  /** Routing strategy used */
  strategy: RoutingStrategy;
  /** Model version */
  modelVersion: string;
  /** Decision timestamp */
  decidedAt: Date;
  /** Confidence in the decision */
  confidence: number;
}

/**
 * Routing strategy
 */
export type RoutingStrategy = 'ml_predicted' | 'load_balanced' | 'expertise_match' | 'round_robin' | 'hybrid' | 'fallback_heuristic';

/**
 * A candidate reviewer with scoring
 */
export interface RoutingCandidate {
  /** Reviewer login */
  login: string;
  /** Display name */
  displayName: string;
  /** Overall routing score (0-100) */
  overallScore: number;
  /** Individual factor scores */
  factors: RoutingFactors;
  /** Predicted outcomes */
  predictions: RoutingPredictions;
  /** Current capacity info */
  capacity: ReviewerCapacity;
  /** Recommendation */
  recommendation: 'assign' | 'consider' | 'skip';
  /** Reason for recommendation */
  reason: string;
}

/**
 * Scoring factors for routing
 */
export interface RoutingFactors {
  /** Expertise match (0-100) */
  expertiseMatch: number;
  /** Workload availability (0-100) */
  availability: number;
  /** Historical review quality (0-100) */
  reviewQuality: number;
  /** Code familiarity (0-100) */
  codeFamiliarity: number;
  /** Response time score (0-100, higher = faster) */
  responseTime: number;
  /** Fairness/load balance score (0-100) */
  fairness: number;
}

/**
 * Predicted outcomes if reviewer is assigned
 */
export interface RoutingPredictions {
  /** Predicted time to first review (hours) */
  predictedTimeToReviewHours: number;
  /** Predicted review thoroughness (0-100) */
  predictedThoroughness: number;
  /** Predicted approval likelihood (0-1) */
  predictedApprovalLikelihood: number;
  /** Predicted number of review cycles */
  predictedReviewCycles: number;
}

// ============================================
// Capacity Types
// ============================================

/**
 * A reviewer's current capacity
 */
export interface ReviewerCapacity {
  /** Reviewer login */
  login: string;
  /** Current pending reviews */
  pendingReviews: number;
  /** Maximum concurrent reviews (preference) */
  maxConcurrentReviews: number;
  /** Utilization percentage */
  utilization: number;
  /** Available slots */
  availableSlots: number;
  /** Focus time status */
  focusTimeStatus: 'available' | 'in_focus_time' | 'in_meeting' | 'offline';
  /** Estimated next available time */
  nextAvailableAt?: Date;
  /** Out of office */
  outOfOffice: boolean;
  /** Out of office until */
  outOfOfficeUntil?: Date;
  /** Recent review load (reviews/day last 7 days) */
  recentReviewLoad: number;
}

/**
 * Team load distribution
 */
export interface TeamLoadDistribution {
  /** Team ID */
  teamId: string;
  /** Period */
  period: { start: Date; end: Date };
  /** Member loads */
  members: Array<{
    login: string;
    reviewsAssigned: number;
    reviewsCompleted: number;
    avgResponseHours: number;
    utilization: number;
  }>;
  /** Load variance (lower = more balanced) */
  loadVariance: number;
  /** Gini coefficient (0 = perfect equality) */
  giniCoefficient: number;
  /** Bottlenecks */
  bottlenecks: string[];
  /** Recommendations */
  recommendations: string[];
}

// ============================================
// Model Types
// ============================================

/**
 * Feature vector for the routing model
 */
export interface RoutingFeatureVector {
  /** PR features */
  prFeatures: {
    filesChanged: number;
    linesChanged: number;
    complexity: number;
    riskLevel: number;
    domains: string[];
    languages: string[];
    hasTests: boolean;
    hasMigrations: boolean;
  };
  /** Reviewer features */
  reviewerFeatures: {
    domainExpertise: number;
    languageExpertise: number;
    recentActivity: number;
    avgReviewTime: number;
    pendingReviews: number;
    historicalAcceptRate: number;
    codeOwnership: number;
  };
  /** Context features */
  contextFeatures: {
    dayOfWeek: number;
    hourOfDay: number;
    prAge: number;
    teamSize: number;
    urgency: number;
  };
}

/**
 * Routing model performance metrics
 */
export interface RoutingModelMetrics {
  /** Model version */
  modelVersion: string;
  /** Accuracy of time-to-review prediction */
  timeToReviewMAE: number;
  /** Accuracy of review quality prediction */
  qualityPredictionAccuracy: number;
  /** Reviewer acceptance rate for assignments */
  assignmentAcceptanceRate: number;
  /** Average time-to-review improvement */
  avgTimeToReviewImprovement: number;
  /** Load balance improvement */
  loadBalanceImprovement: number;
  /** Training samples */
  trainingSamples: number;
  /** Last trained at */
  lastTrainedAt: Date;
}

/**
 * Selected reviewer with assignment metadata
 */
export interface SelectedReviewer {
  /** Reviewer login */
  login: string;
  /** Required or optional */
  required: boolean;
  /** Role */
  role: 'primary' | 'secondary' | 'domain_expert' | 'security_reviewer';
  /** Routing score */
  score: number;
  /** Reason for selection */
  reason: string;
}
