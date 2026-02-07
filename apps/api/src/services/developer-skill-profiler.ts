import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { callLLM } from '../agents/base.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  SkillDeveloperProfile,
  DeveloperSkill,
  Skill,
  SkillProfileCategory,
  SkillProficiencyLevel,
  TeamSkillMatrix,
  ReviewerMatch,
  PRSkillAnalysis,
  SkillDetectionResult,
  SkillLeaderboard,
  SkillLeaderboardEntry,
  SkillCertification,
  SkillCoverage,
  SkillGap,
} from '@prflow/core';

/**
 * Developer Skill Profiler Service
 * Analyzes developer skills from contributions and matches reviewers to PRs
 */
export class DeveloperSkillProfilerService {
  // Built-in skill definitions
  private readonly skillDefinitions: Map<string, Skill> = new Map();

  constructor() {
    this.initializeSkillDefinitions();
  }

  /**
   * Get or create developer profile
   */
  async getDeveloperProfile(
    login: string,
    options: { repositoryId?: string; period?: 'month' | 'quarter' | 'year' | 'all' } = {}
  ): Promise<SkillDeveloperProfile> {
    const { period = 'quarter' } = options;
    const periodDays = period === 'month' ? 30 : period === 'quarter' ? 90 : period === 'year' ? 365 : 3650;
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    logger.info({ login, period }, 'Getting developer profile');

    // Get all workflows by this developer
    const workflows = await db.pRWorkflow.findMany({
      where: {
        authorLogin: login,
        createdAt: { gte: periodStart },
        ...(options.repositoryId && { repositoryId: options.repositoryId }),
      },
      include: {
        analysis: true,
        repository: true,
      },
    });

    // Detect skills from PRs
    const detectedSkills = await this.detectSkillsFromWorkflows(workflows);

    // Calculate contribution metrics
    const contributions = this.calculateContributions(workflows, periodStart);

    // Calculate growth metrics
    const growth = await this.calculateGrowthMetrics(login, detectedSkills);

    // Identify expertise areas
    const expertiseAreas = this.identifyExpertiseAreas(detectedSkills);

    // Generate learning opportunities
    const learningOpportunities = await this.generateLearningOpportunities(login, detectedSkills);

    // Build skill summary
    const skillSummary = this.buildSkillSummary(detectedSkills);

    const profile: SkillDeveloperProfile = {
      login,
      displayName: login,
      overallScore: this.calculateOverallScore(detectedSkills),
      skills: detectedSkills,
      skillSummary,
      contributions,
      growth,
      expertiseAreas,
      learningOpportunities,
      lastUpdatedAt: new Date(),
    };

    // Store profile
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'developer_profile',
        eventData: JSON.parse(JSON.stringify(profile)),
      },
    });

    return profile;
  }

  /**
   * Get team skill matrix
   */
  async getTeamSkillMatrix(
    teamId: string,
    memberLogins: string[],
    options: { includeLearning?: boolean; includeGaps?: boolean } = {}
  ): Promise<TeamSkillMatrix> {
    logger.info({ teamId, memberCount: memberLogins.length }, 'Building team skill matrix');

    // Get profiles for all team members
    const members: SkillDeveloperProfile[] = [];
    for (const login of memberLogins) {
      const profile = await this.getDeveloperProfile(login);
      members.push(profile);
    }

    // Calculate skill coverage
    const skillCoverage = this.calculateSkillCoverage(members);

    // Identify skill gaps
    const skillGaps = options.includeGaps !== false ? this.identifySkillGaps(skillCoverage) : [];

    // Identify team strengths
    const teamStrengths = this.identifyTeamStrengths(skillCoverage);

    // Generate recommendations
    const recommendations = this.generateTeamRecommendations(skillGaps, members);

    const matrix: TeamSkillMatrix = {
      teamId,
      teamName: `Team ${teamId}`,
      members,
      skillCoverage,
      skillGaps,
      teamStrengths,
      recommendations,
      generatedAt: new Date(),
    };

    return matrix;
  }

  /**
   * Find best reviewers for a PR
   */
  async findReviewersForPR(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      requiredSkills?: string[];
      minProficiency?: SkillProficiencyLevel;
      limit?: number;
    } = {}
  ): Promise<ReviewerMatch[]> {
    const { limit = 5, minProficiency = 'intermediate' as SkillProficiencyLevel } = options;

    logger.info({ owner, repo, prNumber }, 'Finding reviewers for PR');

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    // Get PR workflow
    const workflow = await db.pRWorkflow.findFirst({
      where: {
        repositoryId: repository.id,
        prNumber,
      },
      include: {
        analysis: true,
      },
    });

    if (!workflow) {
      throw new Error(`PR #${prNumber} not found`);
    }

    // Analyze PR skills required
    const prAnalysis = await this.analyzePRSkills(workflow);

    // Get skills required
    const requiredSkills = options.requiredSkills?.length
      ? options.requiredSkills.map(s => this.getSkill(s)).filter((s): s is Skill => s !== null)
      : prAnalysis.skillsRequiredForReview;

    // Get potential reviewers (exclude PR author)
    const potentialReviewers = await db.pRWorkflow.findMany({
      where: {
        repositoryId: repository.id,
        authorLogin: { not: workflow.authorLogin },
        status: 'COMPLETED',
      },
      select: { authorLogin: true },
      distinct: ['authorLogin'],
      take: 50,
    });

    // Score each potential reviewer
    const matches: ReviewerMatch[] = [];

    for (const reviewer of potentialReviewers) {
      const profile = await this.getDeveloperProfile(reviewer.authorLogin, { repositoryId: repository.id });

      // Calculate match score
      const skillMatches = this.calculateSkillMatches(requiredSkills, profile.skills);
      const matchScore = this.calculateMatchScore(skillMatches, minProficiency);

      // Get reviewer availability and quality
      const availability = await this.getReviewerAvailability(reviewer.authorLogin);
      const reviewQuality = await this.getReviewQuality(reviewer.authorLogin);

      // Determine recommendation
      const recommendation = this.getRecommendation(matchScore, availability, reviewQuality);

      matches.push({
        login: reviewer.authorLogin,
        matchScore,
        skillMatches,
        availability,
        reviewQuality,
        recommendation,
        reason: this.getMatchReason(skillMatches, matchScore),
      });
    }

    // Sort by match score and return top matches
    return matches
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, limit);
  }

  /**
   * Analyze skills demonstrated in a PR
   */
  async analyzePRSkills(
    workflow: { prNumber: number; prTitle: string; analysis?: unknown }
  ): Promise<PRSkillAnalysis> {
    const changedFiles = this.extractChangedFiles(workflow.analysis);

    // Detect skills from file types
    const detectionResult = await this.detectSkillsFromFiles(changedFiles);

    // Determine skills required for review
    const skillsRequired = detectionResult.skills
      .filter(s => s.confidence > 0.5)
      .map(s => s.skill);

    // Calculate complexity by skill
    const complexityBySkill = this.calculateComplexityBySkill(changedFiles, detectionResult.skills);

    return {
      prNumber: workflow.prNumber,
      repository: { owner: '', name: '' },
      skillsDemonstrated: detectionResult.skills.map(s => ({
        skill: s.skill,
        evidence: s.evidence,
        proficiencyIndicated: this.inferProficiencyFromEvidence(s),
      })),
      skillsRequiredForReview: skillsRequired,
      complexityBySkill,
      analyzedAt: new Date(),
    };
  }

  /**
   * Get skill leaderboard
   */
  async getSkillLeaderboard(
    skillId: string,
    period: 'week' | 'month' | 'quarter' | 'all' = 'month',
    limit = 20
  ): Promise<SkillLeaderboard> {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }

    const periodDays = period === 'week' ? 7 : period === 'month' ? 30 : period === 'quarter' ? 90 : 3650;
    const periodStart = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Get all profiles with this skill
    const events = await db.analyticsEvent.findMany({
      where: {
        eventType: 'developer_profile',
        createdAt: { gte: periodStart },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get unique profiles
    const profilesMap = new Map<string, SkillDeveloperProfile>();
    for (const event of events) {
      const profile = event.eventData as unknown as SkillDeveloperProfile;
      if (!profilesMap.has(profile.login)) {
        profilesMap.set(profile.login, profile);
      }
    }

    // Filter and rank by skill
    const entries: SkillLeaderboardEntry[] = [];
    for (const profile of profilesMap.values()) {
      const developerSkill = profile.skills.find(s => s.skill.id === skillId);
      if (developerSkill) {
        entries.push({
          rank: 0,
          login: profile.login,
          displayName: profile.displayName,
          avatarUrl: profile.avatarUrl,
          score: developerSkill.score,
          proficiency: developerSkill.proficiency,
          trend: developerSkill.trend === 'growing' ? 'up' : developerSkill.trend === 'declining' ? 'down' : 'same',
          rankChange: 0,
        });
      }
    }

    // Sort and assign ranks
    entries.sort((a, b) => b.score - a.score);
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return {
      skill,
      entries: entries.slice(0, limit),
      period,
      generatedAt: new Date(),
    };
  }

  /**
   * Issue skill certification
   */
  async issueSkillCertification(
    login: string,
    skillId: string,
    level: SkillProficiencyLevel,
    evidence: SkillCertification['evidence'],
    verifiedBy?: string
  ): Promise<SkillCertification> {
    const skill = this.getSkill(skillId);
    if (!skill) {
      throw new Error(`Skill ${skillId} not found`);
    }

    const certification: SkillCertification = {
      id: uuidv4(),
      login,
      skill,
      level,
      issuedAt: new Date(),
      validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      evidence,
      verifiedBy,
      badgeUrl: `/api/skills/badges/${skillId}-${level}.svg`,
    };

    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'skill_certification',
        eventData: JSON.parse(JSON.stringify(certification)),
      },
    });

    logger.info({ certificationId: certification.id, login, skillId, level }, 'Skill certification issued');

    return certification;
  }

  /**
   * Get a skill by ID
   */
  getSkill(skillId: string): Skill | null {
    return this.skillDefinitions.get(skillId) || null;
  }

  /**
   * Get all skills
   */
  getAllSkills(): Skill[] {
    return Array.from(this.skillDefinitions.values());
  }

  /**
   * Get skills by category
   */
  getSkillsByCategory(category: SkillProfileCategory): Skill[] {
    return Array.from(this.skillDefinitions.values()).filter(s => s.category === category);
  }

  // Private helpers

  private initializeSkillDefinitions(): void {
    const skills: Skill[] = [
      // Languages
      { id: 'typescript', name: 'TypeScript', category: 'language', aliases: ['ts'] },
      { id: 'javascript', name: 'JavaScript', category: 'language', aliases: ['js'] },
      { id: 'python', name: 'Python', category: 'language', aliases: ['py'] },
      { id: 'go', name: 'Go', category: 'language', aliases: ['golang'] },
      { id: 'rust', name: 'Rust', category: 'language', aliases: ['rs'] },
      { id: 'java', name: 'Java', category: 'language' },
      { id: 'csharp', name: 'C#', category: 'language', aliases: ['cs', 'dotnet'] },

      // Frameworks
      { id: 'react', name: 'React', category: 'framework', relatedSkills: ['typescript', 'javascript'] },
      { id: 'nextjs', name: 'Next.js', category: 'framework', relatedSkills: ['react', 'typescript'] },
      { id: 'nodejs', name: 'Node.js', category: 'framework', relatedSkills: ['javascript', 'typescript'] },
      { id: 'fastify', name: 'Fastify', category: 'framework', relatedSkills: ['nodejs'] },
      { id: 'express', name: 'Express', category: 'framework', relatedSkills: ['nodejs'] },
      { id: 'django', name: 'Django', category: 'framework', relatedSkills: ['python'] },
      { id: 'spring', name: 'Spring', category: 'framework', relatedSkills: ['java'] },

      // Testing
      { id: 'jest', name: 'Jest', category: 'testing', relatedSkills: ['javascript', 'typescript'] },
      { id: 'vitest', name: 'Vitest', category: 'testing', relatedSkills: ['typescript'] },
      { id: 'pytest', name: 'Pytest', category: 'testing', relatedSkills: ['python'] },

      // Infrastructure
      { id: 'docker', name: 'Docker', category: 'infrastructure' },
      { id: 'kubernetes', name: 'Kubernetes', category: 'infrastructure', aliases: ['k8s'] },
      { id: 'terraform', name: 'Terraform', category: 'infrastructure' },
      { id: 'aws', name: 'AWS', category: 'infrastructure' },
      { id: 'gcp', name: 'Google Cloud', category: 'infrastructure' },

      // Database
      { id: 'postgresql', name: 'PostgreSQL', category: 'database', aliases: ['postgres'] },
      { id: 'mongodb', name: 'MongoDB', category: 'database' },
      { id: 'redis', name: 'Redis', category: 'database' },
      { id: 'prisma', name: 'Prisma', category: 'database', relatedSkills: ['typescript'] },

      // Security
      { id: 'oauth', name: 'OAuth', category: 'security' },
      { id: 'encryption', name: 'Encryption', category: 'security' },
      { id: 'security-audit', name: 'Security Auditing', category: 'security' },

      // DevOps
      { id: 'ci-cd', name: 'CI/CD', category: 'devops' },
      { id: 'github-actions', name: 'GitHub Actions', category: 'devops' },
      { id: 'monitoring', name: 'Monitoring', category: 'devops' },

      // Architecture
      { id: 'microservices', name: 'Microservices', category: 'architecture' },
      { id: 'api-design', name: 'API Design', category: 'architecture' },
      { id: 'system-design', name: 'System Design', category: 'architecture' },
    ];

    for (const skill of skills) {
      this.skillDefinitions.set(skill.id, skill);
    }
  }

  private async detectSkillsFromWorkflows(
    workflows: Array<{ analysis?: unknown }>
  ): Promise<DeveloperSkill[]> {
    const skillScores = new Map<string, { count: number; recentDate: Date }>();

    for (const workflow of workflows) {
      const files = this.extractChangedFiles(workflow.analysis);
      const detection = await this.detectSkillsFromFiles(files);

      for (const detected of detection.skills) {
        const existing = skillScores.get(detected.skill.id) || { count: 0, recentDate: new Date(0) };
        existing.count += detected.confidence;
        existing.recentDate = new Date();
        skillScores.set(detected.skill.id, existing);
      }
    }

    const developerSkills: DeveloperSkill[] = [];

    for (const [skillId, data] of skillScores) {
      const skill = this.getSkill(skillId);
      if (!skill) continue;

      const score = Math.min(100, data.count * 10);
      const proficiency = this.scoreToProf(score);

      developerSkills.push({
        skill,
        proficiency,
        score,
        evidenceCount: Math.floor(data.count),
        lastDemonstrated: data.recentDate,
        trend: 'stable',
        confidence: Math.min(1, data.count / 10),
      });
    }

    return developerSkills.sort((a, b) => b.score - a.score);
  }

  private extractChangedFiles(analysis?: unknown): Array<{ path: string; patch?: string }> {
    const analysisObj = analysis as { changedFiles?: unknown } | null | undefined;
    if (!analysisObj?.changedFiles) return [];
    const files = analysisObj.changedFiles as Array<{ filename?: string; path?: string; patch?: string }>;
    return files.map(f => ({
      path: f.filename || f.path || '',
      patch: f.patch,
    }));
  }

  private async detectSkillsFromFiles(
    files: Array<{ path: string; patch?: string }>
  ): Promise<SkillDetectionResult> {
    const detectedSkills: SkillDetectionResult['skills'] = [];

    for (const file of files) {
      const ext = file.path.split('.').pop()?.toLowerCase();

      // Language detection by extension
      const languageMap: Record<string, string> = {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        py: 'python',
        go: 'go',
        rs: 'rust',
        java: 'java',
        cs: 'csharp',
      };

      if (ext && languageMap[ext]) {
        const skill = this.getSkill(languageMap[ext]);
        if (skill) {
          detectedSkills.push({
            skill,
            confidence: 0.9,
            source: 'file_extension',
            evidence: file.path,
          });
        }
      }

      // Framework detection from path
      if (file.path.includes('prisma')) {
        const skill = this.getSkill('prisma');
        if (skill) detectedSkills.push({ skill, confidence: 0.8, source: 'framework_detection', evidence: file.path });
      }
      if (file.path.includes('docker') || file.path.includes('Dockerfile')) {
        const skill = this.getSkill('docker');
        if (skill) detectedSkills.push({ skill, confidence: 0.9, source: 'framework_detection', evidence: file.path });
      }
      if (file.path.includes('.github/workflows')) {
        const skill = this.getSkill('github-actions');
        if (skill) detectedSkills.push({ skill, confidence: 0.9, source: 'framework_detection', evidence: file.path });
      }

      // Content analysis
      if (file.patch) {
        if (file.patch.includes('import React') || file.patch.includes('from "react"')) {
          const skill = this.getSkill('react');
          if (skill) detectedSkills.push({ skill, confidence: 0.85, source: 'code_analysis', evidence: 'React import' });
        }
        if (file.patch.includes('fastify')) {
          const skill = this.getSkill('fastify');
          if (skill) detectedSkills.push({ skill, confidence: 0.85, source: 'code_analysis', evidence: 'Fastify usage' });
        }
      }
    }

    // Deduplicate
    const uniqueSkills = new Map<string, SkillDetectionResult['skills'][0]>();
    for (const s of detectedSkills) {
      const existing = uniqueSkills.get(s.skill.id);
      if (!existing || existing.confidence < s.confidence) {
        uniqueSkills.set(s.skill.id, s);
      }
    }

    return {
      skills: Array.from(uniqueSkills.values()),
      filesAnalyzed: files.length,
      method: 'static',
    };
  }

  private calculateContributions(
    workflows: Array<{ analysis?: { linesAdded?: number; linesRemoved?: number } | null }>,
    periodStart: Date
  ): SkillDeveloperProfile['contributions'] {
    return {
      totalPRs: workflows.length,
      prsMerged: workflows.filter(w => (w as { status?: string }).status === 'COMPLETED').length,
      totalCommits: workflows.length * 3, // Estimate
      linesAdded: workflows.reduce((sum, w) => sum + (w.analysis?.linesAdded || 0), 0),
      linesRemoved: workflows.reduce((sum, w) => sum + (w.analysis?.linesRemoved || 0), 0),
      reviewsPerformed: 0, // Would need separate query
      avgPRComplexity: 2.5,
      activeRepositories: new Set(workflows.map(w => (w as { repositoryId?: string }).repositoryId)).size,
      periodStart,
      periodEnd: new Date(),
    };
  }

  private async calculateGrowthMetrics(
    _login: string,
    skills: DeveloperSkill[]
  ): Promise<SkillDeveloperProfile['growth']> {
    const growingSkills = skills.filter(s => s.trend === 'growing');

    return {
      overallGrowthRate: growingSkills.length / Math.max(1, skills.length),
      skillsAcquired: Math.floor(skills.length * 0.1),
      skillsImproved: growingSkills.length,
      proficiencyIncreases: [],
      learningVelocity: growingSkills.length / 3,
      trend: growingSkills.length > skills.length * 0.3 ? 'accelerating' : 'steady',
    };
  }

  private identifyExpertiseAreas(skills: DeveloperSkill[]): SkillDeveloperProfile['expertiseAreas'] {
    const expertSkills = skills.filter(s => s.proficiency === 'expert' || s.proficiency === 'advanced');

    const byCategory = new Map<SkillProfileCategory, DeveloperSkill[]>();
    for (const skill of expertSkills) {
      const existing = byCategory.get(skill.skill.category) || [];
      existing.push(skill);
      byCategory.set(skill.skill.category, existing);
    }

    return Array.from(byCategory.entries())
      .filter(([, skills]) => skills.length >= 2)
      .map(([category, skills]) => ({
        name: `${category.charAt(0).toUpperCase()}${category.slice(1)} Expert`,
        category,
        description: `Strong expertise in ${skills.map(s => s.skill.name).join(', ')}`,
        skills: skills.map(s => s.skill.id),
        level: skills[0].proficiency,
        confidence: skills.reduce((sum, s) => sum + s.confidence, 0) / skills.length,
      }));
  }

  private async generateLearningOpportunities(
    _login: string,
    skills: DeveloperSkill[]
  ): Promise<SkillDeveloperProfile['learningOpportunities']> {
    const opportunities: SkillDeveloperProfile['learningOpportunities'] = [];

    // Find related skills not yet learned
    const knownSkillIds = new Set(skills.map(s => s.skill.id));

    for (const skill of skills) {
      if (skill.skill.relatedSkills) {
        for (const relatedId of skill.skill.relatedSkills) {
          if (!knownSkillIds.has(relatedId)) {
            const relatedSkill = this.getSkill(relatedId);
            if (relatedSkill) {
              opportunities.push({
                id: uuidv4(),
                skill: relatedSkill,
                reason: `Related to your ${skill.skill.name} expertise`,
                currentProficiency: null,
                targetProficiency: 'intermediate',
                estimatedEffort: 'medium',
                careerImpact: 'medium',
              });
            }
          }
        }
      }
    }

    return opportunities.slice(0, 5);
  }

  private buildSkillSummary(skills: DeveloperSkill[]): SkillDeveloperProfile['skillSummary'] {
    const byCategory = new Map<SkillProfileCategory, DeveloperSkill[]>();

    for (const skill of skills) {
      const existing = byCategory.get(skill.skill.category) || [];
      existing.push(skill);
      byCategory.set(skill.skill.category, existing);
    }

    return Array.from(byCategory.entries()).map(([category, categorySkills]) => ({
      category,
      avgProficiency: categorySkills.reduce((sum, s) => sum + s.score, 0) / categorySkills.length,
      topSkills: categorySkills
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(s => ({ name: s.skill.name, score: s.score })),
      skillCount: categorySkills.length,
    }));
  }

  private calculateOverallScore(skills: DeveloperSkill[]): number {
    if (skills.length === 0) return 0;
    return Math.round(skills.reduce((sum, s) => sum + s.score, 0) / skills.length);
  }

  private calculateSkillCoverage(members: SkillDeveloperProfile[]): SkillCoverage[] {
    const coverageMap = new Map<string, { skill: Skill; members: Array<{ login: string; proficiency: SkillProficiencyLevel; score: number }> }>();

    for (const member of members) {
      for (const developerSkill of member.skills) {
        const existing = coverageMap.get(developerSkill.skill.id) || { skill: developerSkill.skill, members: [] };
        existing.members.push({
          login: member.login,
          proficiency: developerSkill.proficiency,
          score: developerSkill.score,
        });
        coverageMap.set(developerSkill.skill.id, existing);
      }
    }

    return Array.from(coverageMap.values()).map(({ skill, members: skillMembers }) => {
      const experts = skillMembers.filter(m => m.proficiency === 'expert' || m.proficiency === 'advanced');
      const maxProficiency = skillMembers.reduce((max, m) => {
        const order = ['beginner', 'intermediate', 'advanced', 'expert'];
        return order.indexOf(m.proficiency) > order.indexOf(max) ? m.proficiency : max;
      }, 'beginner' as SkillProficiencyLevel);

      return {
        skill,
        coverage: skillMembers.length / members.length,
        avgProficiency: skillMembers.reduce((sum, m) => sum + m.score, 0) / skillMembers.length,
        maxProficiency,
        experts: experts.map(e => e.login),
        busFactor: experts.length,
      };
    });
  }

  private identifySkillGaps(coverage: SkillCoverage[]): SkillGap[] {
    const gaps: SkillGap[] = [];

    // Check for single points of failure
    const singleExperts = coverage.filter(c => c.busFactor === 1);
    for (const c of singleExperts) {
      gaps.push({
        skill: c.skill,
        severity: 'high',
        reason: `Only one expert: ${c.experts[0]}`,
        impact: 'Knowledge loss risk if this person leaves',
        recommendations: ['Cross-train another team member', 'Document key processes'],
      });
    }

    // Check for low coverage
    const lowCoverage = coverage.filter(c => c.coverage < 0.2);
    for (const c of lowCoverage) {
      gaps.push({
        skill: c.skill,
        severity: 'medium',
        reason: 'Low team coverage',
        impact: 'Limited ability to support this technology',
        recommendations: ['Invest in training', 'Consider hiring'],
      });
    }

    return gaps;
  }

  private identifyTeamStrengths(coverage: SkillCoverage[]): string[] {
    return coverage
      .filter(c => c.coverage > 0.5 && c.avgProficiency > 70)
      .sort((a, b) => b.avgProficiency - a.avgProficiency)
      .slice(0, 5)
      .map(c => c.skill.name);
  }

  private generateTeamRecommendations(
    gaps: SkillGap[],
    _members: SkillDeveloperProfile[]
  ): TeamSkillMatrix['recommendations'] {
    const recommendations: TeamSkillMatrix['recommendations'] = [];

    for (const gap of gaps.filter(g => g.severity === 'high')) {
      recommendations.push({
        id: uuidv4(),
        type: 'mentoring',
        title: `Address ${gap.skill.name} knowledge gap`,
        description: gap.reason,
        priority: 'high',
        skills: [gap.skill.id],
        actions: gap.recommendations,
      });
    }

    return recommendations;
  }

  private calculateSkillMatches(
    required: Skill[],
    developerSkills: DeveloperSkill[]
  ): ReviewerMatch['skillMatches'] {
    const developerSkillMap = new Map(developerSkills.map(s => [s.skill.id, s]));

    return required.map(skill => {
      const match = developerSkillMap.get(skill.id);
      if (match) {
        return {
          skill: skill.name,
          proficiency: match.proficiency,
          matchQuality: 'exact' as const,
        };
      }

      // Check related skills
      for (const ds of developerSkills) {
        if (ds.skill.relatedSkills?.includes(skill.id)) {
          return {
            skill: skill.name,
            proficiency: ds.proficiency,
            matchQuality: 'related' as const,
          };
        }
      }

      return {
        skill: skill.name,
        proficiency: 'beginner' as SkillProficiencyLevel,
        matchQuality: 'none' as const,
      };
    });
  }

  private calculateMatchScore(
    matches: ReviewerMatch['skillMatches'],
    minProficiency: SkillProficiencyLevel
  ): number {
    if (matches.length === 0) return 50;

    const proficiencyScore = { beginner: 25, intermediate: 50, advanced: 75, expert: 100 };
    const qualityMultiplier = { exact: 1, related: 0.7, partial: 0.4, none: 0 };
    const minProfScore = proficiencyScore[minProficiency];

    let totalScore = 0;
    for (const match of matches) {
      const baseScore = proficiencyScore[match.proficiency];
      const multiplier = qualityMultiplier[match.matchQuality];
      totalScore += baseScore * multiplier;
    }

    const avgScore = totalScore / matches.length;

    // Penalize if below minimum proficiency
    const meetsMinimum = matches.some(m =>
      m.matchQuality !== 'none' && proficiencyScore[m.proficiency] >= minProfScore
    );

    return meetsMinimum ? Math.round(avgScore) : Math.round(avgScore * 0.5);
  }

  private async getReviewerAvailability(login: string): Promise<ReviewerMatch['availability']> {
    // In a real implementation, this would check calendar, current workload, etc.
    const workflows = await db.pRWorkflow.findMany({
      where: {
        authorLogin: login,
        status: { in: ['PENDING', 'ANALYZING', 'REVIEWING'] },
      },
    });

    return {
      available: workflows.length < 5,
      currentWorkload: workflows.length,
      estimatedResponseHours: Math.max(4, workflows.length * 4),
    };
  }

  private async getReviewQuality(_login: string): Promise<ReviewerMatch['reviewQuality']> {
    // Placeholder - would analyze past reviews
    return {
      thoroughness: 80,
      avgResponseTime: 8,
      helpfulFeedbackRate: 0.85,
      falsePositiveRate: 0.1,
      totalReviews: 50,
    };
  }

  private getRecommendation(
    matchScore: number,
    availability: ReviewerMatch['availability'],
    quality: ReviewerMatch['reviewQuality']
  ): ReviewerMatch['recommendation'] {
    if (matchScore > 80 && availability.available && quality.thoroughness > 70) {
      return 'highly_recommended';
    }
    if (matchScore > 60 && availability.available) {
      return 'recommended';
    }
    if (matchScore > 40) {
      return 'acceptable';
    }
    return 'not_recommended';
  }

  private getMatchReason(matches: ReviewerMatch['skillMatches'], score: number): string {
    const exactMatches = matches.filter(m => m.matchQuality === 'exact');
    if (exactMatches.length === matches.length) {
      return `Expert in all ${matches.length} required skills`;
    }
    if (exactMatches.length > 0) {
      return `Expert in ${exactMatches.map(m => m.skill).join(', ')}`;
    }
    if (score > 50) {
      return 'Has related experience';
    }
    return 'Limited skill match';
  }

  private inferProficiencyFromEvidence(
    detected: SkillDetectionResult['skills'][0]
  ): SkillProficiencyLevel {
    if (detected.confidence > 0.8) return 'advanced';
    if (detected.confidence > 0.5) return 'intermediate';
    return 'beginner';
  }

  private calculateComplexityBySkill(
    files: Array<{ path: string; patch?: string }>,
    skills: SkillDetectionResult['skills']
  ): PRSkillAnalysis['complexityBySkill'] {
    return skills.map(s => ({
      skill: s.skill.name,
      complexity: files.length > 10 ? 'high' : files.length > 3 ? 'medium' : 'low',
    }));
  }

  private scoreToProf(score: number): SkillProficiencyLevel {
    if (score >= 85) return 'expert';
    if (score >= 65) return 'advanced';
    if (score >= 40) return 'intermediate';
    return 'beginner';
  }
}

export const developerSkillProfilerService = new DeveloperSkillProfilerService();
