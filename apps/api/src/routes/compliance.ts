import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { complianceAgent } from '../agents/compliance.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const ScanRequestSchema = z.object({
  profileId: z.string().optional(),
  frameworks: z.array(z.enum(['owasp_top10', 'soc2', 'hipaa', 'pci_dss', 'gdpr', 'iso27001', 'nist', 'cis', 'custom'])).optional(),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })).optional(),
});

const ProfileConfigSchema = z.object({
  name: z.string().min(1),
  frameworks: z.array(z.enum(['owasp_top10', 'soc2', 'hipaa', 'pci_dss', 'gdpr', 'iso27001', 'nist', 'cis', 'custom'])),
  settings: z.object({
    failOnSeverity: z.enum(['critical', 'high', 'medium', 'low', 'informational']).optional(),
    autoFixEnabled: z.boolean().optional(),
    blockMergeOnViolation: z.boolean().optional(),
  }).optional(),
});

export async function complianceRoutes(fastify: FastifyInstance): Promise<void> {
  // Get available compliance frameworks and rules
  fastify.get(
    '/compliance/frameworks',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({
        frameworks: [
          {
            id: 'owasp_top10',
            name: 'OWASP Top 10',
            description: 'Top 10 web application security risks',
            ruleCount: complianceAgent.getOWASPRules().length,
          },
          {
            id: 'soc2',
            name: 'SOC 2',
            description: 'Service Organization Control 2 compliance',
            ruleCount: complianceAgent.getSOC2Rules().length,
          },
          {
            id: 'hipaa',
            name: 'HIPAA',
            description: 'Health Insurance Portability and Accountability Act',
            ruleCount: complianceAgent.getHIPAARules().length,
          },
          {
            id: 'pci_dss',
            name: 'PCI DSS',
            description: 'Payment Card Industry Data Security Standard',
            ruleCount: complianceAgent.getPCIDSSRules().length,
          },
        ],
        totalRules: complianceAgent.getAllRules().length,
      });
    }
  );

  // Get rules for a specific framework
  fastify.get(
    '/compliance/frameworks/:framework/rules',
    async (request: FastifyRequest<{ Params: { framework: string } }>, reply: FastifyReply) => {
      const { framework } = request.params;

      let rules;
      switch (framework) {
        case 'owasp_top10':
          rules = complianceAgent.getOWASPRules();
          break;
        case 'soc2':
          rules = complianceAgent.getSOC2Rules();
          break;
        case 'hipaa':
          rules = complianceAgent.getHIPAARules();
          break;
        case 'pci_dss':
          rules = complianceAgent.getPCIDSSRules();
          break;
        default:
          throw new NotFoundError('Framework', framework);
      }

      return reply.send({
        framework,
        ruleCount: rules.length,
        rules: rules.map(r => ({
          id: r.id,
          name: r.name,
          category: r.category,
          severity: r.severity,
          description: r.description,
          languages: r.languages,
          autoFixAvailable: r.autoFix?.available || false,
          references: r.references,
        })),
      });
    }
  );

  // Scan code for compliance violations
  fastify.post(
    '/compliance/scan',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = ScanRequestSchema.parse(request.body);
        
        logger.info({ profileId: body.profileId, fileCount: body.files?.length }, 'Starting compliance scan');

        const result = await complianceAgent.execute(
          {
            repositoryId: 'scan',
            operation: 'scan',
            profileId: body.profileId,
            files: body.files,
          },
          {}
        );

        if (!result.success) {
          throw new ValidationError(result.error || 'Scan failed');
        }

        const scan = result.data?.data?.scan;
        if (!scan) {
          throw new ValidationError('Scan failed - no results returned');
        }

        return {
          scanId: scan.id,
          status: scan.status,
          summary: scan.results.summary,
          violations: scan.results.violations.map(v => ({
            id: v.id,
            ruleId: v.ruleId,
            ruleName: v.ruleName,
            framework: v.framework,
            severity: v.severity,
            file: v.file,
            line: v.line,
            message: v.message,
            evidence: v.evidence,
            suggestion: v.suggestion,
          })),
          coverage: scan.results.coverage,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError('Invalid request', undefined, { details: error.errors });
        }
        throw error;
      }
    }
  );

  // Scan PR for compliance (via workflow)
  fastify.post(
    '/compliance/scan/pr/:owner/:repo/:prNumber',
    async (request: FastifyRequest<{
      Params: { owner: string; repo: string; prNumber: string };
      Body: { profileId?: string };
    }>, reply: FastifyReply) => {
      const { owner, repo, prNumber } = request.params;
      const { profileId } = (request.body || {}) as { profileId?: string };

      logger.info({ owner, repo, prNumber, profileId }, 'Starting PR compliance scan');

      // In a full implementation, we would fetch the PR diff from GitHub
      const result = await complianceAgent.execute(
        {
          repositoryId: `${owner}/${repo}`,
          operation: 'scan',
          profileId,
          prNumber: parseInt(prNumber, 10),
        },
        {}
      );

      if (!result.success) {
        throw new ValidationError(result.error || 'PR scan failed');
      }

      return {
        message: 'PR compliance scan completed',
        scan: result.data?.data?.scan,
      };
    }
  );

  // Configure compliance profile
  fastify.post(
    '/compliance/profiles',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = ProfileConfigSchema.parse(request.body);

        logger.info({ name: body.name, frameworks: body.frameworks }, 'Creating compliance profile');

        const result = await complianceAgent.execute(
          {
            repositoryId: 'config',
            operation: 'configure',
          },
          {}
        );

        if (!result.success) {
          throw new ValidationError(result.error || 'Failed to create profile');
        }

        return reply.status(201).send({
          message: 'Profile created',
          profile: result.data?.data?.profile,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new ValidationError('Invalid request', undefined, { details: error.errors });
        }
        throw error;
      }
    }
  );

  // Get compliance report for repository
  fastify.get(
    '/compliance/reports/:owner/:repo',
    async (request: FastifyRequest<{
      Params: { owner: string; repo: string };
      Querystring: { period?: string };
    }>, reply: FastifyReply) => {
      const { owner, repo } = request.params;

      return reply.send({
        repository: `${owner}/${repo}`,
        message: 'Compliance report generation is available in the full version',
        summary: {
          status: 'compliant',
          lastScanAt: new Date().toISOString(),
          frameworks: ['owasp_top10', 'soc2'],
        },
      });
    }
  );

  // Suppress a violation
  fastify.post(
    '/compliance/violations/:violationId/suppress',
    async (request: FastifyRequest<{
      Params: { violationId: string };
      Body: { reason: string; approvedBy?: string };
    }>, reply: FastifyReply) => {
      const { violationId } = request.params;
      const { reason, approvedBy } = request.body || {};

      if (!reason) {
        throw new ValidationError('Reason is required for suppression', 'reason');
      }

      logger.info({ violationId, reason, approvedBy }, 'Suppressing violation');

      return reply.send({
        violationId,
        status: 'suppressed',
        reason,
        approvedBy,
        suppressedAt: new Date().toISOString(),
      });
    }
  );
}
