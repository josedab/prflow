/**
 * @fileoverview Workflow Orchestrator Service for PRFlow.
 *
 * The Orchestrator is the central coordinator for PR processing. It manages
 * the complete workflow lifecycle:
 *
 * 1. **Initialization**: Fetches PR data, creates GitHub check run
 * 2. **Analysis Phase**: Runs Analyzer Agent to classify PR and detect changes
 * 3. **Parallel Phase**: Runs Reviewer, Test Generator, and Doc agents concurrently
 * 4. **Synthesis Phase**: Consolidates all results into summary
 * 5. **Publication**: Posts comments and updates check run on GitHub
 *
 * The orchestrator handles:
 * - Agent coordination and sequencing
 * - Error handling and workflow failure recovery
 * - Status tracking and persistence
 * - GitHub API interaction
 *
 * @module services/orchestrator
 */

import { loadConfigSafe } from '@prflow/config';
import { db } from '@prflow/db';
import type {
  PRWorkflowResult,
  ReviewResult,
  TestGenerationResult,
  DocUpdateResult,
  AgentContext,
  PullRequest,
  PRDiff,
  PRAnalysis
} from '@prflow/core';
import type { PRWorkflowJobData } from '../lib/queue.js';
import { logger } from '../lib/logger.js';
import { agentFactory } from '../agents/factory.js';
import { formatSummaryComment } from './formatter.js';
import { NotFoundError, AgentError } from '../lib/errors.js';
import { workflowPersistence } from './workflow-persistence.js';
import { createGitHubInteractionService, type GitHubInteractionService } from './github-interaction.js';

const config = loadConfigSafe();

interface WorkflowContext {
  workflowId: string;
  data: PRWorkflowJobData;
  settings: {
    reviewEnabled?: boolean;
    testGenerationEnabled?: boolean;
    docUpdatesEnabled?: boolean;
    severityThreshold?: string;
  } | null;
  github: GitHubInteractionService;
  checkRunId: number;
  pr: PullRequest;
  diff: PRDiff;
  agentContext: AgentContext;
}

/**
 * Main workflow processor - orchestrates agent execution
 */
export async function processWorkflow(data: PRWorkflowJobData): Promise<PRWorkflowResult> {
  const startTime = Date.now();

  const workflow = await fetchWorkflowWithSettings(data);
  if (!workflow) {
    throw new NotFoundError('Workflow', `PR #${data.prNumber}`);
  }

  const github = createGitHubInteractionService({
    appId: config.GITHUB_APP_ID!,
    privateKey: config.GITHUB_APP_PRIVATE_KEY!,
    installationId: data.installationId,
  });

  try {
    const ctx = await initializeWorkflow(workflow, data, github);
    const analysis = await runAnalysisPhase(ctx);
    const { reviewResult, testResult, docResult } = await runParallelAgentsPhase(ctx, analysis);
    const synthesis = await runSynthesisPhase(ctx, analysis, reviewResult, testResult, docResult);
    
    await publishResults(ctx, analysis, reviewResult, testResult, docResult, synthesis);
    await workflowPersistence.markWorkflowComplete(workflow.id);

    return buildSuccessResult(workflow.id, startTime, analysis, reviewResult, testResult, docResult, synthesis);
  } catch (error) {
    logger.error({ error, workflowId: workflow.id }, 'Workflow processing failed');
    await workflowPersistence.markWorkflowFailed(workflow.id);
    return buildFailureResult(workflow.id, startTime, error as Error);
  }
}

async function fetchWorkflowWithSettings(data: PRWorkflowJobData) {
  return db.pRWorkflow.findFirst({
    where: {
      repositoryId: data.repositoryId,
      prNumber: data.prNumber,
    },
    include: {
      repository: {
        include: { settings: true },
      },
    },
  });
}

async function initializeWorkflow(
  workflow: Awaited<ReturnType<typeof fetchWorkflowWithSettings>>,
  data: PRWorkflowJobData,
  github: GitHubInteractionService
): Promise<WorkflowContext> {
  await workflowPersistence.updateWorkflowStatus(workflow!.id, 'ANALYZING', { startedAt: new Date() });

  const checkRunId = await github.createCheckRun(
    data.owner,
    data.repo,
    data.headSha,
    'Analyzing PR...',
    'PRFlow is analyzing your pull request.'
  );

  await workflowPersistence.updateWorkflowStatus(workflow!.id, 'ANALYZING', { checkRunId });

  const pr = await github.getPullRequest(data.owner, data.repo, data.prNumber);
  const diff = await github.getPullRequestDiff(data.owner, data.repo, data.prNumber);

  return {
    workflowId: workflow!.id,
    data,
    settings: workflow!.repository.settings,
    github,
    checkRunId,
    pr,
    diff,
    agentContext: {
      pr,
      diff,
      repositoryId: data.repositoryId,
      installationId: data.installationId,
    },
  };
}

async function runAnalysisPhase(ctx: WorkflowContext): Promise<PRAnalysis> {
  const analyzerAgent = agentFactory.createAnalyzer();
  const analysisResult = await analyzerAgent.execute({ pr: ctx.pr, diff: ctx.diff }, ctx.agentContext);

  if (!analysisResult.success || !analysisResult.data) {
    throw new AgentError(
      `Analysis failed: ${analysisResult.error}`,
      analyzerAgent.name,
      { prNumber: ctx.data.prNumber, owner: ctx.data.owner, repo: ctx.data.repo }
    );
  }

  await workflowPersistence.saveAnalysis(ctx.workflowId, analysisResult.data);
  return analysisResult.data;
}

async function runParallelAgentsPhase(
  ctx: WorkflowContext,
  analysis: PRAnalysis
): Promise<{
  reviewResult?: ReviewResult;
  testResult?: TestGenerationResult;
  docResult?: DocUpdateResult;
}> {
  await workflowPersistence.updateWorkflowStatus(ctx.workflowId, 'REVIEWING');

  const results: {
    reviewResult?: ReviewResult;
    testResult?: TestGenerationResult;
    docResult?: DocUpdateResult;
  } = {};

  const parallelTasks: Promise<void>[] = [];

  // Review agent
  if (ctx.settings?.reviewEnabled !== false) {
    parallelTasks.push(
      runReviewAgent(ctx, analysis).then((result) => {
        results.reviewResult = result;
      })
    );
  }

  // Test generation agent
  if (ctx.settings?.testGenerationEnabled !== false) {
    parallelTasks.push(
      runTestAgent(ctx, analysis).then((result) => {
        results.testResult = result;
      })
    );
  }

  // Documentation agent
  if (ctx.settings?.docUpdatesEnabled !== false) {
    parallelTasks.push(
      runDocAgent(ctx, analysis).then((result) => {
        results.docResult = result;
      })
    );
  }

  await Promise.all(parallelTasks);
  return results;
}

async function runReviewAgent(ctx: WorkflowContext, analysis: PRAnalysis): Promise<ReviewResult | undefined> {
  const reviewerAgent = agentFactory.createReviewer();
  const result = await reviewerAgent.execute({ pr: ctx.pr, diff: ctx.diff, analysis }, ctx.agentContext);
  
  if (result.success && result.data) {
    await workflowPersistence.saveReviewComments(ctx.workflowId, result.data);
    return result.data;
  }
  return undefined;
}

async function runTestAgent(ctx: WorkflowContext, analysis: PRAnalysis): Promise<TestGenerationResult | undefined> {
  await workflowPersistence.updateWorkflowStatus(ctx.workflowId, 'GENERATING_TESTS');
  
  const testAgent = agentFactory.createTestGenerator();
  const result = await testAgent.execute({ pr: ctx.pr, diff: ctx.diff, analysis }, ctx.agentContext);
  
  if (result.success && result.data) {
    await workflowPersistence.saveGeneratedTests(ctx.workflowId, result.data);
    return result.data;
  }
  return undefined;
}

async function runDocAgent(ctx: WorkflowContext, analysis: PRAnalysis): Promise<DocUpdateResult | undefined> {
  await workflowPersistence.updateWorkflowStatus(ctx.workflowId, 'UPDATING_DOCS');
  
  const docAgent = agentFactory.createDocumentation();
  const result = await docAgent.execute({ pr: ctx.pr, diff: ctx.diff, analysis }, ctx.agentContext);
  
  if (result.success && result.data) {
    await workflowPersistence.saveDocUpdates(ctx.workflowId, result.data);
    return result.data;
  }
  return undefined;
}

async function runSynthesisPhase(
  ctx: WorkflowContext,
  analysis: PRAnalysis,
  reviewResult?: ReviewResult,
  testResult?: TestGenerationResult,
  docResult?: DocUpdateResult
) {
  await workflowPersistence.updateWorkflowStatus(ctx.workflowId, 'SYNTHESIZING');

  const synthesisAgent = agentFactory.createSynthesis();
  const synthesisResult = await synthesisAgent.execute(
    {
      pr: ctx.pr,
      analysis,
      review: reviewResult || { comments: [], summary: { critical: 0, high: 0, medium: 0, low: 0, nitpick: 0 }, autoFixed: [] },
      tests: testResult || { tests: [], coverageImprovement: null, frameworkDetected: 'unknown' },
      docs: docResult || { updates: [] },
    },
    ctx.agentContext
  );

  if (synthesisResult.data) {
    await workflowPersistence.saveSynthesis(ctx.workflowId, synthesisResult.data);
  }

  return synthesisResult.data;
}

async function publishResults(
  ctx: WorkflowContext,
  analysis: PRAnalysis,
  reviewResult?: ReviewResult,
  testResult?: TestGenerationResult,
  docResult?: DocUpdateResult,
  synthesis?: ReturnType<typeof runSynthesisPhase> extends Promise<infer T> ? T : never
) {
  const summaryComment = formatSummaryComment({
    analysis,
    review: reviewResult,
    tests: testResult,
    docs: docResult,
    synthesis,
  });

  await ctx.github.postSummaryComment(ctx.data.owner, ctx.data.repo, ctx.data.prNumber, summaryComment);

  if (reviewResult) {
    await ctx.github.postReviewComments(
      ctx.data.owner,
      ctx.data.repo,
      ctx.data.prNumber,
      ctx.data.headSha,
      reviewResult,
      ctx.settings?.severityThreshold || 'MEDIUM'
    );
  }

  await ctx.github.completeCheckRun(
    ctx.data.owner,
    ctx.data.repo,
    ctx.checkRunId,
    ctx.github.getCheckConclusion(reviewResult),
    'PRFlow Analysis Complete',
    synthesis?.summary || 'Analysis completed.'
  );
}

function buildSuccessResult(
  workflowId: string,
  startTime: number,
  analysis: PRAnalysis,
  reviewResult?: ReviewResult,
  testResult?: TestGenerationResult,
  docResult?: DocUpdateResult,
  synthesis?: PRWorkflowResult['synthesis']
): PRWorkflowResult {
  return {
    workflowId,
    status: 'completed',
    analysis,
    review: reviewResult,
    tests: testResult,
    docs: docResult,
    synthesis,
    startedAt: new Date(startTime),
    completedAt: new Date(),
  };
}

function buildFailureResult(workflowId: string, startTime: number, error: Error): PRWorkflowResult {
  return {
    workflowId,
    status: 'failed',
    error: error.message,
    startedAt: new Date(startTime),
    completedAt: new Date(),
  };
}
