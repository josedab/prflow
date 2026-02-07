import { FastifyPluginAsync } from 'fastify';
import { db } from '@prflow/db';
import { developerSkillProfilerService } from '../services/developer-skill-profiler.js';
import { logger } from '../lib/logger.js';
import type { SkillProficiencyLevel, SkillProfileCategory } from '@prflow/core';

/**
 * Developer Skill Profiler routes
 */
export const developerSkillProfilerRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get developer profile
   */
  fastify.get<{
    Params: { login: string };
    Querystring: { repositoryId?: string; period?: 'month' | 'quarter' | 'year' | 'all' };
  }>('/api/skills/developers/:login', async (request, reply) => {
    try {
      const profile = await developerSkillProfilerService.getDeveloperProfile(
        request.params.login,
        {
          repositoryId: request.query.repositoryId,
          period: request.query.period,
        }
      );

      return reply.send({
        success: true,
        profile,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get developer profile');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get developer profile',
      });
    }
  });

  /**
   * Get team skill matrix
   */
  fastify.post<{
    Body: {
      teamId: string;
      memberLogins: string[];
      includeLearning?: boolean;
      includeGaps?: boolean;
    };
  }>('/api/skills/teams/matrix', async (request, reply) => {
    try {
      const matrix = await developerSkillProfilerService.getTeamSkillMatrix(
        request.body.teamId,
        request.body.memberLogins,
        {
          includeLearning: request.body.includeLearning,
          includeGaps: request.body.includeGaps,
        }
      );

      return reply.send({
        success: true,
        matrix,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get team skill matrix');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get team skill matrix',
      });
    }
  });

  /**
   * Find reviewers for a PR
   */
  fastify.get<{
    Params: { owner: string; repo: string; prNumber: string };
    Querystring: {
      requiredSkills?: string;
      minProficiency?: SkillProficiencyLevel;
      limit?: number;
    };
  }>('/api/skills/reviewers/:owner/:repo/:prNumber', async (request, reply) => {
    try {
      const requiredSkills = request.query.requiredSkills?.split(',').filter(Boolean);

      const reviewers = await developerSkillProfilerService.findReviewersForPR(
        request.params.owner,
        request.params.repo,
        parseInt(request.params.prNumber, 10),
        {
          requiredSkills,
          minProficiency: request.query.minProficiency,
          limit: request.query.limit,
        }
      );

      return reply.send({
        success: true,
        reviewers,
        count: reviewers.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to find reviewers');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find reviewers',
      });
    }
  });

  /**
   * Get skill leaderboard
   */
  fastify.get<{
    Params: { skillId: string };
    Querystring: { period?: 'week' | 'month' | 'quarter' | 'all'; limit?: number };
  }>('/api/skills/leaderboard/:skillId', async (request, reply) => {
    try {
      const leaderboard = await developerSkillProfilerService.getSkillLeaderboard(
        request.params.skillId,
        request.query.period,
        request.query.limit
      );

      return reply.send({
        success: true,
        leaderboard,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get skill leaderboard');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get skill leaderboard',
      });
    }
  });

  /**
   * Get all skills
   */
  fastify.get<{
    Querystring: { category?: SkillProfileCategory };
  }>('/api/skills', async (request, reply) => {
    try {
      const skills = request.query.category
        ? developerSkillProfilerService.getSkillsByCategory(request.query.category)
        : developerSkillProfilerService.getAllSkills();

      return reply.send({
        success: true,
        skills,
        count: skills.length,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get skills');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get skills',
      });
    }
  });

  /**
   * Get skill by ID
   */
  fastify.get<{
    Params: { skillId: string };
  }>('/api/skills/:skillId', async (request, reply) => {
    try {
      const skill = developerSkillProfilerService.getSkill(request.params.skillId);

      if (!skill) {
        return reply.status(404).send({
          success: false,
          error: 'Skill not found',
        });
      }

      return reply.send({
        success: true,
        skill,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get skill');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get skill',
      });
    }
  });

  /**
   * Issue skill certification
   */
  fastify.post<{
    Body: {
      login: string;
      skillId: string;
      level: SkillProficiencyLevel;
      evidence: Array<{
        type: 'pr' | 'commit' | 'review' | 'external';
        reference: string;
        description: string;
      }>;
      verifiedBy?: string;
    };
  }>('/api/skills/certifications', async (request, reply) => {
    try {
      const certification = await developerSkillProfilerService.issueSkillCertification(
        request.body.login,
        request.body.skillId,
        request.body.level,
        request.body.evidence,
        request.body.verifiedBy
      );

      return reply.send({
        success: true,
        certification,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to issue certification');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to issue certification',
      });
    }
  });

  /**
   * Analyze PR skills
   */
  fastify.get<{
    Params: { owner: string; repo: string; prNumber: string };
  }>('/api/skills/analyze/:owner/:repo/:prNumber', async (request, reply) => {
    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${request.params.owner}/${request.params.repo}` },
      });

      if (!repository) {
        return reply.status(404).send({
          success: false,
          error: 'Repository not found',
        });
      }

      const workflow = await db.pRWorkflow.findFirst({
        where: {
          repositoryId: repository.id,
          prNumber: parseInt(request.params.prNumber, 10),
        },
        include: {
          analysis: true,
        },
      });

      if (!workflow) {
        return reply.status(404).send({
          success: false,
          error: 'PR not found',
        });
      }

      const analysis = await developerSkillProfilerService.analyzePRSkills({
        prNumber: workflow.prNumber,
        prTitle: workflow.prTitle,
        analysis: workflow.analysis ? {
          changedFiles: workflow.analysis.filesModified ? Array(workflow.analysis.filesModified).fill('') : undefined,
        } : undefined,
      });

      return reply.send({
        success: true,
        analysis,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to analyze PR skills');
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze PR skills',
      });
    }
  });
};
