/**
 * @fileoverview Developer Growth Dashboard & Review Mentoring Models
 *
 * Types for individual developer growth tracking, skill trajectory
 * analysis, mentoring mode configuration, and personalized learning.
 *
 * @module models/developer-growth
 */

// ============================================
// Growth Tracking Types
// ============================================

/**
 * Developer growth profile
 */
export interface DeveloperGrowthProfile {
  /** Developer login */
  login: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Overall growth score (0-100) */
  growthScore: number;
  /** Skill radar chart data */
  skillRadar: SkillRadarData;
  /** Growth trajectory */
  trajectory: GrowthTrajectory;
  /** Recurring review issues */
  recurringIssues: RecurringIssue[];
  /** Knowledge gaps */
  knowledgeGaps: KnowledgeGap[];
  /** Achievements */
  achievements: DeveloperAchievement[];
  /** Mentoring relationships */
  mentoringRelationships: MentoringRelationship[];
  /** Personalized recommendations */
  recommendations: GrowthRecommendation[];
  /** Profile updated at */
  updatedAt: Date;
}

/**
 * Skill radar chart data
 */
export interface SkillRadarData {
  /** Axes (skill categories) */
  axes: Array<{
    /** Category name */
    name: string;
    /** Current score (0-100) */
    current: number;
    /** Previous period score */
    previous: number;
    /** Team average */
    teamAverage: number;
  }>;
}

/**
 * Growth trajectory over time
 */
export interface GrowthTrajectory {
  /** Data points */
  dataPoints: Array<{
    /** Date */
    date: Date;
    /** Overall score */
    overallScore: number;
    /** Score by category */
    byCategory: Record<string, number>;
  }>;
  /** Trend direction */
  trend: 'accelerating' | 'steady' | 'slowing' | 'declining';
  /** Predicted score in 90 days */
  predictedScore90Days: number;
  /** Key milestones reached */
  milestones: Array<{ date: Date; milestone: string }>;
}

// ============================================
// Issue Tracking Types
// ============================================

/**
 * A recurring review issue for a developer
 */
export interface RecurringIssue {
  /** Issue pattern */
  pattern: string;
  /** Category */
  category: string;
  /** Occurrence count */
  occurrences: number;
  /** First seen */
  firstSeen: Date;
  /** Last seen */
  lastSeen: Date;
  /** Trend */
  trend: 'increasing' | 'stable' | 'decreasing' | 'resolved';
  /** Severity */
  severity: 'low' | 'medium' | 'high';
  /** Learning resources */
  resources: string[];
  /** Example PRs */
  examplePRs: number[];
}

/**
 * A knowledge gap
 */
export interface KnowledgeGap {
  /** Area */
  area: string;
  /** Category */
  category: string;
  /** Gap severity */
  severity: 'minor' | 'moderate' | 'significant';
  /** Evidence (why we think this is a gap) */
  evidence: string;
  /** Recommended learning path */
  learningPath: string[];
  /** Mentors available */
  availableMentors: string[];
}

// ============================================
// Achievement Types
// ============================================

/**
 * A developer achievement
 */
export interface DeveloperAchievement {
  /** Achievement ID */
  id: string;
  /** Achievement name */
  name: string;
  /** Description */
  description: string;
  /** Category */
  category: 'quality' | 'velocity' | 'collaboration' | 'learning' | 'mentoring';
  /** Icon/badge */
  badge: string;
  /** Earned at */
  earnedAt: Date;
  /** Criteria met */
  criteria: string;
}

// ============================================
// Mentoring Types
// ============================================

/**
 * A mentoring relationship
 */
export interface MentoringRelationship {
  /** Relationship ID */
  id: string;
  /** Mentor login */
  mentor: string;
  /** Mentee login */
  mentee: string;
  /** Skills being mentored */
  focusSkills: string[];
  /** Status */
  status: 'active' | 'completed' | 'paused';
  /** Sessions count */
  sessionsCount: number;
  /** Started at */
  startedAt: Date;
  /** Effectiveness score */
  effectivenessScore?: number;
}

/**
 * Mentoring mode configuration
 */
export interface MentoringModeConfig {
  /** Mentor login */
  mentor: string;
  /** Enabled */
  enabled: boolean;
  /** Mentoring style */
  style: 'educational' | 'socratic' | 'directive' | 'collaborative';
  /** Topics to focus on */
  focusTopics: string[];
  /** Severity threshold for educational comments */
  severityThreshold: 'all' | 'medium_and_above' | 'high_and_above';
  /** Include code examples */
  includeExamples: boolean;
  /** Include resource links */
  includeResources: boolean;
  /** Max mentoring comments per PR */
  maxCommentsPerPR: number;
}

// ============================================
// Growth Recommendation Types
// ============================================

/**
 * A personalized growth recommendation
 */
export interface GrowthRecommendation {
  /** Recommendation ID */
  id: string;
  /** Type */
  type: 'skill_building' | 'practice' | 'reading' | 'mentoring' | 'project';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high';
  /** Effort */
  effort: 'small' | 'medium' | 'large';
  /** Expected impact */
  expectedImpact: string;
  /** Related skills */
  relatedSkills: string[];
  /** Status */
  status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
}

// ============================================
// Team Growth Types
// ============================================

/**
 * Team growth overview (for managers)
 */
export interface TeamGrowthOverview {
  /** Team ID */
  teamId: string;
  /** Team name */
  teamName: string;
  /** Period */
  period: { start: Date; end: Date };
  /** Member growth summaries */
  memberSummaries: Array<{
    login: string;
    displayName: string;
    growthScore: number;
    trend: 'accelerating' | 'steady' | 'slowing' | 'declining';
    topImprovement: string;
    mainGap: string;
  }>;
  /** Team-wide skill gaps */
  teamGaps: KnowledgeGap[];
  /** Active mentoring pairs */
  activeMentoringPairs: number;
  /** Average growth score */
  avgGrowthScore: number;
  /** Growth score trend */
  growthTrend: 'improving' | 'stable' | 'declining';
  /** Recommendations for the team */
  teamRecommendations: string[];
  /** Generated at */
  generatedAt: Date;
}
