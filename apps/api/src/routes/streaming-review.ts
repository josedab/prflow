/**
 * @fileoverview Streaming Review Routes
 *
 * SSE and polling endpoints for real-time review progress.
 */

import type { FastifyInstance } from 'fastify';
import { streamingReviewService } from '../services/streaming-review.js';

export async function streamingReviewRoutes(app: FastifyInstance) {
  // Get session state
  app.get<{ Params: { workflowId: string } }>('/sessions/:workflowId', async (request, reply) => {
    const session = streamingReviewService.getSession(request.params.workflowId);
    if (!session) {
      reply.status(404);
      return { error: 'Session not found' };
    }
    return session;
  });

  // Poll for events since a given index
  app.get<{ Params: { workflowId: string }; Querystring: { since?: string } }>(
    '/sessions/:workflowId/events',
    async (request) => {
      const since = parseInt(request.query.since || '0', 10);
      const events = streamingReviewService.getEventsSince(request.params.workflowId, since);
      return { events, nextIndex: since + events.length };
    }
  );

  // SSE endpoint for real-time streaming
  app.get<{ Params: { workflowId: string } }>(
    '/sessions/:workflowId/stream',
    async (request, reply) => {
      const { workflowId } = request.params;
      const session = streamingReviewService.getSession(workflowId);
      if (!session) {
        reply.status(404);
        return { error: 'Session not found' };
      }

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send current state as initial event
      reply.raw.write(`data: ${JSON.stringify({ type: 'session_state', data: session })}\n\n`);

      const unsubscribe = streamingReviewService.subscribe(workflowId, (event) => {
        try {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          unsubscribe();
        }
      });

      request.raw.on('close', () => {
        unsubscribe();
      });
    }
  );

  // Create a new streaming session (used by orchestrator)
  app.post<{ Body: { workflowId: string; agents: string[] } }>('/sessions', async (request) => {
    const { workflowId, agents } = request.body;
    const session = streamingReviewService.createSession(workflowId, agents);
    return session;
  });

  // Emit an event (used by agents)
  app.post<{
    Body: { workflowId: string; type: string; data: Record<string, unknown>; agent?: string };
  }>('/events', async (request) => {
    const { workflowId, type, data, agent } = request.body;
    streamingReviewService.emit(workflowId, type as any, data, agent);
    return { success: true };
  });

  // Cleanup old sessions
  app.post('/cleanup', async () => {
    const cleaned = streamingReviewService.cleanup();
    return { cleaned };
  });
}
