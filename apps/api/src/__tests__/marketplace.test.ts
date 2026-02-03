import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { marketplaceRoutes } from '../routes/marketplace.js';

// Mock the marketplace service
vi.mock('../services/marketplace.js', () => ({
  marketplaceService: {
    getListings: vi.fn(),
    createListing: vi.fn(),
    claimReview: vi.fn(),
    completeReview: vi.fn(),
    getReviewerProfile: vi.fn(),
    getLeaderboard: vi.fn(),
    getStats: vi.fn(),
  },
}));

describe('Marketplace Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify();
    await app.register(marketplaceRoutes, { prefix: '/api/marketplace' });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api/marketplace/listings', () => {
    it('should return available listings', async () => {
      const { marketplaceService } = await import('../services/marketplace.js');

      vi.mocked(marketplaceService.getListings).mockResolvedValue({
        listings: [
          {
            id: 'listing-1',
            repository: { owner: 'test', name: 'repo', fullName: 'test/repo' },
            prNumber: 123,
            title: 'Test PR',
            author: 'author1',
            status: 'available',
            estimatedMinutes: 30,
            points: 50,
            bonusPoints: 10,
            requiredSkills: ['backend', 'testing'],
            difficulty: 'medium',
            priority: 'normal',
            filesChanged: 5,
            linesChanged: 100,
            createdAt: new Date(),
            claimDeadline: new Date(Date.now() + 86400000),
            tags: ['feature'],
          },
        ],
        total: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/marketplace/listings',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.listings).toHaveLength(1);
      expect(body.data.listings[0].points).toBe(50);
    });

    it('should filter by skills', async () => {
      const { marketplaceService } = await import('../services/marketplace.js');

      vi.mocked(marketplaceService.getListings).mockResolvedValue({
        listings: [],
        total: 0,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/marketplace/listings?skills=security,backend',
      });

      expect(response.statusCode).toBe(200);
      expect(marketplaceService.getListings).toHaveBeenCalledWith(
        expect.objectContaining({
          skills: ['security', 'backend'],
        }),
        expect.any(Object)
      );
    });
  });

  describe('POST /api/marketplace/listings/:listingId/claim', () => {
    it('should claim a listing', async () => {
      const { marketplaceService } = await import('../services/marketplace.js');

      vi.mocked(marketplaceService.claimReview).mockResolvedValue({
        id: 'claim-1',
        listingId: 'listing-1',
        reviewerLogin: 'reviewer1',
        status: 'claimed',
        claimedAt: new Date(),
        deadline: new Date(Date.now() + 3600000),
        pointsEarned: 0,
        bonusEarned: 0,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/marketplace/listings/listing-1/claim',
        payload: {
          reviewerLogin: 'reviewer1',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('claimed');
    });

    it('should handle claim errors', async () => {
      const { marketplaceService } = await import('../services/marketplace.js');

      vi.mocked(marketplaceService.claimReview).mockRejectedValue(
        new Error('Listing not available')
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/marketplace/listings/listing-1/claim',
        payload: {
          reviewerLogin: 'reviewer1',
        },
      });

      // Route returns 400 for claim errors (bad request)
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/marketplace/reviewers/:login', () => {
    it('should return reviewer profile', async () => {
      const { marketplaceService } = await import('../services/marketplace.js');

      vi.mocked(marketplaceService.getReviewerProfile).mockResolvedValue({
        login: 'reviewer1',
        name: 'Test Reviewer',
        totalPoints: 500,
        level: 3,
        pointsToNextLevel: 200,
        currentStreak: 5,
        longestStreak: 10,
        totalReviews: 25,
        weeklyReviews: 3,
        monthlyReviews: 12,
        avgReviewTime: 45,
        avgQualityScore: 4.5,
        badges: [],
        skills: [],
        availability: 'available',
        maxConcurrentReviews: 3,
        activeClaimsCount: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/marketplace/reviewers/reviewer1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.totalPoints).toBe(500);
      expect(body.data.level).toBe(3);
    });
  });

  describe('GET /api/marketplace/leaderboard', () => {
    it('should return leaderboard', async () => {
      const { marketplaceService } = await import('../services/marketplace.js');

      vi.mocked(marketplaceService.getLeaderboard).mockResolvedValue({
        period: 'weekly',
        entries: [
          {
            rank: 1,
            login: 'top-reviewer',
            points: 1000,
            reviewsCompleted: 20,
            avgQuality: 4.8,
            level: 5,
            rankChange: 2,
            featuredBadges: ['speed_demon', 'century_club'],
          },
        ],
        updatedAt: new Date(),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/marketplace/leaderboard?period=weekly',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.entries[0].rank).toBe(1);
    });
  });
});
