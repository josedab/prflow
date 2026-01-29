import { loadConfigSafe } from '@prflow/config';
import { createGitHubClient, type GitHubClient } from '@prflow/github-client';
import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { NotFoundError, ValidationError, ConflictError } from '../lib/errors.js';

const config = loadConfigSafe();

export interface ApplyFixParams {
  commentId: string;
  userId: string;
  installationId: number;
}

export interface ApplyBatchFixParams {
  commentIds: string[];
  userId: string;
  installationId: number;
  commitMessage?: string;
}

export interface FixApplicationResult {
  success: boolean;
  fixId: string;
  commitSha?: string;
  error?: string;
}

export interface BatchFixResult {
  success: boolean;
  batchId: string;
  commitSha?: string;
  appliedFixes: string[];
  failedFixes: Array<{ commentId: string; error: string }>;
}

interface FileChange {
  path: string;
  originalContent: string;
  newContent: string;
  sha: string;
}

export class FixApplicationService {
  private getGitHubClient(installationId: number): GitHubClient {
    return createGitHubClient({
      appId: config.GITHUB_APP_ID!,
      privateKey: config.GITHUB_APP_PRIVATE_KEY!,
      installationId,
    });
  }

  async applySingleFix(params: ApplyFixParams): Promise<FixApplicationResult> {
    const { commentId, userId, installationId } = params;

    // Get comment with workflow and repository
    const comment = await db.reviewComment.findUnique({
      where: { id: commentId },
      include: {
        workflow: {
          include: { repository: true },
        },
      },
    });

    if (!comment) {
      throw new NotFoundError('ReviewComment', commentId);
    }

    if (!comment.suggestion) {
      throw new ValidationError('Comment does not have a fix suggestion');
    }

    const suggestion = comment.suggestion as { originalCode: string; suggestedCode: string; language: string };
    const workflow = comment.workflow;
    const repo = workflow.repository;

    // Create fix application record
    const fixApplication = await db.fixApplication.create({
      data: {
        commentId,
        repositoryId: repo.id,
        prNumber: workflow.prNumber,
        headBranch: workflow.headBranch,
        file: comment.file,
        originalCode: suggestion.originalCode,
        suggestedCode: suggestion.suggestedCode,
        status: 'APPLYING',
        appliedBy: userId,
      },
    });

    try {
      const github = this.getGitHubClient(installationId);
      const [owner, repoName] = repo.fullName.split('/');

      // Get current file content
      const currentContent = await github.getFileContent(owner, repoName, comment.file, workflow.headBranch);
      const fileSha = await github.getFileSha(owner, repoName, comment.file, workflow.headBranch);

      if (!fileSha) {
        throw new NotFoundError('File', comment.file);
      }

      // Apply the fix
      const newContent = this.applyFixToContent(currentContent, suggestion.originalCode, suggestion.suggestedCode, comment.line);

      if (newContent === currentContent) {
        throw new ConflictError('Fix could not be applied - code may have changed');
      }

      // Create commit
      const commitMessage = this.generateCommitMessage(comment.category, comment.file, comment.message);
      const result = await github.createOrUpdateFileContent(
        owner,
        repoName,
        comment.file,
        newContent,
        commitMessage,
        workflow.headBranch,
        fileSha
      );

      // Update fix application record
      await db.fixApplication.update({
        where: { id: fixApplication.id },
        data: {
          status: 'APPLIED',
          commitSha: result.commitSha,
          commitMessage,
          appliedAt: new Date(),
        },
      });

      // Update comment status
      await db.reviewComment.update({
        where: { id: commentId },
        data: { status: 'FIX_APPLIED' },
      });

      logger.info({ fixId: fixApplication.id, commitSha: result.commitSha }, 'Fix applied successfully');

      return {
        success: true,
        fixId: fixApplication.id,
        commitSha: result.commitSha,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      await db.fixApplication.update({
        where: { id: fixApplication.id },
        data: {
          status: errorMessage.includes('conflict') ? 'CONFLICTED' : 'FAILED',
          errorMessage,
        },
      });

      logger.error({ error, fixId: fixApplication.id }, 'Fix application failed');

      return {
        success: false,
        fixId: fixApplication.id,
        error: errorMessage,
      };
    }
  }

  async applyBatchFix(params: ApplyBatchFixParams): Promise<BatchFixResult> {
    const { commentIds, userId, installationId, commitMessage: customMessage } = params;

    if (commentIds.length === 0) {
      throw new ValidationError('No comments provided for batch fix');
    }

    // Get all comments with their workflows
    const comments = await db.reviewComment.findMany({
      where: { id: { in: commentIds } },
      include: {
        workflow: {
          include: { repository: true },
        },
      },
    });

    if (comments.length === 0) {
      throw new NotFoundError('ReviewComments', commentIds.join(', '));
    }

    // Validate all comments are from the same PR
    const workflows = new Set(comments.map((c) => c.workflowId));
    if (workflows.size > 1) {
      throw new ValidationError('All comments must be from the same pull request');
    }

    // Filter comments with suggestions
    const fixableComments = comments.filter((c) => c.suggestion);
    if (fixableComments.length === 0) {
      throw new ValidationError('No comments have fix suggestions');
    }

    const workflow = fixableComments[0].workflow;
    const repo = workflow.repository;
    const [owner, repoName] = repo.fullName.split('/');

    // Create batch fix record
    const batchFix = await db.batchFixApplication.create({
      data: {
        repositoryId: repo.id,
        prNumber: workflow.prNumber,
        headBranch: workflow.headBranch,
        fixIds: commentIds,
        status: 'APPLYING',
        appliedBy: userId,
      },
    });

    const appliedFixes: string[] = [];
    const failedFixes: Array<{ commentId: string; error: string }> = [];

    try {
      const github = this.getGitHubClient(installationId);

      // Group fixes by file for efficient processing
      const fixesByFile = this.groupFixesByFile(fixableComments);

      // Get current branch SHA
      const refData = await github.getRef(owner, repoName, `heads/${workflow.headBranch}`);
      const currentSha = refData.object.sha;

      // Prepare all file changes
      const fileChanges: FileChange[] = [];

      for (const [filePath, fixes] of Object.entries(fixesByFile)) {
        try {
          const currentContent = await github.getFileContent(owner, repoName, filePath, workflow.headBranch);
          const fileSha = await github.getFileSha(owner, repoName, filePath, workflow.headBranch);

          if (!fileSha) {
            fixes.forEach((f) => failedFixes.push({ commentId: f.id, error: 'File not found' }));
            continue;
          }

          // Sort fixes by line number in descending order to apply from bottom to top
          const sortedFixes = fixes.sort((a, b) => b.line - a.line);

          let newContent = currentContent;
          for (const fix of sortedFixes) {
            const suggestion = fix.suggestion as { originalCode: string; suggestedCode: string };
            const applied = this.applyFixToContent(newContent, suggestion.originalCode, suggestion.suggestedCode, fix.line);

            if (applied !== newContent) {
              newContent = applied;
              appliedFixes.push(fix.id);
            } else {
              failedFixes.push({ commentId: fix.id, error: 'Code pattern not found' });
            }
          }

          if (newContent !== currentContent) {
            fileChanges.push({
              path: filePath,
              originalContent: currentContent,
              newContent,
              sha: fileSha,
            });
          }
        } catch (error) {
          fixes.forEach((f) => failedFixes.push({ commentId: f.id, error: (error as Error).message }));
        }
      }

      if (fileChanges.length === 0) {
        throw new ConflictError('No fixes could be applied');
      }

      // Create a single commit with all changes
      const treeSha = await github.createTree(
        owner,
        repoName,
        currentSha,
        fileChanges.map((fc) => ({ path: fc.path, content: fc.newContent }))
      );

      const commitMsg = customMessage || this.generateBatchCommitMessage(appliedFixes.length, fileChanges.length);
      const commitSha = await github.createCommit(owner, repoName, commitMsg, treeSha, [currentSha]);

      // Update branch ref
      await github.updateRef(owner, repoName, `heads/${workflow.headBranch}`, commitSha);

      // Update batch fix record
      await db.batchFixApplication.update({
        where: { id: batchFix.id },
        data: {
          status: 'APPLIED',
          commitSha,
          commitMessage: commitMsg,
          appliedAt: new Date(),
        },
      });

      // Update applied comment statuses
      await db.reviewComment.updateMany({
        where: { id: { in: appliedFixes } },
        data: { status: 'FIX_APPLIED' },
      });

      logger.info({ batchId: batchFix.id, commitSha, appliedCount: appliedFixes.length }, 'Batch fix applied');

      return {
        success: true,
        batchId: batchFix.id,
        commitSha,
        appliedFixes,
        failedFixes,
      };
    } catch (error) {
      const errorMessage = (error as Error).message;

      await db.batchFixApplication.update({
        where: { id: batchFix.id },
        data: {
          status: 'FAILED',
          errorMessage,
        },
      });

      logger.error({ error, batchId: batchFix.id }, 'Batch fix failed');

      return {
        success: false,
        batchId: batchFix.id,
        appliedFixes,
        failedFixes: [...failedFixes, ...commentIds.filter((id) => !appliedFixes.includes(id) && !failedFixes.some((f) => f.commentId === id)).map((id) => ({ commentId: id, error: errorMessage }))],
      };
    }
  }

  async previewFix(commentId: string, installationId: number): Promise<{
    file: string;
    originalCode: string;
    suggestedCode: string;
    previewDiff: string;
    canApply: boolean;
    reason?: string;
  }> {
    const comment = await db.reviewComment.findUnique({
      where: { id: commentId },
      include: {
        workflow: {
          include: { repository: true },
        },
      },
    });

    if (!comment) {
      throw new NotFoundError('ReviewComment', commentId);
    }

    if (!comment.suggestion) {
      throw new ValidationError('Comment does not have a fix suggestion');
    }

    const suggestion = comment.suggestion as { originalCode: string; suggestedCode: string; language: string };
    const workflow = comment.workflow;
    const repo = workflow.repository;
    const [owner, repoName] = repo.fullName.split('/');

    const github = this.getGitHubClient(installationId);

    try {
      const currentContent = await github.getFileContent(owner, repoName, comment.file, workflow.headBranch);
      const newContent = this.applyFixToContent(currentContent, suggestion.originalCode, suggestion.suggestedCode, comment.line);

      const canApply = newContent !== currentContent;
      const previewDiff = this.generateDiff(currentContent, newContent, comment.file);

      return {
        file: comment.file,
        originalCode: suggestion.originalCode,
        suggestedCode: suggestion.suggestedCode,
        previewDiff,
        canApply,
        reason: canApply ? undefined : 'Code pattern not found in file - it may have changed',
      };
    } catch (error) {
      return {
        file: comment.file,
        originalCode: suggestion.originalCode,
        suggestedCode: suggestion.suggestedCode,
        previewDiff: '',
        canApply: false,
        reason: (error as Error).message,
      };
    }
  }

  async revertFix(fixId: string, userId: string, installationId: number): Promise<{ success: boolean; commitSha?: string; error?: string }> {
    const fix = await db.fixApplication.findUnique({
      where: { id: fixId },
    });

    if (!fix) {
      throw new NotFoundError('FixApplication', fixId);
    }

    if (fix.status !== 'APPLIED') {
      throw new ValidationError('Can only revert applied fixes');
    }

    const repo = await db.repository.findUnique({
      where: { id: fix.repositoryId },
    });

    if (!repo) {
      throw new NotFoundError('Repository', fix.repositoryId);
    }

    const [owner, repoName] = repo.fullName.split('/');
    const github = this.getGitHubClient(installationId);

    try {
      const currentContent = await github.getFileContent(owner, repoName, fix.file, fix.headBranch);
      const fileSha = await github.getFileSha(owner, repoName, fix.file, fix.headBranch);

      if (!fileSha) {
        throw new NotFoundError('File', fix.file);
      }

      // Reverse the fix
      const revertedContent = currentContent.replace(fix.suggestedCode, fix.originalCode);

      if (revertedContent === currentContent) {
        throw new ConflictError('Cannot revert - code may have changed');
      }

      const commitMessage = `Revert: ${fix.commitMessage || 'PRFlow fix'}`;
      const result = await github.createOrUpdateFileContent(
        owner,
        repoName,
        fix.file,
        revertedContent,
        commitMessage,
        fix.headBranch,
        fileSha
      );

      await db.fixApplication.update({
        where: { id: fixId },
        data: { status: 'REVERTED' },
      });

      // Reset comment status
      await db.reviewComment.update({
        where: { id: fix.commentId },
        data: { status: 'POSTED' },
      });

      logger.info({ fixId, commitSha: result.commitSha }, 'Fix reverted successfully');

      return { success: true, commitSha: result.commitSha };
    } catch (error) {
      logger.error({ error, fixId }, 'Fix revert failed');
      return { success: false, error: (error as Error).message };
    }
  }

  private applyFixToContent(content: string, originalCode: string, suggestedCode: string, targetLine: number): string {
    const lines = content.split('\n');
    const originalLines = originalCode.trim().split('\n');
    const originalFirstLine = originalLines[0].trim();

    // Find the best match near the target line
    let bestMatchIndex = -1;
    let minDistance = Infinity;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().includes(originalFirstLine) || lines[i].includes(originalFirstLine)) {
        const distance = Math.abs(i + 1 - targetLine);
        if (distance < minDistance) {
          minDistance = distance;
          bestMatchIndex = i;
        }
      }
    }

    // If no match found, try exact replacement
    if (bestMatchIndex === -1) {
      if (content.includes(originalCode)) {
        return content.replace(originalCode, suggestedCode);
      }
      return content;
    }

    // Try to match the full original code starting from bestMatchIndex
    const startIndex = bestMatchIndex;
    const endIndex = startIndex + originalLines.length;

    if (endIndex <= lines.length) {
      const matchedSection = lines.slice(startIndex, endIndex).join('\n');
      const normalizedMatched = matchedSection.replace(/\s+/g, ' ').trim();
      const normalizedOriginal = originalCode.replace(/\s+/g, ' ').trim();

      if (normalizedMatched === normalizedOriginal || matchedSection.includes(originalCode.trim())) {
        const newLines = [...lines.slice(0, startIndex), suggestedCode, ...lines.slice(endIndex)];
        return newLines.join('\n');
      }
    }

    // Fallback: simple replacement
    return content.replace(originalCode, suggestedCode);
  }

  private groupFixesByFile(comments: Array<{
    id: string;
    file: string;
    line: number;
    suggestion: unknown;
  }>): Record<string, typeof comments> {
    const grouped: Record<string, typeof comments> = {};

    for (const comment of comments) {
      if (!grouped[comment.file]) {
        grouped[comment.file] = [];
      }
      grouped[comment.file].push(comment);
    }

    return grouped;
  }

  private generateCommitMessage(category: string, file: string, message: string): string {
    const categoryEmoji: Record<string, string> = {
      SECURITY: '🔒',
      BUG: '🐛',
      PERFORMANCE: '⚡',
      ERROR_HANDLING: '🛡️',
      STYLE: '💅',
      MAINTAINABILITY: '🔧',
    };

    const emoji = categoryEmoji[category] || '✨';
    const shortFile = file.split('/').pop() || file;
    const shortMessage = message.length > 50 ? message.substring(0, 47) + '...' : message;

    return `${emoji} fix(${shortFile}): ${shortMessage}\n\nApplied by PRFlow`;
  }

  private generateBatchCommitMessage(fixCount: number, fileCount: number): string {
    return `✨ Apply ${fixCount} PRFlow fixes across ${fileCount} file${fileCount > 1 ? 's' : ''}\n\nBatch fix applied by PRFlow`;
  }

  private generateDiff(oldContent: string, newContent: string, filename: string): string {
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    const diff = `--- a/${filename}\n+++ b/${filename}\n`;

    // Simple diff generation (in production, use a proper diff library)
    const maxLen = Math.max(oldLines.length, newLines.length);
    let lastDiffLine = -1;
    const diffChunks: string[] = [];
    let currentChunk: string[] = [];
    let chunkStartOld = 0;
    let chunkStartNew = 0;

    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        if (currentChunk.length === 0) {
          chunkStartOld = i;
          chunkStartNew = i;
        }
        if (oldLines[i] !== undefined) {
          currentChunk.push(`-${oldLine}`);
        }
        if (newLines[i] !== undefined) {
          currentChunk.push(`+${newLine}`);
        }
        lastDiffLine = i;
      } else if (currentChunk.length > 0 && i - lastDiffLine > 3) {
        // End current chunk
        diffChunks.push(`@@ -${chunkStartOld + 1},${lastDiffLine - chunkStartOld + 1} +${chunkStartNew + 1},${lastDiffLine - chunkStartNew + 1} @@\n${currentChunk.join('\n')}`);
        currentChunk = [];
      } else if (currentChunk.length > 0) {
        currentChunk.push(` ${oldLine}`);
      }
    }

    if (currentChunk.length > 0) {
      diffChunks.push(`@@ -${chunkStartOld + 1} +${chunkStartNew + 1} @@\n${currentChunk.join('\n')}`);
    }

    return diff + diffChunks.join('\n');
  }
}

export const fixApplicationService = new FixApplicationService();
