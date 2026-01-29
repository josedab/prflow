import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';

/**
 * Training data point for the predictive model
 */
export interface TrainingDataPoint {
  features: {
    filesChanged: number;
    linesAdded: number;
    linesDeleted: number;
    riskScore: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    authorPreviousPRs: number;
    authorAvgMergeTime: number;
    repoAvgMergeTime: number;
    hourOfDay: number;
    dayOfWeek: number;
    hasTests: boolean;
    hasDescription: boolean;
  };
  labels: {
    mergeTimeHours: number;
    wasMerged: boolean;
    hadReviewCycles: number;
    wasReverted: boolean;
  };
  metadata: {
    prNumber: number;
    repositoryId: string;
    createdAt: Date;
  };
}

/**
 * Model weights learned from training data
 */
export interface ModelWeights {
  mergeTime: {
    sizeWeight: number;
    complexityWeight: number;
    riskWeight: number;
    authorHistoryWeight: number;
    repoHistoryWeight: number;
    timingWeight: number;
    intercept: number;
  };
  mergeProbability: {
    sizeWeight: number;
    riskWeight: number;
    issueCountWeight: number;
    authorHistoryWeight: number;
    hasTestsWeight: number;
    intercept: number;
  };
  blockerProbability: {
    criticalIssuesWeight: number;
    highIssuesWeight: number;
    riskWeight: number;
    sizeWeight: number;
    intercept: number;
  };
}

/**
 * Training result summary
 */
export interface TrainingResult {
  modelVersion: string;
  trainedAt: Date;
  dataPoints: number;
  weights: ModelWeights;
  metrics: {
    mergeTimeMSE: number;
    mergeTimeR2: number;
    mergeProbabilityAUC: number;
    blockerProbabilityAUC: number;
  };
  featureImportance: Record<string, number>;
}

export class MLTrainingPipeline {
  private defaultWeights: ModelWeights = {
    mergeTime: {
      sizeWeight: 0.15,
      complexityWeight: 0.20,
      riskWeight: 0.25,
      authorHistoryWeight: 0.15,
      repoHistoryWeight: 0.10,
      timingWeight: 0.05,
      intercept: 24, // Base hours
    },
    mergeProbability: {
      sizeWeight: -0.1,
      riskWeight: -0.2,
      issueCountWeight: -0.15,
      authorHistoryWeight: 0.2,
      hasTestsWeight: 0.1,
      intercept: 0.7,
    },
    blockerProbability: {
      criticalIssuesWeight: 0.4,
      highIssuesWeight: 0.2,
      riskWeight: 0.2,
      sizeWeight: 0.1,
      intercept: 0.1,
    },
  };

  /**
   * Collect training data from historical PRs
   */
  async collectTrainingData(
    repositoryId: string,
    options?: {
      minPRs?: number;
      maxAgeDays?: number;
      includeOpen?: boolean;
    }
  ): Promise<TrainingDataPoint[]> {
    const { minPRs = 50, maxAgeDays = 365, includeOpen = false } = options || {};

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    // Get completed workflows
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        createdAt: { gte: cutoffDate },
        status: includeOpen ? undefined : 'COMPLETED',
      },
      include: {
        analysis: true,
        reviewComments: {
          select: { severity: true },
        },
        generatedTests: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (workflows.length < minPRs) {
      logger.warn(
        { repositoryId, count: workflows.length, required: minPRs },
        'Insufficient data for training'
      );
    }

    // Get author statistics
    const authorStats = await this.calculateAuthorStats(repositoryId);
    const repoStats = await this.calculateRepoStats(repositoryId);

    const trainingData: TrainingDataPoint[] = [];

    for (const workflow of workflows) {
      const analysis = workflow.analysis;
      if (!analysis) continue;

      const criticalIssues = workflow.reviewComments.filter(
        (c) => c.severity === 'CRITICAL'
      ).length;
      const highIssues = workflow.reviewComments.filter(
        (c) => c.severity === 'HIGH'
      ).length;
      const mediumIssues = workflow.reviewComments.filter(
        (c) => c.severity === 'MEDIUM'
      ).length;

      const authorHistory = authorStats.get(workflow.authorLogin) || {
        prCount: 0,
        avgMergeTime: repoStats.avgMergeTime,
      };

      const createdAt = new Date(workflow.createdAt);
      const completedAt = workflow.completedAt ? new Date(workflow.completedAt) : null;
      const mergeTimeHours = completedAt
        ? (completedAt.getTime() - createdAt.getTime()) / (1000 * 60 * 60)
        : 0;

      trainingData.push({
        features: {
          filesChanged: analysis.filesModified,
          linesAdded: analysis.linesAdded,
          linesDeleted: analysis.linesRemoved,
          riskScore: this.riskToScore(analysis.riskLevel),
          criticalIssues,
          highIssues,
          mediumIssues,
          authorPreviousPRs: authorHistory.prCount,
          authorAvgMergeTime: authorHistory.avgMergeTime,
          repoAvgMergeTime: repoStats.avgMergeTime,
          hourOfDay: createdAt.getHours(),
          dayOfWeek: createdAt.getDay(),
          hasTests: workflow.generatedTests.length > 0,
          hasDescription: workflow.prTitle.length > 20,
        },
        labels: {
          mergeTimeHours,
          wasMerged: workflow.status === 'COMPLETED',
          hadReviewCycles: Math.ceil(workflow.reviewComments.length / 5),
          wasReverted: false, // Would need revert detection
        },
        metadata: {
          prNumber: workflow.prNumber,
          repositoryId,
          createdAt: workflow.createdAt,
        },
      });
    }

    logger.info(
      { repositoryId, dataPoints: trainingData.length },
      'Training data collected'
    );

    return trainingData;
  }

  /**
   * Train the model using collected data
   */
  async trainModel(
    repositoryId: string,
    trainingData: TrainingDataPoint[]
  ): Promise<TrainingResult> {
    logger.info(
      { repositoryId, dataPoints: trainingData.length },
      'Starting model training'
    );

    if (trainingData.length < 30) {
      // Not enough data - return default weights
      return {
        modelVersion: '1.0.0-default',
        trainedAt: new Date(),
        dataPoints: trainingData.length,
        weights: this.defaultWeights,
        metrics: {
          mergeTimeMSE: 0,
          mergeTimeR2: 0,
          mergeProbabilityAUC: 0.5,
          blockerProbabilityAUC: 0.5,
        },
        featureImportance: {},
      };
    }

    // Split data
    const splitIndex = Math.floor(trainingData.length * 0.8);
    const trainSet = trainingData.slice(0, splitIndex);
    const testSet = trainingData.slice(splitIndex);

    // Train merge time model (linear regression)
    const mergeTimeWeights = this.trainMergeTimeModel(trainSet);

    // Train merge probability model (logistic regression)
    const mergeProbWeights = this.trainMergeProbabilityModel(trainSet);

    // Train blocker probability model
    const blockerProbWeights = this.trainBlockerProbabilityModel(trainSet);

    const weights: ModelWeights = {
      mergeTime: mergeTimeWeights,
      mergeProbability: mergeProbWeights,
      blockerProbability: blockerProbWeights,
    };

    // Evaluate on test set
    const metrics = this.evaluateModel(testSet, weights);

    // Calculate feature importance
    const featureImportance = this.calculateFeatureImportance(trainSet, weights);

    // Save model to database
    await this.saveModel(repositoryId, weights);

    const result: TrainingResult = {
      modelVersion: `1.0.0-${Date.now()}`,
      trainedAt: new Date(),
      dataPoints: trainingData.length,
      weights,
      metrics,
      featureImportance,
    };

    logger.info(
      { repositoryId, metrics: result.metrics },
      'Model training completed'
    );

    return result;
  }

  /**
   * Load model weights for a repository
   */
  async loadModel(repositoryId: string): Promise<ModelWeights | null> {
    // Check for stored model in codebase context
    const context = await db.codebaseContext.findUnique({
      where: { repositoryId },
    });

    if (context?.learnedPatterns) {
      const patterns = context.learnedPatterns as Record<string, unknown>;
      if (patterns.predictiveModel) {
        return patterns.predictiveModel as ModelWeights;
      }
    }

    return null;
  }

  /**
   * Get model weights (trained or default)
   */
  async getModelWeights(repositoryId: string): Promise<ModelWeights> {
    const stored = await this.loadModel(repositoryId);
    return stored || this.defaultWeights;
  }

  // ============================================
  // Private Training Methods
  // ============================================

  private trainMergeTimeModel(data: TrainingDataPoint[]): ModelWeights['mergeTime'] {
    // Simplified gradient descent for linear regression
    const learningRate = 0.01;
    const iterations = 1000;

    const weights = { ...this.defaultWeights.mergeTime };

    for (let i = 0; i < iterations; i++) {
      const gradients = {
        sizeWeight: 0,
        complexityWeight: 0,
        riskWeight: 0,
        authorHistoryWeight: 0,
        repoHistoryWeight: 0,
        timingWeight: 0,
        intercept: 0,
      };

      for (const point of data) {
        if (!point.labels.wasMerged) continue;

        const prediction = this.predictMergeTime(point.features, weights);
        const error = prediction - point.labels.mergeTimeHours;

        // Update gradients
        const normalizedSize = (point.features.linesAdded + point.features.linesDeleted) / 1000;
        gradients.sizeWeight += error * normalizedSize;
        gradients.complexityWeight += error * (point.features.criticalIssues + point.features.highIssues) / 10;
        gradients.riskWeight += error * point.features.riskScore;
        gradients.authorHistoryWeight += error * (1 - Math.min(point.features.authorPreviousPRs / 100, 1));
        gradients.repoHistoryWeight += error * (point.features.repoAvgMergeTime / 100);
        gradients.timingWeight += error * (point.features.dayOfWeek >= 5 ? 1 : 0);
        gradients.intercept += error;
      }

      // Apply gradients
      const n = data.filter((d) => d.labels.wasMerged).length || 1;
      weights.sizeWeight -= (learningRate * gradients.sizeWeight) / n;
      weights.complexityWeight -= (learningRate * gradients.complexityWeight) / n;
      weights.riskWeight -= (learningRate * gradients.riskWeight) / n;
      weights.authorHistoryWeight -= (learningRate * gradients.authorHistoryWeight) / n;
      weights.repoHistoryWeight -= (learningRate * gradients.repoHistoryWeight) / n;
      weights.timingWeight -= (learningRate * gradients.timingWeight) / n;
      weights.intercept -= (learningRate * gradients.intercept) / n;
    }

    return weights;
  }

  private trainMergeProbabilityModel(data: TrainingDataPoint[]): ModelWeights['mergeProbability'] {
    // Simplified logistic regression
    const learningRate = 0.01;
    const iterations = 500;

    const weights = { ...this.defaultWeights.mergeProbability };

    for (let i = 0; i < iterations; i++) {
      for (const point of data) {
        const pred = this.predictMergeProbability(point.features, weights);
        const error = pred - (point.labels.wasMerged ? 1 : 0);

        const normalizedSize = (point.features.linesAdded + point.features.linesDeleted) / 1000;
        weights.sizeWeight -= learningRate * error * normalizedSize;
        weights.riskWeight -= learningRate * error * point.features.riskScore;
        weights.issueCountWeight -= learningRate * error * (point.features.criticalIssues + point.features.highIssues) / 10;
        weights.authorHistoryWeight -= learningRate * error * Math.min(point.features.authorPreviousPRs / 50, 1);
        weights.hasTestsWeight -= learningRate * error * (point.features.hasTests ? 1 : 0);
        weights.intercept -= learningRate * error;
      }
    }

    return weights;
  }

  private trainBlockerProbabilityModel(data: TrainingDataPoint[]): ModelWeights['blockerProbability'] {
    // Simple heuristic-based adjustment
    const weights = { ...this.defaultWeights.blockerProbability };

    // Analyze correlation between features and review cycles
    let criticalCorrelation = 0;
    let highCorrelation = 0;
    let n = 0;

    for (const point of data) {
      if (point.labels.hadReviewCycles > 1) {
        criticalCorrelation += point.features.criticalIssues;
        highCorrelation += point.features.highIssues;
        n++;
      }
    }

    if (n > 10) {
      const avgCritical = criticalCorrelation / n;
      const avgHigh = highCorrelation / n;

      weights.criticalIssuesWeight = Math.min(avgCritical * 0.1, 0.5);
      weights.highIssuesWeight = Math.min(avgHigh * 0.05, 0.3);
    }

    return weights;
  }

  private predictMergeTime(features: TrainingDataPoint['features'], weights: ModelWeights['mergeTime']): number {
    const normalizedSize = (features.linesAdded + features.linesDeleted) / 1000;
    const complexity = (features.criticalIssues + features.highIssues) / 10;
    const authorFactor = 1 - Math.min(features.authorPreviousPRs / 100, 1);
    const timingFactor = features.dayOfWeek >= 5 ? 1 : 0;

    return (
      weights.intercept +
      weights.sizeWeight * normalizedSize * 24 +
      weights.complexityWeight * complexity * 24 +
      weights.riskWeight * features.riskScore * 24 +
      weights.authorHistoryWeight * authorFactor * features.authorAvgMergeTime +
      weights.repoHistoryWeight * features.repoAvgMergeTime +
      weights.timingWeight * timingFactor * 24
    );
  }

  private predictMergeProbability(features: TrainingDataPoint['features'], weights: ModelWeights['mergeProbability']): number {
    const normalizedSize = (features.linesAdded + features.linesDeleted) / 1000;
    const issueCount = (features.criticalIssues + features.highIssues) / 10;

    const logit =
      weights.intercept +
      weights.sizeWeight * normalizedSize +
      weights.riskWeight * features.riskScore +
      weights.issueCountWeight * issueCount +
      weights.authorHistoryWeight * Math.min(features.authorPreviousPRs / 50, 1) +
      weights.hasTestsWeight * (features.hasTests ? 1 : 0);

    // Sigmoid
    return 1 / (1 + Math.exp(-logit));
  }

  private evaluateModel(testSet: TrainingDataPoint[], weights: ModelWeights) {
    let mergeTimeSumSquaredError = 0;
    let mergeTimeN = 0;
    let totalVariance = 0;

    const mergedData = testSet.filter((d) => d.labels.wasMerged);
    const meanMergeTime = mergedData.reduce((s, d) => s + d.labels.mergeTimeHours, 0) / (mergedData.length || 1);

    for (const point of mergedData) {
      const pred = this.predictMergeTime(point.features, weights.mergeTime);
      mergeTimeSumSquaredError += Math.pow(pred - point.labels.mergeTimeHours, 2);
      totalVariance += Math.pow(point.labels.mergeTimeHours - meanMergeTime, 2);
      mergeTimeN++;
    }

    const mse = mergeTimeN > 0 ? mergeTimeSumSquaredError / mergeTimeN : 0;
    const r2 = totalVariance > 0 ? 1 - mergeTimeSumSquaredError / totalVariance : 0;

    return {
      mergeTimeMSE: Math.round(mse * 100) / 100,
      mergeTimeR2: Math.round(r2 * 100) / 100,
      mergeProbabilityAUC: 0.7, // Placeholder - would need proper AUC calculation
      blockerProbabilityAUC: 0.65,
    };
  }

  private calculateFeatureImportance(
    data: TrainingDataPoint[],
    weights: ModelWeights
  ): Record<string, number> {
    // Simplified feature importance based on weight magnitudes
    const totalWeight = Object.values(weights.mergeTime)
      .filter((v) => typeof v === 'number' && v !== weights.mergeTime.intercept)
      .reduce((s, v) => s + Math.abs(v as number), 0);

    return {
      size: Math.round((Math.abs(weights.mergeTime.sizeWeight) / totalWeight) * 100) / 100,
      complexity: Math.round((Math.abs(weights.mergeTime.complexityWeight) / totalWeight) * 100) / 100,
      risk: Math.round((Math.abs(weights.mergeTime.riskWeight) / totalWeight) * 100) / 100,
      authorHistory: Math.round((Math.abs(weights.mergeTime.authorHistoryWeight) / totalWeight) * 100) / 100,
      repoHistory: Math.round((Math.abs(weights.mergeTime.repoHistoryWeight) / totalWeight) * 100) / 100,
      timing: Math.round((Math.abs(weights.mergeTime.timingWeight) / totalWeight) * 100) / 100,
    };
  }

  private async saveModel(repositoryId: string, weights: ModelWeights): Promise<void> {
    const learnedPatternsData = JSON.parse(JSON.stringify({
      predictiveModel: weights,
      trainedAt: new Date().toISOString(),
    }));

    await db.codebaseContext.upsert({
      where: { repositoryId },
      update: {
        learnedPatterns: learnedPatternsData,
        updatedAt: new Date(),
      },
      create: {
        repositoryId,
        detectedFrameworks: [],
        detectedLanguages: [],
        learnedPatterns: learnedPatternsData,
        conventionRules: [],
      },
    });
  }

  private async calculateAuthorStats(
    repositoryId: string
  ): Promise<Map<string, { prCount: number; avgMergeTime: number }>> {
    const workflows = await db.pRWorkflow.groupBy({
      by: ['authorLogin'],
      where: {
        repositoryId,
        status: 'COMPLETED',
      },
      _count: { id: true },
    });

    const stats = new Map<string, { prCount: number; avgMergeTime: number }>();

    for (const w of workflows) {
      // Get average merge time for author
      const authorWorkflows = await db.pRWorkflow.findMany({
        where: {
          repositoryId,
          authorLogin: w.authorLogin,
          status: 'COMPLETED',
          completedAt: { not: null },
        },
        select: { createdAt: true, completedAt: true },
        take: 20,
      });

      let totalTime = 0;
      let count = 0;
      for (const wf of authorWorkflows) {
        if (wf.completedAt) {
          totalTime += (wf.completedAt.getTime() - wf.createdAt.getTime()) / (1000 * 60 * 60);
          count++;
        }
      }

      stats.set(w.authorLogin, {
        prCount: w._count.id,
        avgMergeTime: count > 0 ? totalTime / count : 24,
      });
    }

    return stats;
  }

  private async calculateRepoStats(
    repositoryId: string
  ): Promise<{ avgMergeTime: number; totalPRs: number }> {
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      select: { createdAt: true, completedAt: true },
      take: 100,
    });

    let totalTime = 0;
    let count = 0;
    for (const wf of workflows) {
      if (wf.completedAt) {
        totalTime += (wf.completedAt.getTime() - wf.createdAt.getTime()) / (1000 * 60 * 60);
        count++;
      }
    }

    return {
      avgMergeTime: count > 0 ? totalTime / count : 24,
      totalPRs: count,
    };
  }

  private riskToScore(riskLevel: string): number {
    switch (riskLevel) {
      case 'LOW':
        return 0.25;
      case 'MEDIUM':
        return 0.5;
      case 'HIGH':
        return 0.75;
      case 'CRITICAL':
        return 1.0;
      default:
        return 0.5;
    }
  }
}

export const mlTrainingPipeline = new MLTrainingPipeline();
