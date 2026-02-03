/**
 * @fileoverview Bitbucket Client Implementation
 * 
 * Client for interacting with Bitbucket API using the common provider interface.
 */

import type {
  IGitProviderClient,
  ProviderRepository,
  ProviderPullRequest,
  ProviderFile,
  ProviderCommit,
  ProviderReview,
  ProviderComment,
  ProviderBranch,
  ProviderCheckStatus,
  ProviderUser,
  CreatePullRequestData,
  UpdatePullRequestData,
  MergePullRequestOptions,
  CreateReviewData,
  CreateLineCommentData,
} from '@prflow/core';

interface BitbucketConfig {
  baseUrl?: string;
  accessToken: string;
  workspace?: string;
}

export class BitbucketClient implements IGitProviderClient {
  readonly provider = 'bitbucket' as const;
  private baseUrl: string;
  private accessToken: string;

  constructor(config: BitbucketConfig) {
    this.baseUrl = config.baseUrl || 'https://api.bitbucket.org/2.0';
    this.accessToken = config.accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bitbucket API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  private mapUser(user: any): ProviderUser {
    return {
      id: user.uuid || user.account_id,
      login: user.nickname || user.display_name,
      name: user.display_name,
      avatarUrl: user.links?.avatar?.href,
      profileUrl: user.links?.html?.href || '',
    };
  }

  async getRepository(owner: string, repo: string): Promise<ProviderRepository> {
    const repository = await this.request<any>(`/repositories/${owner}/${repo}`);
    
    return {
      id: repository.uuid,
      name: repository.slug,
      fullName: repository.full_name,
      owner: repository.owner.nickname || repository.owner.display_name,
      description: repository.description,
      defaultBranch: repository.mainbranch?.name || 'main',
      isPrivate: repository.is_private,
      cloneUrl: repository.links.clone.find((l: any) => l.name === 'https')?.href || '',
      webUrl: repository.links.html.href,
      provider: 'bitbucket',
    };
  }

  async listBranches(owner: string, repo: string): Promise<ProviderBranch[]> {
    const response = await this.request<any>(`/repositories/${owner}/${repo}/refs/branches`);
    
    return (response.values || []).map((b: any) => ({
      name: b.name,
      sha: b.target.hash,
      protected: false, // Bitbucket handles branch restrictions differently
    }));
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<ProviderPullRequest> {
    const pr = await this.request<any>(`/repositories/${owner}/${repo}/pullrequests/${number}`);
    return this.mapPullRequest(pr);
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<ProviderPullRequest[]> {
    const bbState = state === 'open' ? 'OPEN' : state === 'closed' ? 'MERGED' : '';
    const query = bbState ? `?state=${bbState}` : '';
    const response = await this.request<any>(`/repositories/${owner}/${repo}/pullrequests${query}`);
    
    return (response.values || []).map((pr: any) => this.mapPullRequest(pr));
  }

  private mapPullRequest(pr: any): ProviderPullRequest {
    let state: 'open' | 'closed' | 'merged' = 'open';
    if (pr.state === 'MERGED') state = 'merged';
    else if (pr.state === 'DECLINED' || pr.state === 'SUPERSEDED') state = 'closed';

    return {
      id: pr.id,
      number: pr.id,
      title: pr.title,
      body: pr.description || '',
      state,
      author: this.mapUser(pr.author),
      headBranch: pr.source.branch.name,
      headSha: pr.source.commit.hash,
      baseBranch: pr.destination.branch.name,
      createdAt: new Date(pr.created_on),
      updatedAt: new Date(pr.updated_on),
      mergedAt: pr.merge_commit ? new Date(pr.updated_on) : undefined,
      isDraft: false, // Bitbucket doesn't have draft PRs in the same way
      mergeable: null,
      labels: [],
      reviewers: (pr.reviewers || []).map(this.mapUser),
      assignees: [],
      webUrl: pr.links.html.href,
      provider: 'bitbucket',
    };
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<ProviderFile[]> {
    const response = await this.request<any>(
      `/repositories/${owner}/${repo}/pullrequests/${number}/diffstat`
    );
    
    return (response.values || []).map((f: any) => ({
      path: f.new?.path || f.old?.path,
      previousPath: f.old?.path !== f.new?.path ? f.old?.path : undefined,
      status: f.status === 'added' ? 'added' : f.status === 'removed' ? 'deleted' : f.status === 'renamed' ? 'renamed' : 'modified',
      additions: f.lines_added || 0,
      deletions: f.lines_removed || 0,
    }));
  }

  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<ProviderCommit[]> {
    const response = await this.request<any>(
      `/repositories/${owner}/${repo}/pullrequests/${number}/commits`
    );
    
    return (response.values || []).map((c: any) => ({
      sha: c.hash,
      message: c.message,
      author: {
        name: c.author.raw.split('<')[0].trim(),
        email: c.author.raw.match(/<(.+)>/)?.[1] || '',
        date: new Date(c.date),
      },
      committer: {
        name: c.author.raw.split('<')[0].trim(),
        email: c.author.raw.match(/<(.+)>/)?.[1] || '',
        date: new Date(c.date),
      },
      webUrl: c.links.html.href,
    }));
  }

  async createPullRequest(
    owner: string,
    repo: string,
    data: CreatePullRequestData
  ): Promise<ProviderPullRequest> {
    const pr = await this.request<any>(
      `/repositories/${owner}/${repo}/pullrequests`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          description: data.body,
          source: { branch: { name: data.head } },
          destination: { branch: { name: data.base } },
        }),
      }
    );
    
    return this.mapPullRequest(pr);
  }

  async updatePullRequest(
    owner: string,
    repo: string,
    number: number,
    data: UpdatePullRequestData
  ): Promise<ProviderPullRequest> {
    const update: Record<string, unknown> = {};
    if (data.title) update.title = data.title;
    if (data.body) update.description = data.body;

    const pr = await this.request<any>(
      `/repositories/${owner}/${repo}/pullrequests/${number}`,
      {
        method: 'PUT',
        body: JSON.stringify(update),
      }
    );
    
    return this.mapPullRequest(pr);
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    number: number,
    options?: MergePullRequestOptions
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (options?.method === 'squash') body.merge_strategy = 'squash';
    else if (options?.method === 'rebase') body.merge_strategy = 'fast_forward';
    if (options?.commitMessage) body.message = options.commitMessage;

    await this.request(
      `/repositories/${owner}/${repo}/pullrequests/${number}/merge`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
  }

  async listReviews(owner: string, repo: string, number: number): Promise<ProviderReview[]> {
    // Bitbucket uses participants with approved status
    const pr = await this.request<any>(`/repositories/${owner}/${repo}/pullrequests/${number}`);
    
    return (pr.participants || [])
      .filter((p: any) => p.approved || p.state === 'approved')
      .map((p: any) => ({
        id: p.user.uuid,
        reviewer: this.mapUser(p.user),
        state: p.approved ? 'approved' : 'commented',
        submittedAt: new Date(),
      }));
  }

  async createReview(
    owner: string,
    repo: string,
    number: number,
    data: CreateReviewData
  ): Promise<ProviderReview> {
    if (data.event === 'APPROVE') {
      await this.request(
        `/repositories/${owner}/${repo}/pullrequests/${number}/approve`,
        { method: 'POST' }
      );
    }

    for (const comment of data.comments || []) {
      await this.createLineComment(owner, repo, number, {
        body: comment.body,
        commitSha: '',
        path: comment.path,
        line: comment.line,
      });
    }

    return {
      id: Date.now(),
      reviewer: { id: 0, login: 'self', profileUrl: '' },
      state: data.event === 'APPROVE' ? 'approved' : data.event === 'REQUEST_CHANGES' ? 'changes_requested' : 'commented',
      body: data.body,
      submittedAt: new Date(),
    };
  }

  async requestReviewers(owner: string, repo: string, number: number, reviewers: string[]): Promise<void> {
    // Bitbucket would need user UUIDs
    console.log(`Would request reviewers ${reviewers.join(', ')} on PR #${number}`);
  }

  async listComments(owner: string, repo: string, number: number): Promise<ProviderComment[]> {
    const response = await this.request<any>(
      `/repositories/${owner}/${repo}/pullrequests/${number}/comments`
    );
    
    return (response.values || []).map((c: any) => ({
      id: c.id,
      author: this.mapUser(c.user),
      body: c.content?.raw || '',
      path: c.inline?.path,
      line: c.inline?.to,
      createdAt: new Date(c.created_on),
      updatedAt: new Date(c.updated_on),
    }));
  }

  async createComment(owner: string, repo: string, number: number, body: string): Promise<ProviderComment> {
    const comment = await this.request<any>(
      `/repositories/${owner}/${repo}/pullrequests/${number}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: { raw: body } }),
      }
    );
    
    return {
      id: comment.id,
      author: this.mapUser(comment.user),
      body: comment.content?.raw || '',
      createdAt: new Date(comment.created_on),
      updatedAt: new Date(comment.updated_on),
    };
  }

  async createLineComment(
    owner: string,
    repo: string,
    number: number,
    data: CreateLineCommentData
  ): Promise<ProviderComment> {
    const comment = await this.request<any>(
      `/repositories/${owner}/${repo}/pullrequests/${number}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: { raw: data.body },
          inline: {
            path: data.path,
            to: data.line,
          },
        }),
      }
    );
    
    return {
      id: comment.id,
      author: { id: 0, login: 'self', profileUrl: '' },
      body: data.body,
      path: data.path,
      line: data.line,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getCheckStatus(owner: string, repo: string, ref: string): Promise<ProviderCheckStatus> {
    const response = await this.request<any>(
      `/repositories/${owner}/${repo}/commit/${ref}/statuses`
    );

    const statusMap: Record<string, ProviderCheckStatus['status']> = {
      SUCCESSFUL: 'success',
      FAILED: 'failure',
      INPROGRESS: 'running',
      STOPPED: 'cancelled',
    };

    const checks = (response.values || []).map((s: any) => ({
      id: s.uuid || s.key,
      name: s.name || s.key,
      status: statusMap[s.state] || 'pending',
      conclusion: s.state,
      webUrl: s.url,
      startedAt: s.created_on ? new Date(s.created_on) : undefined,
      completedAt: s.updated_on ? new Date(s.updated_on) : undefined,
    }));

    const hasFailure = checks.some((c: any) => c.status === 'failure');
    const hasRunning = checks.some((c: any) => c.status === 'running');
    const allSuccess = checks.every((c: any) => c.status === 'success');

    let overallStatus: ProviderCheckStatus['status'] = 'pending';
    if (hasFailure) overallStatus = 'failure';
    else if (hasRunning) overallStatus = 'running';
    else if (allSuccess && checks.length > 0) overallStatus = 'success';

    return { status: overallStatus, checks };
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const endpoint = ref
      ? `/repositories/${owner}/${repo}/src/${ref}/${path}`
      : `/repositories/${owner}/${repo}/src/HEAD/${path}`;
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get file content: ${response.status}`);
    }

    return response.text();
  }

  async compareCommits(owner: string, repo: string, base: string, head: string): Promise<ProviderFile[]> {
    const response = await this.request<any>(
      `/repositories/${owner}/${repo}/diffstat/${base}..${head}`
    );
    
    return (response.values || []).map((f: any) => ({
      path: f.new?.path || f.old?.path,
      previousPath: f.old?.path !== f.new?.path ? f.old?.path : undefined,
      status: f.status === 'added' ? 'added' : f.status === 'removed' ? 'deleted' : 'modified',
      additions: f.lines_added || 0,
      deletions: f.lines_removed || 0,
    }));
  }
}
