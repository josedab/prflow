import { FastifyPluginAsync } from 'fastify';
import { aiPairProgrammingService } from '../services/ai-pair-programming.js';
import { logger } from '../lib/logger.js';

/**
 * AI Pair Programming routes
 * Real-time collaborative code review with AI assistance
 */
export const aiPairProgrammingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Start a new pair programming session
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      prNumber: number;
      personaId?: string;
      settings?: Record<string, unknown>;
    };
  }>('/api/pair-programming/sessions', async (request, reply) => {
    try {
      // In production, get user from session/auth
      const userId = (request as { userId?: string }).userId || 'anonymous';
      const userLogin = 'user';
      const displayName = 'User';

      const session = await aiPairProgrammingService.startSession({
        owner: request.body.owner,
        repo: request.body.repo,
        prNumber: request.body.prNumber,
        userId,
        userLogin,
        displayName,
        personaId: request.body.personaId,
        settings: request.body.settings as Record<string, unknown>,
      });

      return reply.send({
        success: true,
        session: {
          id: session.id,
          prNumber: session.prNumber,
          prTitle: session.prTitle,
          aiAssistant: session.aiAssistant,
          state: session.state,
          messages: session.messages,
          createdAt: session.createdAt,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to start pair programming session');
      return reply.status(500).send({
        success: false,
        error: 'Failed to start session',
      });
    }
  });

  /**
   * Get session details
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/api/pair-programming/sessions/:sessionId', async (request, reply) => {
    try {
      const session = await aiPairProgrammingService.getSession(request.params.sessionId);

      if (!session) {
        return reply.status(404).send({
          success: false,
          error: 'Session not found',
        });
      }

      return reply.send({
        success: true,
        session,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get session');
      return reply.status(500).send({
        success: false,
        error: 'Failed to get session',
      });
    }
  });

  /**
   * Send a message in the session
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: {
      content: string;
      type?: string;
      codeReferences?: Array<{
        file: string;
        startLine: number;
        endLine: number;
        snippet: string;
      }>;
      replyTo?: string;
    };
  }>('/api/pair-programming/sessions/:sessionId/messages', async (request, reply) => {
    try {
      const userId = (request as { userId?: string }).userId || 'anonymous';

      // Send human message
      const humanMessage = await aiPairProgrammingService.sendMessage({
        sessionId: request.params.sessionId,
        userId,
        content: request.body.content,
        type: request.body.type as 'chat' | 'question' | undefined,
        codeReferences: request.body.codeReferences,
        replyTo: request.body.replyTo,
      });

      // Generate AI response
      const aiMessage = await aiPairProgrammingService.generateAIResponseSync(
        request.params.sessionId
      );

      return reply.send({
        success: true,
        humanMessage,
        aiMessage,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to send message');
      return reply.status(500).send({
        success: false,
        error: 'Failed to send message',
      });
    }
  });

  /**
   * Stream AI response (Server-Sent Events)
   */
  fastify.get<{
    Params: { sessionId: string };
    Querystring: { lastMessageId?: string };
  }>('/api/pair-programming/sessions/:sessionId/stream', async (request, reply) => {
    const { sessionId } = request.params;

    // Set up SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Subscribe to session events
    const unsubscribe = aiPairProgrammingService.subscribe(sessionId, (message) => {
      reply.raw.write(`event: ${message.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(message.payload)}\n\n`);
    });

    // Send initial connection event
    reply.raw.write(`event: connected\n`);
    reply.raw.write(`data: {"sessionId": "${sessionId}"}\n\n`);

    // Handle client disconnect
    request.raw.on('close', () => {
      unsubscribe();
      reply.raw.end();
    });
  });

  /**
   * Generate AI response for pending message
   */
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/pair-programming/sessions/:sessionId/ai-response', async (request, reply) => {
    try {
      const aiMessage = await aiPairProgrammingService.generateAIResponseSync(
        request.params.sessionId
      );

      return reply.send({
        success: true,
        message: aiMessage,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to generate AI response');
      return reply.status(500).send({
        success: false,
        error: 'Failed to generate AI response',
      });
    }
  });

  /**
   * Update session focus
   */
  fastify.put<{
    Params: { sessionId: string };
    Body: {
      file?: string;
      lineRange?: { start: number; end: number };
      codeSnippet?: string;
      commentId?: string;
      topic?: string;
    };
  }>('/api/pair-programming/sessions/:sessionId/focus', async (request, reply) => {
    try {
      await aiPairProgrammingService.updateFocus(
        request.params.sessionId,
        request.body
      );

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to update focus');
      return reply.status(500).send({
        success: false,
        error: 'Failed to update focus',
      });
    }
  });

  /**
   * Add artifact to session
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: {
      type: string;
      title: string;
      content: string;
      file?: string;
      lineRange?: { start: number; end: number };
      createdBy: 'human' | 'ai';
    };
  }>('/api/pair-programming/sessions/:sessionId/artifacts', async (request, reply) => {
    try {
      const artifact = await aiPairProgrammingService.addArtifact(
        request.params.sessionId,
        {
          type: request.body.type as 'code_snippet' | 'code_suggestion',
          title: request.body.title,
          content: request.body.content,
          file: request.body.file,
          lineRange: request.body.lineRange,
          createdBy: request.body.createdBy,
          status: 'shared',
        }
      );

      return reply.send({
        success: true,
        artifact,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to add artifact');
      return reply.status(500).send({
        success: false,
        error: 'Failed to add artifact',
      });
    }
  });

  /**
   * End session and get summary
   */
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/pair-programming/sessions/:sessionId/end', async (request, reply) => {
    try {
      const summary = await aiPairProgrammingService.endSession(
        request.params.sessionId
      );

      return reply.send({
        success: true,
        summary,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to end session');
      return reply.status(500).send({
        success: false,
        error: 'Failed to end session',
      });
    }
  });

  /**
   * List user's active sessions
   */
  fastify.get('/api/pair-programming/sessions', async (request, reply) => {
    try {
      const userId = (request as { userId?: string }).userId || 'anonymous';
      const sessions = await aiPairProgrammingService.listUserSessions(userId);

      return reply.send({
        success: true,
        sessions: sessions.map(s => ({
          id: s.id,
          prNumber: s.prNumber,
          prTitle: s.prTitle,
          repository: s.repository,
          state: s.state,
          aiAssistant: s.aiAssistant,
          messagesCount: s.messages.length,
          lastActivityAt: s.lastActivityAt,
        })),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list sessions');
      return reply.status(500).send({
        success: false,
        error: 'Failed to list sessions',
      });
    }
  });

  /**
   * Get available AI personas
   */
  fastify.get('/api/pair-programming/personas', async (_request, reply) => {
    const personas = aiPairProgrammingService.getAvailablePersonas();

    return reply.send({
      success: true,
      personas,
    });
  });
};
