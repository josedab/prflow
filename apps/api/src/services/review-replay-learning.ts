import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

/**
 * A recorded review decision made by a human reviewer
 */
export interface ReviewDecision {
  id: string;
  workflowId: string;
  repositoryId: string;
  commentId: string;
  reviewerGithubId: string;
  reviewerLogin: string;
  action: 'accepted' | 'dismissed' | 'modified' | 'resolved_other';
  aiSuggestion: string;
  humanResponse?: string;
  context: {
    file: string;
    line: number;
    codeContext: string;
    language: string;
    category: string;
    severity: string;
  };
  feedback?: {
    helpful: boolean;
    accuracyRating?: number; // 1-5
    explanation?: string;
  };
  timestamp: Date;
}

/**
 * Repository-specific preference model
 */
export interface RepoPreferenceModel {
  repositoryId: string;
  version: number;
  lastUpdated: Date;
  dataPoints: number;
  preferences: {
    // Category preferences
    categoryWeights: Record<string, number>;
    // Severity thresholds
    severityThresholds: {
      security: number;
      bug: number;
      performance: number;
      style: number;
    };
    // Review style preferences
    verbosity: 'minimal' | 'balanced' | 'detailed';
    // Which types of suggestions are typically accepted
    acceptanceRates: Record<string, number>;
    // Common patterns to ignore
    ignoredPatterns: string[];
    // Team-specific rules
    customRules: TeamRule[];
  };
}

/**
 * Team-defined rule learned from decisions
 */
export interface TeamRule {
  id: string;
  pattern: string;
  action: 'always_flag' | 'never_flag' | 'flag_with_severity';
  severity?: string;
  confidence: number;
  examples: string[];
  learnedFrom: number; // Number of decisions that led to this rule
}

/**
 * Training data point for model improvement
 */
export interface TrainingDataPoint {
  input: {
    codeSnippet: string;
    language: string;
    fileType: string;
    changeType: string;
    category: string;
    severity: string;
    aiMessage: string;
  };
  output: {
    accepted: boolean;
    modified: boolean;
    humanFeedback?: string;
    accuracyRating?: number;
  };
  weight: number; // Higher weight for recent decisions
}

/**
 * Learning statistics for a repository
 */
export interface LearningStats {
  repositoryId: string;
  totalDecisions: number;
  acceptanceRate: number;
  modificationRate: number;
  dismissalRate: number;
  topAcceptedCategories: Array<{ category: string; rate: number }>;
  topDismissedReasons: Array<{ reason: string; count: number }>;
  modelAccuracyTrend: Array<{ date: string; accuracy: number }>;
  improvementSuggestions: string[];
}

export class ReviewReplayLearningService {
  /**
   * Record a review decision made by a human reviewer
   */
  async recordDecision(
    decision: Omit<ReviewDecision, 'id' | 'timestamp'>
  ): Promise<ReviewDecision> {
    const id = `decision-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    // Store in database - result used for audit logging
    await db.analyticsEvent.create({
      data: {
        eventType: 'REVIEW_DECISION',
        repositoryId: decision.repositoryId,
        eventData: JSON.parse(JSON.stringify({
          ...decision,
          id,
          timestamp: timestamp.toISOString(),
        })),
      },
    });

    // Update comment status based on action
    await this.updateCommentStatus(decision.commentId, decision.action);

    // Trigger incremental model update
    await this.updatePreferenceModel(decision.repositoryId, {
      ...decision,
      id,
      timestamp,
    });

    logger.info({
      decisionId: id,
      repositoryId: decision.repositoryId,
      action: decision.action,
    }, 'Review decision recorded');

    return {
      ...decision,
      id,
      timestamp,
    };
  }

  /**
   * Get recorded decisions for a repository
   */
  async getDecisions(
    repositoryId: string,
    options: {
      limit?: number;
      offset?: number;
      action?: string;
      reviewerId?: string;
      since?: Date;
    } = {}
  ): Promise<{ decisions: ReviewDecision[]; total: number }> {
    const { limit = 50, offset = 0, action, reviewerId, since } = options;

    const events = await db.analyticsEvent.findMany({
      where: {
        repositoryId,
        eventType: 'REVIEW_DECISION',
        ...(since && { createdAt: { gte: since } }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    let decisions = events.map((e) => e.eventData as unknown as ReviewDecision);

    // Filter by action if specified
    if (action) {
      decisions = decisions.filter((d) => d.action === action);
    }

    // Filter by reviewer if specified
    if (reviewerId) {
      decisions = decisions.filter((d) => d.reviewerGithubId === reviewerId);
    }

    const total = await db.analyticsEvent.count({
      where: {
        repositoryId,
        eventType: 'REVIEW_DECISION',
      },
    });

    return { decisions, total };
  }

  /**
   * Get or create a preference model for a repository
   */
  async getPreferenceModel(repositoryId: string): Promise<RepoPreferenceModel> {
    const existing = await db.analyticsEvent.findFirst({
      where: {
        repositoryId,
        eventType: 'PREFERENCE_MODEL',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return existing.eventData as unknown as RepoPreferenceModel;
    }

    // Create default model
    const defaultModel: RepoPreferenceModel = {
      repositoryId,
      version: 1,
      lastUpdated: new Date(),
      dataPoints: 0,
      preferences: {
        categoryWeights: {
          SECURITY: 1.0,
          BUG: 0.9,
          PERFORMANCE: 0.7,
          ERROR_HANDLING: 0.7,
          STYLE: 0.5,
          MAINTAINABILITY: 0.6,
          NITPICK: 0.3,
        },
        severityThresholds: {
          security: 0.7,
          bug: 0.75,
          performance: 0.8,
          style: 0.9,
        },
        verbosity: 'balanced',
        acceptanceRates: {},
        ignoredPatterns: [],
        customRules: [],
      },
    };

    await this.savePreferenceModel(defaultModel);
    return defaultModel;
  }

  /**
   * Update preference model with a new decision
   */
  async updatePreferenceModel(
    repositoryId: string,
    decision: ReviewDecision
  ): Promise<RepoPreferenceModel> {
    const model = await this.getPreferenceModel(repositoryId);

    // Update category weights based on acceptance
    const category = decision.context.category;
    const currentWeight = model.preferences.categoryWeights[category] || 0.5;
    const adjustment = decision.action === 'accepted' ? 0.01 : -0.01;
    model.preferences.categoryWeights[category] = Math.max(
      0.1,
      Math.min(1.0, currentWeight + adjustment)
    );

    // Update acceptance rates
    const key = `${category}_${decision.context.severity}`;
    const currentRate = model.preferences.acceptanceRates[key] || 0.5;
    const accepted = decision.action === 'accepted' ? 1 : 0;
    // Exponential moving average
    model.preferences.acceptanceRates[key] = currentRate * 0.95 + accepted * 0.05;

    // Learn ignored patterns from dismissed suggestions
    if (decision.action === 'dismissed' && decision.feedback?.explanation) {
      const pattern = this.extractPattern(decision.aiSuggestion, decision.feedback.explanation);
      if (pattern && !model.preferences.ignoredPatterns.includes(pattern)) {
        model.preferences.ignoredPatterns.push(pattern);
      }
    }

    // Update verbosity preference based on modifications
    if (decision.action === 'modified' && decision.humanResponse) {
      const aiLength = decision.aiSuggestion.length;
      const humanLength = decision.humanResponse.length;
      if (humanLength < aiLength * 0.5) {
        model.preferences.verbosity = 'minimal';
      } else if (humanLength > aiLength * 1.5) {
        model.preferences.verbosity = 'detailed';
      }
    }

    model.dataPoints++;
    model.version++;
    model.lastUpdated = new Date();

    await this.savePreferenceModel(model);
    return model;
  }

  /**
   * Generate training data for model fine-tuning
   */
  async generateTrainingData(
    repositoryId: string,
    options: { minDecisions?: number; maxAge?: number } = {}
  ): Promise<TrainingDataPoint[]> {
    const { minDecisions = 50, maxAge = 90 } = options; // maxAge in days

    const since = new Date();
    since.setDate(since.getDate() - maxAge);

    const { decisions } = await this.getDecisions(repositoryId, {
      limit: 10000,
      since,
    });

    if (decisions.length < minDecisions) {
      logger.warn({
        repositoryId,
        decisionCount: decisions.length,
        minRequired: minDecisions,
      }, 'Insufficient decisions for training data generation');
      return [];
    }

    const trainingData: TrainingDataPoint[] = [];
    const now = Date.now();

    for (const decision of decisions) {
      // Calculate weight based on recency
      const age = now - new Date(decision.timestamp).getTime();
      const maxAgeMs = maxAge * 24 * 60 * 60 * 1000;
      const weight = 1 - (age / maxAgeMs);

      trainingData.push({
        input: {
          codeSnippet: decision.context.codeContext,
          language: decision.context.language,
          fileType: this.getFileType(decision.context.file),
          changeType: 'modification',
          category: decision.context.category,
          severity: decision.context.severity,
          aiMessage: decision.aiSuggestion,
        },
        output: {
          accepted: decision.action === 'accepted',
          modified: decision.action === 'modified',
          humanFeedback: decision.humanResponse,
          accuracyRating: decision.feedback?.accuracyRating,
        },
        weight: Math.max(0.1, weight),
      });
    }

    return trainingData;
  }

  /**
   * Get learning statistics for a repository
   */
  async getLearningStats(repositoryId: string): Promise<LearningStats> {
    const { decisions, total } = await this.getDecisions(repositoryId, {
      limit: 10000,
    });

    if (decisions.length === 0) {
      return {
        repositoryId,
        totalDecisions: 0,
        acceptanceRate: 0,
        modificationRate: 0,
        dismissalRate: 0,
        topAcceptedCategories: [],
        topDismissedReasons: [],
        modelAccuracyTrend: [],
        improvementSuggestions: ['Start reviewing PRs with PRFlow to build learning data'],
      };
    }

    const accepted = decisions.filter((d) => d.action === 'accepted').length;
    const modified = decisions.filter((d) => d.action === 'modified').length;
    const dismissed = decisions.filter((d) => d.action === 'dismissed').length;

    // Calculate category acceptance rates
    const categoryStats: Record<string, { accepted: number; total: number }> = {};
    for (const decision of decisions) {
      const category = decision.context.category;
      if (!categoryStats[category]) {
        categoryStats[category] = { accepted: 0, total: 0 };
      }
      categoryStats[category].total++;
      if (decision.action === 'accepted') {
        categoryStats[category].accepted++;
      }
    }

    const topAcceptedCategories = Object.entries(categoryStats)
      .map(([category, stats]) => ({
        category,
        rate: stats.total > 0 ? stats.accepted / stats.total : 0,
      }))
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);

    // Extract dismissal reasons
    const dismissalReasons: Record<string, number> = {};
    for (const decision of decisions) {
      if (decision.action === 'dismissed' && decision.feedback?.explanation) {
        const reason = this.extractDismissalReason(decision.feedback.explanation);
        dismissalReasons[reason] = (dismissalReasons[reason] || 0) + 1;
      }
    }

    const topDismissedReasons = Object.entries(dismissalReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate accuracy trend (weekly)
    const accuracyTrend = this.calculateAccuracyTrend(decisions);

    // Generate improvement suggestions
    const suggestions = this.generateImprovementSuggestions({
      acceptanceRate: accepted / decisions.length,
      modificationRate: modified / decisions.length,
      dismissalRate: dismissed / decisions.length,
      categoryStats,
      topDismissedReasons,
    });

    return {
      repositoryId,
      totalDecisions: total,
      acceptanceRate: accepted / decisions.length,
      modificationRate: modified / decisions.length,
      dismissalRate: dismissed / decisions.length,
      topAcceptedCategories,
      topDismissedReasons,
      modelAccuracyTrend: accuracyTrend,
      improvementSuggestions: suggestions,
    };
  }

  /**
   * Apply learned preferences to adjust review suggestions
   */
  async applyLearnedPreferences(
    repositoryId: string,
    suggestions: Array<{
      category: string;
      severity: string;
      confidence: number;
      message: string;
    }>
  ): Promise<Array<{
    category: string;
    severity: string;
    confidence: number;
    message: string;
    adjusted: boolean;
    adjustmentReason?: string;
  }>> {
    const model = await this.getPreferenceModel(repositoryId);
    const { preferences } = model;

    return suggestions.map((suggestion) => {
      let adjusted = false;
      let adjustmentReason: string | undefined;

      // Adjust confidence based on category weight
      const categoryWeight = preferences.categoryWeights[suggestion.category] || 0.5;
      let adjustedConfidence = suggestion.confidence * categoryWeight;

      // Check acceptance rate
      const key = `${suggestion.category}_${suggestion.severity}`;
      const acceptanceRate = preferences.acceptanceRates[key];
      if (acceptanceRate !== undefined && acceptanceRate < 0.3) {
        adjustedConfidence *= 0.5;
        adjusted = true;
        adjustmentReason = 'Low historical acceptance rate for this type';
      }

      // Check ignored patterns
      for (const pattern of preferences.ignoredPatterns) {
        if (suggestion.message.toLowerCase().includes(pattern.toLowerCase())) {
          adjustedConfidence = 0;
          adjusted = true;
          adjustmentReason = 'Matches ignored pattern based on past decisions';
          break;
        }
      }

      // Check custom rules
      for (const rule of preferences.customRules) {
        if (suggestion.message.includes(rule.pattern)) {
          if (rule.action === 'never_flag') {
            adjustedConfidence = 0;
            adjusted = true;
            adjustmentReason = `Team rule: never flag "${rule.pattern}"`;
          } else if (rule.action === 'always_flag') {
            adjustedConfidence = Math.max(adjustedConfidence, 0.9);
            adjusted = true;
            adjustmentReason = `Team rule: always flag "${rule.pattern}"`;
          }
        }
      }

      return {
        ...suggestion,
        confidence: adjustedConfidence,
        adjusted,
        adjustmentReason,
      };
    });
  }

  /**
   * Submit feedback on a decision
   */
  async submitFeedback(
    decisionId: string,
    feedback: {
      helpful: boolean;
      accuracyRating?: number;
      explanation?: string;
    }
  ): Promise<void> {
    const event = await db.analyticsEvent.findFirst({
      where: {
        eventType: 'REVIEW_DECISION',
      },
    });

    if (!event) {
      throw new NotFoundError('Decision', decisionId);
    }

    const decision = event.eventData as unknown as ReviewDecision;
    decision.feedback = feedback;

    await db.analyticsEvent.update({
      where: { id: event.id },
      data: {
        eventData: JSON.parse(JSON.stringify(decision)),
      },
    });

    // Update preference model with feedback
    if (decision.repositoryId) {
      await this.updatePreferenceModel(decision.repositoryId, decision);
    }

    logger.info({ decisionId, feedback }, 'Feedback recorded');
  }

  /**
   * Update comment status based on action
  /**
   * Update comment status based on action
   */
  private async updateCommentStatus(
    commentId: string,
    action: string
  ): Promise<void> {
    let status: 'FIX_APPLIED' | 'DISMISSED' | 'RESOLVED' | 'POSTED';
    switch (action) {
      case 'accepted':
        status = 'FIX_APPLIED';
        break;
      case 'dismissed':
        status = 'DISMISSED';
        break;
      case 'resolved_other':
        status = 'RESOLVED';
        break;
      default:
        status = 'POSTED';
    }

    try {
      await db.reviewComment.update({
        where: { id: commentId },
        data: { status },
      });
    } catch (error) {
      logger.warn({ error, commentId }, 'Failed to update comment status');
    }
  }

  /**
   * Save preference model to database
   */
  private async savePreferenceModel(model: RepoPreferenceModel): Promise<void> {
    await db.analyticsEvent.create({
      data: {
        eventType: 'PREFERENCE_MODEL',
        repositoryId: model.repositoryId,
        eventData: JSON.parse(JSON.stringify(model)),
        
        
      },
    });
  }

  /**
   * Extract a pattern from dismissed suggestion
   */
  private extractPattern(aiSuggestion: string, explanation: string): string | null {
    // Look for common dismissal patterns
    const patterns = [
      /not applicable/i,
      /false positive/i,
      /intentional/i,
      /by design/i,
      /already handled/i,
    ];

    for (const pattern of patterns) {
      if (pattern.test(explanation)) {
        // Extract key phrase from AI suggestion
        const words = aiSuggestion.split(/\s+/).slice(0, 5).join(' ');
        return words.toLowerCase();
      }
    }

    return null;
  }

  /**
   * Extract dismissal reason category
   */
  private extractDismissalReason(explanation: string): string {
    const lowerExplanation = explanation.toLowerCase();

    if (lowerExplanation.includes('false positive') || lowerExplanation.includes('incorrect')) {
      return 'False positive';
    }
    if (lowerExplanation.includes('intentional') || lowerExplanation.includes('by design')) {
      return 'Intentional pattern';
    }
    if (lowerExplanation.includes('not applicable') || lowerExplanation.includes('irrelevant')) {
      return 'Not applicable';
    }
    if (lowerExplanation.includes('already') || lowerExplanation.includes('handled')) {
      return 'Already addressed';
    }
    if (lowerExplanation.includes('style') || lowerExplanation.includes('preference')) {
      return 'Style preference';
    }

    return 'Other';
  }

  /**
   * Get file type from path
   */
  private getFileType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    const typeMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript-react',
      js: 'javascript',
      jsx: 'javascript-react',
      py: 'python',
      go: 'go',
      rs: 'rust',
      java: 'java',
      kt: 'kotlin',
      rb: 'ruby',
      php: 'php',
      cs: 'csharp',
    };
    return typeMap[ext] || 'other';
  }

  /**
   * Calculate weekly accuracy trend
   */
  private calculateAccuracyTrend(
    decisions: ReviewDecision[]
  ): Array<{ date: string; accuracy: number }> {
    const weeklyData: Record<string, { accepted: number; total: number }> = {};

    for (const decision of decisions) {
      const date = new Date(decision.timestamp);
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      const weekKey = weekStart.toISOString().split('T')[0];

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = { accepted: 0, total: 0 };
      }
      weeklyData[weekKey].total++;
      if (decision.action === 'accepted') {
        weeklyData[weekKey].accepted++;
      }
    }

    return Object.entries(weeklyData)
      .map(([date, stats]) => ({
        date,
        accuracy: stats.total > 0 ? stats.accepted / stats.total : 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-12); // Last 12 weeks
  }

  /**
   * Generate improvement suggestions based on stats
   */
  private generateImprovementSuggestions(stats: {
    acceptanceRate: number;
    modificationRate: number;
    dismissalRate: number;
    categoryStats: Record<string, { accepted: number; total: number }>;
    topDismissedReasons: Array<{ reason: string; count: number }>;
  }): string[] {
    const suggestions: string[] = [];

    if (stats.dismissalRate > 0.4) {
      suggestions.push(
        'High dismissal rate detected. Consider adjusting sensitivity thresholds.'
      );
    }

    if (stats.modificationRate > 0.3) {
      suggestions.push(
        'Many suggestions are being modified. Review verbosity settings.'
      );
    }

    // Check for low-acceptance categories
    for (const [category, data] of Object.entries(stats.categoryStats)) {
      const rate = data.total > 10 ? data.accepted / data.total : 1;
      if (rate < 0.3) {
        suggestions.push(
          `${category} suggestions have low acceptance. Consider reducing their priority.`
        );
      }
    }

    // Check dismissal reasons
    const falsePositives = stats.topDismissedReasons.find(
      (r) => r.reason === 'False positive'
    );
    if (falsePositives && falsePositives.count > 10) {
      suggestions.push(
        'Many false positives reported. Model calibration recommended.'
      );
    }

    if (suggestions.length === 0) {
      suggestions.push('Model is performing well. Continue collecting feedback.');
    }

    return suggestions;
  }
}

export const reviewReplayLearningService = new ReviewReplayLearningService();
