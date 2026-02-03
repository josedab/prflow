/**
 * @fileoverview Review Delegation Marketplace API Routes
 *
 * REST API endpoints for:
 * - Browse and filter review listings
 * - Claim and complete reviews
 * - Gamification (points, badges, leaderboards)
 * - Reviewer profiles
 *
 * @module routes/marketplace
 */

import type { FastifyInstance } from 'fastify';
import { marketplaceService } from '../services/marketplace.js';
import { logger } from '../lib/logger.js';
import type { ReviewerSkillCategory, ClaimStatus } from '@prflow/core';

interface RepoParams {
  owner: string;
  repo: string;
}

export async function marketplaceRoutes(app: FastifyInstance) {
  /**
   * Get available listings
   * GET /api/marketplace/listings
   */
  app.get<{
    Querystring: {
      status?: string;
      skills?: string;
      difficulty?: string;
      priority?: string;
      maxMinutes?: string;
      minPoints?: string;
      limit?: string;
      offset?: string;
    };
  }>('/listings', async (request, reply) => {
    try {
      const { status, skills, difficulty, priority, maxMinutes, minPoints, limit, offset } = request.query;

      const filter = {
        status: status ? (status.split(',') as ClaimStatus[]) : undefined,
        skills: skills ? (skills.split(',') as ReviewerSkillCategory[]) : undefined,
        difficulty: difficulty ? difficulty.split(',') as ('easy' | 'medium' | 'hard' | 'expert')[] : undefined,
        priority: priority ? priority.split(',') as ('low' | 'normal' | 'high' | 'urgent')[] : undefined,
        maxMinutes: maxMinutes ? parseInt(maxMinutes, 10) : undefined,
        minPoints: minPoints ? parseInt(minPoints, 10) : undefined,
      };

      const result = await marketplaceService.getListings(filter, {
        limit: limit ? parseInt(limit, 10) : 20,
        offset: offset ? parseInt(offset, 10) : 0,
      });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get listings';
      logger.error({ error }, 'Failed to get marketplace listings');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Create a listing for a PR
   * POST /api/marketplace/:owner/:repo/:prNumber/listing
   */
  app.post<{
    Params: RepoParams & { prNumber: string };
    Body: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      requiredSkills?: ReviewerSkillCategory[];
      tags?: string[];
      claimDeadlineHours?: number;
    };
  }>('/:owner/:repo/:prNumber/listing', async (request, reply) => {
    const { owner, repo, prNumber } = request.params;
    const options = request.body;

    try {
      const listing = await marketplaceService.createListing(
        owner,
        repo,
        parseInt(prNumber, 10),
        options
      );

      return reply.status(201).send({
        success: true,
        data: listing,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create listing';
      logger.error({ error, owner, repo, prNumber }, 'Failed to create listing');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Claim a review
   * POST /api/marketplace/listings/:listingId/claim
   */
  app.post<{
    Params: { listingId: string };
    Body: { reviewerLogin: string };
  }>('/listings/:listingId/claim', async (request, reply) => {
    const { listingId } = request.params;
    const { reviewerLogin } = request.body;

    try {
      const claim = await marketplaceService.claimReview(listingId, reviewerLogin);

      return reply.send({
        success: true,
        data: claim,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to claim review';
      logger.error({ error, listingId, reviewerLogin }, 'Failed to claim review');
      return reply.status(400).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Start a claimed review
   * POST /api/marketplace/claims/:claimId/start
   */
  app.post<{
    Params: { claimId: string };
  }>('/claims/:claimId/start', async (request, reply) => {
    const { claimId } = request.params;

    try {
      const claim = await marketplaceService.startReview(claimId);

      return reply.send({
        success: true,
        data: claim,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start review';
      logger.error({ error, claimId }, 'Failed to start review');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Complete a review
   * POST /api/marketplace/claims/:claimId/complete
   */
  app.post<{
    Params: { claimId: string };
    Body: { qualityScore?: number; feedback?: string };
  }>('/claims/:claimId/complete', async (request, reply) => {
    const { claimId } = request.params;
    const { qualityScore, feedback } = request.body;

    try {
      const result = await marketplaceService.completeReview(claimId, { qualityScore, feedback });

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to complete review';
      logger.error({ error, claimId }, 'Failed to complete review');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get reviewer profile
   * GET /api/marketplace/reviewers/:login
   */
  app.get<{
    Params: { login: string };
  }>('/reviewers/:login', async (request, reply) => {
    const { login } = request.params;

    try {
      const profile = await marketplaceService.getReviewerProfile(login);

      return reply.send({
        success: true,
        data: profile,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get profile';
      logger.error({ error, login }, 'Failed to get reviewer profile');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get leaderboard
   * GET /api/marketplace/leaderboard
   */
  app.get<{
    Querystring: {
      period?: 'daily' | 'weekly' | 'monthly' | 'all_time';
      repository?: string;
      team?: string;
      limit?: string;
    };
  }>('/leaderboard', async (request, reply) => {
    const { period = 'weekly', repository, team, limit } = request.query;

    try {
      const leaderboard = await marketplaceService.getLeaderboard(period, {
        repository,
        team,
        limit: limit ? parseInt(limit, 10) : undefined,
      });

      return reply.send({
        success: true,
        data: leaderboard,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get leaderboard';
      logger.error({ error }, 'Failed to get leaderboard');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get marketplace statistics
   * GET /api/marketplace/stats
   */
  app.get('/stats', async (request, reply) => {
    try {
      const stats = await marketplaceService.getStats();

      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get stats';
      logger.error({ error }, 'Failed to get marketplace stats');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get my claims
   * GET /api/marketplace/my-claims
   */
  app.get<{
    Querystring: {
      reviewerLogin: string;
      status?: string;
    };
  }>('/my-claims', async (request, reply) => {
    const { reviewerLogin, status } = request.query;

    try {
      // Would need to implement this method
      return reply.send({
        success: true,
        data: {
          claims: [],
          total: 0,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get claims';
      logger.error({ error }, 'Failed to get my claims');
      return reply.status(500).send({
        success: false,
        error: message,
      });
    }
  });

  /**
   * Get badges
   * GET /api/marketplace/badges
   */
  app.get('/badges', async (_request, reply) => {
    // Return all available badges
    const badges = [
      { type: 'first_review', name: 'First Steps', description: 'Completed your first code review', icon: '🎉', rarity: 'common' },
      { type: 'speed_demon', name: 'Speed Demon', description: 'Completed 10 reviews under 30 minutes each', icon: '⚡', rarity: 'rare' },
      { type: 'thorough_reviewer', name: 'Thorough Reviewer', description: 'Maintained 90%+ quality score over 20 reviews', icon: '🔍', rarity: 'rare' },
      { type: 'helpful_comments', name: 'Helpful Helper', description: 'Received 50 positive feedback on comments', icon: '💡', rarity: 'rare' },
      { type: 'security_expert', name: 'Security Expert', description: 'Completed 25 security-related reviews', icon: '🔒', rarity: 'epic' },
      { type: 'documentation_hero', name: 'Documentation Hero', description: 'Completed 25 documentation reviews', icon: '📚', rarity: 'epic' },
      { type: 'test_champion', name: 'Test Champion', description: 'Completed 25 test-related reviews', icon: '🧪', rarity: 'epic' },
      { type: 'mentor', name: 'Mentor', description: 'Helped 10 first-time contributors', icon: '🎓', rarity: 'epic' },
      { type: 'streak_7', name: 'Week Warrior', description: 'Maintained a 7-day review streak', icon: '🔥', rarity: 'common' },
      { type: 'streak_30', name: 'Monthly Master', description: 'Maintained a 30-day review streak', icon: '🏆', rarity: 'rare' },
      { type: 'century_club', name: 'Century Club', description: 'Completed 100 reviews', icon: '💯', rarity: 'epic' },
      { type: 'top_reviewer_weekly', name: 'Weekly Champion', description: 'Ranked #1 on the weekly leaderboard', icon: '👑', rarity: 'rare' },
      { type: 'top_reviewer_monthly', name: 'Monthly Legend', description: 'Ranked #1 on the monthly leaderboard', icon: '🌟', rarity: 'legendary' },
    ];

    return reply.send({
      success: true,
      data: badges,
    });
  });

  /**
   * Get levels
   * GET /api/marketplace/levels
   */
  app.get('/levels', async (_request, reply) => {
    const levels = [
      { level: 1, name: 'Novice Reviewer', pointsRequired: 0, perks: ['Access to marketplace'] },
      { level: 2, name: 'Junior Reviewer', pointsRequired: 50, perks: ['Claim 2 reviews at once'] },
      { level: 3, name: 'Reviewer', pointsRequired: 150, perks: ['Priority notifications'] },
      { level: 4, name: 'Senior Reviewer', pointsRequired: 300, perks: ['Claim 3 reviews at once'] },
      { level: 5, name: 'Lead Reviewer', pointsRequired: 500, perks: ['Early access to listings'] },
      { level: 6, name: 'Expert Reviewer', pointsRequired: 800, perks: ['Claim 5 reviews at once'] },
      { level: 7, name: 'Master Reviewer', pointsRequired: 1200, perks: ['Custom badge frame'] },
      { level: 8, name: 'Principal Reviewer', pointsRequired: 1800, perks: ['Mentor other reviewers'] },
      { level: 9, name: 'Distinguished Reviewer', pointsRequired: 2500, perks: ['Featured profile'] },
      { level: 10, name: 'Legendary Reviewer', pointsRequired: 4000, perks: ['Hall of Fame'] },
    ];

    return reply.send({
      success: true,
      data: levels,
    });
  });
}
