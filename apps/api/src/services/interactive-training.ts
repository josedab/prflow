import { logger } from '../lib/logger.js';
import { reviewReplayLearningService } from './review-replay-learning.js';
import { callLLM, buildSystemPrompt, type LLMMessage } from '../agents/base.js';

/**
 * Training scenario for review skill development
 */
export interface TrainingScenario {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category: string;
  codeSnippet: string;
  language: string;
  correctIssues: Array<{
    line: number;
    type: string;
    severity: string;
    message: string;
    explanation: string;
  }>;
  hints: string[];
  tags: string[];
}

/**
 * User's response to a training scenario
 */
export interface TrainingResponse {
  scenarioId: string;
  userId: string;
  identifiedIssues: Array<{
    line: number;
    type: string;
    severity: string;
    message: string;
  }>;
  timeSpentSeconds: number;
  completedAt: Date;
}

/**
 * Training score and feedback
 */
export interface TrainingScore {
  scenarioId: string;
  score: number; // 0-100
  issuesFound: number;
  issuesMissed: number;
  falsePositives: number;
  accuracy: number;
  feedback: string[];
  improvement: string[];
  badge?: string;
}

/**
 * User progress tracking
 */
export interface UserProgress {
  userId: string;
  repositoryId: string;
  totalScenarios: number;
  completedScenarios: number;
  avgScore: number;
  strengthAreas: string[];
  improvementAreas: string[];
  badges: string[];
  streak: number;
  lastActivityAt: Date;
}

export class InteractiveTrainingService {
  private useLLM = process.env.ENABLE_LLM_TRAINING !== 'false';

  /**
   * Generate training scenarios from historical PRs
   */
  async generateScenarios(
    repositoryId: string,
    options?: {
      count?: number;
      difficulty?: 'beginner' | 'intermediate' | 'advanced';
      category?: string;
    }
  ): Promise<TrainingScenario[]> {
    const { count = 5, difficulty, category } = options || {};

    // Get historical decisions with good examples
    const decisions = await reviewReplayLearningService.getDecisions(repositoryId, {
      limit: 100,
    });

    const scenarios: TrainingScenario[] = [];

    // Filter and select interesting cases
    const interestingDecisions = decisions.decisions.filter((d) => {
      if (difficulty === 'beginner') {
        return d.context.severity === 'high' || d.context.severity === 'critical';
      }
      if (difficulty === 'advanced') {
        return d.action === 'modified' || d.context.category === 'security';
      }
      return true;
    });

    for (const decision of interestingDecisions.slice(0, count)) {
      if (category && decision.context.category !== category) continue;

      const scenario: TrainingScenario = {
        id: `scenario_${decision.id}`,
        title: `Review: ${decision.context.category} Issue`,
        description: `Find the ${decision.context.category.toLowerCase()} issue in this code snippet.`,
        difficulty: this.inferDifficulty(decision),
        category: decision.context.category,
        codeSnippet: decision.context.codeContext,
        language: decision.context.language,
        correctIssues: [
          {
            line: decision.context.line,
            type: decision.context.category,
            severity: decision.context.severity,
            message: decision.aiSuggestion,
            explanation: decision.humanResponse || decision.aiSuggestion,
          },
        ],
        hints: this.generateHints(decision),
        tags: [decision.context.category, decision.context.severity, decision.context.language],
      };

      scenarios.push(scenario);
    }

    // If not enough real scenarios, generate synthetic ones
    if (scenarios.length < count && this.useLLM) {
      const synthetic = await this.generateSyntheticScenarios(count - scenarios.length, difficulty);
      scenarios.push(...synthetic);
    }

    logger.info(
      { repositoryId, scenarioCount: scenarios.length },
      'Training scenarios generated'
    );

    return scenarios;
  }

  /**
   * Evaluate a user's response to a training scenario
   */
  async evaluateResponse(
    scenario: TrainingScenario,
    response: TrainingResponse
  ): Promise<TrainingScore> {
    const correctSet = new Set(scenario.correctIssues.map((i) => `${i.line}:${i.type}`));
    const responseSet = new Set(response.identifiedIssues.map((i) => `${i.line}:${i.type}`));

    let issuesFound = 0;
    let falsePositives = 0;

    // Count matches
    for (const issue of response.identifiedIssues) {
      const key = `${issue.line}:${issue.type}`;
      if (correctSet.has(key)) {
        issuesFound++;
      } else {
        // Check if it's close (same line, different type)
        const closeLine = scenario.correctIssues.some(
          (c) => Math.abs(c.line - issue.line) <= 2
        );
        if (!closeLine) {
          falsePositives++;
        }
      }
    }

    const issuesMissed = scenario.correctIssues.length - issuesFound;
    const accuracy =
      response.identifiedIssues.length > 0
        ? issuesFound / response.identifiedIssues.length
        : 0;

    // Calculate score
    const baseScore = (issuesFound / scenario.correctIssues.length) * 100;
    const penaltyForFP = falsePositives * 10;
    const timeBonus = response.timeSpentSeconds < 60 ? 10 : 0;
    const score = Math.max(0, Math.min(100, baseScore - penaltyForFP + timeBonus));

    // Generate feedback
    const feedback: string[] = [];
    const improvement: string[] = [];

    if (issuesFound === scenario.correctIssues.length) {
      feedback.push('✅ Excellent! You found all the issues.');
    } else if (issuesFound > 0) {
      feedback.push(`Found ${issuesFound}/${scenario.correctIssues.length} issues.`);
    }

    if (falsePositives > 0) {
      feedback.push(`⚠️ ${falsePositives} false positive(s) identified.`);
      improvement.push('Focus on reducing false positives by looking for concrete evidence.');
    }

    for (const missed of scenario.correctIssues) {
      if (!responseSet.has(`${missed.line}:${missed.type}`)) {
        improvement.push(
          `Missed: Line ${missed.line} - ${missed.explanation}`
        );
      }
    }

    // Award badge if applicable
    let badge: string | undefined;
    if (score >= 95) {
      badge = '🏆 Perfect Score!';
    } else if (score >= 80) {
      badge = '⭐ Great Work!';
    } else if (issuesFound > 0 && falsePositives === 0) {
      badge = '🎯 Precision Master';
    }

    return {
      scenarioId: scenario.id,
      score: Math.round(score),
      issuesFound,
      issuesMissed,
      falsePositives,
      accuracy: Math.round(accuracy * 100),
      feedback,
      improvement,
      badge,
    };
  }

  /**
   * Get or create user progress
   */
  async getUserProgress(userId: string, repositoryId: string): Promise<UserProgress> {
    // In a full implementation, this would fetch from database
    // For now, return a default progress structure
    return {
      userId,
      repositoryId,
      totalScenarios: 0,
      completedScenarios: 0,
      avgScore: 0,
      strengthAreas: [],
      improvementAreas: [],
      badges: [],
      streak: 0,
      lastActivityAt: new Date(),
    };
  }

  /**
   * Update user progress after completing a scenario
   */
  async updateProgress(
    userId: string,
    repositoryId: string,
    score: TrainingScore
  ): Promise<UserProgress> {
    const progress = await this.getUserProgress(userId, repositoryId);

    progress.completedScenarios++;
    progress.avgScore =
      (progress.avgScore * (progress.completedScenarios - 1) + score.score) /
      progress.completedScenarios;

    if (score.badge) {
      progress.badges.push(score.badge);
    }

    // Update streak
    const lastActivity = new Date(progress.lastActivityAt);
    const daysSinceLastActivity = Math.floor(
      (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastActivity <= 1) {
      progress.streak++;
    } else {
      progress.streak = 1;
    }
    progress.lastActivityAt = new Date();

    logger.info(
      { userId, repositoryId, progress },
      'User progress updated'
    );

    return progress;
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(
    userId: string,
    repositoryId: string
  ): Promise<{
    nextScenarios: TrainingScenario[];
    focus: string[];
    tips: string[];
  }> {
    const progress = await this.getUserProgress(userId, repositoryId);

    // Generate recommendations based on progress
    const focus: string[] = [];
    const tips: string[] = [];

    if (progress.improvementAreas.length > 0) {
      focus.push(...progress.improvementAreas.slice(0, 3));
    } else {
      focus.push('security', 'performance', 'error_handling');
    }

    if (progress.avgScore < 60) {
      tips.push('Take your time to analyze the code carefully');
      tips.push('Look for common patterns like missing null checks');
    } else if (progress.avgScore < 80) {
      tips.push('Try to identify subtle issues');
      tips.push('Consider edge cases and error handling');
    } else {
      tips.push('Challenge yourself with advanced scenarios');
      tips.push('Try to complete scenarios faster while maintaining accuracy');
    }

    // Generate next scenarios based on focus areas
    const nextScenarios = await this.generateScenarios(repositoryId, {
      count: 3,
      category: focus[0],
      difficulty:
        progress.avgScore < 60 ? 'beginner' : progress.avgScore < 80 ? 'intermediate' : 'advanced',
    });

    return {
      nextScenarios,
      focus,
      tips,
    };
  }

  /**
   * Get team leaderboard
   */
  async getLeaderboard(
    _repositoryId: string,
    _options?: { limit?: number; period?: 'week' | 'month' | 'all' }
  ): Promise<
    Array<{
      userId: string;
      userName: string;
      score: number;
      scenarios: number;
      badges: number;
      rank: number;
    }>
  > {
    // In a full implementation, this would aggregate from database
    // For now, return empty leaderboard
    return [];
  }

  // ============================================
  // Private Methods
  // ============================================

  private inferDifficulty(decision: {
    context: { severity: string; category: string };
  }): TrainingScenario['difficulty'] {
    if (decision.context.severity === 'critical' || decision.context.category === 'security') {
      return 'advanced';
    }
    if (decision.context.severity === 'high') {
      return 'intermediate';
    }
    return 'beginner';
  }

  private generateHints(decision: {
    context: { category: string; line: number };
    aiSuggestion: string;
  }): string[] {
    const hints: string[] = [];

    hints.push(`Look for ${decision.context.category.toLowerCase()} issues`);
    hints.push(`Focus on the area around line ${decision.context.line}`);

    // Category-specific hints
    switch (decision.context.category.toUpperCase()) {
      case 'SECURITY':
        hints.push('Check for input validation and sanitization');
        break;
      case 'BUG':
        hints.push('Look for potential null/undefined issues');
        break;
      case 'PERFORMANCE':
        hints.push('Check for unnecessary loops or queries');
        break;
      case 'ERROR_HANDLING':
        hints.push('Look for unhandled exceptions or missing try-catch');
        break;
    }

    return hints;
  }

  private async generateSyntheticScenarios(
    count: number,
    difficulty?: TrainingScenario['difficulty']
  ): Promise<TrainingScenario[]> {
    if (!this.useLLM) return [];

    const scenarios: TrainingScenario[] = [];
    const categories = ['security', 'bug', 'performance', 'error_handling'];

    for (let i = 0; i < count; i++) {
      try {
        const category = categories[i % categories.length];
        const scenario = await this.generateSingleScenario(category, difficulty || 'intermediate');
        if (scenario) {
          scenarios.push(scenario);
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to generate synthetic scenario');
      }
    }

    return scenarios;
  }

  private async generateSingleScenario(
    category: string,
    difficulty: TrainingScenario['difficulty']
  ): Promise<TrainingScenario | null> {
    const systemPrompt = buildSystemPrompt('training generator', `
You are a code review training content generator.
Create realistic code snippets with intentional issues for training purposes.
`);

    const userPrompt = `Generate a ${difficulty} ${category} code review training scenario.

Return JSON:
{
  "title": "scenario title",
  "codeSnippet": "10-20 lines of TypeScript code with an intentional ${category} issue",
  "issue": {
    "line": line_number,
    "severity": "high" or "medium",
    "message": "description of the issue",
    "explanation": "detailed explanation of why this is an issue"
  }
}

Return ONLY valid JSON.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(messages, { temperature: 0.8, maxTokens: 1000 });

    try {
      const content = response.content.trim();
      const jsonStr = content.startsWith('{') ? content : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;
      const parsed = JSON.parse(jsonStr);

      return {
        id: `synthetic_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        title: parsed.title,
        description: `Find the ${category} issue in this code.`,
        difficulty,
        category,
        codeSnippet: parsed.codeSnippet,
        language: 'typescript',
        correctIssues: [
          {
            line: parsed.issue.line,
            type: category.toUpperCase(),
            severity: parsed.issue.severity,
            message: parsed.issue.message,
            explanation: parsed.issue.explanation,
          },
        ],
        hints: [`Look for ${category} issues`, 'Focus on the function logic'],
        tags: [category, difficulty, 'typescript', 'synthetic'],
      };
    } catch (error) {
      logger.warn({ error }, 'Failed to parse generated scenario');
      return null;
    }
  }
}

export const interactiveTrainingService = new InteractiveTrainingService();
