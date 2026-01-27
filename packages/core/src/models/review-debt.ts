import { z } from 'zod';

// ============================================
// Review Debt Dashboard Types
// ============================================

export const DebtCategorySchema = z.enum([
  'security',           // Security vulnerabilities not addressed
  'technical',          // Technical debt from code quality issues
  'testing',            // Missing or skipped tests
  'documentation',      // Missing documentation
  'performance',        // Known performance issues
  'accessibility',      // Accessibility issues
  'compliance',         // Compliance violations
  'deprecated',         // Use of deprecated APIs/libraries
]);
export type DebtCategory = z.infer<typeof DebtCategorySchema>;

export const DebtSeveritySchema = z.enum([
  'critical',    // Must fix immediately
  'high',        // Fix within sprint
  'medium',      // Fix within quarter
  'low',         // Fix when convenient
]);
export type DebtSeverity = z.infer<typeof DebtSeveritySchema>;

export const DebtStatusSchema = z.enum([
  'open',        // Not yet addressed
  'acknowledged', // Team knows about it
  'in_progress', // Being worked on
  'resolved',    // Fixed
  'wont_fix',    // Accepted as is
  'deferred',    // Postponed
]);
export type DebtStatus = z.infer<typeof DebtStatusSchema>;

// ============================================
// Debt Item
// ============================================

export interface DebtItem {
  id: string;
  repositoryId: string;
  
  // Classification
  category: DebtCategory;
  severity: DebtSeverity;
  status: DebtStatus;
  
  // Source information
  source: DebtSource;
  
  // Details
  title: string;
  description: string;
  file?: string;
  line?: number;
  codeSnippet?: string;
  
  // Impact assessment
  impact: DebtImpact;
  
  // Remediation
  suggestedFix?: string;
  estimatedEffort: EffortEstimate;
  assignee?: string;
  
  // Tracking
  createdAt: Date;
  updatedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolutionPR?: number;
  
  // Relations
  relatedPRs: number[];
  relatedIssues: string[];
  tags: string[];
}

export interface DebtSource {
  type: 'review_comment' | 'automated_scan' | 'manual_entry' | 'ci_failure' | 'security_scan';
  prNumber?: number;
  workflowId?: string;
  scanId?: string;
  commentId?: string;
  createdBy: string;
}

export interface DebtImpact {
  // Quantitative impact
  affectedFiles: number;
  affectedLines: number;
  affectedUsers?: number;
  
  // Qualitative impact
  userExperience: 'none' | 'minor' | 'moderate' | 'severe';
  securityRisk: 'none' | 'low' | 'medium' | 'high' | 'critical';
  performanceImpact: 'none' | 'minor' | 'moderate' | 'severe';
  maintainabilityImpact: 'none' | 'minor' | 'moderate' | 'severe';
  
  // Business impact
  businessCriticality: 'low' | 'medium' | 'high' | 'critical';
}

export interface EffortEstimate {
  size: 'trivial' | 'small' | 'medium' | 'large' | 'epic';
  hours?: number;
  storyPoints?: number;
  complexity: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
}

// ============================================
// Debt Dashboard
// ============================================

export interface DebtDashboard {
  repositoryId: string;
  generatedAt: Date;
  
  // Summary metrics
  summary: DebtSummary;
  
  // Breakdown by category
  byCategory: Record<DebtCategory, CategoryDebtSummary>;
  
  // Breakdown by severity
  bySeverity: Record<DebtSeverity, number>;
  
  // Time-based metrics
  trends: DebtTrends;
  
  // Top items needing attention
  topPriority: DebtItem[];
  
  // Recent activity
  recentActivity: DebtActivity[];
  
  // Recommendations
  recommendations: DebtRecommendation[];
}

export interface DebtSummary {
  totalItems: number;
  openItems: number;
  resolvedThisWeek: number;
  resolvedThisMonth: number;
  newThisWeek: number;
  newThisMonth: number;
  
  // Health score (0-100)
  healthScore: number;
  healthTrend: 'improving' | 'stable' | 'degrading';
  
  // Effort estimates
  totalEstimatedHours: number;
  criticalEstimatedHours: number;
  
  // Age metrics
  avgAgeOpenDays: number;
  oldestOpenDays: number;
}

export interface CategoryDebtSummary {
  category: DebtCategory;
  total: number;
  open: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  trend: 'improving' | 'stable' | 'worsening';
  estimatedHours: number;
}

export interface DebtTrends {
  period: 'week' | 'month' | 'quarter';
  dataPoints: TrendDataPoint[];
  netChange: number;
  velocity: number; // Items resolved per week
  accumulation: number; // Items added per week
}

export interface TrendDataPoint {
  date: Date;
  openItems: number;
  newItems: number;
  resolvedItems: number;
  healthScore: number;
}

export interface DebtActivity {
  id: string;
  type: 'created' | 'updated' | 'resolved' | 'acknowledged' | 'deferred' | 'escalated';
  debtItemId: string;
  debtItemTitle: string;
  actor: string;
  timestamp: Date;
  details?: string;
}

export interface DebtRecommendation {
  id: string;
  type: 'quick_win' | 'high_impact' | 'risk_reduction' | 'sprint_goal' | 'tech_debt_sprint';
  title: string;
  description: string;
  items: string[]; // Debt item IDs
  estimatedEffort: number; // hours
  expectedImpact: string;
  priority: number; // 1-10
}

// ============================================
// Debt Sprint (Focused Paydown)
// ============================================

export interface DebtSprint {
  id: string;
  repositoryId: string;
  name: string;
  description: string;
  
  // Sprint details
  startDate: Date;
  endDate: Date;
  status: 'planned' | 'active' | 'completed' | 'cancelled';
  
  // Goals
  targetItems: string[]; // Debt item IDs
  targetCategories?: DebtCategory[];
  targetHealthScore?: number;
  
  // Progress
  completedItems: string[];
  progress: number; // 0-100
  
  // Results
  results?: SprintResults;
  
  // Team
  lead: string;
  participants: string[];
}

export interface SprintResults {
  itemsResolved: number;
  itemsDeferred: number;
  hoursSpent: number;
  healthScoreChange: number;
  lessonsLearned: string[];
}

// ============================================
// Debt Policies
// ============================================

export interface DebtPolicy {
  id: string;
  repositoryId: string;
  name: string;
  enabled: boolean;
  
  // Thresholds
  thresholds: {
    maxOpenCritical: number;
    maxOpenHigh: number;
    maxTotalOpen: number;
    maxAgeOpenDays: number;
    minHealthScore: number;
  };
  
  // Actions when thresholds exceeded
  actions: {
    blockMerge: boolean;
    notifySlack: boolean;
    notifyEmail: boolean;
    createIssue: boolean;
    escalateAfterDays: number;
  };
  
  // Exclusions
  excludePaths: string[];
  excludeTags: string[];
}

// ============================================
// Skipped Review Tracking
// ============================================

export interface SkippedReview {
  id: string;
  repositoryId: string;
  prNumber: number;
  
  // What was skipped
  skipType: 'full_review' | 'security_check' | 'test_coverage' | 'documentation' | 'performance';
  reason: string;
  reasonCategory: 'time_pressure' | 'low_risk' | 'emergency' | 'other';
  
  // Who and when
  skippedBy: string;
  skippedAt: Date;
  approvedBy?: string;
  
  // Impact
  riskLevel: 'low' | 'medium' | 'high';
  filesAffected: number;
  
  // Follow-up
  followUpRequired: boolean;
  followUpBy?: Date;
  followUpCompleted: boolean;
  followUpCompletedAt?: Date;
  resultingDebtItems: string[];
}

// ============================================
// Agent Input/Output
// ============================================

export interface DebtDashboardInput {
  operation: 'get_dashboard' | 'add_item' | 'update_item' | 'resolve_item' | 
             'get_trends' | 'create_sprint' | 'update_sprint' | 
             'configure_policy' | 'record_skip' | 'get_recommendations';
  repositoryId: string;
  item?: Partial<DebtItem>;
  itemId?: string;
  sprint?: Partial<DebtSprint>;
  sprintId?: string;
  policy?: Partial<DebtPolicy>;
  skip?: Partial<SkippedReview>;
  timeRange?: { start: Date; end: Date };
}

export interface DebtDashboardResult {
  operation: string;
  success: boolean;
  data?: {
    dashboard?: DebtDashboard;
    item?: DebtItem;
    items?: DebtItem[];
    sprint?: DebtSprint;
    trends?: DebtTrends;
    recommendations?: DebtRecommendation[];
    policy?: DebtPolicy;
  };
  error?: string;
}
