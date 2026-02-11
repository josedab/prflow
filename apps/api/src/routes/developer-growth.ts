import { FastifyPluginAsync } from 'fastify';
import { developerGrowthService } from '../services/developer-growth.js';
import { logger } from '../lib/logger.js';

/**
 * Developer Growth Dashboard & Mentoring routes
 */
export const developerGrowthRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get developer growth profile
   */
  fastify.get<{
    Params: { login: string };
    Querystring: { repositoryId?: string };
  }>('/profile/:login', async (request, reply) => {
    try {
      const profile = await developerGrowthService.getProfile(
        request.params.login,
        request.query.repositoryId
      );

      return reply.send({ success: true, profile });
    } catch (error) {
      logger.error({ error }, 'Failed to get growth profile');
      return reply.status(500).send({ success: false, error: 'Failed to get profile' });
    }
  });

  /**
   * Get team growth overview
   */
  fastify.post<{
    Body: { teamMembers: string[]; periodDays?: number };
  }>('/team-overview', async (request, reply) => {
    try {
      const overview = await developerGrowthService.getTeamOverview(request.body);

      return reply.send({ success: true, overview });
    } catch (error) {
      logger.error({ error }, 'Failed to get team overview');
      return reply.status(500).send({ success: false, error: 'Failed to get team overview' });
    }
  });

  /**
   * Record a review interaction
   */
  fastify.post<{
    Body: {
      login: string;
      prNumber: number;
      issueType: string;
      category: string;
      wasRecurring: boolean;
      action: 'fixed' | 'dismissed' | 'discussed';
    };
  }>('/interactions', async (request, reply) => {
    try {
      await developerGrowthService.recordReviewInteraction(request.body);

      return reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Failed to record interaction');
      return reply.status(500).send({ success: false, error: 'Failed to record interaction' });
    }
  });

  /**
   * Configure mentoring mode
   */
  fastify.post<{
    Body: {
      mentor: string;
      enabled: boolean;
      style: string;
      focusTopics: string[];
      severityThreshold: string;
      includeExamples: boolean;
      includeResources: boolean;
      maxCommentsPerPR: number;
    };
  }>('/mentoring/configure', async (request, reply) => {
    try {
      const config = await developerGrowthService.configureMentoringMode(request.body);

      return reply.send({ success: true, config });
    } catch (error) {
      logger.error({ error }, 'Failed to configure mentoring');
      return reply.status(500).send({ success: false, error: 'Failed to configure mentoring' });
    }
  });

  /**
   * Get mentoring configuration
   */
  fastify.get<{
    Params: { mentor: string };
  }>('/mentoring/:mentor', async (request, reply) => {
    try {
      const config = await developerGrowthService.getMentoringConfig(request.params.mentor);

      if (!config) {
        return reply.status(404).send({ success: false, error: 'Config not found' });
      }

      return reply.send({ success: true, config });
    } catch (error) {
      logger.error({ error }, 'Failed to get mentoring config');
      return reply.status(500).send({ success: false, error: 'Failed to get config' });
    }
  });

  /**
   * Suggest mentoring pairs
   */
  fastify.post<{
    Body: { teamMembers: string[] };
  }>('/mentoring/suggest-pairs', async (request, reply) => {
    try {
      const pairs = await developerGrowthService.suggestMentoringPairs(request.body.teamMembers);

      return reply.send({ success: true, pairs, total: pairs.length });
    } catch (error) {
      logger.error({ error }, 'Failed to suggest mentoring pairs');
      return reply.status(500).send({ success: false, error: 'Failed to suggest pairs' });
    }
  });

  /**
   * Get achievements
   */
  fastify.get<{
    Params: { login: string };
  }>('/achievements/:login', async (request, reply) => {
    try {
      const achievements = await developerGrowthService.getAchievements(request.params.login);

      return reply.send({ success: true, achievements, total: achievements.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get achievements');
      return reply.status(500).send({ success: false, error: 'Failed to get achievements' });
    }
  });
};
