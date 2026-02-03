/**
 * @fileoverview Review Delegation Marketplace Models
 * 
 * Types and interfaces for the internal marketplace where team members
 * can claim PR reviews with gamification elements.
 * 
 * @module models/marketplace
 */

import { z } from 'zod';

/**
 * Status of a review claim
 */
export const ClaimStatusSchema = z.enum([
  'available',
  'claimed',
  'in_progress',
  'completed',
  'expired',
  'cancelled',
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;

/**
 * Badge types for gamification
 */
export const BadgeTypeSchema = z.enum([
  'first_review',
  'speed_demon',
  'thorough_reviewer',
  'helpful_comments',
  'security_expert',
  'documentation_hero',
  'test_champion',
  'mentor',
  'streak_7',
  'streak_30',
  'century_club',
  'top_reviewer_weekly',
  'top_reviewer_monthly',
]);
export type BadgeType = z.infer<typeof BadgeTypeSchema>;

/**
 * Skill categories for matching
 */
export const ReviewerSkillCategorySchema = z.enum([
  'frontend',
  'backend',
  'database',
  'infrastructure',
  'security',
  'performance',
  'testing',
  'documentation',
  'api_design',
  'mobile',
  'devops',
  'machine_learning',
]);
export type ReviewerSkillCategory = z.infer<typeof ReviewerSkillCategorySchema>;

/**
 * A review listing in the marketplace
 */
export interface ReviewListing {
  /** Unique listing ID */
  id: string;
  /** Repository information */
  repository: {
    owner: string;
    name: string;
    fullName: string;
  };
  /** PR number */
  prNumber: number;
  /** PR title */
  title: string;
  /** PR author */
  author: string;
  /** Current status */
  status: ClaimStatus;
  /** Estimated review time (minutes) */
  estimatedMinutes: number;
  /** Points awarded for completion */
  points: number;
  /** Bonus points for quick turnaround */
  bonusPoints: number;
  /** Required skills */
  requiredSkills: ReviewerSkillCategory[];
  /** Difficulty level */
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  /** Priority level */
  priority: 'low' | 'normal' | 'high' | 'urgent';
  /** Files changed count */
  filesChanged: number;
  /** Lines changed */
  linesChanged: number;
  /** When the listing was created */
  createdAt: Date;
  /** Deadline for claiming */
  claimDeadline: Date;
  /** Who claimed it (if claimed) */
  claimedBy?: string;
  /** When it was claimed */
  claimedAt?: Date;
  /** Tags for filtering */
  tags: string[];
}

/**
 * A review claim
 */
export interface ReviewClaim {
  /** Unique claim ID */
  id: string;
  /** Listing ID */
  listingId: string;
  /** Reviewer who claimed */
  reviewerLogin: string;
  /** Status of the claim */
  status: ClaimStatus;
  /** When claimed */
  claimedAt: Date;
  /** Deadline for completion */
  deadline: Date;
  /** When review started */
  startedAt?: Date;
  /** When review completed */
  completedAt?: Date;
  /** Points earned */
  pointsEarned: number;
  /** Bonus earned */
  bonusEarned: number;
  /** Quality score (from feedback) */
  qualityScore?: number;
  /** Feedback from PR author */
  feedback?: string;
}

/**
 * Reviewer statistics and profile
 */
export interface ReviewerProfile {
  /** GitHub login */
  login: string;
  /** Display name */
  name?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Total points */
  totalPoints: number;
  /** Current level */
  level: number;
  /** Points to next level */
  pointsToNextLevel: number;
  /** Current streak (consecutive days with reviews) */
  currentStreak: number;
  /** Longest streak */
  longestStreak: number;
  /** Total reviews completed */
  totalReviews: number;
  /** Reviews this week */
  weeklyReviews: number;
  /** Reviews this month */
  monthlyReviews: number;
  /** Average review time (minutes) */
  avgReviewTime: number;
  /** Average quality score */
  avgQualityScore: number;
  /** Badges earned */
  badges: Badge[];
  /** Skills with proficiency */
  skills: ReviewerSkill[];
  /** Rank on leaderboard */
  rank?: number;
  /** Availability status */
  availability: 'available' | 'busy' | 'away';
  /** Preferred review times */
  preferredTimes?: string[];
  /** Max concurrent reviews */
  maxConcurrentReviews: number;
  /** Current active claims */
  activeClaimsCount: number;
}

/**
 * A badge earned by a reviewer
 */
export interface Badge {
  /** Badge type */
  type: BadgeType;
  /** Display name */
  name: string;
  /** Description */
  description: string;
  /** Icon/emoji */
  icon: string;
  /** When earned */
  earnedAt: Date;
  /** Rarity level */
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

/**
 * Reviewer skill with proficiency
 */
export interface ReviewerSkill {
  /** Skill category */
  category: ReviewerSkillCategory;
  /** Proficiency level (0-100) */
  proficiency: number;
  /** Reviews in this category */
  reviewCount: number;
  /** Last used */
  lastUsedAt?: Date;
  /** Verified by */
  verifiedBy?: string[];
}

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  /** Rank */
  rank: number;
  /** Reviewer login */
  login: string;
  /** Display name */
  name?: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Total points */
  points: number;
  /** Reviews completed */
  reviewsCompleted: number;
  /** Average quality */
  avgQuality: number;
  /** Level */
  level: number;
  /** Change from previous period */
  rankChange: number;
  /** Featured badges */
  featuredBadges: BadgeType[];
}

/**
 * Leaderboard with entries
 */
export interface Leaderboard {
  /** Period type */
  period: 'daily' | 'weekly' | 'monthly' | 'all_time';
  /** Repository (optional, for repo-specific boards) */
  repository?: string;
  /** Team (optional, for team-specific boards) */
  team?: string;
  /** Entries */
  entries: LeaderboardEntry[];
  /** Last updated */
  updatedAt: Date;
  /** Your position (if authenticated) */
  yourPosition?: LeaderboardEntry;
}

/**
 * Points configuration
 */
export interface PointsConfig {
  /** Base points per review */
  basePoints: number;
  /** Points per file reviewed */
  perFilePoints: number;
  /** Points per line changed */
  perLinePoints: number;
  /** Bonus for quick turnaround */
  quickTurnaroundBonus: number;
  /** Quick turnaround threshold (minutes) */
  quickTurnaroundMinutes: number;
  /** Bonus for high priority */
  highPriorityBonus: number;
  /** Bonus for urgent priority */
  urgentPriorityBonus: number;
  /** Penalty for expired claim */
  expiredPenalty: number;
  /** Multipliers by difficulty */
  difficultyMultipliers: {
    easy: number;
    medium: number;
    hard: number;
    expert: number;
  };
}

/**
 * Level configuration
 */
export interface LevelConfig {
  /** Level number */
  level: number;
  /** Display name */
  name: string;
  /** Points required */
  pointsRequired: number;
  /** Perks unlocked */
  perks: string[];
}

/**
 * Marketplace statistics
 */
export interface MarketplaceStats {
  /** Total active listings */
  activeListings: number;
  /** Claimed but not completed */
  inProgressReviews: number;
  /** Completed today */
  completedToday: number;
  /** Average claim time */
  avgClaimTimeMinutes: number;
  /** Average completion time */
  avgCompletionTimeMinutes: number;
  /** Top categories */
  topCategories: Array<{ category: ReviewerSkillCategory; count: number }>;
  /** Reviews by priority */
  byPriority: {
    low: number;
    normal: number;
    high: number;
    urgent: number;
  };
}

/**
 * Notification for marketplace events
 */
export interface MarketplaceNotification {
  /** Notification ID */
  id: string;
  /** Recipient login */
  recipientLogin: string;
  /** Notification type */
  type: 'new_listing' | 'claim_reminder' | 'deadline_approaching' | 'badge_earned' | 'level_up' | 'feedback_received';
  /** Title */
  title: string;
  /** Message */
  message: string;
  /** Related listing ID */
  listingId?: string;
  /** Read status */
  read: boolean;
  /** Created at */
  createdAt: Date;
}

/**
 * Filter options for marketplace
 */
export interface MarketplaceFilter {
  /** Status filter */
  status?: ClaimStatus[];
  /** Skill filter */
  skills?: ReviewerSkillCategory[];
  /** Difficulty filter */
  difficulty?: ('easy' | 'medium' | 'hard' | 'expert')[];
  /** Priority filter */
  priority?: ('low' | 'normal' | 'high' | 'urgent')[];
  /** Repository filter */
  repository?: string;
  /** Max estimated time */
  maxMinutes?: number;
  /** Min points */
  minPoints?: number;
  /** Tags filter */
  tags?: string[];
}
