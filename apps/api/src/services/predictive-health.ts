import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';

/**
 * Feature vector for PR merge prediction
 */
export interface PRFeatureVector {
  // Size metrics
  filesChanged: number;
  linesAdded: number;
  linesDeleted: number;
  totalChanges: number;
  
  // Complexity metrics
  riskScore: number;
  criticalIssues: number;
  highIssues: number;
  mediumIssues: number;
  
  // Historical metrics
  authorAvgMergeTimeHours: number;
  authorMergeRate: number;
  repoAvgMergeTimeHours: number;
  repoAvgReviewLatencyMinutes: number;
  
  // PR metadata
  prAge: number; // hours since creation
  hasDescription: boolean;
  hasTests: boolean;
  isWeekend: boolean;
  hourOfDay: number;
  
  // Team metrics
  potentialReviewers: number;
  reviewerAvailability: number; // 0-1 score
  
  // Normalized scores (0-1)
  normalizedSize: number;
  normalizedComplexity: number;
  normalizedRisk: number;
}

/**
 * Prediction result for a PR
 */
export interface PRPrediction {
  workflowId: string;
  prNumber: number;
  
  // Primary predictions
  predictedMergeTimeHours: number;
  mergeTimeConfidence: number;
  mergeProbability: number;
  
  // Risk factors
  blockerProbability: number;
  predictedBlockers: string[];
  
  // Timing recommendations
  optimalReviewTime: string;
  estimatedFirstReviewHours: number;
  
  // Additional fields
  riskFactors?: string[];
  recommendations?: string[];
  
  // Feature importance (what's driving the prediction)
  featureImportance: Record<string, number>;
  
  predictedAt: Date;
  
  // Model info
  modelUsed?: 'heuristic' | 'trained';
}

/**
 * Historical PR data for model training (reserved for future ML implementation)
 */
// interface HistoricalPR {
//   filesChanged: number;
//   linesAdded: number;
//   linesDeleted: number;
//   riskLevel: string;
//   criticalIssues: number;
//   highIssues: number;
//   mergeTimeHours: number | null;
//   wasMerged: boolean;
//   hadBlockers: boolean;
// }

// Model weights (would be trained in production)
// const MODEL_WEIGHTS = {
//   size: -0.15,
//   complexity: -0.20,
//   risk: -0.25,
//   authorHistory: 0.15,
//   repoHistory: 0.10,
//   timing: 0.05,
//   teamAvailability: 0.10,
//   testCoverage: 0.10,
//   descriptionQuality: 0.05,
//   intercept: 75,
// };

// Time-based adjustments
const TIME_ADJUSTMENTS = {
  weekend: 1.5,
  afterHours: 1.3, // 6pm-8am
  primeTime: 0.8, // 10am-4pm
};

export class PredictiveHealthService {
  /**
   * Extract features from a workflow for prediction
   */
  async extractFeatures(workflowId: string): Promise<PRFeatureVector> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        analysis: true,
        reviewComments: true,
        generatedTests: true,
        repository: true,
      },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Get author historical data
    const authorHistory = await this.getAuthorHistory(workflow.authorLogin, workflow.repositoryId);
    
    // Get repository historical data
    const repoHistory = await this.getRepoHistory(workflow.repositoryId);

    // Calculate basic metrics
    const filesChanged = workflow.analysis?.filesModified || 0;
    const linesAdded = workflow.analysis?.linesAdded || 0;
    const linesDeleted = workflow.analysis?.linesRemoved || 0;
    const totalChanges = linesAdded + linesDeleted;

    // Count issues by severity
    const criticalIssues = workflow.reviewComments.filter((c) => c.severity === 'CRITICAL').length;
    const highIssues = workflow.reviewComments.filter((c) => c.severity === 'HIGH').length;
    const mediumIssues = workflow.reviewComments.filter((c) => c.severity === 'MEDIUM').length;

    // Calculate risk score
    const riskScore = this.calculateRiskScore(workflow.analysis?.riskLevel || 'MEDIUM');

    // PR age
    const prAge = (Date.now() - new Date(workflow.createdAt).getTime()) / 3600000;

    // Time-based features
    const now = new Date();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const hourOfDay = now.getHours();

    // Team availability (simplified - would use actual team calendar in production)
    const potentialReviewers = await this.countPotentialReviewers(workflow.repositoryId);
    const reviewerAvailability = this.estimateReviewerAvailability(hourOfDay, isWeekend);

    // Normalized scores
    const normalizedSize = Math.min(totalChanges / 1000, 1);
    const normalizedComplexity = Math.min((criticalIssues * 3 + highIssues * 2 + mediumIssues) / 20, 1);
    const normalizedRisk = riskScore / 100;

    return {
      filesChanged,
      linesAdded,
      linesDeleted,
      totalChanges,
      riskScore,
      criticalIssues,
      highIssues,
      mediumIssues,
      authorAvgMergeTimeHours: authorHistory.avgMergeTimeHours,
      authorMergeRate: authorHistory.mergeRate,
      repoAvgMergeTimeHours: repoHistory.avgMergeTimeHours,
      repoAvgReviewLatencyMinutes: repoHistory.avgReviewLatencyMinutes,
      prAge,
      hasDescription: !!workflow.prTitle && workflow.prTitle.length > 10,
      hasTests: workflow.generatedTests.length > 0,
      isWeekend,
      hourOfDay,
      potentialReviewers,
      reviewerAvailability,
      normalizedSize,
      normalizedComplexity,
      normalizedRisk,
    };
  }

  /**
   * Generate prediction for a PR
   */
  async predictMergeOutcome(workflowId: string): Promise<PRPrediction> {
    const features = await this.extractFeatures(workflowId);
    
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Calculate base merge time prediction
    let baseMergeTimeHours = this.predictBaseMergeTime(features);
    
    // Apply time-based adjustments
    if (features.isWeekend) {
      baseMergeTimeHours *= TIME_ADJUSTMENTS.weekend;
    } else if (features.hourOfDay < 8 || features.hourOfDay > 18) {
      baseMergeTimeHours *= TIME_ADJUSTMENTS.afterHours;
    } else if (features.hourOfDay >= 10 && features.hourOfDay <= 16) {
      baseMergeTimeHours *= TIME_ADJUSTMENTS.primeTime;
    }

    // Calculate merge probability
    const mergeProbability = this.predictMergeProbability(features);
    
    // Identify potential blockers
    const { blockerProbability, predictedBlockers } = this.predictBlockers(features);
    
    // Calculate confidence based on data availability
    const confidence = this.calculateConfidence(features);

    // Calculate optimal review time
    const optimalReviewTime = this.calculateOptimalReviewTime(features);

    // Estimate time to first review
    const estimatedFirstReviewHours = this.estimateFirstReviewTime(features);

    // Feature importance for explainability
    const featureImportance = this.calculateFeatureImportance(features);

    const prediction: PRPrediction = {
      workflowId,
      prNumber: workflow.prNumber,
      predictedMergeTimeHours: Math.round(baseMergeTimeHours * 10) / 10,
      mergeTimeConfidence: confidence,
      mergeProbability,
      blockerProbability,
      predictedBlockers,
      optimalReviewTime,
      estimatedFirstReviewHours: Math.round(estimatedFirstReviewHours * 10) / 10,
      featureImportance,
      predictedAt: new Date(),
    };

    // Store prediction for model improvement
    await this.storePrediction(prediction, features);

    logger.info({ workflowId, prediction: prediction.predictedMergeTimeHours }, 'PR prediction generated');

    return prediction;
  }

  /**
   * Predict base merge time using weighted features
   */
  private predictBaseMergeTime(features: PRFeatureVector): number {
    // Start with historical average
    let prediction = features.repoAvgMergeTimeHours > 0 
      ? features.repoAvgMergeTimeHours 
      : 24; // Default 24 hours

    // Adjust based on size
    if (features.totalChanges > 500) {
      prediction *= 1 + (features.normalizedSize * 0.5);
    } else if (features.totalChanges < 100) {
      prediction *= 0.7;
    }

    // Adjust based on risk
    prediction *= 1 + (features.normalizedRisk * 0.4);

    // Adjust based on complexity
    prediction *= 1 + (features.normalizedComplexity * 0.3);

    // Adjust based on author history
    if (features.authorAvgMergeTimeHours > 0) {
      prediction = prediction * 0.7 + features.authorAvgMergeTimeHours * 0.3;
    }

    // Adjust based on reviewer availability
    prediction *= 2 - features.reviewerAvailability;

    // Minimum and maximum bounds
    return Math.max(1, Math.min(168, prediction)); // 1 hour to 1 week
  }

  /**
   * Predict probability of successful merge
   */
  private predictMergeProbability(features: PRFeatureVector): number {
    let probability = 0.85; // Base probability

    // Reduce for critical issues
    probability -= features.criticalIssues * 0.1;

    // Reduce for high complexity
    probability -= features.normalizedComplexity * 0.1;

    // Reduce for high risk
    probability -= features.normalizedRisk * 0.1;

    // Boost for good author history
    probability += (features.authorMergeRate - 0.5) * 0.2;

    // Boost for having tests
    if (features.hasTests) {
      probability += 0.05;
    }

    // Boost for good description
    if (features.hasDescription) {
      probability += 0.03;
    }

    return Math.max(0.1, Math.min(0.99, probability));
  }

  /**
   * Predict potential blockers
   */
  private predictBlockers(features: PRFeatureVector): {
    blockerProbability: number;
    predictedBlockers: string[];
  } {
    const blockers: string[] = [];
    let blockerProbability = 0;

    // Check for critical issues
    if (features.criticalIssues > 0) {
      blockers.push(`${features.criticalIssues} critical issue(s) require resolution`);
      blockerProbability += 0.3;
    }

    // Check for high complexity
    if (features.normalizedComplexity > 0.7) {
      blockers.push('High complexity may require multiple review cycles');
      blockerProbability += 0.2;
    }

    // Check for large size
    if (features.normalizedSize > 0.8) {
      blockers.push('Large PR size may slow review process');
      blockerProbability += 0.15;
    }

    // Check for high risk
    if (features.normalizedRisk > 0.7) {
      blockers.push('High risk level may require additional approvals');
      blockerProbability += 0.2;
    }

    // Check reviewer availability
    if (features.reviewerAvailability < 0.3) {
      blockers.push('Low reviewer availability may delay review');
      blockerProbability += 0.15;
    }

    // Weekend/after-hours
    if (features.isWeekend) {
      blockers.push('Weekend submission may delay first review');
      blockerProbability += 0.1;
    }

    return {
      blockerProbability: Math.min(0.95, blockerProbability),
      predictedBlockers: blockers,
    };
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(features: PRFeatureVector): number {
    let confidence = 0.5; // Base confidence

    // More historical data = higher confidence
    if (features.authorAvgMergeTimeHours > 0) {
      confidence += 0.15;
    }
    if (features.repoAvgMergeTimeHours > 0) {
      confidence += 0.15;
    }

    // More reviewers = more predictable
    if (features.potentialReviewers >= 3) {
      confidence += 0.1;
    }

    // Less extreme values = higher confidence
    if (features.normalizedSize < 0.5 && features.normalizedComplexity < 0.5) {
      confidence += 0.1;
    }

    return Math.min(0.95, confidence);
  }

  /**
   * Calculate optimal time for review
   */
  private calculateOptimalReviewTime(_features: PRFeatureVector): string {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const hour = now.getHours();

    // If it's weekend, suggest Monday morning
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'Monday 10:00 AM';
    }

    // If it's late evening, suggest next morning
    if (hour >= 18) {
      return 'Tomorrow 10:00 AM';
    }

    // If it's very early, suggest prime time
    if (hour < 9) {
      return 'Today 10:00 AM';
    }

    // Prime time is now
    if (hour >= 10 && hour <= 15) {
      return 'Now (prime review time)';
    }

    return 'Within 2 hours';
  }

  /**
   * Estimate time to first review
   */
  private estimateFirstReviewTime(features: PRFeatureVector): number {
    let estimate = features.repoAvgReviewLatencyMinutes > 0
      ? features.repoAvgReviewLatencyMinutes / 60
      : 4; // Default 4 hours

    // Adjust for reviewer availability
    estimate *= 2 - features.reviewerAvailability;

    // Adjust for time of day
    if (features.isWeekend) {
      estimate += 24; // Add a day for weekend
    } else if (features.hourOfDay < 8 || features.hourOfDay > 18) {
      estimate += 12; // Add half day for after hours
    }

    return Math.max(0.5, estimate);
  }

  /**
   * Calculate feature importance for explainability
   */
  private calculateFeatureImportance(features: PRFeatureVector): Record<string, number> {
    const total = 
      features.normalizedSize * 0.2 +
      features.normalizedComplexity * 0.25 +
      features.normalizedRisk * 0.25 +
      (1 - features.reviewerAvailability) * 0.15 +
      (features.authorMergeRate > 0 ? (1 - features.authorMergeRate) * 0.15 : 0.15);

    return {
      'PR Size': Math.round((features.normalizedSize * 0.2 / total) * 100) / 100,
      'Code Complexity': Math.round((features.normalizedComplexity * 0.25 / total) * 100) / 100,
      'Risk Level': Math.round((features.normalizedRisk * 0.25 / total) * 100) / 100,
      'Reviewer Availability': Math.round(((1 - features.reviewerAvailability) * 0.15 / total) * 100) / 100,
      'Author History': Math.round(0.15 * 100 / total) / 100,
    };
  }

  /**
   * Calculate risk factors based on features
   */
  private calculateRiskFactors(features: PRFeatureVector): string[] {
    const factors: string[] = [];

    if (features.criticalIssues > 0) {
      factors.push(`${features.criticalIssues} critical issues detected`);
    }
    if (features.highIssues > 2) {
      factors.push(`High number of issues (${features.highIssues} high severity)`);
    }
    if (features.normalizedSize > 0.7) {
      factors.push('Large PR size may slow review');
    }
    if (features.normalizedComplexity > 0.6) {
      factors.push('High code complexity');
    }
    if (features.reviewerAvailability < 0.4) {
      factors.push('Low reviewer availability');
    }
    if (features.isWeekend) {
      factors.push('Created during weekend - expect delays');
    }
    if (!features.hasDescription) {
      factors.push('Missing or short PR description');
    }
    if (!features.hasTests) {
      factors.push('No tests generated or added');
    }

    return factors;
  }

  /**
   * Generate recommendations based on features
   */
  private generateRecommendations(features: PRFeatureVector): string[] {
    const recommendations: string[] = [];

    if (features.normalizedSize > 0.5) {
      recommendations.push('Consider splitting this PR into smaller changes');
    }
    if (features.criticalIssues > 0) {
      recommendations.push('Address critical issues before requesting review');
    }
    if (!features.hasTests) {
      recommendations.push('Add tests to improve merge probability');
    }
    if (!features.hasDescription) {
      recommendations.push('Add a detailed PR description');
    }
    if (features.reviewerAvailability < 0.5 && !features.isWeekend) {
      recommendations.push('Consider requesting review during peak hours (10 AM - 4 PM)');
    }
    if (features.normalizedComplexity > 0.6) {
      recommendations.push('Add comments explaining complex logic');
    }

    return recommendations;
  }

  /**
   * Get historical data for an author
   */
  private async getAuthorHistory(
    authorLogin: string,
    repositoryId: string
  ): Promise<{ avgMergeTimeHours: number; mergeRate: number }> {
    const authorWorkflows = await db.pRWorkflow.findMany({
      where: {
        authorLogin,
        repositoryId,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        completedAt: true,
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    if (authorWorkflows.length === 0) {
      return { avgMergeTimeHours: 0, mergeRate: 0.8 };
    }

    const mergeTimes = authorWorkflows
      .filter((w) => w.completedAt)
      .map((w) => (new Date(w.completedAt!).getTime() - new Date(w.createdAt).getTime()) / 3600000);

    const avgMergeTimeHours = mergeTimes.length > 0
      ? mergeTimes.reduce((a, b) => a + b, 0) / mergeTimes.length
      : 0;

    return {
      avgMergeTimeHours,
      mergeRate: 0.85, // Simplified - would calculate actual merge rate
    };
  }

  /**
   * Get historical data for a repository
   */
  private async getRepoHistory(
    repositoryId: string
  ): Promise<{ avgMergeTimeHours: number; avgReviewLatencyMinutes: number }> {
    const recentWorkflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      select: {
        createdAt: true,
        startedAt: true,
        completedAt: true,
      },
      take: 50,
      orderBy: { createdAt: 'desc' },
    });

    if (recentWorkflows.length === 0) {
      return { avgMergeTimeHours: 24, avgReviewLatencyMinutes: 240 };
    }

    const mergeTimes = recentWorkflows
      .filter((w) => w.completedAt)
      .map((w) => (new Date(w.completedAt!).getTime() - new Date(w.createdAt).getTime()) / 3600000);

    const reviewLatencies = recentWorkflows
      .filter((w) => w.startedAt)
      .map((w) => (new Date(w.startedAt!).getTime() - new Date(w.createdAt).getTime()) / 60000);

    return {
      avgMergeTimeHours: mergeTimes.length > 0
        ? mergeTimes.reduce((a, b) => a + b, 0) / mergeTimes.length
        : 24,
      avgReviewLatencyMinutes: reviewLatencies.length > 0
        ? reviewLatencies.reduce((a, b) => a + b, 0) / reviewLatencies.length
        : 240,
    };
  }

  /**
   * Count potential reviewers for a repository
   */
  private async countPotentialReviewers(repositoryId: string): Promise<number> {
    // Simplified - would check team members and CODEOWNERS
    const recentReviewers = await db.pRWorkflow.findMany({
      where: { repositoryId },
      select: { authorLogin: true },
      distinct: ['authorLogin'],
      take: 20,
    });

    return Math.max(1, recentReviewers.length);
  }

  /**
   * Estimate reviewer availability based on time
   */
  private estimateReviewerAvailability(hourOfDay: number, isWeekend: boolean): number {
    if (isWeekend) return 0.2;
    
    // Prime time: 10am-4pm
    if (hourOfDay >= 10 && hourOfDay <= 16) return 0.9;
    
    // Work hours: 8am-6pm
    if (hourOfDay >= 8 && hourOfDay <= 18) return 0.7;
    
    // After hours
    return 0.3;
  }

  /**
   * Calculate risk score from risk level
   */
  private calculateRiskScore(riskLevel: string): number {
    const scores: Record<string, number> = {
      LOW: 20,
      MEDIUM: 50,
      HIGH: 75,
      CRITICAL: 95,
    };
    return scores[riskLevel] || 50;
  }

  /**
   * Store prediction for model improvement
   */
  private async storePrediction(
    prediction: PRPrediction,
    features: PRFeatureVector
  ): Promise<void> {
    try {
      await db.analyticsEvent.create({
        data: {
          repositoryId: '', // Would need to get from workflow
          workflowId: prediction.workflowId,
          eventType: 'pr_prediction',
          eventData: JSON.parse(JSON.stringify({
            prediction: {
              ...prediction,
              predictedAt: prediction.predictedAt.toISOString(),
            },
            features,
          })),
        },
      });
    } catch (error) {
      logger.warn({ error }, 'Failed to store prediction');
    }
  }

  /**
   * Get prediction accuracy metrics
   */
  async getModelAccuracy(repositoryId: string): Promise<{
    totalPredictions: number;
    avgMergeTimeError: number;
    mergeProbabilityAccuracy: number;
    blockerPredictionAccuracy: number;
  }> {
    // Get completed predictions with actual outcomes
    const predictions = await db.analyticsEvent.findMany({
      where: {
        repositoryId,
        eventType: 'pr_prediction',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    if (predictions.length === 0) {
      return {
        totalPredictions: 0,
        avgMergeTimeError: 0,
        mergeProbabilityAccuracy: 0,
        blockerPredictionAccuracy: 0,
      };
    }

    // Calculate accuracy metrics from stored predictions
    let totalError = 0;
    let correctMergePredictions = 0;
    const correctBlockerPredictions = 0;
    let validPredictions = 0;

    for (const event of predictions) {
      const data = event.eventData as {
        prediction?: { workflowId: string; predictedMergeTimeHours: number; mergeProbability: number };
        actualOutcome?: { mergeTimeHours: number; didMerge: boolean; hadBlocker: boolean };
      };
      
      if (data.prediction && data.actualOutcome) {
        validPredictions++;
        totalError += Math.abs(data.prediction.predictedMergeTimeHours - data.actualOutcome.mergeTimeHours);
        
        const predictedMerge = data.prediction.mergeProbability > 0.5;
        if (predictedMerge === data.actualOutcome.didMerge) {
          correctMergePredictions++;
        }
      }
    }

    return {
      totalPredictions: predictions.length,
      avgMergeTimeError: validPredictions > 0 ? totalError / validPredictions : 0,
      mergeProbabilityAccuracy: validPredictions > 0 ? correctMergePredictions / validPredictions : 0,
      blockerPredictionAccuracy: validPredictions > 0 ? correctBlockerPredictions / validPredictions : 0,
    };
  }

  /**
   * Train model using historical data for a repository
   * Stores learned weights in the database for personalized predictions
   */
  async trainModel(repositoryId: string): Promise<{
    trainedOn: number;
    modelVersion: string;
    featureImportance: Record<string, number>;
    metrics: {
      avgError: number;
      r2Score: number;
    };
  }> {
    logger.info({ repositoryId }, 'Training predictive model');

    // Get completed PRs with outcomes
    const completedWorkflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId,
        status: 'COMPLETED',
        completedAt: { not: null },
      },
      include: {
        analysis: true,
        reviewComments: true,
        generatedTests: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    if (completedWorkflows.length < 10) {
      throw new Error('Insufficient data for training (need at least 10 completed PRs)');
    }

    // Extract features and outcomes
    const trainingData: Array<{
      features: PRFeatureVector;
      actualMergeTimeHours: number;
    }> = [];

    for (const workflow of completedWorkflows) {
      if (!workflow.completedAt) continue;

      const mergeTimeHours = (workflow.completedAt.getTime() - workflow.createdAt.getTime()) / 3600000;
      
      // Build feature vector
      const features = await this.buildTrainingFeatures(workflow);
      
      trainingData.push({
        features,
        actualMergeTimeHours: mergeTimeHours,
      });
    }

    // Simple linear regression to learn feature weights
    const weights = this.performLinearRegression(trainingData);

    // Calculate feature importance
    const featureImportance: Record<string, number> = {};
    let totalWeight = 0;
    for (const [key, weight] of Object.entries(weights)) {
      const absWeight = Math.abs(weight);
      featureImportance[key] = absWeight;
      totalWeight += absWeight;
    }
    
    // Normalize to percentages
    for (const key of Object.keys(featureImportance)) {
      featureImportance[key] = totalWeight > 0 ? featureImportance[key] / totalWeight : 0;
    }

    // Calculate model metrics
    let totalError = 0;
    let totalVariance = 0;
    const meanActual = trainingData.reduce((sum, d) => sum + d.actualMergeTimeHours, 0) / trainingData.length;

    for (const data of trainingData) {
      const predicted = this.applyWeights(data.features, weights);
      totalError += Math.pow(predicted - data.actualMergeTimeHours, 2);
      totalVariance += Math.pow(data.actualMergeTimeHours - meanActual, 2);
    }

    const r2Score = 1 - (totalError / totalVariance);
    const avgError = Math.sqrt(totalError / trainingData.length);

    // Store trained weights
    const modelVersion = `v${Date.now()}`;
    await db.analyticsEvent.create({
      data: {
        repositoryId,
        eventType: 'model_trained',
        eventData: JSON.parse(JSON.stringify({
          modelVersion,
          weights,
          trainedOn: trainingData.length,
          metrics: { avgError, r2Score },
          trainedAt: new Date().toISOString(),
        })),
      },
    });

    // Store weights in cache for inference
    this.modelWeights.set(repositoryId, weights);

    logger.info({
      repositoryId,
      modelVersion,
      trainedOn: trainingData.length,
      r2Score,
    }, 'Model training completed');

    return {
      trainedOn: trainingData.length,
      modelVersion,
      featureImportance,
      metrics: { avgError, r2Score },
    };
  }

  private modelWeights = new Map<string, Record<string, number>>();

  private async buildTrainingFeatures(workflow: {
    analysis?: { riskLevel: string; filesModified: number; linesAdded: number; linesRemoved: number } | null;
    reviewComments: Array<{ severity: string }>;
    generatedTests: unknown[];
    prTitle: string;
    createdAt: Date;
  }): Promise<PRFeatureVector> {
    const filesChanged = workflow.analysis?.filesModified || 0;
    const linesAdded = workflow.analysis?.linesAdded || 0;
    const linesDeleted = workflow.analysis?.linesRemoved || 0;
    const totalChanges = linesAdded + linesDeleted;

    const criticalIssues = workflow.reviewComments.filter(c => c.severity === 'CRITICAL').length;
    const highIssues = workflow.reviewComments.filter(c => c.severity === 'HIGH').length;
    const mediumIssues = workflow.reviewComments.filter(c => c.severity === 'MEDIUM').length;

    const riskScore = this.calculateRiskScore(workflow.analysis?.riskLevel || 'MEDIUM');
    const prAge = 0; // Not applicable for training
    const createdDate = new Date(workflow.createdAt);
    const isWeekend = createdDate.getDay() === 0 || createdDate.getDay() === 6;
    const hourOfDay = createdDate.getHours();

    return {
      filesChanged,
      linesAdded,
      linesDeleted,
      totalChanges,
      riskScore,
      criticalIssues,
      highIssues,
      mediumIssues,
      authorAvgMergeTimeHours: 0,
      authorMergeRate: 0,
      repoAvgMergeTimeHours: 0,
      repoAvgReviewLatencyMinutes: 0,
      prAge,
      hasDescription: !!workflow.prTitle && workflow.prTitle.length > 10,
      hasTests: workflow.generatedTests.length > 0,
      isWeekend,
      hourOfDay,
      potentialReviewers: 1,
      reviewerAvailability: 0.5,
      normalizedSize: Math.min(totalChanges / 1000, 1),
      normalizedComplexity: Math.min((criticalIssues * 3 + highIssues * 2 + mediumIssues) / 20, 1),
      normalizedRisk: riskScore / 100,
    };
  }

  private performLinearRegression(
    data: Array<{ features: PRFeatureVector; actualMergeTimeHours: number }>
  ): Record<string, number> {
    // Initialize weights
    const weights: Record<string, number> = {
      filesChanged: 0.1,
      totalChanges: 0.05,
      riskScore: 0.5,
      criticalIssues: 2.0,
      highIssues: 1.0,
      mediumIssues: 0.5,
      normalizedSize: 8.0,
      normalizedComplexity: 6.0,
      normalizedRisk: 4.0,
      hasTests: -2.0,
      hasDescription: -1.0,
      isWeekend: 24.0,
      reviewerAvailability: -4.0,
      bias: 8.0,
    };

    // Gradient descent
    const learningRate = 0.01;
    const iterations = 100;

    for (let i = 0; i < iterations; i++) {
      const totalGradient: Record<string, number> = {};
      
      for (const key of Object.keys(weights)) {
        totalGradient[key] = 0;
      }

      for (const sample of data) {
        const predicted = this.applyWeights(sample.features, weights);
        const error = predicted - sample.actualMergeTimeHours;

        // Update gradients
        for (const key of Object.keys(weights)) {
          const featureValue = key === 'bias' ? 1 : this.getFeatureValue(sample.features, key);
          totalGradient[key] += error * featureValue;
        }
      }

      // Apply gradients
      for (const key of Object.keys(weights)) {
        weights[key] -= (learningRate * totalGradient[key]) / data.length;
      }
    }

    return weights;
  }

  private applyWeights(features: PRFeatureVector, weights: Record<string, number>): number {
    let prediction = weights.bias || 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (key === 'bias') continue;
      const featureValue = this.getFeatureValue(features, key);
      prediction += weight * featureValue;
    }

    return Math.max(1, Math.min(168, prediction)); // Bound to 1 hour - 1 week
  }

  private getFeatureValue(features: PRFeatureVector, key: string): number {
    const featureMap: Record<string, unknown> = {
      filesChanged: features.filesChanged,
      linesAdded: features.linesAdded,
      linesDeleted: features.linesDeleted,
      totalChanges: features.totalChanges,
      riskScore: features.riskScore,
      criticalIssues: features.criticalIssues,
      highIssues: features.highIssues,
      mediumIssues: features.mediumIssues,
      authorAvgMergeTimeHours: features.authorAvgMergeTimeHours,
      authorMergeRate: features.authorMergeRate,
      repoAvgMergeTimeHours: features.repoAvgMergeTimeHours,
      repoAvgReviewLatencyMinutes: features.repoAvgReviewLatencyMinutes,
      prAge: features.prAge,
      hasDescription: features.hasDescription,
      hasTests: features.hasTests,
      isWeekend: features.isWeekend,
      hourOfDay: features.hourOfDay,
      potentialReviewers: features.potentialReviewers,
      reviewerAvailability: features.reviewerAvailability,
      normalizedSize: features.normalizedSize,
      normalizedComplexity: features.normalizedComplexity,
      normalizedRisk: features.normalizedRisk,
    };
    
    const value = featureMap[key];
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value;
    return 0;
  }

  /**
   * Load trained model weights for a repository
   */
  async loadModelWeights(repositoryId: string): Promise<boolean> {
    if (this.modelWeights.has(repositoryId)) {
      return true;
    }

    const latestModel = await db.analyticsEvent.findFirst({
      where: {
        repositoryId,
        eventType: 'model_trained',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestModel) {
      const data = latestModel.eventData as { weights?: Record<string, number> };
      if (data.weights) {
        this.modelWeights.set(repositoryId, data.weights);
        return true;
      }
    }

    return false;
  }

  /**
   * Get enhanced prediction using trained model if available
   */
  async predictWithTrainedModel(workflowId: string): Promise<PRPrediction> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Try to load trained model
    const hasModel = await this.loadModelWeights(workflow.repositoryId);

    if (hasModel) {
      const features = await this.extractFeatures(workflowId);
      const weights = this.modelWeights.get(workflow.repositoryId)!;
      
      const predictedMergeTimeHours = this.applyWeights(features, weights);
      const mergeProbability = this.predictMergeProbability(features);
      const { blockerProbability, predictedBlockers } = this.predictBlockers(features);

      return {
        workflowId,
        prNumber: workflow.prNumber,
        predictedMergeTimeHours,
        mergeTimeConfidence: 0.8, // Higher confidence with trained model
        mergeProbability,
        blockerProbability,
        predictedBlockers,
        optimalReviewTime: this.calculateOptimalReviewTime(features),
        estimatedFirstReviewHours: this.estimateFirstReviewTime(features),
        riskFactors: this.calculateRiskFactors(features),
        recommendations: this.generateRecommendations(features),
        featureImportance: this.calculateFeatureImportance(features),
        predictedAt: new Date(),
        modelUsed: 'trained',
      };
    }

    // Fall back to heuristic model
    return this.predictMergeOutcome(workflowId);
  }
}

export const predictiveHealthService = new PredictiveHealthService();
