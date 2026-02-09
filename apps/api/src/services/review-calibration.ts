import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface PostMergeOutcome {
  id: string;
  prNumber: number;
  repository: { owner: string; name: string };
  workflowId: string;
  outcomeType: string;
  severity: string;
  description: string;
  relatedIssues: number[];
  detectedAt: Date;
  mergedAt: Date;
  timeToDetectionHours: number;
  rootCauseFile?: string;
}

interface CalibrationProfile {
  id: string;
  repositoryId?: string;
  patternType: string;
  category: string;
  sensitivity: number;
  baseFalsePositiveRate: number;
  calibratedFalsePositiveRate: number;
  totalObservations: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
  lastCalibratedAt: Date;
  confidenceDecayDays: number;
}

interface AccuracyReport {
  id: string;
  repositoryId?: string;
  period: { start: Date; end: Date };
  overallAccuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  byCategory: Record<string, { precision: number; recall: number; f1Score: number; totalSuggestions: number; accepted: number; dismissed: number }>;
  trend: 'improving' | 'stable' | 'declining';
  trendDetail: { accuracyChange: number; falsePositiveRateChange: number; falseNegativeRateChange: number };
  topFalsePositives: Array<{ pattern: string; count: number; rate: number }>;
  missedIssues: Array<{ pattern: string; count: number; severity: string }>;
  recommendations: string[];
  generatedAt: Date;
}

/**
 * Review Quality Calibration Service
 * Tracks post-merge outcomes, calibrates review sensitivity,
 * and provides accuracy reporting.
 */
export class ReviewCalibrationService {
  private outcomes: PostMergeOutcome[] = [];
  private profiles = new Map<string, CalibrationProfile>();
  private feedbackLog: Array<{ commentId: string; action: string; patternType: string; timestamp: Date }> = [];

  /**
   * Record a post-merge outcome
   */
  async recordOutcome(params: {
    prNumber: number;
    owner: string;
    repo: string;
    outcomeType: string;
    severity: string;
    description: string;
    relatedIssues?: number[];
    rootCauseFile?: string;
  }): Promise<PostMergeOutcome> {
    const { prNumber, owner, repo, outcomeType, severity, description, relatedIssues = [], rootCauseFile } = params;

    logger.info({ prNumber, owner, repo, outcomeType, severity }, 'Recording post-merge outcome');

    // Find the original workflow
    const workflow = await db.pRWorkflow.findFirst({
      where: { prNumber, repository: { fullName: `${owner}/${repo}` } },
      orderBy: { completedAt: 'desc' },
    });

    const outcome: PostMergeOutcome = {
      id: uuidv4(),
      prNumber,
      repository: { owner, name: repo },
      workflowId: workflow?.id || 'unknown',
      outcomeType,
      severity,
      description,
      relatedIssues,
      detectedAt: new Date(),
      mergedAt: workflow?.completedAt || new Date(),
      timeToDetectionHours: workflow?.completedAt
        ? (Date.now() - workflow.completedAt.getTime()) / (1000 * 60 * 60)
        : 0,
      rootCauseFile,
    };

    this.outcomes.push(outcome);

    // Trigger recalibration if needed
    await this.maybeRecalibrate(outcomeType);

    return outcome;
  }

  /**
   * Record feedback on a review suggestion
   */
  async recordFeedback(params: {
    commentId: string;
    action: 'accepted' | 'dismissed' | 'false_positive';
    patternType: string;
  }): Promise<void> {
    const { commentId, action, patternType } = params;

    this.feedbackLog.push({
      commentId,
      action,
      patternType,
      timestamp: new Date(),
    });

    // Update calibration profile
    const profile = this.getOrCreateProfile(patternType);
    profile.totalObservations++;

    switch (action) {
      case 'accepted':
        profile.truePositives++;
        break;
      case 'dismissed':
        profile.falsePositives++;
        break;
      case 'false_positive':
        profile.falsePositives++;
        break;
    }

    // Recalculate false positive rate
    const total = profile.truePositives + profile.falsePositives;
    profile.calibratedFalsePositiveRate = total > 0 ? profile.falsePositives / total : 0;

    logger.info({ commentId, action, patternType, newFPRate: profile.calibratedFalsePositiveRate }, 'Feedback recorded');
  }

  /**
   * Get confidence score for a review pattern
   */
  async getConfidenceScore(patternType: string): Promise<{
    confidence: number;
    similarPatternsObserved: number;
    historicalAccuracy: number;
    displayText: string;
  }> {
    const profile = this.profiles.get(patternType);

    if (!profile || profile.totalObservations < 5) {
      return {
        confidence: 0.5,
        similarPatternsObserved: profile?.totalObservations || 0,
        historicalAccuracy: 0.5,
        displayText: 'Limited data available for this pattern',
      };
    }

    const accuracy = profile.truePositives / (profile.truePositives + profile.falsePositives) || 0.5;

    // Apply confidence decay
    const daysSinceCalibration = (Date.now() - profile.lastCalibratedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decayFactor = Math.max(0.5, 1 - daysSinceCalibration / profile.confidenceDecayDays);

    const confidence = accuracy * decayFactor;

    return {
      confidence,
      similarPatternsObserved: profile.totalObservations,
      historicalAccuracy: accuracy,
      displayText: `${Math.round(confidence * 100)}% confident based on ${profile.totalObservations} similar patterns`,
    };
  }

  /**
   * Get calibration profiles
   */
  async getCalibrationProfiles(repositoryId?: string): Promise<CalibrationProfile[]> {
    const profiles = Array.from(this.profiles.values());
    if (repositoryId) {
      return profiles.filter(p => p.repositoryId === repositoryId || !p.repositoryId);
    }
    return profiles;
  }

  /**
   * Generate accuracy report
   */
  async generateAccuracyReport(params: {
    repositoryId?: string;
    periodDays?: number;
  }): Promise<AccuracyReport> {
    const { repositoryId, periodDays = 30 } = params;
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    logger.info({ repositoryId, periodDays }, 'Generating accuracy report');

    const profiles = Array.from(this.profiles.values());

    // Calculate aggregate metrics
    let totalTP = 0, totalFP = 0, totalFN = 0;
    const byCategory: AccuracyReport['byCategory'] = {};

    for (const profile of profiles) {
      totalTP += profile.truePositives;
      totalFP += profile.falsePositives;
      totalFN += profile.falseNegatives;

      if (!byCategory[profile.category]) {
        byCategory[profile.category] = { precision: 0, recall: 0, f1Score: 0, totalSuggestions: 0, accepted: 0, dismissed: 0 };
      }
      byCategory[profile.category].totalSuggestions += profile.totalObservations;
      byCategory[profile.category].accepted += profile.truePositives;
      byCategory[profile.category].dismissed += profile.falsePositives;
    }

    // Calculate precision, recall, f1
    const precision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
    const recall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
    const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    // Calculate per-category metrics
    for (const cat of Object.keys(byCategory)) {
      const c = byCategory[cat];
      c.precision = c.totalSuggestions > 0 ? c.accepted / c.totalSuggestions : 0;
      c.recall = c.precision; // Simplified
      c.f1Score = c.precision;
    }

    // Top false positives
    const topFalsePositives = profiles
      .filter(p => p.falsePositives > 0)
      .sort((a, b) => b.calibratedFalsePositiveRate - a.calibratedFalsePositiveRate)
      .slice(0, 5)
      .map(p => ({ pattern: p.patternType, count: p.falsePositives, rate: p.calibratedFalsePositiveRate }));

    const recommendations: string[] = [];
    if (precision < 0.85) recommendations.push('Consider increasing severity thresholds to reduce false positives');
    if (totalFP > totalTP * 0.2) recommendations.push('False positive rate is above 20%. Review calibration profiles.');
    if (profiles.length < 10) recommendations.push('Insufficient data for reliable calibration. Continue collecting feedback.');

    const report: AccuracyReport = {
      id: uuidv4(),
      repositoryId,
      period: { start: periodStart, end: new Date() },
      overallAccuracy: precision,
      precision,
      recall,
      f1Score,
      byCategory,
      trend: 'stable',
      trendDetail: { accuracyChange: 0, falsePositiveRateChange: 0, falseNegativeRateChange: 0 },
      topFalsePositives,
      missedIssues: [],
      recommendations,
      generatedAt: new Date(),
    };

    logger.info({ precision, recall, f1Score, profileCount: profiles.length }, 'Accuracy report generated');
    return report;
  }

  /**
   * Get post-merge outcomes
   */
  async getOutcomes(params: {
    owner?: string;
    repo?: string;
    outcomeType?: string;
    limit?: number;
  }): Promise<PostMergeOutcome[]> {
    let filtered = this.outcomes;

    if (params.owner && params.repo) {
      filtered = filtered.filter(o => o.repository.owner === params.owner && o.repository.name === params.repo);
    }
    if (params.outcomeType) {
      filtered = filtered.filter(o => o.outcomeType === params.outcomeType);
    }

    return filtered.slice(0, params.limit || 50);
  }

  private getOrCreateProfile(patternType: string): CalibrationProfile {
    if (!this.profiles.has(patternType)) {
      this.profiles.set(patternType, {
        id: uuidv4(),
        patternType,
        category: patternType.split('_')[0] || 'general',
        sensitivity: 0.7,
        baseFalsePositiveRate: 0.1,
        calibratedFalsePositiveRate: 0.1,
        totalObservations: 0,
        truePositives: 0,
        falsePositives: 0,
        trueNegatives: 0,
        falseNegatives: 0,
        lastCalibratedAt: new Date(),
        confidenceDecayDays: 90,
      });
    }
    return this.profiles.get(patternType)!;
  }

  private async maybeRecalibrate(outcomeType: string): Promise<void> {
    // Auto-recalibrate when we get enough new data
    const recentOutcomes = this.outcomes.filter(o =>
      o.outcomeType === outcomeType &&
      o.detectedAt.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );

    if (recentOutcomes.length >= 5) {
      logger.info({ outcomeType, count: recentOutcomes.length }, 'Triggering auto-recalibration');
      // In production, this would retrain the calibration model
    }
  }
}

export const reviewCalibrationService = new ReviewCalibrationService();
