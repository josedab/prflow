/**
 * @fileoverview Synthesis Agent for PRFlow.
 *
 * The Synthesis Agent is the final stage of the PR processing pipeline.
 * It consolidates outputs from all previous agents into a unified,
 * human-readable summary that includes:
 *
 * - Executive summary of the PR
 * - Risk assessment with mitigation recommendations
 * - Findings summary by severity and category
 * - Human review checklist (items needing manual verification)
 * - Inventory of generated assets (tests, docs)
 * - Suggested reviewers
 * - Overall confidence score
 *
 * The output is designed to help human reviewers quickly understand
 * the PR and focus on areas that need their attention.
 *
 * @module agents/synthesis
 */

import type { SynthesisAgentInput, AgentContext, PRSynthesis, RiskLevel, Severity, ReviewCategory, ChecklistItem } from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

/**
 * Synthesis Agent - Final consolidation of PR analysis.
 *
 * Takes outputs from the Analyzer, Reviewer, Test Generator, and Documentation
 * agents and produces a unified summary for human reviewers.
 *
 * The synthesis includes:
 * - **Summary**: 2-4 sentence overview of the PR
 * - **Risk Assessment**: Level, factors, and mitigations
 * - **Findings Summary**: Issue counts by severity/category
 * - **Checklist**: Items requiring human verification
 * - **Generated Assets**: Tests and docs created
 *
 * @example
 * ```typescript
 * const synthesis = new SynthesisAgent();
 * const result = await synthesis.execute({
 *   pr: { title: 'Add auth', body: '...' },
 *   analysis: { type: 'feature', riskLevel: 'medium', ... },
 *   review: { comments: [...], summary: { critical: 0, ... } },
 *   tests: { tests: [...] },
 *   docs: { updates: [...] }
 * }, context);
 *
 * if (result.success) {
 *   console.log('Summary:', result.data.summary);
 *   console.log('Risk Level:', result.data.riskAssessment.level);
 *   console.log('Checklist:', result.data.humanReviewChecklist);
 * }
 * ```
 */
export class SynthesisAgent extends BaseAgent<SynthesisAgentInput, PRSynthesis> {
  readonly name = 'synthesis';
  readonly description = 'Synthesizes analysis results into a human-readable summary';
  
  private useLLM = process.env.ENABLE_LLM_SYNTHESIS !== 'false';

  async execute(input: SynthesisAgentInput, context: AgentContext) {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.synthesize(input, context);
    });

    if (!result) {
      return this.createErrorResult('Synthesis failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async synthesize(input: SynthesisAgentInput, _context: AgentContext): Promise<PRSynthesis> {
    const { pr, analysis, review, tests, docs } = input;

    // Generate summary - try LLM first
    let summary: string;
    if (this.useLLM) {
      try {
        summary = await this.generateSummaryWithLLM(pr, analysis, review, tests, docs);
      } catch (error) {
        logger.warn({ error }, 'LLM synthesis failed, using template-based');
        summary = this.generateSummary(pr, analysis, review);
      }
    } else {
      summary = this.generateSummary(pr, analysis, review);
    }

    // Create risk assessment
    const riskAssessment = this.createRiskAssessment(analysis, review);

    // Create findings summary
    const findingsSummary = this.createFindingsSummary(review);

    // Generate human review checklist - try LLM for better context
    let humanReviewChecklist: ChecklistItem[];
    if (this.useLLM) {
      try {
        humanReviewChecklist = await this.generateChecklistWithLLM(analysis, review);
      } catch (error) {
        logger.warn({ error }, 'LLM checklist generation failed, using template-based');
        humanReviewChecklist = this.generateChecklist(analysis, review);
      }
    } else {
      humanReviewChecklist = this.generateChecklist(analysis, review);
    }

    // Compile generated assets
    const generatedAssets = this.compileGeneratedAssets(tests, docs);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(analysis, review);

    return {
      summary,
      riskAssessment,
      findingsSummary,
      humanReviewChecklist,
      generatedAssets,
      suggestedReviewers: analysis.suggestedReviewers,
      confidence,
    };
  }

  private async generateSummaryWithLLM(
    pr: { title: string; body: string | null },
    analysis: { type: string; riskLevel: string; changes: { filesModified: number; linesAdded: number; linesRemoved: number }; semanticChanges: { type: string; name: string }[]; risks: string[] },
    review: { summary: { critical: number; high: number; medium: number; low: number; nitpick: number }; comments: Array<{ category: string; message: string }> },
    tests: { tests: Array<{ testFile: string }> },
    docs: { updates: Array<{ docType: string; file: string }> }
  ): Promise<string> {
    const systemPrompt = buildSystemPrompt('synthesis', 'PR summary generation');

    const userPrompt = `Generate a comprehensive yet concise summary for this pull request.

## PR Information
- Title: ${pr.title}
- Description: ${pr.body || 'No description'}
- Type: ${analysis.type}
- Risk Level: ${analysis.riskLevel}

## Changes
- Files Modified: ${analysis.changes.filesModified}
- Lines Added: ${analysis.changes.linesAdded}
- Lines Removed: ${analysis.changes.linesRemoved}
- Key Changes: ${analysis.semanticChanges.slice(0, 5).map((c) => `${c.type}: ${c.name}`).join(', ')}

## Review Findings
- Critical Issues: ${review.summary.critical}
- High Issues: ${review.summary.high}
- Medium Issues: ${review.summary.medium}
- Low Issues: ${review.summary.low}
${review.comments.slice(0, 3).map((c) => `- ${c.category}: ${c.message.substring(0, 100)}`).join('\n')}

## Risks
${analysis.risks.join('\n')}

## Generated Assets
- Tests Generated: ${tests.tests.length}
- Doc Updates: ${docs.updates.length}

Write a 2-4 sentence summary that:
1. Describes what this PR does
2. Highlights any critical concerns
3. Gives a recommendation on merge readiness

Use markdown formatting for emphasis where appropriate. Respond with ONLY the summary.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(messages, {
      temperature: 0.5,
      maxTokens: 500,
    });

    return response.content.trim();
  }

  private async generateChecklistWithLLM(
    analysis: { type: string; riskLevel: string; semanticChanges: { type: string; file: string }[]; risks: string[] },
    review: { comments: Array<{ category: string; severity: string; file: string; message: string }> }
  ): Promise<ChecklistItem[]> {
    const systemPrompt = buildSystemPrompt('synthesis', 'Review checklist generation');

    const userPrompt = `Generate a prioritized review checklist for this pull request.

## PR Analysis
- Type: ${analysis.type}
- Risk Level: ${analysis.riskLevel}
- Semantic Changes: ${analysis.semanticChanges.slice(0, 10).map((c) => `${c.type} in ${c.file}`).join(', ')}
- Identified Risks: ${analysis.risks.join('; ')}

## Review Comments
${review.comments.slice(0, 10).map((c) => `- [${c.severity}] ${c.category}: ${c.message.substring(0, 100)}`).join('\n')}

Generate a JSON array of checklist items. Each item should have:
- item: string (what to check)
- reason: string (why this is important)
- priority: "required" | "recommended" | "optional"

Focus on:
1. Critical issues that must be addressed
2. Areas needing human judgment
3. Potential impacts not caught by automation

Respond with ONLY the JSON array.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const response = await callLLM(messages, {
      temperature: 0.3,
      maxTokens: 1000,
    });

    try {
      const content = response.content.trim();
      const jsonStr = content.startsWith('[') ? content :
                      content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;
      
      return JSON.parse(jsonStr) as ChecklistItem[];
    } catch (error) {
      logger.warn({ error }, 'Failed to parse LLM checklist response');
      throw error;
    }
  }

  private generateSummary(
    pr: { title: string; body: string | null },
    analysis: { type: string; riskLevel: string; changes: { filesModified: number; linesAdded: number; linesRemoved: number }; semanticChanges: { type: string; name: string }[] },
    review: { summary: { critical: number; high: number; medium: number } }
  ): string {
    const prType = this.formatPRType(analysis.type);
    const changeSize = this.describeChangeSize(analysis.changes);
    
    let summary = `This ${prType} PR ${changeSize}. `;

    // Describe main changes
    const significantChanges = analysis.semanticChanges.filter(
      (c) => c.type.includes('api') || c.type.includes('function')
    ).slice(0, 3);

    if (significantChanges.length > 0) {
      const changeDescriptions = significantChanges.map((c) => 
        `${this.formatChangeType(c.type)} "${c.name}"`
      );
      summary += `Key changes include ${changeDescriptions.join(', ')}. `;
    }

    // Summarize findings
    const totalIssues = review.summary.critical + review.summary.high + review.summary.medium;
    if (totalIssues === 0) {
      summary += 'No significant issues were detected.';
    } else if (review.summary.critical > 0) {
      summary += `**${review.summary.critical} critical issue(s)** require immediate attention.`;
    } else if (review.summary.high > 0) {
      summary += `${review.summary.high} high-priority issue(s) should be addressed before merge.`;
    } else {
      summary += `${totalIssues} minor issue(s) were found for consideration.`;
    }

    return summary;
  }

  private formatPRType(type: string): string {
    const types: Record<string, string> = {
      feature: 'feature',
      bugfix: 'bug fix',
      refactor: 'refactoring',
      docs: 'documentation',
      test: 'testing',
      deps: 'dependency update',
      chore: 'maintenance',
    };
    return types[type] || type;
  }

  private formatChangeType(type: string): string {
    const types: Record<string, string> = {
      new_function: 'adds',
      modified_function: 'modifies',
      new_api: 'introduces API',
      modified_api: 'updates API',
      new_class: 'adds class',
      dependency_added: 'adds dependency',
    };
    return types[type] || type;
  }

  private describeChangeSize(changes: { filesModified: number; linesAdded: number; linesRemoved: number }): string {
    const total = changes.linesAdded + changes.linesRemoved;
    
    if (total < 50) {
      return `makes minor changes across ${changes.filesModified} file(s)`;
    } else if (total < 200) {
      return `contains moderate changes (+${changes.linesAdded}/-${changes.linesRemoved} lines) across ${changes.filesModified} file(s)`;
    } else if (total < 500) {
      return `is a substantial change (+${changes.linesAdded}/-${changes.linesRemoved} lines) touching ${changes.filesModified} file(s)`;
    } else {
      return `is a large change (+${changes.linesAdded}/-${changes.linesRemoved} lines) across ${changes.filesModified} file(s)`;
    }
  }

  private createRiskAssessment(
    analysis: { riskLevel: string; risks: string[] },
    review: { summary: { critical: number; high: number } }
  ): PRSynthesis['riskAssessment'] {
    // Adjust risk level based on review findings
    let level: RiskLevel = analysis.riskLevel as RiskLevel;
    
    if (review.summary.critical > 0 && level !== 'critical') {
      level = 'critical';
    } else if (review.summary.high > 2 && (level === 'low' || level === 'medium')) {
      level = 'high';
    }

    // Generate mitigations
    const mitigations: string[] = [];
    
    if (analysis.risks.some((r) => r.toLowerCase().includes('security'))) {
      mitigations.push('Request security team review');
    }
    if (analysis.risks.some((r) => r.toLowerCase().includes('database') || r.toLowerCase().includes('migration'))) {
      mitigations.push('Test migration in staging environment');
    }
    if (analysis.risks.some((r) => r.toLowerCase().includes('large') || r.toLowerCase().includes('split'))) {
      mitigations.push('Consider splitting into smaller PRs');
    }
    if (review.summary.critical > 0) {
      mitigations.push('Address critical issues before merge');
    }

    if (mitigations.length === 0) {
      mitigations.push('Standard review process is sufficient');
    }

    return {
      level,
      factors: analysis.risks,
      mitigations,
    };
  }

  private createFindingsSummary(review: { 
    summary: { critical: number; high: number; medium: number; low: number; nitpick: number };
    autoFixed: string[];
    comments: Array<{ category: string }>;
  }): PRSynthesis['findingsSummary'] {
    const bySeverity: Record<Severity, number> = {
      critical: review.summary.critical,
      high: review.summary.high,
      medium: review.summary.medium,
      low: review.summary.low,
      nitpick: review.summary.nitpick,
    };

    const byCategory: Record<ReviewCategory, number> = {
      security: 0,
      bug: 0,
      performance: 0,
      error_handling: 0,
      testing: 0,
      documentation: 0,
      style: 0,
      maintainability: 0,
    };

    for (const comment of review.comments) {
      const category = comment.category as ReviewCategory;
      if (category in byCategory) {
        byCategory[category]++;
      }
    }

    return {
      totalIssues: Object.values(bySeverity).reduce((a, b) => a + b, 0),
      bySeverity,
      byCategory,
      autoFixed: review.autoFixed.length,
    };
  }

  private generateChecklist(
    analysis: { type: string; riskLevel: string; semanticChanges: { type: string; file: string }[] },
    review: { comments: Array<{ category: string; severity: string; file: string }> }
  ): ChecklistItem[] {
    const checklist: ChecklistItem[] = [];

    // Add items based on risk level
    if (analysis.riskLevel === 'critical' || analysis.riskLevel === 'high') {
      checklist.push({
        item: 'Verify all critical issues are addressed',
        reason: 'High-risk PR requires thorough review',
        priority: 'required',
      });
    }

    // Add items based on change types
    const hasApiChanges = analysis.semanticChanges.some((c) => c.type.includes('api'));
    if (hasApiChanges) {
      checklist.push({
        item: 'Review API contract changes',
        reason: 'API changes may affect consumers',
        priority: 'required',
      });
      checklist.push({
        item: 'Check backward compatibility',
        reason: 'Ensure existing integrations continue to work',
        priority: 'recommended',
      });
    }

    // Add items based on security findings
    const hasSecurityIssues = review.comments.some((c) => c.category === 'security');
    if (hasSecurityIssues) {
      checklist.push({
        item: 'Security review of flagged issues',
        reason: 'Security issues detected by automated analysis',
        priority: 'required',
      });
    }

    // Add items based on error handling findings
    const hasErrorHandlingIssues = review.comments.some((c) => c.category === 'error_handling');
    if (hasErrorHandlingIssues) {
      checklist.push({
        item: 'Review error handling patterns',
        reason: 'Error handling issues may affect reliability',
        priority: 'recommended',
      });
    }

    // Add database/migration checks
    const hasDbChanges = analysis.semanticChanges.some((c) => 
      c.file.includes('migration') || c.file.includes('schema')
    );
    if (hasDbChanges) {
      checklist.push({
        item: 'Verify database migration is reversible',
        reason: 'Database changes detected',
        priority: 'required',
      });
      checklist.push({
        item: 'Check for data integrity impact',
        reason: 'Schema changes may affect existing data',
        priority: 'recommended',
      });
    }

    // Add test coverage check
    checklist.push({
      item: 'Verify test coverage is adequate',
      reason: 'New code should have appropriate tests',
      priority: 'recommended',
    });

    // General code quality
    checklist.push({
      item: 'Review code for maintainability',
      reason: 'Standard code review item',
      priority: 'optional',
    });

    return checklist;
  }

  private compileGeneratedAssets(
    tests: { tests: Array<{ testFile: string }> },
    docs: { updates: Array<{ docType: string; file: string }>; changelogEntry?: string }
  ): PRSynthesis['generatedAssets'] {
    const assets: PRSynthesis['generatedAssets'] = [];

    for (const test of tests.tests) {
      assets.push({
        type: 'test',
        description: `Generated test file`,
        file: test.testFile,
      });
    }

    for (const update of docs.updates) {
      assets.push({
        type: 'doc',
        description: `${update.docType} update suggested`,
        file: update.file,
      });
    }

    if (docs.changelogEntry) {
      assets.push({
        type: 'changelog',
        description: 'Changelog entry generated',
        file: 'CHANGELOG.md',
      });
    }

    return assets;
  }

  private calculateConfidence(
    analysis: { riskLevel: string },
    review: { comments: Array<{ confidence: number }> }
  ): number {
    if (review.comments.length === 0) {
      return 0.9; // High confidence when no issues found
    }

    const avgCommentConfidence = review.comments.reduce((sum, c) => sum + c.confidence, 0) / review.comments.length;
    
    // Adjust based on risk level
    const riskPenalty: Record<string, number> = {
      low: 0,
      medium: 0.05,
      high: 0.1,
      critical: 0.15,
    };

    return Math.max(0.5, avgCommentConfidence - (riskPenalty[analysis.riskLevel] || 0));
  }
}
