import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { securityComplianceService, type ComplianceFramework, type ViolationSeverity } from '../services/security-compliance.js';
import { logger } from '../lib/logger.js';

const FrameworkSchema = z.enum(['SOC2', 'HIPAA', 'PCI_DSS', 'GDPR', 'ISO27001']);
const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'informational']);

export async function securityComplianceRoutes(fastify: FastifyInstance) {
  /**
   * Configure compliance for a repository
   */
  fastify.post<{
    Params: { repositoryId: string };
    Body: {
      enabledFrameworks?: ComplianceFramework[];
      blockingThreshold?: ViolationSeverity;
      requireAcknowledgement?: boolean;
      auditRetentionDays?: number;
    };
  }>('/repositories/:repositoryId/compliance/config', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
      body: z.object({
        enabledFrameworks: z.array(FrameworkSchema).optional(),
        blockingThreshold: SeveritySchema.optional(),
        requireAcknowledgement: z.boolean().optional(),
        auditRetentionDays: z.number().min(30).max(3650).optional(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;
    const config = request.body;

    try {
      const result = await securityComplianceService.configureRepository(repositoryId, config);

      return reply.send({
        success: true,
        config: result,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to configure compliance');
      return reply.status(500).send({ error: 'Failed to configure compliance' });
    }
  });

  /**
   * Get compliance configuration
   */
  fastify.get<{
    Params: { repositoryId: string };
  }>('/repositories/:repositoryId/compliance/config', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;

    try {
      const config = await securityComplianceService.getConfiguration(repositoryId);

      return reply.send({
        success: true,
        config,
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to get compliance config');
      return reply.status(500).send({ error: 'Failed to get config' });
    }
  });

  /**
   * Scan a workflow for compliance violations
   */
  fastify.post<{
    Params: { workflowId: string };
    Body: {
      frameworks?: ComplianceFramework[];
    };
  }>('/workflows/:workflowId/compliance/scan', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
      body: z.object({
        frameworks: z.array(FrameworkSchema).optional(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;
    const { frameworks } = request.body;

    try {
      const result = await securityComplianceService.scanWorkflow(workflowId, frameworks);

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to run compliance scan');
      return reply.status(500).send({ error: 'Failed to run scan' });
    }
  });

  /**
   * Get violations for a workflow
   */
  fastify.get<{
    Params: { workflowId: string };
    Querystring: {
      framework?: ComplianceFramework;
      severity?: ViolationSeverity;
      status?: string;
    };
  }>('/workflows/:workflowId/compliance/violations', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
      querystring: z.object({
        framework: FrameworkSchema.optional(),
        severity: SeveritySchema.optional(),
        status: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;
    const filters = request.query;

    try {
      const violations = await securityComplianceService.getViolations(workflowId, filters);

      return reply.send({
        success: true,
        workflowId,
        count: violations.length,
        violations,
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to get violations');
      return reply.status(500).send({ error: 'Failed to get violations' });
    }
  });

  /**
   * Update violation status
   */
  fastify.patch<{
    Params: { violationId: string };
    Body: {
      status: 'acknowledged' | 'fixed' | 'false_positive' | 'risk_accepted';
      actor: string;
      reason?: string;
    };
  }>('/compliance/violations/:violationId', {
    schema: {
      params: z.object({
        violationId: z.string(),
      }),
      body: z.object({
        status: z.enum(['acknowledged', 'fixed', 'false_positive', 'risk_accepted']),
        actor: z.string(),
        reason: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { violationId } = request.params;
    const { status, actor, reason } = request.body;

    try {
      await securityComplianceService.updateViolationStatus(violationId, status, actor, reason);

      return reply.send({
        success: true,
        message: 'Violation status updated',
      });
    } catch (error) {
      logger.error({ error, violationId }, 'Failed to update violation status');
      return reply.status(500).send({ error: 'Failed to update status' });
    }
  });

  /**
   * Check merge readiness
   */
  fastify.get<{
    Params: { workflowId: string };
  }>('/workflows/:workflowId/compliance/merge-check', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;

    try {
      const result = await securityComplianceService.checkMergeReadiness(workflowId);

      return reply.send({
        success: true,
        workflowId,
        ...result,
      });
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to check merge readiness');
      return reply.status(500).send({ error: 'Failed to check merge readiness' });
    }
  });

  /**
   * Generate compliance report
   */
  fastify.get<{
    Params: { workflowId: string };
    Querystring: {
      format?: 'json' | 'markdown' | 'html';
    };
  }>('/workflows/:workflowId/compliance/report', {
    schema: {
      params: z.object({
        workflowId: z.string(),
      }),
      querystring: z.object({
        format: z.enum(['json', 'markdown', 'html']).optional(),
      }),
    },
  }, async (request, reply) => {
    const { workflowId } = request.params;
    const { format = 'json' } = request.query;

    try {
      const report = await securityComplianceService.generateReport(workflowId, format);

      const contentType = format === 'html' 
        ? 'text/html'
        : format === 'markdown'
        ? 'text/markdown'
        : 'application/json';

      return reply
        .header('Content-Type', contentType)
        .send(report);
    } catch (error) {
      logger.error({ error, workflowId }, 'Failed to generate report');
      return reply.status(500).send({ error: 'Failed to generate report' });
    }
  });

  /**
   * Get available rules
   */
  fastify.get<{
    Querystring: {
      framework?: ComplianceFramework;
    };
  }>('/compliance/rules', {
    schema: {
      querystring: z.object({
        framework: FrameworkSchema.optional(),
      }),
    },
  }, async (request, reply) => {
    const { framework } = request.query;

    try {
      const rules = securityComplianceService.getRules(framework);

      return reply.send({
        success: true,
        count: rules.length,
        rules,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get rules');
      return reply.status(500).send({ error: 'Failed to get rules' });
    }
  });

  /**
   * Add exemption
   */
  fastify.post<{
    Params: { repositoryId: string };
    Body: {
      ruleId: string;
      filePattern: string;
      reason: string;
      approvedBy: string;
      expiresAt?: string;
    };
  }>('/repositories/:repositoryId/compliance/exemptions', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
      body: z.object({
        ruleId: z.string(),
        filePattern: z.string(),
        reason: z.string(),
        approvedBy: z.string(),
        expiresAt: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;
    const exemption = request.body;

    try {
      const config = await securityComplianceService.getConfiguration(repositoryId);
      config.exemptions.push({
        ...exemption,
        expiresAt: exemption.expiresAt ? new Date(exemption.expiresAt) : undefined,
      });

      await securityComplianceService.configureRepository(repositoryId, {
        exemptions: config.exemptions,
      });

      return reply.status(201).send({
        success: true,
        message: 'Exemption added',
      });
    } catch (error) {
      logger.error({ error, repositoryId }, 'Failed to add exemption');
      return reply.status(500).send({ error: 'Failed to add exemption' });
    }
  });

  logger.info('Security compliance routes registered');
}
