import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { fixApplicationService, type BatchFixResult } from './fix-application.js';
import { NotFoundError } from '../lib/errors.js';
import { broadcastToRepository } from '../lib/websocket.js';

/**
 * Severity levels for fix prioritization
 */
export type FixSeverity = 'critical' | 'high' | 'medium' | 'low' | 'nitpick';

/**
 * Fix category for grouping
 */
export type FixCategory = 'security' | 'bug' | 'performance' | 'error_handling' | 'style' | 'maintainability';

/**
 * Fix applicability analysis result
 */
export interface FixApplicability {
  commentId: string;
  file: string;
  line: number;
  severity: FixSeverity;
  category: FixCategory;
  canAutoApply: boolean;
  isBreaking: boolean;
  confidence: number;
  reason?: string;
  dependencies?: string[]; // Other fixes that must be applied first
}

/**
 * Auto-remediation plan
 */
export interface RemediationPlan {
  workflowId: string;
  prNumber: number;
  totalFixes: number;
  autoApplicable: number;
  manualRequired: number;
  breakingChanges: number;
  phases: RemediationPhase[];
  estimatedImpact: {
    filesAffected: number;
    linesChanged: number;
    issuesResolved: number;
  };
}

/**
 * A phase of fixes to apply together
 */
export interface RemediationPhase {
  id: string;
  name: string;
  description: string;
  order: number;
  fixes: FixApplicability[];
  canAutoApply: boolean;
  requiresReview: boolean;
}

/**
 * Result of auto-remediation execution
 */
export interface RemediationResult {
  planId: string;
  workflowId: string;
  success: boolean;
  phasesCompleted: number;
  phasesTotal: number;
  appliedFixes: string[];
  skippedFixes: string[];
  failedFixes: Array<{ commentId: string; error: string }>;
  commitShas: string[];
  reanalysisTriggered: boolean;
  summary: {
    securityFixed: number;
    bugsFixed: number;
    performanceFixed: number;
    styleFixed: number;
    totalFixed: number;
  };
}

/**
 * Auto-remediation configuration
 */
export interface RemediationConfig {
  autoApplyThreshold: number; // Minimum confidence to auto-apply (0-1)
  includeSeverities: FixSeverity[];
  includeCategories: FixCategory[];
  skipBreakingChanges: boolean;
  triggerReanalysis: boolean;
  commitStrategy: 'single' | 'per-phase' | 'per-file';
  dryRun: boolean;
}

const DEFAULT_CONFIG: RemediationConfig = {
  autoApplyThreshold: 0.8,
  includeSeverities: ['critical', 'high', 'medium'],
  includeCategories: ['security', 'bug', 'performance', 'error_handling'],
  skipBreakingChanges: true,
  triggerReanalysis: true,
  commitStrategy: 'single',
  dryRun: false,
};

export class AutoRemediationService {
  /**
   * Analyze all fixes for a workflow and determine applicability
   */
  async analyzeFixApplicability(workflowId: string): Promise<FixApplicability[]> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: {
        reviewComments: {
          where: {
            status: { notIn: ['FIX_APPLIED', 'DISMISSED', 'RESOLVED'] },
          },
        },
        repository: true,
      },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    const applicabilities: FixApplicability[] = [];

    for (const comment of workflow.reviewComments) {
      const suggestion = comment.suggestion as { originalCode?: string; suggestedCode?: string } | null;
      
      // Skip comments without suggestions
      if (!suggestion || !suggestion.originalCode || !suggestion.suggestedCode) {
        continue;
      }

      const applicability = this.analyzeComment(comment, suggestion);
      applicabilities.push(applicability);
    }

    // Sort by priority (severity, then confidence)
    return this.prioritizeFixes(applicabilities);
  }

  /**
   * Generate a remediation plan for a workflow
   */
  async generateRemediationPlan(
    workflowId: string,
    config: Partial<RemediationConfig> = {}
  ): Promise<RemediationPlan> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const applicabilities = await this.analyzeFixApplicability(workflowId);

    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { reviewComments: true },
    });

    if (!workflow) {
      throw new NotFoundError('Workflow', workflowId);
    }

    // Filter based on config
    const eligibleFixes = applicabilities.filter((fix) => {
      if (!mergedConfig.includeSeverities.includes(fix.severity)) return false;
      if (!mergedConfig.includeCategories.includes(fix.category)) return false;
      if (mergedConfig.skipBreakingChanges && fix.isBreaking) return false;
      return true;
    });

    // Group into phases
    const phases = this.createPhases(eligibleFixes, mergedConfig);

    // Calculate impact
    const filesAffected = new Set(eligibleFixes.map((f) => f.file)).size;
    const autoApplicable = eligibleFixes.filter((f) => 
      f.canAutoApply && f.confidence >= mergedConfig.autoApplyThreshold
    ).length;

    return {
      workflowId,
      prNumber: workflow.prNumber,
      totalFixes: eligibleFixes.length,
      autoApplicable,
      manualRequired: eligibleFixes.length - autoApplicable,
      breakingChanges: applicabilities.filter((f) => f.isBreaking).length,
      phases,
      estimatedImpact: {
        filesAffected,
        linesChanged: eligibleFixes.length * 5, // Rough estimate
        issuesResolved: eligibleFixes.length,
      },
    };
  }

  /**
   * Execute auto-remediation based on a plan
   */
  async executeRemediation(
    workflowId: string,
    config: Partial<RemediationConfig> = {},
    installationId: number,
    userId: string
  ): Promise<RemediationResult> {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };
    const plan = await this.generateRemediationPlan(workflowId, mergedConfig);

    const result: RemediationResult = {
      planId: `plan-${Date.now()}`,
      workflowId,
      success: false,
      phasesCompleted: 0,
      phasesTotal: plan.phases.length,
      appliedFixes: [],
      skippedFixes: [],
      failedFixes: [],
      commitShas: [],
      reanalysisTriggered: false,
      summary: {
        securityFixed: 0,
        bugsFixed: 0,
        performanceFixed: 0,
        styleFixed: 0,
        totalFixed: 0,
      },
    };

    if (plan.phases.length === 0) {
      result.success = true;
      return result;
    }

    // Notify start
    await this.notifyProgress(workflowId, 'started', { plan });

    try {
      for (const phase of plan.phases) {
        if (!phase.canAutoApply && !mergedConfig.dryRun) {
          // Skip phases requiring manual review
          phase.fixes.forEach((f) => result.skippedFixes.push(f.commentId));
          continue;
        }

        const eligibleFixes = phase.fixes.filter(
          (f) => f.canAutoApply && f.confidence >= mergedConfig.autoApplyThreshold
        );

        if (eligibleFixes.length === 0) {
          continue;
        }

        if (mergedConfig.dryRun) {
          // Dry run - just record what would be done
          eligibleFixes.forEach((f) => result.appliedFixes.push(f.commentId));
          result.phasesCompleted++;
          continue;
        }

        // Apply fixes based on commit strategy
        let batchResult: BatchFixResult;

        if (mergedConfig.commitStrategy === 'per-file') {
          // Group by file and apply separately
          const byFile = this.groupByFile(eligibleFixes);
          
          for (const [, fixes] of Object.entries(byFile)) {
            const commentIds = fixes.map((f) => f.commentId);
            batchResult = await fixApplicationService.applyBatchFix({
              commentIds,
              userId,
              installationId,
              commitMessage: `fix: Apply ${fixes.length} PRFlow fixes to ${fixes[0].file}`,
            });

            result.appliedFixes.push(...batchResult.appliedFixes);
            result.failedFixes.push(...batchResult.failedFixes);
            if (batchResult.commitSha) {
              result.commitShas.push(batchResult.commitSha);
            }
          }
        } else {
          // Single commit for all fixes in phase (or all phases)
          const commentIds = eligibleFixes.map((f) => f.commentId);
          batchResult = await fixApplicationService.applyBatchFix({
            commentIds,
            userId,
            installationId,
            commitMessage: `fix: Apply ${commentIds.length} PRFlow fixes (${phase.name})`,
          });

          result.appliedFixes.push(...batchResult.appliedFixes);
          result.failedFixes.push(...batchResult.failedFixes);
          if (batchResult.commitSha) {
            result.commitShas.push(batchResult.commitSha);
          }
        }

        result.phasesCompleted++;

        // Notify progress
        await this.notifyProgress(workflowId, 'phase_completed', {
          phase: phase.name,
          applied: result.appliedFixes.length,
        });
      }

      // Update summary
      for (const fixId of result.appliedFixes) {
        const comment = await db.reviewComment.findUnique({
          where: { id: fixId },
          select: { category: true },
        });

        if (comment) {
          switch (comment.category) {
            case 'SECURITY':
              result.summary.securityFixed++;
              break;
            case 'BUG':
              result.summary.bugsFixed++;
              break;
            case 'PERFORMANCE':
              result.summary.performanceFixed++;
              break;
            default:
              result.summary.styleFixed++;
          }
          result.summary.totalFixed++;
        }
      }

      // Trigger re-analysis if configured
      if (mergedConfig.triggerReanalysis && result.appliedFixes.length > 0) {
        await this.triggerReanalysis(workflowId);
        result.reanalysisTriggered = true;
      }

      result.success = result.failedFixes.length === 0;

      // Notify completion
      await this.notifyProgress(workflowId, 'completed', { result });

      logger.info({
        workflowId,
        applied: result.appliedFixes.length,
        failed: result.failedFixes.length,
        commits: result.commitShas.length,
      }, 'Auto-remediation completed');

    } catch (error) {
      logger.error({ error, workflowId }, 'Auto-remediation failed');
      result.success = false;
      
      await this.notifyProgress(workflowId, 'failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return result;
  }

  /**
   * Apply all safe fixes with one click
   */
  async applyAllSafeFixes(
    workflowId: string,
    installationId: number,
    userId: string
  ): Promise<RemediationResult> {
    return this.executeRemediation(
      workflowId,
      {
        autoApplyThreshold: 0.85,
        includeSeverities: ['critical', 'high', 'medium'],
        includeCategories: ['security', 'bug', 'performance', 'error_handling'],
        skipBreakingChanges: true,
        triggerReanalysis: true,
        commitStrategy: 'single',
        dryRun: false,
      },
      installationId,
      userId
    );
  }

  /**
   * Get fix statistics for a workflow
   */
  async getFixStatistics(workflowId: string): Promise<{
    total: number;
    byStatus: Record<string, number>;
    bySeverity: Record<string, number>;
    byCategory: Record<string, number>;
    autoApplicable: number;
    applied: number;
    pending: number;
  }> {
    const comments = await db.reviewComment.findMany({
      where: { workflowId },
      select: {
        id: true,
        status: true,
        severity: true,
        category: true,
        suggestion: true,
      },
    });

    const stats = {
      total: comments.length,
      byStatus: {} as Record<string, number>,
      bySeverity: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      autoApplicable: 0,
      applied: 0,
      pending: 0,
    };

    for (const comment of comments) {
      // By status
      stats.byStatus[comment.status] = (stats.byStatus[comment.status] || 0) + 1;

      // By severity
      stats.bySeverity[comment.severity] = (stats.bySeverity[comment.severity] || 0) + 1;

      // By category
      stats.byCategory[comment.category] = (stats.byCategory[comment.category] || 0) + 1;

      // Check if auto-applicable
      if (comment.suggestion) {
        stats.autoApplicable++;
      }

      // Count applied vs pending
      if (comment.status === 'FIX_APPLIED') {
        stats.applied++;
      } else if (comment.status === 'POSTED' || comment.status === 'PENDING') {
        stats.pending++;
      }
    }

    return stats;
  }

  /**
   * Analyze a single comment for applicability
   */
  private analyzeComment(
    comment: {
      id: string;
      file: string;
      line: number;
      severity: string;
      category: string;
      confidence: number;
      message: string;
    },
    suggestion: { originalCode?: string; suggestedCode?: string }
  ): FixApplicability {
    const isBreaking = this.detectBreakingChange(
      suggestion.originalCode || '',
      suggestion.suggestedCode || '',
      comment.category
    );

    const canAutoApply = !isBreaking && 
      suggestion.originalCode !== undefined && 
      suggestion.suggestedCode !== undefined &&
      suggestion.originalCode.length > 0 &&
      suggestion.suggestedCode.length > 0;

    return {
      commentId: comment.id,
      file: comment.file,
      line: comment.line,
      severity: comment.severity.toLowerCase() as FixSeverity,
      category: comment.category.toLowerCase() as FixCategory,
      canAutoApply,
      isBreaking,
      confidence: comment.confidence,
      reason: !canAutoApply ? this.getNotApplicableReason(suggestion, isBreaking) : undefined,
    };
  }

  /**
   * Detect if a change is potentially breaking
   */
  private detectBreakingChange(
    originalCode: string,
    suggestedCode: string,
    category: string
  ): boolean {
    // API changes are potentially breaking
    if (category === 'MAINTAINABILITY') {
      // Check for signature changes
      const funcSignatureRegex = /(?:function|const|let|var)\s+(\w+)\s*(?:<[^>]+>)?\s*\([^)]*\)/;
      const originalMatch = originalCode.match(funcSignatureRegex);
      const suggestedMatch = suggestedCode.match(funcSignatureRegex);

      if (originalMatch && suggestedMatch) {
        // Name change = breaking
        if (originalMatch[1] !== suggestedMatch[1]) {
          return true;
        }
      }
    }

    // Removing exports is breaking
    if (originalCode.includes('export') && !suggestedCode.includes('export')) {
      return true;
    }

    // Changing public to private is breaking
    if (originalCode.includes('public') && suggestedCode.includes('private')) {
      return true;
    }

    return false;
  }

  /**
   * Get reason why a fix cannot be auto-applied
   */
  private getNotApplicableReason(
    suggestion: { originalCode?: string; suggestedCode?: string },
    isBreaking: boolean
  ): string {
    if (isBreaking) {
      return 'This change may break existing code - manual review required';
    }
    if (!suggestion.originalCode || suggestion.originalCode.length === 0) {
      return 'No original code pattern specified';
    }
    if (!suggestion.suggestedCode || suggestion.suggestedCode.length === 0) {
      return 'No suggested replacement specified';
    }
    return 'Unable to auto-apply';
  }

  /**
   * Prioritize fixes by severity and confidence
   */
  private prioritizeFixes(fixes: FixApplicability[]): FixApplicability[] {
    const severityOrder: Record<FixSeverity, number> = {
      critical: 0,
      high: 1,
      medium: 2,
      low: 3,
      nitpick: 4,
    };

    const categoryOrder: Record<FixCategory, number> = {
      security: 0,
      bug: 1,
      performance: 2,
      error_handling: 3,
      style: 4,
      maintainability: 5,
    };

    return fixes.sort((a, b) => {
      // First by severity
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (severityDiff !== 0) return severityDiff;

      // Then by category
      const categoryDiff = categoryOrder[a.category] - categoryOrder[b.category];
      if (categoryDiff !== 0) return categoryDiff;

      // Then by confidence (higher first)
      return b.confidence - a.confidence;
    });
  }

  /**
   * Create phases for remediation
   */
  private createPhases(
    fixes: FixApplicability[],
    config: RemediationConfig
  ): RemediationPhase[] {
    const phases: RemediationPhase[] = [];

    // Phase 1: Critical security fixes
    const securityFixes = fixes.filter(
      (f) => f.category === 'security' && ['critical', 'high'].includes(f.severity)
    );
    if (securityFixes.length > 0) {
      phases.push({
        id: 'phase-security',
        name: 'Security Fixes',
        description: 'Critical and high severity security issues',
        order: 1,
        fixes: securityFixes,
        canAutoApply: securityFixes.every(
          (f) => f.canAutoApply && f.confidence >= config.autoApplyThreshold
        ),
        requiresReview: false,
      });
    }

    // Phase 2: Bug fixes
    const bugFixes = fixes.filter(
      (f) => f.category === 'bug' && !securityFixes.includes(f)
    );
    if (bugFixes.length > 0) {
      phases.push({
        id: 'phase-bugs',
        name: 'Bug Fixes',
        description: 'Logic errors and potential bugs',
        order: 2,
        fixes: bugFixes,
        canAutoApply: bugFixes.every(
          (f) => f.canAutoApply && f.confidence >= config.autoApplyThreshold
        ),
        requiresReview: false,
      });
    }

    // Phase 3: Performance improvements
    const perfFixes = fixes.filter((f) => f.category === 'performance');
    if (perfFixes.length > 0) {
      phases.push({
        id: 'phase-perf',
        name: 'Performance Improvements',
        description: 'Performance optimizations',
        order: 3,
        fixes: perfFixes,
        canAutoApply: perfFixes.every(
          (f) => f.canAutoApply && f.confidence >= config.autoApplyThreshold
        ),
        requiresReview: false,
      });
    }

    // Phase 4: Error handling
    const errorFixes = fixes.filter((f) => f.category === 'error_handling');
    if (errorFixes.length > 0) {
      phases.push({
        id: 'phase-errors',
        name: 'Error Handling',
        description: 'Error handling improvements',
        order: 4,
        fixes: errorFixes,
        canAutoApply: errorFixes.every(
          (f) => f.canAutoApply && f.confidence >= config.autoApplyThreshold
        ),
        requiresReview: false,
      });
    }

    // Phase 5: Style and maintainability (requires review)
    const styleFixes = fixes.filter(
      (f) => f.category === 'style' || f.category === 'maintainability'
    );
    if (styleFixes.length > 0) {
      phases.push({
        id: 'phase-style',
        name: 'Style & Maintainability',
        description: 'Code style and maintainability improvements',
        order: 5,
        fixes: styleFixes,
        canAutoApply: false,
        requiresReview: true,
      });
    }

    return phases;
  }

  /**
   * Group fixes by file
   */
  private groupByFile(fixes: FixApplicability[]): Record<string, FixApplicability[]> {
    const grouped: Record<string, FixApplicability[]> = {};

    for (const fix of fixes) {
      if (!grouped[fix.file]) {
        grouped[fix.file] = [];
      }
      grouped[fix.file].push(fix);
    }

    return grouped;
  }

  /**
   * Trigger re-analysis of the PR after fixes
   */
  private async triggerReanalysis(workflowId: string): Promise<void> {
    try {
      // Update workflow status to trigger re-analysis
      await db.pRWorkflow.update({
        where: { id: workflowId },
        data: {
          status: 'ANALYZING',
          updatedAt: new Date(),
        },
      });

      logger.info({ workflowId }, 'Re-analysis triggered after auto-remediation');
    } catch (error) {
      logger.warn({ error, workflowId }, 'Failed to trigger re-analysis');
    }
  }

  /**
   * Notify progress via WebSocket
   */
  private async notifyProgress(
    workflowId: string,
    stage: string,
    data: Record<string, unknown>
  ): Promise<void> {
    try {
      const workflow = await db.pRWorkflow.findUnique({
        where: { id: workflowId },
        select: { repositoryId: true },
      });

      if (workflow) {
        await broadcastToRepository(workflow.repositoryId, {
          type: 'workflow_update',
          workflowId,
          data: {
            event: 'auto_remediation',
            stage,
            ...data,
          },
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to notify remediation progress');
    }
  }
}

export const autoRemediationService = new AutoRemediationService();
