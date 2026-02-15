/**
 * @fileoverview Types for Compliance-as-Code Policies
 *
 * Declarative policy engine for defining org-wide review policies.
 * Supports path patterns, author roles, label conditions, and required checks.
 */

import { z } from 'zod';

export const PolicyActionSchema = z.enum([
  'require_review',
  'require_approval_count',
  'require_label',
  'block_merge',
  'require_checks',
  'notify',
  'auto_assign',
]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

export const PolicyConditionOperatorSchema = z.enum([
  'matches',
  'not_matches',
  'contains',
  'not_contains',
  'equals',
  'not_equals',
  'greater_than',
  'less_than',
]);
export type PolicyConditionOperator = z.infer<typeof PolicyConditionOperatorSchema>;

export interface PolicyCondition {
  field: string;
  operator: PolicyConditionOperator;
  value: string | number | string[];
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  conditions: PolicyCondition[];
  actions: PolicyActionConfig[];
  severity: 'info' | 'warning' | 'error' | 'blocking';
  enabled: boolean;
}

export interface PolicyActionConfig {
  type: PolicyAction;
  params: Record<string, unknown>;
}

export interface CodeCompliancePolicy {
  id: string;
  name: string;
  version: string;
  description: string;
  framework: string;
  organizationId: string;
  rules: PolicyRule[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyEvaluationContext {
  pullRequest: {
    number: number;
    title: string;
    author: string;
    labels: string[];
    baseBranch: string;
    headBranch: string;
    filesChanged: number;
    additions: number;
    deletions: number;
  };
  files: Array<{
    path: string;
    status: string;
    additions: number;
    deletions: number;
  }>;
  repository: {
    id: string;
    name: string;
    owner: string;
  };
  approvals: number;
  checks: Array<{ name: string; status: string; conclusion: string }>;
}

export interface PolicyViolation {
  ruleId: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error' | 'blocking';
  message: string;
  requiredActions: PolicyActionConfig[];
  context: Record<string, unknown>;
}

export interface PolicyEvaluationResult {
  policyId: string;
  policyName: string;
  passed: boolean;
  violations: PolicyViolation[];
  timestamp: Date;
  blocksMerge: boolean;
  overrideAllowed: boolean;
}

export interface PolicyTemplate {
  id: string;
  name: string;
  framework: string;
  description: string;
  rules: PolicyRule[];
  tags: string[];
}

export const POLICY_FRAMEWORKS = [
  'SOC2',
  'HIPAA',
  'GDPR',
  'PCI-DSS',
  'ISO-27001',
  'CUSTOM',
] as const;

export type PolicyFramework = (typeof POLICY_FRAMEWORKS)[number];
