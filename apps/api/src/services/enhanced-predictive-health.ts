import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { predictiveHealthService } from './predictive-health.js';
import type {
  ComprehensivePRHealthScore,
  HealthGrade,
  HealthFactors,
  HealthBreakdown,
  PRPredictions,
  RiskIndicator,
  HealthRecommendation,
  HistoricalComparison,
  TeamHealthDashboard,
  PredictedBlocker,
  BlockerType,
} from '@prflow/core';

/**
 * Enhanced Predictive Health Service
 * Provides comprehensive health scoring, predictions, and recommendations
 */
export class EnhancedPredictiveHealthService {
  /**
   * Calculate comprehensive health score for a PR
   */
  async calculateHealthScore(workflowId: string): Promise<ComprehensivePRHealthScore> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        repository: true,
        analysis: true,
        reviewComments: true,
        generatedTests: true,
      },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Get base features from existing service
    const features = await predictiveHealthService.extractFeatures(workflowId);

    // Calculate individual factors
    const factors = this.calculateFactors(workflow, features);

    // Calculate overall score
    const overallScore = this.calculateOverallScore(factors);
    const grade = this.getGrade(overallScore);

    // Build detailed breakdown
    const breakdown = this.buildBreakdown(workflow, features);

    // Generate predictions
    const predictions = await this.generatePredictions(workflowId, features, workflow);

    // Identify risks
    const risks = this.identifyRisks(workflow, features, breakdown);

    // Generate recommendations
    const recommendations = this.generateRecommendations(factors, breakdown, risks);

    // Get historical comparison
    const comparison = await this.getHistoricalComparison(
      workflow.authorLogin,
      workflow.repositoryId,
      overallScore
    );

    const healthScore: ComprehensivePRHealthScore = {
      workflowId,
      prNumber: workflow.prNumber,
      repository: {
        owner: workflow.repository.fullName.split('/')[0],
        name: workflow.repository.fullName.split('/')[1],
      },
      overallScore,
      grade,
      factors,
      breakdown,
      predictions,
      risks,
      recommendations,
      comparison,
      confidence: this.calculateConfidence(features, workflow),
      calculatedAt: new Date(),
      validUntil: new Date(Date.now() + 3600000), // Valid for 1 hour
    };

    // Store health score
    await this.storeHealthScore(healthScore);

    logger.info({ workflowId, overallScore, grade }, 'Health score calculated');

    return healthScore;
  }

  /**
   * Get team health dashboard
   */
  async getTeamHealthDashboard(
    repositoryId: string,
    startDate: Date,
    endDate: Date
  ): Promise<TeamHealthDashboard> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        analysis: true,
        reviewComments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate overview metrics
    const mergedWorkflows = workflows.filter(w => w.status === 'COMPLETED');
    const mergeTimes = mergedWorkflows
      .filter(w => w.completedAt)
      .map(w => (w.completedAt!.getTime() - w.createdAt.getTime()) / 3600000);

    // Calculate grade distribution
    const gradeDistribution: Record<HealthGrade, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    const healthScores: number[] = [];

    for (const workflow of workflows) {
      const score = this.estimateHealthScore(workflow);
      healthScores.push(score);
      gradeDistribution[this.getGrade(score)]++;
    }

    const avgHealthScore = healthScores.length > 0
      ? healthScores.reduce((a, b) => a + b, 0) / healthScores.length
      : 0;

    // Identify common issues
    const issueCounts: Record<string, number> = {};
    for (const workflow of workflows) {
      for (const comment of workflow.reviewComments) {
        const category = comment.category;
        issueCounts[category] = (issueCounts[category] || 0) + 1;
      }
    }

    const commonIssues = Object.entries(issueCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({ type, count, trend: 'stable' as const }));

    // Get top performers
    const authorScores: Record<string, { total: number; count: number }> = {};
    for (let i = 0; i < workflows.length; i++) {
      const workflow = workflows[i];
      const login = workflow.authorLogin;
      if (!authorScores[login]) {
        authorScores[login] = { total: 0, count: 0 };
      }
      authorScores[login].total += healthScores[i];
      authorScores[login].count++;
    }

    const topPerformers = Object.entries(authorScores)
      .map(([login, { total, count }]) => ({
        login,
        avgHealthScore: total / count,
        prCount: count,
      }))
      .sort((a, b) => b.avgHealthScore - a.avgHealthScore)
      .slice(0, 5);

    return {
      teamId: '',
      repositoryId,
      period: { start: startDate, end: endDate },
      overview: {
        avgHealthScore,
        healthScoreTrend: 'stable',
        totalPRs: workflows.length,
        mergedPRs: mergedWorkflows.length,
        mergeRate: workflows.length > 0 ? mergedWorkflows.length / workflows.length : 0,
        avgMergeTimeHours: mergeTimes.length > 0
          ? mergeTimes.reduce((a, b) => a + b, 0) / mergeTimes.length
          : 0,
        avgReviewCycles: 1.5, // Estimated
      },
      gradeDistribution,
      commonIssues,
      topPerformers,
      bottlenecks: this.identifyBottlenecks(workflows),
      trends: {
        healthScore: [],
        mergeTime: [],
        issueCount: [],
      },
    };
  }

  // Private helper methods

  private calculateFactors(
    workflow: {
      analysis?: unknown;
      reviewComments: Array<{ severity: string }>;
      generatedTests: unknown[];
      prTitle: string;
      prBody?: string | null;
    },
    features: {
      normalizedSize: number;
      normalizedComplexity: number;
      normalizedRisk: number;
      hasTests: boolean;
      hasDescription: boolean;
      reviewerAvailability: number;
      authorMergeRate: number;
      isWeekend: boolean;
      hourOfDay: number;
    }
  ): HealthFactors {
    return {
      size: Math.round((1 - features.normalizedSize) * 100),
      complexity: Math.round((1 - features.normalizedComplexity) * 100),
      risk: Math.round((1 - features.normalizedRisk) * 100),
      testCoverage: features.hasTests ? 80 : 30,
      documentation: this.scoreDocumentation(workflow),
      reviewReadiness: Math.round(features.reviewerAvailability * 100),
      authorHistory: Math.round(features.authorMergeRate * 100),
      timing: this.scoreTiming(features.isWeekend, features.hourOfDay),
    };
  }

  private scoreDocumentation(workflow: {
    prTitle: string;
    prBody?: string | null;
  }): number {
    let score = 0;

    // Title quality
    if (workflow.prTitle && workflow.prTitle.length > 10) score += 20;
    if (workflow.prTitle && workflow.prTitle.length > 30) score += 10;

    // Description quality
    if (workflow.prBody) {
      score += 20;
      if (workflow.prBody.length > 100) score += 15;
      if (workflow.prBody.length > 300) score += 10;
      if (workflow.prBody.includes('##') || workflow.prBody.includes('- ')) score += 10;
      if (workflow.prBody.toLowerCase().includes('test')) score += 5;
      if (workflow.prBody.match(/#\d+/)) score += 10; // Has issue references
    }

    return Math.min(100, score);
  }

  private scoreTiming(isWeekend: boolean, hourOfDay: number): number {
    if (isWeekend) return 40;
    if (hourOfDay >= 10 && hourOfDay <= 16) return 100;
    if (hourOfDay >= 8 && hourOfDay <= 18) return 80;
    return 50;
  }

  private calculateOverallScore(factors: HealthFactors): number {
    const weights = {
      size: 0.15,
      complexity: 0.15,
      risk: 0.20,
      testCoverage: 0.15,
      documentation: 0.10,
      reviewReadiness: 0.10,
      authorHistory: 0.10,
      timing: 0.05,
    };

    let score = 0;
    for (const [key, weight] of Object.entries(weights)) {
      score += factors[key as keyof HealthFactors] * weight;
    }

    return Math.round(score);
  }

  private getGrade(score: number): HealthGrade {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  private buildBreakdown(
    workflow: {
      analysis?: unknown;
      reviewComments: Array<{ severity: string }>;
      generatedTests: unknown[];
      prTitle: string;
      prBody?: string | null;
    },
    _features: {
      totalChanges: number;
      normalizedSize: number;
      normalizedComplexity: number;
      criticalIssues: number;
      highIssues: number;
      mediumIssues: number;
    }
  ): HealthBreakdown {
    const analysisObj = workflow.analysis as { riskLevel?: string; filesModified?: number; linesAdded?: number; linesRemoved?: number } | null | undefined;
    const filesChanged = analysisObj?.filesModified || 0;
    const linesAdded = analysisObj?.linesAdded || 0;
    const linesDeleted = analysisObj?.linesRemoved || 0;
    const totalChanges = linesAdded + linesDeleted;

    const criticalIssues = workflow.reviewComments.filter(c => c.severity === 'CRITICAL').length;
    const highIssues = workflow.reviewComments.filter(c => c.severity === 'HIGH').length;
    const mediumIssues = workflow.reviewComments.filter(c => c.severity === 'MEDIUM').length;
    const lowIssues = workflow.reviewComments.filter(c => c.severity === 'LOW').length;

    return {
      size: {
        filesChanged,
        linesAdded,
        linesDeleted,
        totalChanges,
        score: Math.max(0, 100 - totalChanges / 10),
        assessment: this.assessSize(totalChanges),
      },
      complexity: {
        cyclomaticComplexity: 0, // Would need AST analysis
        cognitiveComplexity: 0,
        nestingDepth: 0,
        functionsModified: 0,
        score: 70, // Placeholder
        assessment: 'moderate',
      },
      quality: {
        criticalIssues,
        highIssues,
        mediumIssues,
        lowIssues,
        autoFixable: 0,
        score: Math.max(0, 100 - criticalIssues * 30 - highIssues * 15 - mediumIssues * 5),
        assessment: this.assessQuality(criticalIssues, highIssues),
      },
      testing: {
        hasNewTests: workflow.generatedTests.length > 0,
        testFilesAdded: workflow.generatedTests.length,
        estimatedCoverageChange: workflow.generatedTests.length * 5,
        untestedCodePaths: 0,
        score: workflow.generatedTests.length > 0 ? 80 : 40,
        assessment: workflow.generatedTests.length > 0 ? 'good' : 'needs_tests',
      },
      documentation: {
        hasDescription: !!workflow.prBody && workflow.prBody.length > 20,
        descriptionQuality: this.assessDescriptionQuality(workflow.prBody ?? null),
        hasLinkedIssues: workflow.prBody?.match(/#\d+/) !== null,
        hasChangelog: false,
        publicApiDocumented: false,
        score: this.scoreDocumentation(workflow),
      },
      review: {
        suggestedReviewers: 2,
        availableReviewers: 2,
        expertiseMatch: 75,
        previousReviewHistory: 80,
        score: 75,
      },
    };
  }

  private assessSize(totalChanges: number): 'excellent' | 'good' | 'moderate' | 'large' | 'too_large' {
    if (totalChanges < 50) return 'excellent';
    if (totalChanges < 200) return 'good';
    if (totalChanges < 500) return 'moderate';
    if (totalChanges < 1000) return 'large';
    return 'too_large';
  }

  private assessQuality(critical: number, high: number): 'clean' | 'minor_issues' | 'needs_attention' | 'problematic' {
    if (critical === 0 && high === 0) return 'clean';
    if (critical === 0 && high <= 2) return 'minor_issues';
    if (critical <= 1 && high <= 5) return 'needs_attention';
    return 'problematic';
  }

  private assessDescriptionQuality(body: string | null): 'excellent' | 'good' | 'minimal' | 'poor' | 'none' {
    if (!body) return 'none';
    if (body.length < 20) return 'poor';
    if (body.length < 100) return 'minimal';
    if (body.length < 300) return 'good';
    return 'excellent';
  }

  private async generatePredictions(
    workflowId: string,
    _features: {
      reviewerAvailability: number;
      repoAvgReviewLatencyMinutes: number;
      isWeekend: boolean;
      hourOfDay: number;
    },
    _workflow: { prNumber: number }
  ): Promise<PRPredictions> {
    // Get base prediction from existing service
    const basePrediction = await predictiveHealthService.predictMergeOutcome(workflowId);

    return {
      merge: {
        probability: basePrediction.mergeProbability,
        timeToMergeHours: basePrediction.predictedMergeTimeHours,
        confidenceInterval: {
          lower: basePrediction.predictedMergeTimeHours * 0.7,
          upper: basePrediction.predictedMergeTimeHours * 1.5,
        },
        predictedMergeDate: new Date(Date.now() + basePrediction.predictedMergeTimeHours * 3600000),
        factors: Object.entries(basePrediction.featureImportance).map(([name, weight]) => ({
          name,
          impact: weight > 0.15 ? 'negative' : 'neutral',
          weight,
          description: `${name} contributes ${Math.round(weight * 100)}% to prediction`,
        })),
      },
      review: {
        timeToFirstReviewHours: basePrediction.estimatedFirstReviewHours,
        expectedCycles: 1.5,
        optimalReviewTime: basePrediction.optimalReviewTime,
        likelyReviewers: [],
      },
      blockers: {
        probability: basePrediction.blockerProbability,
        blockers: basePrediction.predictedBlockers.map((desc, i) => ({
          type: 'critical_issue' as BlockerType,
          probability: 0.7,
          description: desc,
          severity: 'medium' as const,
          mitigation: 'Address the issue before requesting review',
          estimatedDelayHours: 4 * (i + 1),
        })),
        severityScore: basePrediction.blockerProbability * 100,
      },
      ci: {
        successProbability: 0.85,
        predictedFailures: [],
        expectedDurationMinutes: 10,
      },
    };
  }

  private identifyRisks(
    workflow: {
      analysis?: { riskLevel: string } | null;
      reviewComments: Array<{ severity: string; category: string; file?: string }>;
    },
    _features: { normalizedRisk: number },
    breakdown: HealthBreakdown
  ): RiskIndicator[] {
    const risks: RiskIndicator[] = [];

    // Security risks
    const securityIssues = workflow.reviewComments.filter(c => c.category === 'SECURITY');
    if (securityIssues.length > 0) {
      risks.push({
        id: 'security-issues',
        type: 'security',
        level: securityIssues.some(c => c.severity === 'CRITICAL') ? 'critical' : 'high',
        description: `${securityIssues.length} security issue(s) detected`,
        affectedFiles: securityIssues.map(c => c.file).filter(Boolean) as string[],
        impactScore: 90,
        mitigations: ['Address all security issues before merge', 'Request security team review'],
      });
    }

    // Size risk
    if (breakdown.size.assessment === 'too_large') {
      risks.push({
        id: 'size-too-large',
        type: 'maintainability',
        level: 'high',
        description: 'PR size is too large for effective review',
        impactScore: 70,
        mitigations: ['Split into smaller PRs', 'Use PR decomposition feature'],
      });
    }

    // Quality risk
    if (breakdown.quality.criticalIssues > 0) {
      risks.push({
        id: 'critical-issues',
        type: 'stability',
        level: 'critical',
        description: `${breakdown.quality.criticalIssues} critical issue(s) require immediate attention`,
        impactScore: 95,
        mitigations: ['Resolve all critical issues', 'Request additional review'],
      });
    }

    // Test coverage risk
    if (breakdown.testing.assessment === 'no_tests') {
      risks.push({
        id: 'no-tests',
        type: 'stability',
        level: 'medium',
        description: 'No tests added for new code',
        impactScore: 50,
        mitigations: ['Add unit tests', 'Use test generation feature'],
      });
    }

    return risks;
  }

  private generateRecommendations(
    factors: HealthFactors,
    breakdown: HealthBreakdown,
    risks: RiskIndicator[]
  ): HealthRecommendation[] {
    const recommendations: HealthRecommendation[] = [];

    // Critical issues first
    if (breakdown.quality.criticalIssues > 0) {
      recommendations.push({
        id: 'fix-critical',
        category: 'address_issues',
        priority: 'critical',
        title: 'Fix critical issues',
        description: `${breakdown.quality.criticalIssues} critical issues must be resolved`,
        actions: ['Review flagged critical issues', 'Apply suggested fixes', 'Re-run analysis'],
        estimatedImprovement: { healthScore: 20, mergeTime: 24 },
        effort: 'medium',
      });
    }

    // Size recommendation
    if (breakdown.size.assessment === 'too_large' || breakdown.size.assessment === 'large') {
      recommendations.push({
        id: 'split-pr',
        category: 'split_pr',
        priority: 'high',
        title: 'Consider splitting this PR',
        description: `With ${breakdown.size.totalChanges} lines changed, this PR may be difficult to review`,
        actions: ['Use PR decomposition wizard', 'Identify logical boundaries', 'Create smaller PRs'],
        estimatedImprovement: { healthScore: 15, mergeTime: 12 },
        effort: 'medium',
      });
    }

    // Test recommendation
    if (breakdown.testing.assessment === 'needs_tests' || breakdown.testing.assessment === 'no_tests') {
      recommendations.push({
        id: 'add-tests',
        category: 'add_tests',
        priority: factors.testCoverage < 50 ? 'high' : 'medium',
        title: 'Add tests for new code',
        description: 'Adding tests improves merge probability and reduces review cycles',
        actions: ['Generate tests using AI', 'Add unit tests for new functions', 'Verify edge cases'],
        estimatedImprovement: { healthScore: 10, mergeTime: 8 },
        effort: 'small',
      });
    }

    // Documentation recommendation
    if (breakdown.documentation.descriptionQuality === 'none' ||
        breakdown.documentation.descriptionQuality === 'poor') {
      recommendations.push({
        id: 'improve-description',
        category: 'improve_description',
        priority: 'medium',
        title: 'Improve PR description',
        description: 'A detailed description helps reviewers understand the changes',
        actions: ['Add summary of changes', 'Explain the "why"', 'Link related issues'],
        estimatedImprovement: { healthScore: 5, mergeTime: 4 },
        effort: 'trivial',
      });
    }

    // Timing recommendation
    if (factors.timing < 60) {
      recommendations.push({
        id: 'better-timing',
        category: 'improve_timing',
        priority: 'low',
        title: 'Submit during peak hours',
        description: 'PRs submitted during business hours get faster reviews',
        actions: ['Wait for Monday morning', 'Submit during 10 AM - 4 PM'],
        estimatedImprovement: { healthScore: 5, mergeTime: 12 },
        effort: 'trivial',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private async getHistoricalComparison(
    authorLogin: string,
    repositoryId: string,
    currentScore: number
  ): Promise<HistoricalComparison> {
    // Get author's recent PRs
    const authorWorkflows = await db.pRWorkflow.findMany({
      where: { authorLogin, repositoryId },
      include: { analysis: true, reviewComments: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const authorScores = authorWorkflows.map(w => this.estimateHealthScore(w));
    const authorAvgScore = authorScores.length > 0
      ? authorScores.reduce((a, b) => a + b, 0) / authorScores.length
      : 70;

    // Get repo PRs
    const repoWorkflows = await db.pRWorkflow.findMany({
      where: { repositoryId },
      include: { analysis: true, reviewComments: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const repoScores = repoWorkflows.map(w => this.estimateHealthScore(w));
    const repoAvgScore = repoScores.length > 0
      ? repoScores.reduce((a, b) => a + b, 0) / repoScores.length
      : 70;

    // Calculate percentiles
    const sortedRepoScores = [...repoScores].sort((a, b) => a - b);
    const authorPercentile = sortedRepoScores.length > 0
      ? (sortedRepoScores.filter(s => s < currentScore).length / sortedRepoScores.length) * 100
      : 50;

    // Determine trend
    let authorTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (authorScores.length >= 3) {
      const recent = authorScores.slice(0, 3);
      const older = authorScores.slice(3, 6);
      if (older.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        if (recentAvg > olderAvg + 5) authorTrend = 'improving';
        else if (recentAvg < olderAvg - 5) authorTrend = 'declining';
      }
    }

    return {
      authorAvgScore,
      authorPercentile,
      repoAvgScore,
      repoPercentile: authorPercentile,
      authorTrend,
      similarPRs: {
        avgMergeTimeHours: 24,
        avgCycles: 1.5,
        avgScore: repoAvgScore,
      },
    };
  }

  private estimateHealthScore(workflow: {
    analysis?: { riskLevel: string; filesModified: number; linesAdded: number; linesRemoved: number } | null;
    reviewComments: Array<{ severity: string }>;
    prTitle: string;
  }): number {
    let score = 70; // Base score

    // Adjust for size
    const totalChanges = (workflow.analysis?.linesAdded || 0) + (workflow.analysis?.linesRemoved || 0);
    if (totalChanges < 100) score += 10;
    else if (totalChanges > 500) score -= 15;
    else if (totalChanges > 1000) score -= 25;

    // Adjust for issues
    const criticalIssues = workflow.reviewComments.filter(c => c.severity === 'CRITICAL').length;
    const highIssues = workflow.reviewComments.filter(c => c.severity === 'HIGH').length;
    score -= criticalIssues * 15;
    score -= highIssues * 5;

    // Adjust for description
    if (workflow.prTitle && workflow.prTitle.length > 20) score += 5;

    return Math.max(0, Math.min(100, score));
  }

  private identifyBottlenecks(
    workflows: Array<{
      reviewComments: Array<{ category: string }>;
      analysis?: { riskLevel: string } | null;
    }>
  ): Array<{
    area: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    impact: string;
    recommendation: string;
  }> {
    const bottlenecks: Array<{
      area: string;
      severity: 'critical' | 'high' | 'medium' | 'low';
      impact: string;
      recommendation: string;
    }> = [];

    // Count common issues
    let securityCount = 0;
    let performanceCount = 0;
    let testingCount = 0;

    for (const w of workflows) {
      for (const c of w.reviewComments) {
        if (c.category === 'SECURITY') securityCount++;
        if (c.category === 'PERFORMANCE') performanceCount++;
        if (c.category === 'TESTING') testingCount++;
      }
    }

    const threshold = workflows.length * 0.3;

    if (securityCount > threshold) {
      bottlenecks.push({
        area: 'Security',
        severity: 'high',
        impact: 'Frequent security issues slow down merge velocity',
        recommendation: 'Consider security training or pre-commit hooks',
      });
    }

    if (performanceCount > threshold) {
      bottlenecks.push({
        area: 'Performance',
        severity: 'medium',
        impact: 'Performance issues require additional review cycles',
        recommendation: 'Add performance testing to CI pipeline',
      });
    }

    if (testingCount > threshold) {
      bottlenecks.push({
        area: 'Testing',
        severity: 'medium',
        impact: 'Missing tests delay PR approval',
        recommendation: 'Enable test generation and coverage requirements',
      });
    }

    return bottlenecks;
  }

  private calculateConfidence(
    features: { authorAvgMergeTimeHours: number; repoAvgMergeTimeHours: number },
    _workflow: unknown
  ): number {
    let confidence = 0.6;

    if (features.authorAvgMergeTimeHours > 0) confidence += 0.15;
    if (features.repoAvgMergeTimeHours > 0) confidence += 0.15;

    return Math.min(0.95, confidence);
  }

  private async storeHealthScore(healthScore: ComprehensivePRHealthScore): Promise<void> {
    try {
      await db.analyticsEvent.create({
        data: {
          repositoryId: '',
          workflowId: healthScore.workflowId,
          eventType: 'health_score',
          eventData: JSON.parse(JSON.stringify({
            workflowId: healthScore.workflowId,
            overallScore: healthScore.overallScore,
            grade: healthScore.grade,
            factors: healthScore.factors,
            calculatedAt: healthScore.calculatedAt.toISOString(),
          })),
        },
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to store health score');
    }
  }
}

export const enhancedPredictiveHealthService = new EnhancedPredictiveHealthService();
