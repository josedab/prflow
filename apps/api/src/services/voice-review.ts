/**
 * @fileoverview Voice-Activated Review Service
 * 
 * Service for processing voice commands during code review.
 */

import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

import type {
  VoiceCommand,
  VoiceIntent,
  VoiceSession,
  VoiceFeedback,
  VoicePattern,
  TranscriptionResult,
  PendingVoiceComment,
} from '@prflow/core';

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * Get raw octokit for operations not exposed by the client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOctokit(github: GitHubClient): any {
  return (github as unknown as { octokit: unknown }).octokit;
}

interface GitHubFile {
  filename: string;
}

/**
 * Voice patterns for command recognition
 */
const VOICE_PATTERNS: VoicePattern[] = [
  // Navigation
  {
    intent: 'goto_file',
    patterns: ['go to file', 'open file', 'show file', 'navigate to'],
    parameters: [{ name: 'filename', type: 'file', required: true }],
    examples: ['go to file app.ts', 'open file package.json'],
    category: 'navigation',
  },
  {
    intent: 'goto_line',
    patterns: ['go to line', 'jump to line', 'line number'],
    parameters: [{ name: 'line', type: 'number', required: true }],
    examples: ['go to line 42', 'jump to line 100'],
    category: 'navigation',
  },
  {
    intent: 'next_file',
    patterns: ['next file', 'next', 'continue'],
    parameters: [],
    examples: ['next file', 'next'],
    category: 'navigation',
  },
  {
    intent: 'previous_file',
    patterns: ['previous file', 'back', 'go back'],
    parameters: [],
    examples: ['previous file', 'back'],
    category: 'navigation',
  },
  {
    intent: 'next_change',
    patterns: ['next change', 'next diff', 'next hunk'],
    parameters: [],
    examples: ['next change'],
    category: 'navigation',
  },
  {
    intent: 'scroll_up',
    patterns: ['scroll up', 'page up', 'up'],
    parameters: [{ name: 'lines', type: 'number', required: false }],
    examples: ['scroll up', 'scroll up 10 lines'],
    category: 'navigation',
  },
  {
    intent: 'scroll_down',
    patterns: ['scroll down', 'page down', 'down'],
    parameters: [{ name: 'lines', type: 'number', required: false }],
    examples: ['scroll down', 'scroll down 20 lines'],
    category: 'navigation',
  },
  // Review
  {
    intent: 'approve',
    patterns: ['approve', 'looks good', 'lgtm', 'ship it', 'approved'],
    parameters: [],
    examples: ['approve', 'looks good to me'],
    category: 'review',
  },
  {
    intent: 'request_changes',
    patterns: ['request changes', 'needs work', 'changes needed'],
    parameters: [],
    examples: ['request changes'],
    category: 'review',
  },
  {
    intent: 'add_comment',
    patterns: ['add comment', 'comment', 'note'],
    parameters: [{ name: 'body', type: 'string', required: true }],
    examples: ['add comment this could be simplified'],
    category: 'review',
  },
  {
    intent: 'add_suggestion',
    patterns: ['suggest', 'suggestion', 'recommend'],
    parameters: [{ name: 'body', type: 'string', required: true }],
    examples: ['suggest using a map instead of a loop'],
    category: 'review',
  },
  {
    intent: 'highlight_issue',
    patterns: ['issue', 'problem', 'bug', 'concern'],
    parameters: [{ name: 'description', type: 'string', required: true }],
    examples: ['issue potential null pointer here'],
    category: 'review',
  },
  // Query
  {
    intent: 'explain_code',
    patterns: ['explain', 'what does this do', 'explain this', 'what is'],
    parameters: [],
    examples: ['explain this function', 'what does this do'],
    category: 'query',
  },
  {
    intent: 'find_usage',
    patterns: ['find usage', 'where is this used', 'references'],
    parameters: [{ name: 'symbol', type: 'string', required: false }],
    examples: ['find usage of this function'],
    category: 'query',
  },
  {
    intent: 'show_history',
    patterns: ['show history', 'git history', 'blame'],
    parameters: [],
    examples: ['show history', 'git blame'],
    category: 'query',
  },
  {
    intent: 'summarize_changes',
    patterns: ['summarize', 'summary', 'overview'],
    parameters: [],
    examples: ['summarize changes', 'give me an overview'],
    category: 'query',
  },
  // Control
  {
    intent: 'help',
    patterns: ['help', 'commands', 'what can I say'],
    parameters: [],
    examples: ['help', 'what commands are available'],
    category: 'system',
  },
  {
    intent: 'undo',
    patterns: ['undo', 'cancel that', 'nevermind'],
    parameters: [],
    examples: ['undo', 'cancel that'],
    category: 'control',
  },
  {
    intent: 'pause',
    patterns: ['pause', 'stop listening', 'mute'],
    parameters: [],
    examples: ['pause', 'stop listening'],
    category: 'control',
  },
  {
    intent: 'resume',
    patterns: ['resume', 'start listening', 'unmute'],
    parameters: [],
    examples: ['resume', 'start listening'],
    category: 'control',
  },
];

export class VoiceReviewService {
  private sessions = new Map<string, VoiceSession>();

  /**
   * Start a voice review session
   */
  async startSession(
    user: string,
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<VoiceSession> {
    const sessionId = crypto.randomUUID();

    // Get repository for installationId
    const repoFullName = `${owner}/${repo}`;
    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });
    
    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }
    
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);

    // Get PR files to set initial file
    const { data: files } = await getOctokit(github).pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const session: VoiceSession = {
      id: sessionId,
      user,
      pullRequest: { owner, repo, number: prNumber },
      state: 'idle',
      currentFile: (files as GitHubFile[])[0]?.filename,
      currentLine: 1,
      commandHistory: [],
      pendingComments: [],
      startedAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    // Store in DB
    await dbAny.voiceSession.create({
      data: {
        id: sessionId,
        user,
        owner,
        repo,
        prNumber,
        state: 'idle',
        currentFile: session.currentFile,
        currentLine: session.currentLine,
        commandHistory: [],
        pendingComments: [],
        startedAt: session.startedAt,
        lastActivityAt: session.lastActivityAt,
      },
    });

    return session;
  }

  /**
   * Process a voice transcription
   */
  async processTranscription(
    sessionId: string,
    transcription: TranscriptionResult
  ): Promise<{ command: VoiceCommand; feedback: VoiceFeedback }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Parse the command
    const command = this.parseCommand(transcription.text);

    // Add to history
    session.commandHistory.push(command);
    session.lastActivityAt = new Date();

    // Execute the command
    const feedback = await this.executeCommand(session, command);

    // Update session in DB
    await dbAny.voiceSession.update({
      where: { id: sessionId },
      data: {
        state: session.state,
        currentFile: session.currentFile,
        currentLine: session.currentLine,
        commandHistory: session.commandHistory as any,
        pendingComments: session.pendingComments as any,
        lastActivityAt: session.lastActivityAt,
      },
    });

    return { command, feedback };
  }

  /**
   * Parse voice transcription into command
   */
  private parseCommand(text: string): VoiceCommand {
    const normalizedText = text.toLowerCase().trim();

    // Find matching pattern
    let bestMatch: { pattern: VoicePattern; confidence: number } | null = null;

    for (const pattern of VOICE_PATTERNS) {
      for (const p of pattern.patterns) {
        if (normalizedText.includes(p)) {
          const confidence = p.length / normalizedText.length;
          if (!bestMatch || confidence > bestMatch.confidence) {
            bestMatch = { pattern, confidence };
          }
        }
      }
    }

    if (!bestMatch) {
      return {
        transcription: text,
        intent: 'unknown',
        confidence: 0,
        parameters: {},
        timestamp: new Date(),
      };
    }

    // Extract parameters
    const parameters = this.extractParameters(normalizedText, bestMatch.pattern);

    return {
      transcription: text,
      intent: bestMatch.pattern.intent,
      confidence: bestMatch.confidence,
      parameters,
      timestamp: new Date(),
    };
  }

  /**
   * Extract parameters from transcription
   */
  private extractParameters(text: string, pattern: VoicePattern): Record<string, any> {
    const params: Record<string, any> = {};

    for (const param of pattern.parameters) {
      if (param.type === 'number') {
        const match = text.match(/\d+/);
        if (match) {
          params[param.name] = parseInt(match[0], 10);
        }
      } else if (param.type === 'file') {
        // Extract filename (word ending in common extensions or following "file")
        const fileMatch = text.match(/(?:file\s+)?(\S+\.(ts|js|tsx|jsx|py|go|rs|java|json|md|yml|yaml))/i);
        if (fileMatch) {
          params[param.name] = fileMatch[1];
        } else {
          // Try to get word after "file"
          const afterFile = text.match(/file\s+(\S+)/i);
          if (afterFile) {
            params[param.name] = afterFile[1];
          }
        }
      } else {
        // String - extract everything after the command patterns
        for (const p of pattern.patterns) {
          if (text.includes(p)) {
            const remaining = text.substring(text.indexOf(p) + p.length).trim();
            if (remaining) {
              params[param.name] = remaining;
            }
            break;
          }
        }
      }
    }

    return params;
  }

  /**
   * Execute a voice command
   */
  private async executeCommand(session: VoiceSession, command: VoiceCommand): Promise<VoiceFeedback> {
    switch (command.intent) {
      case 'goto_file':
        return this.handleGotoFile(session, command.parameters.filename);

      case 'goto_line':
        return this.handleGotoLine(session, command.parameters.line);

      case 'next_file':
        return this.handleNextFile(session);

      case 'previous_file':
        return this.handlePreviousFile(session);

      case 'approve':
        return this.handleApprove(session);

      case 'request_changes':
        return this.handleRequestChanges(session);

      case 'add_comment':
        return this.handleAddComment(session, command.parameters.body);

      case 'explain_code':
        return this.handleExplainCode(session);

      case 'summarize_changes':
        return this.handleSummarize(session);

      case 'help':
        return this.handleHelp();

      case 'undo':
        return this.handleUndo(session);

      case 'pause':
        session.state = 'paused';
        return {
          speech: 'Voice control paused. Say resume to continue.',
          display: '⏸️ Voice control paused',
          action: 'paused',
          requiresConfirmation: false,
        };

      case 'resume':
        session.state = 'listening';
        return {
          speech: 'Voice control resumed.',
          display: '▶️ Voice control resumed',
          action: 'resumed',
          requiresConfirmation: false,
        };

      case 'unknown':
      default:
        return {
          speech: `I didn't understand "${command.transcription}". Say help for available commands.`,
          display: `❓ Unknown command: "${command.transcription}"`,
          requiresConfirmation: false,
        };
    }
  }

  private async handleGotoFile(session: VoiceSession, filename: string): Promise<VoiceFeedback> {
    if (!filename) {
      return {
        speech: 'Which file would you like to open?',
        display: 'Which file?',
        requiresConfirmation: false,
      };
    }

    session.currentFile = filename;
    session.currentLine = 1;

    return {
      speech: `Opening file ${filename}`,
      display: `📂 Opened ${filename}`,
      action: 'file_changed',
      requiresConfirmation: false,
    };
  }

  private async handleGotoLine(session: VoiceSession, line: number): Promise<VoiceFeedback> {
    if (!line || line < 1) {
      return {
        speech: 'Which line number?',
        display: 'Which line?',
        requiresConfirmation: false,
      };
    }

    session.currentLine = line;

    return {
      speech: `Jumping to line ${line}`,
      display: `📍 Line ${line}`,
      action: 'line_changed',
      requiresConfirmation: false,
    };
  }

  private async handleNextFile(session: VoiceSession): Promise<VoiceFeedback> {
    // In a real implementation, this would track file list
    return {
      speech: 'Moving to next file',
      display: '⏭️ Next file',
      action: 'next_file',
      requiresConfirmation: false,
    };
  }

  private async handlePreviousFile(session: VoiceSession): Promise<VoiceFeedback> {
    return {
      speech: 'Going back to previous file',
      display: '⏮️ Previous file',
      action: 'previous_file',
      requiresConfirmation: false,
    };
  }

  private async handleApprove(session: VoiceSession): Promise<VoiceFeedback> {
    session.state = 'waiting_for_confirmation';

    return {
      speech: 'Approve this pull request? Say yes to confirm or no to cancel.',
      display: '✅ Approve PR? (confirm: yes/no)',
      action: 'pending_approval',
      requiresConfirmation: true,
      options: ['yes', 'no'],
    };
  }

  private async handleRequestChanges(session: VoiceSession): Promise<VoiceFeedback> {
    session.state = 'waiting_for_confirmation';

    return {
      speech: 'Request changes on this pull request? Say yes to confirm.',
      display: '❌ Request changes? (confirm: yes/no)',
      action: 'pending_request_changes',
      requiresConfirmation: true,
      options: ['yes', 'no'],
    };
  }

  private async handleAddComment(session: VoiceSession, body: string): Promise<VoiceFeedback> {
    if (!body) {
      session.state = 'dictating_comment';
      return {
        speech: 'What would you like to comment?',
        display: '💬 Dictate your comment...',
        requiresConfirmation: false,
      };
    }

    const comment: PendingVoiceComment = {
      id: crypto.randomUUID(),
      file: session.currentFile || '',
      line: session.currentLine || 1,
      body,
      isSuggestion: false,
      createdAt: new Date(),
    };

    session.pendingComments.push(comment);

    return {
      speech: `Comment added: ${body}. Say submit to post all comments.`,
      display: `💬 Comment added on line ${comment.line}`,
      action: 'comment_added',
      requiresConfirmation: false,
    };
  }

  private async handleExplainCode(session: VoiceSession): Promise<VoiceFeedback> {
    // In a real implementation, this would call an LLM
    return {
      speech: 'Analyzing the code at your current position...',
      display: '🔍 Analyzing code...',
      action: 'explaining',
      requiresConfirmation: false,
    };
  }

  private async handleSummarize(session: VoiceSession): Promise<VoiceFeedback> {
    return {
      speech: 'Generating summary of changes...',
      display: '📋 Generating summary...',
      action: 'summarizing',
      requiresConfirmation: false,
    };
  }

  private handleHelp(): VoiceFeedback {
    const helpText = `
Available commands:
- Navigation: go to file, go to line, next file, previous file, scroll up, scroll down
- Review: approve, request changes, add comment, add suggestion
- Queries: explain code, find usage, summarize changes
- Control: pause, resume, undo, help
    `.trim();

    return {
      speech: 'You can navigate with go to file or line, review with approve or request changes, add comments, ask me to explain code, or say pause to stop listening.',
      display: helpText,
      requiresConfirmation: false,
    };
  }

  private async handleUndo(session: VoiceSession): Promise<VoiceFeedback> {
    if (session.pendingComments.length > 0) {
      const removed = session.pendingComments.pop();
      return {
        speech: 'Removed last comment',
        display: `↩️ Removed comment: "${removed?.body?.substring(0, 30)}..."`,
        action: 'undo',
        requiresConfirmation: false,
      };
    }

    return {
      speech: 'Nothing to undo',
      display: '↩️ Nothing to undo',
      requiresConfirmation: false,
    };
  }

  /**
   * End a voice session
   */
  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    await dbAny.voiceSession.update({
      where: { id: sessionId },
      data: {
        state: 'idle',
        endedAt: new Date(),
      },
    });

    this.sessions.delete(sessionId);
  }

  /**
   * Get session
   */
  async getSession(sessionId: string): Promise<VoiceSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get available voice patterns
   */
  getAvailableCommands(): VoicePattern[] {
    return VOICE_PATTERNS;
  }
}
