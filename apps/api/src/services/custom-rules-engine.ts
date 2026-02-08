import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface CustomRule {
  id: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info' | 'suggestion';
  scope: 'file' | 'directory' | 'pr' | 'commit' | 'repository';
  conditions: Array<{
    target: string;
    operator: string;
    value: string | number | boolean;
    filePattern?: string;
    negate?: boolean;
  }>;
  assertions: Array<{
    assert: string;
    value?: string | number | boolean;
    filePattern?: string;
    message: string;
  }>;
  tags: string[];
  enabled: boolean;
  level: 'repository' | 'organization';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface RuleViolation {
  file?: string;
  line?: number;
  message: string;
  suggestedFix?: string;
  failedAssertion: string;
}

interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  passed: boolean;
  severity: string;
  violations: RuleViolation[];
  evaluationMs: number;
  skipped: boolean;
  skipReason?: string;
}

interface RulesEvaluationReport {
  id: string;
  prNumber: number;
  repository: { owner: string; name: string };
  totalRules: number;
  passed: number;
  failed: number;
  skipped: number;
  results: RuleEvaluationResult[];
  status: 'all_passed' | 'has_warnings' | 'has_errors' | 'blocked';
  evaluatedAt: Date;
  totalEvaluationMs: number;
}

const BUILT_IN_TEMPLATES: Array<{
  id: string;
  name: string;
  description: string;
  category: string;
  rule: Omit<CustomRule, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;
}> = [
  {
    id: 'tpl-migration-rollback',
    name: 'Migration Requires Rollback',
    description: 'Database migrations must include rollback steps',
    category: 'migration',
    rule: {
      name: 'Migration Requires Rollback',
      description: 'All migration files must have a corresponding down/rollback migration',
      severity: 'error',
      scope: 'file',
      conditions: [{ target: 'filename', operator: 'matches', value: '.*migration.*\\.ts$' }],
      assertions: [{ assert: 'file_contains', value: 'down', message: 'Migration must include a rollback (down) function' }],
      tags: ['migration', 'database'],
      enabled: true,
      level: 'repository',
    },
  },
  {
    id: 'tpl-api-spec-update',
    name: 'API Changes Need Spec Update',
    description: 'API route changes must update OpenAPI specification',
    category: 'api',
    rule: {
      name: 'API Changes Need Spec Update',
      description: 'When API routes are changed, OpenAPI spec must be updated',
      severity: 'warning',
      scope: 'pr',
      conditions: [{ target: 'filename', operator: 'matches', value: '.*routes.*\\.ts$' }],
      assertions: [{ assert: 'api_spec_updated', message: 'API route changes detected but OpenAPI spec was not updated' }],
      tags: ['api', 'documentation'],
      enabled: true,
      level: 'repository',
    },
  },
  {
    id: 'tpl-test-for-new-files',
    name: 'New Files Need Tests',
    description: 'New source files must have corresponding test files',
    category: 'testing',
    rule: {
      name: 'New Files Need Tests',
      description: 'Every new source file should have a corresponding test file',
      severity: 'warning',
      scope: 'file',
      conditions: [{ target: 'filename', operator: 'added', value: true }, { target: 'filename', operator: 'matches', value: '^src/.*\\.ts$' }],
      assertions: [{ assert: 'tests_exist', message: 'New source file added without corresponding test file' }],
      tags: ['testing'],
      enabled: true,
      level: 'repository',
    },
  },
  {
    id: 'tpl-no-console-log',
    name: 'No Console.log in Production',
    description: 'Disallow console.log statements in source files',
    category: 'style',
    rule: {
      name: 'No Console.log in Production',
      description: 'console.log should not be used in production code',
      severity: 'warning',
      scope: 'file',
      conditions: [{ target: 'filename', operator: 'matches', value: '^src/.*\\.ts$' }],
      assertions: [{ assert: 'no_console_log', message: 'console.log found in source code. Use the logger instead.' }],
      tags: ['style', 'logging'],
      enabled: true,
      level: 'repository',
    },
  },
  {
    id: 'tpl-changelog-update',
    name: 'Feature PRs Need Changelog',
    description: 'Feature branches must update the changelog',
    category: 'documentation',
    rule: {
      name: 'Feature PRs Need Changelog',
      description: 'PRs from feature branches should update CHANGELOG.md',
      severity: 'info',
      scope: 'pr',
      conditions: [{ target: 'pr_title', operator: 'matches', value: '^feat.*' }],
      assertions: [{ assert: 'changelog_updated', message: 'Feature PR should include a changelog entry' }],
      tags: ['documentation', 'changelog'],
      enabled: true,
      level: 'repository',
    },
  },
];

/**
 * Codebase-Aware Custom Rules Engine Service
 * Provides declarative rule DSL, evaluation, templates, and analytics.
 */
export class CustomRulesEngineService {
  private rules = new Map<string, CustomRule>();

  /**
   * Create a new custom rule
   */
  async createRule(params: Omit<CustomRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<CustomRule> {
    const rule: CustomRule = {
      ...params,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rules.set(rule.id, rule);
    logger.info({ ruleId: rule.id, name: rule.name }, 'Custom rule created');

    return rule;
  }

  /**
   * Get a rule by ID
   */
  async getRule(ruleId: string): Promise<CustomRule | null> {
    return this.rules.get(ruleId) || null;
  }

  /**
   * List rules for a repository
   */
  async listRules(params: {
    repositoryId?: string;
    enabled?: boolean;
    tags?: string[];
  }): Promise<CustomRule[]> {
    let rules = Array.from(this.rules.values());

    if (params.enabled !== undefined) {
      rules = rules.filter(r => r.enabled === params.enabled);
    }

    if (params.tags?.length) {
      rules = rules.filter(r => params.tags!.some(t => r.tags.includes(t)));
    }

    return rules;
  }

  /**
   * Update a rule
   */
  async updateRule(ruleId: string, updates: Partial<Omit<CustomRule, 'id' | 'createdAt'>>): Promise<CustomRule | null> {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;

    Object.assign(rule, updates, { updatedAt: new Date() });
    logger.info({ ruleId }, 'Custom rule updated');
    return rule;
  }

  /**
   * Delete a rule
   */
  async deleteRule(ruleId: string): Promise<boolean> {
    return this.rules.delete(ruleId);
  }

  /**
   * Evaluate all rules against a PR
   */
  async evaluateRules(params: {
    prNumber: number;
    repository: { owner: string; name: string };
    files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
    prTitle: string;
    prBody?: string;
    commits?: Array<{ message: string }>;
  }): Promise<RulesEvaluationReport> {
    const startTime = Date.now();
    const { prNumber, repository, files, prTitle, prBody, commits } = params;

    logger.info({ prNumber, repository, ruleCount: this.rules.size }, 'Evaluating custom rules');

    const results: RuleEvaluationResult[] = [];

    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          passed: true,
          severity: rule.severity,
          violations: [],
          evaluationMs: 0,
          skipped: true,
          skipReason: 'Rule is disabled',
        });
        continue;
      }

      const ruleStart = Date.now();
      const { passed, violations, skipped, skipReason } = this.evaluateRule(rule, { files, prTitle, prBody, commits });

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        passed,
        severity: rule.severity,
        violations,
        evaluationMs: Date.now() - ruleStart,
        skipped,
        skipReason,
      });
    }

    const passed = results.filter(r => r.passed && !r.skipped).length;
    const failed = results.filter(r => !r.passed && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;

    const hasErrors = results.some(r => !r.passed && r.severity === 'error');
    const hasWarnings = results.some(r => !r.passed && r.severity === 'warning');

    const status = hasErrors ? 'blocked' : hasWarnings ? 'has_warnings' : failed > 0 ? 'has_errors' : 'all_passed';

    const report: RulesEvaluationReport = {
      id: uuidv4(),
      prNumber,
      repository,
      totalRules: results.length,
      passed,
      failed,
      skipped,
      results,
      status,
      evaluatedAt: new Date(),
      totalEvaluationMs: Date.now() - startTime,
    };

    logger.info({ prNumber, passed, failed, skipped, status }, 'Rules evaluation completed');
    return report;
  }

  /**
   * Get rule templates
   */
  async getTemplates(params?: { category?: string }): Promise<typeof BUILT_IN_TEMPLATES> {
    if (params?.category) {
      return BUILT_IN_TEMPLATES.filter(t => t.category === params.category);
    }
    return BUILT_IN_TEMPLATES;
  }

  /**
   * Create rule from template
   */
  async createFromTemplate(templateId: string, createdBy: string): Promise<CustomRule | null> {
    const template = BUILT_IN_TEMPLATES.find(t => t.id === templateId);
    if (!template) return null;

    return this.createRule({ ...template.rule, createdBy });
  }

  /**
   * Get rule effectiveness metrics
   */
  async getRuleMetrics(ruleId: string): Promise<{
    ruleId: string;
    triggerCount: number;
    fixCount: number;
    dismissCount: number;
    falsePositiveRate: number;
    avgTimeToFixMinutes: number;
  }> {
    return {
      ruleId,
      triggerCount: 0,
      fixCount: 0,
      dismissCount: 0,
      falsePositiveRate: 0,
      avgTimeToFixMinutes: 0,
    };
  }

  private evaluateRule(
    rule: CustomRule,
    context: {
      files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
      prTitle: string;
      prBody?: string;
      commits?: Array<{ message: string }>;
    }
  ): { passed: boolean; violations: RuleViolation[]; skipped: boolean; skipReason?: string } {
    // Check conditions
    const conditionsMet = rule.conditions.every(condition => {
      return this.evaluateCondition(condition, context);
    });

    if (!conditionsMet) {
      return { passed: true, violations: [], skipped: true, skipReason: 'Conditions not met' };
    }

    // Check assertions
    const violations: RuleViolation[] = [];
    for (const assertion of rule.assertions) {
      const assertionViolations = this.evaluateAssertion(assertion, context);
      violations.push(...assertionViolations);
    }

    return { passed: violations.length === 0, violations, skipped: false };
  }

  private evaluateCondition(
    condition: { target: string; operator: string; value: string | number | boolean; filePattern?: string; negate?: boolean },
    context: { files: Array<{ filename: string; status: string; patch?: string }>; prTitle: string; prBody?: string }
  ): boolean {
    let result = false;

    switch (condition.target) {
      case 'filename': {
        const pattern = new RegExp(String(condition.value));
        if (condition.operator === 'matches') {
          result = context.files.some(f => pattern.test(f.filename));
        } else if (condition.operator === 'added') {
          result = context.files.some(f => f.status === 'added' && pattern.test(f.filename));
        } else if (condition.operator === 'changed') {
          result = context.files.some(f => f.status === 'modified' && pattern.test(f.filename));
        }
        break;
      }
      case 'pr_title': {
        const pattern = new RegExp(String(condition.value));
        if (condition.operator === 'matches') {
          result = pattern.test(context.prTitle);
        } else if (condition.operator === 'contains') {
          result = context.prTitle.includes(String(condition.value));
        }
        break;
      }
      case 'file_count':
        if (condition.operator === 'greater_than') result = context.files.length > Number(condition.value);
        if (condition.operator === 'less_than') result = context.files.length < Number(condition.value);
        break;
      default:
        result = true;
    }

    return condition.negate ? !result : result;
  }

  private evaluateAssertion(
    assertion: { assert: string; value?: string | number | boolean; filePattern?: string; message: string },
    context: { files: Array<{ filename: string; status: string; patch?: string }>; prTitle: string }
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];

    switch (assertion.assert) {
      case 'file_contains': {
        const pattern = assertion.filePattern ? new RegExp(assertion.filePattern) : null;
        const targetFiles = pattern ? context.files.filter(f => pattern.test(f.filename)) : context.files;
        for (const file of targetFiles) {
          if (file.patch && !file.patch.includes(String(assertion.value || ''))) {
            violations.push({ file: file.filename, message: assertion.message, failedAssertion: assertion.assert });
          }
        }
        break;
      }
      case 'tests_exist': {
        const sourceFiles = context.files.filter(f => f.status === 'added' && /^src\/.*\.ts$/.test(f.filename));
        for (const file of sourceFiles) {
          const testPath = file.filename.replace(/\.ts$/, '.test.ts').replace('src/', '__tests__/');
          const hasTest = context.files.some(f => f.filename.includes(testPath) || f.filename.includes('.test.'));
          if (!hasTest) {
            violations.push({ file: file.filename, message: assertion.message, failedAssertion: assertion.assert });
          }
        }
        break;
      }
      case 'no_console_log': {
        for (const file of context.files) {
          if (file.patch && file.patch.includes('console.log')) {
            violations.push({ file: file.filename, message: assertion.message, failedAssertion: assertion.assert, suggestedFix: 'Replace console.log with logger.info()' });
          }
        }
        break;
      }
      case 'changelog_updated': {
        const changelogModified = context.files.some(f => f.filename.toLowerCase().includes('changelog'));
        if (!changelogModified) {
          violations.push({ message: assertion.message, failedAssertion: assertion.assert });
        }
        break;
      }
      case 'api_spec_updated': {
        const specModified = context.files.some(f => f.filename.includes('openapi') || f.filename.includes('swagger'));
        if (!specModified) {
          violations.push({ message: assertion.message, failedAssertion: assertion.assert });
        }
        break;
      }
      default:
        break;
    }

    return violations;
  }
}

export const customRulesEngineService = new CustomRulesEngineService();
