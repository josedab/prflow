import { db } from '@prflow/db';

/**
 * DORA (DevOps Research and Assessment) Metrics
 * These are the four key metrics that measure software delivery performance
 */
export interface DORAMetrics {
  // How often code is deployed to production
  deploymentFrequency: {
    value: number; // deployments per day
    rating: 'elite' | 'high' | 'medium' | 'low';
    trend: number; // percentage change
    details: {
      daily: number;
      weekly: number;
      monthly: number;
    };
  };
  
  // Time from code commit to production deployment
  leadTimeForChanges: {
    value: number; // hours
    rating: 'elite' | 'high' | 'medium' | 'low';
    trend: number;
    breakdown: {
      codeCommit: number; // commit to PR open
      prReview: number; // PR open to approval
      prMerge: number; // approval to merge
      deployment: number; // merge to deploy
    };
  };
  
  // Percentage of deployments causing failures
  changeFailureRate: {
    value: number; // percentage
    rating: 'elite' | 'high' | 'medium' | 'low';
    trend: number;
    details: {
      totalDeployments: number;
      failedDeployments: number;
      rollbacks: number;
      hotfixes: number;
    };
  };
  
  // Time to restore service after failure
  meanTimeToRecovery: {
    value: number; // hours
    rating: 'elite' | 'high' | 'medium' | 'low';
    trend: number;
    details: {
      incidents: number;
      avgDetectionTime: number;
      avgResolutionTime: number;
    };
  };
}

/**
 * Team velocity metrics
 */
export interface VelocityMetrics {
  current: number; // PRs merged per week
  previous: number;
  trend: number;
  prediction: number;
  byDeveloper: Array<{
    login: string;
    velocity: number;
    trend: number;
  }>;
  byRepository: Array<{
    name: string;
    velocity: number;
    trend: number;
  }>;
  history: Array<{
    week: string;
    velocity: number;
    target?: number;
  }>;
}

/**
 * Team health score components
 */
export interface TeamHealthScore {
  overall: number; // 0-100
  components: {
    deliverySpeed: number;
    codeQuality: number;
    collaboration: number;
    sustainability: number;
    predictability: number;
  };
  trend: number;
  recommendations: string[];
}

/**
 * Dashboard data for team velocity
 */
export interface VelocityDashboard {
  teamId: string;
  teamName: string;
  period: {
    start: Date;
    end: Date;
  };
  dora: DORAMetrics;
  velocity: VelocityMetrics;
  healthScore: TeamHealthScore;
  alerts: Alert[];
  goals: Goal[];
  insights: Insight[];
}

/**
 * Alert for team attention
 */
export interface Alert {
  id: string;
  type: 'warning' | 'critical' | 'info';
  metric: string;
  message: string;
  currentValue: number;
  threshold: number;
  suggestedAction: string;
  createdAt: Date;
}

/**
 * Team goal
 */
export interface Goal {
  id: string;
  metric: string;
  target: number;
  current: number;
  progress: number;
  deadline?: Date;
  status: 'on-track' | 'at-risk' | 'behind' | 'achieved';
}

/**
 * AI-generated insight
 */
export interface Insight {
  id: string;
  type: 'trend' | 'anomaly' | 'recommendation' | 'achievement';
  prTitle: string;
  description: string;
  metric?: string;
  impact: 'high' | 'medium' | 'low';
  actionable: boolean;
  action?: string;
}

// DORA benchmark thresholds (based on State of DevOps Report)
const DORA_BENCHMARKS = {
  deploymentFrequency: {
    elite: 7, // multiple times per day (7+/week)
    high: 1, // between once per day and once per week
    medium: 0.25, // between once per week and once per month
    low: 0, // less than once per month
  },
  leadTimeForChanges: {
    elite: 24, // less than one day
    high: 168, // between one day and one week
    medium: 720, // between one week and one month
    low: Infinity, // more than one month
  },
  changeFailureRate: {
    elite: 15, // 0-15%
    high: 30, // 16-30%
    medium: 45, // 31-45%
    low: 100, // 46-100%
  },
  meanTimeToRecovery: {
    elite: 1, // less than one hour
    high: 24, // less than one day
    medium: 168, // less than one week
    low: Infinity, // more than one week
  },
};

export class TeamVelocityDashboardService {
  /**
   * Get full velocity dashboard for a team
   */
  async getVelocityDashboard(
    teamId: string,
    startDate: Date,
    endDate: Date
  ): Promise<VelocityDashboard> {
    const team = await db.team.findUnique({
      where: { id: teamId },
      include: {
        members: { include: { user: true } },
        organization: { include: { repositories: true } },
      },
    });

    if (!team) {
      throw new Error(`Team ${teamId} not found`);
    }

    const repositoryIds = team.organization?.repositories.map(r => r.id) || [];

    // Calculate all metrics
    const [dora, velocity, healthScore] = await Promise.all([
      this.calculateDORAMetrics(repositoryIds, startDate, endDate),
      this.calculateVelocityMetrics(repositoryIds, startDate, endDate),
      this.calculateHealthScore(repositoryIds, startDate, endDate),
    ]);

    // Generate alerts
    const alerts = this.generateAlerts(dora, velocity, healthScore);

    // Generate insights
    const insights = this.generateInsights(dora, velocity, healthScore);

    // Get or create goals
    const goals = await this.getTeamGoals(teamId);

    return {
      teamId,
      teamName: team.name,
      period: { start: startDate, end: endDate },
      dora,
      velocity,
      healthScore,
      alerts,
      goals,
      insights,
    };
  }

  /**
   * Calculate DORA metrics
   */
  async calculateDORAMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<DORAMetrics> {
    const periodDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get merged PRs (proxy for deployments in this context)
    const mergedPRs = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        status: 'COMPLETED',
        completedAt: { gte: startDate, lte: endDate },
      },
      orderBy: { completedAt: 'asc' },
    });

    // Get previous period for trend calculation
    const prevStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const prevMergedPRs = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        status: 'COMPLETED',
        completedAt: { gte: prevStart, lt: startDate },
      },
    });

    // Deployment Frequency
    const deploymentsPerDay = mergedPRs.length / periodDays;
    const prevDeploymentsPerDay = prevMergedPRs.length / periodDays;
    const deploymentFrequencyTrend = prevDeploymentsPerDay > 0
      ? ((deploymentsPerDay - prevDeploymentsPerDay) / prevDeploymentsPerDay) * 100
      : 0;

    // Lead Time for Changes
    let totalLeadTime = 0;
    let commitTime = 0;
    let reviewTime = 0;
    let mergeTime = 0;

    for (const pr of mergedPRs) {
      if (pr.completedAt && pr.createdAt) {
        const lead = pr.completedAt.getTime() - pr.createdAt.getTime();
        totalLeadTime += lead;
        
        // Estimate breakdown (simplified)
        commitTime += lead * 0.1; // 10% commit to PR
        reviewTime += lead * 0.6; // 60% review
        mergeTime += lead * 0.3; // 30% merge
      }
    }

    const avgLeadTimeHours = mergedPRs.length > 0
      ? (totalLeadTime / mergedPRs.length) / (1000 * 60 * 60)
      : 0;

    // Change Failure Rate (estimated from reverted/hotfix PRs)
    const failedChanges = await db.pRWorkflow.count({
      where: {
        repositoryId: { in: repositoryIds },
        completedAt: { gte: startDate, lte: endDate },
        OR: [
          { prTitle: { contains: 'revert', mode: 'insensitive' } },
          { prTitle: { contains: 'hotfix', mode: 'insensitive' } },
          { prTitle: { contains: 'rollback', mode: 'insensitive' } },
        ],
      },
    });

    const changeFailureRateValue = mergedPRs.length > 0
      ? (failedChanges / mergedPRs.length) * 100
      : 0;

    // Mean Time to Recovery (estimated from hotfix PRs)
    const hotfixPRs = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        completedAt: { gte: startDate, lte: endDate },
        OR: [
          { prTitle: { contains: 'hotfix', mode: 'insensitive' } },
          { prTitle: { contains: 'fix', mode: 'insensitive' } },
        ],
      },
    });

    let totalRecoveryTime = 0;
    for (const pr of hotfixPRs) {
      if (pr.completedAt && pr.createdAt) {
        totalRecoveryTime += pr.completedAt.getTime() - pr.createdAt.getTime();
      }
    }

    const avgRecoveryTimeHours = hotfixPRs.length > 0
      ? (totalRecoveryTime / hotfixPRs.length) / (1000 * 60 * 60)
      : 0;

    return {
      deploymentFrequency: {
        value: deploymentsPerDay,
        rating: this.rateDeploymentFrequency(deploymentsPerDay),
        trend: deploymentFrequencyTrend,
        details: {
          daily: deploymentsPerDay,
          weekly: deploymentsPerDay * 7,
          monthly: deploymentsPerDay * 30,
        },
      },
      leadTimeForChanges: {
        value: avgLeadTimeHours,
        rating: this.rateLeadTime(avgLeadTimeHours),
        trend: 0, // Would need previous period data
        breakdown: {
          codeCommit: (commitTime / mergedPRs.length) / (1000 * 60 * 60) || 0,
          prReview: (reviewTime / mergedPRs.length) / (1000 * 60 * 60) || 0,
          prMerge: (mergeTime / mergedPRs.length) / (1000 * 60 * 60) || 0,
          deployment: 0.5, // Assume 30 min deployment
        },
      },
      changeFailureRate: {
        value: changeFailureRateValue,
        rating: this.rateChangeFailureRate(changeFailureRateValue),
        trend: 0,
        details: {
          totalDeployments: mergedPRs.length,
          failedDeployments: failedChanges,
          rollbacks: failedChanges,
          hotfixes: hotfixPRs.length,
        },
      },
      meanTimeToRecovery: {
        value: avgRecoveryTimeHours,
        rating: this.rateMTTR(avgRecoveryTimeHours),
        trend: 0,
        details: {
          incidents: hotfixPRs.length,
          avgDetectionTime: avgRecoveryTimeHours * 0.3,
          avgResolutionTime: avgRecoveryTimeHours * 0.7,
        },
      },
    };
  }

  /**
   * Calculate velocity metrics
   */
  async calculateVelocityMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<VelocityMetrics> {
    const periodWeeks = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7)
    );

    // Get merged PRs
    const mergedPRs = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        status: 'COMPLETED',
        completedAt: { gte: startDate, lte: endDate },
      },
      include: { repository: true },
    });

    const currentVelocity = mergedPRs.length / periodWeeks;

    // Previous period
    const prevStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const prevMergedPRs = await db.pRWorkflow.count({
      where: {
        repositoryId: { in: repositoryIds },
        status: 'COMPLETED',
        completedAt: { gte: prevStart, lt: startDate },
      },
    });
    const previousVelocity = prevMergedPRs / periodWeeks;

    const trend = previousVelocity > 0
      ? ((currentVelocity - previousVelocity) / previousVelocity) * 100
      : 0;

    // Velocity by developer
    const authorCounts = new Map<string, number>();
    for (const pr of mergedPRs) {
      const author = pr.authorLogin;
      authorCounts.set(author, (authorCounts.get(author) || 0) + 1);
    }

    const byDeveloper = Array.from(authorCounts.entries())
      .map(([login, count]) => ({
        login,
        velocity: count / periodWeeks,
        trend: 0, // Would need historical data
      }))
      .sort((a, b) => b.velocity - a.velocity)
      .slice(0, 10);

    // Velocity by repository
    const repoCounts = new Map<string, number>();
    for (const pr of mergedPRs) {
      const repoName = pr.repository.name;
      repoCounts.set(repoName, (repoCounts.get(repoName) || 0) + 1);
    }

    const byRepository = Array.from(repoCounts.entries())
      .map(([name, count]) => ({
        name,
        velocity: count / periodWeeks,
        trend: 0,
      }))
      .sort((a, b) => b.velocity - a.velocity);

    // Weekly history
    const history = this.calculateWeeklyHistory(mergedPRs, startDate, endDate);

    // Prediction (simple linear regression)
    const prediction = currentVelocity * (1 + trend / 100);

    return {
      current: currentVelocity,
      previous: previousVelocity,
      trend,
      prediction,
      byDeveloper,
      byRepository,
      history,
    };
  }

  /**
   * Calculate team health score
   */
  async calculateHealthScore(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<TeamHealthScore> {
    // Get relevant data
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { reviewComments: true },
    });

    const totalPRs = workflows.length;
    workflows.filter(w => w.status === 'COMPLETED').length;  // Track merged PRs for metrics
    const avgCycleTime = this.calculateAverageCycleTime(workflows);

    // Delivery Speed (based on cycle time and throughput)
    const deliverySpeed = Math.min(100, Math.max(0,
      100 - (avgCycleTime / 24) * 10 // Penalty for longer cycle times
    ));

    // Code Quality (based on issues found and fixed)
    const totalIssues = workflows.reduce(
      (sum, w) => sum + w.reviewComments.length,
      0
    );
    const avgIssuesPerPR = totalPRs > 0 ? totalIssues / totalPRs : 0;
    const codeQuality = Math.min(100, Math.max(0,
      100 - avgIssuesPerPR * 5 // Penalty for more issues
    ));

    // Collaboration (based on review distribution)
    const reviewerSet = new Set<string>();
    const authorSet = new Set<string>();
    workflows.forEach(w => {
      authorSet.add(w.authorLogin);
      // Note: reviewer info would need to be tracked separately
    });
    const collaboration = Math.min(100, (reviewerSet.size / Math.max(1, authorSet.size)) * 50 + 25);

    // Sustainability (based on PR count - simplified since additions/deletions not in workflow)
    const periodDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prsPerDay = workflows.length / periodDays;
    const sustainability = Math.min(100, Math.max(0,
      80 - (prsPerDay > 5 ? 20 : 0) // Penalty for too high PR velocity
    ));

    // Predictability (based on variance in cycle time)
    const predictability = 70; // Simplified - would need more historical data

    // Overall score (weighted average)
    const overall = Math.round(
      deliverySpeed * 0.25 +
      codeQuality * 0.25 +
      collaboration * 0.2 +
      sustainability * 0.15 +
      predictability * 0.15
    );

    // Generate recommendations
    const recommendations = this.generateHealthRecommendations({
      deliverySpeed,
      codeQuality,
      collaboration,
      sustainability,
      predictability,
    });

    return {
      overall,
      components: {
        deliverySpeed: Math.round(deliverySpeed),
        codeQuality: Math.round(codeQuality),
        collaboration: Math.round(collaboration),
        sustainability: Math.round(sustainability),
        predictability: Math.round(predictability),
      },
      trend: 0, // Would need historical data
      recommendations,
    };
  }

  /**
   * Get team goals
   */
  async getTeamGoals(_teamId: string): Promise<Goal[]> {
    // Default goals - in production would be stored in DB
    return [
      {
        id: 'goal-1',
        metric: 'Lead Time',
        target: 24, // hours
        current: 36,
        progress: 67,
        status: 'at-risk',
      },
      {
        id: 'goal-2',
        metric: 'Deployment Frequency',
        target: 5, // per day
        current: 3,
        progress: 60,
        status: 'on-track',
      },
      {
        id: 'goal-3',
        metric: 'Change Failure Rate',
        target: 10, // percentage
        current: 8,
        progress: 100,
        status: 'achieved',
      },
    ];
  }

  /**
   * Set a team goal
   */
  async setTeamGoal(
    teamId: string,
    metric: string,
    target: number,
    deadline?: Date
  ): Promise<Goal> {
    const goal: Goal = {
      id: `goal-${Date.now()}`,
      metric,
      target,
      current: 0, // Will be calculated
      progress: 0,
      deadline,
      status: 'on-track',
    };

    // Store in database
    await db.analyticsEvent.create({
      data: {
        eventType: 'TEAM_GOAL',
        repositoryId: teamId, // Using teamId as repositoryId for storage
        eventData: JSON.parse(JSON.stringify(goal)),
        
        
      },
    });

    return goal;
  }

  /**
   * Generate alerts based on metrics
   */
  private generateAlerts(
    dora: DORAMetrics,
    velocity: VelocityMetrics,
    health: TeamHealthScore
  ): Alert[] {
    const alerts: Alert[] = [];

    // DORA alerts
    if (dora.deploymentFrequency.rating === 'low') {
      alerts.push({
        id: 'alert-df',
        type: 'warning',
        metric: 'Deployment Frequency',
        message: 'Deployment frequency is below industry standards',
        currentValue: dora.deploymentFrequency.value,
        threshold: DORA_BENCHMARKS.deploymentFrequency.medium,
        suggestedAction: 'Consider smaller, more frequent deployments',
        createdAt: new Date(),
      });
    }

    if (dora.leadTimeForChanges.value > 168) {
      alerts.push({
        id: 'alert-lt',
        type: 'critical',
        metric: 'Lead Time',
        message: 'Lead time exceeds one week',
        currentValue: dora.leadTimeForChanges.value,
        threshold: 168,
        suggestedAction: 'Review PR review process and identify bottlenecks',
        createdAt: new Date(),
      });
    }

    if (dora.changeFailureRate.value > 30) {
      alerts.push({
        id: 'alert-cfr',
        type: 'critical',
        metric: 'Change Failure Rate',
        message: 'High change failure rate detected',
        currentValue: dora.changeFailureRate.value,
        threshold: 30,
        suggestedAction: 'Increase test coverage and review process rigor',
        createdAt: new Date(),
      });
    }

    // Velocity alerts
    if (velocity.trend < -20) {
      alerts.push({
        id: 'alert-vel',
        type: 'warning',
        metric: 'Velocity',
        message: 'Team velocity has decreased significantly',
        currentValue: velocity.current,
        threshold: velocity.previous,
        suggestedAction: 'Check for blockers or resource constraints',
        createdAt: new Date(),
      });
    }

    // Health alerts
    if (health.overall < 60) {
      alerts.push({
        id: 'alert-health',
        type: 'warning',
        metric: 'Team Health',
        message: 'Overall team health score is below optimal',
        currentValue: health.overall,
        threshold: 60,
        suggestedAction: health.recommendations[0] || 'Review team processes',
        createdAt: new Date(),
      });
    }

    return alerts;
  }

  /**
   * Generate AI insights
   */
  private generateInsights(
    dora: DORAMetrics,
    velocity: VelocityMetrics,
    _health: TeamHealthScore
  ): Insight[] {
    const insights: Insight[] = [];

    // Trend insights
    if (velocity.trend > 10) {
      insights.push({
        id: 'insight-vel-up',
        type: 'trend',
        prTitle: 'Velocity Increasing',
        description: `Team velocity has increased by ${velocity.trend.toFixed(1)}% compared to the previous period`,
        metric: 'velocity',
        impact: 'medium',
        actionable: false,
      });
    }

    // Achievement insights
    if (dora.deploymentFrequency.rating === 'elite') {
      insights.push({
        id: 'insight-df-elite',
        type: 'achievement',
        prTitle: 'Elite Deployment Frequency',
        description: 'Your team is deploying at elite performer levels according to DORA metrics',
        metric: 'deployment_frequency',
        impact: 'high',
        actionable: false,
      });
    }

    // Recommendation insights
    if (dora.leadTimeForChanges.breakdown.prReview > dora.leadTimeForChanges.value * 0.7) {
      insights.push({
        id: 'insight-review-bottleneck',
        type: 'recommendation',
        prTitle: 'Review Process Bottleneck',
        description: 'PR review time accounts for over 70% of lead time',
        metric: 'lead_time',
        impact: 'high',
        actionable: true,
        action: 'Consider adding more reviewers or implementing review SLAs',
      });
    }

    // Anomaly insights
    if (velocity.current < velocity.prediction * 0.7) {
      insights.push({
        id: 'insight-vel-anomaly',
        type: 'anomaly',
        prTitle: 'Velocity Below Prediction',
        description: 'Current velocity is significantly below predicted values',
        metric: 'velocity',
        impact: 'high',
        actionable: true,
        action: 'Investigate potential blockers or team capacity issues',
      });
    }

    return insights;
  }

  // Helper methods

  private rateDeploymentFrequency(value: number): DORAMetrics['deploymentFrequency']['rating'] {
    if (value >= DORA_BENCHMARKS.deploymentFrequency.elite) return 'elite';
    if (value >= DORA_BENCHMARKS.deploymentFrequency.high) return 'high';
    if (value >= DORA_BENCHMARKS.deploymentFrequency.medium) return 'medium';
    return 'low';
  }

  private rateLeadTime(value: number): DORAMetrics['leadTimeForChanges']['rating'] {
    if (value <= DORA_BENCHMARKS.leadTimeForChanges.elite) return 'elite';
    if (value <= DORA_BENCHMARKS.leadTimeForChanges.high) return 'high';
    if (value <= DORA_BENCHMARKS.leadTimeForChanges.medium) return 'medium';
    return 'low';
  }

  private rateChangeFailureRate(value: number): DORAMetrics['changeFailureRate']['rating'] {
    if (value <= DORA_BENCHMARKS.changeFailureRate.elite) return 'elite';
    if (value <= DORA_BENCHMARKS.changeFailureRate.high) return 'high';
    if (value <= DORA_BENCHMARKS.changeFailureRate.medium) return 'medium';
    return 'low';
  }

  private rateMTTR(value: number): DORAMetrics['meanTimeToRecovery']['rating'] {
    if (value <= DORA_BENCHMARKS.meanTimeToRecovery.elite) return 'elite';
    if (value <= DORA_BENCHMARKS.meanTimeToRecovery.high) return 'high';
    if (value <= DORA_BENCHMARKS.meanTimeToRecovery.medium) return 'medium';
    return 'low';
  }

  private calculateAverageCycleTime(workflows: { createdAt: Date; completedAt: Date | null }[]): number {
    const mergedWorkflows = workflows.filter(w => w.completedAt);
    if (mergedWorkflows.length === 0) return 0;

    const totalTime = mergedWorkflows.reduce((sum, w) => {
      return sum + (w.completedAt!.getTime() - w.createdAt.getTime());
    }, 0);

    return (totalTime / mergedWorkflows.length) / (1000 * 60 * 60); // Convert to hours
  }

  private calculateWeeklyHistory(
    prs: { completedAt: Date | null }[],
    _startDate: Date,
    _endDate: Date
  ): Array<{ week: string; velocity: number }> {
    const history: Map<string, number> = new Map();

    for (const pr of prs) {
      if (!pr.completedAt) continue;
      
      const weekStart = new Date(pr.completedAt);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      history.set(weekKey, (history.get(weekKey) || 0) + 1);
    }

    return Array.from(history.entries())
      .map(([week, velocity]) => ({ week, velocity }))
      .sort((a, b) => a.week.localeCompare(b.week));
  }

  private generateHealthRecommendations(components: {
    deliverySpeed: number;
    codeQuality: number;
    collaboration: number;
    sustainability: number;
    predictability: number;
  }): string[] {
    const recommendations: string[] = [];

    if (components.deliverySpeed < 60) {
      recommendations.push('Reduce PR cycle time by implementing async code reviews');
    }
    if (components.codeQuality < 60) {
      recommendations.push('Increase code quality by enabling PRFlow automated reviews');
    }
    if (components.collaboration < 60) {
      recommendations.push('Improve collaboration by distributing review load more evenly');
    }
    if (components.sustainability < 60) {
      recommendations.push('Improve sustainability by breaking large PRs into smaller ones');
    }
    if (components.predictability < 60) {
      recommendations.push('Improve predictability by establishing consistent review SLAs');
    }

    return recommendations;
  }
}

export const teamVelocityDashboardService = new TeamVelocityDashboardService();
