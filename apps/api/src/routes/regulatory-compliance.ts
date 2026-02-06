import { FastifyPluginAsync } from 'fastify';
import { regulatoryComplianceService } from '../services/regulatory-compliance.js';
import { logger } from '../lib/logger.js';
import type { RegulatoryComplianceFramework, ComplianceRule } from '@prflow/core';

/**
 * Regulatory Compliance Engine routes
 */
export const regulatoryComplianceRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Run compliance check for a PR
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      frameworks?: RegulatoryComplianceFramework[];
      policyId?: string;
      autoFix?: boolean;
    };
  }>('/api/compliance/check', async (request, reply) => {
    try {
      const result = await regulatoryComplianceService.runComplianceCheck(
        request.body.owner,
        request.body.repo,
        request.body.prNumber,
        {
          frameworks: request.body.frameworks,
          policyId: request.body.policyId,
          autoFix: request.body.autoFix,
        }
      );

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to run compliance check');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to run compliance check',
      });
    }
  });

  /**
   * Get compliance check result
   */
  fastify.get<{
    Params: { owner: string; repo: string; prNumber: string };
    Querystring: { frameworks?: string };
  }>('/api/compliance/check/:owner/:repo/:prNumber', async (request, reply) => {
    try {
      const frameworks = request.query.frameworks?.split(',') as RegulatoryComplianceFramework[] | undefined;

      const result = await regulatoryComplianceService.runComplianceCheck(
        request.params.owner,
        request.params.repo,
        parseInt(request.params.prNumber, 10),
        { frameworks }
      );

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get compliance check');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get compliance check',
      });
    }
  });

  /**
   * Create compliance policy
   */
  fastify.post<{
    Body: {
      organizationId: string;
      name: string;
      description: string;
      frameworks: RegulatoryComplianceFramework[];
      rules?: Partial<ComplianceRule>[];
      thresholds?: {
        blockMergeBelow?: number;
        requireReviewBelow?: number;
        autoApproveAbove?: number;
        maxCriticalFindings?: number;
        maxHighFindings?: number;
      };
    };
  }>('/api/compliance/policies', async (request, reply) => {
    try {
      const policy = await regulatoryComplianceService.createPolicy(
        request.body.organizationId,
        {
          name: request.body.name,
          description: request.body.description,
          frameworks: request.body.frameworks,
          rules: request.body.rules,
          thresholds: request.body.thresholds,
        }
      );

      return reply.send({
        success: true,
        policy,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create compliance policy');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create compliance policy',
      });
    }
  });

  /**
   * Get compliance policy
   */
  fastify.get<{
    Params: { policyId: string };
  }>('/api/compliance/policies/:policyId', async (request, reply) => {
    try {
      const policy = await regulatoryComplianceService.getPolicy(request.params.policyId);

      if (!policy) {
        return reply.status(404).send({
          success: false,
          error: 'Policy not found',
        });
      }

      return reply.send({
        success: true,
        policy,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get compliance policy');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get compliance policy',
      });
    }
  });

  /**
   * Get compliance rules for a framework
   */
  fastify.get<{
    Params: { framework: RegulatoryComplianceFramework };
  }>('/api/compliance/rules/:framework', async (request, reply) => {
    try {
      const rules = regulatoryComplianceService.getRulesForFramework(request.params.framework);

      return reply.send({
        success: true,
        framework: request.params.framework,
        rules,
        count: rules.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get compliance rules');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get compliance rules',
      });
    }
  });

  /**
   * Generate compliance report
   */
  fastify.post<{
    Body: {
      scopeType: 'repository' | 'organization';
      scopeId: string;
      reportType: 'summary' | 'detailed' | 'executive' | 'audit';
      frameworks?: RegulatoryComplianceFramework[];
      periodStart: string;
      periodEnd: string;
    };
  }>('/api/compliance/reports', async (request, reply) => {
    try {
      const report = await regulatoryComplianceService.generateReport(
        request.body.scopeType,
        request.body.scopeId,
        {
          reportType: request.body.reportType,
          frameworks: request.body.frameworks,
          periodStart: new Date(request.body.periodStart),
          periodEnd: new Date(request.body.periodEnd),
        }
      );

      return reply.send({
        success: true,
        report,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate compliance report');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate compliance report',
      });
    }
  });

  /**
   * Create compliance audit
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      frameworks?: RegulatoryComplianceFramework[];
      auditor: string;
    };
  }>('/api/compliance/audits', async (request, reply) => {
    try {
      // First run compliance check
      const result = await regulatoryComplianceService.runComplianceCheck(
        request.body.owner,
        request.body.repo,
        request.body.prNumber,
        { frameworks: request.body.frameworks }
      );

      // Create audit record
      const audit = await regulatoryComplianceService.createAudit(
        request.body.owner,
        request.body.repo,
        'manual',
        result,
        request.body.auditor
      );

      return reply.send({
        success: true,
        audit,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create compliance audit');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create compliance audit',
      });
    }
  });

  /**
   * Collect compliance evidence
   */
  fastify.post<{
    Body: {
      controlId: string;
      framework: RegulatoryComplianceFramework;
      type: 'code_review' | 'test_execution' | 'security_scan' | 'access_log' | 'configuration' | 'documentation' | 'approval';
      title: string;
      description: string;
      source: {
        type: 'pr' | 'commit' | 'file' | 'config';
        reference: string;
      };
    };
  }>('/api/compliance/evidence', async (request, reply) => {
    try {
      const evidence = await regulatoryComplianceService.collectEvidence(
        request.body.controlId,
        request.body.framework,
        request.body.source,
        {
          title: request.body.title,
          description: request.body.description,
          type: request.body.type,
        }
      );

      return reply.send({
        success: true,
        evidence,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to collect compliance evidence');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to collect compliance evidence',
      });
    }
  });
};
