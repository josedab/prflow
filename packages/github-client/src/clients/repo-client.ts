import type { Octokit } from '@octokit/rest';

/**
 * Client module for repository operations.
 * Handles repository info, branches, commits, and protection settings.
 */
export class RepoClient {
  constructor(private octokit: Octokit) {}

  async getRepository(owner: string, repo: string) {
    const { data } = await this.octokit.repos.get({ owner, repo });
    return data;
  }

  async listBranches(owner: string, repo: string) {
    const { data } = await this.octokit.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });
    return data;
  }

  async listCommits(owner: string, repo: string, sha?: string, perPage = 100) {
    const { data } = await this.octokit.repos.listCommits({
      owner,
      repo,
      sha,
      per_page: perPage,
    });
    return data;
  }

  async getCommit(owner: string, repo: string, ref: string) {
    const { data } = await this.octokit.repos.getCommit({ owner, repo, ref });
    return data;
  }

  async compareBranches(owner: string, repo: string, base: string, head: string): Promise<{
    aheadBy: number;
    behindBy: number;
    status: 'ahead' | 'behind' | 'identical' | 'diverged';
  }> {
    const { data } = await this.octokit.repos.compareCommits({
      owner,
      repo,
      base,
      head,
    });

    return {
      aheadBy: data.ahead_by,
      behindBy: data.behind_by,
      status: data.status as 'ahead' | 'behind' | 'identical' | 'diverged',
    };
  }

  async getBranchProtection(owner: string, repo: string, branch: string): Promise<{
    requiredReviews: number;
    requiresStatusChecks: boolean;
    allowsForcePush: boolean;
  } | null> {
    try {
      const { data } = await this.octokit.repos.getBranchProtection({
        owner,
        repo,
        branch,
      });

      return {
        requiredReviews: data.required_pull_request_reviews?.required_approving_review_count || 0,
        requiresStatusChecks: !!data.required_status_checks,
        allowsForcePush: data.allow_force_pushes?.enabled || false,
      };
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return null;
      }
      throw error;
    }
  }
}
