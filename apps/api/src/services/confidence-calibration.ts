/**
 * @fileoverview AI Review Confidence Calibration Service
 *
 * Tracks prediction outcomes, applies Platt scaling for calibration,
 * generates calibration curves and confidence badges.
 */

import { logger } from '../lib/logger.js';
import type {
  PredictionOutcome,
  CalibrationBin,
  CalibrationCurve,
  CalibrationReport,
  PlattScalingParams,
  CalibrationRecommendation,
  ConfidenceBadge,
} from '@prflow/core';

export class ConfidenceCalibrationService {
  private outcomes: PredictionOutcome[] = [];
  private plattParams = new Map<string, PlattScalingParams>();

  recordOutcome(outcome: PredictionOutcome): void {
    this.outcomes.push(outcome);
    logger.debug(
      { rule: outcome.rule, outcome: outcome.actualOutcome },
      'Prediction outcome recorded'
    );
  }

  recordBatch(outcomes: PredictionOutcome[]): void {
    for (const o of outcomes) this.recordOutcome(o);
  }

  /**
   * Generate a calibration curve from outcomes using equal-width binning.
   */
  generateCalibrationCurve(
    organizationId: string,
    filter?: { severity?: string; category?: string }
  ): CalibrationCurve {
    let filtered = this.outcomes.filter((o) => o.organizationId === organizationId);
    if (filter?.severity) filtered = filtered.filter((o) => o.severity === filter.severity);
    if (filter?.category) filtered = filtered.filter((o) => o.rule.startsWith(filter.category!));

    const numBins = 10;
    const bins: CalibrationBin[] = [];

    for (let i = 0; i < numBins; i++) {
      const binStart = i / numBins;
      const binEnd = (i + 1) / numBins;
      const inBin = filtered.filter(
        (o) => o.predictedConfidence >= binStart && o.predictedConfidence < binEnd
      );

      if (inBin.length === 0) {
        bins.push({
          binStart,
          binEnd,
          meanPredicted: (binStart + binEnd) / 2,
          meanActual: 0,
          count: 0,
          gap: 0,
        });
        continue;
      }

      const meanPredicted = inBin.reduce((s, o) => s + o.predictedConfidence, 0) / inBin.length;
      const positives = inBin.filter((o) => o.actualOutcome === 'true_positive').length;
      const meanActual = positives / inBin.length;

      bins.push({
        binStart,
        binEnd,
        meanPredicted,
        meanActual,
        count: inBin.length,
        gap: Math.abs(meanActual - meanPredicted),
      });
    }

    const totalSamples = filtered.length || 1;
    const ece = bins.reduce((s, b) => s + (b.count / totalSamples) * b.gap, 0);
    const mce = Math.max(...bins.map((b) => b.gap), 0);

    // Brier score: mean squared error of probabilities
    const brierScore =
      filtered.length > 0
        ? filtered.reduce((s, o) => {
            const actual = o.actualOutcome === 'true_positive' ? 1 : 0;
            return s + Math.pow(o.predictedConfidence - actual, 2);
          }, 0) / filtered.length
        : 0;

    return {
      bins,
      expectedCalibrationError: ece,
      maxCalibrationError: mce,
      brierScore,
      totalSamples: filtered.length,
    };
  }

  /**
   * Fit Platt scaling parameters using logistic regression on outcomes.
   * Simplified: uses gradient descent on log-loss.
   */
  fitPlattScaling(organizationId: string): PlattScalingParams {
    const orgOutcomes = this.outcomes.filter((o) => o.organizationId === organizationId);
    if (orgOutcomes.length < 10) {
      const params: PlattScalingParams = {
        a: 1,
        b: 0,
        fittedAt: new Date(),
        sampleCount: orgOutcomes.length,
      };
      this.plattParams.set(organizationId, params);
      return params;
    }

    // Simple logistic calibration: P_calibrated = 1 / (1 + exp(a * f + b))
    let a = -1;
    let b = 0;
    const lr = 0.01;
    const iterations = 100;

    for (let iter = 0; iter < iterations; iter++) {
      let gradA = 0;
      let gradB = 0;

      for (const outcome of orgOutcomes) {
        const f = outcome.predictedConfidence;
        const y = outcome.actualOutcome === 'true_positive' ? 1 : 0;
        const p = 1 / (1 + Math.exp(a * f + b));
        const error = p - y;
        gradA += error * f;
        gradB += error;
      }

      a -= (lr * gradA) / orgOutcomes.length;
      b -= (lr * gradB) / orgOutcomes.length;
    }

    const params: PlattScalingParams = {
      a,
      b,
      fittedAt: new Date(),
      sampleCount: orgOutcomes.length,
    };
    this.plattParams.set(organizationId, params);
    logger.info({ organizationId, a, b, samples: orgOutcomes.length }, 'Platt scaling fitted');
    return params;
  }

  /**
   * Apply Platt scaling to calibrate a raw confidence score.
   */
  calibrate(organizationId: string, rawConfidence: number): number {
    const params = this.plattParams.get(organizationId);
    if (!params) return rawConfidence;
    return 1 / (1 + Math.exp(params.a * rawConfidence + params.b));
  }

  /**
   * Generate full calibration report for an org.
   */
  generateReport(organizationId: string): CalibrationReport {
    const overall = this.generateCalibrationCurve(organizationId);
    const plattParams = this.fitPlattScaling(organizationId);

    const orgOutcomes = this.outcomes.filter((o) => o.organizationId === organizationId);
    const severities = [...new Set(orgOutcomes.map((o) => o.severity))];
    const categories = [...new Set(orgOutcomes.map((o) => o.rule.split('/')[0]))];

    const bySeverity: Record<string, CalibrationCurve> = {};
    for (const sev of severities) {
      bySeverity[sev] = this.generateCalibrationCurve(organizationId, { severity: sev });
    }

    const byCategory: Record<string, CalibrationCurve> = {};
    for (const cat of categories) {
      byCategory[cat] = this.generateCalibrationCurve(organizationId, { category: cat });
    }

    const recommendations = this.generateRecommendations(organizationId, overall);

    return {
      organizationId,
      generatedAt: new Date(),
      overall,
      bySeverity,
      byCategory,
      plattParams,
      recommendations,
    };
  }

  private generateRecommendations(
    organizationId: string,
    curve: CalibrationCurve
  ): CalibrationRecommendation[] {
    const recommendations: CalibrationRecommendation[] = [];
    const orgOutcomes = this.outcomes.filter((o) => o.organizationId === organizationId);

    // Find rules with poor calibration
    const ruleMap = new Map<string, PredictionOutcome[]>();
    for (const o of orgOutcomes) {
      const arr = ruleMap.get(o.rule) || [];
      arr.push(o);
      ruleMap.set(o.rule, arr);
    }

    for (const [rule, outcomes] of ruleMap) {
      if (outcomes.length < 5) continue;
      const fpRate =
        outcomes.filter((o) => o.actualOutcome === 'false_positive').length / outcomes.length;

      if (fpRate > 0.5) {
        recommendations.push({
          type: 'suppress_rule',
          rule,
          currentThreshold: 0.5,
          suggestedThreshold: 0.8,
          reason: `Rule has ${(fpRate * 100).toFixed(0)}% false positive rate`,
          expectedImpact: `Reduces noise by ~${outcomes.filter((o) => o.actualOutcome === 'false_positive').length} false positives`,
        });
      } else if (fpRate > 0.3) {
        recommendations.push({
          type: 'increase_threshold',
          rule,
          currentThreshold: 0.5,
          suggestedThreshold: 0.7,
          reason: `Rule has ${(fpRate * 100).toFixed(0)}% false positive rate`,
          expectedImpact: 'Moderate noise reduction with minimal true positive loss',
        });
      }
    }

    if (curve.expectedCalibrationError > 0.15) {
      recommendations.push({
        type: 'retrain',
        rule: '*',
        currentThreshold: curve.expectedCalibrationError,
        suggestedThreshold: 0.05,
        reason: `Overall ECE of ${(curve.expectedCalibrationError * 100).toFixed(1)}% indicates poor calibration`,
        expectedImpact: 'Retraining with recent outcomes should improve calibration significantly',
      });
    }

    return recommendations;
  }

  /**
   * Get a confidence badge for display in UI.
   */
  getConfidenceBadge(organizationId: string, rule: string): ConfidenceBadge {
    const outcomes = this.outcomes.filter(
      (o) => o.organizationId === organizationId && o.rule === rule
    );

    if (outcomes.length < 5) {
      return {
        label: 'New',
        color: 'yellow',
        accuracy: 0,
        sampleSize: outcomes.length,
        tooltip: 'Insufficient data for calibration',
      };
    }

    const tp = outcomes.filter((o) => o.actualOutcome === 'true_positive').length;
    const accuracy = tp / outcomes.length;

    let color: 'green' | 'yellow' | 'orange' | 'red';
    let label: string;
    if (accuracy >= 0.8) {
      color = 'green';
      label = 'Reliable';
    } else if (accuracy >= 0.6) {
      color = 'yellow';
      label = 'Moderate';
    } else if (accuracy >= 0.4) {
      color = 'orange';
      label = 'Low';
    } else {
      color = 'red';
      label = 'Unreliable';
    }

    return {
      label,
      color,
      accuracy: Math.round(accuracy * 100) / 100,
      sampleSize: outcomes.length,
      tooltip: `${(accuracy * 100).toFixed(0)}% accuracy over ${outcomes.length} samples`,
    };
  }

  getOutcomeStats(organizationId: string): { total: number; byOutcome: Record<string, number> } {
    const org = this.outcomes.filter((o) => o.organizationId === organizationId);
    const byOutcome: Record<string, number> = {
      true_positive: 0,
      false_positive: 0,
      true_negative: 0,
      false_negative: 0,
    };
    for (const o of org) byOutcome[o.actualOutcome] = (byOutcome[o.actualOutcome] || 0) + 1;
    return { total: org.length, byOutcome };
  }
}

export const confidenceCalibrationService = new ConfidenceCalibrationService();
