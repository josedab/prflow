/**
 * @fileoverview Incremental Learning from Feedback Service
 *
 * Tracks which review comments are accepted/dismissed/false-positive per org,
 * and uses Bayesian updating to adjust rule confidence scores.
 */

import { logger } from '../lib/logger.js';
import type {
  FeedbackAction,
  ReviewFeedbackEvent,
  RuleConfidenceScore,
  FeedbackLearningStats,
  AdaptiveReviewConfig,
} from '@prflow/core';

export class FeedbackLearningService {
  private feedbackStore: ReviewFeedbackEvent[] = [];
  private confidenceScores = new Map<string, RuleConfidenceScore>();
  private adaptiveConfigs = new Map<string, AdaptiveReviewConfig>();

  /**
   * Record feedback on a review comment.
   */
  recordFeedback(event: ReviewFeedbackEvent): void {
    this.feedbackStore.push(event);
    this.updateConfidence(event);
    logger.debug(
      { rule: event.rule, action: event.action, org: event.organizationId },
      'Feedback recorded'
    );
  }

  private updateConfidence(event: ReviewFeedbackEvent): void {
    const key = `${event.organizationId}:${event.rule}`;
    let score = this.confidenceScores.get(key);

    if (!score) {
      score = {
        rule: event.rule,
        category: event.category,
        organizationId: event.organizationId,
        totalFeedback: 0,
        acceptedCount: 0,
        dismissedCount: 0,
        falsePositiveCount: 0,
        confidenceScore: 0.5,
        lastUpdated: new Date(),
      };
    }

    score.totalFeedback++;
    if (event.action === 'accepted') score.acceptedCount++;
    else if (event.action === 'dismissed') score.dismissedCount++;
    else if (event.action === 'false_positive') score.falsePositiveCount++;

    // Bayesian confidence update
    const alpha = score.acceptedCount + 1; // prior successes
    const beta = score.dismissedCount + score.falsePositiveCount + 1; // prior failures
    score.confidenceScore = alpha / (alpha + beta);
    score.lastUpdated = new Date();

    this.confidenceScores.set(key, score);
    this.recalibrateAdaptiveConfig(event.organizationId);
  }

  private recalibrateAdaptiveConfig(organizationId: string): void {
    const orgScores = Array.from(this.confidenceScores.values()).filter(
      (s) => s.organizationId === organizationId
    );

    const suppressed = orgScores
      .filter((s) => s.confidenceScore < 0.3 && s.totalFeedback >= 5)
      .map((s) => s.rule);

    const boosted = orgScores
      .filter((s) => s.confidenceScore > 0.8 && s.totalFeedback >= 5)
      .map((s) => s.rule);

    const adjustedSeverities: Record<string, string> = {};
    for (const score of orgScores) {
      if (score.totalFeedback >= 3 && score.confidenceScore < 0.4) {
        adjustedSeverities[score.rule] = 'low';
      }
    }

    this.adaptiveConfigs.set(organizationId, {
      organizationId,
      suppressedRules: suppressed,
      boostedRules: boosted,
      adjustedSeverities,
      lastCalibrated: new Date(),
    });
  }

  /**
   * Get confidence score for a specific rule in an org.
   */
  getConfidence(organizationId: string, rule: string): number {
    const score = this.confidenceScores.get(`${organizationId}:${rule}`);
    return score?.confidenceScore ?? 0.5;
  }

  /**
   * Get the adaptive config for an org (used to filter/adjust review comments).
   */
  getAdaptiveConfig(organizationId: string): AdaptiveReviewConfig {
    return (
      this.adaptiveConfigs.get(organizationId) || {
        organizationId,
        suppressedRules: [],
        boostedRules: [],
        adjustedSeverities: {},
        lastCalibrated: new Date(),
      }
    );
  }

  /**
   * Check if a rule should be suppressed for this org.
   */
  shouldSuppress(organizationId: string, rule: string): boolean {
    const config = this.adaptiveConfigs.get(organizationId);
    return config?.suppressedRules.includes(rule) ?? false;
  }

  /**
   * Get learning stats for an organization.
   */
  getStats(organizationId: string): FeedbackLearningStats {
    const orgFeedback = this.feedbackStore.filter((f) => f.organizationId === organizationId);

    const byAction: Record<FeedbackAction, number> = {
      accepted: 0,
      dismissed: 0,
      false_positive: 0,
      modified: 0,
    };
    for (const f of orgFeedback) {
      byAction[f.action]++;
    }

    const total = orgFeedback.length || 1;

    const ruleCounts = new Map<string, { accepted: number; dismissed: number }>();
    for (const f of orgFeedback) {
      const counts = ruleCounts.get(f.rule) || { accepted: 0, dismissed: 0 };
      if (f.action === 'accepted') counts.accepted++;
      if (f.action === 'dismissed') counts.dismissed++;
      ruleCounts.set(f.rule, counts);
    }

    const topDismissed = Array.from(ruleCounts.entries())
      .sort((a, b) => b[1].dismissed - a[1].dismissed)
      .slice(0, 5)
      .map(([rule, c]) => ({ rule, dismissals: c.dismissed }));

    const topAccepted = Array.from(ruleCounts.entries())
      .sort((a, b) => b[1].accepted - a[1].accepted)
      .slice(0, 5)
      .map(([rule, c]) => ({ rule, acceptances: c.accepted }));

    return {
      organizationId,
      totalFeedback: orgFeedback.length,
      byAction,
      acceptanceRate: byAction.accepted / total,
      falsePositiveRate: byAction.false_positive / total,
      topDismissedRules: topDismissed,
      topAcceptedRules: topAccepted,
      improvementOverTime: [],
    };
  }

  /**
   * Get all confidence scores for an org.
   */
  getConfidenceScores(organizationId: string): RuleConfidenceScore[] {
    return Array.from(this.confidenceScores.values())
      .filter((s) => s.organizationId === organizationId)
      .sort((a, b) => b.totalFeedback - a.totalFeedback);
  }
}

export const feedbackLearningService = new FeedbackLearningService();
