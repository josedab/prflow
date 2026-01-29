import { db } from '@prflow/db';

// ============================================
// Team Analytics Types
// ============================================

export interface TeamOverview {
  teamId: string;
  teamName: string;
  repositories: number;
  members: number;
  activePRs: number;
  completedPRs: number;
}

export interface CycleTimeMetrics {
  average: number; // hours
  median: number;
  p90: number;
  p95: number;
  trend: number; // percentage change from previous period
  breakdown: {
    timeToFirstReview: number;
    reviewTime: number;
    timeToMerge: number;
  };
}

export interface ReviewMetrics {
  averageReviewTime: number; // hours
  averageIterations: number;
  reviewerLoadDistribution: Array<{
    login: string;
    reviewCount: number;
    avgResponseTime: number;
  }>;
  bottlenecks: Array<{
    type: 'reviewer' | 'checks' | 'conflicts' | 'approval';
    frequency: number;
    avgDelay: number;
  }>;
}

export interface ThroughputMetrics {
  prsOpened: number;
  prsMerged: number;
  prsAbandoned: number;
  mergeRate: number; // percentage
  averagePRSize: {
    files: number;
    additions: number;
    deletions: number;
  };
  byDay: Array<{ date: string; opened: number; merged: number }>;
}

export interface QualityMetrics {
  issuesFound: number;
  issuesBySeverity: Record<string, number>;
  issuesByCategory: Record<string, number>;
  falsePositiveRate: number;
  testsGenerated: number;
  testAcceptanceRate: number;
  docsGenerated: number;
  docAcceptanceRate: number;
}

export interface DeveloperProductivity {
  developerId: string;
  login: string;
  name: string;
  metrics: {
    prsAuthored: number;
    prsReviewed: number;
    commentsGiven: number;
    avgPRSize: number;
    avgCycleTime: number;
    mergeRate: number;
    reviewResponseTime: number;
  };
  trends: {
    prsAuthoredChange: number;
    cycleTimeChange: number;
  };
}

export interface SprintMetrics {
  sprintId: string;
  startDate: Date;
  endDate: Date;
  velocity: number;
  plannedPRs: number;
  completedPRs: number;
  carryOver: number;
  blockedPRs: number;
  avgPRAge: number;
}

export interface CodeHealthMetrics {
  repositoryId: string;
  repositoryName: string;
  issuesDensity: number;
  criticalIssues: number;
  securityIssues: number;
  testCoverage: number;
  documentationCoverage: number;
  technicalDebt: {
    score: number;
    items: Array<{
      type: string;
      count: number;
      severity: string;
    }>;
  };
}

export interface CollaborationMetrics {
  crossTeamReviews: number;
  reviewNetworkDensity: number;
  knowledgeDistribution: number;
  topCollaborators: Array<{
    reviewer: string;
    author: string;
    reviewCount: number;
  }>;
  siloPotential: Array<{
    developer: string;
    uniqueReviewers: number;
    risk: 'low' | 'medium' | 'high';
  }>;
}

export interface Bottleneck {
  id: string;
  type: 'reviewer_overload' | 'slow_reviews' | 'large_prs' | 'merge_conflicts' | 'failing_checks';
  severity: 'low' | 'medium' | 'high';
  description: string;
  metric: string;
  value: number;
  threshold: number;
  recommendation: string;
  affectedPRs?: number;
}

export interface Benchmark {
  metric: string;
  teamValue: number;
  industryAverage: number;
  topPerformers: number;
  percentile: number;
  rating: 'excellent' | 'good' | 'average' | 'needs_improvement';
}

export interface TeamAnalyticsSummary {
  overview: TeamOverview;
  cycleTime: CycleTimeMetrics;
  reviews: ReviewMetrics;
  throughput: ThroughputMetrics;
  quality: QualityMetrics;
  bottlenecks: Bottleneck[];
  benchmarks: Benchmark[];
  developerProductivity?: DeveloperProductivity[];
  collaboration?: CollaborationMetrics;
  codeHealth?: CodeHealthMetrics[];
}

// ============================================
// Industry Benchmarks (based on DORA metrics and industry research)
// ============================================

const INDUSTRY_BENCHMARKS = {
  cycleTime: { average: 72, topPerformers: 24 }, // hours
  timeToFirstReview: { average: 24, topPerformers: 4 }, // hours
  reviewIterations: { average: 2.3, topPerformers: 1.5 },
  mergeRate: { average: 85, topPerformers: 95 }, // percentage
  prSize: { average: 400, topPerformers: 200 }, // lines changed
  falsePositiveRate: { average: 15, topPerformers: 5 }, // percentage
};

// ============================================
// Team Analytics Service
// ============================================

export class TeamAnalyticsService {
  async getTeamAnalytics(
    teamId: string,
    startDate: Date,
    endDate: Date,
    includeExtended = false
  ): Promise<TeamAnalyticsSummary> {
    // Get team with repositories
    const team = await db.team.findUnique({
      where: { id: teamId },
      include: {
        members: { include: { user: true } },
        organization: {
          include: { repositories: true },
        },
      },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    const repositoryIds = team.organization.repositories.map((r) => r.id);

    // Fetch all required data in parallel
    const [, overview, cycleTime, reviews, throughput, quality] = await Promise.all([
      this.getWorkflowsInRange(repositoryIds, startDate, endDate),
      this.getTeamOverview(team, repositoryIds),
      this.getCycleTimeMetrics(repositoryIds, startDate, endDate),
      this.getReviewMetrics(repositoryIds, startDate, endDate),
      this.getThroughputMetrics(repositoryIds, startDate, endDate),
      this.getQualityMetrics(repositoryIds, startDate, endDate),
    ]);

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks(cycleTime, reviews, throughput, quality);

    // Calculate benchmarks
    const benchmarks = this.calculateBenchmarks(cycleTime, reviews, throughput, quality);

    const result: TeamAnalyticsSummary = {
      overview,
      cycleTime,
      reviews,
      throughput,
      quality,
      bottlenecks,
      benchmarks,
    };

    // Add extended metrics if requested
    if (includeExtended) {
      const [developerProductivity, collaboration, codeHealth] = await Promise.all([
        this.getDeveloperProductivity(repositoryIds, startDate, endDate),
        this.getCollaborationMetrics(repositoryIds, startDate, endDate),
        this.getCodeHealthMetrics(repositoryIds, startDate, endDate),
      ]);

      result.developerProductivity = developerProductivity;
      result.collaboration = collaboration;
      result.codeHealth = codeHealth;
    }

    return result;
  }

  private async getWorkflowsInRange(repositoryIds: string[], startDate: Date, endDate: Date) {
    return db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        analysis: true,
        reviewComments: true,
        generatedTests: true,
        docUpdates: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async getTeamOverview(
    team: {
      id: string;
      name: string;
      organization: { repositories: { id: string }[] };
      members: unknown[];
    },
    repositoryIds: string[]
  ): Promise<TeamOverview> {
    const [activePRs, completedPRs] = await Promise.all([
      db.pRWorkflow.count({
        where: {
          repositoryId: { in: repositoryIds },
          status: { notIn: ['COMPLETED', 'FAILED'] },
        },
      }),
      db.pRWorkflow.count({
        where: {
          repositoryId: { in: repositoryIds },
          status: 'COMPLETED',
        },
      }),
    ]);

    return {
      teamId: team.id,
      teamName: team.name,
      repositories: team.organization.repositories.length,
      members: team.members.length,
      activePRs,
      completedPRs,
    };
  }

  private async getCycleTimeMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<CycleTimeMetrics> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
        completedAt: { not: null },
      },
      include: { analysis: true },
    });

    if (workflows.length === 0) {
      return {
        average: 0,
        median: 0,
        p90: 0,
        p95: 0,
        trend: 0,
        breakdown: { timeToFirstReview: 0, reviewTime: 0, timeToMerge: 0 },
      };
    }

    // Calculate cycle times in hours
    const cycleTimes = workflows
      .filter((w) => w.completedAt)
      .map((w) => (w.completedAt!.getTime() - w.createdAt.getTime()) / (1000 * 60 * 60));

    cycleTimes.sort((a, b) => a - b);

    const average = cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
    const median = cycleTimes[Math.floor(cycleTimes.length / 2)];
    const p90 = cycleTimes[Math.floor(cycleTimes.length * 0.9)];
    const p95 = cycleTimes[Math.floor(cycleTimes.length * 0.95)];

    // Calculate breakdown (estimated based on analysis latency)
    const avgAnalysisTime = workflows
      .filter((w) => w.analysis?.latencyMs)
      .reduce((sum, w) => sum + (w.analysis!.latencyMs / (1000 * 60 * 60)), 0) / workflows.length || 0;

    return {
      average,
      median,
      p90,
      p95,
      trend: 0, // Would need previous period data
      breakdown: {
        timeToFirstReview: avgAnalysisTime,
        reviewTime: average * 0.4, // Estimated
        timeToMerge: average * 0.2, // Estimated
      },
    };
  }

  private async getReviewMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<ReviewMetrics> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        reviewComments: true,
        analysis: true,
      },
    });

    // Calculate reviewer load distribution
    const reviewerStats = new Map<string, { count: number; totalTime: number }>();

    for (const workflow of workflows) {
      const reviewer = workflow.authorLogin; // Using author as proxy for reviewer
      const stats = reviewerStats.get(reviewer) || { count: 0, totalTime: 0 };
      stats.count++;
      if (workflow.analysis?.latencyMs) {
        stats.totalTime += workflow.analysis.latencyMs / (1000 * 60 * 60);
      }
      reviewerStats.set(reviewer, stats);
    }

    const reviewerLoadDistribution = Array.from(reviewerStats.entries())
      .map(([login, stats]) => ({
        login,
        reviewCount: stats.count,
        avgResponseTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
      }))
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 10);

    // Identify bottlenecks
    const bottlenecks: ReviewMetrics['bottlenecks'] = [];
    
    // Check for reviewer overload
    if (reviewerLoadDistribution.length > 0) {
      const maxReviews = reviewerLoadDistribution[0].reviewCount;
      const avgReviews = reviewerLoadDistribution.reduce((sum, r) => sum + r.reviewCount, 0) / reviewerLoadDistribution.length;
      if (maxReviews > avgReviews * 2) {
        bottlenecks.push({
          type: 'reviewer',
          frequency: 0.3,
          avgDelay: 4,
        });
      }
    }

    return {
      averageReviewTime: workflows.length > 0 
        ? workflows.reduce((sum, w) => sum + (w.analysis?.latencyMs || 0), 0) / workflows.length / (1000 * 60 * 60)
        : 0,
      averageIterations: 1.5, // Would need actual review iteration data
      reviewerLoadDistribution,
      bottlenecks,
    };
  }

  private async getThroughputMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<ThroughputMetrics> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { analysis: true },
    });

    const prsOpened = workflows.length;
    const prsMerged = workflows.filter((w) => w.status === 'COMPLETED').length;
    const prsAbandoned = workflows.filter((w) => w.status === 'FAILED').length;

    // Calculate average PR size
    const prsWithAnalysis = workflows.filter((w) => w.analysis);
    const avgFiles = prsWithAnalysis.length > 0
      ? prsWithAnalysis.reduce((sum, w) => sum + (w.analysis!.filesModified || 0), 0) / prsWithAnalysis.length
      : 0;
    const avgAdditions = prsWithAnalysis.length > 0
      ? prsWithAnalysis.reduce((sum, w) => sum + (w.analysis!.linesAdded || 0), 0) / prsWithAnalysis.length
      : 0;
    const avgDeletions = prsWithAnalysis.length > 0
      ? prsWithAnalysis.reduce((sum, w) => sum + (w.analysis!.linesRemoved || 0), 0) / prsWithAnalysis.length
      : 0;

    // Group by day
    const byDay = new Map<string, { opened: number; merged: number }>();
    for (const workflow of workflows) {
      const date = workflow.createdAt.toISOString().split('T')[0];
      const day = byDay.get(date) || { opened: 0, merged: 0 };
      day.opened++;
      if (workflow.status === 'COMPLETED') {
        day.merged++;
      }
      byDay.set(date, day);
    }

    return {
      prsOpened,
      prsMerged,
      prsAbandoned,
      mergeRate: prsOpened > 0 ? (prsMerged / prsOpened) * 100 : 0,
      averagePRSize: {
        files: avgFiles,
        additions: avgAdditions,
        deletions: avgDeletions,
      },
      byDay: Array.from(byDay.entries())
        .map(([date, stats]) => ({ date, ...stats }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  private async getQualityMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<QualityMetrics> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        reviewComments: true,
        generatedTests: true,
        docUpdates: true,
      },
    });

    // Aggregate review comments
    const allComments = workflows.flatMap((w) => w.reviewComments);
    const issuesBySeverity: Record<string, number> = {};
    const issuesByCategory: Record<string, number> = {};

    for (const comment of allComments) {
      const severity = comment.severity.toLowerCase();
      const category = comment.category.toLowerCase();
      issuesBySeverity[severity] = (issuesBySeverity[severity] || 0) + 1;
      issuesByCategory[category] = (issuesByCategory[category] || 0) + 1;
    }

    // False positive rate
    const falsePositives = allComments.filter((c) => c.status === 'FALSE_POSITIVE').length;
    const falsePositiveRate = allComments.length > 0 ? (falsePositives / allComments.length) * 100 : 0;

    // Tests
    const allTests = workflows.flatMap((w) => w.generatedTests);
    const acceptedTests = allTests.filter((t) => t.status === 'ACCEPTED').length;

    // Docs
    const allDocs = workflows.flatMap((w) => w.docUpdates);
    const acceptedDocs = allDocs.filter((d) => d.status === 'ACCEPTED').length;

    return {
      issuesFound: allComments.length,
      issuesBySeverity,
      issuesByCategory,
      falsePositiveRate,
      testsGenerated: allTests.length,
      testAcceptanceRate: allTests.length > 0 ? (acceptedTests / allTests.length) * 100 : 0,
      docsGenerated: allDocs.length,
      docAcceptanceRate: allDocs.length > 0 ? (acceptedDocs / allDocs.length) * 100 : 0,
    };
  }

  private async getDeveloperProductivity(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<DeveloperProductivity[]> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        analysis: true,
        reviewComments: true,
      },
    });

    // Get previous period for trends
    const periodLength = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - periodLength);
    const prevWorkflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: prevStartDate, lt: startDate },
      },
    });

    // Aggregate by author
    const authorStats = new Map<string, {
      login: string;
      prsAuthored: number;
      prsReviewed: number;
      commentsGiven: number;
      totalSize: number;
      totalCycleTime: number;
      completedPRs: number;
      reviewResponseTimes: number[];
    }>();

    for (const workflow of workflows) {
      const author = workflow.authorLogin;
      const stats = authorStats.get(author) || {
        login: author,
        prsAuthored: 0,
        prsReviewed: 0,
        commentsGiven: 0,
        totalSize: 0,
        totalCycleTime: 0,
        completedPRs: 0,
        reviewResponseTimes: [],
      };

      stats.prsAuthored++;
      if (workflow.analysis) {
        stats.totalSize += (workflow.analysis.linesAdded || 0) + (workflow.analysis.linesRemoved || 0);
      }
      if (workflow.completedAt) {
        stats.totalCycleTime += (workflow.completedAt.getTime() - workflow.createdAt.getTime()) / (1000 * 60 * 60);
        stats.completedPRs++;
      }

      authorStats.set(author, stats);
    }

    // Calculate previous period stats for trends
    const prevAuthorPRs = new Map<string, number>();
    const prevAuthorCycleTime = new Map<string, { total: number; count: number }>();
    for (const workflow of prevWorkflows) {
      prevAuthorPRs.set(workflow.authorLogin, (prevAuthorPRs.get(workflow.authorLogin) || 0) + 1);
      if (workflow.completedAt) {
        const ct = prevAuthorCycleTime.get(workflow.authorLogin) || { total: 0, count: 0 };
        ct.total += (workflow.completedAt.getTime() - workflow.createdAt.getTime()) / (1000 * 60 * 60);
        ct.count++;
        prevAuthorCycleTime.set(workflow.authorLogin, ct);
      }
    }

    return Array.from(authorStats.entries()).map(([developerId, stats]) => {
      const prevPRs = prevAuthorPRs.get(stats.login) || 0;
      const prevCT = prevAuthorCycleTime.get(stats.login);
      const avgCycleTime = stats.completedPRs > 0 ? stats.totalCycleTime / stats.completedPRs : 0;
      const prevAvgCycleTime = prevCT && prevCT.count > 0 ? prevCT.total / prevCT.count : avgCycleTime;

      return {
        developerId,
        login: stats.login,
        name: stats.login,
        metrics: {
          prsAuthored: stats.prsAuthored,
          prsReviewed: stats.prsReviewed,
          commentsGiven: stats.commentsGiven,
          avgPRSize: stats.prsAuthored > 0 ? stats.totalSize / stats.prsAuthored : 0,
          avgCycleTime,
          mergeRate: stats.prsAuthored > 0 ? (stats.completedPRs / stats.prsAuthored) * 100 : 0,
          reviewResponseTime: stats.reviewResponseTimes.length > 0
            ? stats.reviewResponseTimes.reduce((a, b) => a + b, 0) / stats.reviewResponseTimes.length
            : 0,
        },
        trends: {
          prsAuthoredChange: prevPRs > 0 ? ((stats.prsAuthored - prevPRs) / prevPRs) * 100 : 0,
          cycleTimeChange: prevAvgCycleTime > 0 ? ((avgCycleTime - prevAvgCycleTime) / prevAvgCycleTime) * 100 : 0,
        },
      };
    }).sort((a, b) => b.metrics.prsAuthored - a.metrics.prsAuthored);
  }

  private async getCollaborationMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<CollaborationMetrics> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        reviewComments: true,
        analysis: true,
      },
    });

    // Track author-reviewer pairs
    const reviewPairs = new Map<string, number>();
    const authorReviewers = new Map<string, Set<string>>();

    for (const workflow of workflows) {
      const author = workflow.authorLogin;
      const reviewers = new Set<string>();

      // Get unique reviewers from suggested reviewers in analysis
      if (workflow.analysis?.suggestedReviewers) {
        const suggested = workflow.analysis.suggestedReviewers as string[];
        suggested.forEach(r => reviewers.add(r));
      }

      // Track pairs
      for (const reviewer of reviewers) {
        if (reviewer !== author) {
          const pairKey = `${reviewer}->${author}`;
          reviewPairs.set(pairKey, (reviewPairs.get(pairKey) || 0) + 1);

          if (!authorReviewers.has(author)) {
            authorReviewers.set(author, new Set());
          }
          authorReviewers.get(author)!.add(reviewer);
        }
      }
    }

    // Calculate top collaborators
    const topCollaborators = Array.from(reviewPairs.entries())
      .map(([key, count]) => {
        const [reviewer, author] = key.split('->');
        return { reviewer, author, reviewCount: count };
      })
      .sort((a, b) => b.reviewCount - a.reviewCount)
      .slice(0, 10);

    // Calculate silo potential
    const siloPotential = Array.from(authorReviewers.entries())
      .map(([developer, reviewers]) => {
        const uniqueReviewers = reviewers.size;
        let risk: 'low' | 'medium' | 'high' = 'low';
        if (uniqueReviewers <= 1) risk = 'high';
        else if (uniqueReviewers <= 2) risk = 'medium';
        return { developer, uniqueReviewers, risk };
      })
      .filter(s => s.risk !== 'low')
      .sort((a, b) => a.uniqueReviewers - b.uniqueReviewers);

    // Calculate network metrics
    const uniqueAuthors = new Set(workflows.map(w => w.authorLogin)).size;
    const uniqueReviewers = new Set(Array.from(reviewPairs.keys()).map(k => k.split('->')[0])).size;
    const totalPossiblePairs = uniqueAuthors * uniqueReviewers;
    const reviewNetworkDensity = totalPossiblePairs > 0 ? reviewPairs.size / totalPossiblePairs : 0;

    // Knowledge distribution (how evenly distributed reviews are)
    const reviewCounts = Array.from(reviewPairs.values());
    const avgReviews = reviewCounts.reduce((a, b) => a + b, 0) / reviewCounts.length || 0;
    const variance = reviewCounts.reduce((sum, c) => sum + Math.pow(c - avgReviews, 2), 0) / reviewCounts.length || 0;
    const stdDev = Math.sqrt(variance);
    const knowledgeDistribution = avgReviews > 0 ? Math.max(0, 1 - (stdDev / avgReviews)) : 0;

    return {
      crossTeamReviews: 0, // Would need team membership data
      reviewNetworkDensity: Math.round(reviewNetworkDensity * 100),
      knowledgeDistribution: Math.round(knowledgeDistribution * 100),
      topCollaborators,
      siloPotential,
    };
  }

  private async getCodeHealthMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<CodeHealthMetrics[]> {
    const repositories = await db.repository.findMany({
      where: { id: { in: repositoryIds } },
    });

    const codeHealthMetrics: CodeHealthMetrics[] = [];

    for (const repo of repositories) {
      const workflows = await db.pRWorkflow.findMany({
        where: {
          repositoryId: repo.id,
          createdAt: { gte: startDate, lte: endDate },
        },
        include: {
          reviewComments: true,
          generatedTests: true,
          docUpdates: true,
          analysis: true,
        },
      });

      const allComments = workflows.flatMap(w => w.reviewComments);
      const totalLines = workflows.reduce((sum, w) =>
        sum + (w.analysis?.linesAdded || 0) + (w.analysis?.linesRemoved || 0), 0);

      // Calculate issues density (issues per 1000 lines of code changed)
      const issuesDensity = totalLines > 0 ? (allComments.length / totalLines) * 1000 : 0;

      // Count critical and security issues
      const criticalIssues = allComments.filter(c =>
        c.severity.toLowerCase() === 'critical' || c.severity.toLowerCase() === 'high'
      ).length;
      const securityIssues = allComments.filter(c =>
        c.category.toLowerCase() === 'security'
      ).length;

      // Test and doc coverage estimates
      const testsGenerated = workflows.flatMap(w => w.generatedTests).length;
      const docsGenerated = workflows.flatMap(w => w.docUpdates).length;
      const totalPRs = workflows.length;
      const testCoverage = totalPRs > 0 ? Math.min(100, (testsGenerated / totalPRs) * 50) : 0;
      const documentationCoverage = totalPRs > 0 ? Math.min(100, (docsGenerated / totalPRs) * 50) : 0;

      // Technical debt items
      const debtItems = new Map<string, { count: number; severity: string }>();
      for (const comment of allComments) {
        if (['code_smell', 'complexity', 'maintainability'].includes(comment.category.toLowerCase())) {
          const type = comment.category.toLowerCase();
          const existing = debtItems.get(type) || { count: 0, severity: comment.severity };
          existing.count++;
          debtItems.set(type, existing);
        }
      }

      const debtScore = Math.max(0, 100 - (issuesDensity * 10) - (criticalIssues * 5) - (securityIssues * 10));

      codeHealthMetrics.push({
        repositoryId: repo.id,
        repositoryName: repo.name,
        issuesDensity: Math.round(issuesDensity * 100) / 100,
        criticalIssues,
        securityIssues,
        testCoverage: Math.round(testCoverage),
        documentationCoverage: Math.round(documentationCoverage),
        technicalDebt: {
          score: Math.round(debtScore),
          items: Array.from(debtItems.entries()).map(([type, data]) => ({
            type,
            count: data.count,
            severity: data.severity,
          })),
        },
      });
    }

    return codeHealthMetrics;
  }

  private identifyBottlenecks(
    cycleTime: CycleTimeMetrics,
    reviews: ReviewMetrics,
    throughput: ThroughputMetrics,
    quality: QualityMetrics
  ): Bottleneck[] {
    const bottlenecks: Bottleneck[] = [];

    // Slow cycle time
    if (cycleTime.average > INDUSTRY_BENCHMARKS.cycleTime.average) {
      bottlenecks.push({
        id: 'slow-cycle-time',
        type: 'slow_reviews',
        severity: cycleTime.average > INDUSTRY_BENCHMARKS.cycleTime.average * 1.5 ? 'high' : 'medium',
        description: 'PR cycle time is above industry average',
        metric: 'Cycle Time',
        value: cycleTime.average,
        threshold: INDUSTRY_BENCHMARKS.cycleTime.average,
        recommendation: 'Consider breaking PRs into smaller changes and improving review assignment',
      });
    }

    // Large PRs
    const avgSize = throughput.averagePRSize.additions + throughput.averagePRSize.deletions;
    if (avgSize > INDUSTRY_BENCHMARKS.prSize.average) {
      bottlenecks.push({
        id: 'large-prs',
        type: 'large_prs',
        severity: avgSize > INDUSTRY_BENCHMARKS.prSize.average * 2 ? 'high' : 'medium',
        description: 'Average PR size is larger than recommended',
        metric: 'Lines Changed',
        value: avgSize,
        threshold: INDUSTRY_BENCHMARKS.prSize.average,
        recommendation: 'Encourage smaller, more focused PRs for faster reviews',
      });
    }

    // Reviewer overload
    if (reviews.reviewerLoadDistribution.length > 0) {
      const topReviewerLoad = reviews.reviewerLoadDistribution[0].reviewCount;
      const avgLoad = reviews.reviewerLoadDistribution.reduce((s, r) => s + r.reviewCount, 0) / reviews.reviewerLoadDistribution.length;
      if (topReviewerLoad > avgLoad * 2 && reviews.reviewerLoadDistribution.length > 2) {
        bottlenecks.push({
          id: 'reviewer-overload',
          type: 'reviewer_overload',
          severity: 'medium',
          description: 'Review load is unevenly distributed',
          metric: 'Reviews per Person',
          value: topReviewerLoad,
          threshold: avgLoad,
          recommendation: 'Distribute reviews more evenly across team members',
        });
      }
    }

    // High false positive rate
    if (quality.falsePositiveRate > INDUSTRY_BENCHMARKS.falsePositiveRate.average) {
      bottlenecks.push({
        id: 'high-false-positives',
        type: 'failing_checks',
        severity: quality.falsePositiveRate > 25 ? 'high' : 'low',
        description: 'High rate of false positive issues',
        metric: 'False Positive Rate',
        value: quality.falsePositiveRate,
        threshold: INDUSTRY_BENCHMARKS.falsePositiveRate.average,
        recommendation: 'Review and tune analysis rules to reduce noise',
      });
    }

    return bottlenecks.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  private calculateBenchmarks(
    cycleTime: CycleTimeMetrics,
    reviews: ReviewMetrics,
    throughput: ThroughputMetrics,
    _quality: QualityMetrics
  ): Benchmark[] {
    const benchmarks: Benchmark[] = [];

    // Cycle time benchmark
    const cycleTimePercentile = this.calculatePercentile(
      cycleTime.average,
      INDUSTRY_BENCHMARKS.cycleTime.topPerformers,
      INDUSTRY_BENCHMARKS.cycleTime.average
    );
    benchmarks.push({
      metric: 'Cycle Time (hours)',
      teamValue: cycleTime.average,
      industryAverage: INDUSTRY_BENCHMARKS.cycleTime.average,
      topPerformers: INDUSTRY_BENCHMARKS.cycleTime.topPerformers,
      percentile: cycleTimePercentile,
      rating: this.getRating(cycleTimePercentile),
    });

    // Time to first review
    const ttfrPercentile = this.calculatePercentile(
      cycleTime.breakdown.timeToFirstReview,
      INDUSTRY_BENCHMARKS.timeToFirstReview.topPerformers,
      INDUSTRY_BENCHMARKS.timeToFirstReview.average
    );
    benchmarks.push({
      metric: 'Time to First Review (hours)',
      teamValue: cycleTime.breakdown.timeToFirstReview,
      industryAverage: INDUSTRY_BENCHMARKS.timeToFirstReview.average,
      topPerformers: INDUSTRY_BENCHMARKS.timeToFirstReview.topPerformers,
      percentile: ttfrPercentile,
      rating: this.getRating(ttfrPercentile),
    });

    // Merge rate
    const mergeRatePercentile = this.calculatePercentile(
      throughput.mergeRate,
      INDUSTRY_BENCHMARKS.mergeRate.topPerformers,
      INDUSTRY_BENCHMARKS.mergeRate.average,
      true // Higher is better
    );
    benchmarks.push({
      metric: 'Merge Rate (%)',
      teamValue: throughput.mergeRate,
      industryAverage: INDUSTRY_BENCHMARKS.mergeRate.average,
      topPerformers: INDUSTRY_BENCHMARKS.mergeRate.topPerformers,
      percentile: mergeRatePercentile,
      rating: this.getRating(mergeRatePercentile),
    });

    // PR Size
    const prSize = throughput.averagePRSize.additions + throughput.averagePRSize.deletions;
    const prSizePercentile = this.calculatePercentile(
      prSize,
      INDUSTRY_BENCHMARKS.prSize.topPerformers,
      INDUSTRY_BENCHMARKS.prSize.average
    );
    benchmarks.push({
      metric: 'PR Size (lines)',
      teamValue: prSize,
      industryAverage: INDUSTRY_BENCHMARKS.prSize.average,
      topPerformers: INDUSTRY_BENCHMARKS.prSize.topPerformers,
      percentile: prSizePercentile,
      rating: this.getRating(prSizePercentile),
    });

    return benchmarks;
  }

  private calculatePercentile(value: number, best: number, average: number, higherIsBetter = false): number {
    if (higherIsBetter) {
      if (value >= best) return 95;
      if (value >= average) return 50 + ((value - average) / (best - average)) * 45;
      return Math.max(5, (value / average) * 50);
    } else {
      if (value <= best) return 95;
      if (value <= average) return 50 + ((average - value) / (average - best)) * 45;
      return Math.max(5, 50 - ((value - average) / average) * 45);
    }
  }

  private getRating(percentile: number): Benchmark['rating'] {
    if (percentile >= 80) return 'excellent';
    if (percentile >= 60) return 'good';
    if (percentile >= 40) return 'average';
    return 'needs_improvement';
  }

  // Export functionality
  async exportAnalytics(
    teamId: string,
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const analytics = await this.getTeamAnalytics(teamId, startDate, endDate);

    if (format === 'csv') {
      const rows = [
        ['Metric', 'Value', 'Industry Average', 'Rating'],
        ...analytics.benchmarks.map((b) => [
          b.metric,
          b.teamValue.toFixed(2),
          b.industryAverage.toFixed(2),
          b.rating,
        ]),
      ];
      return rows.map((row) => row.join(',')).join('\n');
    }

    return JSON.stringify(analytics, null, 2);
  }
}

export const teamAnalyticsService = new TeamAnalyticsService();
