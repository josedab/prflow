import { FastifyPluginAsync } from 'fastify';
import { voiceReviewInterfaceService } from '../services/voice-review-interface.js';
import { logger } from '../lib/logger.js';
import type { VoiceSessionSettings, VoiceComment, AccessibilityPreferences, CodeReadingOptions } from '@prflow/core';

/**
 * Voice-Activated Review Interface routes
 */
export const voiceReviewInterfaceRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Start a voice review session
   */
  fastify.post<{
    Body: {
      userLogin: string;
      initialContext?: {
        prOwner?: string;
        prRepo?: string;
        prNumber?: number;
      };
      settings?: Partial<VoiceSessionSettings>;
    };
  }>('/api/voice/sessions', async (request, reply) => {
    try {
      const session = await voiceReviewInterfaceService.startSession(
        request.body.userLogin,
        request.body.initialContext,
        request.body.settings
      );

      return reply.send({
        success: true,
        session,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to start voice session');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to start voice session',
      });
    }
  });

  /**
   * Get a voice session
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/api/voice/sessions/:sessionId', async (request, reply) => {
    try {
      const session = voiceReviewInterfaceService.getSession(request.params.sessionId);

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
      logger.error({ error }, 'Failed to get voice session');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get voice session',
      });
    }
  });

  /**
   * End a voice session
   */
  fastify.delete<{
    Params: { sessionId: string };
  }>('/api/voice/sessions/:sessionId', async (request, reply) => {
    try {
      await voiceReviewInterfaceService.endSession(request.params.sessionId);

      return reply.send({
        success: true,
        message: 'Session ended',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to end voice session');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to end voice session',
      });
    }
  });

  /**
   * Process a voice command
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: {
      audio?: string;
      transcription?: string;
      audioFormat?: 'wav' | 'webm' | 'ogg';
    };
  }>('/api/voice/sessions/:sessionId/command', async (request, reply) => {
    try {
      const result = await voiceReviewInterfaceService.processCommand(
        request.params.sessionId,
        {
          audio: request.body.audio,
          transcription: request.body.transcription,
          audioFormat: request.body.audioFormat,
        }
      );

      return reply.send(result);
    } catch (error) {
      logger.error({ error }, 'Failed to process voice command');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process voice command',
      });
    }
  });

  /**
   * Add a voice comment
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: {
      file: string;
      line: number;
      body: string;
      endLine?: number;
      severity?: VoiceComment['severity'];
      isSuggestion?: boolean;
      suggestedCode?: string;
    };
  }>('/api/voice/sessions/:sessionId/comments', async (request, reply) => {
    try {
      const comment = await voiceReviewInterfaceService.addVoiceComment(
        request.params.sessionId,
        request.body.file,
        request.body.line,
        request.body.body,
        {
          endLine: request.body.endLine,
          severity: request.body.severity,
          isSuggestion: request.body.isSuggestion,
          suggestedCode: request.body.suggestedCode,
        }
      );

      return reply.send({
        success: true,
        comment,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to add voice comment');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add voice comment',
      });
    }
  });

  /**
   * Submit pending comments
   */
  fastify.post<{
    Params: { sessionId: string };
  }>('/api/voice/sessions/:sessionId/comments/submit', async (request, reply) => {
    try {
      const comments = await voiceReviewInterfaceService.submitComments(
        request.params.sessionId
      );

      return reply.send({
        success: true,
        comments,
        count: comments.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to submit voice comments');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to submit voice comments',
      });
    }
  });

  /**
   * Read code aloud
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: {
      code: string;
      options?: Partial<CodeReadingOptions>;
    };
  }>('/api/voice/sessions/:sessionId/read', async (request, reply) => {
    try {
      const result = await voiceReviewInterfaceService.readCode(
        request.params.sessionId,
        request.body.code,
        request.body.options
      );

      return reply.send({
        success: true,
        audio: result.audioData,
        format: result.format,
        durationMs: result.durationMs,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to read code');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read code',
      });
    }
  });

  /**
   * Get voice usage analytics
   */
  fastify.get<{
    Params: { userId: string };
    Querystring: { periodDays?: number };
  }>('/api/voice/analytics/:userId', async (request, reply) => {
    try {
      const analytics = await voiceReviewInterfaceService.getUsageAnalytics(
        request.params.userId,
        request.query.periodDays
      );

      return reply.send({
        success: true,
        analytics,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get voice analytics');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get voice analytics',
      });
    }
  });

  /**
   * Create a voice macro
   */
  fastify.post<{
    Body: {
      userId: string;
      triggerPhrase: string;
      commands: Array<{
        transcription: string;
        intent: { type: string; parameters?: Record<string, unknown> };
      }>;
      description: string;
    };
  }>('/api/voice/macros', async (request, reply) => {
    try {
      const macro = await voiceReviewInterfaceService.createMacro(
        request.body.userId,
        request.body.triggerPhrase,
        request.body.commands as any,
        request.body.description
      );

      return reply.send({
        success: true,
        macro,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create voice macro');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create voice macro',
      });
    }
  });

  /**
   * Get user macros
   */
  fastify.get<{
    Params: { userId: string };
  }>('/api/voice/macros/:userId', async (request, reply) => {
    try {
      const macros = await voiceReviewInterfaceService.getMacros(
        request.params.userId
      );

      return reply.send({
        success: true,
        macros,
        count: macros.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get voice macros');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get voice macros',
      });
    }
  });

  /**
   * Get accessibility preferences
   */
  fastify.get<{
    Params: { userId: string };
  }>('/api/voice/accessibility/:userId', async (request, reply) => {
    try {
      const preferences = await voiceReviewInterfaceService.getAccessibilityPreferences(
        request.params.userId
      );

      return reply.send({
        success: true,
        preferences,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get accessibility preferences');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get accessibility preferences',
      });
    }
  });

  /**
   * Update accessibility preferences
   */
  fastify.put<{
    Params: { userId: string };
    Body: Partial<AccessibilityPreferences>;
  }>('/api/voice/accessibility/:userId', async (request, reply) => {
    try {
      const preferences = await voiceReviewInterfaceService.updateAccessibilityPreferences(
        request.params.userId,
        request.body
      );

      return reply.send({
        success: true,
        preferences,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to update accessibility preferences');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update accessibility preferences',
      });
    }
  });
};
