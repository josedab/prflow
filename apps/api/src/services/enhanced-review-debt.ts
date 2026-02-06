import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  StalePR,
  ReviewerMetrics,
  TeamDebtDashboard,
  DebtAlert,
  RebalanceResult,
} from '@prflow/core';

/**
 * Enhanced Review Debt Service
 * Tracks stale PRs, reviewer burnout, and blocked work
 */
export class EnhancedReviewDebtService {
  /**
   * Get stale PRs for a repository
   */
  async getStalePRs(
    repositoryId: string,
    options: { minAgeDays?: number; limit?: number } = {}
  ): Promise<StalePR[]> {
    const { minAgeDays = 3, limit = 50 } = options;
    const staleCutoff = new Date(Date.now() - minAgeDays * 24 * 60 * 60 * 1000);

    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        status: { in: ['PENDING', 'ANALYZING', 'REVIEWING'] },
        createdAt: { lt: staleCutoff },
      },
      include: {
        repository: true,
        analysis: true,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    const stalePRs: StalePR[] = [];

    for (const workflow of workflows) {
      const ageInDays = Math.floor(
        (Date.now() - workflow.createdAt.getTime()) / (24 * 60 * 60 * 1000)
      );
      const daysSinceActivity = Math.floor(
        (Date.now() - workflow.updatedAt.getTime()) / (24 * 60 * 60 * 1000)
      );

      const [owner, name] = workflow.repository.fullName.split('/');

      const stalePR: StalePR = {
        prNumber: workflow.prNumber,
        repository: { owner, name },
        title: workflow.prTitle,
        author: workflow.authorLogin,
        ageInDays,
        daysSinceActivity,
        status: this.determineStaleStatus(workflow, daysSinceActivity),
        reason: this.determineStaleReason(workflow, daysSinceActivity),
        assignedReviewers: [], // Would come from GitHub API
        pendingReviewers: [],
        blockedItems: [],
        riskLevel: this.assessRiskLevel(ageInDays, workflow.analysis?.riskLevel),
        recommendedAction: this.getRecommendedAction(workflow, ageInDays, daysSinceActivity),
        delayImpact: {
          blockedStoryPoints: 0,
          blockedDevelopers: 0,
        },
        createdAt: workflow.createdAt,
        lastActivityAt: workflow.updatedAt,
      };

      stalePRs.push(stalePR);
    }

    return stalePRs;
  }

  /**
   * Get reviewer metrics
   */
  async getReviewerMetrics(
    login: string,
    repositoryId?: string,
    periodDays = 30
  ): Promise<ReviewerMetrics> {
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Get workflows where this user was the author (as a proxy for reviews they might have done)
    const userWorkflows = await db.pRWorkflow.findMany({
      where: {
        authorLogin: login,
        ...(repositoryId && { repositoryId }),
        createdAt: { gte: periodStart },
      },
      include: {
        analysis: true,
        repository: true,
        reviewComments: true,
      },
    });

    // Calculate workload metrics
    const weekStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentWorkflows = userWorkflows.filter(w => w.createdAt >= weekStart);

    const workload = {
      assignedPRs: recentWorkflows.filter(w => w.status !== 'COMPLETED').length,
      reviewedThisWeek: recentWorkflows.length,
      reviewedThisMonth: userWorkflows.length,
      avgReviewsPerWeek: userWorkflows.length / (periodDays / 7),
      avgTimeToFirstReview: 4, // Placeholder
      avgCyclesPerPR: 1.5,
      avgCommentsPerReview: userWorkflows.length > 0
        ? userWorkflows.reduce((sum, w) => sum + w.reviewComments.length, 0) / userWorkflows.length
        : 0,
      linesReviewedThisWeek: recentWorkflows.reduce(
        (sum, w) => sum + (w.analysis?.linesAdded || 0),
        0
      ),
      estimatedHoursThisWeek: recentWorkflows.length * 0.5, // Estimate 30 min per review
    };

    // Assess health
    const health = this.assessReviewerHealth(workload);

    // Get current assignments
    const currentAssignments = recentWorkflows
      .filter(w => w.status !== 'COMPLETED')
      .map(w => ({
        prNumber: w.prNumber,
        repository: w.repository?.fullName || 'unknown',
        title: w.prTitle,
        author: w.authorLogin,
        assignedAt: w.createdAt,
        daysWaiting: Math.floor((Date.now() - w.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
        priority: 'medium' as const,
        status: 'pending' as const,
      }));

    return {
      login,
      displayName: login,
      workload,
      health,
      trends: {
        period: 'week',
        workloadTrend: 'stable',
        qualityTrend: 'stable',
        responseTimeTrend: 'stable',
        dataPoints: [],
      },
      currentAssignments,
      recommendations: this.getReviewerRecommendations(workload, health),
      lastUpdatedAt: new Date(),
    };
  }

  /**
   * Get team debt dashboard
   */
  async getTeamDashboard(
    teamId: string,
    repositoryIds: string[],
    periodDays = 30
  ): Promise<TeamDebtDashboard> {
    // Get stale PRs across all repos
    const allStalePRs: StalePR[] = [];
    for (const repoId of repositoryIds) {
      const repoPRs = await this.getStalePRs(repoId);
      allStalePRs.push(...repoPRs);
    }

    const criticalStale = allStalePRs.filter(p => p.riskLevel === 'critical');
    const blockingStale = allStalePRs.filter(p => p.blockedItems.length > 0);

    // Count by reason
    const byReason: Record<string, number> = {};
    for (const pr of allStalePRs) {
      byReason[pr.reason] = (byReason[pr.reason] || 0) + 1;
    }

    // Get all unique authors as potential reviewers
    const reviewerLogins = new Set<string>();
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000) },
      },
      select: { authorLogin: true },
    });
    workflows.forEach(w => reviewerLogins.add(w.authorLogin));

    // Get reviewer metrics
    const reviewerMetrics: ReviewerMetrics[] = [];
    for (const login of reviewerLogins) {
      const metrics = await this.getReviewerMetrics(login, undefined, periodDays);
      reviewerMetrics.push(metrics);
    }

    const overloadedReviewers = reviewerMetrics.filter(
      r => r.health.workloadStatus === 'overloaded'
    );
    const atRiskReviewers = reviewerMetrics.filter(
      r => r.health.burnoutRisk === 'high' || r.health.burnoutRisk === 'critical'
    );

    const avgHealthScore = reviewerMetrics.length > 0
      ? reviewerMetrics.reduce((sum, r) => sum + r.health.score, 0) / reviewerMetrics.length
      : 70;

    // Generate recommendations
    const recommendations = this.generateTeamRecommendations(
      allStalePRs,
      reviewerMetrics,
      { avgHealthScore }
    );

    return {
      teamId,
      teamName: `Team ${teamId}`,
      period: {
        start: new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000),
        end: new Date(),
      },
      stalePRs: {
        total: allStalePRs.length,
        critical: criticalStale.length,
        blocking: blockingStale.length,
        oldest: allStalePRs.length > 0 ? allStalePRs[0] : null,
        byReason,
      },
      reviewDebt: {
        totalItems: allStalePRs.length,
        criticalItems: criticalStale.length,
        estimatedHoursToResolve: allStalePRs.length * 2,
        healthScore: Math.max(0, 100 - allStalePRs.length * 5),
        trend: allStalePRs.length > 10 ? 'degrading' : 'stable',
      },
      reviewerHealth: {
        totalReviewers: reviewerMetrics.length,
        overloadedReviewers: overloadedReviewers.length,
        atRiskReviewers: atRiskReviewers.length,
        avgHealthScore,
        topContributors: reviewerMetrics
          .sort((a, b) => b.workload.reviewedThisMonth - a.workload.reviewedThisMonth)
          .slice(0, 5)
          .map(r => ({ login: r.login, reviewCount: r.workload.reviewedThisMonth })),
        needsAttention: atRiskReviewers.map(r => ({
          login: r.login,
          reason: r.health.warnings[0]?.message || 'High workload',
        })),
      },
      blockedWork: {
        totalBlockedItems: blockingStale.reduce((sum, p) => sum + p.blockedItems.length, 0),
        totalBlockedDays: blockingStale.reduce((sum, p) => sum + p.ageInDays, 0),
        estimatedImpact: {
          storyPoints: blockingStale.length * 3,
          developers: new Set(blockingStale.map(p => p.author)).size,
        },
        criticalBlocked: blockingStale
          .flatMap(p => p.blockedItems)
          .filter(i => i.priority === 'critical'),
      },
      recommendations,
      generatedAt: new Date(),
    };
  }

  /**
   * Create a debt alert
   */
  async createAlert(
    type: string,
    severity: 'info' | 'warning' | 'critical',
    title: string,
    message: string,
    related: { prNumbers?: number[]; reviewers?: string[] }
  ): Promise<DebtAlert> {
    const alert: DebtAlert = {
      id: uuidv4(),
      type: type as DebtAlert['type'],
      severity,
      title,
      message,
      related,
      actions: [],
      createdAt: new Date(),
      acknowledged: false,
    };

    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'debt_alert',
        eventData: JSON.parse(JSON.stringify(alert)),
      },
    });

    logger.info({ alertId: alert.id, type, severity }, 'Debt alert created');

    return alert;
  }

  /**
   * Rebalance reviewer workload
   */
  async rebalanceWorkload(params: {
    teamId: string;
    reviewers: string[];
    strategy: 'even' | 'by_expertise' | 'by_availability';
    dryRun?: boolean;
  }): Promise<RebalanceResult> {
    const { reviewers, strategy, dryRun = true } = params;

    // Get current workload for each reviewer
    const metrics: ReviewerMetrics[] = [];
    for (const login of reviewers) {
      const m = await this.getReviewerMetrics(login);
      metrics.push(m);
    }

    // Calculate current stats
    const workloads = metrics.map(m => m.workload.assignedPRs);
    const avgWorkload = workloads.reduce((a, b) => a + b, 0) / workloads.length;
    const maxWorkload = Math.max(...workloads);
    const variance = workloads.reduce((sum, w) => sum + Math.pow(w - avgWorkload, 2), 0) / workloads.length;

    // Identify reassignments needed
    const reassignments: RebalanceResult['reassignments'] = [];

    if (strategy === 'even') {
      // Find overloaded reviewers
      const overloaded = metrics.filter(m => m.workload.assignedPRs > avgWorkload + 1);
      const underloaded = metrics.filter(m => m.workload.assignedPRs < avgWorkload - 1);

      for (const over of overloaded) {
        const excess = over.workload.assignedPRs - Math.floor(avgWorkload);
        for (let i = 0; i < excess && i < underloaded.length; i++) {
          if (over.currentAssignments[i]) {
            reassignments.push({
              prNumber: over.currentAssignments[i].prNumber,
              fromReviewer: over.login,
              toReviewer: underloaded[i].login,
              reason: 'Balancing workload',
            });
          }
        }
      }
    }

    // Calculate projected stats after rebalancing
    const projectedWorkloads = [...workloads];
    for (const r of reassignments) {
      const fromIdx = reviewers.indexOf(r.fromReviewer);
      const toIdx = reviewers.indexOf(r.toReviewer);
      if (fromIdx >= 0) projectedWorkloads[fromIdx]--;
      if (toIdx >= 0) projectedWorkloads[toIdx]++;
    }

    const projectedAvg = projectedWorkloads.reduce((a, b) => a + b, 0) / projectedWorkloads.length;
    const projectedMax = Math.max(...projectedWorkloads);
    const projectedVariance = projectedWorkloads.reduce(
      (sum, w) => sum + Math.pow(w - projectedAvg, 2), 0
    ) / projectedWorkloads.length;

    // Apply if not dry run
    if (!dryRun) {
      // In a real implementation, this would actually reassign PRs via GitHub API
      logger.info({ reassignments: reassignments.length }, 'Workload rebalance applied');
    }

    return {
      reassignments,
      before: {
        avgWorkload,
        maxWorkload,
        variance,
      },
      after: {
        avgWorkload: projectedAvg,
        maxWorkload: projectedMax,
        variance: projectedVariance,
      },
      applied: !dryRun,
    };
  }

  // Private helpers

  private determineStaleStatus(
    workflow: { status: string },
    daysSinceActivity: number
  ): StalePR['status'] {
    if (daysSinceActivity > 14) return 'abandoned';
    if (workflow.status === 'REVIEWING') return 'waiting_for_review';
    return 'waiting_for_review';
  }

  private determineStaleReason(
    _workflow: unknown,
    daysSinceActivity: number
  ): StalePR['reason'] {
    if (daysSinceActivity > 14) return 'forgotten';
    if (daysSinceActivity > 7) return 'reviewer_unavailable';
    return 'reviewer_overloaded';
  }

  private assessRiskLevel(ageInDays: number, riskLevel?: string): StalePR['riskLevel'] {
    if (ageInDays > 14 || riskLevel === 'CRITICAL') return 'critical';
    if (ageInDays > 7 || riskLevel === 'HIGH') return 'high';
    if (ageInDays > 3) return 'medium';
    return 'low';
  }

  private getRecommendedAction(
    _workflow: unknown,
    ageInDays: number,
    daysSinceActivity: number
  ): StalePR['recommendedAction'] {
    if (daysSinceActivity > 14) {
      return {
        action: 'close_pr',
        description: 'PR appears abandoned, consider closing',
        urgency: 'medium',
      };
    }
    if (ageInDays > 7) {
      return {
        action: 'reassign_reviewer',
        description: 'Reassign to available reviewer',
        urgency: 'high',
      };
    }
    return {
      action: 'ping_reviewer',
      description: 'Send reminder to assigned reviewer',
      urgency: 'medium',
    };
  }

  private assessReviewerHealth(workload: ReviewerMetrics['workload']): ReviewerMetrics['health'] {
    const warnings: ReviewerMetrics['health']['warnings'] = [];
    let score = 80;

    // Check workload
    if (workload.assignedPRs > 5) {
      warnings.push({
        type: 'high_workload',
        severity: workload.assignedPRs > 8 ? 'alert' : 'warning',
        message: `${workload.assignedPRs} PRs currently assigned`,
        metric: 'assignedPRs',
        currentValue: workload.assignedPRs,
        threshold: 5,
      });
      score -= (workload.assignedPRs - 5) * 5;
    }

    // Check hours
    if (workload.estimatedHoursThisWeek > 15) {
      warnings.push({
        type: 'overtime',
        severity: 'warning',
        message: `${workload.estimatedHoursThisWeek.toFixed(1)} hours spent on reviews this week`,
        metric: 'estimatedHoursThisWeek',
        currentValue: workload.estimatedHoursThisWeek,
        threshold: 15,
      });
      score -= 10;
    }

    // Determine statuses
    let workloadStatus: ReviewerMetrics['health']['workloadStatus'] = 'optimal';
    if (workload.assignedPRs > 8) workloadStatus = 'overloaded';
    else if (workload.assignedPRs > 5) workloadStatus = 'high';
    else if (workload.assignedPRs < 2) workloadStatus = 'underutilized';

    let burnoutRisk: ReviewerMetrics['health']['burnoutRisk'] = 'low';
    if (warnings.some(w => w.severity === 'alert')) burnoutRisk = 'high';
    else if (warnings.length >= 2) burnoutRisk = 'moderate';

    return {
      score: Math.max(0, score),
      burnoutRisk,
      workloadStatus,
      warnings,
      strengths: workload.avgCommentsPerReview > 5 ? ['Thorough reviewer'] : [],
    };
  }

  private getReviewerRecommendations(
    workload: ReviewerMetrics['workload'],
    health: ReviewerMetrics['health']
  ): string[] {
    const recommendations: string[] = [];

    if (health.workloadStatus === 'overloaded') {
      recommendations.push('Consider delegating some reviews to teammates');
    }
    if (workload.avgTimeToFirstReview > 24) {
      recommendations.push('Try to respond to new review requests within 24 hours');
    }
    if (health.burnoutRisk === 'high') {
      recommendations.push('Take a break from reviews to prevent burnout');
    }

    return recommendations;
  }

  private generateTeamRecommendations(
    stalePRs: StalePR[],
    reviewerMetrics: ReviewerMetrics[],
    _context: { avgHealthScore: number }
  ): TeamDebtDashboard['recommendations'] {
    const recommendations: TeamDebtDashboard['recommendations'] = [];

    if (stalePRs.length > 10) {
      recommendations.push({
        id: uuidv4(),
        category: 'process',
        priority: 'high',
        title: 'Address stale PR backlog',
        description: `${stalePRs.length} PRs are stale and need attention`,
        actions: [
          'Schedule a PR review session',
          'Close abandoned PRs',
          'Reassign PRs with unavailable reviewers',
        ],
        expectedImpact: 'Reduce review backlog by 50%',
        effort: 'medium',
      });
    }

    const overloaded = reviewerMetrics.filter(r => r.health.workloadStatus === 'overloaded');
    if (overloaded.length > 0) {
      recommendations.push({
        id: uuidv4(),
        category: 'workload',
        priority: 'high',
        title: 'Rebalance reviewer workload',
        description: `${overloaded.length} reviewers are overloaded`,
        actions: [
          'Use workload rebalancing feature',
          'Onboard additional reviewers',
          'Implement review rotation',
        ],
        expectedImpact: 'Reduce burnout risk and improve review times',
        effort: 'small',
      });
    }

    return recommendations;
  }
}

export const enhancedReviewDebtService = new EnhancedReviewDebtService();
