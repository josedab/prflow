import { FastifyPluginAsync } from 'fastify';
import { securityThreatModelService } from '../services/security-threat-model.js';
import { logger } from '../lib/logger.js';

/**
 * Security Threat Model Integration routes
 */
export const securityThreatModelRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Assess a PR for security threats
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
    };
  }>('/assess', async (request, reply) => {
    try {
      const assessment = await securityThreatModelService.assessPR(request.body);

      return reply.send({ success: true, assessment });
    } catch (error) {
      logger.error({ error }, 'Failed to assess PR for security threats');
      return reply.status(500).send({ success: false, error: 'Failed to assess PR' });
    }
  });

  /**
   * Get security posture dashboard
   */
  fastify.get<{
    Querystring: { owner: string; repo: string; periodDays?: number };
  }>('/dashboard', async (request, reply) => {
    try {
      const dashboard = await securityThreatModelService.getSecurityDashboard({
        owner: request.query.owner,
        repo: request.query.repo,
        periodDays: request.query.periodDays,
      });

      return reply.send({ success: true, dashboard });
    } catch (error) {
      logger.error({ error }, 'Failed to get security dashboard');
      return reply.status(500).send({ success: false, error: 'Failed to get dashboard' });
    }
  });
};
