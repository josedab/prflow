import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { requireAuth } from '../lib/auth.js';
import { NotFoundError, BadRequestError } from '../lib/errors.js';
import { getPRParticipants, getReviewSession, reviewSessions, prPresence, PresenceData, ReviewSession } from '../lib/websocket.js';
import { logger } from '../lib/logger.js';

interface PRParams {
  repositoryId: string;
  prNumber: string;
}

interface SessionParams {
  sessionId: string;
}

export async function collaborativeReviewRoutes(fastify: FastifyInstance) {
  // Get active participants for a PR
  fastify.get<{ Params: PRParams }>(
    '/repositories/:repositoryId/prs/:prNumber/presence',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: PRParams }>, reply: FastifyReply) => {
      const { repositoryId, prNumber } = request.params;
      
      const participants = getPRParticipants(repositoryId, parseInt(prNumber, 10));

      return reply.send({
        success: true,
        prNumber: parseInt(prNumber, 10),
        repositoryId,
        participantCount: participants.length,
        participants,
      });
    }
  );

  // Get all active review sessions for a repository
  fastify.get<{ Params: { repositoryId: string } }>(
    '/repositories/:repositoryId/sessions',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: { repositoryId: string } }>, reply: FastifyReply) => {
      const { repositoryId } = request.params;
      
      const sessions: ReviewSession[] = [];
      reviewSessions.forEach((session) => {
        if (session.repositoryId === repositoryId) {
          sessions.push(session);
        }
      });

      return reply.send({
        success: true,
        sessions,
      });
    }
  );

  // Get specific session details
  fastify.get<{ Params: SessionParams }>(
    '/sessions/:sessionId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      
      const session = getReviewSession(sessionId);
      
      if (!session) {
        throw new NotFoundError('Session not found');
      }

      return reply.send({
        success: true,
        session,
      });
    }
  );

  // Get all PRs with active reviewers
  fastify.get<{ Params: { repositoryId: string } }>(
    '/repositories/:repositoryId/active-reviews',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: { repositoryId: string } }>, reply: FastifyReply) => {
      const { repositoryId } = request.params;
      
      const activeReviews: Array<{
        prNumber: number;
        participantCount: number;
        participants: PresenceData[];
      }> = [];

      prPresence.forEach((presenceMap, prKey) => {
        const [repoId, prNum] = prKey.split(':');
        if (repoId === repositoryId && presenceMap.size > 0) {
          activeReviews.push({
            prNumber: parseInt(prNum, 10),
            participantCount: presenceMap.size,
            participants: Array.from(presenceMap.values()),
          });
        }
      });

      return reply.send({
        success: true,
        activeReviews,
      });
    }
  );

  // Get real-time stats
  fastify.get(
    '/collab-stats',
    { preHandler: [requireAuth] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      let totalParticipants = 0;
      let activePRs = 0;

      prPresence.forEach((presenceMap) => {
        if (presenceMap.size > 0) {
          activePRs++;
          totalParticipants += presenceMap.size;
        }
      });

      return reply.send({
        success: true,
        stats: {
          totalParticipants,
          activePRs,
          activeSessions: reviewSessions.size,
        },
      });
    }
  );

  // End a session (host only)
  fastify.delete<{ Params: SessionParams }>(
    '/sessions/:sessionId',
    { preHandler: [requireAuth] },
    async (request: FastifyRequest<{ Params: SessionParams }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      const user = request.user!;
      
      const session = getReviewSession(sessionId);
      
      if (!session) {
        throw new NotFoundError('Session not found');
      }

      if (session.hostUserId !== user?.id) {
        throw new BadRequestError('Only the host can end the session');
      }

      reviewSessions.delete(sessionId);

      logger.info({ sessionId, userId: user?.id }, 'Session ended');

      return reply.send({
        success: true,
        message: 'Session ended',
      });
    }
  );
}
