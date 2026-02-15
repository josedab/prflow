/**
 * @fileoverview Real-Time Collaborative Review v2 Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { collaborativeReviewV2Service } from '../services/collaborative-review-v2.js';

const createSessionSchema = z.object({
  repositoryId: z.string(),
  pullRequestNumber: z.number(),
  title: z.string(),
  hostId: z.string(),
  hostName: z.string(),
});

const threadSchema = z.object({
  filePath: z.string(),
  startLine: z.number(),
  endLine: z.number(),
  authorId: z.string(),
  authorName: z.string(),
  initialMessage: z.string(),
});

const messageSchema = z.object({
  authorId: z.string(),
  authorName: z.string(),
  content: z.string(),
  isAISuggestion: z.boolean().optional(),
});

const decisionSchema = z.object({
  threadId: z.string().optional(),
  type: z.enum(['approve', 'request_changes', 'defer', 'action_item']),
  description: z.string(),
  decidedBy: z.string(),
  assignee: z.string().optional(),
});

export async function collaborativeReviewV2Routes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof createSessionSchema> }>('/sessions', async (request) => {
    const data = createSessionSchema.parse(request.body);
    return collaborativeReviewV2Service.createSession(data);
  });

  app.get<{ Querystring: { repositoryId?: string; status?: string } }>(
    '/sessions',
    async (request) => {
      return collaborativeReviewV2Service.listSessions(
        request.query.repositoryId,
        request.query.status as any
      );
    }
  );

  app.get<{ Params: { sessionId: string } }>('/sessions/:sessionId', async (request) => {
    const session = collaborativeReviewV2Service.getSession(request.params.sessionId);
    if (!session) return { error: 'Session not found' };
    return session;
  });

  app.post<{
    Params: { sessionId: string };
    Body: { userId: string; displayName: string; role?: string };
  }>('/sessions/:sessionId/join', async (request) => {
    const p = collaborativeReviewV2Service.joinSession(
      request.params.sessionId,
      request.body.userId,
      request.body.displayName,
      (request.body.role as 'reviewer' | 'observer') || 'reviewer'
    );
    if (!p) return { error: 'Cannot join session' };
    return p;
  });

  app.post<{ Params: { sessionId: string }; Body: { userId: string } }>(
    '/sessions/:sessionId/leave',
    async (request) => {
      return {
        left: collaborativeReviewV2Service.leaveSession(
          request.params.sessionId,
          request.body.userId
        ),
      };
    }
  );

  app.post<{ Params: { sessionId: string }; Body: { userId: string } }>(
    '/sessions/:sessionId/start',
    async (request) => {
      return {
        started: collaborativeReviewV2Service.startSession(
          request.params.sessionId,
          request.body.userId
        ),
      };
    }
  );

  app.post<{ Params: { sessionId: string }; Body: z.infer<typeof threadSchema> }>(
    '/sessions/:sessionId/threads',
    async (request) => {
      const data = threadSchema.parse(request.body);
      const thread = collaborativeReviewV2Service.createThread(request.params.sessionId, data);
      if (!thread) return { error: 'Session not found' };
      return thread;
    }
  );

  app.post<{
    Params: { sessionId: string; threadId: string };
    Body: z.infer<typeof messageSchema>;
  }>('/sessions/:sessionId/threads/:threadId/messages', async (request) => {
    const data = messageSchema.parse(request.body);
    const msg = collaborativeReviewV2Service.addMessage(
      request.params.sessionId,
      request.params.threadId,
      data
    );
    if (!msg) return { error: 'Session or thread not found' };
    return msg;
  });

  app.post<{ Params: { sessionId: string; threadId: string } }>(
    '/sessions/:sessionId/threads/:threadId/resolve',
    async (request) => {
      return {
        resolved: collaborativeReviewV2Service.resolveThread(
          request.params.sessionId,
          request.params.threadId
        ),
      };
    }
  );

  app.post<{ Params: { sessionId: string }; Body: z.infer<typeof decisionSchema> }>(
    '/sessions/:sessionId/decisions',
    async (request) => {
      const data = decisionSchema.parse(request.body);
      const decision = collaborativeReviewV2Service.recordDecision(request.params.sessionId, data);
      if (!decision) return { error: 'Session not found' };
      return decision;
    }
  );

  app.post<{ Params: { sessionId: string } }>('/sessions/:sessionId/complete', async (request) => {
    const summary = collaborativeReviewV2Service.completeSession(request.params.sessionId);
    if (!summary) return { error: 'Session not found' };
    return summary;
  });

  app.get<{ Params: { sessionId: string }; Querystring: { since?: string } }>(
    '/sessions/:sessionId/events',
    async (request) => {
      const since = request.query.since ? new Date(request.query.since) : undefined;
      return collaborativeReviewV2Service.getEvents(request.params.sessionId, since);
    }
  );

  app.get('/config', async () => {
    return collaborativeReviewV2Service.getConfig();
  });

  app.put<{ Body: Partial<import('@prflow/core').CollabConfig> }>('/config', async (request) => {
    return collaborativeReviewV2Service.updateConfig(request.body);
  });
}
