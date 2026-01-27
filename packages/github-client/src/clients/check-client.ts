import type { Octokit } from '@octokit/rest';

export interface CreateCheckRunParams {
  owner: string;
  repo: string;
  name: string;
  headSha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required';
  title?: string;
  summary?: string;
  text?: string;
  detailsUrl?: string;
}

/**
 * Client module for check and status operations.
 * Handles check runs, combined status, and CI/CD integrations.
 */
export class CheckClient {
  constructor(private octokit: Octokit) {}

  async createCheckRun(params: CreateCheckRunParams): Promise<number> {
    const { data } = await this.octokit.checks.create({
      owner: params.owner,
      repo: params.repo,
      name: params.name,
      head_sha: params.headSha,
      status: params.status,
      conclusion: params.conclusion,
      details_url: params.detailsUrl,
      output: params.title
        ? {
            title: params.title,
            summary: params.summary || '',
            text: params.text,
          }
        : undefined,
    });

    return data.id;
  }

  async updateCheckRun(
    owner: string,
    repo: string,
    checkRunId: number,
    params: Partial<CreateCheckRunParams>
  ): Promise<void> {
    await this.octokit.checks.update({
      owner,
      repo,
      check_run_id: checkRunId,
      status: params.status,
      conclusion: params.conclusion,
      details_url: params.detailsUrl,
      output: params.title
        ? {
            title: params.title,
            summary: params.summary || '',
            text: params.text,
          }
        : undefined,
    });
  }

  async getCombinedStatus(owner: string, repo: string, ref: string): Promise<{
    state: 'success' | 'failure' | 'pending';
    statuses: Array<{
      context: string;
      state: 'success' | 'failure' | 'pending' | 'error';
      description: string | null;
    }>;
  }> {
    const { data } = await this.octokit.repos.getCombinedStatusForRef({
      owner,
      repo,
      ref,
    });

    return {
      state: data.state as 'success' | 'failure' | 'pending',
      statuses: data.statuses.map((s) => ({
        context: s.context,
        state: s.state as 'success' | 'failure' | 'pending' | 'error',
        description: s.description,
      })),
    };
  }

  async getCheckRuns(owner: string, repo: string, ref: string): Promise<{
    conclusion: 'success' | 'failure' | 'neutral' | 'pending' | null;
    checkRuns: Array<{
      name: string;
      status: 'queued' | 'in_progress' | 'completed';
      conclusion: string | null;
    }>;
  }> {
    const { data } = await this.octokit.checks.listForRef({
      owner,
      repo,
      ref,
    });

    const completedRuns = data.check_runs.filter((r) => r.status === 'completed');
    const hasFailure = completedRuns.some((r) => r.conclusion === 'failure');
    const allSuccess = completedRuns.every((r) => r.conclusion === 'success' || r.conclusion === 'skipped');
    const hasPending = data.check_runs.some((r) => r.status !== 'completed');

    let conclusion: 'success' | 'failure' | 'neutral' | 'pending' | null;
    if (hasFailure) {
      conclusion = 'failure';
    } else if (hasPending) {
      conclusion = 'pending';
    } else if (allSuccess) {
      conclusion = 'success';
    } else {
      conclusion = 'neutral';
    }

    return {
      conclusion,
      checkRuns: data.check_runs.map((r) => ({
        name: r.name,
        status: r.status as 'queued' | 'in_progress' | 'completed',
        conclusion: r.conclusion,
      })),
    };
  }
}
