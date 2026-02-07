/**
 * @fileoverview Developer Skill Profiler Models
 *
 * Types for analyzing developer skills from PR contributions,
 * creating skill matrices, and matching reviewers to PRs based
 * on expertise.
 *
 * @module models/developer-skill-profiler
 */

// ============================================
// Skill Types
// ============================================

/**
 * Skill category
 */
export type SkillProfileCategory =
  | 'language'
  | 'framework'
  | 'domain'
  | 'infrastructure'
  | 'testing'
  | 'security'
  | 'database'
  | 'devops'
  | 'architecture';

/**
 * Skill proficiency level
 */
export type SkillProficiencyLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/**
 * A skill definition
 */
export interface Skill {
  /** Skill ID */
  id: string;
  /** Skill name */
  name: string;
  /** Category */
  category: SkillProfileCategory;
  /** Description */
  description?: string;
  /** Related skills */
  relatedSkills?: string[];
  /** Aliases (for matching) */
  aliases?: string[];
}

// ============================================
// Developer Profile Types
// ============================================

/**
 * Developer skill profile
 */
export interface SkillDeveloperProfile {
  /** Developer login */
  login: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Email */
  email?: string;
  /** Overall skill score (0-100) */
  overallScore: number;
  /** Skills with proficiency */
  skills: DeveloperSkill[];
  /** Skill summary by category */
  skillSummary: SkillSummary[];
  /** Contribution metrics */
  contributions: ContributionMetrics;
  /** Growth trajectory */
  growth: GrowthMetrics;
  /** Expertise areas */
  expertiseAreas: ExpertiseArea[];
  /** Learning opportunities */
  learningOpportunities: LearningOpportunity[];
  /** Profile last updated */
  lastUpdatedAt: Date;
}

/**
 * A developer's skill with proficiency
 */
export interface DeveloperSkill {
  /** Skill */
  skill: Skill;
  /** Proficiency level */
  proficiency: SkillProficiencyLevel;
  /** Proficiency score (0-100) */
  score: number;
  /** Evidence count (PRs, commits, reviews) */
  evidenceCount: number;
  /** Last demonstrated */
  lastDemonstrated: Date;
  /** Trend */
  trend: 'growing' | 'stable' | 'declining';
  /** Confidence in assessment */
  confidence: number;
}

/**
 * Skill summary by category
 */
export interface SkillSummary {
  /** Category */
  category: SkillProfileCategory;
  /** Average proficiency */
  avgProficiency: number;
  /** Top skills */
  topSkills: Array<{ name: string; score: number }>;
  /** Skill count */
  skillCount: number;
}

/**
 * Contribution metrics
 */
export interface ContributionMetrics {
  /** Total PRs */
  totalPRs: number;
  /** PRs merged */
  prsMerged: number;
  /** Total commits */
  totalCommits: number;
  /** Lines of code added */
  linesAdded: number;
  /** Lines of code removed */
  linesRemoved: number;
  /** Reviews performed */
  reviewsPerformed: number;
  /** Average PR complexity */
  avgPRComplexity: number;
  /** Active repositories */
  activeRepositories: number;
  /** Period start */
  periodStart: Date;
  /** Period end */
  periodEnd: Date;
}

/**
 * Growth metrics
 */
export interface GrowthMetrics {
  /** Overall growth rate */
  overallGrowthRate: number;
  /** Skills acquired (last 90 days) */
  skillsAcquired: number;
  /** Skills improved (last 90 days) */
  skillsImproved: number;
  /** Proficiency increases */
  proficiencyIncreases: Array<{
    skill: string;
    from: SkillProficiencyLevel;
    to: SkillProficiencyLevel;
    date: Date;
  }>;
  /** Learning velocity (skills per month) */
  learningVelocity: number;
  /** Growth trend */
  trend: 'accelerating' | 'steady' | 'slowing';
}

/**
 * Expertise area
 */
export interface ExpertiseArea {
  /** Area name */
  name: string;
  /** Category */
  category: SkillProfileCategory;
  /** Description */
  description: string;
  /** Related skills */
  skills: string[];
  /** Expertise level */
  level: SkillProficiencyLevel;
  /** Confidence */
  confidence: number;
}

/**
 * Learning opportunity
 */
export interface LearningOpportunity {
  /** Opportunity ID */
  id: string;
  /** Skill to learn */
  skill: Skill;
  /** Why recommended */
  reason: string;
  /** Current proficiency */
  currentProficiency: SkillProficiencyLevel | null;
  /** Target proficiency */
  targetProficiency: SkillProficiencyLevel;
  /** Estimated effort */
  estimatedEffort: 'small' | 'medium' | 'large';
  /** Impact on career */
  careerImpact: 'low' | 'medium' | 'high';
  /** Suggested resources */
  resources?: string[];
}

// ============================================
// Skill Matrix Types
// ============================================

/**
 * Team skill matrix
 */
export interface TeamSkillMatrix {
  /** Team ID */
  teamId: string;
  /** Team name */
  teamName: string;
  /** Members */
  members: SkillDeveloperProfile[];
  /** Skill coverage */
  skillCoverage: SkillCoverage[];
  /** Skill gaps */
  skillGaps: SkillGap[];
  /** Team strengths */
  teamStrengths: string[];
  /** Recommendations */
  recommendations: TeamSkillRecommendation[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * Skill coverage in team
 */
export interface SkillCoverage {
  /** Skill */
  skill: Skill;
  /** Developers with skill */
  coverage: number;
  /** Average proficiency */
  avgProficiency: number;
  /** Max proficiency */
  maxProficiency: SkillProficiencyLevel;
  /** Experts (advanced+) */
  experts: string[];
  /** Bus factor */
  busFactor: number;
}

/**
 * Skill gap
 */
export interface SkillGap {
  /** Skill */
  skill: Skill;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Reason */
  reason: string;
  /** Impact */
  impact: string;
  /** Recommendations */
  recommendations: string[];
}

/**
 * Team skill recommendation
 */
export interface TeamSkillRecommendation {
  /** Recommendation ID */
  id: string;
  /** Type */
  type: 'training' | 'hiring' | 'knowledge_sharing' | 'mentoring';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high';
  /** Affected skills */
  skills: string[];
  /** Suggested actions */
  actions: string[];
}

// ============================================
// Reviewer Matching Types
// ============================================

/**
 * Reviewer match result
 */
export interface ReviewerMatch {
  /** Reviewer login */
  login: string;
  /** Match score (0-100) */
  matchScore: number;
  /** Skill matches */
  skillMatches: SkillMatch[];
  /** Availability */
  availability: ReviewerAvailability;
  /** Past review quality */
  reviewQuality: ReviewQuality;
  /** Recommendation */
  recommendation: 'highly_recommended' | 'recommended' | 'acceptable' | 'not_recommended';
  /** Reason */
  reason: string;
}

/**
 * Skill match
 */
export interface SkillMatch {
  /** Skill required */
  skill: string;
  /** Reviewer proficiency */
  proficiency: SkillProficiencyLevel;
  /** Match quality */
  matchQuality: 'exact' | 'related' | 'partial' | 'none';
}

/**
 * Reviewer availability
 */
export interface ReviewerAvailability {
  /** Available */
  available: boolean;
  /** Current workload */
  currentWorkload: number;
  /** Estimated response time (hours) */
  estimatedResponseHours: number;
  /** Out of office until */
  outOfOfficeUntil?: Date;
}

/**
 * Review quality metrics
 */
export interface ReviewQuality {
  /** Average review thoroughness */
  thoroughness: number;
  /** Average response time (hours) */
  avgResponseTime: number;
  /** Helpful feedback rate */
  helpfulFeedbackRate: number;
  /** False positive rate */
  falsePositiveRate: number;
  /** Total reviews */
  totalReviews: number;
}

// ============================================
// Skill Analysis Types
// ============================================

/**
 * PR skill analysis
 */
export interface PRSkillAnalysis {
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Skills demonstrated */
  skillsDemonstrated: Array<{
    skill: Skill;
    evidence: string;
    proficiencyIndicated: SkillProficiencyLevel;
  }>;
  /** Skills required for review */
  skillsRequiredForReview: Skill[];
  /** Complexity by skill */
  complexityBySkill: Array<{
    skill: string;
    complexity: 'low' | 'medium' | 'high';
  }>;
  /** Analyzed at */
  analyzedAt: Date;
}

/**
 * Skill detection result
 */
export interface SkillDetectionResult {
  /** Detected skills */
  skills: Array<{
    skill: Skill;
    confidence: number;
    source: 'file_extension' | 'framework_detection' | 'code_analysis' | 'commit_message';
    evidence: string;
  }>;
  /** File patterns analyzed */
  filesAnalyzed: number;
  /** Detection method */
  method: 'static' | 'ai_assisted';
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Get developer profile request
 */
export interface GetDeveloperProfileRequest {
  /** Developer login */
  login: string;
  /** Repository filter */
  repositoryId?: string;
  /** Time period */
  period?: 'month' | 'quarter' | 'year' | 'all';
}

/**
 * Get team matrix request
 */
export interface GetTeamMatrixRequest {
  /** Team ID */
  teamId: string;
  /** Include learning opportunities */
  includeLearning?: boolean;
  /** Include gaps analysis */
  includeGaps?: boolean;
}

/**
 * Find reviewers request
 */
export interface FindReviewersRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** Required skills */
  requiredSkills?: string[];
  /** Minimum proficiency */
  minProficiency?: SkillProficiencyLevel;
  /** Limit */
  limit?: number;
}

/**
 * Update skill request
 */
export interface UpdateSkillRequest {
  /** Developer login */
  login: string;
  /** Skill ID */
  skillId: string;
  /** New proficiency */
  proficiency?: SkillProficiencyLevel;
  /** Manual override */
  manualOverride?: boolean;
  /** Evidence */
  evidence?: string;
}

// ============================================
// Leaderboard Types
// ============================================

/**
 * Skill leaderboard
 */
export interface SkillLeaderboard {
  /** Skill */
  skill: Skill;
  /** Leaderboard entries */
  entries: SkillLeaderboardEntry[];
  /** Time period */
  period: 'week' | 'month' | 'quarter' | 'all';
  /** Generated at */
  generatedAt: Date;
}

/**
 * Leaderboard entry
 */
export interface SkillLeaderboardEntry {
  /** Rank */
  rank: number;
  /** Developer login */
  login: string;
  /** Display name */
  displayName: string;
  /** Avatar URL */
  avatarUrl?: string;
  /** Score */
  score: number;
  /** Proficiency */
  proficiency: SkillProficiencyLevel;
  /** Trend vs previous period */
  trend: 'up' | 'same' | 'down';
  /** Rank change */
  rankChange: number;
}

// ============================================
// Certification Types
// ============================================

/**
 * Skill certification
 */
export interface SkillCertification {
  /** Certification ID */
  id: string;
  /** Developer login */
  login: string;
  /** Skill */
  skill: Skill;
  /** Level */
  level: SkillProficiencyLevel;
  /** Issued at */
  issuedAt: Date;
  /** Valid until */
  validUntil?: Date;
  /** Evidence */
  evidence: Array<{
    type: 'pr' | 'commit' | 'review' | 'external';
    reference: string;
    description: string;
  }>;
  /** Verified by */
  verifiedBy?: string;
  /** Badge URL */
  badgeUrl?: string;
}
