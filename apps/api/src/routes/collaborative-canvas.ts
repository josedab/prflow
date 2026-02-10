import { FastifyPluginAsync } from 'fastify';
import { collaborativeCanvasService } from '../services/collaborative-canvas.js';
import { logger } from '../lib/logger.js';

/**
 * Real-Time Collaborative Review Canvas routes
 */
export const collaborativeCanvasRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Create a canvas session
   */
  fastify.post<{
    Body: {
      prNumber: number;
      repository: { owner: string; name: string };
      createdBy: string;
      files: string[];
      invitees?: string[];
    };
  }>('/sessions', async (request, reply) => {
    try {
      const session = await collaborativeCanvasService.createSession(request.body);

      return reply.send({
        success: true,
        session,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create canvas session');
      return reply.status(500).send({
        success: false,
        error: 'Failed to create canvas session',
      });
    }
  });

  /**
   * Get a canvas session
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/sessions/:sessionId', async (request, reply) => {
    try {
      const session = await collaborativeCanvasService.getSession(request.params.sessionId);

      if (!session) {
        return reply.status(404).send({ success: false, error: 'Session not found' });
      }

      return reply.send({ success: true, session });
    } catch (error) {
      logger.error({ error }, 'Failed to get canvas session');
      return reply.status(500).send({ success: false, error: 'Failed to get canvas session' });
    }
  });

  /**
   * List sessions for a repository
   */
  fastify.get<{
    Querystring: { owner: string; repo: string; status?: string };
  }>('/sessions', async (request, reply) => {
    try {
      const sessions = await collaborativeCanvasService.listSessions(request.query);

      return reply.send({ success: true, sessions, total: sessions.length });
    } catch (error) {
      logger.error({ error }, 'Failed to list canvas sessions');
      return reply.status(500).send({ success: false, error: 'Failed to list sessions' });
    }
  });

  /**
   * Join a session
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: { login: string; displayName: string; avatarUrl?: string; role?: 'reviewer' | 'observer' };
  }>('/sessions/:sessionId/join', async (request, reply) => {
    try {
      const session = await collaborativeCanvasService.joinSession(
        request.params.sessionId,
        request.body
      );

      return reply.send({ success: true, session });
    } catch (error) {
      logger.error({ error }, 'Failed to join canvas session');
      return reply.status(500).send({ success: false, error: 'Failed to join session' });
    }
  });

  /**
   * Add an annotation
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: {
      author: string;
      file: string;
      startLine: number;
      endLine: number;
      type: 'highlight' | 'question' | 'suggestion' | 'approval' | 'concern';
      content: string;
    };
  }>('/sessions/:sessionId/annotations', async (request, reply) => {
    try {
      const annotation = await collaborativeCanvasService.addAnnotation(
        request.params.sessionId,
        request.body
      );

      return reply.send({ success: true, annotation });
    } catch (error) {
      logger.error({ error }, 'Failed to add annotation');
      return reply.status(500).send({ success: false, error: 'Failed to add annotation' });
    }
  });

  /**
   * Add a discussion thread
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: { author: string; file: string; line: number; content: string };
  }>('/sessions/:sessionId/threads', async (request, reply) => {
    try {
      const thread = await collaborativeCanvasService.addThread(
        request.params.sessionId,
        request.body
      );

      return reply.send({ success: true, thread });
    } catch (error) {
      logger.error({ error }, 'Failed to add thread');
      return reply.status(500).send({ success: false, error: 'Failed to add thread' });
    }
  });

  /**
   * Reply to a thread
   */
  fastify.post<{
    Params: { sessionId: string; threadId: string };
    Body: { author: string; content: string; type?: 'comment' | 'suggestion' | 'ai_insight' };
  }>('/sessions/:sessionId/threads/:threadId/replies', async (request, reply) => {
    try {
      const thread = await collaborativeCanvasService.replyToThread(
        request.params.sessionId,
        request.params.threadId,
        request.body
      );

      return reply.send({ success: true, thread });
    } catch (error) {
      logger.error({ error }, 'Failed to reply to thread');
      return reply.status(500).send({ success: false, error: 'Failed to reply to thread' });
    }
  });

  /**
   * Update cursor position
   */
  fastify.put<{
    Params: { sessionId: string };
    Body: { login: string; cursor: { file: string; line: number; column: number } };
  }>('/sessions/:sessionId/cursor', async (request, reply) => {
    try {
      await collaborativeCanvasService.updateCursor(
        request.params.sessionId,
        request.body.login,
        request.body.cursor
      );

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to update cursor');
      return reply.status(500).send({ success: false, error: 'Failed to update cursor' });
    }
  });

  /**
   * Generate AI summary
   */
  fastify.post<{
    Params: { sessionId: string };
  }>('/sessions/:sessionId/ai-summary', async (request, reply) => {
    try {
      const summary = await collaborativeCanvasService.generateAISummary(
        request.params.sessionId
      );

      return reply.send({ success: true, summary });
    } catch (error) {
      logger.error({ error }, 'Failed to generate AI summary');
      return reply.status(500).send({ success: false, error: 'Failed to generate AI summary' });
    }
  });

  /**
   * Conclude a session
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: {
      outcome: 'approved' | 'changes_requested' | 'needs_discussion' | 'no_consensus';
      votes: Array<{ participant: string; vote: 'approve' | 'request_changes' | 'abstain' }>;
      summary: string;
      syncToGitHub?: boolean;
    };
  }>('/sessions/:sessionId/conclude', async (request, reply) => {
    try {
      const session = await collaborativeCanvasService.concludeSession(
        request.params.sessionId,
        request.body
      );

      return reply.send({ success: true, session });
    } catch (error) {
      logger.error({ error }, 'Failed to conclude session');
      return reply.status(500).send({ success: false, error: 'Failed to conclude session' });
    }
  });
};
