/**
 * @fileoverview Auto-Fix Pipeline Service
 *
 * Generates, validates, and tracks automatic code fixes for detected issues.
 * Supports batching fixes into auto-PRs with confidence-based approval.
 */

import { logger } from '../lib/logger.js';
import type {
  GeneratedFix,
  FixValidationResult,
  FixBatch,
  AutoFixPR,
  AutoFixStats,
  FixPipelineConfig,
  FixConfidence,
} from '@prflow/core';

export class AutoFixService {
  private batches = new Map<string, FixBatch>();
  private autoFixPRs = new Map<string, AutoFixPR>();
  private allFixes: GeneratedFix[] = [];
  private config: FixPipelineConfig = {
    enabled: true,
    autoApplyThreshold: 0.85,
    requireHumanApproval: true,
    maxFixesPerPR: 10,
    allowedCategories: ['style', 'lint', 'error_handling', 'documentation', 'testing'],
    blockedPaths: ['**/package-lock.json', '**/yarn.lock'],
  };

  getConfig(): FixPipelineConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<FixPipelineConfig>): FixPipelineConfig {
    Object.assign(this.config, updates);
    return { ...this.config };
  }

  /**
   * Generate a fix for a detected issue using pattern-based templates.
   */
  generateFix(params: {
    issueId: string;
    rule: string;
    filePath: string;
    startLine: number;
    endLine: number;
    originalCode: string;
    category: string;
  }): GeneratedFix {
    const { fixedCode, explanation, confidence } = this.applyFixTemplate(
      params.rule,
      params.originalCode,
      params.category
    );

    const fix: GeneratedFix = {
      id: `fix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      issueId: params.issueId,
      rule: params.rule,
      filePath: params.filePath,
      startLine: params.startLine,
      endLine: params.endLine,
      originalCode: params.originalCode,
      fixedCode,
      explanation,
      confidence,
      confidenceScore: confidence === 'high' ? 0.9 : confidence === 'medium' ? 0.65 : 0.35,
      category: params.category,
      validationStatus: 'pending',
    };

    this.allFixes.push(fix);
    logger.info({ fixId: fix.id, rule: fix.rule, confidence }, 'Fix generated');
    return fix;
  }

  /**
   * Validate a generated fix (simulated build/test check).
   */
  validateFix(fixId: string): FixValidationResult {
    const fix = this.allFixes.find((f) => f.id === fixId);
    if (!fix) {
      return {
        fixId,
        compiles: false,
        testsPass: false,
        noNewIssues: false,
        lintClean: false,
        overallValid: false,
        errors: ['Fix not found'],
      };
    }

    // Simulation: high-confidence fixes almost always validate
    const passChance = fix.confidenceScore;
    const compiles = Math.random() < passChance;
    const testsPass = compiles && Math.random() < passChance;
    const lintClean = compiles && Math.random() < passChance + 0.1;
    const noNewIssues = testsPass;
    const overallValid = compiles && testsPass && lintClean && noNewIssues;

    if (overallValid) fix.validationStatus = 'valid';
    else fix.validationStatus = 'invalid';

    const errors: string[] = [];
    if (!compiles) errors.push('Compilation failed');
    if (!testsPass) errors.push('Tests failed');
    if (!lintClean) errors.push('Lint issues detected');

    return { fixId, compiles, testsPass, noNewIssues, lintClean, overallValid, errors };
  }

  /**
   * Create a batch of fixes for a PR.
   */
  createBatch(
    workflowId: string,
    repositoryId: string,
    prNumber: number,
    fixIds: string[]
  ): FixBatch {
    const fixes = fixIds
      .map((id) => this.allFixes.find((f) => f.id === id))
      .filter((f): f is GeneratedFix => f !== undefined)
      .slice(0, this.config.maxFixesPerPR);

    const batch: FixBatch = {
      id: `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      workflowId,
      repositoryId,
      pullRequestNumber: prNumber,
      fixes,
      status: 'pending',
      createdAt: new Date(),
    };

    this.batches.set(batch.id, batch);
    logger.info({ batchId: batch.id, fixCount: fixes.length }, 'Fix batch created');
    return batch;
  }

  /**
   * Validate all fixes in a batch.
   */
  validateBatch(batchId: string): {
    batchId: string;
    results: FixValidationResult[];
    allValid: boolean;
  } {
    const batch = this.batches.get(batchId);
    if (!batch) return { batchId, results: [], allValid: false };

    batch.status = 'validating';
    const results = batch.fixes.map((f) => this.validateFix(f.id));
    const allValid = results.every((r) => r.overallValid);

    batch.status = allValid ? 'ready' : 'failed';
    return { batchId, results, allValid };
  }

  /**
   * Create an auto-fix PR from a validated batch.
   */
  createAutoFixPR(batchId: string, baseBranch: string): AutoFixPR | null {
    const batch = this.batches.get(batchId);
    if (!batch || batch.status !== 'ready') return null;

    const pr: AutoFixPR = {
      id: `autofix-pr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      batchId,
      baseBranch,
      fixBranch: `prflow/autofix-${batch.pullRequestNumber}-${Date.now()}`,
      fixCount: batch.fixes.length,
      status: 'creating',
      createdAt: new Date(),
    };

    // Simulate PR creation
    pr.status = 'open';
    pr.prNumber = batch.pullRequestNumber + 1000;
    pr.prUrl = `https://github.com/org/repo/pull/${pr.prNumber}`;

    this.autoFixPRs.set(pr.id, pr);
    batch.status = 'applied';
    batch.appliedAt = new Date();

    logger.info({ prId: pr.id, fixCount: pr.fixCount }, 'Auto-fix PR created');
    return pr;
  }

  getBatch(batchId: string): FixBatch | undefined {
    return this.batches.get(batchId);
  }

  getStats(organizationId: string): AutoFixStats {
    const generated = this.allFixes.length;
    const applied = this.allFixes.filter((f) => f.validationStatus === 'valid').length;
    const rejected = this.allFixes.filter((f) => f.validationStatus === 'invalid').length;

    const catMap = new Map<string, { count: number; valid: number }>();
    for (const fix of this.allFixes) {
      const entry = catMap.get(fix.category) || { count: 0, valid: 0 };
      entry.count++;
      if (fix.validationStatus === 'valid') entry.valid++;
      catMap.set(fix.category, entry);
    }

    return {
      organizationId,
      totalFixesGenerated: generated,
      totalFixesApplied: applied,
      totalFixesRejected: rejected,
      fixAccuracy: generated > 0 ? applied / generated : 0,
      averageConfidence:
        generated > 0 ? this.allFixes.reduce((s, f) => s + f.confidenceScore, 0) / generated : 0,
      topFixCategories: Array.from(catMap.entries())
        .map(([category, data]) => ({
          category,
          count: data.count,
          accuracy: data.count > 0 ? data.valid / data.count : 0,
        }))
        .sort((a, b) => b.count - a.count),
      timeSavedHours: applied * 0.25,
    };
  }

  private applyFixTemplate(
    rule: string,
    originalCode: string,
    _category: string
  ): { fixedCode: string; explanation: string; confidence: FixConfidence } {
    // Pattern-based fix templates
    if (rule.includes('console-log') || rule.includes('console_log')) {
      return {
        fixedCode: originalCode.replace(/console\.(log|debug|info)\(.*?\);?\n?/g, ''),
        explanation: 'Removed console.log statements',
        confidence: 'high',
      };
    }
    if (rule.includes('empty-catch') || rule.includes('empty_catch')) {
      const fixed = originalCode.replace(
        /catch\s*\([^)]*\)\s*\{\s*\}/g,
        'catch (error) { logger.error({ error }, "Unexpected error"); }'
      );
      return {
        fixedCode: fixed,
        explanation: 'Added error logging to empty catch block',
        confidence: 'high',
      };
    }
    if (rule.includes('todo')) {
      return {
        fixedCode: originalCode,
        explanation: 'TODO comment detected — requires manual resolution',
        confidence: 'low',
      };
    }

    return {
      fixedCode: `// AUTO-FIX: ${rule}\n${originalCode}`,
      explanation: `Generic fix annotation for rule: ${rule}`,
      confidence: 'medium',
    };
  }
}

export const autoFixService = new AutoFixService();
