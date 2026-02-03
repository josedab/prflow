/**
 * @fileoverview Review Delegation Marketplace Service
 *
 * Provides marketplace capabilities:
 * - Create and manage review listings
 * - Claim and complete reviews
 * - Gamification with points, badges, and leaderboards
 * - Skill matching for optimal reviewer assignment
 *
 * @module services/marketplace
 */

import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

import type {
  ReviewListing,
  ReviewClaim,
  ReviewerProfile,
  Badge,
  BadgeType,
  LeaderboardEntry,
  Leaderboard,
  MarketplaceStats,
  MarketplaceFilter,
  ClaimStatus,
  ReviewerSkillCategory,
  PointsConfig,
} from '@prflow/core';

// Type alias for convenience
type SkillCategory = ReviewerSkillCategory;

/**
 * Default points configuration
 */
const DEFAULT_POINTS_CONFIG: PointsConfig = {
  basePoints: 10,
  perFilePoints: 2,
  perLinePoints: 0.1,
  quickTurnaroundBonus: 15,
  quickTurnaroundMinutes: 60,
  highPriorityBonus: 10,
  urgentPriorityBonus: 25,
  expiredPenalty: -5,
  difficultyMultipliers: {
    easy: 1,
    medium: 1.5,
    hard: 2,
    expert: 3,
  },
};

/**
 * Badge definitions
 */
const BADGE_DEFINITIONS: Record<BadgeType, Omit<Badge, 'earnedAt'>> = {
  first_review: {
    type: 'first_review',
    name: 'First Steps',
    description: 'Completed your first code review',
    icon: '🎉',
    rarity: 'common',
  },
  speed_demon: {
    type: 'speed_demon',
    name: 'Speed Demon',
    description: 'Completed 10 reviews under 30 minutes each',
    icon: '⚡',
    rarity: 'rare',
  },
  thorough_reviewer: {
    type: 'thorough_reviewer',
    name: 'Thorough Reviewer',
    description: 'Maintained 90%+ quality score over 20 reviews',
    icon: '🔍',
    rarity: 'rare',
  },
  helpful_comments: {
    type: 'helpful_comments',
    name: 'Helpful Helper',
    description: 'Received 50 positive feedback on comments',
    icon: '💡',
    rarity: 'rare',
  },
  security_expert: {
    type: 'security_expert',
    name: 'Security Expert',
    description: 'Completed 25 security-related reviews',
    icon: '🔒',
    rarity: 'epic',
  },
  documentation_hero: {
    type: 'documentation_hero',
    name: 'Documentation Hero',
    description: 'Completed 25 documentation reviews',
    icon: '📚',
    rarity: 'epic',
  },
  test_champion: {
    type: 'test_champion',
    name: 'Test Champion',
    description: 'Completed 25 test-related reviews',
    icon: '🧪',
    rarity: 'epic',
  },
  mentor: {
    type: 'mentor',
    name: 'Mentor',
    description: 'Helped 10 first-time contributors',
    icon: '🎓',
    rarity: 'epic',
  },
  streak_7: {
    type: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintained a 7-day review streak',
    icon: '🔥',
    rarity: 'common',
  },
  streak_30: {
    type: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintained a 30-day review streak',
    icon: '🏆',
    rarity: 'rare',
  },
  century_club: {
    type: 'century_club',
    name: 'Century Club',
    description: 'Completed 100 reviews',
    icon: '💯',
    rarity: 'epic',
  },
  top_reviewer_weekly: {
    type: 'top_reviewer_weekly',
    name: 'Weekly Champion',
    description: 'Ranked #1 on the weekly leaderboard',
    icon: '👑',
    rarity: 'rare',
  },
  top_reviewer_monthly: {
    type: 'top_reviewer_monthly',
    name: 'Monthly Legend',
    description: 'Ranked #1 on the monthly leaderboard',
    icon: '🌟',
    rarity: 'legendary',
  },
};

/**
 * Level definitions
 */
const LEVELS = [
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

export class MarketplaceService {
  /**
   * Create a new review listing
   */
  async createListing(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      priority?: 'low' | 'normal' | 'high' | 'urgent';
      requiredSkills?: SkillCategory[];
      tags?: string[];
      claimDeadlineHours?: number;
    } = {}
  ): Promise<ReviewListing> {
    const repoFullName = `${owner}/${repo}`;
    logger.info({ repo: repoFullName, prNumber }, 'Creating marketplace listing');

    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });

    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }

    const workflow = await db.pRWorkflow.findFirst({
      where: { repositoryId: repository.id, prNumber },
      orderBy: { createdAt: 'desc' },
      include: { analysis: true },
    });

    if (!workflow) {
      throw new Error(`PR #${prNumber} not found`);
    }

    // Calculate points and estimated time
    const filesChanged = workflow.analysis?.filesModified || 10;
    const linesChanged = (workflow.analysis?.linesAdded || 0) + (workflow.analysis?.linesRemoved || 0);
    const difficulty = this.calculateDifficulty(filesChanged, linesChanged);
    const estimatedMinutes = this.estimateReviewTime(filesChanged, linesChanged, difficulty);
    const { points, bonusPoints } = this.calculatePoints(
      filesChanged,
      linesChanged,
      difficulty,
      options.priority || 'normal'
    );

    const claimDeadline = new Date();
    claimDeadline.setHours(claimDeadline.getHours() + (options.claimDeadlineHours || 24));

    const listing = await dbAny.reviewListing.create({
      data: {
        repositoryId: repository.id,
        workflowId: workflow.id,
        prNumber,
        title: workflow.prTitle,
        author: workflow.authorLogin,
        status: 'available',
        estimatedMinutes,
        points,
        bonusPoints,
        requiredSkills: options.requiredSkills || [],
        difficulty,
        priority: options.priority || 'normal',
        filesChanged,
        linesChanged,
        claimDeadline,
        tags: options.tags || [],
      },
    });

    return this.mapListing(listing, owner, repo);
  }

  /**
   * Get available listings
   */
  async getListings(
    filter: MarketplaceFilter = {},
    pagination: { limit?: number; offset?: number } = {}
  ): Promise<{ listings: ReviewListing[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (filter.status) {
      where.status = { in: filter.status };
    } else {
      where.status = 'available';
    }

    if (filter.skills && filter.skills.length > 0) {
      where.requiredSkills = { hasSome: filter.skills };
    }

    if (filter.difficulty && filter.difficulty.length > 0) {
      where.difficulty = { in: filter.difficulty };
    }

    if (filter.priority && filter.priority.length > 0) {
      where.priority = { in: filter.priority };
    }

    if (filter.maxMinutes) {
      where.estimatedMinutes = { lte: filter.maxMinutes };
    }

    if (filter.minPoints) {
      where.points = { gte: filter.minPoints };
    }

    const [listings, total] = await Promise.all([
      dbAny.reviewListing.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: pagination.limit || 20,
        skip: pagination.offset || 0,
        include: { repository: true },
      }),
      dbAny.reviewListing.count({ where }),
    ]);

    // Define DB record type that matches what Prisma returns
    interface ListingRecord {
      repository: { owner: string; name: string };
      id: string;
      prNumber: number;
      title: string;
      author: string;
      status: string;
      estimatedMinutes: number;
      points: number;
      bonusPoints: number;
      requiredSkills: string[];
      difficulty: string;
      priority: string;
      filesChanged: number;
      linesChanged: number;
      createdAt: Date;
      claimDeadline: Date;
      claimedBy: string | null;
      claimedAt: Date | null;
      tags: string[];
    }

    return {
      listings: listings.map((l: ListingRecord) => this.mapListing(l, l.repository.owner, l.repository.name)),
      total,
    };
  }

  /**
   * Claim a review
   */
  async claimReview(
    listingId: string,
    reviewerLogin: string
  ): Promise<ReviewClaim> {
    logger.info({ listingId, reviewer: reviewerLogin }, 'Claiming review');

    // Check if listing is available
    const listing = await dbAny.reviewListing.findUnique({
      where: { id: listingId },
    });

    if (!listing) {
      throw new Error('Listing not found');
    }

    if (listing.status !== 'available') {
      throw new Error('Listing is not available for claiming');
    }

    if (new Date() > listing.claimDeadline) {
      throw new Error('Claim deadline has passed');
    }

    // Check reviewer's active claims
    const profile = await this.getReviewerProfile(reviewerLogin);
    if (profile.activeClaimsCount >= profile.maxConcurrentReviews) {
      throw new Error(`You have reached your maximum of ${profile.maxConcurrentReviews} concurrent reviews`);
    }

    // Create claim and update listing
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + Math.ceil(listing.estimatedMinutes / 60) + 4); // Add 4 hour buffer

    const [claim] = await db.$transaction([
      dbAny.reviewClaim.create({
        data: {
          listingId,
          reviewerLogin,
          status: 'claimed',
          deadline,
          pointsEarned: 0,
          bonusEarned: 0,
        },
      }),
      dbAny.reviewListing.update({
        where: { id: listingId },
        data: {
          status: 'claimed',
          claimedBy: reviewerLogin,
          claimedAt: new Date(),
        },
      }),
    ]);

    return this.mapClaim(claim);
  }

  /**
   * Start a claimed review
   */
  async startReview(claimId: string): Promise<ReviewClaim> {
    const claim = await dbAny.reviewClaim.update({
      where: { id: claimId },
      data: {
        status: 'in_progress',
        startedAt: new Date(),
      },
    });

    await dbAny.reviewListing.update({
      where: { id: claim.listingId },
      data: { status: 'in_progress' },
    });

    return this.mapClaim(claim);
  }

  /**
   * Complete a review
   */
  async completeReview(
    claimId: string,
    options: { qualityScore?: number; feedback?: string } = {}
  ): Promise<{ claim: ReviewClaim; pointsEarned: number; newBadges: Badge[] }> {
    logger.info({ claimId }, 'Completing review');

    const claim = await dbAny.reviewClaim.findUnique({
      where: { id: claimId },
      include: { listing: true },
    });

    if (!claim) {
      throw new Error('Claim not found');
    }

    const listing = claim.listing;
    const now = new Date();
    const startTime = claim.startedAt || claim.claimedAt;
    const reviewTimeMinutes = (now.getTime() - startTime.getTime()) / (1000 * 60);

    // Calculate points
    let pointsEarned = listing.points;
    let bonusEarned = 0;

    // Quick turnaround bonus
    if (reviewTimeMinutes <= DEFAULT_POINTS_CONFIG.quickTurnaroundMinutes) {
      bonusEarned += listing.bonusPoints;
    }

    // Update claim
    const updatedClaim = await dbAny.reviewClaim.update({
      where: { id: claimId },
      data: {
        status: 'completed',
        completedAt: now,
        pointsEarned,
        bonusEarned,
        qualityScore: options.qualityScore,
        feedback: options.feedback,
      },
    });

    // Update listing
    await dbAny.reviewListing.update({
      where: { id: listing.id },
      data: { status: 'completed' },
    });

    // Update reviewer stats
    await this.updateReviewerStats(claim.reviewerLogin, pointsEarned + bonusEarned, reviewTimeMinutes);

    // Check for new badges
    const newBadges = await this.checkAndAwardBadges(claim.reviewerLogin);

    return {
      claim: this.mapClaim(updatedClaim),
      pointsEarned: pointsEarned + bonusEarned,
      newBadges,
    };
  }

  /**
   * Get reviewer profile
   */
  async getReviewerProfile(login: string): Promise<ReviewerProfile> {
    let profile = await dbAny.reviewerProfile.findUnique({
      where: { login },
      include: { badges: true, skills: true },
    });

    if (!profile) {
      // Create new profile
      profile = await dbAny.reviewerProfile.create({
        data: {
          login,
          totalPoints: 0,
          level: 1,
          currentStreak: 0,
          longestStreak: 0,
          totalReviews: 0,
          weeklyReviews: 0,
          monthlyReviews: 0,
          avgReviewTime: 0,
          avgQualityScore: 0,
          availability: 'available',
          maxConcurrentReviews: 2,
        },
        include: { badges: true, skills: true },
      });
    }

    const activeClaimsCount = await dbAny.reviewClaim.count({
      where: {
        reviewerLogin: login,
        status: { in: ['claimed', 'in_progress'] },
      },
    });

    const level = this.calculateLevel(profile.totalPoints);
    const pointsToNextLevel = LEVELS[level]?.pointsRequired || 0;

    interface BadgeRecord { type: string; earnedAt: Date }
    interface SkillRecord { category: string; proficiency: string; reviewCount: number; lastUsedAt?: Date }

    return {
      login: profile.login,
      name: profile.name || undefined,
      avatarUrl: profile.avatarUrl || undefined,
      totalPoints: profile.totalPoints,
      level,
      pointsToNextLevel: pointsToNextLevel - profile.totalPoints,
      currentStreak: profile.currentStreak,
      longestStreak: profile.longestStreak,
      totalReviews: profile.totalReviews,
      weeklyReviews: profile.weeklyReviews,
      monthlyReviews: profile.monthlyReviews,
      avgReviewTime: profile.avgReviewTime,
      avgQualityScore: profile.avgQualityScore,
      badges: profile.badges.map((b: BadgeRecord) => ({
        ...BADGE_DEFINITIONS[b.type as BadgeType],
        earnedAt: b.earnedAt,
      })),
      skills: profile.skills.map((s: SkillRecord) => ({
        category: s.category as SkillCategory,
        proficiency: s.proficiency,
        reviewCount: s.reviewCount,
        lastUsedAt: s.lastUsedAt || undefined,
      })),
      availability: profile.availability as ReviewerProfile['availability'],
      maxConcurrentReviews: profile.maxConcurrentReviews,
      activeClaimsCount,
    };
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(
    period: 'daily' | 'weekly' | 'monthly' | 'all_time' = 'weekly',
    options: { repository?: string; team?: string; limit?: number } = {}
  ): Promise<Leaderboard> {
    const limit = options.limit || 20;

    // Calculate date range
    let startDate: Date | undefined;
    const now = new Date();
    switch (period) {
      case 'daily':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'weekly':
        startDate = new Date(now.setDate(now.getDate() - 7));
        break;
      case 'monthly':
        startDate = new Date(now.setMonth(now.getMonth() - 1));
        break;
    }

    // Get top reviewers by points earned in period
    const profiles = await dbAny.reviewerProfile.findMany({
      orderBy: { totalPoints: 'desc' },
      take: limit,
      include: { badges: true },
    });

    interface ProfileWithBadges {
      login: string;
      name?: string;
      avatarUrl?: string;
      totalPoints: number;
      totalReviews: number;
      avgQualityScore: number;
      badges: Array<{ type: string }>;
    }

    const entries: LeaderboardEntry[] = profiles.map((p: ProfileWithBadges, index: number) => ({
      rank: index + 1,
      login: p.login,
      name: p.name || undefined,
      avatarUrl: p.avatarUrl || undefined,
      points: p.totalPoints,
      reviewsCompleted: p.totalReviews,
      avgQuality: p.avgQualityScore,
      level: this.calculateLevel(p.totalPoints),
      rankChange: 0, // Would need historical data
      featuredBadges: p.badges.slice(0, 3).map((b: { type: string }) => b.type as BadgeType),
    }));

    return {
      period,
      repository: options.repository,
      team: options.team,
      entries,
      updatedAt: new Date(),
    };
  }

  /**
   * Get marketplace statistics
   */
  async getStats(): Promise<MarketplaceStats> {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const [activeListings, inProgress, completedToday] = await Promise.all([
      dbAny.reviewListing.count({ where: { status: 'available' } }),
      dbAny.reviewListing.count({ where: { status: 'in_progress' } }),
      dbAny.reviewClaim.count({
        where: {
          status: 'completed',
          completedAt: { gte: todayStart },
        },
      }),
    ]);

    return {
      activeListings,
      inProgressReviews: inProgress,
      completedToday,
      avgClaimTimeMinutes: 30, // Would need to calculate
      avgCompletionTimeMinutes: 45, // Would need to calculate
      topCategories: [],
      byPriority: {
        low: await dbAny.reviewListing.count({ where: { status: 'available', priority: 'low' } }),
        normal: await dbAny.reviewListing.count({ where: { status: 'available', priority: 'normal' } }),
        high: await dbAny.reviewListing.count({ where: { status: 'available', priority: 'high' } }),
        urgent: await dbAny.reviewListing.count({ where: { status: 'available', priority: 'urgent' } }),
      },
    };
  }

  // Private helpers

  private calculateDifficulty(files: number, lines: number): 'easy' | 'medium' | 'hard' | 'expert' {
    const score = files * 5 + lines * 0.1;
    if (score < 50) return 'easy';
    if (score < 150) return 'medium';
    if (score < 400) return 'hard';
    return 'expert';
  }

  private estimateReviewTime(files: number, lines: number, difficulty: string): number {
    const baseTime = 10;
    const perFileTime = 3;
    const perLineTime = 0.05;
    const multiplier = { easy: 1, medium: 1.2, hard: 1.5, expert: 2 }[difficulty] || 1;

    return Math.round((baseTime + files * perFileTime + lines * perLineTime) * multiplier);
  }

  private calculatePoints(
    files: number,
    lines: number,
    difficulty: 'easy' | 'medium' | 'hard' | 'expert',
    priority: 'low' | 'normal' | 'high' | 'urgent'
  ): { points: number; bonusPoints: number } {
    const config = DEFAULT_POINTS_CONFIG;
    let points = config.basePoints + files * config.perFilePoints + Math.round(lines * config.perLinePoints);
    points = Math.round(points * config.difficultyMultipliers[difficulty]);

    let bonusPoints = config.quickTurnaroundBonus;
    if (priority === 'high') bonusPoints += config.highPriorityBonus;
    if (priority === 'urgent') bonusPoints += config.urgentPriorityBonus;

    return { points, bonusPoints };
  }

  private calculateLevel(points: number): number {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (points >= LEVELS[i].pointsRequired) {
        return LEVELS[i].level;
      }
    }
    return 1;
  }

  private async updateReviewerStats(login: string, points: number, reviewTimeMinutes: number): Promise<void> {
    const profile = await dbAny.reviewerProfile.findUnique({ where: { login } });
    if (!profile) return;

    const newTotal = profile.totalReviews + 1;
    const newAvgTime = (profile.avgReviewTime * profile.totalReviews + reviewTimeMinutes) / newTotal;

    await dbAny.reviewerProfile.update({
      where: { login },
      data: {
        totalPoints: { increment: points },
        totalReviews: { increment: 1 },
        weeklyReviews: { increment: 1 },
        monthlyReviews: { increment: 1 },
        avgReviewTime: newAvgTime,
        currentStreak: { increment: 1 }, // Simplified; would need date tracking
        longestStreak: Math.max(profile.longestStreak, profile.currentStreak + 1),
      },
    });
  }

  private async checkAndAwardBadges(login: string): Promise<Badge[]> {
    const newBadges: Badge[] = [];
    const profile = await dbAny.reviewerProfile.findUnique({
      where: { login },
      include: { badges: true },
    });

    if (!profile) return [];

    const existingBadges = new Set(profile.badges.map((b: { type: string }) => b.type));

    // First review badge
    if (profile.totalReviews === 1 && !existingBadges.has('first_review')) {
      await db.reviewerBadge.create({
        data: { profileId: profile.id, type: 'first_review' },
      });
      newBadges.push({ ...BADGE_DEFINITIONS.first_review, earnedAt: new Date() });
    }

    // Century club
    if (profile.totalReviews >= 100 && !existingBadges.has('century_club')) {
      await db.reviewerBadge.create({
        data: { profileId: profile.id, type: 'century_club' },
      });
      newBadges.push({ ...BADGE_DEFINITIONS.century_club, earnedAt: new Date() });
    }

    // Week streak
    if (profile.currentStreak >= 7 && !existingBadges.has('streak_7')) {
      await db.reviewerBadge.create({
        data: { profileId: profile.id, type: 'streak_7' },
      });
      newBadges.push({ ...BADGE_DEFINITIONS.streak_7, earnedAt: new Date() });
    }

    return newBadges;
  }

  private mapListing(listing: {
    id: string;
    prNumber: number;
    title: string;
    author: string;
    status: string;
    estimatedMinutes: number;
    points: number;
    bonusPoints: number;
    requiredSkills: string[];
    difficulty: string;
    priority: string;
    filesChanged: number;
    linesChanged: number;
    createdAt: Date;
    claimDeadline: Date;
    claimedBy: string | null;
    claimedAt: Date | null;
    tags: string[];
  }, owner: string, repo: string): ReviewListing {
    return {
      id: listing.id,
      repository: { owner, name: repo, fullName: `${owner}/${repo}` },
      prNumber: listing.prNumber,
      title: listing.title,
      author: listing.author,
      status: listing.status as ClaimStatus,
      estimatedMinutes: listing.estimatedMinutes,
      points: listing.points,
      bonusPoints: listing.bonusPoints,
      requiredSkills: listing.requiredSkills as SkillCategory[],
      difficulty: listing.difficulty as ReviewListing['difficulty'],
      priority: listing.priority as ReviewListing['priority'],
      filesChanged: listing.filesChanged,
      linesChanged: listing.linesChanged,
      createdAt: listing.createdAt,
      claimDeadline: listing.claimDeadline,
      claimedBy: listing.claimedBy || undefined,
      claimedAt: listing.claimedAt || undefined,
      tags: listing.tags,
    };
  }

  private mapClaim(claim: {
    id: string;
    listingId: string;
    reviewerLogin: string;
    status: string;
    claimedAt: Date;
    deadline: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    pointsEarned: number;
    bonusEarned: number;
    qualityScore: number | null;
    feedback: string | null;
  }): ReviewClaim {
    return {
      id: claim.id,
      listingId: claim.listingId,
      reviewerLogin: claim.reviewerLogin,
      status: claim.status as ClaimStatus,
      claimedAt: claim.claimedAt,
      deadline: claim.deadline,
      startedAt: claim.startedAt || undefined,
      completedAt: claim.completedAt || undefined,
      pointsEarned: claim.pointsEarned,
      bonusEarned: claim.bonusEarned,
      qualityScore: claim.qualityScore || undefined,
      feedback: claim.feedback || undefined,
    };
  }
}

export const marketplaceService = new MarketplaceService();
