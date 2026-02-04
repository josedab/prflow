/**
 * @fileoverview Types for Developer Gamification Engine.
 *
 * This module implements gamification features to increase developer
 * engagement with code review, including badges, achievements,
 * leaderboards, and challenges.
 *
 * @module models/gamification
 */

// ============================================
// Badge Types
// ============================================

/**
 * Categories of badges
 */
export type BadgeCategory =
  | 'review'       // Code review activities
  | 'quality'      // Code quality contributions
  | 'speed'        // Fast turnaround times
  | 'mentorship'   // Helping others
  | 'security'     // Security-related achievements
  | 'testing'      // Test-related achievements
  | 'documentation'// Documentation contributions
  | 'teamwork'     // Collaboration achievements
  | 'streak'       // Consistency achievements
  | 'special';     // Special/rare achievements

/**
 * Rarity levels for gamification badges
 */
export type GamificationBadgeRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

/**
 * A gamification badge that can be earned
 */
export interface GamificationBadge {
  /** Unique badge identifier */
  id: string;
  /** Display name */
  name: string;
  /** Description of how to earn it */
  description: string;
  /** Badge category */
  category: BadgeCategory;
  /** Rarity level */
  rarity: GamificationBadgeRarity;
  /** Emoji icon for the badge */
  icon: string;
  /** Points awarded for earning this badge */
  points: number;
  /** Criteria to earn this badge */
  criteria: GamificationBadgeCriteria;
  /** Whether this badge can be earned multiple times */
  repeatable: boolean;
  /** Maximum times it can be earned (if repeatable) */
  maxRepeats?: number;
}

/**
 * Criteria for earning a gamification badge
 */
export interface GamificationBadgeCriteria {
  /** Type of criteria */
  type: 'count' | 'streak' | 'threshold' | 'special';
  /** Metric to track */
  metric: string;
  /** Target value to achieve */
  target: number;
  /** Time period (if applicable) */
  period?: 'day' | 'week' | 'month' | 'all_time';
  /** Additional conditions */
  conditions?: Record<string, unknown>;
}

/**
 * A gamification badge earned by a user
 */
export interface GamificationEarnedBadge {
  /** Badge that was earned */
  badge: GamificationBadge;
  /** User who earned it */
  userId: string;
  /** When it was earned */
  earnedAt: Date;
  /** Context about how it was earned */
  context?: {
    prNumber?: number;
    repositoryId?: string;
    value?: number;
  };
  /** Times earned (if repeatable) */
  earnCount: number;
}

// ============================================
// Pre-defined Badges
// ============================================

export const PREDEFINED_GAMIFICATION_BADGES: GamificationBadge[] = [
  // Review Badges
  {
    id: 'first-review',
    name: 'First Steps',
    description: 'Complete your first code review',
    category: 'review',
    rarity: 'common',
    icon: '👣',
    points: 10,
    criteria: { type: 'count', metric: 'reviews_completed', target: 1 },
    repeatable: false,
  },
  {
    id: 'review-10',
    name: 'Reviewer',
    description: 'Complete 10 code reviews',
    category: 'review',
    rarity: 'common',
    icon: '👁️',
    points: 50,
    criteria: { type: 'count', metric: 'reviews_completed', target: 10 },
    repeatable: false,
  },
  {
    id: 'review-100',
    name: 'Code Guardian',
    description: 'Complete 100 code reviews',
    category: 'review',
    rarity: 'rare',
    icon: '🛡️',
    points: 200,
    criteria: { type: 'count', metric: 'reviews_completed', target: 100 },
    repeatable: false,
  },
  {
    id: 'review-500',
    name: 'Sentinel',
    description: 'Complete 500 code reviews',
    category: 'review',
    rarity: 'epic',
    icon: '⚔️',
    points: 500,
    criteria: { type: 'count', metric: 'reviews_completed', target: 500 },
    repeatable: false,
  },

  // Quality Badges
  {
    id: 'bug-hunter',
    name: 'Bug Hunter',
    description: 'Find 10 bugs during code review',
    category: 'quality',
    rarity: 'uncommon',
    icon: '🐛',
    points: 100,
    criteria: { type: 'count', metric: 'bugs_found', target: 10 },
    repeatable: true,
    maxRepeats: 10,
  },
  {
    id: 'quality-champion',
    name: 'Quality Champion',
    description: 'Have 95%+ of your comments marked helpful',
    category: 'quality',
    rarity: 'rare',
    icon: '🏆',
    points: 250,
    criteria: { type: 'threshold', metric: 'helpful_comment_rate', target: 0.95 },
    repeatable: false,
  },

  // Speed Badges
  {
    id: 'speed-demon',
    name: 'Speed Demon',
    description: 'Review a PR within 30 minutes of assignment',
    category: 'speed',
    rarity: 'uncommon',
    icon: '⚡',
    points: 30,
    criteria: { type: 'threshold', metric: 'review_time_minutes', target: 30 },
    repeatable: true,
    maxRepeats: 50,
  },
  {
    id: 'flash-reviewer',
    name: 'Flash Reviewer',
    description: 'Review 5 PRs in a single day',
    category: 'speed',
    rarity: 'rare',
    icon: '🏃',
    points: 75,
    criteria: { type: 'count', metric: 'daily_reviews', target: 5, period: 'day' },
    repeatable: true,
    maxRepeats: 30,
  },

  // Security Badges
  {
    id: 'security-scout',
    name: 'Security Scout',
    description: 'Identify your first security vulnerability',
    category: 'security',
    rarity: 'uncommon',
    icon: '🔐',
    points: 75,
    criteria: { type: 'count', metric: 'security_issues_found', target: 1 },
    repeatable: false,
  },
  {
    id: 'security-sentinel',
    name: 'Security Sentinel',
    description: 'Identify 25 security vulnerabilities',
    category: 'security',
    rarity: 'epic',
    icon: '🛡️',
    points: 400,
    criteria: { type: 'count', metric: 'security_issues_found', target: 25 },
    repeatable: false,
  },

  // Mentorship Badges
  {
    id: 'mentor',
    name: 'Mentor',
    description: 'Help 5 junior developers with their PRs',
    category: 'mentorship',
    rarity: 'rare',
    icon: '🎓',
    points: 150,
    criteria: { type: 'count', metric: 'juniors_helped', target: 5 },
    repeatable: true,
    maxRepeats: 20,
  },
  {
    id: 'helpful-comment',
    name: 'Helpful Hand',
    description: 'Receive 50 "helpful" reactions on your comments',
    category: 'mentorship',
    rarity: 'uncommon',
    icon: '🙏',
    points: 100,
    criteria: { type: 'count', metric: 'helpful_reactions', target: 50 },
    repeatable: true,
    maxRepeats: 10,
  },

  // Documentation Badges
  {
    id: 'doc-hero',
    name: 'Documentation Hero',
    description: 'Suggest 10 documentation improvements',
    category: 'documentation',
    rarity: 'uncommon',
    icon: '📚',
    points: 80,
    criteria: { type: 'count', metric: 'doc_suggestions', target: 10 },
    repeatable: true,
    maxRepeats: 10,
  },

  // Testing Badges
  {
    id: 'test-advocate',
    name: 'Test Advocate',
    description: 'Request test coverage on 20 PRs',
    category: 'testing',
    rarity: 'uncommon',
    icon: '🧪',
    points: 60,
    criteria: { type: 'count', metric: 'test_coverage_requests', target: 20 },
    repeatable: true,
    maxRepeats: 5,
  },

  // Streak Badges
  {
    id: 'streak-7',
    name: 'Week Warrior',
    description: 'Review PRs for 7 consecutive days',
    category: 'streak',
    rarity: 'uncommon',
    icon: '🔥',
    points: 70,
    criteria: { type: 'streak', metric: 'daily_review_streak', target: 7 },
    repeatable: true,
    maxRepeats: 52,
  },
  {
    id: 'streak-30',
    name: 'Month Master',
    description: 'Review PRs for 30 consecutive days',
    category: 'streak',
    rarity: 'rare',
    icon: '🌟',
    points: 300,
    criteria: { type: 'streak', metric: 'daily_review_streak', target: 30 },
    repeatable: true,
    maxRepeats: 12,
  },
  {
    id: 'streak-100',
    name: 'Centurion',
    description: 'Review PRs for 100 consecutive days',
    category: 'streak',
    rarity: 'legendary',
    icon: '💎',
    points: 1000,
    criteria: { type: 'streak', metric: 'daily_review_streak', target: 100 },
    repeatable: false,
  },

  // Special Badges
  {
    id: 'night-owl',
    name: 'Night Owl',
    description: 'Complete a review between midnight and 5 AM',
    category: 'special',
    rarity: 'uncommon',
    icon: '🦉',
    points: 25,
    criteria: { type: 'special', metric: 'late_night_review', target: 1 },
    repeatable: true,
    maxRepeats: 10,
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    description: 'Complete a review before 7 AM',
    category: 'special',
    rarity: 'uncommon',
    icon: '🐦',
    points: 25,
    criteria: { type: 'special', metric: 'early_morning_review', target: 1 },
    repeatable: true,
    maxRepeats: 10,
  },
  {
    id: 'weekend-warrior',
    name: 'Weekend Warrior',
    description: 'Review 10 PRs on weekends',
    category: 'special',
    rarity: 'rare',
    icon: '🦸',
    points: 150,
    criteria: { type: 'count', metric: 'weekend_reviews', target: 10 },
    repeatable: true,
    maxRepeats: 10,
  },
];

// ============================================
// Leaderboard Types
// ============================================

/**
 * Time period for leaderboards
 */
export type LeaderboardPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all_time';

/**
 * Leaderboard category
 */
export type LeaderboardCategory = 
  | 'reviews'
  | 'bugs_found'
  | 'helpful_comments'
  | 'points'
  | 'streak'
  | 'speed';

/**
 * A user's position on a gamification leaderboard
 */
export interface GamificationLeaderboardEntry {
  /** User ID */
  userId: string;
  /** User display name */
  displayName: string;
  /** User avatar URL */
  avatarUrl?: string;
  /** Rank position (1-indexed) */
  rank: number;
  /** Score/value for this leaderboard */
  score: number;
  /** Change from previous period */
  change: number;
  /** Trend direction */
  trend: 'up' | 'down' | 'same' | 'new';
}

/**
 * A complete gamification leaderboard
 */
export interface GamificationLeaderboard {
  /** Leaderboard category */
  category: LeaderboardCategory;
  /** Time period */
  period: LeaderboardPeriod;
  /** Repository or organization scope */
  scope: {
    type: 'repository' | 'organization' | 'global';
    id?: string;
  };
  /** Entries on the leaderboard */
  entries: GamificationLeaderboardEntry[];
  /** When this was last updated */
  updatedAt: Date;
  /** Total participants */
  totalParticipants: number;
}

// ============================================
// Challenge Types
// ============================================

/**
 * A challenge that teams can participate in
 */
export interface GamificationChallenge {
  /** Unique challenge ID */
  id: string;
  /** Challenge name */
  name: string;
  /** Challenge description */
  description: string;
  /** Goal to achieve */
  goal: {
    metric: string;
    target: number;
    type: 'individual' | 'team' | 'organization';
  };
  /** Reward for completing */
  reward: {
    points: number;
    badge?: GamificationBadge;
    customReward?: string;
  };
  /** Start time */
  startDate: Date;
  /** End time */
  endDate: Date;
  /** Current progress */
  progress: {
    current: number;
    percentage: number;
  };
  /** Status */
  status: 'upcoming' | 'active' | 'completed' | 'failed';
  /** Participants */
  participants: string[];
}

// ============================================
// User Stats Types
// ============================================

/**
 * Comprehensive stats for a user
 */
export interface UserGamificationStats {
  /** User ID */
  userId: string;
  /** Total points earned */
  totalPoints: number;
  /** Current level */
  level: number;
  /** Points needed for next level */
  pointsToNextLevel: number;
  /** All earned badges */
  badges: GamificationEarnedBadge[];
  /** Active streaks */
  streaks: {
    dailyReview: number;
    weeklyReview: number;
    qualityReview: number;
  };
  /** Activity stats */
  stats: {
    reviewsCompleted: number;
    bugsFound: number;
    securityIssuesFound: number;
    helpfulComments: number;
    commentsTotal: number;
    prsAuthored: number;
    avgReviewTimeMinutes: number;
  };
  /** Current ranks on leaderboards */
  ranks: {
    category: LeaderboardCategory;
    period: LeaderboardPeriod;
    rank: number;
    percentile: number;
  }[];
  /** Active challenges */
  activeChallenges: GamificationChallenge[];
  /** Last activity */
  lastActivityAt: Date;
}

// ============================================
// Events for Gamification
// ============================================

/**
 * Types of gamification events
 */
export type GamificationEventType =
  | 'review_completed'
  | 'review_approved'
  | 'review_requested_changes'
  | 'comment_posted'
  | 'comment_helpful'
  | 'bug_found'
  | 'security_issue_found'
  | 'pr_merged'
  | 'test_suggestion_accepted'
  | 'doc_improvement_accepted'
  | 'streak_updated'
  | 'badge_earned'
  | 'level_up'
  | 'challenge_progress';

/**
 * A gamification event
 */
export interface GamificationEvent {
  /** Event type */
  type: GamificationEventType;
  /** User who triggered the event */
  userId: string;
  /** Repository context */
  repositoryId: string;
  /** PR context (if applicable) */
  prNumber?: number;
  /** Event data */
  data: Record<string, unknown>;
  /** Points awarded (if any) */
  pointsAwarded?: number;
  /** Badge earned (if any) */
  badgeEarned?: GamificationBadge;
  /** When this happened */
  timestamp: Date;
}

// ============================================
// Level System
// ============================================

/**
 * Level thresholds
 */
export const LEVEL_THRESHOLDS: number[] = [
  0,      // Level 1
  100,    // Level 2
  250,    // Level 3
  500,    // Level 4
  1000,   // Level 5
  2000,   // Level 6
  3500,   // Level 7
  5500,   // Level 8
  8000,   // Level 9
  12000,  // Level 10
  18000,  // Level 11
  26000,  // Level 12
  36000,  // Level 13
  50000,  // Level 14
  70000,  // Level 15 (max)
];

/**
 * Level titles
 */
export const LEVEL_TITLES: string[] = [
  'Newcomer',
  'Apprentice',
  'Reviewer',
  'Inspector',
  'Analyst',
  'Expert',
  'Specialist',
  'Senior Reviewer',
  'Master Reviewer',
  'Guardian',
  'Sentinel',
  'Champion',
  'Legend',
  'Mythic',
  'Transcendent',
];

/**
 * Calculate level from points
 */
export function calculateLevel(points: number): { level: number; title: string; pointsToNext: number } {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (points >= LEVEL_THRESHOLDS[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  
  const nextThreshold = LEVEL_THRESHOLDS[level] || LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  
  return {
    level,
    title: LEVEL_TITLES[level - 1] || LEVEL_TITLES[LEVEL_TITLES.length - 1],
    pointsToNext: Math.max(0, nextThreshold - points),
  };
}
