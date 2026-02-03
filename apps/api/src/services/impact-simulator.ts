/**
 * @fileoverview Impact Simulator Service
 *
 * Provides impact simulation capabilities:
 * - Run simulations on PRs
 * - Store and retrieve simulation results
 * - Configure simulation settings
 *
 * @module services/impact-simulator
 */

import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';
import { impactSimulatorAgent } from '../agents/impact-simulator.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

import type {
  ImpactSimulation,
  ImpactSimulationInput,
  ImpactSimulationConfig,
} from '@prflow/core';

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * Get raw octokit for operations not exposed by the client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOctokit(github: GitHubClient): any {
  return (github as unknown as { octokit: unknown }).octokit;
}

interface GitHubFile {
  filename: string;
  additions: number;
  deletions: number;
}

export class ImpactSimulatorService {
  /**
   * Run impact simulation for a PR
   */
  async runSimulation(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      commitSha?: string;
      includeCrossRepo?: boolean;
      includeTestPredictions?: boolean;
    } = {}
  ): Promise<ImpactSimulation> {
    const repoFullName = `${owner}/${repo}`;
    logger.info({ repo: repoFullName, prNumber, options }, 'Running impact simulation');

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!workflow) {
      throw new Error(`Workflow not found for PR #${prNumber}`);
    }

    // Get PR files
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);
    const { data: filesData } = await getOctokit(github).pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    const changedFiles = (filesData as GitHubFile[]).map((f: GitHubFile) => f.filename);

    // Get config
    const config = await this.getConfig(repository.id);

    // Build input
    const input: ImpactSimulationInput = {
      owner,
      repo,
      prNumber,
      commitSha: options.commitSha,
      includeCrossRepo: options.includeCrossRepo ?? config?.enableCrossRepoAnalysis ?? false,
      includeTestPredictions: options.includeTestPredictions ?? config?.enableTestPrediction ?? true,
    };

    // Run simulation (agent doesn't need context, passing placeholder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await impactSimulatorAgent.execute(input, {} as any);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Impact simulation failed');
    }

    // Store result
    await this.storeSimulation(repository.id, workflow.id, result.data);

    return result.data;
  }

  /**
   * Get previous simulation results
   */
  async getSimulation(simulationId: string): Promise<ImpactSimulation | null> {
    const record = await dbAny.impactSimulation.findUnique({
      where: { id: simulationId },
    });

    if (!record) return null;

    return record.result as unknown as ImpactSimulation;
  }

  /**
   * Get simulations for a PR
   */
  async getSimulationsForPR(
    owner: string,
    repo: string,
    prNumber: number,
    limit: number = 10
  ): Promise<ImpactSimulation[]> {
    const repoFullName = `${owner}/${repo}`;

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) return [];

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
    });

    if (!workflow) return [];

    const records = await dbAny.impactSimulation.findMany({
      where: { workflowId: workflow.id },
      orderBy: { simulatedAt: 'desc' },
      take: limit,
    });

    return records.map((r: { result: unknown }) => r.result as unknown as ImpactSimulation);
  }

  /**
   * Get latest simulation for a PR
   */
  async getLatestSimulation(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ImpactSimulation | null> {
    const simulations = await this.getSimulationsForPR(owner, repo, prNumber, 1);
    return simulations[0] || null;
  }

  /**
   * Get configuration
   */
  async getConfig(repositoryId: string): Promise<ImpactSimulationConfig | null> {
    const config = await dbAny.impactSimulationConfig.findUnique({
      where: { repositoryId },
    });

    if (!config) return null;

    return {
      repositoryId: config.repositoryId,
      enableTestPrediction: config.enableTestPrediction,
      enableCrossRepoAnalysis: config.enableCrossRepoAnalysis,
      linkedRepositories: config.linkedRepositories,
      riskThresholds: config.riskThresholds as ImpactSimulationConfig['riskThresholds'],
      ignorePatterns: config.ignorePatterns,
      highRiskPatterns: config.highRiskPatterns,
    };
  }

  /**
   * Update configuration
   */
  async updateConfig(
    repositoryId: string,
    config: Partial<ImpactSimulationConfig>
  ): Promise<ImpactSimulationConfig> {
    await dbAny.impactSimulationConfig.upsert({
      where: { repositoryId },
      create: {
        repositoryId,
        enableTestPrediction: config.enableTestPrediction ?? true,
        enableCrossRepoAnalysis: config.enableCrossRepoAnalysis ?? false,
        linkedRepositories: config.linkedRepositories ?? [],
        riskThresholds: config.riskThresholds ?? { low: 25, medium: 50, high: 75 },
        ignorePatterns: config.ignorePatterns ?? [],
        highRiskPatterns: config.highRiskPatterns ?? [],
      },
      update: {
        enableTestPrediction: config.enableTestPrediction,
        enableCrossRepoAnalysis: config.enableCrossRepoAnalysis,
        linkedRepositories: config.linkedRepositories,
        riskThresholds: config.riskThresholds,
        ignorePatterns: config.ignorePatterns,
        highRiskPatterns: config.highRiskPatterns,
      },
    });

    return (await this.getConfig(repositoryId))!;
  }

  /**
   * Compare two simulations
   */
  async compareSimulations(
    simulationId1: string,
    simulationId2: string
  ): Promise<{
    added: { impacts: number; tests: number };
    removed: { impacts: number; tests: number };
    changed: { riskScore: number; recommendation: boolean };
  }> {
    const [sim1, sim2] = await Promise.all([
      this.getSimulation(simulationId1),
      this.getSimulation(simulationId2),
    ]);

    if (!sim1 || !sim2) {
      throw new Error('One or both simulations not found');
    }

    const impactIds1 = new Set(sim1.impacts.map(i => i.description));
    const impactIds2 = new Set(sim2.impacts.map(i => i.description));

    const testFiles1 = new Set(sim1.testImpacts.map(t => t.testFile));
    const testFiles2 = new Set(sim2.testImpacts.map(t => t.testFile));

    return {
      added: {
        impacts: [...impactIds2].filter(id => !impactIds1.has(id)).length,
        tests: [...testFiles2].filter(f => !testFiles1.has(f)).length,
      },
      removed: {
        impacts: [...impactIds1].filter(id => !impactIds2.has(id)).length,
        tests: [...testFiles1].filter(f => !testFiles2.has(f)).length,
      },
      changed: {
        riskScore: sim2.overallRiskScore - sim1.overallRiskScore,
        recommendation: sim1.mergeRecommendation !== sim2.mergeRecommendation,
      },
    };
  }

  // Private helpers

  private async storeSimulation(
    repositoryId: string,
    workflowId: string,
    simulation: ImpactSimulation
  ): Promise<void> {
    await dbAny.impactSimulation.create({
      data: {
        id: simulation.id,
        repositoryId,
        workflowId,
        prNumber: simulation.prNumber,
        commitSha: simulation.commitSha,
        overallRiskScore: simulation.overallRiskScore,
        riskLevel: simulation.riskLevel,
        mergeRecommendation: simulation.mergeRecommendation,
        impactCount: simulation.impacts.length,
        blockingCount: simulation.summary.blockingIssuesCount,
        testsPredictedToFail: simulation.summary.testsPredictedToFail,
        result: simulation as object,
        simulatedAt: simulation.simulatedAt,
      },
    });
  }
}

export const impactSimulatorService = new ImpactSimulatorService();
