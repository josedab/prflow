import { z } from 'zod';

// ============================================
// Developer Learning Paths Types
// ============================================

export const SkillCategorySchema = z.enum([
  'language',
  'framework',
  'testing',
  'security',
  'performance',
  'architecture',
  'devops',
  'documentation',
  'code_quality',
  'collaboration',
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const ProficiencyLevelSchema = z.enum([
  'beginner',
  'intermediate',
  'advanced',
  'expert',
]);
export type ProficiencyLevel = z.infer<typeof ProficiencyLevelSchema>;

export const IssueTypeSchema = z.enum([
  'bug',
  'security',
  'performance',
  'style',
  'logic',
  'testing',
  'documentation',
  'architecture',
  'best_practice',
]);
export type IssueType = z.infer<typeof IssueTypeSchema>;

// ============================================
// Developer Profile
// ============================================

export interface DeveloperProfile {
  id: string;
  username: string;
  email?: string;
  skills: SkillAssessment[];
  learningPaths: LearningPath[];
  reviewHistory: ReviewHistoryEntry[];
  issuePatterns: IssuePattern[];
  strengths: StrengthArea[];
  improvementAreas: ImprovementArea[];
  achievements: Achievement[];
  stats: DeveloperStats;
  preferences: LearningPreferences;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkillAssessment {
  category: SkillCategory;
  name: string;
  proficiency: ProficiencyLevel;
  score: number;  // 0-100
  confidence: number;  // 0-100, how confident we are in this assessment
  evidenceCount: number;  // Number of PRs/reviews used for assessment
  trend: 'improving' | 'stable' | 'declining';
  lastAssessed: Date;
}

export interface ReviewHistoryEntry {
  id: string;
  prId: string;
  prTitle: string;
  repositoryFullName: string;
  role: 'author' | 'reviewer';
  date: Date;
  issuesFound: ReviewIssue[];
  commentsGiven: number;
  commentsReceived: number;
  outcomeApproved: boolean;
  iterationsRequired: number;
  timeToMerge?: number;  // hours
}

export interface ReviewIssue {
  id: string;
  type: IssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: SkillCategory;
  description: string;
  file?: string;
  wasAddressed: boolean;
}

// ============================================
// Issue Patterns
// ============================================

export interface IssuePattern {
  type: IssueType;
  category: SkillCategory;
  frequency: number;  // Issues per 100 lines changed
  severity: 'low' | 'medium' | 'high';
  trend: 'improving' | 'stable' | 'worsening';
  examples: PatternExample[];
  suggestions: string[];
}

export interface PatternExample {
  prId: string;
  file: string;
  line?: number;
  description: string;
  date: Date;
}

// ============================================
// Strengths and Improvements
// ============================================

export interface StrengthArea {
  category: SkillCategory;
  description: string;
  evidence: string[];
  score: number;
}

export interface ImprovementArea {
  category: SkillCategory;
  description: string;
  priority: 'low' | 'medium' | 'high';
  suggestedResources: LearningResource[];
  relatedIssues: string[];
}

// ============================================
// Learning Paths
// ============================================

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  category: SkillCategory;
  targetLevel: ProficiencyLevel;
  currentProgress: number;  // 0-100
  modules: LearningModule[];
  estimatedTime: number;  // hours
  prerequisites: string[];
  status: 'not_started' | 'in_progress' | 'completed' | 'paused';
  startedAt?: Date;
  completedAt?: Date;
}

export interface LearningModule {
  id: string;
  name: string;
  description: string;
  type: 'reading' | 'practice' | 'quiz' | 'project' | 'review';
  content: ModuleContent;
  estimatedTime: number;  // minutes
  status: 'locked' | 'available' | 'in_progress' | 'completed';
  completedAt?: Date;
  score?: number;
}

export interface ModuleContent {
  resources: LearningResource[];
  exercises?: Exercise[];
  quiz?: Quiz;
  project?: Project;
}

export interface LearningResource {
  id: string;
  type: 'article' | 'video' | 'documentation' | 'book' | 'course' | 'tool';
  title: string;
  url?: string;
  description: string;
  estimatedTime: number;  // minutes
  difficulty: ProficiencyLevel;
  tags: string[];
}

export interface Exercise {
  id: string;
  title: string;
  description: string;
  codeTemplate?: string;
  expectedOutcome: string;
  hints: string[];
}

export interface Quiz {
  id: string;
  questions: QuizQuestion[];
  passingScore: number;
}

export interface QuizQuestion {
  id: string;
  question: string;
  type: 'multiple_choice' | 'true_false' | 'code_completion';
  options?: string[];
  correctAnswer: string | number;
  explanation: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  evaluationCriteria: string[];
  estimatedTime: number;  // hours
}

// ============================================
// Achievements
// ============================================

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: SkillCategory;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  unlockedAt: Date;
  criteria: string;
}

export const ACHIEVEMENT_DEFINITIONS: Omit<Achievement, 'unlockedAt'>[] = [
  {
    id: 'first_pr',
    name: 'First Steps',
    description: 'Opened your first pull request',
    icon: '🎯',
    category: 'collaboration',
    tier: 'bronze',
    criteria: 'Open 1 pull request',
  },
  {
    id: 'clean_pr',
    name: 'Clean Code',
    description: 'PR approved with no changes requested',
    icon: '✨',
    category: 'code_quality',
    tier: 'bronze',
    criteria: 'Get PR approved without revisions',
  },
  {
    id: 'security_champion',
    name: 'Security Champion',
    description: 'No security issues in 10 consecutive PRs',
    icon: '🔒',
    category: 'security',
    tier: 'gold',
    criteria: '10 PRs without security issues',
  },
  {
    id: 'test_master',
    name: 'Test Master',
    description: 'Maintained >90% test coverage for 20 PRs',
    icon: '🧪',
    category: 'testing',
    tier: 'gold',
    criteria: '>90% coverage in 20 PRs',
  },
  {
    id: 'helpful_reviewer',
    name: 'Helpful Reviewer',
    description: 'Provided constructive feedback on 50 PRs',
    icon: '🤝',
    category: 'collaboration',
    tier: 'silver',
    criteria: 'Review 50 PRs with comments',
  },
  {
    id: 'quick_learner',
    name: 'Quick Learner',
    description: 'Completed a learning path in record time',
    icon: '⚡',
    category: 'documentation',
    tier: 'silver',
    criteria: 'Complete learning path under estimated time',
  },
  {
    id: 'polyglot',
    name: 'Polyglot',
    description: 'Contributed to code in 5+ languages',
    icon: '🌍',
    category: 'language',
    tier: 'gold',
    criteria: 'Commit code in 5+ languages',
  },
  {
    id: 'architect',
    name: 'Architect',
    description: 'Designed a major system component',
    icon: '🏛️',
    category: 'architecture',
    tier: 'platinum',
    criteria: 'Lead architectural changes in 10+ PRs',
  },
];

// ============================================
// Statistics
// ============================================

export interface DeveloperStats {
  totalPRsAuthored: number;
  totalPRsReviewed: number;
  totalCommits: number;
  totalLinesChanged: number;
  averageIterations: number;
  averageTimeToMerge: number;  // hours
  approvalRate: number;  // percentage of PRs approved first time
  reviewAccuracy: number;  // percentage of review comments addressed
  activeRepositories: number;
  streakDays: number;
  longestStreak: number;
}

// ============================================
// Learning Preferences
// ============================================

export interface LearningPreferences {
  preferredFormats: ('reading' | 'video' | 'practice' | 'interactive')[];
  dailyLearningTime: number;  // minutes
  notificationFrequency: 'daily' | 'weekly' | 'monthly';
  focusAreas: SkillCategory[];
  excludeAreas: SkillCategory[];
}

// ============================================
// Recommendations
// ============================================

export interface LearningRecommendation {
  type: 'learning_path' | 'resource' | 'practice' | 'review_focus';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  rationale: string;
  estimatedImpact: number;  // 0-100
  content?: LearningPath | LearningResource;
}

// ============================================
// Agent Input/Output
// ============================================

export interface LearningPathsInput {
  operation: 'assess' | 'recommend' | 'track_progress' | 'get_profile' | 'update_preferences' | 'analyze_patterns';
  userId: string;
  prData?: PRDataForAnalysis;
  preferences?: Partial<LearningPreferences>;
  pathId?: string;
  moduleId?: string;
}

export interface PRDataForAnalysis {
  prId: string;
  prTitle: string;
  repositoryFullName: string;
  role: 'author' | 'reviewer';
  files: Array<{
    filename: string;
    additions: number;
    deletions: number;
    language?: string;
  }>;
  reviewComments: Array<{
    body: string;
    type: IssueType;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }>;
  approved: boolean;
  iterations: number;
  timeToMerge?: number;
}

export interface LearningPathsResult {
  operation: string;
  success: boolean;
  data?: {
    profile?: DeveloperProfile;
    recommendations?: LearningRecommendation[];
    learningPath?: LearningPath;
    patterns?: IssuePattern[];
    achievements?: Achievement[];
  };
  error?: string;
}
