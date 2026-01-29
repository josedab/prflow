import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { SessionStore } from '../lib/session-store.js';
import { streamLLM, StreamAccumulator, type StreamingChunk } from '../lib/llm-streaming.js';
import type { LLMMessage } from '../lib/llm.js';

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    commentId?: string;
    file?: string;
    line?: number;
    referencedCode?: string;
  };
}

export interface ConversationSession {
  id: string;
  workflowId: string;
  repositoryId: string;
  prNumber: number;
  userId: string;
  userName: string;
  messages: ConversationMessage[];
  context: ConversationContext;
  createdAt: Date;
  lastActivityAt: Date;
}

export interface ConversationContext {
  prTitle: string;
  prBody: string | null;
  changedFiles: string[];
  analysisResult?: {
    riskLevel: string;
    prType: string;
    risks: string[];
  };
  activeComments?: Array<{
    id: string;
    file: string;
    line: number;
    message: string;
    severity: string;
  }>;
  focusedComment?: {
    id: string;
    file: string;
    line: number;
    message: string;
    code?: string;
  };
}

// Redis-backed session store (30 minute TTL)
const sessionStore = new SessionStore<ConversationSession>('prflow:conversation', 1800);

// Session timeout: 30 minutes (configurable via SESSION_TIMEOUT_MS env var)
// const SESSION_TIMEOUT = 30 * 60 * 1000;

export class ConversationSessionManager {
  /**
   * Create a new conversation session for a PR
   */
  async createSession(params: {
    workflowId: string;
    userId: string;
    userName: string;
  }): Promise<ConversationSession> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: params.workflowId },
      include: {
        repository: true,
        analysis: true,
        reviewComments: {
          where: { status: { not: 'RESOLVED' } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!workflow) {
      throw new Error(`Workflow not found: ${params.workflowId}`);
    }

    const sessionId = `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const context: ConversationContext = {
      prTitle: workflow.prTitle,
      prBody: null,
      changedFiles: [],
      analysisResult: workflow.analysis ? {
        riskLevel: workflow.analysis.riskLevel,
        prType: workflow.analysis.prType,
        risks: workflow.analysis.risks,
      } : undefined,
      activeComments: workflow.reviewComments.map((c) => ({
        id: c.id,
        file: c.file,
        line: c.line,
        message: c.message,
        severity: c.severity,
      })),
    };

    const session: ConversationSession = {
      id: sessionId,
      workflowId: params.workflowId,
      repositoryId: workflow.repositoryId,
      prNumber: workflow.prNumber,
      userId: params.userId,
      userName: params.userName,
      messages: [],
      context,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    // Store in Redis with TTL
    await sessionStore.set(sessionId, session);

    logger.info({ sessionId, workflowId: params.workflowId }, 'Conversation session created');

    return session;
  }

  /**
   * Get an existing session
   */
  async getSession(sessionId: string): Promise<ConversationSession | null> {
    const session = await sessionStore.get(sessionId);
    
    if (session) {
      session.lastActivityAt = new Date();
      // Refresh TTL and update last activity
      await sessionStore.set(sessionId, session);
    }
    
    return session;
  }

  /**
   * Focus the conversation on a specific review comment
   */
  async focusOnComment(sessionId: string, commentId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const comment = await db.reviewComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`);
    }

    session.context.focusedComment = {
      id: comment.id,
      file: comment.file,
      line: comment.line,
      message: comment.message,
      code: (comment.suggestion as { originalCode?: string } | null)?.originalCode,
    };

    // Persist the updated session
    await sessionStore.set(sessionId, session);

    logger.info({ sessionId, commentId }, 'Conversation focused on comment');
  }

  /**
   * Add a user message and get AI response with streaming
   */
  async sendMessage(
    sessionId: string,
    userMessage: string,
    onChunk: (chunk: StreamingChunk) => void,
    abortSignal?: AbortSignal
  ): Promise<ConversationMessage> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Add user message to history
    const userMsg: ConversationMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    session.messages.push(userMsg);

    // Build conversation messages for LLM
    const llmMessages = this.buildLLMMessages(session, userMessage);

    // Stream the response
    const accumulator = new StreamAccumulator();
    
    await streamLLM(llmMessages, {
      temperature: 0.7,
      maxTokens: 2000,
      onChunk: (chunk) => {
        accumulator.handleChunk(chunk);
        onChunk(chunk);
      },
      abortSignal,
    });

    const result = accumulator.getResult();

    // Add assistant message to history
    const assistantMsg: ConversationMessage = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content: result.content,
      timestamp: new Date(),
    };
    session.messages.push(assistantMsg);

    // Keep conversation history reasonable (last 20 messages)
    if (session.messages.length > 20) {
      session.messages = session.messages.slice(-20);
    }

    // Persist updated session
    await sessionStore.set(session.id, session);

    return assistantMsg;
  }

  /**
   * Build LLM messages from session context and history
   */
  private buildLLMMessages(session: ConversationSession, currentMessage: string): LLMMessage[] {
    const systemPrompt = this.buildSystemPrompt(session);
    
    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history (last 10 messages for context window efficiency)
    const recentHistory = session.messages.slice(-10);
    for (const msg of recentHistory) {
      messages.push({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    // Add current message if not already in history
    if (recentHistory.length === 0 || recentHistory[recentHistory.length - 1].content !== currentMessage) {
      messages.push({ role: 'user', content: currentMessage });
    }

    return messages;
  }

  /**
   * Build a context-aware system prompt
   */
  private buildSystemPrompt(session: ConversationSession): string {
    const { context } = session;
    
    let prompt = `You are PRFlow's AI Pair Review Assistant, helping ${session.userName} review PR #${session.prNumber}.

## Your Role
You are a collaborative code review partner. Your job is to:
- Explain code changes and their implications
- Discuss potential issues and trade-offs
- Answer questions about the PR's impact
- Suggest improvements when asked
- Help the reviewer understand complex code

## Guidelines
- Be conversational and helpful, not preachy
- When discussing code, reference specific files and lines
- Explain the "why" behind suggestions
- Ask clarifying questions when the reviewer's intent is unclear
- Acknowledge when you're uncertain or need more context

## PR Context
**Title:** ${context.prTitle}
**Risk Level:** ${context.analysisResult?.riskLevel || 'Unknown'}
**Type:** ${context.analysisResult?.prType || 'Unknown'}
`;

    if (context.analysisResult?.risks && context.analysisResult.risks.length > 0) {
      prompt += `\n**Identified Risks:**\n${context.analysisResult.risks.map((r) => `- ${r}`).join('\n')}\n`;
    }

    if (context.activeComments && context.activeComments.length > 0) {
      prompt += `\n## Open Review Comments (${context.activeComments.length})\n`;
      for (const comment of context.activeComments.slice(0, 5)) {
        prompt += `- **${comment.file}:${comment.line}** [${comment.severity}]: ${comment.message.substring(0, 100)}...\n`;
      }
    }

    if (context.focusedComment) {
      prompt += `\n## Currently Discussing
**File:** ${context.focusedComment.file}
**Line:** ${context.focusedComment.line}
**Issue:** ${context.focusedComment.message}
`;
      if (context.focusedComment.code) {
        prompt += `**Code:**\n\`\`\`\n${context.focusedComment.code}\n\`\`\`\n`;
      }
    }

    prompt += `\n## Conversation Instructions
- Reference the PR context in your responses
- If discussing a specific comment, stay focused on that topic until the user changes it
- Format code suggestions with proper markdown
- Be concise but thorough`;

    return prompt;
  }

  /**
   * End a session explicitly
   */
  async endSession(sessionId: string): Promise<void> {
    await sessionStore.delete(sessionId);
    logger.info({ sessionId }, 'Conversation session ended');
  }

  /**
   * Get all active sessions for a user (requires scanning Redis keys)
   */
  async getUserSessions(userId: string): Promise<ConversationSession[]> {
    const sessionIds = await sessionStore.keys();
    const sessions: ConversationSession[] = [];
    
    for (const sessionId of sessionIds) {
      const session = await sessionStore.get(sessionId);
      if (session && session.userId === userId) {
        sessions.push(session);
      }
    }
    
    return sessions;
  }

  /**
   * Export conversation history for a session
   */
  async exportConversation(sessionId: string): Promise<{
    session: Omit<ConversationSession, 'context'>;
    messages: ConversationMessage[];
  } | null> {
    const session = await this.getSession(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      session: {
        id: session.id,
        workflowId: session.workflowId,
        repositoryId: session.repositoryId,
        prNumber: session.prNumber,
        userId: session.userId,
        userName: session.userName,
        messages: session.messages,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      },
      messages: session.messages,
    };
  }
}

export const conversationSessionManager = new ConversationSessionManager();
