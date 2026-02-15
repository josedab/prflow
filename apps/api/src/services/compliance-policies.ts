/**
 * @fileoverview Compliance-as-Code Policies Service
 *
 * YAML-based policy engine for defining org-wide review policies.
 * Evaluates PR context against rules to produce violations and merge decisions.
 */

import { logger } from '../lib/logger.js';
import type {
  CodeCompliancePolicy,
  PolicyRule,
  PolicyCondition,
  PolicyEvaluationContext,
  PolicyEvaluationResult,
  PolicyViolation,
  PolicyTemplate,
  PolicyFramework,
} from '@prflow/core';

export class CompliancePolicyService {
  private policies = new Map<string, CodeCompliancePolicy>();
  private templates = new Map<string, PolicyTemplate>();

  constructor() {
    this.registerBuiltinTemplates();
  }

  registerPolicy(policy: CodeCompliancePolicy): void {
    this.policies.set(policy.id, policy);
    logger.info({ policyId: policy.id, name: policy.name }, 'Compliance policy registered');
  }

  getPolicy(policyId: string): CodeCompliancePolicy | undefined {
    return this.policies.get(policyId);
  }

  listPolicies(organizationId?: string): CodeCompliancePolicy[] {
    const all = Array.from(this.policies.values());
    if (organizationId) return all.filter((p) => p.organizationId === organizationId);
    return all;
  }

  deletePolicy(policyId: string): boolean {
    return this.policies.delete(policyId);
  }

  evaluate(policyId: string, context: PolicyEvaluationContext): PolicyEvaluationResult {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return {
        policyId,
        policyName: 'unknown',
        passed: true,
        violations: [],
        timestamp: new Date(),
        blocksMerge: false,
        overrideAllowed: true,
      };
    }

    if (!policy.enabled) {
      return {
        policyId,
        policyName: policy.name,
        passed: true,
        violations: [],
        timestamp: new Date(),
        blocksMerge: false,
        overrideAllowed: true,
      };
    }

    const violations: PolicyViolation[] = [];
    for (const rule of policy.rules) {
      if (!rule.enabled) continue;
      const ruleViolations = this.evaluateRule(rule, context);
      violations.push(...ruleViolations);
    }

    const blocksMerge = violations.some((v) => v.severity === 'blocking');

    return {
      policyId: policy.id,
      policyName: policy.name,
      passed: violations.length === 0,
      violations,
      timestamp: new Date(),
      blocksMerge,
      overrideAllowed: !blocksMerge,
    };
  }

  evaluateAll(organizationId: string, context: PolicyEvaluationContext): PolicyEvaluationResult[] {
    const orgPolicies = this.listPolicies(organizationId);
    return orgPolicies.map((p) => this.evaluate(p.id, context));
  }

  private evaluateRule(rule: PolicyRule, context: PolicyEvaluationContext): PolicyViolation[] {
    const allConditionsMet = rule.conditions.every((c) => this.evaluateCondition(c, context));
    if (!allConditionsMet) return [];

    return [
      {
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        message: rule.description,
        requiredActions: rule.actions,
        context: {
          pr: context.pullRequest.number,
          filesChanged: context.pullRequest.filesChanged,
        },
      },
    ];
  }

  private evaluateCondition(condition: PolicyCondition, context: PolicyEvaluationContext): boolean {
    const value = this.resolveField(condition.field, context);
    if (value === undefined) return false;

    switch (condition.operator) {
      case 'matches':
        return typeof value === 'string' && new RegExp(String(condition.value)).test(value);
      case 'not_matches':
        return typeof value === 'string' && !new RegExp(String(condition.value)).test(value);
      case 'contains':
        if (Array.isArray(value)) return value.includes(condition.value);
        return String(value).includes(String(condition.value));
      case 'not_contains':
        if (Array.isArray(value)) return !value.includes(condition.value);
        return !String(value).includes(String(condition.value));
      case 'equals':
        return value === condition.value;
      case 'not_equals':
        return value !== condition.value;
      case 'greater_than':
        return typeof value === 'number' && value > Number(condition.value);
      case 'less_than':
        return typeof value === 'number' && value < Number(condition.value);
      default:
        return false;
    }
  }

  private resolveField(field: string, context: PolicyEvaluationContext): unknown {
    const fieldMap: Record<string, unknown> = {
      'pr.author': context.pullRequest.author,
      'pr.title': context.pullRequest.title,
      'pr.labels': context.pullRequest.labels,
      'pr.baseBranch': context.pullRequest.baseBranch,
      'pr.headBranch': context.pullRequest.headBranch,
      'pr.filesChanged': context.pullRequest.filesChanged,
      'pr.additions': context.pullRequest.additions,
      'pr.deletions': context.pullRequest.deletions,
      'pr.approvals': context.approvals,
      'repo.name': context.repository.name,
      'repo.owner': context.repository.owner,
    };

    if (fieldMap[field] !== undefined) return fieldMap[field];

    // Check file path patterns
    if (field === 'files.paths') {
      return context.files.map((f) => f.path);
    }

    return undefined;
  }

  // Built-in compliance templates
  private registerBuiltinTemplates(): void {
    this.templates.set('soc2-basic', {
      id: 'soc2-basic',
      name: 'SOC2 Basic Controls',
      framework: 'SOC2',
      description: 'Basic SOC2 compliance controls for code review',
      tags: ['compliance', 'soc2', 'security'],
      rules: [
        {
          id: 'soc2-approval',
          name: 'Require 2 approvals for production',
          description: 'PRs targeting main/production branches require at least 2 approvals',
          conditions: [
            { field: 'pr.baseBranch', operator: 'matches', value: '^(main|master|production)$' },
          ],
          actions: [{ type: 'require_approval_count', params: { count: 2 } }],
          severity: 'blocking',
          enabled: true,
        },
        {
          id: 'soc2-no-self-merge',
          name: 'No self-merge on protected branches',
          description: 'Authors cannot be the sole approver on protected branches',
          conditions: [
            { field: 'pr.baseBranch', operator: 'matches', value: '^(main|master)$' },
            { field: 'pr.approvals', operator: 'less_than', value: 1 },
          ],
          actions: [{ type: 'block_merge', params: { reason: 'Requires independent approval' } }],
          severity: 'blocking',
          enabled: true,
        },
      ],
    });

    this.templates.set('hipaa-basic', {
      id: 'hipaa-basic',
      name: 'HIPAA Basic Controls',
      framework: 'HIPAA',
      description: 'HIPAA compliance controls for healthcare data',
      tags: ['compliance', 'hipaa', 'healthcare'],
      rules: [
        {
          id: 'hipaa-phi-review',
          name: 'PHI data path requires security review',
          description: 'Changes to files containing PHI data require security team review',
          conditions: [{ field: 'files.paths', operator: 'contains', value: 'patient' }],
          actions: [
            { type: 'require_review', params: { team: 'security' } },
            { type: 'require_label', params: { label: 'security-reviewed' } },
          ],
          severity: 'blocking',
          enabled: true,
        },
      ],
    });

    this.templates.set('gdpr-basic', {
      id: 'gdpr-basic',
      name: 'GDPR Basic Controls',
      framework: 'GDPR',
      description: 'GDPR compliance controls for personal data',
      tags: ['compliance', 'gdpr', 'privacy'],
      rules: [
        {
          id: 'gdpr-pii-review',
          name: 'PII paths require privacy review',
          description: 'Changes to personal data handling require privacy team review',
          conditions: [
            { field: 'files.paths', operator: 'contains', value: 'user' },
            { field: 'pr.filesChanged', operator: 'greater_than', value: 5 },
          ],
          actions: [{ type: 'require_review', params: { team: 'privacy' } }],
          severity: 'error',
          enabled: true,
        },
      ],
    });
  }

  getTemplate(templateId: string): PolicyTemplate | undefined {
    return this.templates.get(templateId);
  }

  listTemplates(framework?: PolicyFramework): PolicyTemplate[] {
    const all = Array.from(this.templates.values());
    if (framework) return all.filter((t) => t.framework === framework);
    return all;
  }

  createPolicyFromTemplate(
    templateId: string,
    organizationId: string,
    overrides?: Partial<CodeCompliancePolicy>
  ): CodeCompliancePolicy | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const policy: CodeCompliancePolicy = {
      id: `policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: overrides?.name ?? template.name,
      version: '1.0.0',
      description: template.description,
      framework: template.framework,
      organizationId,
      rules: template.rules.map((r) => ({ ...r })),
      enabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };

    this.registerPolicy(policy);
    return policy;
  }
}

export const compliancePolicyService = new CompliancePolicyService();
