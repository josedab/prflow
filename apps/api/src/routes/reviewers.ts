import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { createGitHubClient } from '@prflow/github-client';
import { loadConfigSafe } from '@prflow/config';
import { ReviewerSuggestionService } from '../services/reviewer-suggestions.js';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const config = loadConfigSafe();

const assignReviewersSchema = z.object({
  prNumber: z.number().int().positive(),
  reviewers: z.array(z.string()).min(1),
});

export async function reviewerRoutes(app: FastifyInstance) {
  // Get reviewer suggestions for a PR
  app.get<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/repositories/:owner/:repo/reviewers/:prNumber', async (request) => {
    const { owner, repo, prNumber } = request.params;

    const repository = await db.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
      include: { organization: true },
    });

    if (!repository) {
      throw new NotFoundError('Repository', `${owner}/${repo}`);
    }

    const installationId = repository.organization?.installationId;
    if (!installationId) {
      throw new ValidationError('GitHub App not installed');
    }

    const github = createGitHubClient({
      appId: config.GITHUB_APP_ID!,
      privateKey: config.GITHUB_APP_PRIVATE_KEY!,
      installationId,
    });

    // Get PR details
    const pr = await github.getPullRequest(owner, repo, parseInt(prNumber, 10));
    const files = await github.getChangedFiles(owner, repo, parseInt(prNumber, 10));
    const changedFiles = files.map(f => f.filename);

    const suggestionService = new ReviewerSuggestionService(github);
    const suggestions = await suggestionService.suggestReviewers(
      owner,
      repo,
      pr.author.login,
      changedFiles,
      pr.base.ref
    );

    return {
      prNumber: parseInt(prNumber, 10),
      author: pr.author.login,
      suggestedReviewers: suggestions,
      changedFileCount: changedFiles.length,
    };
  });

  // Assign reviewers to a PR
  app.post<{
    Params: { owner: string; repo: string };
    Body: z.infer<typeof assignReviewersSchema>;
  }>('/repositories/:owner/:repo/reviewers', async (request) => {
    const { owner, repo } = request.params;
    const { prNumber, reviewers } = assignReviewersSchema.parse(request.body);

    const repository = await db.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
      include: { organization: true },
    });

    if (!repository) {
      throw new NotFoundError('Repository', `${owner}/${repo}`);
    }

    const installationId = repository.organization?.installationId;
    if (!installationId) {
      throw new ValidationError('GitHub App not installed');
    }

    const github = createGitHubClient({
      appId: config.GITHUB_APP_ID!,
      privateKey: config.GITHUB_APP_PRIVATE_KEY!,
      installationId,
    });

    // Request reviews from GitHub
    await github.requestReviewers(owner, repo, prNumber, reviewers);

    logger.info({ owner, repo, prNumber, reviewers }, 'Reviewers assigned');

    return {
      success: true,
      prNumber,
      assignedReviewers: reviewers,
    };
  });

  // Auto-assign reviewers based on suggestions
  app.post<{
    Params: { owner: string; repo: string; prNumber: string };
    Body: { count?: number; includeRequired?: boolean };
  }>('/repositories/:owner/:repo/reviewers/:prNumber/auto-assign', async (request) => {
    const { owner, repo, prNumber } = request.params;
    const { count = 2, includeRequired = true } = request.body || {};

    const repository = await db.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
      include: { organization: true },
    });

    if (!repository) {
      throw new NotFoundError('Repository', `${owner}/${repo}`);
    }

    const installationId = repository.organization?.installationId;
    if (!installationId) {
      throw new ValidationError('GitHub App not installed');
    }

    const github = createGitHubClient({
      appId: config.GITHUB_APP_ID!,
      privateKey: config.GITHUB_APP_PRIVATE_KEY!,
      installationId,
    });

    // Get PR and suggestions
    const pr = await github.getPullRequest(owner, repo, parseInt(prNumber, 10));
    const files = await github.getChangedFiles(owner, repo, parseInt(prNumber, 10));
    const changedFiles = files.map(f => f.filename);

    const suggestionService = new ReviewerSuggestionService(github);
    const suggestions = await suggestionService.suggestReviewers(
      owner,
      repo,
      pr.author.login,
      changedFiles,
      pr.base.ref
    );

    // Select reviewers
    let selectedReviewers: string[] = [];

    // First, add required reviewers if requested
    if (includeRequired) {
      const required = suggestions.filter(s => s.required).map(s => s.login);
      selectedReviewers.push(...required);
    }

    // Then add top-scored reviewers up to count
    const remaining = suggestions
      .filter(s => !selectedReviewers.includes(s.login))
      .slice(0, count - selectedReviewers.length)
      .map(s => s.login);
    
    selectedReviewers.push(...remaining);
    selectedReviewers = selectedReviewers.slice(0, Math.max(count, selectedReviewers.length));

    if (selectedReviewers.length === 0) {
      throw new ValidationError('No suitable reviewers found');
    }

    // Assign the reviewers
    await github.requestReviewers(owner, repo, parseInt(prNumber, 10), selectedReviewers);

    logger.info({ owner, repo, prNumber, reviewers: selectedReviewers }, 'Auto-assigned reviewers');

    return {
      success: true,
      prNumber: parseInt(prNumber, 10),
      assignedReviewers: selectedReviewers,
      suggestions,
    };
  });

  // Get reviewer workload distribution
  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { days?: string };
  }>('/repositories/:owner/:repo/reviewers/workload', async (request) => {
    const { owner, repo } = request.params;
    const days = parseInt(request.query.days || '30', 10);

    const repository = await db.repository.findUnique({
      where: { fullName: `${owner}/${repo}` },
      include: { organization: true },
    });

    if (!repository) {
      throw new NotFoundError('Repository', `${owner}/${repo}`);
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    // Get workflows with review data
    const workflows = await db.pRWorkflow.findMany({
      where: {
        repositoryId: repository.id,
        createdAt: { gte: since },
      },
      include: {
        analysis: true,
      },
    });

    // Aggregate reviewer stats
    const reviewerStats: Map<string, {
      assigned: number;
      completed: number;
      averageResponseTime: number;
      files: Set<string>;
    }> = new Map();

    for (const workflow of workflows) {
      const reviewers = workflow.analysis?.suggestedReviewers as string[] | undefined;
      if (!reviewers) continue;

      for (const reviewer of reviewers) {
        if (!reviewerStats.has(reviewer)) {
          reviewerStats.set(reviewer, {
            assigned: 0,
            completed: 0,
            averageResponseTime: 0,
            files: new Set(),
          });
        }
        reviewerStats.get(reviewer)!.assigned++;
      }
    }

    const workload = Array.from(reviewerStats.entries())
      .map(([login, stats]) => ({
        login,
        assigned: stats.assigned,
        completed: stats.completed,
        averageResponseTime: stats.averageResponseTime,
        expertise: Array.from(stats.files).slice(0, 5),
      }))
      .sort((a, b) => b.assigned - a.assigned);

    return {
      repository: `${owner}/${repo}`,
      period: { days, since: since.toISOString() },
      reviewers: workload,
      totalReviews: workflows.length,
    };
  });
}
