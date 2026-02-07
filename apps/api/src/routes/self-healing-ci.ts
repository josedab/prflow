import { FastifyPluginAsync } from 'fastify';
import { selfHealingCIService } from '../services/self-healing-ci.js';
import { logger } from '../lib/logger.js';
import type { CIProvider, FlakyTest, SelfHealingConfig } from '@prflow/core';

/**
 * Self-Healing CI Integration routes
 */
export const selfHealingCIRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Analyze a CI failure
   */
  fastify.get<{
    Params: { owner: string; repo: string; runId: string };
    Querystring: {
      provider?: CIProvider;
      includeFixes?: boolean;
      includeFlakinessAnalysis?: boolean;
    };
  }>('/api/ci/analyze/:owner/:repo/:runId', async (request, reply) => {
    try {
      const analysis = await selfHealingCIService.analyzeCIFailure(
        request.params.owner,
        request.params.repo,
        request.params.runId,
        {
          provider: request.query.provider,
          includeFixes: request.query.includeFixes,
          includeFlakinessAnalysis: request.query.includeFlakinessAnalysis,
        }
      );

      return reply.send({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze CI failure');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze CI failure',
      });
    }
  });

  /**
   * Apply fixes to a CI failure
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      runId: string;
      fixIds: string[];
      createCommit?: boolean;
      triggerRerun?: boolean;
      dryRun?: boolean;
    };
  }>('/api/ci/apply-fixes', async (request, reply) => {
    try {
      const result = await selfHealingCIService.applyFixes(
        request.body.owner,
        request.body.repo,
        request.body.runId,
        request.body.fixIds,
        {
          createCommit: request.body.createCommit,
          triggerRerun: request.body.triggerRerun,
          dryRun: request.body.dryRun,
        }
      );

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to apply CI fixes');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to apply CI fixes',
      });
    }
  });

  /**
   * Get flaky tests
   */
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: {
      minScore?: number;
      status?: FlakyTest['status'];
      limit?: number;
    };
  }>('/api/ci/flaky-tests/:owner/:repo', async (request, reply) => {
    try {
      const tests = await selfHealingCIService.getFlakyTests(
        request.params.owner,
        request.params.repo,
        {
          minScore: request.query.minScore,
          status: request.query.status,
          limit: request.query.limit,
        }
      );

      return reply.send({
        success: true,
        tests,
        count: tests.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get flaky tests');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get flaky tests',
      });
    }
  });

  /**
   * Record a flaky test result
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      testName: string;
      testFile: string;
      passed: boolean;
      errorMessage?: string;
    };
  }>('/api/ci/flaky-tests', async (request, reply) => {
    try {
      const test = await selfHealingCIService.recordFlakyTest(
        request.body.owner,
        request.body.repo,
        request.body.testName,
        request.body.testFile,
        request.body.passed,
        request.body.errorMessage
      );

      return reply.send({
        success: true,
        test,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to record flaky test');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to record flaky test',
      });
    }
  });

  /**
   * Quarantine a flaky test
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      testId: string;
      reason: string;
    };
  }>('/api/ci/flaky-tests/quarantine', async (request, reply) => {
    try {
      const test = await selfHealingCIService.quarantineTest(
        request.body.owner,
        request.body.repo,
        request.body.testId,
        request.body.reason
      );

      return reply.send({
        success: true,
        test,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to quarantine test');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to quarantine test',
      });
    }
  });

  /**
   * Get CI health dashboard
   */
  fastify.get<{
    Params: { owner: string; repo: string };
    Querystring: { periodDays?: number };
  }>('/api/ci/health/:owner/:repo', async (request, reply) => {
    try {
      const dashboard = await selfHealingCIService.getCIHealthDashboard(
        request.params.owner,
        request.params.repo,
        request.query.periodDays
      );

      return reply.send({
        success: true,
        dashboard,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get CI health dashboard');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get CI health dashboard',
      });
    }
  });

  /**
   * Get self-healing configuration
   */
  fastify.get<{
    Params: { owner: string; repo: string };
  }>('/api/ci/config/:owner/:repo', async (request, reply) => {
    try {
      const config = await selfHealingCIService.getConfig(
        request.params.owner,
        request.params.repo
      );

      return reply.send({
        success: true,
        config,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get CI config');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get CI config',
      });
    }
  });

  /**
   * Update self-healing configuration
   */
  fastify.put<{
    Params: { owner: string; repo: string };
    Body: Partial<SelfHealingConfig>;
  }>('/api/ci/config/:owner/:repo', async (request, reply) => {
    try {
      const config = await selfHealingCIService.updateConfig(
        request.params.owner,
        request.params.repo,
        request.body
      );

      return reply.send({
        success: true,
        config,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update CI config');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update CI config',
      });
    }
  });

  /**
   * Webhook for CI events
   */
  fastify.post<{
    Body: {
      provider: CIProvider;
      event: 'run_started' | 'run_completed' | 'job_started' | 'job_completed';
      repository: { owner: string; name: string };
      runId: string;
      status: string;
      conclusion?: string;
      prNumber?: number;
      branch: string;
      commitSha: string;
    };
  }>('/api/ci/webhook', async (request, reply) => {
    try {
      const { provider, event, repository, runId, conclusion } = request.body;

      logger.info({ provider, event, runId }, 'CI webhook received');

      // If run completed with failure, analyze it
      if (event === 'run_completed' && conclusion === 'failure') {
        const config = await selfHealingCIService.getConfig(repository.owner, repository.name);

        if (config.enabled) {
          // Analyze in background
          selfHealingCIService.analyzeCIFailure(
            repository.owner,
            repository.name,
            runId,
            { provider, includeFixes: config.autoFixEnabled }
          ).catch(err => {
            logger.error({ err, runId }, 'Failed to analyze CI failure from webhook');
          });
        }
      }

      return reply.send({
        success: true,
        message: 'Webhook processed',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to process CI webhook');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process CI webhook',
      });
    }
  });
};
