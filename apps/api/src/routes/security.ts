import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '@prflow/db';
import { securityScannerService } from '../services/security-scanner.js';
import { requireAuth } from '../lib/auth.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface RepositoryParams {
  repositoryId: string;
}

interface WorkflowParams {
  workflowId: string;
}

interface ScanBody {
  installationId: number;
}

interface CreateAdvisoryBody {
  installationId: number;
  vulnerabilityIds?: string[];
  severityThreshold?: 'critical' | 'high' | 'medium' | 'low';
}

export async function securityRoutes(fastify: FastifyInstance) {
  // Scan a repository for vulnerabilities
  fastify.post<{ Params: RepositoryParams; Body: ScanBody }>(
    '/repositories/:repositoryId/scan',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: RepositoryParams; Body: ScanBody }>, reply: FastifyReply) => {
      const { repositoryId } = request.params;
      const { installationId } = request.body;

      if (!installationId) {
        throw new BadRequestError('installationId is required');
      }

      const repository = await db.repository.findUnique({
        where: { id: repositoryId },
      });

      if (!repository) {
        throw new NotFoundError('Repository not found');
      }

      const result = await securityScannerService.scanRepository(repositoryId, installationId);

      logger.info({ repositoryId, vulnerabilities: result.vulnerabilitiesFound }, 'Repository security scan completed');

      return reply.send({
        success: true,
        ...result,
      });
    }
  );

  // Scan a specific PR for vulnerabilities
  fastify.post<{ Params: WorkflowParams; Body: ScanBody }>(
    '/workflows/:workflowId/scan',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: WorkflowParams; Body: ScanBody }>, reply: FastifyReply) => {
      const { workflowId } = request.params;
      const { installationId } = request.body;

      if (!installationId) {
        throw new BadRequestError('installationId is required');
      }

      const workflow = await db.pRWorkflow.findUnique({
        where: { id: workflowId },
      });

      if (!workflow) {
        throw new NotFoundError('Workflow not found');
      }

      const result = await securityScannerService.scanPullRequest(workflowId, installationId);

      return reply.send({
        success: true,
        ...result,
      });
    }
  );

  // Get vulnerability summary for a repository
  fastify.get<{ Params: RepositoryParams }>(
    '/repositories/:repositoryId/summary',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: RepositoryParams }>, reply: FastifyReply) => {
      const { repositoryId } = request.params;

      const repository = await db.repository.findUnique({
        where: { id: repositoryId },
      });

      if (!repository) {
        throw new NotFoundError('Repository not found');
      }

      const summary = await securityScannerService.getVulnerabilitySummary(repositoryId);

      return reply.send({
        success: true,
        repositoryId,
        ...summary,
      });
    }
  );

  // Query vulnerabilities for a specific package
  fastify.get<{ Querystring: { ecosystem: string; package: string; version?: string } }>(
    '/vulnerabilities/query',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Querystring: { ecosystem: string; package: string; version?: string } }>, reply: FastifyReply) => {
      const { ecosystem, package: packageName, version } = request.query;

      if (!ecosystem || !packageName) {
        throw new BadRequestError('ecosystem and package are required');
      }

      const vulnerabilities = await securityScannerService.queryOSV(ecosystem, packageName, version);

      return reply.send({
        success: true,
        ecosystem,
        package: packageName,
        version,
        vulnerabilityCount: vulnerabilities.length,
        vulnerabilities,
      });
    }
  );

  // Create security advisory PR
  fastify.post<{ Params: RepositoryParams; Body: CreateAdvisoryBody }>(
    '/repositories/:repositoryId/create-advisory-pr',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: RepositoryParams; Body: CreateAdvisoryBody }>, reply: FastifyReply) => {
      const { repositoryId } = request.params;
      const { installationId, severityThreshold = 'high' } = request.body;

      if (!installationId) {
        throw new BadRequestError('installationId is required');
      }

      // First scan for vulnerabilities
      const scanResult = await securityScannerService.scanRepository(repositoryId, installationId);

      // Filter by severity threshold
      const severityOrder = ['critical', 'high', 'medium', 'low'];
      const thresholdIndex = severityOrder.indexOf(severityThreshold);
      
      const vulnerabilitiesToFix = scanResult.vulnerabilities.filter(v => {
        const vulnIndex = severityOrder.indexOf(v.vulnerability.severity);
        return vulnIndex >= 0 && vulnIndex <= thresholdIndex && v.fixAvailable;
      });

      if (vulnerabilitiesToFix.length === 0) {
        return reply.send({
          success: true,
          message: 'No fixable vulnerabilities found above threshold',
          threshold: severityThreshold,
        });
      }

      const advisory = await securityScannerService.createSecurityAdvisoryPR(
        repositoryId,
        vulnerabilitiesToFix,
        installationId
      );

      return reply.send({
        success: true,
        advisory,
      });
    }
  );

  // Get supported ecosystems
  fastify.get(
    '/ecosystems',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const ecosystems = [
        { id: 'npm', name: 'npm', languages: ['JavaScript', 'TypeScript'] },
        { id: 'pip', name: 'PyPI', languages: ['Python'] },
        { id: 'maven', name: 'Maven', languages: ['Java', 'Kotlin'] },
        { id: 'nuget', name: 'NuGet', languages: ['C#', '.NET'] },
        { id: 'go', name: 'Go Modules', languages: ['Go'] },
        { id: 'cargo', name: 'Cargo', languages: ['Rust'] },
        { id: 'gem', name: 'RubyGems', languages: ['Ruby'] },
      ];

      return reply.send({
        success: true,
        ecosystems,
      });
    }
  );

  // Get security scan history for a repository
  fastify.get<{ Params: RepositoryParams; Querystring: { limit?: string } }>(
    '/repositories/:repositoryId/history',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: RepositoryParams; Querystring: { limit?: string } }>, reply: FastifyReply) => {
      const { repositoryId } = request.params;
      // limit available in request.query.limit for future pagination

      // In a full implementation, this would fetch from database
      // For now, return empty history
      return reply.send({
        success: true,
        repositoryId,
        scans: [],
        totalScans: 0,
      });
    }
  );
}
