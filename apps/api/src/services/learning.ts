import { db } from '@prflow/db';
import type { ReviewCategory } from '@prflow/core';
import { logger } from '../lib/logger.js';
import { NotFoundError } from '../lib/errors.js';

type PatternType = 
  | 'NAMING_CONVENTION'
  | 'CODE_STYLE'
  | 'ERROR_HANDLING'
  | 'TEST_PATTERN'
  | 'DOCUMENTATION'
  | 'SECURITY'
  | 'ARCHITECTURE'
  | 'API_DESIGN';

type FeedbackType = 'ACCEPTED' | 'REJECTED' | 'MODIFIED' | 'DISMISSED' | 'FALSE_POSITIVE';

export interface LearnedPattern {
  patternType: PatternType;
  pattern: string;
  context: Record<string, unknown>;
  frequency: number;
  confidence: number;
}

export interface CodebaseContextData {
  detectedFrameworks: string[];
  detectedLanguages: string[];
  testFramework: string | null;
  styleGuide: Record<string, unknown> | null;
  learnedPatterns: Record<string, LearnedPattern[]>;
  conventionRules: ConventionRule[];
}

export interface ConventionRule {
  id: string;
  type: PatternType;
  description: string;
  pattern: string;
  severity: 'error' | 'warning' | 'info';
  autoFix?: string;
  enabled: boolean;
}

export interface FeedbackData {
  commentId: string;
  feedbackType: FeedbackType;
  originalSuggestion?: string;
  userAction?: string;
}

export class LearningService {
  async recordFeedback(repositoryId: string, feedback: FeedbackData): Promise<void> {
    await db.reviewFeedback.create({
      data: {
        commentId: feedback.commentId,
        repositoryId,
        feedbackType: feedback.feedbackType,
        originalSuggestion: feedback.originalSuggestion,
        userAction: feedback.userAction,
      },
    });

    // Update pattern confidence based on feedback
    await this.updatePatternConfidence(repositoryId, feedback);

    logger.info({ repositoryId, feedbackType: feedback.feedbackType }, 'Feedback recorded');
  }

  async learnFromWorkflow(workflowId: string): Promise<{
    patternsLearned: number;
    conventionsDetected: number;
  }> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        reviewComments: true,
        generatedTests: true,
        analysis: true,
        repository: true,
      },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    let patternsLearned = 0;
    let conventionsDetected = 0;

    // Learn from review comments
    for (const comment of workflow.reviewComments) {
      const patternType = this.mapCategoryToPatternType(comment.category as string);
      if (patternType) {
        await this.recordPattern(workflow.repositoryId, {
          patternType,
          pattern: this.extractPatternFromComment(comment),
          context: {
            file: comment.file,
            severity: comment.severity,
            category: comment.category,
          },
        });
        patternsLearned++;
      }
    }

    // Learn from generated tests (test patterns)
    for (const test of workflow.generatedTests) {
      await this.recordPattern(workflow.repositoryId, {
        patternType: 'TEST_PATTERN',
        pattern: `${test.framework}:${test.targetFile}`,
        context: {
          framework: test.framework,
          coverageTargets: test.coverageTargets,
        },
      });
      patternsLearned++;
    }

    // Detect conventions from file patterns
    const files = workflow.analysis
      ? (workflow.analysis.impactRadius as { affectedFiles?: string[] })?.affectedFiles || []
      : [];
    
    const newConventions = await this.detectConventions(workflow.repositoryId, files);
    conventionsDetected = newConventions.length;

    // Update codebase context
    await this.updateCodebaseContext(workflow.repositoryId);

    logger.info({ workflowId, patternsLearned, conventionsDetected }, 'Learning completed');

    return { patternsLearned, conventionsDetected };
  }

  async getCodebaseContext(repositoryId: string): Promise<CodebaseContextData> {
    let context = await db.codebaseContext.findUnique({
      where: { repositoryId },
    });

    if (!context) {
      // Create default context
      context = await db.codebaseContext.create({
        data: {
          repositoryId,
          detectedFrameworks: [],
          detectedLanguages: [],
          learnedPatterns: {},
          conventionRules: [],
        },
      });
    }

    return {
      detectedFrameworks: context.detectedFrameworks,
      detectedLanguages: context.detectedLanguages,
      testFramework: context.testFramework,
      styleGuide: context.styleGuide as unknown as Record<string, unknown> | null,
      learnedPatterns: context.learnedPatterns as unknown as Record<string, LearnedPattern[]>,
      conventionRules: context.conventionRules as unknown as ConventionRule[],
    };
  }

  async getLearnedPatterns(
    repositoryId: string,
    options?: {
      patternType?: PatternType;
      minConfidence?: number;
      limit?: number;
    }
  ): Promise<LearnedPattern[]> {
    const where: Record<string, unknown> = { repositoryId };

    if (options?.patternType) {
      where.patternType = options.patternType;
    }

    if (options?.minConfidence !== undefined) {
      where.confidence = { gte: options.minConfidence };
    }

    const patterns = await db.reviewPattern.findMany({
      where,
      orderBy: [{ confidence: 'desc' }, { frequency: 'desc' }],
      take: options?.limit || 100,
    });

    return patterns.map((p) => ({
      patternType: p.patternType as PatternType,
      pattern: p.pattern,
      context: p.context as Record<string, unknown>,
      frequency: p.frequency,
      confidence: p.confidence,
    }));
  }

  async getRelevantPatterns(
    repositoryId: string,
    file: string,
    category?: ReviewCategory
  ): Promise<LearnedPattern[]> {
    const fileExtension = file.split('.').pop() || '';
    // fileName available for pattern matching
    // const fileName = file.split('/').pop() || '';

    const patterns = await db.reviewPattern.findMany({
      where: {
        repositoryId,
        confidence: { gte: 0.5 },
      },
      orderBy: { confidence: 'desc' },
    });

    // Filter patterns relevant to the file
    const relevant = patterns.filter((p) => {
      const context = p.context as Record<string, unknown>;

      // Check file extension match
      if (context.file && typeof context.file === 'string') {
        const patternExt = context.file.split('.').pop();
        if (patternExt !== fileExtension) {
          return false;
        }
      }

      // Check category match
      if (category && context.category && context.category !== category) {
        return false;
      }

      return true;
    });

    return relevant.slice(0, 20).map((p) => ({
      patternType: p.patternType as PatternType,
      pattern: p.pattern,
      context: p.context as Record<string, unknown>,
      frequency: p.frequency,
      confidence: p.confidence,
    }));
  }

  async addConventionRule(
    repositoryId: string,
    rule: Omit<ConventionRule, 'id'>
  ): Promise<ConventionRule> {
    const context = await this.getCodebaseContext(repositoryId);
    const newRule: ConventionRule = {
      ...rule,
      id: `rule_${Date.now()}`,
    };

    context.conventionRules.push(newRule);

    await db.codebaseContext.update({
      where: { repositoryId },
      data: {
        conventionRules: JSON.parse(JSON.stringify(context.conventionRules)),
        updatedAt: new Date(),
      },
    });

    return newRule;
  }

  async updateConventionRule(
    repositoryId: string,
    ruleId: string,
    updates: Partial<Omit<ConventionRule, 'id'>>
  ): Promise<ConventionRule | null> {
    const context = await this.getCodebaseContext(repositoryId);
    const ruleIndex = context.conventionRules.findIndex((r) => r.id === ruleId);

    if (ruleIndex === -1) {
      return null;
    }

    context.conventionRules[ruleIndex] = {
      ...context.conventionRules[ruleIndex],
      ...updates,
    };

    await db.codebaseContext.update({
      where: { repositoryId },
      data: {
        conventionRules: JSON.parse(JSON.stringify(context.conventionRules)),
        updatedAt: new Date(),
      },
    });

    return context.conventionRules[ruleIndex];
  }

  async deleteConventionRule(repositoryId: string, ruleId: string): Promise<boolean> {
    const context = await this.getCodebaseContext(repositoryId);
    const originalLength = context.conventionRules.length;
    context.conventionRules = context.conventionRules.filter((r) => r.id !== ruleId);

    if (context.conventionRules.length === originalLength) {
      return false;
    }

    await db.codebaseContext.update({
      where: { repositoryId },
      data: {
        conventionRules: JSON.parse(JSON.stringify(context.conventionRules)),
        updatedAt: new Date(),
      },
    });

    return true;
  }

  async getFeedbackStats(repositoryId: string): Promise<{
    total: number;
    byType: Record<FeedbackType, number>;
    acceptanceRate: number;
    falsePositiveRate: number;
  }> {
    const feedback = await db.reviewFeedback.findMany({
      where: { repositoryId },
    });

    const byType: Record<FeedbackType, number> = {
      ACCEPTED: 0,
      REJECTED: 0,
      MODIFIED: 0,
      DISMISSED: 0,
      FALSE_POSITIVE: 0,
    };

    for (const f of feedback) {
      byType[f.feedbackType as FeedbackType]++;
    }

    const total = feedback.length;
    const acceptanceRate = total > 0 ? (byType.ACCEPTED + byType.MODIFIED) / total : 0;
    const falsePositiveRate = total > 0 ? byType.FALSE_POSITIVE / total : 0;

    return {
      total,
      byType,
      acceptanceRate: Math.round(acceptanceRate * 1000) / 10,
      falsePositiveRate: Math.round(falsePositiveRate * 1000) / 10,
    };
  }

  async analyzeRepository(
    repositoryId: string,
    files: Array<{ filename: string; content?: string }>
  ): Promise<{
    detectedFrameworks: string[];
    detectedLanguages: string[];
    testFramework: string | null;
    suggestedRules: ConventionRule[];
  }> {
    const detectedLanguages = new Set<string>();
    const detectedFrameworks = new Set<string>();
    let testFramework: string | null = null;

    for (const file of files) {
      // Detect languages
      const ext = file.filename.split('.').pop()?.toLowerCase();
      const langMap: Record<string, string> = {
        ts: 'TypeScript',
        tsx: 'TypeScript',
        js: 'JavaScript',
        jsx: 'JavaScript',
        py: 'Python',
        go: 'Go',
        rs: 'Rust',
        java: 'Java',
        rb: 'Ruby',
        php: 'PHP',
      };
      if (ext && langMap[ext]) {
        detectedLanguages.add(langMap[ext]);
      }

      // Detect frameworks from filename patterns
      if (file.filename.includes('next.config')) detectedFrameworks.add('Next.js');
      if (file.filename.includes('nuxt.config')) detectedFrameworks.add('Nuxt');
      if (file.filename.includes('angular.json')) detectedFrameworks.add('Angular');
      if (file.filename.includes('vite.config')) detectedFrameworks.add('Vite');
      if (file.filename.includes('webpack.config')) detectedFrameworks.add('Webpack');
      if (file.filename.includes('fastify')) detectedFrameworks.add('Fastify');
      if (file.filename.includes('express')) detectedFrameworks.add('Express');

      // Detect test framework
      if (file.filename.includes('jest.config')) testFramework = 'Jest';
      if (file.filename.includes('vitest.config')) testFramework = 'Vitest';
      if (file.filename.includes('mocha')) testFramework = 'Mocha';
      if (file.filename.includes('pytest')) testFramework = 'Pytest';
    }

    // Generate suggested rules based on detected stack
    const suggestedRules: ConventionRule[] = [];

    if (detectedLanguages.has('TypeScript')) {
      suggestedRules.push({
        id: '',
        type: 'CODE_STYLE',
        description: 'Use explicit return types for public functions',
        pattern: 'function.*\\)\\s*{',
        severity: 'warning',
        enabled: true,
      });
    }

    if (detectedFrameworks.has('Next.js') || detectedFrameworks.has('React')) {
      suggestedRules.push({
        id: '',
        type: 'ARCHITECTURE',
        description: 'Use named exports for components',
        pattern: 'export default function',
        severity: 'info',
        enabled: true,
      });
    }

    if (testFramework) {
      suggestedRules.push({
        id: '',
        type: 'TEST_PATTERN',
        description: `Use describe/it blocks for ${testFramework} tests`,
        pattern: 'describe\\(.*,.*\\)',
        severity: 'info',
        enabled: true,
      });
    }

    // Update codebase context
    await db.codebaseContext.upsert({
      where: { repositoryId },
      update: {
        detectedFrameworks: Array.from(detectedFrameworks),
        detectedLanguages: Array.from(detectedLanguages),
        testFramework,
        lastAnalyzedAt: new Date(),
      },
      create: {
        repositoryId,
        detectedFrameworks: Array.from(detectedFrameworks),
        detectedLanguages: Array.from(detectedLanguages),
        testFramework,
        learnedPatterns: {},
        conventionRules: [],
      },
    });

    return {
      detectedFrameworks: Array.from(detectedFrameworks),
      detectedLanguages: Array.from(detectedLanguages),
      testFramework,
      suggestedRules,
    };
  }

  private async recordPattern(
    repositoryId: string,
    pattern: {
      patternType: PatternType;
      pattern: string;
      context: Record<string, unknown>;
    }
  ): Promise<void> {
    await db.reviewPattern.upsert({
      where: {
        repositoryId_patternType_pattern: {
          repositoryId,
          patternType: pattern.patternType,
          pattern: pattern.pattern,
        },
      },
      update: {
        frequency: { increment: 1 },
        context: JSON.parse(JSON.stringify(pattern.context)),
        lastSeenAt: new Date(),
      },
      create: {
        repositoryId,
        patternType: pattern.patternType,
        pattern: pattern.pattern,
        context: JSON.parse(JSON.stringify(pattern.context)),
        frequency: 1,
        confidence: 0.5,
      },
    });
  }

  private async updatePatternConfidence(
    repositoryId: string,
    feedback: FeedbackData
  ): Promise<void> {
    // Get the comment to find related patterns
    const comment = await db.reviewComment.findUnique({
      where: { id: feedback.commentId },
    });

    if (!comment) return;

    const patternType = this.mapCategoryToPatternType(comment.category);
    if (!patternType) return;

    // Find patterns related to this file type
    const patterns = await db.reviewPattern.findMany({
      where: {
        repositoryId,
        patternType,
      },
    });

    // Adjust confidence based on feedback
    const confidenceAdjustment = {
      ACCEPTED: 0.1,
      MODIFIED: 0.05,
      DISMISSED: -0.05,
      REJECTED: -0.1,
      FALSE_POSITIVE: -0.15,
    };

    const adjustment = confidenceAdjustment[feedback.feedbackType] || 0;

    for (const pattern of patterns) {
      const context = pattern.context as Record<string, unknown>;
      if (context.file === comment.file || context.category === comment.category) {
        const newConfidence = Math.max(0, Math.min(1, pattern.confidence + adjustment));
        await db.reviewPattern.update({
          where: { id: pattern.id },
          data: { confidence: newConfidence },
        });
      }
    }
  }

  private async detectConventions(
    repositoryId: string,
    files: string[]
  ): Promise<ConventionRule[]> {
    const conventions: ConventionRule[] = [];

    // Detect naming conventions
    const tsxFiles = files.filter((f) => f.endsWith('.tsx'));
    const componentFiles = tsxFiles.filter((f) => /[A-Z][a-zA-Z]+\.tsx$/.test(f));

    if (componentFiles.length > 0 && componentFiles.length / tsxFiles.length > 0.8) {
      conventions.push({
        id: `conv_${Date.now()}_1`,
        type: 'NAMING_CONVENTION',
        description: 'React components should use PascalCase naming',
        pattern: '[A-Z][a-zA-Z]+\\.tsx$',
        severity: 'warning',
        enabled: true,
      });
    }

    // Detect test file patterns
    const testFiles = files.filter((f) => f.includes('.test.') || f.includes('.spec.'));
    if (testFiles.some((f) => f.includes('.test.'))) {
      conventions.push({
        id: `conv_${Date.now()}_2`,
        type: 'TEST_PATTERN',
        description: 'Test files should use .test. naming convention',
        pattern: '\\.test\\.(ts|tsx|js|jsx)$',
        severity: 'info',
        enabled: true,
      });
    }

    return conventions;
  }

  private async updateCodebaseContext(repositoryId: string): Promise<void> {
    const patterns = await db.reviewPattern.findMany({
      where: { repositoryId },
      orderBy: { confidence: 'desc' },
    });

    // Group patterns by type
    const learnedPatterns: Record<string, LearnedPattern[]> = {};
    for (const p of patterns) {
      if (!learnedPatterns[p.patternType]) {
        learnedPatterns[p.patternType] = [];
      }
      learnedPatterns[p.patternType].push({
        patternType: p.patternType as PatternType,
        pattern: p.pattern,
        context: p.context as Record<string, unknown>,
        frequency: p.frequency,
        confidence: p.confidence,
      });
    }

    await db.codebaseContext.upsert({
      where: { repositoryId },
      update: {
        learnedPatterns: JSON.parse(JSON.stringify(learnedPatterns)),
        lastAnalyzedAt: new Date(),
      },
      create: {
        repositoryId,
        detectedFrameworks: [],
        detectedLanguages: [],
        learnedPatterns: JSON.parse(JSON.stringify(learnedPatterns)),
        conventionRules: [],
      },
    });
  }

  private mapCategoryToPatternType(category: string): PatternType | null {
    const mapping: Record<string, PatternType> = {
      SECURITY: 'SECURITY',
      BUG: 'CODE_STYLE',
      PERFORMANCE: 'CODE_STYLE',
      ERROR_HANDLING: 'ERROR_HANDLING',
      TESTING: 'TEST_PATTERN',
      DOCUMENTATION: 'DOCUMENTATION',
      STYLE: 'CODE_STYLE',
      MAINTAINABILITY: 'ARCHITECTURE',
    };
    return mapping[category] || null;
  }

  private extractPatternFromComment(comment: {
    file: string;
    message: string;
    category: string;
    suggestion?: unknown;
  }): string {
    // Create a pattern identifier from the comment
    const fileExt = comment.file.split('.').pop() || 'unknown';
    const messageHash = this.simpleHash(comment.message);
    return `${comment.category}:${fileExt}:${messageHash}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).substring(0, 8);
  }
}

export const learningService = new LearningService();
