import { FastifyPluginAsync } from 'fastify';
import { customRulesEngineService } from '../services/custom-rules-engine.js';
import { logger } from '../lib/logger.js';

/**
 * Custom Rules Engine routes
 */
export const customRulesRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Create a custom rule
   */
  fastify.post<{
    Body: {
      name: string;
      description: string;
      severity: 'error' | 'warning' | 'info' | 'suggestion';
      scope: string;
      conditions: Array<{ target: string; operator: string; value: string | number | boolean; filePattern?: string; negate?: boolean }>;
      assertions: Array<{ assert: string; value?: string | number | boolean; filePattern?: string; message: string }>;
      tags: string[];
      enabled?: boolean;
      level?: string;
      createdBy: string;
    };
  }>('/rules', async (request, reply) => {
    try {
      const rule = await customRulesEngineService.createRule({
        ...request.body,
        enabled: request.body.enabled ?? true,
        level: (request.body.level as 'repository' | 'organization') || 'repository',
        scope: request.body.scope as 'file' | 'repository' | 'directory' | 'pr' | 'commit',
      });

      return reply.status(201).send({ success: true, rule });
    } catch (error) {
      logger.error({ error }, 'Failed to create custom rule');
      return reply.status(500).send({ success: false, error: 'Failed to create custom rule' });
    }
  });

  /**
   * List rules
   */
  fastify.get<{
    Querystring: { repositoryId?: string; enabled?: boolean; tags?: string };
  }>('/rules', async (request, reply) => {
    try {
      const rules = await customRulesEngineService.listRules({
        repositoryId: request.query.repositoryId,
        enabled: request.query.enabled,
        tags: request.query.tags?.split(','),
      });

      return reply.send({ success: true, rules, total: rules.length });
    } catch (error) {
      logger.error({ error }, 'Failed to list rules');
      return reply.status(500).send({ success: false, error: 'Failed to list rules' });
    }
  });

  /**
   * Get a rule
   */
  fastify.get<{
    Params: { ruleId: string };
  }>('/rules/:ruleId', async (request, reply) => {
    try {
      const rule = await customRulesEngineService.getRule(request.params.ruleId);

      if (!rule) {
        return reply.status(404).send({ success: false, error: 'Rule not found' });
      }

      return reply.send({ success: true, rule });
    } catch (error) {
      logger.error({ error }, 'Failed to get rule');
      return reply.status(500).send({ success: false, error: 'Failed to get rule' });
    }
  });

  /**
   * Update a rule
   */
  fastify.patch<{
    Params: { ruleId: string };
    Body: Record<string, unknown>;
  }>('/rules/:ruleId', async (request, reply) => {
    try {
      const rule = await customRulesEngineService.updateRule(request.params.ruleId, request.body);

      if (!rule) {
        return reply.status(404).send({ success: false, error: 'Rule not found' });
      }

      return reply.send({ success: true, rule });
    } catch (error) {
      logger.error({ error }, 'Failed to update rule');
      return reply.status(500).send({ success: false, error: 'Failed to update rule' });
    }
  });

  /**
   * Delete a rule
   */
  fastify.delete<{
    Params: { ruleId: string };
  }>('/rules/:ruleId', async (request, reply) => {
    try {
      const deleted = await customRulesEngineService.deleteRule(request.params.ruleId);

      if (!deleted) {
        return reply.status(404).send({ success: false, error: 'Rule not found' });
      }

      return reply.send({ success: true, message: 'Rule deleted' });
    } catch (error) {
      logger.error({ error }, 'Failed to delete rule');
      return reply.status(500).send({ success: false, error: 'Failed to delete rule' });
    }
  });

  /**
   * Evaluate rules against a PR
   */
  fastify.post<{
    Body: {
      prNumber: number;
      repository: { owner: string; name: string };
      files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
      prTitle: string;
      prBody?: string;
      commits?: Array<{ message: string }>;
    };
  }>('/rules/evaluate', async (request, reply) => {
    try {
      const report = await customRulesEngineService.evaluateRules(request.body);

      return reply.send({ success: true, report });
    } catch (error) {
      logger.error({ error }, 'Failed to evaluate rules');
      return reply.status(500).send({ success: false, error: 'Failed to evaluate rules' });
    }
  });

  /**
   * Get rule templates
   */
  fastify.get<{
    Querystring: { category?: string };
  }>('/rules/templates', async (request, reply) => {
    try {
      const templates = await customRulesEngineService.getTemplates(request.query);

      return reply.send({ success: true, templates, total: templates.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get templates');
      return reply.status(500).send({ success: false, error: 'Failed to get templates' });
    }
  });

  /**
   * Create rule from template
   */
  fastify.post<{
    Body: { templateId: string; createdBy: string };
  }>('/rules/from-template', async (request, reply) => {
    try {
      const rule = await customRulesEngineService.createFromTemplate(
        request.body.templateId,
        request.body.createdBy
      );

      if (!rule) {
        return reply.status(404).send({ success: false, error: 'Template not found' });
      }

      return reply.status(201).send({ success: true, rule });
    } catch (error) {
      logger.error({ error }, 'Failed to create rule from template');
      return reply.status(500).send({ success: false, error: 'Failed to create rule from template' });
    }
  });

  /**
   * Get rule metrics
   */
  fastify.get<{
    Params: { ruleId: string };
  }>('/rules/:ruleId/metrics', async (request, reply) => {
    try {
      const metrics = await customRulesEngineService.getRuleMetrics(request.params.ruleId);

      return reply.send({ success: true, metrics });
    } catch (error) {
      logger.error({ error }, 'Failed to get rule metrics');
      return reply.status(500).send({ success: false, error: 'Failed to get rule metrics' });
    }
  });
};
