/**
 * @fileoverview Voice-Activated Review API Routes
 */

import { FastifyPluginAsync } from 'fastify';
import { VoiceReviewService } from '../services/voice-review.js';

const voiceService = new VoiceReviewService();

export const voiceReviewRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Start a voice review session
   */
  app.post<{
    Body: { user: string; owner: string; repo: string; prNumber: number };
  }>('/sessions', async (request, reply) => {
    const { user, owner, repo, prNumber } = request.body;

    try {
      const session = await voiceService.startSession(user, owner, repo, prNumber);
      return reply.status(201).send({
        success: true,
        data: session,
        message: 'Voice session started. Say a command or "help" for options.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start session';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Process voice transcription
   */
  app.post<{
    Params: { sessionId: string };
    Body: { text: string; confidence: number; alternatives?: Array<{ text: string; confidence: number }> };
  }>('/sessions/:sessionId/transcription', async (request, reply) => {
    const { sessionId } = request.params;
    const { text, confidence, alternatives } = request.body;

    try {
      const result = await voiceService.processTranscription(sessionId, {
        text,
        confidence,
        alternatives: alternatives || [],
        isFinal: true,
        durationMs: 0,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to process transcription';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get session state
   */
  app.get<{
    Params: { sessionId: string };
  }>('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;

    try {
      const session = await voiceService.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ success: false, error: 'Session not found' });
      }
      return reply.send({ success: true, data: session });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get session';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * End voice session
   */
  app.delete<{
    Params: { sessionId: string };
  }>('/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params;

    try {
      await voiceService.endSession(sessionId);
      return reply.send({ success: true, message: 'Session ended' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to end session';
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * Get available voice commands
   */
  app.get('/commands', async (request, reply) => {
    const commands = voiceService.getAvailableCommands();
    return reply.send({
      success: true,
      data: commands.map((cmd) => ({
        intent: cmd.intent,
        category: cmd.category,
        patterns: cmd.patterns,
        examples: cmd.examples,
      })),
    });
  });
};
