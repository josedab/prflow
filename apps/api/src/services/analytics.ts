import { db } from '@prflow/db';

export interface TeamMetrics {
  timeToFirstReview: number;
  averageReviewCycles: number;
  prThroughput: number;
  issuesFoundByCategory: Record<string, number>;
  testCoverageImprovement: number;
  topReviewers: Array<{ login: string; count: number }>;
}

export interface PRMetrics {
  analysisLatencyMs: number;
  issuesFound: number;
  issuesBySeverity: Record<string, number>;
  testsGenerated: number;
  docsUpdated: number;
  reviewerAcceptanceRate: number;
}

export interface TrendData {
  date: string;
  value: number;
}

export class AnalyticsService {
  async trackEvent(
    repositoryId: string,
    eventType: string,
    eventData: Record<string, unknown>,
    workflowId?: string
  ): Promise<void> {
    await db.analyticsEvent.create({
      data: {
        repositoryId,
        workflowId,
        eventType,
        eventData: JSON.parse(JSON.stringify(eventData)),
      },
    });
  }

  async getTeamMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<TeamMetrics> {
    // Get workflows in date range
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
        status: 'COMPLETED',
      },
      include: {
        analysis: true,
        reviewComments: true,
        generatedTests: true,
      },
    });

    // Calculate metrics
    const analysisLatencies = workflows
      .filter((w) => w.analysis?.latencyMs)
      .map((w) => w.analysis!.latencyMs);

    const timeToFirstReview = analysisLatencies.length > 0
      ? analysisLatencies.reduce((a, b) => a + b, 0) / analysisLatencies.length / 1000
      : 0;

    // Issues by category
    const issuesFoundByCategory: Record<string, number> = {};
    for (const workflow of workflows) {
      for (const comment of workflow.reviewComments) {
        const category = comment.category.toLowerCase();
        issuesFoundByCategory[category] = (issuesFoundByCategory[category] || 0) + 1;
      }
    }

    // Tests generated
    const totalTests = workflows.reduce(
      (sum, w) => sum + w.generatedTests.length,
      0
    );

    // Calculate coverage improvement (placeholder)
    const testCoverageImprovement = totalTests > 0 ? totalTests * 2 : 0;

    return {
      timeToFirstReview,
      averageReviewCycles: 1.5, // Would need actual review cycle data
      prThroughput: workflows.length,
      issuesFoundByCategory,
      testCoverageImprovement,
      topReviewers: [], // Would need actual reviewer data
    };
  }

  async getPRMetrics(workflowId: string): Promise<PRMetrics | null> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        analysis: true,
        reviewComments: true,
        generatedTests: true,
        docUpdates: true,
      },
    });

    if (!workflow) return null;

    const issuesBySeverity: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      nitpick: 0,
    };

    for (const comment of workflow.reviewComments) {
      const severity = comment.severity.toLowerCase();
      issuesBySeverity[severity] = (issuesBySeverity[severity] || 0) + 1;
    }

    return {
      analysisLatencyMs: workflow.analysis?.latencyMs || 0,
      issuesFound: workflow.reviewComments.length,
      issuesBySeverity,
      testsGenerated: workflow.generatedTests.length,
      docsUpdated: workflow.docUpdates.length,
      reviewerAcceptanceRate: 0.8, // Would need feedback data
    };
  }

  async getTrends(
    repositoryIds: string[],
    metric: 'prs' | 'issues' | 'tests',
    startDate: Date,
    endDate: Date,
    interval: 'day' | 'week' | 'month' = 'day'
  ): Promise<TrendData[]> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        reviewComments: metric === 'issues',
        generatedTests: metric === 'tests',
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by interval
    const groups: Map<string, number> = new Map();

    for (const workflow of workflows) {
      const date = this.getIntervalKey(workflow.createdAt, interval);
      const current = groups.get(date) || 0;

      let value = 1;
      if (metric === 'issues') {
        value = workflow.reviewComments?.length || 0;
      } else if (metric === 'tests') {
        value = workflow.generatedTests?.length || 0;
      }

      groups.set(date, current + value);
    }

    return Array.from(groups.entries()).map(([date, value]) => ({
      date,
      value,
    }));
  }

  private getIntervalKey(date: Date, interval: 'day' | 'week' | 'month'): string {
    const d = new Date(date);
    
    switch (interval) {
      case 'day':
        return d.toISOString().split('T')[0];
      case 'week': {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        return weekStart.toISOString().split('T')[0];
      }
      case 'month':
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
  }

  async getFalsePositiveRate(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    const comments = await db.reviewComment.findMany({
      where: {
        workflow: {
          repositoryId: { in: repositoryIds },
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      select: {
        status: true,
      },
    });

    const total = comments.length;
    const falsePositives = comments.filter((c) => c.status === 'FALSE_POSITIVE').length;

    return total > 0 ? falsePositives / total : 0;
  }

  async exportMetrics(
    repositoryIds: string[],
    startDate: Date,
    endDate: Date,
    format: 'json' | 'csv' = 'json'
  ): Promise<string> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: { in: repositoryIds },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        analysis: true,
        reviewComments: true,
        generatedTests: true,
      },
    });

    const data = workflows.map((w) => ({
      id: w.id,
      prNumber: w.prNumber,
      prTitle: w.prTitle,
      status: w.status,
      riskLevel: w.analysis?.riskLevel,
      filesModified: w.analysis?.filesModified,
      issuesFound: w.reviewComments.length,
      testsGenerated: w.generatedTests.length,
      latencyMs: w.analysis?.latencyMs,
      createdAt: w.createdAt.toISOString(),
      completedAt: w.completedAt?.toISOString(),
    }));

    if (format === 'csv') {
      const headers = Object.keys(data[0] || {}).join(',');
      const rows = data.map((row) => Object.values(row).join(','));
      return [headers, ...rows].join('\n');
    }

    return JSON.stringify(data, null, 2);
  }
}

export const analyticsService = new AnalyticsService();
