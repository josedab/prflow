import {
  LearningPathsInput,
  LearningPathsResult,
  DeveloperProfile,
  SkillAssessment,
  LearningPath,
  LearningModule,
  LearningRecommendation,
  IssuePattern,
  ReviewHistoryEntry,
  Achievement,
  ACHIEVEMENT_DEFINITIONS,
  SkillCategory,
  ProficiencyLevel,
  PRDataForAnalysis,
  LearningResource,
  ImprovementArea,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

const AGENT_TYPE = 'learning-paths';
const AGENT_DESCRIPTION = 'Tracks developer skill growth and recommends personalized learning paths';

const SKILL_ASSESSMENT_CRITERIA: Record<SkillCategory, string[]> = {
  language: ['syntax', 'idioms', 'standard library', 'type system', 'error handling'],
  framework: ['architecture', 'best practices', 'lifecycle', 'performance', 'testing'],
  testing: ['unit tests', 'integration tests', 'coverage', 'mocking', 'assertions'],
  security: ['input validation', 'authentication', 'authorization', 'encryption', 'OWASP'],
  performance: ['algorithmic complexity', 'caching', 'async patterns', 'memory', 'profiling'],
  architecture: ['SOLID principles', 'design patterns', 'modularity', 'scalability', 'coupling'],
  devops: ['CI/CD', 'containerization', 'monitoring', 'deployment', 'infrastructure'],
  documentation: ['code comments', 'README', 'API docs', 'changelog', 'examples'],
  code_quality: ['readability', 'naming', 'structure', 'consistency', 'refactoring'],
  collaboration: ['code review', 'communication', 'PR descriptions', 'feedback', 'mentoring'],
};

export class LearningPathsAgent extends BaseAgent<LearningPathsInput, LearningPathsResult> {
  readonly name = AGENT_TYPE;
  readonly description = AGENT_DESCRIPTION;

  // In-memory storage (would be database in production)
  private profiles: Map<string, DeveloperProfile> = new Map();

  async execute(input: LearningPathsInput, _context: { repositoryId: string }): Promise<{
    success: boolean;
    data?: LearningPathsResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result || !result.success) {
      return this.createErrorResult(result?.error || 'Operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(input: LearningPathsInput): Promise<LearningPathsResult> {
    switch (input.operation) {
      case 'assess':
        return this.assessSkills(input);
      case 'recommend':
        return this.generateRecommendations(input);
      case 'track_progress':
        return this.trackProgress(input);
      case 'get_profile':
        return this.getProfile(input);
      case 'update_preferences':
        return this.updatePreferences(input);
      case 'analyze_patterns':
        return this.analyzePatterns(input);
      default:
        return {
          operation: input.operation,
          success: false,
          error: `Unknown operation: ${input.operation}`,
        };
    }
  }

  private async getProfile(input: LearningPathsInput): Promise<LearningPathsResult> {
    let profile = this.profiles.get(input.userId);

    if (!profile) {
      profile = this.createInitialProfile(input.userId);
      this.profiles.set(input.userId, profile);
    }

    return {
      operation: 'get_profile',
      success: true,
      data: { profile },
    };
  }

  private createInitialProfile(userId: string): DeveloperProfile {
    return {
      id: `profile_${userId}`,
      username: userId,
      skills: [],
      learningPaths: [],
      reviewHistory: [],
      issuePatterns: [],
      strengths: [],
      improvementAreas: [],
      achievements: [],
      stats: {
        totalPRsAuthored: 0,
        totalPRsReviewed: 0,
        totalCommits: 0,
        totalLinesChanged: 0,
        averageIterations: 0,
        averageTimeToMerge: 0,
        approvalRate: 0,
        reviewAccuracy: 0,
        activeRepositories: 0,
        streakDays: 0,
        longestStreak: 0,
      },
      preferences: {
        preferredFormats: ['reading', 'practice'],
        dailyLearningTime: 30,
        notificationFrequency: 'weekly',
        focusAreas: [],
        excludeAreas: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private async assessSkills(input: LearningPathsInput): Promise<LearningPathsResult> {
    if (!input.prData) {
      return {
        operation: 'assess',
        success: false,
        error: 'PR data required for skill assessment',
      };
    }

    logger.info({ userId: input.userId, prId: input.prData.prId }, 'Assessing skills from PR');

    let profile = this.profiles.get(input.userId);
    if (!profile) {
      profile = this.createInitialProfile(input.userId);
    }

    // Add to review history
    const historyEntry = this.createHistoryEntry(input.prData);
    profile.reviewHistory.push(historyEntry);

    // Update stats
    this.updateStats(profile, input.prData);

    // Assess skills based on PR data
    const skillUpdates = await this.assessSkillsFromPR(input.prData, profile);
    profile.skills = this.mergeSkillAssessments(profile.skills, skillUpdates);

    // Update issue patterns
    profile.issuePatterns = this.updateIssuePatterns(profile, input.prData);

    // Check for new achievements
    const newAchievements = this.checkAchievements(profile);
    profile.achievements.push(...newAchievements);

    // Update strengths and improvement areas
    this.updateStrengthsAndImprovements(profile);

    profile.updatedAt = new Date();
    this.profiles.set(input.userId, profile);

    return {
      operation: 'assess',
      success: true,
      data: {
        profile,
        achievements: newAchievements,
      },
    };
  }

  private createHistoryEntry(prData: PRDataForAnalysis): ReviewHistoryEntry {
    return {
      id: `history_${Date.now()}`,
      prId: prData.prId,
      prTitle: prData.prTitle,
      repositoryFullName: prData.repositoryFullName,
      role: prData.role,
      date: new Date(),
      issuesFound: prData.reviewComments.map((c, i) => ({
        id: `issue_${i}`,
        type: c.type,
        severity: c.severity,
        category: this.mapIssueTypeToCategory(c.type),
        description: c.body,
        wasAddressed: true,
      })),
      commentsGiven: prData.role === 'reviewer' ? prData.reviewComments.length : 0,
      commentsReceived: prData.role === 'author' ? prData.reviewComments.length : 0,
      outcomeApproved: prData.approved,
      iterationsRequired: prData.iterations,
      timeToMerge: prData.timeToMerge,
    };
  }

  private mapIssueTypeToCategory(issueType: string): SkillCategory {
    const mapping: Record<string, SkillCategory> = {
      bug: 'code_quality',
      security: 'security',
      performance: 'performance',
      style: 'code_quality',
      logic: 'code_quality',
      testing: 'testing',
      documentation: 'documentation',
      architecture: 'architecture',
      best_practice: 'code_quality',
    };
    return mapping[issueType] || 'code_quality';
  }

  private updateStats(profile: DeveloperProfile, prData: PRDataForAnalysis): void {
    const stats = profile.stats;

    if (prData.role === 'author') {
      stats.totalPRsAuthored++;
      stats.totalLinesChanged += prData.files.reduce(
        (sum, f) => sum + f.additions + f.deletions,
        0
      );

      // Update average iterations
      const totalIterations =
        stats.averageIterations * (stats.totalPRsAuthored - 1) + prData.iterations;
      stats.averageIterations = totalIterations / stats.totalPRsAuthored;

      // Update approval rate
      const approvedCount = profile.reviewHistory.filter(
        (h) => h.role === 'author' && h.outcomeApproved && h.iterationsRequired <= 1
      ).length;
      stats.approvalRate = (approvedCount / stats.totalPRsAuthored) * 100;

      // Update time to merge
      if (prData.timeToMerge) {
        const totalTime =
          stats.averageTimeToMerge * (stats.totalPRsAuthored - 1) + prData.timeToMerge;
        stats.averageTimeToMerge = totalTime / stats.totalPRsAuthored;
      }
    } else {
      stats.totalPRsReviewed++;
    }
  }

  private async assessSkillsFromPR(
    prData: PRDataForAnalysis,
    _profile: DeveloperProfile
  ): Promise<SkillAssessment[]> {
    const assessments: SkillAssessment[] = [];

    // Detect languages used
    const languages = new Set(prData.files.map((f) => f.language).filter(Boolean));
    for (const lang of languages) {
      if (lang) {
        assessments.push(this.createSkillAssessment('language', lang, prData));
      }
    }

    // Assess based on review comments received
    const issuesByCategory = new Map<SkillCategory, number>();
    for (const comment of prData.reviewComments) {
      const category = this.mapIssueTypeToCategory(comment.type);
      issuesByCategory.set(category, (issuesByCategory.get(category) || 0) + 1);
    }

    const totalLines = prData.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const linesK = totalLines / 1000;

    for (const [category, count] of issuesByCategory) {
      const issuesPerK = linesK > 0 ? count / linesK : count;
      let score = 100 - issuesPerK * 10; // Lose 10 points per issue per 1000 lines
      score = Math.max(0, Math.min(100, score));

      const existing = assessments.find((a) => a.category === category);
      if (existing) {
        existing.score = (existing.score + score) / 2;
      } else {
        assessments.push({
          category,
          name: category.replace('_', ' '),
          proficiency: this.scoreToProficiency(score),
          score,
          confidence: Math.min(50 + prData.files.length * 5, 90),
          evidenceCount: 1,
          trend: 'stable',
          lastAssessed: new Date(),
        });
      }
    }

    // Assess based on PR approval
    if (prData.role === 'author') {
      const qualityScore = prData.approved && prData.iterations <= 1 ? 90 : prData.approved ? 70 : 50;
      assessments.push({
        category: 'code_quality',
        name: 'Code Quality',
        proficiency: this.scoreToProficiency(qualityScore),
        score: qualityScore,
        confidence: 60,
        evidenceCount: 1,
        trend: 'stable',
        lastAssessed: new Date(),
      });
    }

    return assessments;
  }

  private createSkillAssessment(
    category: SkillCategory,
    name: string,
    prData: PRDataForAnalysis
  ): SkillAssessment {
    const filesWithLang = prData.files.filter((f) => f.language === name);
    const linesChanged = filesWithLang.reduce((sum, f) => sum + f.additions + f.deletions, 0);

    // Basic score based on volume (more code = more experience)
    let score = Math.min(30 + linesChanged / 10, 80);
    if (prData.approved && prData.iterations <= 1) score += 10;

    return {
      category,
      name,
      proficiency: this.scoreToProficiency(score),
      score,
      confidence: Math.min(30 + filesWithLang.length * 10, 80),
      evidenceCount: 1,
      trend: 'stable',
      lastAssessed: new Date(),
    };
  }

  private scoreToProficiency(score: number): ProficiencyLevel {
    if (score >= 90) return 'expert';
    if (score >= 70) return 'advanced';
    if (score >= 50) return 'intermediate';
    return 'beginner';
  }

  private mergeSkillAssessments(
    existing: SkillAssessment[],
    newAssessments: SkillAssessment[]
  ): SkillAssessment[] {
    const merged = new Map<string, SkillAssessment>();

    // Add existing
    for (const skill of existing) {
      merged.set(`${skill.category}:${skill.name}`, skill);
    }

    // Merge new assessments
    for (const skill of newAssessments) {
      const key = `${skill.category}:${skill.name}`;
      const existing = merged.get(key);

      if (existing) {
        // Weighted average based on evidence count
        const totalEvidence = existing.evidenceCount + skill.evidenceCount;
        const newScore =
          (existing.score * existing.evidenceCount + skill.score * skill.evidenceCount) /
          totalEvidence;

        // Determine trend
        let trend: SkillAssessment['trend'] = 'stable';
        if (skill.score > existing.score + 5) trend = 'improving';
        else if (skill.score < existing.score - 5) trend = 'declining';

        merged.set(key, {
          ...existing,
          score: newScore,
          proficiency: this.scoreToProficiency(newScore),
          confidence: Math.min(existing.confidence + 5, 95),
          evidenceCount: totalEvidence,
          trend,
          lastAssessed: new Date(),
        });
      } else {
        merged.set(key, skill);
      }
    }

    return Array.from(merged.values());
  }

  private updateIssuePatterns(
    profile: DeveloperProfile,
    prData: PRDataForAnalysis
  ): IssuePattern[] {
    const patterns = new Map<string, IssuePattern>();

    // Load existing patterns
    for (const pattern of profile.issuePatterns) {
      patterns.set(`${pattern.type}:${pattern.category}`, pattern);
    }

    // Add new issues
    const totalLines = prData.files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

    for (const comment of prData.reviewComments) {
      const category = this.mapIssueTypeToCategory(comment.type);
      const key = `${comment.type}:${category}`;

      const existing = patterns.get(key);
      if (existing) {
        existing.frequency = (existing.frequency + 1) / (totalLines / 100 || 1);
        existing.examples.push({
          prId: prData.prId,
          file: prData.files[0]?.filename || 'unknown',
          description: comment.body.slice(0, 100),
          date: new Date(),
        });
        if (existing.examples.length > 5) {
          existing.examples = existing.examples.slice(-5);
        }
      } else {
        patterns.set(key, {
          type: comment.type,
          category,
          frequency: 1 / (totalLines / 100 || 1),
          severity: comment.severity === 'critical' ? 'high' : comment.severity,
          trend: 'stable',
          examples: [
            {
              prId: prData.prId,
              file: prData.files[0]?.filename || 'unknown',
              description: comment.body.slice(0, 100),
              date: new Date(),
            },
          ],
          suggestions: [],
        });
      }
    }

    return Array.from(patterns.values());
  }

  private checkAchievements(profile: DeveloperProfile): Achievement[] {
    const newAchievements: Achievement[] = [];
    const existingIds = new Set(profile.achievements.map((a) => a.id));

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (existingIds.has(def.id)) continue;

      let earned = false;

      switch (def.id) {
        case 'first_pr':
          earned = profile.stats.totalPRsAuthored >= 1;
          break;
        case 'clean_pr':
          earned = profile.reviewHistory.some(
            (h) => h.role === 'author' && h.outcomeApproved && h.iterationsRequired <= 1
          );
          break;
        case 'security_champion':
          earned = this.checkConsecutivePRsWithoutIssue(profile, 'security', 10);
          break;
        case 'helpful_reviewer':
          earned = profile.stats.totalPRsReviewed >= 50;
          break;
        case 'polyglot': {
          const languages = new Set(
            profile.skills.filter((s) => s.category === 'language').map((s) => s.name)
          );
          earned = languages.size >= 5;
          break;
        }
      }

      if (earned) {
        newAchievements.push({
          ...def,
          unlockedAt: new Date(),
        });
      }
    }

    return newAchievements;
  }

  private checkConsecutivePRsWithoutIssue(
    profile: DeveloperProfile,
    issueType: string,
    count: number
  ): boolean {
    const recentPRs = profile.reviewHistory
      .filter((h) => h.role === 'author')
      .slice(-count);

    if (recentPRs.length < count) return false;

    return recentPRs.every((pr) => !pr.issuesFound.some((i) => i.type === issueType));
  }

  private updateStrengthsAndImprovements(profile: DeveloperProfile): void {
    // Identify strengths (high scores)
    profile.strengths = profile.skills
      .filter((s) => s.score >= 80 && s.confidence >= 60)
      .map((s) => ({
        category: s.category,
        description: `Strong ${s.name} skills`,
        evidence: [`Score: ${s.score}/100`, `Evidence from ${s.evidenceCount} PRs`],
        score: s.score,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Identify improvement areas (low scores or frequent issues)
    const improvementCandidates: Array<{
      category: SkillCategory;
      description: string;
      priority: 'low' | 'medium' | 'high';
      score: number;
    }> = [
      ...profile.skills
        .filter((s) => s.score < 60 && s.confidence >= 40)
        .map((s) => ({
          category: s.category,
          description: `Improve ${s.name}`,
          priority: (s.score < 40 ? 'high' : s.score < 50 ? 'medium' : 'low') as 'low' | 'medium' | 'high',
          score: s.score,
        })),
      ...profile.issuePatterns
        .filter((p) => p.frequency > 0.5)
        .map((p) => ({
          category: p.category,
          description: `Reduce ${p.type} issues`,
          priority: p.severity as 'low' | 'medium' | 'high',
          score: 100 - p.frequency * 20,
        })),
    ];

    profile.improvementAreas = improvementCandidates
      .sort((a, b) => {
        const priorityOrder: Record<'low' | 'medium' | 'high', number> = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      })
      .slice(0, 5)
      .map((c): ImprovementArea => ({
        category: c.category,
        description: c.description,
        priority: c.priority,
        suggestedResources: this.getResourcesForCategory(c.category),
        relatedIssues: [],
      }));
  }

  private getResourcesForCategory(category: SkillCategory): LearningResource[] {
    const criteria = SKILL_ASSESSMENT_CRITERIA[category] || [];
    return criteria.slice(0, 3).map((topic, i) => ({
      id: `resource_${category}_${i}`,
      type: 'article' as const,
      title: `Learn about ${topic}`,
      description: `Improve your ${category} skills by learning about ${topic}`,
      estimatedTime: 30,
      difficulty: 'intermediate' as const,
      tags: [category, topic],
    }));
  }

  private async generateRecommendations(
    input: LearningPathsInput
  ): Promise<LearningPathsResult> {
    const profile = this.profiles.get(input.userId);
    if (!profile) {
      return {
        operation: 'recommend',
        success: false,
        error: 'Profile not found. Run assess first.',
      };
    }

    logger.info({ userId: input.userId }, 'Generating learning recommendations');

    const recommendations: LearningRecommendation[] = [];

    // Recommend based on improvement areas
    for (const area of profile.improvementAreas.slice(0, 3)) {
      const learningPath = this.createLearningPath(area.category, profile);

      recommendations.push({
        type: 'learning_path',
        priority: area.priority,
        title: `Master ${area.category.replace('_', ' ')}`,
        description: area.description,
        rationale: `Based on ${profile.issuePatterns.filter((p) => p.category === area.category).length} recurring issues`,
        estimatedImpact: area.priority === 'high' ? 80 : area.priority === 'medium' ? 60 : 40,
        content: learningPath,
      });
    }

    // Add recommendations based on patterns
    for (const pattern of profile.issuePatterns.filter((p) => p.frequency > 0.3).slice(0, 2)) {
      recommendations.push({
        type: 'practice',
        priority: pattern.severity,
        title: `Practice: Avoiding ${pattern.type} issues`,
        description: pattern.suggestions[0] || `Focus on reducing ${pattern.type} issues in your code`,
        rationale: `You have ${pattern.examples.length} examples of this issue type`,
        estimatedImpact: 50,
      });
    }

    return {
      operation: 'recommend',
      success: true,
      data: { recommendations },
    };
  }

  private createLearningPath(category: SkillCategory, profile: DeveloperProfile): LearningPath {
    const currentSkill = profile.skills.find((s) => s.category === category);
    const currentLevel = currentSkill?.proficiency || 'beginner';

    const targetLevel =
      currentLevel === 'beginner'
        ? 'intermediate'
        : currentLevel === 'intermediate'
          ? 'advanced'
          : 'expert';

    const modules: LearningModule[] = SKILL_ASSESSMENT_CRITERIA[category].map((topic, i) => ({
      id: `module_${category}_${i}`,
      name: topic.charAt(0).toUpperCase() + topic.slice(1),
      description: `Learn about ${topic} in the context of ${category}`,
      type: i % 2 === 0 ? 'reading' : 'practice',
      content: {
        resources: [
          {
            id: `res_${category}_${i}`,
            type: 'documentation',
            title: `${topic} Guide`,
            description: `Comprehensive guide to ${topic}`,
            estimatedTime: 45,
            difficulty: currentLevel,
            tags: [category, topic],
          },
        ],
      },
      estimatedTime: 60,
      status: i === 0 ? 'available' : 'locked',
    }));

    return {
      id: `path_${category}_${Date.now()}`,
      name: `${category.replace('_', ' ')} Mastery`,
      description: `Improve your ${category} skills from ${currentLevel} to ${targetLevel}`,
      category,
      targetLevel: targetLevel as ProficiencyLevel,
      currentProgress: 0,
      modules,
      estimatedTime: modules.length * 1,
      prerequisites: [],
      status: 'not_started',
    };
  }

  private async trackProgress(input: LearningPathsInput): Promise<LearningPathsResult> {
    if (!input.pathId) {
      return {
        operation: 'track_progress',
        success: false,
        error: 'Path ID required',
      };
    }

    const profile = this.profiles.get(input.userId);
    if (!profile) {
      return {
        operation: 'track_progress',
        success: false,
        error: 'Profile not found',
      };
    }

    const path = profile.learningPaths.find((p) => p.id === input.pathId);
    if (!path) {
      return {
        operation: 'track_progress',
        success: false,
        error: 'Learning path not found',
      };
    }

    // Update module status if moduleId provided
    if (input.moduleId) {
      const module = path.modules.find((m) => m.id === input.moduleId);
      if (module) {
        module.status = 'completed';
        module.completedAt = new Date();

        // Unlock next module
        const nextIndex = path.modules.indexOf(module) + 1;
        if (nextIndex < path.modules.length) {
          path.modules[nextIndex].status = 'available';
        }
      }
    }

    // Calculate progress
    const completed = path.modules.filter((m) => m.status === 'completed').length;
    path.currentProgress = Math.round((completed / path.modules.length) * 100);

    if (path.currentProgress === 100) {
      path.status = 'completed';
      path.completedAt = new Date();
    } else if (path.currentProgress > 0) {
      path.status = 'in_progress';
    }

    profile.updatedAt = new Date();
    this.profiles.set(input.userId, profile);

    return {
      operation: 'track_progress',
      success: true,
      data: {
        profile,
        learningPath: path,
      },
    };
  }

  private async updatePreferences(input: LearningPathsInput): Promise<LearningPathsResult> {
    if (!input.preferences) {
      return {
        operation: 'update_preferences',
        success: false,
        error: 'Preferences required',
      };
    }

    let profile = this.profiles.get(input.userId);
    if (!profile) {
      profile = this.createInitialProfile(input.userId);
    }

    profile.preferences = {
      ...profile.preferences,
      ...input.preferences,
    };
    profile.updatedAt = new Date();

    this.profiles.set(input.userId, profile);

    return {
      operation: 'update_preferences',
      success: true,
      data: { profile },
    };
  }

  private async analyzePatterns(input: LearningPathsInput): Promise<LearningPathsResult> {
    const profile = this.profiles.get(input.userId);
    if (!profile) {
      return {
        operation: 'analyze_patterns',
        success: false,
        error: 'Profile not found. Run assess first.',
      };
    }

    // Use LLM to provide insights on patterns
    if (profile.issuePatterns.length > 0) {
      try {
        const userPrompt = `Analyze these code review issue patterns for a developer:

${profile.issuePatterns
  .map(
    (p) => `- ${p.type} (${p.category}): frequency ${p.frequency.toFixed(2)}, severity ${p.severity}, trend ${p.trend}`
  )
  .join('\n')}

Provide specific, actionable suggestions to improve. Respond with JSON:
{
  "insights": ["Key insight 1", "Key insight 2"],
  "suggestions": {
    "pattern_type": ["Specific suggestion 1", "Specific suggestion 2"]
  }
}`;

        const systemPrompt = buildSystemPrompt(AGENT_TYPE, `
Analyzing ${profile.issuePatterns.length} issue patterns for developer ${input.userId}
`);

        const messages: LLMMessage[] = [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ];

        const response = await callLLM(messages, { temperature: 0.4, maxTokens: 1500 });
        const content = response.content.trim();
        const jsonStr = content.startsWith('{')
          ? content
          : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;

        const analysis = JSON.parse(jsonStr);

        // Update patterns with suggestions
        for (const pattern of profile.issuePatterns) {
          const suggestions = analysis.suggestions[pattern.type] || [];
          pattern.suggestions = suggestions;
        }

        this.profiles.set(input.userId, profile);
      } catch {
        logger.warn('Failed to analyze patterns with LLM');
      }
    }

    return {
      operation: 'analyze_patterns',
      success: true,
      data: {
        patterns: profile.issuePatterns,
      },
    };
  }
}

export const learningPathsAgent = new LearningPathsAgent();
