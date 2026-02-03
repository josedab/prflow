/**
 * @fileoverview Semantic Versioning Agent for PRFlow.
 *
 * Analyzes pull requests and commits to automatically determine
 * the appropriate semantic version bump and generate release notes.
 *
 * Capabilities:
 * - Detect breaking changes from code analysis
 * - Parse conventional commit messages
 * - Analyze PR labels and titles
 * - Generate changelog entries
 * - Suggest version bumps with confidence scores
 *
 * @module agents/semver
 */

import type {
  AgentContext,
  SemverAgentInput,
  VersionBumpAnalysis,
  SemverBump,
  ChangelogEntry,
  ChangelogCategory,
  VersionBumpFactor,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';
import { parseLLMJsonOrThrow } from '../lib/llm-parser.js';

/**
 * Default conventional commit patterns
 */
const DEFAULT_COMMIT_PATTERNS: Array<{ pattern: RegExp; category: ChangelogCategory; isBreaking?: boolean }> = [
  { pattern: /^BREAKING[\s-]?CHANGE/i, category: 'breaking', isBreaking: true },
  { pattern: /^feat(\(.+\))?!:/i, category: 'feature', isBreaking: true },
  { pattern: /^feat(\(.+\))?:/i, category: 'feature' },
  { pattern: /^fix(\(.+\))?:/i, category: 'fix' },
  { pattern: /^perf(\(.+\))?:/i, category: 'performance' },
  { pattern: /^refactor(\(.+\))?:/i, category: 'refactor' },
  { pattern: /^docs(\(.+\))?:/i, category: 'documentation' },
  { pattern: /^test(\(.+\))?:/i, category: 'test' },
  { pattern: /^chore(\(.+\))?:/i, category: 'chore' },
  { pattern: /^security(\(.+\))?:/i, category: 'security' },
  { pattern: /^deprecate(\(.+\))?:/i, category: 'deprecation' },
];

/**
 * Breaking change indicators in code
 */
const BREAKING_INDICATORS = [
  /deleted?\s+(function|class|method|interface|type|export)/i,
  /removed?\s+(function|class|method|interface|type|export)/i,
  /renamed?\s+(function|class|method|interface|type|export)/i,
  /changed?\s+(signature|parameters|return\s+type)/i,
  /BREAKING/i,
];

interface LLMSemverResult {
  recommendedBump: 'major' | 'minor' | 'patch' | 'none';
  confidence: number;
  reasoning: string;
  changes: Array<{
    category: string;
    description: string;
    isBreaking: boolean;
    scope?: string;
  }>;
  breakingChanges: string[];
}

/**
 * Semantic Versioning Agent
 *
 * Analyzes PR changes to determine appropriate version bumps
 * following semantic versioning principles.
 */
export class SemverAgent extends BaseAgent<SemverAgentInput, VersionBumpAnalysis> {
  readonly name = 'semver';
  readonly description = 'Analyzes changes to determine semantic version bumps and generate release notes';

  private useLLM = process.env.ENABLE_LLM_ANALYSIS !== 'false';

  async execute(input: SemverAgentInput, context: AgentContext) {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.analyze(input, context);
    });

    return result.success
      ? this.createSuccessResult(result.data!, latencyMs)
      : this.createErrorResult(result.error!, latencyMs);
  }

  private async analyze(
    input: SemverAgentInput,
    context: AgentContext
  ): Promise<{ success: boolean; data?: VersionBumpAnalysis; error?: string }> {
    try {
      logger.info({ repo: input.repository.fullName, prCount: input.pullRequests.length }, 'Starting semver analysis');

      // Step 1: Extract changes from PRs using pattern matching
      const patternChanges = this.extractChangesFromPatterns(input);
      
      // Step 2: Detect breaking changes from code analysis
      const breakingFactors = this.detectBreakingChanges(input);
      
      // Step 3: Use LLM for nuanced analysis if enabled
      let llmAnalysis: LLMSemverResult | null = null;
      if (this.useLLM && input.pullRequests.length > 0) {
        llmAnalysis = await this.performLLMAnalysis(input, context);
      }

      // Step 4: Combine results and determine version bump
      const analysis = this.synthesizeAnalysis(
        input,
        patternChanges,
        breakingFactors,
        llmAnalysis
      );

      logger.info(
        { 
          repo: input.repository.fullName, 
          bump: analysis.recommendedBump,
          confidence: analysis.confidence,
          changeCount: analysis.changes.length
        },
        'Semver analysis completed'
      );

      return { success: true, data: analysis };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ error: message }, 'Semver analysis failed');
      return { success: false, error: message };
    }
  }

  /**
   * Extract changes using conventional commit patterns
   */
  private extractChangesFromPatterns(input: SemverAgentInput): ChangelogEntry[] {
    const changes: ChangelogEntry[] = [];

    for (const pr of input.pullRequests) {
      // Check PR title first
      const titleMatch = this.matchCommitPattern(pr.title);
      if (titleMatch) {
        changes.push({
          category: titleMatch.category,
          description: this.cleanDescription(pr.title, titleMatch.category),
          prNumber: pr.number,
          author: pr.author,
          affectedFiles: pr.files,
          isBreaking: titleMatch.isBreaking || false,
          scope: this.extractScope(pr.title),
          issueRefs: this.extractIssueRefs(pr.body || ''),
        });
        continue;
      }

      // Check commits
      for (const commit of pr.commits) {
        const commitMatch = this.matchCommitPattern(commit.message);
        if (commitMatch) {
          changes.push({
            category: commitMatch.category,
            description: this.cleanDescription(commit.message, commitMatch.category),
            prNumber: pr.number,
            author: commit.author,
            affectedFiles: pr.files,
            isBreaking: commitMatch.isBreaking || false,
            scope: this.extractScope(commit.message),
          });
        }
      }

      // Check PR labels
      const labelCategory = this.categoryFromLabels(pr.labels);
      if (labelCategory && !changes.some(c => c.prNumber === pr.number)) {
        changes.push({
          category: labelCategory,
          description: pr.title,
          prNumber: pr.number,
          author: pr.author,
          affectedFiles: pr.files,
          isBreaking: pr.labels.some(l => l.toLowerCase().includes('breaking')),
        });
      }
    }

    return changes;
  }

  private matchCommitPattern(message: string): { category: ChangelogCategory; isBreaking?: boolean } | null {
    for (const { pattern, category, isBreaking } of DEFAULT_COMMIT_PATTERNS) {
      if (pattern.test(message)) {
        return { category, isBreaking };
      }
    }
    return null;
  }

  private cleanDescription(message: string, _category: ChangelogCategory): string {
    // Remove conventional commit prefix
    return message
      .replace(/^(feat|fix|docs|style|refactor|perf|test|chore|security|deprecate)(\(.+\))?!?:\s*/i, '')
      .replace(/^BREAKING[\s-]?CHANGE:\s*/i, '')
      .trim();
  }

  private extractScope(message: string): string | undefined {
    const match = message.match(/^\w+\(([^)]+)\)/);
    return match ? match[1] : undefined;
  }

  private extractIssueRefs(body: string): string[] {
    const refs: string[] = [];
    const patterns = [
      /(?:closes?|fixes?|resolves?)\s+#(\d+)/gi,
      /#(\d+)/g,
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(body)) !== null) {
        refs.push(`#${match[1]}`);
      }
    }
    
    return [...new Set(refs)];
  }

  private categoryFromLabels(labels: string[]): ChangelogCategory | null {
    const labelMap: Record<string, ChangelogCategory> = {
      'feature': 'feature',
      'enhancement': 'feature',
      'bug': 'fix',
      'bugfix': 'fix',
      'fix': 'fix',
      'documentation': 'documentation',
      'docs': 'documentation',
      'performance': 'performance',
      'refactor': 'refactor',
      'security': 'security',
      'breaking': 'breaking',
      'breaking-change': 'breaking',
    };

    for (const label of labels) {
      const normalized = label.toLowerCase().replace(/[^a-z]/g, '');
      if (labelMap[normalized]) {
        return labelMap[normalized];
      }
    }
    return null;
  }

  /**
   * Detect breaking changes from code patterns
   */
  private detectBreakingChanges(input: SemverAgentInput): VersionBumpFactor[] {
    const factors: VersionBumpFactor[] = [];

    for (const pr of input.pullRequests) {
      // Check for breaking indicators in commits
      for (const commit of pr.commits) {
        for (const indicator of BREAKING_INDICATORS) {
          if (indicator.test(commit.message)) {
            factors.push({
              type: 'breaking_change',
              description: commit.message.split('\n')[0],
              impact: 'major',
              location: `PR #${pr.number}`,
            });
          }
        }
      }

      // Check for API changes in file names
      const apiFiles = pr.files.filter(f => 
        f.includes('/api/') || 
        f.includes('routes') || 
        f.endsWith('.d.ts') ||
        f.includes('index.ts')
      );
      if (apiFiles.length > 0) {
        factors.push({
          type: 'api_change',
          description: `API files modified: ${apiFiles.slice(0, 3).join(', ')}${apiFiles.length > 3 ? '...' : ''}`,
          impact: 'minor',
          location: `PR #${pr.number}`,
        });
      }

      // Check for dependency updates
      const depFiles = pr.files.filter(f => 
        f === 'package.json' || 
        f === 'package-lock.json' ||
        f.endsWith('requirements.txt') ||
        f === 'go.mod'
      );
      if (depFiles.length > 0) {
        factors.push({
          type: 'dependency_update',
          description: `Dependencies modified: ${depFiles.join(', ')}`,
          impact: 'patch',
          location: `PR #${pr.number}`,
        });
      }
    }

    return factors;
  }

  /**
   * Use LLM for deeper analysis
   */
  private async performLLMAnalysis(
    input: SemverAgentInput,
    _context: AgentContext
  ): Promise<LLMSemverResult | null> {
    try {
      const prSummaries = input.pullRequests.map(pr => ({
        number: pr.number,
        title: pr.title,
        labels: pr.labels,
        files: pr.files.slice(0, 10),
        commitMessages: pr.commits.slice(0, 5).map(c => c.message),
      }));

      const systemPrompt = buildSystemPrompt('semantic versioning', `
Repository: ${input.repository.fullName}
Current Version: ${input.currentVersion || 'unknown'}
PRs to Analyze: ${input.pullRequests.length}
`);

      const userPrompt = `Analyze these pull requests and determine the appropriate semantic version bump.

Pull Requests:
${JSON.stringify(prSummaries, null, 2)}

Rules:
- MAJOR: Breaking changes, removed APIs, incompatible changes
- MINOR: New features, new APIs (backward compatible)
- PATCH: Bug fixes, documentation, internal changes
- NONE: No releasable changes

Respond with JSON:
{
  "recommendedBump": "major" | "minor" | "patch" | "none",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "changes": [{"category": "feature|fix|breaking|...", "description": "...", "isBreaking": false, "scope": "optional"}],
  "breakingChanges": ["list of breaking changes if any"]
}`;

      const messages: LLMMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ];

      const response = await callLLM(messages, { temperature: 0.2, maxTokens: 1500 });
      return parseLLMJsonOrThrow<LLMSemverResult>(response.content);
    } catch (error) {
      logger.warn({ error }, 'LLM semver analysis failed, using pattern-based analysis only');
      return null;
    }
  }

  /**
   * Combine all analysis results
   */
  private synthesizeAnalysis(
    input: SemverAgentInput,
    patternChanges: ChangelogEntry[],
    breakingFactors: VersionBumpFactor[],
    llmAnalysis: LLMSemverResult | null
  ): VersionBumpAnalysis {
    // Merge changes from patterns and LLM
    const allChanges = [...patternChanges];
    
    if (llmAnalysis) {
      for (const change of llmAnalysis.changes) {
        const category = this.normalizeCategory(change.category);
        if (!allChanges.some(c => c.description === change.description)) {
          allChanges.push({
            category,
            description: change.description,
            prNumber: 0,
            author: '',
            affectedFiles: [],
            isBreaking: change.isBreaking,
            scope: change.scope,
          });
        }
      }
    }

    // Determine bump level
    const hasBreaking = allChanges.some(c => c.isBreaking || c.category === 'breaking') ||
                        breakingFactors.some(f => f.impact === 'major');
    const hasFeature = allChanges.some(c => c.category === 'feature');
    const hasFix = allChanges.some(c => ['fix', 'security', 'performance'].includes(c.category));

    let recommendedBump: SemverBump = 'none';
    if (hasBreaking) {
      recommendedBump = 'major';
    } else if (hasFeature) {
      recommendedBump = 'minor';
    } else if (hasFix || allChanges.length > 0) {
      recommendedBump = 'patch';
    }

    // Use LLM recommendation if available and confident
    if (llmAnalysis && llmAnalysis.confidence > 0.8) {
      recommendedBump = llmAnalysis.recommendedBump;
    }

    // Calculate suggested version
    const suggestedVersion = input.currentVersion 
      ? this.bumpVersion(input.currentVersion, recommendedBump)
      : null;

    // Compile factors
    const factors: VersionBumpFactor[] = [...breakingFactors];
    if (hasFeature) {
      factors.push({
        type: 'new_feature',
        description: `${allChanges.filter(c => c.category === 'feature').length} new features detected`,
        impact: 'minor',
      });
    }
    if (hasFix) {
      factors.push({
        type: 'bug_fix',
        description: `${allChanges.filter(c => c.category === 'fix').length} bug fixes detected`,
        impact: 'patch',
      });
    }

    // Calculate confidence
    let confidence = 0.5;
    if (llmAnalysis) {
      confidence = (confidence + llmAnalysis.confidence) / 2;
    }
    if (patternChanges.length > 0) {
      confidence += 0.2;
    }
    confidence = Math.min(confidence, 1.0);

    return {
      recommendedBump,
      currentVersion: input.currentVersion,
      suggestedVersion,
      confidence,
      factors,
      changes: allChanges,
    };
  }

  private normalizeCategory(category: string): ChangelogCategory {
    const map: Record<string, ChangelogCategory> = {
      'breaking': 'breaking',
      'feature': 'feature',
      'feat': 'feature',
      'fix': 'fix',
      'bug': 'fix',
      'performance': 'performance',
      'perf': 'performance',
      'refactor': 'refactor',
      'documentation': 'documentation',
      'docs': 'documentation',
      'test': 'test',
      'chore': 'chore',
      'security': 'security',
      'deprecation': 'deprecation',
    };
    return map[category.toLowerCase()] || 'chore';
  }

  private bumpVersion(version: string, bump: SemverBump): string {
    const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
    if (!match) return version;

    let [, major, minor, patch] = match.map(Number);
    const prefix = version.startsWith('v') ? 'v' : '';

    switch (bump) {
      case 'major':
        major++;
        minor = 0;
        patch = 0;
        break;
      case 'minor':
        minor++;
        patch = 0;
        break;
      case 'patch':
        patch++;
        break;
    }

    return `${prefix}${major}.${minor}.${patch}`;
  }
}
