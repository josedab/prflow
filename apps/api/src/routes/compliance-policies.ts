/**
 * @fileoverview Compliance-as-Code Policies Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { compliancePolicyService } from '../services/compliance-policies.js';

const policyConditionSchema = z.object({
  field: z.string(),
  operator: z.enum([
    'matches',
    'not_matches',
    'contains',
    'not_contains',
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
  ]),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

const policyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  conditions: z.array(policyConditionSchema),
  actions: z.array(
    z.object({
      type: z.enum([
        'require_review',
        'require_approval_count',
        'require_label',
        'block_merge',
        'require_checks',
        'notify',
        'auto_assign',
      ]),
      params: z.record(z.unknown()),
    })
  ),
  severity: z.enum(['info', 'warning', 'error', 'blocking']),
  enabled: z.boolean().default(true),
});

const createPolicySchema = z.object({
  name: z.string(),
  version: z.string().default('1.0.0'),
  description: z.string(),
  framework: z.string(),
  organizationId: z.string(),
  rules: z.array(policyRuleSchema),
  enabled: z.boolean().default(true),
});

const evaluateSchema = z.object({
  pullRequest: z.object({
    number: z.number(),
    title: z.string(),
    author: z.string(),
    labels: z.array(z.string()),
    baseBranch: z.string(),
    headBranch: z.string(),
    filesChanged: z.number(),
    additions: z.number(),
    deletions: z.number(),
  }),
  files: z.array(
    z.object({
      path: z.string(),
      status: z.string(),
      additions: z.number(),
      deletions: z.number(),
    })
  ),
  repository: z.object({ id: z.string(), name: z.string(), owner: z.string() }),
  approvals: z.number(),
  checks: z.array(z.object({ name: z.string(), status: z.string(), conclusion: z.string() })),
});

export async function compliancePoliciesRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof createPolicySchema> }>('/policies', async (request) => {
    const data = createPolicySchema.parse(request.body);
    const policy = {
      id: `policy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    compliancePolicyService.registerPolicy(policy);
    return policy;
  });

  app.get<{ Querystring: { organizationId?: string } }>('/policies', async (request) => {
    return compliancePolicyService.listPolicies(request.query.organizationId);
  });

  app.get<{ Params: { policyId: string } }>('/policies/:policyId', async (request) => {
    const policy = compliancePolicyService.getPolicy(request.params.policyId);
    if (!policy) return { error: 'Policy not found' };
    return policy;
  });

  app.delete<{ Params: { policyId: string } }>('/policies/:policyId', async (request) => {
    return { deleted: compliancePolicyService.deletePolicy(request.params.policyId) };
  });

  app.post<{ Params: { policyId: string }; Body: z.infer<typeof evaluateSchema> }>(
    '/policies/:policyId/evaluate',
    async (request) => {
      const context = evaluateSchema.parse(request.body);
      return compliancePolicyService.evaluate(request.params.policyId, context);
    }
  );

  app.post<{ Params: { orgId: string }; Body: z.infer<typeof evaluateSchema> }>(
    '/evaluate/:orgId',
    async (request) => {
      const context = evaluateSchema.parse(request.body);
      return compliancePolicyService.evaluateAll(request.params.orgId, context);
    }
  );

  app.get<{ Querystring: { framework?: string } }>('/templates', async (request) => {
    const fw = request.query.framework;
    return compliancePolicyService.listTemplates(fw as any);
  });

  app.post<{ Body: { templateId: string; organizationId: string; name?: string } }>(
    '/from-template',
    async (request) => {
      const { templateId, organizationId, name } = request.body;
      const policy = compliancePolicyService.createPolicyFromTemplate(
        templateId,
        organizationId,
        name ? { name } : undefined
      );
      if (!policy) return { error: 'Template not found' };
      return policy;
    }
  );
}
