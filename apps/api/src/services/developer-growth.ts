import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface SkillRadarData {
  axes: Array<{ name: string; current: number; previous: number; teamAverage: number }>;
}

interface RecurringIssue {
  pattern: string;
  category: string;
  occurrences: number;
  firstSeen: Date;
  lastSeen: Date;
  trend: 'increasing' | 'stable' | 'decreasing' | 'resolved';
  severity: string;
  resources: string[];
}

interface KnowledgeGap {
  area: string;
  category: string;
  severity: 'minor' | 'moderate' | 'significant';
  evidence: string;
  learningPath: string[];
  availableMentors: string[];
}

interface GrowthRecommendation {
  id: string;
  type: string;
  title: string;
  description: string;
  priority: string;
  effort: string;
  expectedImpact: string;
  relatedSkills: string[];
  status: string;
}

interface DeveloperGrowthProfile {
  login: string;
  displayName: string;
  growthScore: number;
  skillRadar: SkillRadarData;
  trajectory: {
    dataPoints: Array<{ date: Date; overallScore: number }>;
    trend: string;
    predictedScore90Days: number;
    milestones: Array<{ date: Date; milestone: string }>;
  };
  recurringIssues: RecurringIssue[];
  knowledgeGaps: KnowledgeGap[];
  achievements: Array<{ id: string; name: string; description: string; category: string; badge: string; earnedAt: Date; criteria: string }>;
  mentoringRelationships: Array<{ id: string; mentor: string; mentee: string; focusSkills: string[]; status: string }>;
  recommendations: GrowthRecommendation[];
  updatedAt: Date;
}

interface MentoringConfig {
  mentor: string;
  enabled: boolean;
  style: string;
  focusTopics: string[];
  severityThreshold: string;
  includeExamples: boolean;
  includeResources: boolean;
  maxCommentsPerPR: number;
}

/**
 * Developer Growth Dashboard & Review Mentoring Service
 * Tracks developer skill growth, provides personalized recommendations,
 * and manages mentoring relationships.
 */
export class DeveloperGrowthService {
  private profiles = new Map<string, DeveloperGrowthProfile>();
  private mentoringConfigs = new Map<string, MentoringConfig>();
  private achievements = new Map<string, Array<{ id: string; name: string; description: string; category: string; badge: string; earnedAt: Date; criteria: string }>>();

  /**
   * Get or build a developer's growth profile
   */
  async getProfile(login: string, repositoryId?: string): Promise<DeveloperGrowthProfile> {
    logger.info({ login, repositoryId }, 'Getting developer growth profile');

    const existing = this.profiles.get(login);
    if (existing) return existing;

    // Build profile from available data
    const profile = await this.buildProfile(login, repositoryId);
    this.profiles.set(login, profile);
    return profile;
  }

  /**
   * Get team growth overview
   */
  async getTeamOverview(params: {
    teamMembers: string[];
    periodDays?: number;
  }): Promise<{
    memberSummaries: Array<{ login: string; growthScore: number; trend: string; topImprovement: string; mainGap: string }>;
    teamGaps: KnowledgeGap[];
    activeMentoringPairs: number;
    avgGrowthScore: number;
    growthTrend: string;
    teamRecommendations: string[];
  }> {
    const { teamMembers, periodDays = 30 } = params;

    logger.info({ teamSize: teamMembers.length, periodDays }, 'Getting team growth overview');

    const memberSummaries = await Promise.all(
      teamMembers.map(async login => {
        const profile = await this.getProfile(login);
        return {
          login,
          growthScore: profile.growthScore,
          trend: profile.trajectory.trend,
          topImprovement: profile.skillRadar.axes[0]?.name || 'N/A',
          mainGap: profile.knowledgeGaps[0]?.area || 'None',
        };
      })
    );

    const avgGrowthScore = memberSummaries.reduce((sum, m) => sum + m.growthScore, 0) / memberSummaries.length;

    // Find team-wide gaps
    const allGaps = memberSummaries.filter(m => m.mainGap !== 'None').map(m => m.mainGap);
    const gapCounts = new Map<string, number>();
    for (const gap of allGaps) {
      gapCounts.set(gap, (gapCounts.get(gap) || 0) + 1);
    }

    const teamGaps: KnowledgeGap[] = Array.from(gapCounts.entries())
      .filter(([, count]) => count >= 2)
      .map(([area, count]) => ({
        area,
        category: 'team',
        severity: count >= teamMembers.length / 2 ? 'significant' as const : 'moderate' as const,
        evidence: `${count} team members have this gap`,
        learningPath: ['Team workshop', 'Pair programming session'],
        availableMentors: [],
      }));

    const activePairs = Array.from(this.mentoringConfigs.values()).filter(c => c.enabled).length;

    const teamRecommendations: string[] = [];
    if (teamGaps.length > 0) teamRecommendations.push(`Address ${teamGaps.length} team-wide knowledge gap(s) through workshops`);
    if (activePairs < teamMembers.length / 4) teamRecommendations.push('Consider establishing more mentoring pairs');
    if (avgGrowthScore < 50) teamRecommendations.push('Invest in skill-building activities for the team');

    return {
      memberSummaries,
      teamGaps,
      activeMentoringPairs: activePairs,
      avgGrowthScore,
      growthTrend: avgGrowthScore >= 60 ? 'improving' : avgGrowthScore >= 40 ? 'stable' : 'declining',
      teamRecommendations,
    };
  }

  /**
   * Record a review interaction for growth tracking
   */
  async recordReviewInteraction(params: {
    login: string;
    prNumber: number;
    issueType: string;
    category: string;
    wasRecurring: boolean;
    action: 'fixed' | 'dismissed' | 'discussed';
  }): Promise<void> {
    const { login, issueType, category, wasRecurring, action } = params;

    const profile = await this.getProfile(login);

    if (wasRecurring && action === 'fixed') {
      const issue = profile.recurringIssues.find(i => i.pattern === issueType);
      if (issue) {
        issue.occurrences++;
        issue.lastSeen = new Date();
        if (issue.occurrences > 3) issue.trend = 'decreasing';
      }
    }

    // Check for achievements
    await this.checkAchievements(login, profile);
  }

  /**
   * Configure mentoring mode
   */
  async configureMentoringMode(config: MentoringConfig): Promise<MentoringConfig> {
    this.mentoringConfigs.set(config.mentor, config);
    logger.info({ mentor: config.mentor, enabled: config.enabled, style: config.style }, 'Mentoring mode configured');
    return config;
  }

  /**
   * Get mentoring configuration
   */
  async getMentoringConfig(mentor: string): Promise<MentoringConfig | null> {
    return this.mentoringConfigs.get(mentor) || null;
  }

  /**
   * Match mentors to mentees based on skill gaps
   */
  async suggestMentoringPairs(teamMembers: string[]): Promise<Array<{
    mentor: string;
    mentee: string;
    focusSkills: string[];
    matchScore: number;
    reason: string;
  }>> {
    const profiles = await Promise.all(teamMembers.map(m => this.getProfile(m)));
    const pairs: Array<{ mentor: string; mentee: string; focusSkills: string[]; matchScore: number; reason: string }> = [];

    // Find mentees (lower growth scores) and mentors (higher scores)
    const sorted = profiles.sort((a, b) => b.growthScore - a.growthScore);
    const mentorPool = sorted.slice(0, Math.ceil(sorted.length / 3));
    const menteePool = sorted.slice(-Math.ceil(sorted.length / 3));

    for (const mentee of menteePool) {
      if (mentee.knowledgeGaps.length === 0) continue;

      const topGap = mentee.knowledgeGaps[0];

      // Find a mentor strong in the mentee's gap area
      const bestMentor = mentorPool.find(m =>
        m.skillRadar.axes.some(a => a.name === topGap.area && a.current >= 70) &&
        m.login !== mentee.login
      );

      if (bestMentor) {
        pairs.push({
          mentor: bestMentor.login,
          mentee: mentee.login,
          focusSkills: [topGap.area],
          matchScore: 75,
          reason: `${bestMentor.login} has expertise in ${topGap.area}, which is a gap for ${mentee.login}`,
        });
      }
    }

    return pairs;
  }

  /**
   * Get developer achievements
   */
  async getAchievements(login: string): Promise<Array<{ id: string; name: string; description: string; category: string; badge: string; earnedAt: Date; criteria: string }>> {
    return this.achievements.get(login) || [];
  }

  private async buildProfile(login: string, repositoryId?: string): Promise<DeveloperGrowthProfile> {
    // Build a baseline profile - in production this would analyze PR history
    const categories = ['code_quality', 'testing', 'security', 'documentation', 'performance', 'architecture'];
    const skillRadar: SkillRadarData = {
      axes: categories.map(cat => ({
        name: cat,
        current: 40 + Math.floor(Math.random() * 40),
        previous: 35 + Math.floor(Math.random() * 35),
        teamAverage: 55,
      })),
    };

    const growthScore = Math.round(skillRadar.axes.reduce((sum, a) => sum + a.current, 0) / skillRadar.axes.length);

    const knowledgeGaps: KnowledgeGap[] = skillRadar.axes
      .filter(a => a.current < 50)
      .map(a => ({
        area: a.name,
        category: a.name,
        severity: a.current < 30 ? 'significant' as const : 'moderate' as const,
        evidence: `Score ${a.current}/100, below team average of ${a.teamAverage}`,
        learningPath: [`${a.name} fundamentals course`, `Practice through code review`],
        availableMentors: [],
      }));

    const recommendations: GrowthRecommendation[] = knowledgeGaps.map(gap => ({
      id: uuidv4(),
      type: 'skill_building',
      title: `Improve ${gap.area}`,
      description: `Your ${gap.area} score is below team average. Focus on improving this area.`,
      priority: gap.severity === 'significant' ? 'high' : 'medium',
      effort: 'medium',
      expectedImpact: `Increase ${gap.area} score by 15-25 points`,
      relatedSkills: [gap.area],
      status: 'pending',
    }));

    return {
      login,
      displayName: login,
      growthScore,
      skillRadar,
      trajectory: {
        dataPoints: [
          { date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), overallScore: growthScore - 5 },
          { date: new Date(), overallScore: growthScore },
        ],
        trend: 'steady',
        predictedScore90Days: Math.min(100, growthScore + 8),
        milestones: [],
      },
      recurringIssues: [],
      knowledgeGaps,
      achievements: this.achievements.get(login) || [],
      mentoringRelationships: [],
      recommendations,
      updatedAt: new Date(),
    };
  }

  private async checkAchievements(login: string, profile: DeveloperGrowthProfile): Promise<void> {
    const existing = this.achievements.get(login) || [];

    // Check for "First Steps" achievement
    if (!existing.some(a => a.name === 'First Steps') && profile.growthScore > 0) {
      existing.push({
        id: uuidv4(),
        name: 'First Steps',
        description: 'Started tracking your growth journey',
        category: 'learning',
        badge: 'seedling',
        earnedAt: new Date(),
        criteria: 'Growth tracking initiated',
      });
    }

    // Check for "Clean Streak" - no recurring issues
    if (!existing.some(a => a.name === 'Clean Streak') && profile.recurringIssues.filter(i => i.trend === 'resolved').length >= 3) {
      existing.push({
        id: uuidv4(),
        name: 'Clean Streak',
        description: 'Resolved 3 recurring code review issues',
        category: 'quality',
        badge: 'star',
        earnedAt: new Date(),
        criteria: '3+ recurring issues resolved',
      });
    }

    this.achievements.set(login, existing);
  }
}

export const developerGrowthService = new DeveloperGrowthService();
