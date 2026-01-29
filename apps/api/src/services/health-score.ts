import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

export interface HealthScoreFactors {
  reviewLatencyScore: number;
  commentDensityScore: number;
  approvalVelocityScore: number;
  riskScore: number;
  testCoverageScore: number;
}

export interface PRHealthScoreResult {
  workflowId: string;
  prNumber: number;
  overallScore: number;
  factors: HealthScoreFactors;
  reviewLatencyMinutes: number | null;
  commentCount: number;
  approvalCount: number;
  changeRequestCount: number;
  predictedMergeDate: Date | null;
  blockers: string[];
  recommendations: string[];
}

export interface TeamHealthSummary {
  repositoryId: string;
  period: { start: Date; end: Date };
  avgReviewLatencyMinutes: number;
  avgCycleTimeHours: number;
  avgPRsPerWeek: number;
  avgCommentsPerPR: number;
  throughputScore: number;
  qualityScore: number;
  velocityScore: number;
  topBlockers: string[];
  trends: {
    reviewLatency: 'improving' | 'stable' | 'degrading';
    cycleTime: 'improving' | 'stable' | 'degrading';
    quality: 'improving' | 'stable' | 'degrading';
  };
}

const SCORE_WEIGHTS = {
  reviewLatency: 0.25,
  commentDensity: 0.15,
  approvalVelocity: 0.20,
  risk: 0.25,
  testCoverage: 0.15,
};

// Review latency thresholds (in minutes) and corresponding scores
const REVIEW_LATENCY_THRESHOLDS = {
  EXCELLENT: { maxMinutes: 30, score: 100 },
  GOOD: { maxMinutes: 120, score: 80 },      // 2 hours
  FAIR: { maxMinutes: 480, score: 60 },      // 8 hours
  POOR: { maxMinutes: 1440, score: 40 },     // 24 hours
  DEFAULT_SCORE: 20,
  UNKNOWN_SCORE: 50,
} as const;

// Comment density thresholds (comments per 100 lines)
const COMMENT_DENSITY_THRESHOLDS = {
  MINIMAL: { maxDensity: 0.5, score: 100 },
  LOW: { maxDensity: 1, score: 90 },
  MODERATE: { maxDensity: 2, score: 75 },
  HIGH: { maxDensity: 5, score: 60 },
  EXCESSIVE_SCORE: 40,
} as const;

// Approval velocity thresholds (in hours) and corresponding scores
const APPROVAL_VELOCITY_THRESHOLDS = {
  EXCELLENT: { maxHours: 4, score: 100 },
  GOOD: { maxHours: 8, score: 85 },
  FAIR: { maxHours: 24, score: 70 },
  SLOW: { maxHours: 48, score: 50 },
  INCOMPLETE_SCORE: 50,
  DEFAULT_SCORE: 30,
} as const;

// Test coverage ratio thresholds
const TEST_COVERAGE_THRESHOLDS = {
  FULL: { minRatio: 1, score: 100 },
  GOOD: { minRatio: 0.75, score: 85 },
  FAIR: { minRatio: 0.5, score: 70 },
  LOW: { minRatio: 0.25, score: 50 },
  DEFAULT_SCORE: 30,
} as const;

// Quality score thresholds (based on critical/high issue ratio)
const QUALITY_ISSUE_THRESHOLDS = {
  EXCELLENT: { maxRatio: 0.5, score: 100 },
  GOOD: { maxRatio: 1, score: 85 },
  FAIR: { maxRatio: 2, score: 70 },
  POOR: { maxRatio: 5, score: 50 },
  DEFAULT_SCORE: 30,
  CRITICAL_WEIGHT: 2,
  HIGH_WEIGHT: 1,
  NO_DATA_SCORE: 50,
} as const;

// Velocity and throughput calculation constants
const VELOCITY_CONSTANTS = {
  IDEAL_CYCLE_TIME_HOURS: 24,
  LATENCY_DIVISOR: 10,
  CYCLE_TIME_PENALTY_MULTIPLIER: 2,
  MAX_THROUGHPUT_PRS_PER_WEEK: 10,
  MAX_SCORE: 100,
  MIN_SCORE: 0,
} as const;

// Merge prediction thresholds
const MERGE_PREDICTION_HOURS = {
  HIGH_SCORE: { threshold: 80, hours: 4 },
  MEDIUM_SCORE: { threshold: 60, hours: 12 },
  LOW_SCORE: { threshold: 40, hours: 24 },
  DEFAULT_HOURS: 48,
} as const;

// Recommendation thresholds
const RECOMMENDATION_THRESHOLDS = {
  REVIEW_LATENCY_WARNING: 60,
  TEST_COVERAGE_WARNING: 60,
  RISK_WARNING: 50,
  COMMENT_DENSITY_WARNING: 50,
} as const;

// Trend calculation constants
const TREND_CONSTANTS = {
  STABLE_THRESHOLD_PERCENT: 10,
} as const;

export class HealthScoreService {
  async calculatePRHealthScore(workflowId: string): Promise<PRHealthScoreResult> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        analysis: true,
        reviewComments: true,
        generatedTests: true,
        synthesis: true,
        repository: true,
      },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    // Calculate individual scores
    const reviewLatencyMinutes = workflow.startedAt
      ? Math.floor((Date.now() - new Date(workflow.createdAt).getTime()) / 60000)
      : null;

    const reviewLatencyScore = this.calculateReviewLatencyScore(reviewLatencyMinutes);
    const commentDensityScore = this.calculateCommentDensityScore(
      workflow.reviewComments.length,
      workflow.analysis?.linesAdded || 0
    );
    const approvalVelocityScore = this.calculateApprovalVelocityScore(workflow);
    const riskScore = this.calculateRiskScore(workflow.analysis?.riskLevel || 'LOW');
    const testCoverageScore = this.calculateTestCoverageScore(
      workflow.generatedTests.length,
      workflow.analysis?.filesModified || 0
    );

    // Calculate overall score
    const overallScore = 
      reviewLatencyScore * SCORE_WEIGHTS.reviewLatency +
      commentDensityScore * SCORE_WEIGHTS.commentDensity +
      approvalVelocityScore * SCORE_WEIGHTS.approvalVelocity +
      riskScore * SCORE_WEIGHTS.risk +
      testCoverageScore * SCORE_WEIGHTS.testCoverage;

    // Identify blockers
    const blockers = this.identifyBlockers(workflow);

    // Generate recommendations
    const recommendations = this.generateRecommendations({
      reviewLatencyScore,
      commentDensityScore,
      approvalVelocityScore,
      riskScore,
      testCoverageScore,
    }, workflow);

    // Predict merge date
    const predictedMergeDate = this.predictMergeDate(workflow, overallScore);

    // Count approvals and change requests from comments
    const approvalCount = workflow.reviewComments.filter(
      (c) => c.status === 'RESOLVED'
    ).length;
    const changeRequestCount = workflow.reviewComments.filter(
      (c) => c.severity === 'CRITICAL' || c.severity === 'HIGH'
    ).length;

    // Save the health score
    await db.pRHealthScore.upsert({
      where: { workflowId },
      update: {
        overallScore,
        reviewLatencyScore,
        commentDensityScore,
        approvalVelocityScore,
        riskScore,
        testCoverageScore,
        reviewLatencyMinutes,
        commentCount: workflow.reviewComments.length,
        approvalCount,
        changeRequestCount,
        predictedMergeDate,
        blockers,
        recommendations,
        calculatedAt: new Date(),
      },
      create: {
        workflowId,
        repositoryId: workflow.repositoryId,
        prNumber: workflow.prNumber,
        overallScore,
        reviewLatencyScore,
        commentDensityScore,
        approvalVelocityScore,
        riskScore,
        testCoverageScore,
        reviewLatencyMinutes,
        commentCount: workflow.reviewComments.length,
        approvalCount,
        changeRequestCount,
        predictedMergeDate,
        blockers,
        recommendations,
      },
    });

    logger.info({ workflowId, overallScore }, 'PR health score calculated');

    return {
      workflowId,
      prNumber: workflow.prNumber,
      overallScore: Math.round(overallScore * 100) / 100,
      factors: {
        reviewLatencyScore,
        commentDensityScore,
        approvalVelocityScore,
        riskScore,
        testCoverageScore,
      },
      reviewLatencyMinutes,
      commentCount: workflow.reviewComments.length,
      approvalCount,
      changeRequestCount,
      predictedMergeDate,
      blockers,
      recommendations,
    };
  }

  async calculateTeamHealth(repositoryId: string, days = 30): Promise<TeamHealthSummary> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * 24 * 60 * 60 * 1000);

    // Get all workflows in the period
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        createdAt: { gte: periodStart, lte: periodEnd },
        status: 'COMPLETED',
      },
      include: {
        analysis: true,
        reviewComments: true,
      },
    });

    if (workflows.length === 0) {
      return {
        repositoryId,
        period: { start: periodStart, end: periodEnd },
        avgReviewLatencyMinutes: 0,
        avgCycleTimeHours: 0,
        avgPRsPerWeek: 0,
        avgCommentsPerPR: 0,
        throughputScore: 50,
        qualityScore: 50,
        velocityScore: 50,
        topBlockers: ['No completed PRs in this period'],
        trends: {
          reviewLatency: 'stable',
          cycleTime: 'stable',
          quality: 'stable',
        },
      };
    }

    // Calculate metrics
    const reviewLatencies = workflows
      .filter((w) => w.startedAt && w.completedAt)
      .map((w) => (new Date(w.completedAt!).getTime() - new Date(w.startedAt!).getTime()) / 60000);

    const cycleTimes = workflows
      .filter((w) => w.completedAt)
      .map((w) => (new Date(w.completedAt!).getTime() - new Date(w.createdAt).getTime()) / 3600000);

    const avgReviewLatencyMinutes = reviewLatencies.length > 0
      ? reviewLatencies.reduce((a, b) => a + b, 0) / reviewLatencies.length
      : 0;

    const avgCycleTimeHours = cycleTimes.length > 0
      ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
      : 0;

    const weeksInPeriod = days / 7;
    const avgPRsPerWeek = workflows.length / weeksInPeriod;

    const totalComments = workflows.reduce((sum, w) => sum + w.reviewComments.length, 0);
    const avgCommentsPerPR = totalComments / workflows.length;

    // Calculate scores
    const throughputScore = this.calculateThroughputScore(avgPRsPerWeek, avgCycleTimeHours);
    const qualityScore = this.calculateQualityScore(workflows);
    const velocityScore = this.calculateVelocityScore(avgReviewLatencyMinutes, avgCycleTimeHours);

    // Identify top blockers
    const topBlockers = this.identifyTeamBlockers(workflows);

    // Calculate trends (compare to previous period)
    const trends = await this.calculateTrends(repositoryId, periodStart, days);

    // Save team health metrics
    await db.teamHealthMetrics.upsert({
      where: {
        repositoryId_periodStart_periodEnd: {
          repositoryId,
          periodStart,
          periodEnd,
        },
      },
      update: {
        avgReviewLatencyMinutes,
        avgCycleTimeHours,
        avgPRsPerWeek,
        avgCommentsPerPR,
        throughputScore,
        qualityScore,
        velocityScore,
        topBlockers: JSON.parse(JSON.stringify(topBlockers)),
        trends: JSON.parse(JSON.stringify(trends)),
        calculatedAt: new Date(),
      },
      create: {
        repositoryId,
        periodStart,
        periodEnd,
        avgReviewLatencyMinutes,
        avgCycleTimeHours,
        avgPRsPerWeek,
        avgCommentsPerPR,
        throughputScore,
        qualityScore,
        velocityScore,
        topBlockers: JSON.parse(JSON.stringify(topBlockers)),
        trends: JSON.parse(JSON.stringify(trends)),
      },
    });

    return {
      repositoryId,
      period: { start: periodStart, end: periodEnd },
      avgReviewLatencyMinutes: Math.round(avgReviewLatencyMinutes),
      avgCycleTimeHours: Math.round(avgCycleTimeHours * 10) / 10,
      avgPRsPerWeek: Math.round(avgPRsPerWeek * 10) / 10,
      avgCommentsPerPR: Math.round(avgCommentsPerPR * 10) / 10,
      throughputScore: Math.round(throughputScore),
      qualityScore: Math.round(qualityScore),
      velocityScore: Math.round(velocityScore),
      topBlockers,
      trends,
    };
  }

  async getHealthScoreHistory(
    workflowId: string,
    limit = 10
  ): Promise<Array<{ calculatedAt: Date; overallScore: number }>> {
    const scores = await db.pRHealthScore.findMany({
      where: { workflowId },
      select: { calculatedAt: true, overallScore: true },
      orderBy: { calculatedAt: 'desc' },
      take: limit,
    });

    return scores;
  }

  async getRepositoryHealthTrend(
    repositoryId: string,
    days = 90
  ): Promise<Array<{ date: Date; avgScore: number; prCount: number }>> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const scores = await db.pRHealthScore.findMany({
      where: {
        repositoryId,
        calculatedAt: { gte: startDate },
      },
      select: {
        calculatedAt: true,
        overallScore: true,
      },
      orderBy: { calculatedAt: 'asc' },
    });

    // Group by day
    const byDay = new Map<string, { total: number; count: number }>();

    for (const score of scores) {
      const dayKey = score.calculatedAt.toISOString().split('T')[0];
      const existing = byDay.get(dayKey) || { total: 0, count: 0 };
      byDay.set(dayKey, {
        total: existing.total + score.overallScore,
        count: existing.count + 1,
      });
    }

    return Array.from(byDay.entries()).map(([date, data]) => ({
      date: new Date(date),
      avgScore: Math.round((data.total / data.count) * 100) / 100,
      prCount: data.count,
    }));
  }

  private calculateReviewLatencyScore(latencyMinutes: number | null): number {
    if (latencyMinutes === null) return REVIEW_LATENCY_THRESHOLDS.UNKNOWN_SCORE;

    const { EXCELLENT, GOOD, FAIR, POOR, DEFAULT_SCORE } = REVIEW_LATENCY_THRESHOLDS;
    if (latencyMinutes < EXCELLENT.maxMinutes) return EXCELLENT.score;
    if (latencyMinutes < GOOD.maxMinutes) return GOOD.score;
    if (latencyMinutes < FAIR.maxMinutes) return FAIR.score;
    if (latencyMinutes < POOR.maxMinutes) return POOR.score;
    return DEFAULT_SCORE;
  }

  private calculateCommentDensityScore(commentCount: number, linesChanged: number): number {
    if (linesChanged === 0) return VELOCITY_CONSTANTS.MAX_SCORE;

    const density = commentCount / (linesChanged / 100);
    const { MINIMAL, LOW, MODERATE, HIGH, EXCESSIVE_SCORE } = COMMENT_DENSITY_THRESHOLDS;

    if (density < MINIMAL.maxDensity) return MINIMAL.score;
    if (density < LOW.maxDensity) return LOW.score;
    if (density < MODERATE.maxDensity) return MODERATE.score;
    if (density < HIGH.maxDensity) return HIGH.score;
    return EXCESSIVE_SCORE;
  }

  private calculateApprovalVelocityScore(workflow: { status: string; completedAt: Date | null; createdAt: Date }): number {
    if (workflow.status !== 'COMPLETED' || !workflow.completedAt) {
      return APPROVAL_VELOCITY_THRESHOLDS.INCOMPLETE_SCORE;
    }

    const hoursToComplete = (new Date(workflow.completedAt).getTime() - new Date(workflow.createdAt).getTime()) / 3600000;
    const { EXCELLENT, GOOD, FAIR, SLOW, DEFAULT_SCORE } = APPROVAL_VELOCITY_THRESHOLDS;

    if (hoursToComplete < EXCELLENT.maxHours) return EXCELLENT.score;
    if (hoursToComplete < GOOD.maxHours) return GOOD.score;
    if (hoursToComplete < FAIR.maxHours) return FAIR.score;
    if (hoursToComplete < SLOW.maxHours) return SLOW.score;
    return DEFAULT_SCORE;
  }

  private calculateRiskScore(riskLevel: string): number {
    // Inverse scoring: lower risk = higher score
    const scores: Record<string, number> = {
      LOW: 100,
      MEDIUM: 70,
      HIGH: 40,
      CRITICAL: 10,
    };
    return scores[riskLevel] || 50;
  }

  private calculateTestCoverageScore(testsGenerated: number, filesModified: number): number {
    if (filesModified === 0) return VELOCITY_CONSTANTS.MAX_SCORE;

    const ratio = testsGenerated / filesModified;
    const { FULL, GOOD, FAIR, LOW, DEFAULT_SCORE } = TEST_COVERAGE_THRESHOLDS;

    if (ratio >= FULL.minRatio) return FULL.score;
    if (ratio >= GOOD.minRatio) return GOOD.score;
    if (ratio >= FAIR.minRatio) return FAIR.score;
    if (ratio >= LOW.minRatio) return LOW.score;
    return DEFAULT_SCORE;
  }

  private calculateThroughputScore(prsPerWeek: number, avgCycleTime: number): number {
    const { IDEAL_CYCLE_TIME_HOURS, CYCLE_TIME_PENALTY_MULTIPLIER, MAX_THROUGHPUT_PRS_PER_WEEK, MAX_SCORE, MIN_SCORE } = VELOCITY_CONSTANTS;
    
    const quantityScore = Math.min(prsPerWeek * MAX_THROUGHPUT_PRS_PER_WEEK, MAX_SCORE);
    const speedScore = avgCycleTime < IDEAL_CYCLE_TIME_HOURS 
      ? MAX_SCORE 
      : Math.max(MIN_SCORE, MAX_SCORE - (avgCycleTime - IDEAL_CYCLE_TIME_HOURS) * CYCLE_TIME_PENALTY_MULTIPLIER);

    return (quantityScore + speedScore) / 2;
  }

  private calculateQualityScore(workflows: Array<{ reviewComments: Array<{ severity: string }> }>): number {
    if (workflows.length === 0) return QUALITY_ISSUE_THRESHOLDS.NO_DATA_SCORE;

    const totalCritical = workflows.reduce(
      (sum, w) => sum + w.reviewComments.filter((c) => c.severity === 'CRITICAL').length,
      0
    );
    const totalHigh = workflows.reduce(
      (sum, w) => sum + w.reviewComments.filter((c) => c.severity === 'HIGH').length,
      0
    );

    const { CRITICAL_WEIGHT, HIGH_WEIGHT, EXCELLENT, GOOD, FAIR, POOR, DEFAULT_SCORE } = QUALITY_ISSUE_THRESHOLDS;
    const issueRatio = (totalCritical * CRITICAL_WEIGHT + totalHigh * HIGH_WEIGHT) / workflows.length;

    if (issueRatio < EXCELLENT.maxRatio) return EXCELLENT.score;
    if (issueRatio < GOOD.maxRatio) return GOOD.score;
    if (issueRatio < FAIR.maxRatio) return FAIR.score;
    if (issueRatio < POOR.maxRatio) return POOR.score;
    return DEFAULT_SCORE;
  }

  private calculateVelocityScore(avgLatency: number, avgCycleTime: number): number {
    const { IDEAL_CYCLE_TIME_HOURS, LATENCY_DIVISOR, CYCLE_TIME_PENALTY_MULTIPLIER, MAX_SCORE, MIN_SCORE } = VELOCITY_CONSTANTS;
    const LATENCY_THRESHOLD = 60;
    
    const latencyScore = avgLatency < LATENCY_THRESHOLD 
      ? MAX_SCORE 
      : Math.max(MIN_SCORE, MAX_SCORE - avgLatency / LATENCY_DIVISOR);
    const cycleScore = avgCycleTime < IDEAL_CYCLE_TIME_HOURS 
      ? MAX_SCORE 
      : Math.max(MIN_SCORE, MAX_SCORE - (avgCycleTime - IDEAL_CYCLE_TIME_HOURS) * CYCLE_TIME_PENALTY_MULTIPLIER);

    return (latencyScore + cycleScore) / 2;
  }

  private identifyBlockers(workflow: {
    status: string;
    reviewComments: Array<{ severity: string; status: string; category: string }>;
  }): string[] {
    const blockers: string[] = [];

    if (workflow.status === 'FAILED') {
      blockers.push('Workflow failed - check for errors');
    }

    const unresolvedCritical = workflow.reviewComments.filter(
      (c) => c.severity === 'CRITICAL' && c.status !== 'RESOLVED' && c.status !== 'DISMISSED'
    );
    if (unresolvedCritical.length > 0) {
      blockers.push(`${unresolvedCritical.length} critical issue(s) need resolution`);
    }

    const securityIssues = workflow.reviewComments.filter(
      (c) => c.category === 'SECURITY' && c.status !== 'RESOLVED'
    );
    if (securityIssues.length > 0) {
      blockers.push(`${securityIssues.length} security issue(s) pending review`);
    }

    return blockers;
  }

  private generateRecommendations(
    factors: HealthScoreFactors,
    workflow: { reviewComments: Array<{ category: string }> }
  ): string[] {
    const recommendations: string[] = [];
    const { REVIEW_LATENCY_WARNING, TEST_COVERAGE_WARNING, RISK_WARNING, COMMENT_DENSITY_WARNING } = RECOMMENDATION_THRESHOLDS;

    if (factors.reviewLatencyScore < REVIEW_LATENCY_WARNING) {
      recommendations.push('Consider adding more reviewers to reduce wait time');
    }

    if (factors.testCoverageScore < TEST_COVERAGE_WARNING) {
      recommendations.push('Add more tests to improve coverage confidence');
    }

    if (factors.riskScore < RISK_WARNING) {
      recommendations.push('High-risk PR - consider breaking into smaller changes');
    }

    if (factors.commentDensityScore < COMMENT_DENSITY_WARNING) {
      const categories = workflow.reviewComments.map((c) => c.category);
      const topCategory = this.getMostFrequent(categories);
      if (topCategory) {
        recommendations.push(`Focus on ${topCategory.toLowerCase()} issues - most common feedback area`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('PR is on track for merge');
    }

    return recommendations;
  }

  private predictMergeDate(
    workflow: { status: string; createdAt: Date },
    overallScore: number
  ): Date | null {
    if (workflow.status === 'COMPLETED') {
      return null;
    }

    const { HIGH_SCORE, MEDIUM_SCORE, LOW_SCORE, DEFAULT_HOURS } = MERGE_PREDICTION_HOURS;
    let baseHours: number;
    if (overallScore > HIGH_SCORE.threshold) {
      baseHours = HIGH_SCORE.hours;
    } else if (overallScore > MEDIUM_SCORE.threshold) {
      baseHours = MEDIUM_SCORE.hours;
    } else if (overallScore > LOW_SCORE.threshold) {
      baseHours = LOW_SCORE.hours;
    } else {
      baseHours = DEFAULT_HOURS;
    }
    
    const createdTime = new Date(workflow.createdAt).getTime();
    return new Date(createdTime + baseHours * 60 * 60 * 1000);
  }

  private identifyTeamBlockers(
    workflows: Array<{
      reviewComments: Array<{ severity: string; category: string }>;
      analysis: { riskLevel: string } | null;
    }>
  ): string[] {
    const blockerCounts: Record<string, number> = {};

    for (const workflow of workflows) {
      // Count risk levels
      if (workflow.analysis?.riskLevel === 'CRITICAL') {
        blockerCounts['Critical risk PRs'] = (blockerCounts['Critical risk PRs'] || 0) + 1;
      }

      // Count issue categories
      for (const comment of workflow.reviewComments) {
        if (comment.severity === 'CRITICAL' || comment.severity === 'HIGH') {
          const key = `${comment.category} issues`;
          blockerCounts[key] = (blockerCounts[key] || 0) + 1;
        }
      }
    }

    return Object.entries(blockerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([blocker, count]) => `${blocker} (${count})`);
  }

  private async calculateTrends(
    repositoryId: string,
    currentPeriodStart: Date,
    days: number
  ): Promise<{
    reviewLatency: 'improving' | 'stable' | 'degrading';
    cycleTime: 'improving' | 'stable' | 'degrading';
    quality: 'improving' | 'stable' | 'degrading';
  }> {
    const previousPeriodEnd = currentPeriodStart;
    const previousPeriodStart = new Date(previousPeriodEnd.getTime() - days * 24 * 60 * 60 * 1000);

    const previousMetrics = await db.teamHealthMetrics.findFirst({
      where: {
        repositoryId,
        periodStart: { gte: previousPeriodStart },
        periodEnd: { lte: previousPeriodEnd },
      },
    });

    if (!previousMetrics) {
      return {
        reviewLatency: 'stable',
        cycleTime: 'stable',
        quality: 'stable',
      };
    }

    const currentMetrics = await db.teamHealthMetrics.findFirst({
      where: {
        repositoryId,
        periodStart: { gte: currentPeriodStart },
      },
      orderBy: { calculatedAt: 'desc' },
    });

    if (!currentMetrics) {
      return {
        reviewLatency: 'stable',
        cycleTime: 'stable',
        quality: 'stable',
      };
    }

    const getTrend = (current: number, previous: number, lowerIsBetter = true): 'improving' | 'stable' | 'degrading' => {
      const change = ((current - previous) / previous) * 100;
      if (Math.abs(change) < TREND_CONSTANTS.STABLE_THRESHOLD_PERCENT) return 'stable';
      if (lowerIsBetter) {
        return change < 0 ? 'improving' : 'degrading';
      }
      return change > 0 ? 'improving' : 'degrading';
    };

    return {
      reviewLatency: getTrend(currentMetrics.avgReviewLatencyMinutes, previousMetrics.avgReviewLatencyMinutes, true),
      cycleTime: getTrend(currentMetrics.avgCycleTimeHours, previousMetrics.avgCycleTimeHours, true),
      quality: getTrend(currentMetrics.qualityScore, previousMetrics.qualityScore, false),
    };
  }

  private getMostFrequent(arr: string[]): string | null {
    if (arr.length === 0) return null;

    const counts = arr.reduce<Record<string, number>>((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }
}

export const healthScoreService = new HealthScoreService();
