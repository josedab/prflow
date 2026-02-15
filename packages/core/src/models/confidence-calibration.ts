/**
 * @fileoverview Types for AI Review Confidence Calibration
 *
 * Statistical calibration comparing AI predictions to actual outcomes,
 * using Platt scaling and isotonic regression.
 */

export interface PredictionOutcome {
  id: string;
  workflowId: string;
  repositoryId: string;
  organizationId: string;
  rule: string;
  severity: string;
  predictedConfidence: number;
  actualOutcome: 'true_positive' | 'false_positive' | 'true_negative' | 'false_negative';
  outcomeSource: 'feedback' | 'revert' | 'incident' | 'hotfix';
  predictedAt: Date;
  resolvedAt: Date;
}

export interface CalibrationBin {
  binStart: number;
  binEnd: number;
  meanPredicted: number;
  meanActual: number;
  count: number;
  gap: number;
}

export interface CalibrationCurve {
  bins: CalibrationBin[];
  expectedCalibrationError: number;
  maxCalibrationError: number;
  brierScore: number;
  totalSamples: number;
}

export interface PlattScalingParams {
  a: number;
  b: number;
  fittedAt: Date;
  sampleCount: number;
}

export interface CalibrationReport {
  organizationId: string;
  generatedAt: Date;
  overall: CalibrationCurve;
  bySeverity: Record<string, CalibrationCurve>;
  byCategory: Record<string, CalibrationCurve>;
  plattParams: PlattScalingParams;
  recommendations: CalibrationRecommendation[];
}

export interface CalibrationRecommendation {
  type: 'increase_threshold' | 'decrease_threshold' | 'retrain' | 'suppress_rule';
  rule: string;
  currentThreshold: number;
  suggestedThreshold: number;
  reason: string;
  expectedImpact: string;
}

export interface ConfidenceBadge {
  label: string;
  color: 'green' | 'yellow' | 'orange' | 'red';
  accuracy: number;
  sampleSize: number;
  tooltip: string;
}

export interface OutcomeTracker {
  prNumber: number;
  repositoryId: string;
  mergedAt: Date;
  revertedWithin7d: boolean;
  incidentWithin7d: boolean;
  hotfixWithin7d: boolean;
  predictions: Array<{
    rule: string;
    severity: string;
    confidence: number;
  }>;
}
