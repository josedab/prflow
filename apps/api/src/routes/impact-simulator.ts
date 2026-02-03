/**
 * @fileoverview Impact Simulator API Routes
 *
 * REST API endpoints for:
 * - Running impact simulations
 * - Retrieving simulation results
 * - Configuring simulation settings
 *
 * @module routes/impact-simulator
 */

import type { FastifyInstance } from 'fastify';
import { db } from '@prflow/db';
import { impactSimulatorService } from '../services/impact-simulator.js';
import { logger } from '../lib/logger.js';

interface RepoParams {
  owner: string;
  repo: string;
}

interface PRParams extends RepoParams {
  prNumber: string;
}

export async function impactSimulatorRoutes(app: FastifyInstance) {
  /**
   * Run impact simulation for a PR
   * POST /api/impact/:owner/:repo/:prNumber/simulate
   */
  app.post<{
    Params: PRParams;
    Body: {
      commitSha?: string;
      includeCrossRepo?: boolean;
      includeTestPredictions?: boolean;
    };
  }>('/:owner/:repo/:prNumber/simulate', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const options = request.body;

    try {
      const simulation = await impactSimulatorService.runSimulation(
        owner,
        repo,
        parseInt(prNumber, 10),
        options
      );

      return reply.send({
        success: true,
        data: simulation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Simulation failed';
      logger.error({ error, owner, repo, prNumber }, 'Impact simulation failed');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get latest simulation for a PR
   * GET /api/impact/:owner/:repo/:prNumber/latest
   */
  app.get<{
    Params: PRParams;
  }>('/:owner/:repo/:prNumber/latest', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;

    try {
      const simulation = await impactSimulatorService.getLatestSimulation(
        owner,
        repo,
        parseInt(prNumber, 10)
      );

      if (!simulation) {
        return reply.status(404).send({
          success: false,
          error: 'No simulation found for this PR',
        });
      }

      return reply.send({
        success: true,
        data: simulation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get simulation';
      logger.error({ error, owner, repo, prNumber }, 'Failed to get simulation');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get simulation history for a PR
   * GET /api/impact/:owner/:repo/:prNumber/history
   */
  app.get<{
    Params: PRParams;
    Querystring: { limit?: string };
  }>('/:owner/:repo/:prNumber/history', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const limit = parseInt(request.query.limit || '10', 10);

    try {
      const simulations = await impactSimulatorService.getSimulationsForPR(
        owner,
        repo,
        parseInt(prNumber, 10),
        limit
      );

      return reply.send({
        success: true,
        data: simulations,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get history';
      logger.error({ error, owner, repo, prNumber }, 'Failed to get simulation history');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get a specific simulation by ID
   * GET /api/impact/simulation/:simulationId
   */
  app.get<{
    Params: { simulationId: string };
  }>('/simulation/:simulationId', async (request, reply) => {
    const { simulationId } = request.params;

    try {
      const simulation = await impactSimulatorService.getSimulation(simulationId);

      if (!simulation) {
        return reply.status(404).send({
          success: false,
          error: 'Simulation not found',
        });
      }

      return reply.send({
        success: true,
        data: simulation,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get simulation';
      logger.error({ error, simulationId }, 'Failed to get simulation');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Compare two simulations
   * GET /api/impact/compare/:id1/:id2
   */
  app.get<{
    Params: { id1: string; id2: string };
  }>('/compare/:id1/:id2', async (request, reply) => {
    const { id1, id2 } = request.params;

    try {
      const comparison = await impactSimulatorService.compareSimulations(id1, id2);

      return reply.send({
        success: true,
        data: comparison,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Comparison failed';
      logger.error({ error, id1, id2 }, 'Failed to compare simulations');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get impact simulation config
   * GET /api/impact/:owner/:repo/config
   */
  app.get<{
    Params: RepoParams;
  }>('/:owner/:repo/config', async (request, reply) => {
    const { owner, repo } = request.params;

    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const config = await impactSimulatorService.getConfig(repository.id);

      return reply.send({
        success: true,
        data: config || {
          enableTestPrediction: true,
          enableCrossRepoAnalysis: false,
          linkedRepositories: [],
          riskThresholds: { low: 25, medium: 50, high: 75 },
          ignorePatterns: [],
          highRiskPatterns: [],
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get config';
      logger.error({ error, owner, repo }, 'Failed to get impact config');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Update impact simulation config
   * PATCH /api/impact/:owner/:repo/config
   */
  app.patch<{
    Params: RepoParams;
    Body: {
      enableTestPrediction?: boolean;
      enableCrossRepoAnalysis?: boolean;
      linkedRepositories?: string[];
      riskThresholds?: { low: number; medium: number; high: number };
      ignorePatterns?: string[];
      highRiskPatterns?: string[];
    };
  }>('/:owner/:repo/config', async (request, reply) => {
    const { owner, repo } = request.params;
    const config = request.body;

    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const updated = await impactSimulatorService.updateConfig(repository.id, config);

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update config';
      logger.error({ error, owner, repo }, 'Failed to update impact config');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get merge recommendation summary
   * GET /api/impact/:owner/:repo/:prNumber/recommendation
   */
  app.get<{
    Params: PRParams;
  }>('/:owner/:repo/:prNumber/recommendation', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;

    try {
      const simulation = await impactSimulatorService.getLatestSimulation(
        owner,
        repo,
        parseInt(prNumber, 10)
      );

      if (!simulation) {
        return reply.send({
          success: true,
          data: {
            hasSimulation: false,
            recommendation: 'unknown',
            message: 'No impact simulation has been run for this PR',
          },
        });
      }

      return reply.send({
        success: true,
        data: {
          hasSimulation: true,
          recommendation: simulation.mergeRecommendation,
          riskLevel: simulation.riskLevel,
          riskScore: simulation.overallRiskScore,
          reasons: simulation.recommendationReasons,
          summary: simulation.summary,
          simulatedAt: simulation.simulatedAt,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get recommendation';
      logger.error({ error, owner, repo, prNumber }, 'Failed to get recommendation');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });
}
