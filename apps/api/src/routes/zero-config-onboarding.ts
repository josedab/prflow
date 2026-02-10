import { FastifyPluginAsync } from 'fastify';
import { zeroConfigOnboardingService } from '../services/zero-config-onboarding.js';
import { logger } from '../lib/logger.js';

/**
 * Zero-Config Onboarding routes
 */
export const zeroConfigOnboardingRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Start onboarding
   */
  fastify.post<{
    Body: { userLogin: string; owner: string; repo: string };
  }>('/start', async (request, reply) => {
    try {
      const session = await zeroConfigOnboardingService.startOnboarding(request.body);

      return reply.status(201).send({ success: true, session });
    } catch (error) {
      logger.error({ error }, 'Failed to start onboarding');
      return reply.status(500).send({ success: false, error: 'Failed to start onboarding' });
    }
  });

  /**
   * Detect tech stack
   */
  fastify.post<{
    Body: { owner: string; repo: string; repoFiles: string[] };
  }>('/detect', async (request, reply) => {
    try {
      const techStack = await zeroConfigOnboardingService.detectTechStack(request.body);

      return reply.send({ success: true, techStack });
    } catch (error) {
      logger.error({ error }, 'Failed to detect tech stack');
      return reply.status(500).send({ success: false, error: 'Failed to detect tech stack' });
    }
  });

  /**
   * Generate configuration
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      techStack: Record<string, unknown>;
      templateId?: string;
    };
  }>('/generate-config', async (request, reply) => {
    try {
      const config = await zeroConfigOnboardingService.generateConfig(request.body as unknown as Parameters<typeof zeroConfigOnboardingService.generateConfig>[0]);

      return reply.send({ success: true, config });
    } catch (error) {
      logger.error({ error }, 'Failed to generate config');
      return reply.status(500).send({ success: false, error: 'Failed to generate config' });
    }
  });

  /**
   * Get onboarding session
   */
  fastify.get<{
    Params: { sessionId: string };
  }>('/sessions/:sessionId', async (request, reply) => {
    try {
      const session = await zeroConfigOnboardingService.getSession(request.params.sessionId);

      if (!session) {
        return reply.status(404).send({ success: false, error: 'Session not found' });
      }

      return reply.send({ success: true, session });
    } catch (error) {
      logger.error({ error }, 'Failed to get onboarding session');
      return reply.status(500).send({ success: false, error: 'Failed to get session' });
    }
  });

  /**
   * Advance onboarding step
   */
  fastify.post<{
    Params: { sessionId: string };
    Body: { completedStep: string };
  }>('/sessions/:sessionId/advance', async (request, reply) => {
    try {
      const session = await zeroConfigOnboardingService.advanceStep(
        request.params.sessionId,
        request.body.completedStep
      );

      return reply.send({ success: true, session });
    } catch (error) {
      logger.error({ error }, 'Failed to advance onboarding step');
      return reply.status(500).send({ success: false, error: 'Failed to advance step' });
    }
  });

  /**
   * Get onboarding metrics
   */
  fastify.get('/metrics', async (request, reply) => {
    try {
      const metrics = await zeroConfigOnboardingService.getOnboardingMetrics();

      return reply.send({ success: true, metrics });
    } catch (error) {
      logger.error({ error }, 'Failed to get onboarding metrics');
      return reply.status(500).send({ success: false, error: 'Failed to get metrics' });
    }
  });
};
