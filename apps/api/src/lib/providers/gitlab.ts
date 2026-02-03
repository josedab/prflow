/**
 * @fileoverview GitLab Client Implementation
 * 
 * Client for interacting with GitLab API using the common provider interface.
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

interface GitLabConfig {
  baseUrl?: string;
  accessToken: string;
}

export class GitLabClient implements IGitProviderClient {
  readonly provider = 'gitlab' as const;
  private baseUrl: string;
  private accessToken: string;

  constructor(config: GitLabConfig) {
    this.baseUrl = config.baseUrl || 'https://gitlab.com/api/v4';
    this.accessToken = config.accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'PRIVATE-TOKEN': this.accessToken,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`GitLab API error: ${response.status} ${error}`);
    }

    return response.json() as Promise<T>;
  }

  private encodeProject(owner: string, repo: string): string {
    return encodeURIComponent(`${owner}/${repo}`);
  }

  private mapUser(user: any): ProviderUser {
    return {
      id: user.id,
      login: user.username,
      name: user.name,
      avatarUrl: user.avatar_url,
      profileUrl: user.web_url,
    };
  }

  async getRepository(owner: string, repo: string): Promise<ProviderRepository> {
    const project = await this.request<any>(`/projects/${this.encodeProject(owner, repo)}`);
    
    return {
      id: project.id,
      name: project.path,
      fullName: project.path_with_namespace,
      owner: project.namespace.path,
      description: project.description,
      defaultBranch: project.default_branch,
      isPrivate: project.visibility === 'private',
      cloneUrl: project.http_url_to_repo,
      webUrl: project.web_url,
      provider: 'gitlab',
    };
  }

  async listBranches(owner: string, repo: string): Promise<ProviderBranch[]> {
    const branches = await this.request<any[]>(
      `/projects/${this.encodeProject(owner, repo)}/repository/branches`
    );
    
    return branches.map((b) => ({
      name: b.name,
      sha: b.commit.id,
      protected: b.protected,
    }));
  }

  async getPullRequest(owner: string, repo: string, number: number): Promise<ProviderPullRequest> {
    const mr = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}`
    );
    
    return this.mapMergeRequest(mr, owner, repo);
  }

  async listPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'open'
  ): Promise<ProviderPullRequest[]> {
    const gitlabState = state === 'open' ? 'opened' : state === 'closed' ? 'merged' : 'all';
    const mrs = await this.request<any[]>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests?state=${gitlabState}`
    );
    
    return mrs.map((mr) => this.mapMergeRequest(mr, owner, repo));
  }

  private mapMergeRequest(mr: any, owner: string, repo: string): ProviderPullRequest {
    let state: 'open' | 'closed' | 'merged' = 'open';
    if (mr.state === 'merged') state = 'merged';
    else if (mr.state === 'closed') state = 'closed';

    return {
      id: mr.id,
      number: mr.iid,
      title: mr.title,
      body: mr.description || '',
      state,
      author: this.mapUser(mr.author),
      headBranch: mr.source_branch,
      headSha: mr.sha,
      baseBranch: mr.target_branch,
      createdAt: new Date(mr.created_at),
      updatedAt: new Date(mr.updated_at),
      mergedAt: mr.merged_at ? new Date(mr.merged_at) : undefined,
      mergedBy: mr.merged_by ? this.mapUser(mr.merged_by) : undefined,
      isDraft: mr.work_in_progress || mr.draft,
      mergeable: mr.merge_status === 'can_be_merged',
      labels: mr.labels || [],
      reviewers: (mr.reviewers || []).map(this.mapUser),
      assignees: (mr.assignees || []).map(this.mapUser),
      webUrl: mr.web_url,
      provider: 'gitlab',
    };
  }

  async getPullRequestFiles(owner: string, repo: string, number: number): Promise<ProviderFile[]> {
    const changes = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/changes`
    );
    
    return (changes.changes || []).map((c: any) => ({
      path: c.new_path,
      previousPath: c.old_path !== c.new_path ? c.old_path : undefined,
      status: c.new_file ? 'added' : c.deleted_file ? 'deleted' : c.renamed_file ? 'renamed' : 'modified',
      additions: 0,
      deletions: 0,
      patch: c.diff,
    }));
  }

  async getPullRequestCommits(owner: string, repo: string, number: number): Promise<ProviderCommit[]> {
    const commits = await this.request<any[]>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/commits`
    );
    
    return commits.map((c) => ({
      sha: c.id,
      message: c.message,
      author: {
        name: c.author_name,
        email: c.author_email,
        date: new Date(c.authored_date),
      },
      committer: {
        name: c.committer_name,
        email: c.committer_email,
        date: new Date(c.committed_date),
      },
      webUrl: c.web_url,
    }));
  }

  async createPullRequest(
    owner: string,
    repo: string,
    data: CreatePullRequestData
  ): Promise<ProviderPullRequest> {
    const mr = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests`,
      {
        method: 'POST',
        body: JSON.stringify({
          source_branch: data.head,
          target_branch: data.base,
          title: data.title,
          description: data.body,
          draft: data.draft,
        }),
      }
    );
    
    return this.mapMergeRequest(mr, owner, repo);
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
    if (data.state === 'closed') update.state_event = 'close';
    if (data.state === 'open') update.state_event = 'reopen';

    const mr = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}`,
      {
        method: 'PUT',
        body: JSON.stringify(update),
      }
    );
    
    return this.mapMergeRequest(mr, owner, repo);
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    number: number,
    options?: MergePullRequestOptions
  ): Promise<void> {
    const body: Record<string, unknown> = {};
    if (options?.method === 'squash') body.squash = true;
    if (options?.commitTitle) body.merge_commit_message = options.commitTitle;

    await this.request(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/merge`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      }
    );
  }

  async listReviews(owner: string, repo: string, number: number): Promise<ProviderReview[]> {
    const approvals = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/approvals`
    );
    
    return (approvals.approved_by || []).map((a: any) => ({
      id: a.user.id,
      reviewer: this.mapUser(a.user),
      state: 'approved' as const,
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
        `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/approve`,
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
    console.log(`Would request reviewers ${reviewers.join(', ')} on MR !${number}`);
  }

  async listComments(owner: string, repo: string, number: number): Promise<ProviderComment[]> {
    const notes = await this.request<any[]>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/notes`
    );
    
    return notes.map((n) => ({
      id: n.id,
      author: this.mapUser(n.author),
      body: n.body,
      createdAt: new Date(n.created_at),
      updatedAt: new Date(n.updated_at),
    }));
  }

  async createComment(owner: string, repo: string, number: number, body: string): Promise<ProviderComment> {
    const note = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/notes`,
      {
        method: 'POST',
        body: JSON.stringify({ body }),
      }
    );
    
    return {
      id: note.id,
      author: this.mapUser(note.author),
      body: note.body,
      createdAt: new Date(note.created_at),
      updatedAt: new Date(note.updated_at),
    };
  }

  async createLineComment(
    owner: string,
    repo: string,
    number: number,
    data: CreateLineCommentData
  ): Promise<ProviderComment> {
    const note = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/merge_requests/${number}/discussions`,
      {
        method: 'POST',
        body: JSON.stringify({
          body: data.body,
          position: {
            position_type: 'text',
            new_path: data.path,
            new_line: data.line,
          },
        }),
      }
    );
    
    return {
      id: note.id,
      author: { id: 0, login: 'self', profileUrl: '' },
      body: data.body,
      path: data.path,
      line: data.line,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async getCheckStatus(owner: string, repo: string, ref: string): Promise<ProviderCheckStatus> {
    const pipelines = await this.request<any[]>(
      `/projects/${this.encodeProject(owner, repo)}/pipelines?sha=${ref}`
    );
    
    if (pipelines.length === 0) {
      return { status: 'pending', checks: [] };
    }

    const pipeline = pipelines[0];
    const jobs = await this.request<any[]>(
      `/projects/${this.encodeProject(owner, repo)}/pipelines/${pipeline.id}/jobs`
    );

    const statusMap: Record<string, ProviderCheckStatus['status']> = {
      success: 'success',
      failed: 'failure',
      running: 'running',
      pending: 'pending',
      canceled: 'cancelled',
    };

    return {
      status: statusMap[pipeline.status] || 'pending',
      checks: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        status: statusMap[j.status] || 'pending',
        conclusion: j.status,
        webUrl: j.web_url,
        startedAt: j.started_at ? new Date(j.started_at) : undefined,
        completedAt: j.finished_at ? new Date(j.finished_at) : undefined,
      })),
    };
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string> {
    const file = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/repository/files/${encodeURIComponent(path)}` +
        (ref ? `?ref=${ref}` : '')
    );
    
    return Buffer.from(file.content, 'base64').toString('utf-8');
  }

  async compareCommits(owner: string, repo: string, base: string, head: string): Promise<ProviderFile[]> {
    const compare = await this.request<any>(
      `/projects/${this.encodeProject(owner, repo)}/repository/compare?from=${base}&to=${head}`
    );
    
    return (compare.diffs || []).map((d: any) => ({
      path: d.new_path,
      previousPath: d.old_path !== d.new_path ? d.old_path : undefined,
      status: d.new_file ? 'added' : d.deleted_file ? 'deleted' : d.renamed_file ? 'renamed' : 'modified',
      additions: 0,
      deletions: 0,
      patch: d.diff,
    }));
  }
}
