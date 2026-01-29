import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { logger } from '../lib/logger.js';

export interface ConflictFile {
  path: string;
  content: string;
  base: string;
  ours: string;
  theirs: string;
  conflictMarkers: ConflictMarker[];
}

export interface ConflictMarker {
  startLine: number;
  endLine: number;
  oursContent: string;
  theirsContent: string;
}

export interface ConflictResolution {
  path: string;
  resolvedContent: string;
  strategy: 'ours' | 'theirs' | 'merged' | 'ai_suggested';
  confidence: number;
  explanation?: string;
}

export interface ResolutionResult {
  success: boolean;
  resolvedFiles: ConflictResolution[];
  unresolvedFiles: string[];
  commitSha?: string;
  error?: string;
}

export class ConflictResolutionService {
  
  /**
   * Analyze conflicts in a PR
   */
  async analyzeConflicts(
    workflowId: string,
    installationId: number
  ): Promise<{
    hasConflicts: boolean;
    conflictCount: number;
    files: ConflictFile[];
    canAutoResolve: boolean;
  }> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const github = this.createGitHubClient(installationId);
    const [owner, repo] = workflow.repository.fullName.split('/');

    // Check if PR has conflicts
    const pr = await github.getPullRequest(owner, repo, workflow.prNumber);
    
    if (!pr.mergeable) {
      // Get conflicted files
      const conflictFiles = await this.getConflictedFiles(
        github, owner, repo, workflow.baseBranch, workflow.headBranch
      );

      return {
        hasConflicts: true,
        conflictCount: conflictFiles.length,
        files: conflictFiles,
        canAutoResolve: this.canAutoResolve(conflictFiles),
      };
    }

    return {
      hasConflicts: false,
      conflictCount: 0,
      files: [],
      canAutoResolve: false,
    };
  }

  /**
   * Attempt to auto-resolve conflicts using AI
   */
  async resolveConflicts(
    workflowId: string,
    installationId: number,
    options: {
      preferStrategy?: 'ours' | 'theirs' | 'merge';
      excludeFiles?: string[];
    } = {}
  ): Promise<ResolutionResult> {
    const analysis = await this.analyzeConflicts(workflowId, installationId);
    
    if (!analysis.hasConflicts) {
      return {
        success: true,
        resolvedFiles: [],
        unresolvedFiles: [],
      };
    }

    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const github = this.createGitHubClient(installationId);
    const [owner, repo] = workflow.repository.fullName.split('/');

    const resolvedFiles: ConflictResolution[] = [];
    const unresolvedFiles: string[] = [];

    for (const file of analysis.files) {
      if (options.excludeFiles?.includes(file.path)) {
        unresolvedFiles.push(file.path);
        continue;
      }

      try {
        const resolution = await this.resolveFileConflict(file, options.preferStrategy);
        
        if (resolution.confidence >= 0.7) {
          resolvedFiles.push(resolution);
        } else {
          unresolvedFiles.push(file.path);
        }
      } catch (error) {
        logger.error({ file: file.path, error }, 'Failed to resolve conflict');
        unresolvedFiles.push(file.path);
      }
    }

    // Apply resolutions if any
    if (resolvedFiles.length > 0) {
      try {
        const commitSha = await this.applyResolutions(
          github, owner, repo, workflow.headBranch, resolvedFiles
        );
        
        return {
          success: unresolvedFiles.length === 0,
          resolvedFiles,
          unresolvedFiles,
          commitSha,
        };
      } catch (error) {
        return {
          success: false,
          resolvedFiles: [],
          unresolvedFiles: analysis.files.map(f => f.path),
          error: (error as Error).message,
        };
      }
    }

    return {
      success: false,
      resolvedFiles,
      unresolvedFiles,
    };
  }

  /**
   * Get suggested resolution for a specific conflict
   */
  async getSuggestedResolution(
    conflictFile: ConflictFile
  ): Promise<ConflictResolution> {
    return this.resolveFileConflict(conflictFile);
  }

  // Private helper methods

  private createGitHubClient(installationId: number): GitHubClient {
    return new GitHubClient({
      appId: process.env.GITHUB_APP_ID || '',
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
      installationId,
    });
  }

  private async getConflictedFiles(
    github: GitHubClient,
    owner: string,
    repo: string,
    baseBranch: string,
    headBranch: string
  ): Promise<ConflictFile[]> {
    const conflicts: ConflictFile[] = [];

    try {
      // Get merge base and perform a simulated merge to find conflicts
      // In production, this would use git merge-tree or GitHub's merge API
      await github.compareBranches(owner, repo, baseBranch, headBranch);
      
      // For now, return empty - actual implementation would parse merge conflicts
      return conflicts;
    } catch (error) {
      logger.error({ error }, 'Failed to get conflicted files');
      return conflicts;
    }
  }

  private canAutoResolve(files: ConflictFile[]): boolean {
    // Simple heuristics for auto-resolution
    for (const file of files) {
      // Can't auto-resolve binary files
      if (this.isBinaryFile(file.path)) return false;
      
      // Can't auto-resolve if too many conflicts
      if (file.conflictMarkers.length > 10) return false;
    }
    return true;
  }

  private async resolveFileConflict(
    file: ConflictFile,
    preferStrategy?: 'ours' | 'theirs' | 'merge'
  ): Promise<ConflictResolution> {
    // Simple conflict resolution logic
    // In production, this would use LLM for intelligent merging

    let resolvedContent = file.content;
    let confidence = 0.5;
    let strategy: ConflictResolution['strategy'] = 'merged';
    let explanation = '';

    for (const marker of file.conflictMarkers) {
      const oursLines = marker.oursContent.split('\n');
      const theirsLines = marker.theirsContent.split('\n');

      // Simple resolution strategies
      if (preferStrategy === 'ours') {
        resolvedContent = this.replaceConflictSection(
          resolvedContent, marker, marker.oursContent
        );
        strategy = 'ours';
        confidence = 0.9;
      } else if (preferStrategy === 'theirs') {
        resolvedContent = this.replaceConflictSection(
          resolvedContent, marker, marker.theirsContent
        );
        strategy = 'theirs';
        confidence = 0.9;
      } else {
        // Try to intelligently merge
        const merged = this.attemptIntelligentMerge(oursLines, theirsLines);
        if (merged.success) {
          resolvedContent = this.replaceConflictSection(
            resolvedContent, marker, merged.content
          );
          confidence = merged.confidence;
          strategy = 'ai_suggested';
          explanation = merged.explanation;
        } else {
          // Fall back to keeping both with clear separation
          const combined = `// FROM: ours\n${marker.oursContent}\n// FROM: theirs\n${marker.theirsContent}`;
          resolvedContent = this.replaceConflictSection(
            resolvedContent, marker, combined
          );
          confidence = 0.3;
          strategy = 'merged';
          explanation = 'Manual review recommended';
        }
      }
    }

    return {
      path: file.path,
      resolvedContent,
      strategy,
      confidence,
      explanation,
    };
  }

  private attemptIntelligentMerge(
    oursLines: string[],
    theirsLines: string[]
  ): { success: boolean; content: string; confidence: number; explanation: string } {
    // Check if one is subset of other (addition only)
    if (oursLines.length === 0) {
      return {
        success: true,
        content: theirsLines.join('\n'),
        confidence: 0.95,
        explanation: 'Accepted new additions from incoming branch',
      };
    }
    if (theirsLines.length === 0) {
      return {
        success: true,
        content: oursLines.join('\n'),
        confidence: 0.95,
        explanation: 'Kept existing content',
      };
    }

    // Check for non-overlapping additions (common in import statements)
    const allLines = [...new Set([...oursLines, ...theirsLines])];
    if (allLines.length === oursLines.length + theirsLines.length) {
      return {
        success: true,
        content: allLines.sort().join('\n'),
        confidence: 0.8,
        explanation: 'Combined non-overlapping changes',
      };
    }

    return {
      success: false,
      content: '',
      confidence: 0,
      explanation: 'Could not automatically merge',
    };
  }

  private replaceConflictSection(
    content: string,
    marker: ConflictMarker,
    replacement: string
  ): string {
    const lines = content.split('\n');
    const before = lines.slice(0, marker.startLine - 1);
    const after = lines.slice(marker.endLine);
    return [...before, replacement, ...after].join('\n');
  }

  private async applyResolutions(
    github: GitHubClient,
    owner: string,
    repo: string,
    branch: string,
    resolutions: ConflictResolution[]
  ): Promise<string> {
    const refData = await github.getRef(owner, repo, `heads/${branch}`);
    const currentSha = refData.object.sha;

    const treeItems = resolutions.map(r => ({
      path: r.path,
      content: r.resolvedContent,
    }));

    const treeSha = await github.createTree(owner, repo, currentSha, treeItems);
    const commitSha = await github.createCommit(
      owner, repo,
      'chore: Resolve merge conflicts',
      treeSha,
      [currentSha]
    );
    
    await github.updateRef(owner, repo, `heads/${branch}`, commitSha);

    return commitSha;
  }

  private isBinaryFile(path: string): boolean {
    const binaryExtensions = [
      '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
      '.pdf', '.zip', '.tar', '.gz',
      '.exe', '.dll', '.so', '.dylib',
      '.woff', '.woff2', '.ttf', '.eot',
    ];
    return binaryExtensions.some(ext => path.toLowerCase().endsWith(ext));
  }
}

export const conflictResolutionService = new ConflictResolutionService();
