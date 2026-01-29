import type { FastifyInstance } from 'fastify';
import type { WebSocket as WS } from 'ws';
import { z } from 'zod';
import { db } from '@prflow/db';
import { conversationSessionManager } from '../services/conversation-session.js';
import { pairReviewAgent } from '../agents/pair-reviewer.js';
import { logger } from '../lib/logger.js';
import type { StreamingChunk } from '../lib/llm-streaming.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

// Schema definitions
const createSessionSchema = z.object({
  workflowId: z.string(),
});

const sendMessageSchema = z.object({
  sessionId: z.string(),
  message: z.string().min(1).max(5000),
});

const focusCommentSchema = z.object({
  sessionId: z.string(),
  commentId: z.string(),
});

const getSessionParamsSchema = z.object({
  sessionId: z.string(),
});

const exportSessionParamsSchema = z.object({
  sessionId: z.string(),
});

interface AuthenticatedPairReviewSocket extends WS {
  userId?: string;
  userName?: string;
  sessionId?: string;
  isAlive?: boolean;
  abortController?: AbortController;
}

// Map of active WebSocket connections for pair review (reserved for future WebSocket implementation)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _pairReviewSockets = new Map<string, Set<AuthenticatedPairReviewSocket>>();

export async function pairReviewRoutes(app: FastifyInstance) {
  // ============================================
  // REST API Endpoints
  // ============================================

  /**
   * Create a new conversation session
   */
  app.post<{ Body: z.infer<typeof createSessionSchema> }>(
    '/sessions',
    async (request, reply) => {
      const { workflowId } = createSessionSchema.parse(request.body);

      // Get user from auth context (simplified for now)
      const userId = (request.headers['x-user-id'] as string) || 'anonymous';
      const userName = (request.headers['x-user-name'] as string) || 'Anonymous User';

      try {
        const session = await conversationSessionManager.createSession({
          workflowId,
          userId,
          userName,
        });

        return {
          sessionId: session.id,
          workflowId: session.workflowId,
          prNumber: session.prNumber,
          createdAt: session.createdAt,
          context: {
            prTitle: session.context.prTitle,
            riskLevel: session.context.analysisResult?.riskLevel,
            activeComments: session.context.activeComments?.length || 0,
          },
        };
      } catch (error) {
        logger.error({ error, workflowId }, 'Failed to create conversation session');
        throw new ValidationError(error instanceof Error ? error.message : 'Failed to create session');
      }
    }
  );

  /**
   * Get session details
   */
  app.get<{ Params: z.infer<typeof getSessionParamsSchema> }>(
    '/sessions/:sessionId',
    async (request) => {
      const { sessionId } = getSessionParamsSchema.parse(request.params);

      const session = await conversationSessionManager.getSession(sessionId);

      if (!session) {
        throw new NotFoundError('Session', sessionId);
      }

      return {
        sessionId: session.id,
        workflowId: session.workflowId,
        prNumber: session.prNumber,
        userId: session.userId,
        userName: session.userName,
        messageCount: session.messages.length,
        context: {
          prTitle: session.context.prTitle,
          riskLevel: session.context.analysisResult?.riskLevel,
          focusedComment: session.context.focusedComment,
        },
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
      };
    }
  );

  /**
   * Get conversation messages for a session
   */
  app.get<{ Params: z.infer<typeof getSessionParamsSchema> }>(
    '/sessions/:sessionId/messages',
    async (request) => {
      const { sessionId } = getSessionParamsSchema.parse(request.params);

      const session = await conversationSessionManager.getSession(sessionId);

      if (!session) {
        throw new NotFoundError('Session', sessionId);
      }

      return {
        sessionId: session.id,
        messages: session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
          metadata: m.metadata,
        })),
      };
    }
  );

  /**
   * Send a message (non-streaming)
   */
  app.post<{ Body: z.infer<typeof sendMessageSchema> }>(
    '/messages',
    async (request) => {
      const { sessionId, message } = sendMessageSchema.parse(request.body);

      const session = conversationSessionManager.getSession(sessionId);

      if (!session) {
        throw new NotFoundError('Session', sessionId);
      }

      const response = await conversationSessionManager.sendMessage(
        sessionId,
        message,
        (chunk) => {
          // Process chunks for potential streaming use
          if (chunk.type === 'content' && chunk.content) {
            // Content accumulated in response
          }
        }
      );

      return {
        messageId: response.id,
        content: response.content,
        timestamp: response.timestamp,
      };
    }
  );

  /**
   * Focus conversation on a specific comment
   */
  app.post<{ Body: z.infer<typeof focusCommentSchema> }>(
    '/focus',
    async (request) => {
      const { sessionId, commentId } = focusCommentSchema.parse(request.body);

      try {
        await conversationSessionManager.focusOnComment(sessionId, commentId);

        const session = await conversationSessionManager.getSession(sessionId);

        return {
          success: true,
          focusedComment: session?.context.focusedComment,
        };
      } catch (error) {
        logger.error({ error, sessionId, commentId }, 'Failed to focus on comment');
        throw new ValidationError(error instanceof Error ? error.message : 'Failed to focus on comment');
      }
    }
  );

  /**
   * End a conversation session
   */
  app.delete<{ Params: z.infer<typeof getSessionParamsSchema> }>(
    '/sessions/:sessionId',
    async (request) => {
      const { sessionId } = getSessionParamsSchema.parse(request.params);

      await conversationSessionManager.endSession(sessionId);

      return { success: true };
    }
  );

  /**
   * Export conversation history
   */
  app.get<{ Params: z.infer<typeof exportSessionParamsSchema> }>(
    '/sessions/:sessionId/export',
    async (request, reply) => {
      const { sessionId } = exportSessionParamsSchema.parse(request.params);

      const exported = await conversationSessionManager.exportConversation(sessionId);

      if (!exported) {
        throw new NotFoundError('Session', sessionId);
      }

      // Format as markdown
      const markdown = formatConversationAsMarkdown(exported);

      reply.header('Content-Type', 'text/markdown');
      reply.header('Content-Disposition', `attachment; filename="conversation-${sessionId}.md"`);

      return markdown;
    }
  );

  /**
   * Quick explain endpoint - explain a specific review comment
   */
  app.post<{
    Body: { commentId: string; question?: string };
  }>(
    '/explain',
    async (request, reply) => {
      const { commentId, question } = request.body;

      const comment = await db.reviewComment.findUnique({
        where: { id: commentId },
        include: {
          workflow: {
            include: {
              analysis: true,
            },
          },
        },
      });

      if (!comment) {
        throw new NotFoundError('Comment', commentId);
      }

      const userMessage = question || `Please explain this review comment in more detail: "${comment.message}"`;

      const result = await pairReviewAgent.execute(
        {
          prNumber: comment.workflow.prNumber,
          prTitle: comment.workflow.prTitle,
          prBody: null,
          userMessage,
          conversationHistory: [],
          focusedComment: {
            id: comment.id,
            file: comment.file,
            line: comment.line,
            message: comment.message,
            severity: comment.severity,
            code: (comment.suggestion as { originalCode?: string } | null)?.originalCode,
            suggestion: (comment.suggestion as { suggestedCode?: string } | null)?.suggestedCode,
          },
          analysisContext: comment.workflow.analysis ? {
            riskLevel: comment.workflow.analysis.riskLevel,
            prType: comment.workflow.analysis.prType,
            risks: comment.workflow.analysis.risks,
            semanticChanges: [],
          } : undefined,
        },
        { repositoryId: comment.workflow.repositoryId }
      );

      if (!result.success) {
        return reply.status(500).send({ error: result.error });
      }

      return {
        commentId,
        explanation: result.data?.response,
        suggestions: result.data?.suggestions,
        confidence: result.data?.confidenceScore,
      };
    }
  );

  // ============================================
  // WebSocket Streaming Endpoint
  // ============================================

  /**
   * Set up WebSocket handler for streaming pair review
   * This integrates with the existing WebSocket server
   */
  app.get('/ws-info', async () => {
    return {
      endpoint: '/ws',
      messageTypes: {
        pair_review_start: {
          description: 'Start a pair review session',
          payload: { sessionId: 'string', message: 'string' },
        },
        pair_review_chunk: {
          description: 'Streaming response chunk',
          payload: { type: 'content|done|error', content: 'string?' },
        },
        pair_review_abort: {
          description: 'Abort current response',
          payload: { sessionId: 'string' },
        },
      },
    };
  });
}

/**
 * Handle WebSocket messages for pair review streaming
 * Called from the main WebSocket handler
 */
export async function handlePairReviewWebSocket(
  ws: AuthenticatedPairReviewSocket,
  data: { type: string; [key: string]: unknown }
): Promise<void> {
  switch (data.type) {
    case 'pair_review_start':
      await handlePairReviewStart(ws, data as {
        type: string;
        sessionId: string;
        message: string;
      });
      break;

    case 'pair_review_abort':
      handlePairReviewAbort(ws);
      break;

    case 'pair_review_focus':
      await handlePairReviewFocus(ws, data as {
        type: string;
        sessionId: string;
        commentId: string;
      });
      break;

    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: `Unknown pair review message type: ${data.type}`,
      }));
  }
}

async function handlePairReviewStart(
  ws: AuthenticatedPairReviewSocket,
  data: { type: string; sessionId: string; message: string }
): Promise<void> {
  const session = conversationSessionManager.getSession(data.sessionId);

  if (!session) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Session not found',
    }));
    return;
  }

  ws.sessionId = data.sessionId;

  // Create abort controller for this request
  ws.abortController = new AbortController();

  // Send typing indicator
  ws.send(JSON.stringify({
    type: 'pair_review_typing',
    sessionId: data.sessionId,
    timestamp: new Date().toISOString(),
  }));

  try {
    await conversationSessionManager.sendMessage(
      data.sessionId,
      data.message,
      (chunk: StreamingChunk) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify({
            type: 'pair_review_chunk',
            sessionId: data.sessionId,
            chunk: {
              type: chunk.type,
              content: chunk.content,
              finishReason: chunk.finishReason,
              error: chunk.error,
            },
            timestamp: new Date().toISOString(),
          }));
        }
      },
      ws.abortController.signal
    );

    // Send completion message
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'pair_review_complete',
        sessionId: data.sessionId,
        timestamp: new Date().toISOString(),
      }));
    }
  } catch (error) {
    logger.error({ error, sessionId: data.sessionId }, 'Pair review streaming failed');

    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'pair_review_error',
        sessionId: data.sessionId,
        error: error instanceof Error ? error.message : 'Streaming failed',
        timestamp: new Date().toISOString(),
      }));
    }
  } finally {
    ws.abortController = undefined;
  }
}

function handlePairReviewAbort(ws: AuthenticatedPairReviewSocket): void {
  if (ws.abortController) {
    ws.abortController.abort();
    logger.info({ sessionId: ws.sessionId }, 'Pair review response aborted');
  }
}

async function handlePairReviewFocus(
  ws: AuthenticatedPairReviewSocket,
  data: { type: string; sessionId: string; commentId: string }
): Promise<void> {
  try {
    await conversationSessionManager.focusOnComment(data.sessionId, data.commentId);

    const session = await conversationSessionManager.getSession(data.sessionId);

    ws.send(JSON.stringify({
      type: 'pair_review_focused',
      sessionId: data.sessionId,
      focusedComment: session?.context.focusedComment,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    ws.send(JSON.stringify({
      type: 'error',
      message: error instanceof Error ? error.message : 'Failed to focus on comment',
    }));
  }
}

/**
 * Format conversation as markdown for export
 */
function formatConversationAsMarkdown(exported: {
  session: {
    id: string;
    workflowId: string;
    prNumber: number;
    userName: string;
    createdAt: Date;
  };
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
}): string {
  let markdown = `# PR Review Conversation\n\n`;
  markdown += `**PR #${exported.session.prNumber}**\n`;
  markdown += `**Reviewer:** ${exported.session.userName}\n`;
  markdown += `**Date:** ${exported.session.createdAt.toISOString()}\n\n`;
  markdown += `---\n\n`;

  for (const msg of exported.messages) {
    const role = msg.role === 'user' ? '👤 **You**' : '🤖 **PRFlow**';
    const time = new Date(msg.timestamp).toLocaleTimeString();

    markdown += `### ${role} (${time})\n\n`;
    markdown += `${msg.content}\n\n`;
  }

  markdown += `---\n\n`;
  markdown += `*Exported from PRFlow AI Pair Review*\n`;

  return markdown;
}
