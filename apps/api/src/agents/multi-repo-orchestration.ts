import {
  MultiRepoOrchestrationInput,
  MultiRepoOrchestrationResult,
  MultiRepoChangeSet,
  RepoChange,
  DependencyGraph,
  CrossRepoConflict,
  AtomicDeployment,
  ChangeSetStats,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

const AGENT_TYPE = 'multi-repo-orchestration';
const AGENT_DESCRIPTION = 'Coordinates changes across multiple repositories with dependency-aware merging';

export class MultiRepoOrchestrationAgent extends BaseAgent<
  MultiRepoOrchestrationInput,
  MultiRepoOrchestrationResult
> {
  readonly name = AGENT_TYPE;
  readonly description = AGENT_DESCRIPTION;

  // In-memory storage for change sets (would be database in production)
  private changeSets: Map<string, MultiRepoChangeSet> = new Map();
  private deployments: Map<string, AtomicDeployment> = new Map();

  async execute(input: MultiRepoOrchestrationInput, _context: { repositoryId: string }): Promise<{
    success: boolean;
    data?: MultiRepoOrchestrationResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result || !result.success) {
      return this.createErrorResult(result?.error || 'Operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(
    input: MultiRepoOrchestrationInput
  ): Promise<MultiRepoOrchestrationResult> {
    switch (input.operation) {
      case 'create':
        return this.createChangeSet(input);
      case 'analyze':
        return this.analyzeChangeSet(input);
      case 'merge':
        return this.executeMerge(input);
      case 'rollback':
        return this.executeRollback(input);
      case 'status':
        return this.getStatus(input);
      case 'resolve_conflict':
        return this.resolveConflict(input);
      default:
        return {
          operation: input.operation,
          success: false,
          error: `Unknown operation: ${input.operation}`,
        };
    }
  }

  private async createChangeSet(
    input: MultiRepoOrchestrationInput
  ): Promise<MultiRepoOrchestrationResult> {
    if (!input.repositories || input.repositories.length < 2) {
      return {
        operation: 'create',
        success: false,
        error: 'At least 2 repositories required for multi-repo orchestration',
      };
    }

    logger.info({ repoCount: input.repositories.length }, 'Creating multi-repo change set');

    const changeSetId = `cs_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Initialize repo changes
    const repoChanges: RepoChange[] = input.repositories.map((repo, index) => ({
      id: `rc_${index}_${Math.random().toString(36).substring(7)}`,
      repositoryId: repo.repositoryId,
      repositoryFullName: repo.repositoryId,
      branch: repo.branch,
      baseBranch: repo.baseBranch || 'main',
      prStatus: 'pending',
      commits: [],
      files: [],
      additions: 0,
      deletions: 0,
      dependencies: [],
      dependents: [],
      reviewers: [],
      approvals: [],
      checks: [],
      metadata: {},
    }));

    // Analyze dependencies using LLM
    const dependencyGraph = await this.analyzeDependencies(repoChanges);

    // Detect initial conflicts
    const conflicts = await this.detectConflicts(repoChanges);

    const changeSet: MultiRepoChangeSet = {
      id: changeSetId,
      name: `Change Set ${changeSetId}`,
      description: `Coordinated changes across ${input.repositories.length} repositories`,
      status: 'draft',
      owner: 'system',
      repositories: repoChanges,
      dependencyGraph,
      mergeOrder: dependencyGraph.topologicalOrder,
      conflicts,
      timeline: [
        {
          id: `evt_${Date.now()}`,
          type: 'created',
          timestamp: new Date(),
          details: { repoCount: input.repositories.length },
        },
      ],
      settings: {
        autoMerge: false,
        requireAllApprovals: true,
        requireAllChecks: true,
        mergeMethod: 'squash',
        deleteSourceBranches: true,
        notifications: {
          notifyOnConflict: true,
          notifyOnApproval: true,
          notifyOnMerge: true,
        },
      },
      stats: this.calculateStats(repoChanges, conflicts),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.changeSets.set(changeSetId, changeSet);

    return {
      operation: 'create',
      success: true,
      data: {
        changeSet,
        conflicts,
      },
    };
  }

  private async analyzeDependencies(repos: RepoChange[]): Promise<DependencyGraph> {
    const systemPrompt = buildSystemPrompt(AGENT_TYPE, `
Analyzing dependencies between ${repos.length} repositories.
Repositories: ${repos.map(r => r.repositoryFullName).join(', ')}
`);

    const userPrompt = `Analyze the following repositories and identify their dependencies:

${repos.map((r) => `- ${r.repositoryFullName} (branch: ${r.branch})`).join('\n')}

Determine:
1. Which repositories depend on which others
2. The type of each dependency (runtime, dev, api, data)
3. Any circular dependencies
4. The optimal topological order for merging

Respond with JSON:
{
  "dependencies": [
    { "from": "repo-a", "to": "repo-b", "type": "runtime", "required": true }
  ],
  "hasCycles": false,
  "topologicalOrder": ["repo-b", "repo-a"]
}`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 1500 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{')
        ? content
        : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;

      const analysis = JSON.parse(jsonStr);

      const nodes = repos.map((r) => ({
        id: r.id,
        repositoryId: r.repositoryId,
        name: r.repositoryFullName.split('/').pop() || r.repositoryFullName,
        type: 'service' as const,
      }));

      const edges = analysis.dependencies.map(
        (d: { from: string; to: string; type: string; required: boolean }) => ({
          from: d.from,
          to: d.to,
          type: d.type || 'runtime',
          required: d.required ?? true,
        })
      );

      return {
        nodes,
        edges,
        hasCycles: analysis.hasCycles || false,
        topologicalOrder: analysis.topologicalOrder || repos.map((r) => r.repositoryId),
      };
    } catch {
      logger.warn('Failed to analyze dependencies with LLM, using default order');
      return {
        nodes: repos.map((r) => ({
          id: r.id,
          repositoryId: r.repositoryId,
          name: r.repositoryFullName.split('/').pop() || r.repositoryFullName,
          type: 'service' as const,
        })),
        edges: [],
        hasCycles: false,
        topologicalOrder: repos.map((r) => r.repositoryId),
      };
    }
  }

  private async detectConflicts(repos: RepoChange[]): Promise<CrossRepoConflict[]> {
    const systemPrompt = buildSystemPrompt(AGENT_TYPE, `
Detecting cross-repository conflicts.
Repositories: ${repos.map(r => r.repositoryFullName).join(', ')}
`);

    const userPrompt = `Analyze the following repositories for potential cross-repository conflicts:

${repos.map((r) => `- ${r.repositoryFullName} (branch: ${r.branch}, base: ${r.baseBranch})`).join('\n')}

Look for:
1. API breaking changes that would affect dependent repos
2. Version mismatches in shared dependencies
3. Incompatible schema changes
4. Potential merge conflicts in shared code

Respond with JSON:
{
  "conflicts": [
    {
      "type": "api_breaking",
      "severity": "high",
      "affectedRepos": ["repo-a", "repo-b"],
      "description": "API endpoint changed",
      "details": { "apiEndpoints": ["/api/users"] }
    }
  ]
}`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.3, maxTokens: 1500 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{')
        ? content
        : content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;

      const analysis = JSON.parse(jsonStr);

      return analysis.conflicts.map(
        (
          c: {
            type: CrossRepoConflict['type'];
            severity: CrossRepoConflict['severity'];
            affectedRepos: string[];
            description: string;
            details: CrossRepoConflict['details'];
          },
          index: number
        ) => ({
          id: `conflict_${Date.now()}_${index}`,
          type: c.type,
          severity: c.severity,
          affectedRepos: c.affectedRepos,
          description: c.description,
          details: c.details || {},
          status: 'open' as const,
          createdAt: new Date(),
        })
      );
    } catch {
      logger.warn('Failed to detect conflicts with LLM');
      return [];
    }
  }

  private async analyzeChangeSet(
    input: MultiRepoOrchestrationInput
  ): Promise<MultiRepoOrchestrationResult> {
    if (!input.changeSetId) {
      return {
        operation: 'analyze',
        success: false,
        error: 'Change set ID required',
      };
    }

    const changeSet = this.changeSets.get(input.changeSetId);
    if (!changeSet) {
      return {
        operation: 'analyze',
        success: false,
        error: 'Change set not found',
      };
    }

    // Re-analyze dependencies and conflicts
    const dependencyGraph = await this.analyzeDependencies(changeSet.repositories);
    const conflicts = await this.detectConflicts(changeSet.repositories);

    changeSet.dependencyGraph = dependencyGraph;
    changeSet.mergeOrder = dependencyGraph.topologicalOrder;
    changeSet.conflicts = conflicts;
    changeSet.stats = this.calculateStats(changeSet.repositories, conflicts);
    changeSet.updatedAt = new Date();

    this.changeSets.set(input.changeSetId, changeSet);

    return {
      operation: 'analyze',
      success: true,
      data: {
        changeSet,
        conflicts,
      },
    };
  }

  private async executeMerge(
    input: MultiRepoOrchestrationInput
  ): Promise<MultiRepoOrchestrationResult> {
    if (!input.changeSetId) {
      return {
        operation: 'merge',
        success: false,
        error: 'Change set ID required',
      };
    }

    const changeSet = this.changeSets.get(input.changeSetId);
    if (!changeSet) {
      return {
        operation: 'merge',
        success: false,
        error: 'Change set not found',
      };
    }

    // Check for blocking conditions
    const openConflicts = changeSet.conflicts.filter((c) => c.status === 'open');
    if (openConflicts.length > 0) {
      return {
        operation: 'merge',
        success: false,
        error: `Cannot merge: ${openConflicts.length} unresolved conflicts`,
        data: { conflicts: openConflicts },
      };
    }

    logger.info({ changeSetId: input.changeSetId }, 'Executing coordinated merge');

    changeSet.status = 'in_progress';
    const mergeResults: Array<{ repositoryId: string; merged: boolean; error?: string }> = [];

    // Merge in topological order
    for (const repoId of changeSet.mergeOrder) {
      const repo = changeSet.repositories.find((r) => r.repositoryId === repoId);
      if (!repo) continue;

      // Simulate merge (would call GitHub API in production)
      const merged = Math.random() > 0.1; // 90% success rate
      mergeResults.push({
        repositoryId: repoId,
        merged,
        error: merged ? undefined : 'Merge conflict detected',
      });

      if (merged) {
        repo.prStatus = 'merged';
        changeSet.timeline.push({
          id: `evt_${Date.now()}`,
          type: 'pr_merged',
          timestamp: new Date(),
          repository: repoId,
          details: { branch: repo.branch },
        });
      } else {
        repo.prStatus = 'blocked';
        changeSet.status = 'failed';
        break;
      }
    }

    const allMerged = mergeResults.every((r) => r.merged);
    if (allMerged) {
      changeSet.status = 'completed';
      changeSet.completedAt = new Date();
      changeSet.timeline.push({
        id: `evt_${Date.now()}`,
        type: 'completed',
        timestamp: new Date(),
        details: { mergedCount: mergeResults.length },
      });
    }

    changeSet.stats = this.calculateStats(changeSet.repositories, changeSet.conflicts);
    changeSet.updatedAt = new Date();
    this.changeSets.set(input.changeSetId, changeSet);

    return {
      operation: 'merge',
      success: allMerged,
      data: {
        changeSet,
        mergeResults,
      },
    };
  }

  private async executeRollback(
    input: MultiRepoOrchestrationInput
  ): Promise<MultiRepoOrchestrationResult> {
    if (!input.changeSetId) {
      return {
        operation: 'rollback',
        success: false,
        error: 'Change set ID required',
      };
    }

    const changeSet = this.changeSets.get(input.changeSetId);
    if (!changeSet) {
      return {
        operation: 'rollback',
        success: false,
        error: 'Change set not found',
      };
    }

    logger.info({ changeSetId: input.changeSetId }, 'Executing rollback');

    // Create rollback deployment
    const deployment: AtomicDeployment = {
      id: `deploy_${Date.now()}`,
      changeSetId: input.changeSetId,
      status: 'rolling_back',
      repositories: changeSet.repositories.map((r) => ({
        repositoryId: r.repositoryId,
        environment: 'production',
        version: r.baseBranch,
        status: 'pending',
      })),
      strategy: { type: 'all_at_once' },
      healthChecks: [],
      rollbackPlan: {
        automatic: false,
        trigger: 'manual',
        targets: changeSet.repositories.map((r) => ({
          repositoryId: r.repositoryId,
          previousVersion: r.baseBranch,
        })),
      },
      startedAt: new Date(),
    };

    // Simulate rollback in reverse order
    for (const repoId of [...changeSet.mergeOrder].reverse()) {
      const target = deployment.repositories.find((r) => r.repositoryId === repoId);
      if (target) {
        target.status = 'deployed'; // Simulated success
      }
    }

    deployment.status = 'rolled_back';
    deployment.completedAt = new Date();

    this.deployments.set(deployment.id, deployment);

    changeSet.status = 'cancelled';
    changeSet.timeline.push({
      id: `evt_${Date.now()}`,
      type: 'status_changed',
      timestamp: new Date(),
      details: { from: changeSet.status, to: 'cancelled', reason: 'rollback' },
    });
    changeSet.updatedAt = new Date();
    this.changeSets.set(input.changeSetId, changeSet);

    return {
      operation: 'rollback',
      success: true,
      data: {
        changeSet,
        deployment,
      },
    };
  }

  private async getStatus(
    input: MultiRepoOrchestrationInput
  ): Promise<MultiRepoOrchestrationResult> {
    if (!input.changeSetId) {
      return {
        operation: 'status',
        success: false,
        error: 'Change set ID required',
      };
    }

    const changeSet = this.changeSets.get(input.changeSetId);
    if (!changeSet) {
      return {
        operation: 'status',
        success: false,
        error: 'Change set not found',
      };
    }

    return {
      operation: 'status',
      success: true,
      data: {
        changeSet,
        conflicts: changeSet.conflicts,
      },
    };
  }

  private async resolveConflict(
    input: MultiRepoOrchestrationInput
  ): Promise<MultiRepoOrchestrationResult> {
    if (!input.changeSetId || !input.conflictId) {
      return {
        operation: 'resolve_conflict',
        success: false,
        error: 'Change set ID and conflict ID required',
      };
    }

    const changeSet = this.changeSets.get(input.changeSetId);
    if (!changeSet) {
      return {
        operation: 'resolve_conflict',
        success: false,
        error: 'Change set not found',
      };
    }

    const conflict = changeSet.conflicts.find((c) => c.id === input.conflictId);
    if (!conflict) {
      return {
        operation: 'resolve_conflict',
        success: false,
        error: 'Conflict not found',
      };
    }

    conflict.status = 'resolved';
    conflict.resolution = input.resolution || {
      type: 'manual',
      description: 'Manually resolved',
      steps: [],
    };
    conflict.resolvedAt = new Date();

    changeSet.timeline.push({
      id: `evt_${Date.now()}`,
      type: 'conflict_resolved',
      timestamp: new Date(),
      details: { conflictId: input.conflictId, type: conflict.type },
    });

    changeSet.stats = this.calculateStats(changeSet.repositories, changeSet.conflicts);
    changeSet.updatedAt = new Date();
    this.changeSets.set(input.changeSetId, changeSet);

    return {
      operation: 'resolve_conflict',
      success: true,
      data: {
        changeSet,
        conflicts: changeSet.conflicts,
      },
    };
  }

  private calculateStats(repos: RepoChange[], conflicts: CrossRepoConflict[]): ChangeSetStats {
    const mergedCount = repos.filter((r) => r.prStatus === 'merged').length;
    const blockedCount = repos.filter((r) => r.prStatus === 'blocked').length;
    const resolvedConflicts = conflicts.filter((c) => c.status === 'resolved').length;

    return {
      totalRepos: repos.length,
      totalPRs: repos.filter((r) => r.prNumber !== undefined).length,
      mergedPRs: mergedCount,
      pendingPRs: repos.filter((r) => r.prStatus === 'pending' || r.prStatus === 'reviewing')
        .length,
      blockedPRs: blockedCount,
      totalFiles: repos.reduce((sum, r) => sum + r.files.length, 0),
      totalAdditions: repos.reduce((sum, r) => sum + r.additions, 0),
      totalDeletions: repos.reduce((sum, r) => sum + r.deletions, 0),
      totalConflicts: conflicts.length,
      resolvedConflicts,
      avgReviewTime: 0,
    };
  }
}

export const multiRepoOrchestrationAgent = new MultiRepoOrchestrationAgent();
