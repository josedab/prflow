import axios, { AxiosInstance } from 'axios';
import * as vscode from 'vscode';

export interface PreflightIssue {
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  file: string;
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  suggestion?: string;
  fix?: string;
  category: string;
  learnMoreUrl?: string;
  relatedLocations?: Array<{
    file: string;
    line: number;
    message: string;
  }>;
}

export interface PreflightResult {
  sessionId: string;
  status: 'success' | 'warning' | 'error';
  issues: PreflightIssue[];
  summary: {
    totalFiles: number;
    totalIssues: number;
    criticalCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
  };
  recommendations: string[];
  analysisTimeMs: number;
}

export class PreflightService {
  private client: AxiosInstance;
  private sessionToken: string | null = null;

  constructor(apiUrl: string) {
    this.client = axios.create({
      baseURL: apiUrl,
      timeout: 60000, // 60 second timeout for analysis
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Initialize a pre-flight session
   */
  async initSession(repositoryName: string): Promise<string> {
    try {
      const response = await this.client.post('/api/preflight/sessions', {
        repositoryId: repositoryName,
        context: {
          ide: 'vscode',
          version: vscode.version,
          extensionVersion: '0.1.0',
        },
      });

      this.sessionToken = response.data.sessionToken;
      return response.data.sessionId;
    } catch (error) {
      console.error('Failed to initialize session:', error);
      throw new Error('Failed to connect to PRFlow server');
    }
  }

  /**
   * Analyze files for potential issues
   */
  async analyze(
    repositoryName: string,
    files: Array<{ path: string; content: string }>,
    cancellationToken?: vscode.CancellationToken
  ): Promise<PreflightResult> {
    // Create axios cancel token from VS Code cancellation token
    const source = axios.CancelToken.source();
    if (cancellationToken) {
      cancellationToken.onCancellationRequested(() => {
        source.cancel('Operation cancelled by user');
      });
    }

    try {
      // Initialize session if needed
      if (!this.sessionToken) {
        await this.initSession(repositoryName);
      }

      // Submit files for analysis
      const response = await this.client.post(
        '/api/preflight/analyze',
        {
          files: files.map(f => ({
            path: f.path,
            content: f.content,
          })),
          options: {
            checkTypes: ['security', 'bugs', 'performance', 'style'],
            generateFixes: true,
          },
        },
        {
          cancelToken: source.token,
          headers: {
            'X-Session-Token': this.sessionToken,
          },
        }
      );

      return this.parseResponse(response.data);
    } catch (error) {
      if (axios.isCancel(error)) {
        throw new Error('Analysis cancelled');
      }

      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          throw new Error('Cannot connect to PRFlow server. Make sure it is running.');
        }
        if (error.response?.status === 401) {
          this.sessionToken = null;
          throw new Error('Session expired. Please try again.');
        }
        if (error.response?.data?.error) {
          throw new Error(error.response.data.error);
        }
      }

      throw new Error('Analysis failed. Check PRFlow server logs.');
    }
  }

  /**
   * Get status of an ongoing analysis
   */
  async getStatus(sessionId: string): Promise<{
    status: 'pending' | 'analyzing' | 'completed' | 'failed';
    progress?: number;
    message?: string;
  }> {
    const response = await this.client.get(`/api/preflight/sessions/${sessionId}/status`, {
      headers: {
        'X-Session-Token': this.sessionToken,
      },
    });
    return response.data;
  }

  /**
   * Apply a suggested fix
   */
  async applyFix(
    sessionId: string,
    issueId: string
  ): Promise<{
    success: boolean;
    newContent?: string;
    error?: string;
  }> {
    const response = await this.client.post(
      `/api/preflight/sessions/${sessionId}/fixes/${issueId}/apply`,
      {},
      {
        headers: {
          'X-Session-Token': this.sessionToken,
        },
      }
    );
    return response.data;
  }

  private parseResponse(data: unknown): PreflightResult {
    const apiResponse = data as {
      sessionId?: string;
      status?: string;
      issues?: Array<{
        type?: string;
        severity?: string;
        message?: string;
        file?: string;
        line?: number;
        column?: number;
        endLine?: number;
        endColumn?: number;
        suggestion?: string;
        fix?: string;
        category?: string;
      }>;
      summary?: {
        totalFiles?: number;
        totalIssues?: number;
        criticalCount?: number;
        errorCount?: number;
        warningCount?: number;
        infoCount?: number;
      };
      recommendations?: string[];
      analysisTimeMs?: number;
    };

    const issues: PreflightIssue[] = (apiResponse.issues || []).map(issue => ({
      type: issue.type || 'unknown',
      severity: this.mapSeverity(issue.severity),
      message: issue.message || 'Unknown issue',
      file: issue.file || 'unknown',
      line: issue.line || 1,
      column: issue.column,
      endLine: issue.endLine,
      endColumn: issue.endColumn,
      suggestion: issue.suggestion,
      fix: issue.fix,
      category: issue.category || 'general',
    }));

    return {
      sessionId: apiResponse.sessionId || '',
      status: this.mapStatus(apiResponse.status),
      issues,
      summary: {
        totalFiles: apiResponse.summary?.totalFiles || 0,
        totalIssues: issues.length,
        criticalCount: issues.filter(i => i.severity === 'critical').length,
        errorCount: issues.filter(i => i.severity === 'error').length,
        warningCount: issues.filter(i => i.severity === 'warning').length,
        infoCount: issues.filter(i => i.severity === 'info').length,
      },
      recommendations: apiResponse.recommendations || [],
      analysisTimeMs: apiResponse.analysisTimeMs || 0,
    };
  }

  private mapSeverity(severity?: string): 'info' | 'warning' | 'error' | 'critical' {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return 'critical';
      case 'error':
      case 'high':
        return 'error';
      case 'warning':
      case 'medium':
        return 'warning';
      default:
        return 'info';
    }
  }

  private mapStatus(status?: string): 'success' | 'warning' | 'error' {
    switch (status?.toLowerCase()) {
      case 'error':
      case 'failed':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'success';
    }
  }
}
