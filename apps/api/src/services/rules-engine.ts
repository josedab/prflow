import type { ReviewComment, Severity, ReviewCategory, PRFile } from '@prflow/core';
import { logger } from '../lib/logger.js';

// ============================================
// Rule Types & DSL
// ============================================

export type RuleConditionType =
  | 'file_pattern'
  | 'content_match'
  | 'file_extension'
  | 'change_type'
  | 'line_count'
  | 'function_name'
  | 'import_added'
  | 'dependency_added';

export type RuleActionType =
  | 'warn'
  | 'error'
  | 'block'
  | 'require_reviewer'
  | 'add_label'
  | 'suggest';

export interface RuleCondition {
  type: RuleConditionType;
  value: string | number | string[];
  operator?: 'equals' | 'contains' | 'matches' | 'greater_than' | 'less_than';
  negate?: boolean;
}

export interface RuleAction {
  type: RuleActionType;
  severity?: Severity;
  category?: ReviewCategory;
  message: string;
  suggestion?: string;
  reviewer?: string;
  label?: string;
}

export interface CustomRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: RuleCondition[];
  conditionLogic?: 'AND' | 'OR';
  actions: RuleAction[];
  priority: number;
}

export interface RuleSet {
  id: string;
  name: string;
  repositoryId: string;
  rules: CustomRule[];
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Built-in Rule Templates
// ============================================

export const BUILTIN_RULES: CustomRule[] = [
  {
    id: 'no-console-log',
    name: 'No Console Logs',
    description: 'Warns when console.log statements are added',
    enabled: true,
    conditions: [
      { type: 'content_match', value: 'console\\.log\\(', operator: 'matches' },
      { type: 'file_extension', value: ['ts', 'tsx', 'js', 'jsx'] },
    ],
    conditionLogic: 'AND',
    actions: [
      {
        type: 'warn',
        severity: 'low',
        category: 'style',
        message: 'Console.log statement detected. Consider using a proper logging library.',
      },
    ],
    priority: 10,
  },
  {
    id: 'large-file-warning',
    name: 'Large File Warning',
    description: 'Warns when a single file has too many changes',
    enabled: true,
    conditions: [{ type: 'line_count', value: 500, operator: 'greater_than' }],
    actions: [
      {
        type: 'warn',
        severity: 'medium',
        category: 'maintainability',
        message: 'This file has many changes. Consider splitting into smaller commits.',
      },
    ],
    priority: 5,
  },
  {
    id: 'security-file-review',
    name: 'Security File Review Required',
    description: 'Requires security team review for auth/security files',
    enabled: true,
    conditions: [
      { type: 'file_pattern', value: '(auth|security|crypto|password)', operator: 'matches' },
    ],
    actions: [
      {
        type: 'require_reviewer',
        severity: 'high',
        category: 'security',
        message: 'Changes to security-related files require security team review.',
        reviewer: 'security-team',
      },
    ],
    priority: 1,
  },
  {
    id: 'no-hardcoded-secrets',
    name: 'No Hardcoded Secrets',
    description: 'Blocks PRs with potential hardcoded secrets',
    enabled: true,
    conditions: [
      {
        type: 'content_match',
        value: '(api_key|apikey|secret|password|token)\\s*[=:]\\s*["\'][^"\']+["\']',
        operator: 'matches',
      },
    ],
    actions: [
      {
        type: 'error',
        severity: 'critical',
        category: 'security',
        message: 'Potential hardcoded secret detected. Use environment variables instead.',
      },
    ],
    priority: 1,
  },
  {
    id: 'test-file-required',
    name: 'Test File Required',
    description: 'Warns when source files are added without tests',
    enabled: false, // Disabled by default
    conditions: [
      { type: 'file_extension', value: ['ts', 'tsx', 'js', 'jsx'] },
      { type: 'file_pattern', value: '\\.(test|spec)\\.', operator: 'matches', negate: true },
      { type: 'change_type', value: 'added' },
    ],
    conditionLogic: 'AND',
    actions: [
      {
        type: 'warn',
        severity: 'medium',
        category: 'testing',
        message: 'New source file added without corresponding test file.',
      },
    ],
    priority: 8,
  },
];

// ============================================
// Rule Engine
// ============================================

export interface RuleEngineContext {
  files: PRFile[];
  prTitle: string;
  prBody: string | null;
  authorLogin: string;
}

export interface RuleEvaluationResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  file?: string;
  line?: number;
  actions: RuleAction[];
}

export class RuleEngine {
  private rules: CustomRule[];

  constructor(rules: CustomRule[] = []) {
    this.rules = [...BUILTIN_RULES, ...rules].sort((a, b) => a.priority - b.priority);
  }

  addRule(rule: CustomRule): void {
    this.rules.push(rule);
    this.rules.sort((a, b) => a.priority - b.priority);
  }

  removeRule(ruleId: string): void {
    this.rules = this.rules.filter((r) => r.id !== ruleId);
  }

  enableRule(ruleId: string): void {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) rule.enabled = true;
  }

  disableRule(ruleId: string): void {
    const rule = this.rules.find((r) => r.id === ruleId);
    if (rule) rule.enabled = false;
  }

  evaluate(context: RuleEngineContext): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      for (const file of context.files) {
        const fileResults = this.evaluateRuleForFile(rule, file, context);
        results.push(...fileResults);
      }
    }

    return results;
  }

  private evaluateRuleForFile(
    rule: CustomRule,
    file: PRFile,
    context: RuleEngineContext
  ): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];
    const conditionResults = rule.conditions.map((c) => this.evaluateCondition(c, file, context));

    const matched =
      rule.conditionLogic === 'OR'
        ? conditionResults.some((r) => r.matched)
        : conditionResults.every((r) => r.matched);

    if (matched) {
      // For content matches, we might have line numbers
      const contentCondition = rule.conditions.find((c) => c.type === 'content_match');
      const lines = contentCondition ? this.findMatchingLines(file, contentCondition) : [undefined];

      for (const line of lines) {
        results.push({
          ruleId: rule.id,
          ruleName: rule.name,
          matched: true,
          file: file.filename,
          line,
          actions: rule.actions,
        });
      }
    }

    return results;
  }

  private evaluateCondition(
    condition: RuleCondition,
    file: PRFile,
    _context: RuleEngineContext
  ): { matched: boolean } {
    let matched = false;

    switch (condition.type) {
      case 'file_pattern':
        matched = this.matchPattern(file.filename, condition);
        break;

      case 'file_extension': {
        const ext = file.filename.split('.').pop() || '';
        const extensions = Array.isArray(condition.value) ? condition.value : [condition.value];
        matched = extensions.includes(ext);
        break;
      }

      case 'content_match':
        matched = this.matchContent(file.patch || '', condition);
        break;

      case 'change_type':
        matched = file.status === condition.value;
        break;

      case 'line_count': {
        const lineCount = file.additions + file.deletions;
        matched = this.compareNumbers(lineCount, condition);
        break;
      }

      case 'function_name':
        matched = this.matchContent(file.patch || '', {
          ...condition,
          value: `function\\s+${condition.value}|const\\s+${condition.value}\\s*=`,
        });
        break;

      case 'import_added':
        matched = this.matchContent(file.patch || '', {
          ...condition,
          value: `^\\+.*import.*['"]${condition.value}['"]`,
        });
        break;

      case 'dependency_added':
        if (file.filename.includes('package.json')) {
          matched = this.matchContent(file.patch || '', {
            ...condition,
            value: `^\\+.*"${condition.value}"`,
          });
        }
        break;
    }

    return { matched: condition.negate ? !matched : matched };
  }

  private matchPattern(text: string, condition: RuleCondition): boolean {
    const pattern = String(condition.value);
    switch (condition.operator) {
      case 'equals':
        return text === pattern;
      case 'contains':
        return text.includes(pattern);
      case 'matches':
      default:
        try {
          return new RegExp(pattern, 'i').test(text);
        } catch {
          return text.includes(pattern);
        }
    }
  }

  private matchContent(content: string, condition: RuleCondition): boolean {
    return this.matchPattern(content, { ...condition, operator: condition.operator || 'matches' });
  }

  private compareNumbers(actual: number, condition: RuleCondition): boolean {
    const expected = Number(condition.value);
    switch (condition.operator) {
      case 'equals':
        return actual === expected;
      case 'greater_than':
        return actual > expected;
      case 'less_than':
        return actual < expected;
      default:
        return actual === expected;
    }
  }

  private findMatchingLines(file: PRFile, condition: RuleCondition): (number | undefined)[] {
    if (!file.patch) return [undefined];

    const lines: number[] = [];
    const patchLines = file.patch.split('\n');
    let currentLine = 0;

    try {
      const regex = new RegExp(String(condition.value), 'gi');

      for (const line of patchLines) {
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
        if (hunkMatch) {
          currentLine = parseInt(hunkMatch[1], 10) - 1;
          continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentLine++;
          if (regex.test(line)) {
            lines.push(currentLine);
          }
          regex.lastIndex = 0; // Reset regex state
        } else if (!line.startsWith('-')) {
          currentLine++;
        }
      }
    } catch {
      return [undefined];
    }

    return lines.length > 0 ? lines : [undefined];
  }

  toReviewComments(results: RuleEvaluationResult[]): ReviewComment[] {
    const comments: ReviewComment[] = [];

    for (const result of results) {
      if (!result.matched) continue;

      for (const action of result.actions) {
        if (action.type === 'warn' || action.type === 'error' || action.type === 'suggest') {
          comments.push({
            id: `rule-${result.ruleId}-${result.file}-${result.line || 0}`,
            file: result.file || '',
            line: result.line || 1,
            severity: action.severity || 'medium',
            category: action.category || 'style',
            message: `[${result.ruleName}] ${action.message}`,
            suggestion: action.suggestion
              ? { originalCode: '', suggestedCode: action.suggestion, language: 'text' }
              : undefined,
            confidence: 1.0, // Custom rules are deterministic
          });
        }
      }
    }

    return comments;
  }
}

// ============================================
// Rule Parser (YAML/JSON DSL)
// ============================================

export function parseRuleFromConfig(config: Record<string, unknown>): CustomRule | null {
  try {
    return {
      id: String(config.id || `rule-${Date.now()}`),
      name: String(config.name || 'Unnamed Rule'),
      description: String(config.description || ''),
      enabled: config.enabled !== false,
      conditions: parseConditions(config.conditions as unknown[]),
      conditionLogic: (config.logic as 'AND' | 'OR') || 'AND',
      actions: parseActions(config.actions as unknown[]),
      priority: Number(config.priority) || 10,
    };
  } catch (error) {
    logger.error({ error, config }, 'Failed to parse rule config');
    return null;
  }
}

function parseConditions(conditions: unknown[]): RuleCondition[] {
  if (!Array.isArray(conditions)) return [];

  return conditions.map((c) => {
    const cond = c as Record<string, unknown>;
    return {
      type: cond.type as RuleConditionType,
      value: cond.value as string | number | string[],
      operator: cond.operator as RuleCondition['operator'],
      negate: Boolean(cond.negate),
    };
  });
}

function parseActions(actions: unknown[]): RuleAction[] {
  if (!Array.isArray(actions)) return [];

  return actions.map((a) => {
    const act = a as Record<string, unknown>;
    return {
      type: act.type as RuleActionType,
      severity: act.severity as Severity | undefined,
      category: act.category as ReviewCategory | undefined,
      message: String(act.message || 'Rule triggered'),
      suggestion: act.suggestion as string | undefined,
      reviewer: act.reviewer as string | undefined,
      label: act.label as string | undefined,
    };
  });
}

export function serializeRule(rule: CustomRule): Record<string, unknown> {
  return {
    id: rule.id,
    name: rule.name,
    description: rule.description,
    enabled: rule.enabled,
    conditions: rule.conditions,
    logic: rule.conditionLogic,
    actions: rule.actions,
    priority: rule.priority,
  };
}

// Factory function
export function createRuleEngine(customRules: CustomRule[] = []): RuleEngine {
  return new RuleEngine(customRules);
}
