const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const TOKEN_KEY = 'prflow_token';

export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit & { skipAuth?: boolean }
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token && !options?.skipAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorData: { message?: string; code?: string; details?: unknown } = {};
    try {
      errorData = await res.json();
    } catch {
      // Response may not be JSON
    }
    throw new APIError(
      errorData.message || `API error: ${res.status}`,
      res.status,
      errorData.code,
      errorData.details
    );
  }

  // Handle empty responses
  const text = await res.text();
  if (!text) return {} as T;

  return JSON.parse(text);
}

export interface MergeQueueItem {
  id: string;
  repositoryId: string;
  prNumber: number;
  prTitle: string;
  authorLogin: string;
  headSha: string;
  baseBranch: string;
  status: 'queued' | 'checking' | 'ready' | 'merging' | 'merged' | 'failed' | 'blocked';
  position: number;
  addedAt: string;
  checksPassedAt?: string;
  mergedAt?: string;
  failureReason?: string;
  priority: number;
}

export interface MergeQueueConfig {
  enabled: boolean;
  autoMergeEnabled: boolean;
  requireApprovals: number;
  requireChecks: boolean;
  requireUpToDate: boolean;
  mergeMethod: 'merge' | 'squash' | 'rebase';
  batchSize: number;
  maxWaitTimeMinutes: number;
}

export interface MergeQueueResponse {
  repository: {
    owner: string;
    repo: string;
    fullName: string;
  };
  config: MergeQueueConfig;
  queue: MergeQueueItem[];
  stats: {
    total: number;
    queued: number;
    checking: number;
    ready: number;
    merging: number;
    blocked: number;
  };
}

export const api = {
  health: {
    check: () => fetchAPI<{ status: string; timestamp: string }>('/api/health', { skipAuth: true }),
  },
  repositories: {
    list: () => fetchAPI<Repository[]>('/api/repositories'),
    get: (owner: string, repo: string) => fetchAPI<Repository>(`/api/repositories/${owner}/${repo}`),
    updateSettings: (owner: string, repo: string, settings: Partial<RepositorySettings>) =>
      fetchAPI<Repository>(`/api/repositories/${owner}/${repo}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
  },
  workflows: {
    list: (params?: { repositoryId?: string; status?: string; page?: number; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.repositoryId) searchParams.set('repositoryId', params.repositoryId);
      if (params?.status) searchParams.set('status', params.status);
      if (params?.page) searchParams.set('page', params.page.toString());
      if (params?.limit) searchParams.set('limit', params.limit.toString());
      return fetchAPI<WorkflowListResponse>(`/api/workflows?${searchParams}`);
    },
    get: (id: string) => fetchAPI<Workflow>(`/api/workflows/${id}`),
    getComments: (id: string) => fetchAPI<WorkflowComment[]>(`/api/workflows/${id}/comments`),
    getTests: (id: string) => fetchAPI<WorkflowTest[]>(`/api/workflows/${id}/tests`),
    retry: (id: string) =>
      fetchAPI<Workflow>(`/api/workflows/${id}/retry`, { method: 'POST' }),
  },
  analytics: {
    summary: (params?: { startDate?: string; endDate?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.startDate) searchParams.set('startDate', params.startDate);
      if (params?.endDate) searchParams.set('endDate', params.endDate);
      return fetchAPI<AnalyticsSummary>(`/api/analytics/summary?${searchParams}`);
    },
    trends: (params?: { metric?: string; period?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.metric) searchParams.set('metric', params.metric);
      if (params?.period) searchParams.set('period', params.period);
      return fetchAPI<AnalyticsTrend[]>(`/api/analytics/trends?${searchParams}`);
    },
    repositories: () => fetchAPI<RepositoryAnalytics[]>('/api/analytics/repositories'),
  },
  mergeQueue: {
    get: (owner: string, repo: string) => 
      fetchAPI<MergeQueueResponse>(`/api/repositories/${owner}/${repo}/merge-queue`),
    add: (owner: string, repo: string, prNumber: number, priority?: number) =>
      fetchAPI<MergeQueueItem>(`/api/repositories/${owner}/${repo}/merge-queue`, {
        method: 'POST',
        body: JSON.stringify({ prNumber, priority: priority || 0 }),
      }),
    remove: (owner: string, repo: string, prNumber: number) =>
      fetchAPI<void>(`/api/repositories/${owner}/${repo}/merge-queue/${prNumber}`, {
        method: 'DELETE',
      }),
    getConfig: (owner: string, repo: string) =>
      fetchAPI<MergeQueueConfig>(`/api/repositories/${owner}/${repo}/merge-queue/config`),
    updateConfig: (owner: string, repo: string, config: Partial<MergeQueueConfig>) =>
      fetchAPI<MergeQueueConfig>(`/api/repositories/${owner}/${repo}/merge-queue/config`, {
        method: 'PATCH',
        body: JSON.stringify(config),
      }),
    process: (owner: string, repo: string) =>
      fetchAPI<{ processed: number }>(`/api/repositories/${owner}/${repo}/merge-queue/process`, {
        method: 'POST',
      }),
  },
  rules: {
    list: (owner: string, repo: string) => 
      fetchAPI<Rule[]>(`/api/repositories/${owner}/${repo}/rules`),
    create: (owner: string, repo: string, rule: CreateRuleInput) =>
      fetchAPI<Rule>(`/api/repositories/${owner}/${repo}/rules`, {
        method: 'POST',
        body: JSON.stringify(rule),
      }),
    update: (owner: string, repo: string, ruleId: string, rule: Partial<Rule>) =>
      fetchAPI<Rule>(`/api/repositories/${owner}/${repo}/rules/${ruleId}`, {
        method: 'PATCH',
        body: JSON.stringify(rule),
      }),
    delete: (owner: string, repo: string, ruleId: string) =>
      fetchAPI<void>(`/api/repositories/${owner}/${repo}/rules/${ruleId}`, {
        method: 'DELETE',
      }),
  },
};

// Additional type definitions

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  settings?: RepositorySettings;
  createdAt: string;
  updatedAt: string;
}

export interface RepositorySettings {
  reviewEnabled: boolean;
  testGenerationEnabled: boolean;
  docUpdatesEnabled: boolean;
  autoMergeEnabled: boolean;
  requireApprovals: number;
}

export interface Workflow {
  id: string;
  repositoryId: string;
  prNumber: number;
  prTitle: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  analysis?: WorkflowAnalysis;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowAnalysis {
  type: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  changes: {
    filesModified: number;
    linesAdded: number;
    linesRemoved: number;
  };
}

export interface WorkflowListResponse {
  data: Workflow[];
  total: number;
  page: number;
  limit: number;
}

export interface WorkflowComment {
  id: string;
  path: string;
  line: number;
  body: string;
  severity: 'info' | 'warning' | 'error';
  category: string;
  createdAt: string;
}

export interface WorkflowTest {
  id: string;
  name: string;
  code: string;
  path: string;
  status: 'pending' | 'suggested' | 'applied';
}

export interface AnalyticsSummary {
  totalPRs: number;
  avgReviewTime: number;
  issuesFound: number;
  testsGenerated: number;
  period: {
    start: string;
    end: string;
  };
}

export interface AnalyticsTrend {
  date: string;
  value: number;
  metric: string;
}

export interface RepositoryAnalytics {
  repositoryId: string;
  repositoryName: string;
  totalPRs: number;
  avgRiskLevel: number;
  avgReviewTime: number;
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled: boolean;
  priority: number;
}

export interface CreateRuleInput {
  name: string;
  description?: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled?: boolean;
  priority?: number;
}
