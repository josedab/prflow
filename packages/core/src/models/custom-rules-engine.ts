/**
 * @fileoverview Codebase-Aware Custom Rules Engine Models
 *
 * Types for declarative review rule DSL, rule evaluation,
 * template marketplace, and rule effectiveness analytics.
 *
 * @module models/custom-rules-engine
 */

import { z } from 'zod';

// ============================================
// Rule Definition Types
// ============================================

/**
 * Rule severity level
 */
export const RuleSeveritySchema = z.enum(['error', 'warning', 'info', 'suggestion']);
export type RuleSeverity = z.infer<typeof RuleSeveritySchema>;

/**
 * Rule scope
 */
export const RuleScopeSchema = z.enum([
  'file',          // Applies to individual files
  'directory',     // Applies to all files in a directory
  'pr',            // Applies to the entire PR
  'commit',        // Applies to individual commits
  'repository',    // Applies to the entire repository
]);
export type RuleScope = z.infer<typeof RuleScopeSchema>;

/**
 * Rule condition operator
 */
export type RuleConditionOperator =
  | 'matches'         // Regex match
  | 'contains'        // String contains
  | 'not_contains'    // String does not contain
  | 'exists'          // File/path exists
  | 'not_exists'      // File/path does not exist
  | 'greater_than'    // Numeric comparison
  | 'less_than'       // Numeric comparison
  | 'changed'         // File was modified in PR
  | 'added'           // File was added in PR
  | 'deleted'         // File was removed in PR
  | 'has_ast_node'    // AST contains node type
  | 'imports'         // File imports a module
  | 'exports';        // File exports a symbol

/**
 * A condition in a rule
 */
export interface RuleCondition {
  /** Target to evaluate */
  target: 'filename' | 'file_content' | 'diff' | 'commit_message' | 'pr_title' | 'pr_body' | 'file_count' | 'line_count' | 'ast';
  /** Operator */
  operator: RuleConditionOperator;
  /** Value to compare against */
  value: string | number | boolean;
  /** File pattern filter (glob) */
  filePattern?: string;
  /** Negate the condition */
  negate?: boolean;
}

/**
 * An assertion that must hold when conditions are met
 */
export interface RuleAssertion {
  /** What to assert */
  assert: 'file_exists' | 'file_contains' | 'pr_has_label' | 'tests_exist' | 'docs_updated' | 'migration_has_rollback' | 'api_spec_updated' | 'changelog_updated' | 'max_file_size' | 'no_console_log' | 'custom';
  /** Value for the assertion */
  value?: string | number | boolean;
  /** File pattern for the assertion */
  filePattern?: string;
  /** Custom assertion script (for 'custom' type) */
  customScript?: string;
  /** Message when assertion fails */
  message: string;
}

/**
 * A custom review rule definition
 */
export interface CustomRule {
  /** Rule ID */
  id: string;
  /** Rule name */
  name: string;
  /** Description */
  description: string;
  /** Severity */
  severity: RuleSeverity;
  /** Scope */
  scope: RuleScope;
  /** Conditions (all must be true) */
  conditions: RuleCondition[];
  /** Assertions (all must pass when conditions match) */
  assertions: RuleAssertion[];
  /** Tags for categorization */
  tags: string[];
  /** Whether the rule is enabled */
  enabled: boolean;
  /** Repository-specific or org-wide */
  level: 'repository' | 'organization';
  /** Author */
  createdBy: string;
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
}

// ============================================
// Rule Evaluation Types
// ============================================

/**
 * Result of evaluating a single rule
 */
export interface RuleEvaluationResult {
  /** Rule ID */
  ruleId: string;
  /** Rule name */
  ruleName: string;
  /** Whether the rule passed */
  passed: boolean;
  /** Severity (from rule) */
  severity: RuleSeverity;
  /** Violations found */
  violations: RuleViolation[];
  /** Evaluation duration (ms) */
  evaluationMs: number;
  /** Skipped (conditions didn't match) */
  skipped: boolean;
  /** Skip reason */
  skipReason?: string;
}

/**
 * A violation of a rule
 */
export interface RuleViolation {
  /** File where violation occurred */
  file?: string;
  /** Line number */
  line?: number;
  /** Violation message */
  message: string;
  /** Suggested fix */
  suggestedFix?: string;
  /** Assertion that failed */
  failedAssertion: string;
}

/**
 * Complete evaluation result for a PR
 */
export interface RulesEvaluationReport {
  /** Report ID */
  id: string;
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Total rules evaluated */
  totalRules: number;
  /** Rules that passed */
  passed: number;
  /** Rules that failed */
  failed: number;
  /** Rules skipped */
  skipped: number;
  /** Individual results */
  results: RuleEvaluationResult[];
  /** Overall status */
  status: 'all_passed' | 'has_warnings' | 'has_errors' | 'blocked';
  /** Evaluated at */
  evaluatedAt: Date;
  /** Evaluation duration (ms) */
  totalEvaluationMs: number;
}

// ============================================
// Rule Template Types
// ============================================

/**
 * A rule template from the marketplace
 */
export interface RuleTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: 'security' | 'testing' | 'documentation' | 'api' | 'migration' | 'dependency' | 'style' | 'workflow';
  /** The rule definition */
  rule: Omit<CustomRule, 'id' | 'createdBy' | 'createdAt' | 'updatedAt'>;
  /** Usage count */
  usageCount: number;
  /** Rating (0-5) */
  rating: number;
  /** Author */
  author: string;
  /** Tags */
  tags: string[];
}

// ============================================
// Rule Analytics Types
// ============================================

/**
 * Analytics for a rule's effectiveness
 */
export interface RuleEffectivenessMetrics {
  /** Rule ID */
  ruleId: string;
  /** Times triggered */
  triggerCount: number;
  /** Times violation was fixed */
  fixCount: number;
  /** Times violation was dismissed */
  dismissCount: number;
  /** False positive rate */
  falsePositiveRate: number;
  /** Average time to fix (minutes) */
  avgTimeToFixMinutes: number;
  /** Period */
  period: { start: Date; end: Date };
}
