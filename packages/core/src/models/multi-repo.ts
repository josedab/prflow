import { z } from 'zod';

// ============================================
// Multi-Repository Orchestration Types
// ============================================

export const ChangeSetStatusSchema = z.enum([
  'draft',
  'ready',
  'in_progress',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
export type ChangeSetStatus = z.infer<typeof ChangeSetStatusSchema>;

export const RepoPRStatusSchema = z.enum([
  'pending',
  'created',
  'reviewing',
  'approved',
  'merged',
  'blocked',
  'failed',
]);
export type RepoPRStatus = z.infer<typeof RepoPRStatusSchema>;

export const ConflictTypeSchema = z.enum([
  'merge_conflict',
  'api_breaking',
  'version_mismatch',
  'dependency_cycle',
  'test_failure',
]);
export type ConflictType = z.infer<typeof ConflictTypeSchema>;

// ============================================
// Change Set
// ============================================

export interface MultiRepoChangeSet {
  id: string;
  name: string;
  description: string;
  status: ChangeSetStatus;
  owner: string;
  repositories: RepoChange[];
  dependencyGraph: DependencyGraph;
  mergeOrder: string[];
  conflicts: CrossRepoConflict[];
  timeline: ChangeSetEvent[];
  settings: ChangeSetSettings;
  stats: ChangeSetStats;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface RepoChange {
  id: string;
  repositoryId: string;
  repositoryFullName: string;
  branch: string;
  baseBranch: string;
  prNumber?: number;
  prUrl?: string;
  prStatus: RepoPRStatus;
  commits: CommitInfo[];
  files: string[];
  additions: number;
  deletions: number;
  dependencies: string[];  // IDs of repos this depends on
  dependents: string[];    // IDs of repos that depend on this
  reviewers: string[];
  approvals: string[];
  checks: CheckStatus[];
  metadata: RepoChangeMetadata;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: string;
  timestamp: Date;
}

export interface CheckStatus {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  url?: string;
  startedAt?: Date;
  completedAt?: Date;
}

export interface RepoChangeMetadata {
  apiVersion?: string;
  packageVersion?: string;
  changelog?: string;
  breakingChanges?: string[];
  labels?: string[];
}

// ============================================
// Dependency Graph
// ============================================

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  hasCycles: boolean;
  topologicalOrder: string[];
}

export interface DependencyNode {
  id: string;
  repositoryId: string;
  name: string;
  type: 'package' | 'service' | 'library' | 'application';
  version?: string;
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'runtime' | 'dev' | 'peer' | 'api' | 'data';
  versionConstraint?: string;
  required: boolean;
}

// ============================================
// Cross-Repository Conflicts
// ============================================

export interface CrossRepoConflict {
  id: string;
  type: ConflictType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  affectedRepos: string[];
  description: string;
  details: ConflictDetails;
  resolution?: ConflictResolution;
  status: 'open' | 'resolving' | 'resolved' | 'ignored';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface ConflictDetails {
  files?: string[];
  apiEndpoints?: string[];
  schemas?: string[];
  versions?: Record<string, string>;
  errorMessages?: string[];
}

export interface ConflictResolution {
  type: 'manual' | 'automatic' | 'coordinated';
  description: string;
  steps: ResolutionStep[];
  resolvedBy?: string;
}

export interface ResolutionStep {
  order: number;
  repository: string;
  action: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

// ============================================
// Change Set Settings
// ============================================

export interface ChangeSetSettings {
  autoMerge: boolean;
  requireAllApprovals: boolean;
  requireAllChecks: boolean;
  mergeMethod: 'merge' | 'squash' | 'rebase';
  deleteSourceBranches: boolean;
  notifications: NotificationSettings;
  coordinatedMergeWindow?: MergeWindow;
}

export interface NotificationSettings {
  slackChannel?: string;
  emailRecipients?: string[];
  notifyOnConflict: boolean;
  notifyOnApproval: boolean;
  notifyOnMerge: boolean;
}

export interface MergeWindow {
  dayOfWeek: number[];  // 0-6, Sunday = 0
  startHour: number;    // 0-23
  endHour: number;      // 0-23
  timezone: string;
}

// ============================================
// Timeline Events
// ============================================

export type ChangeSetEventType =
  | 'created'
  | 'repo_added'
  | 'repo_removed'
  | 'pr_created'
  | 'pr_updated'
  | 'pr_approved'
  | 'pr_merged'
  | 'conflict_detected'
  | 'conflict_resolved'
  | 'status_changed'
  | 'comment'
  | 'completed';

export interface ChangeSetEvent {
  id: string;
  type: ChangeSetEventType;
  timestamp: Date;
  actor?: string;
  repository?: string;
  details: Record<string, unknown>;
}

// ============================================
// Statistics
// ============================================

export interface ChangeSetStats {
  totalRepos: number;
  totalPRs: number;
  mergedPRs: number;
  pendingPRs: number;
  blockedPRs: number;
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  totalConflicts: number;
  resolvedConflicts: number;
  avgReviewTime: number;  // minutes
  estimatedCompletion?: Date;
}

// ============================================
// Atomic Deployment
// ============================================

export interface AtomicDeployment {
  id: string;
  changeSetId: string;
  status: 'pending' | 'deploying' | 'deployed' | 'rolling_back' | 'rolled_back' | 'failed';
  repositories: DeploymentTarget[];
  strategy: DeploymentStrategy;
  healthChecks: HealthCheck[];
  rollbackPlan: RollbackPlan;
  startedAt?: Date;
  completedAt?: Date;
}

export interface DeploymentTarget {
  repositoryId: string;
  environment: string;
  version: string;
  status: 'pending' | 'deploying' | 'deployed' | 'failed';
  url?: string;
}

export interface DeploymentStrategy {
  type: 'all_at_once' | 'canary' | 'blue_green' | 'rolling';
  batchSize?: number;
  batchDelay?: number;
  canaryPercent?: number;
}

export interface HealthCheck {
  repository: string;
  endpoint: string;
  expectedStatus: number;
  timeout: number;
  status: 'pending' | 'passing' | 'failing';
  lastCheck?: Date;
}

export interface RollbackPlan {
  automatic: boolean;
  trigger: 'health_check_failure' | 'manual' | 'timeout';
  targets: Array<{
    repositoryId: string;
    previousVersion: string;
  }>;
}

// ============================================
// Agent Input/Output
// ============================================

export interface MultiRepoOrchestrationInput {
  operation: 'create' | 'analyze' | 'merge' | 'rollback' | 'status' | 'resolve_conflict';
  changeSetId?: string;
  repositories?: Array<{
    repositoryId: string;
    branch: string;
    baseBranch?: string;
  }>;
  conflictId?: string;
  resolution?: ConflictResolution;
  deploymentConfig?: Partial<AtomicDeployment>;
}

export interface MultiRepoOrchestrationResult {
  operation: string;
  success: boolean;
  data?: {
    changeSet?: MultiRepoChangeSet;
    conflicts?: CrossRepoConflict[];
    deployment?: AtomicDeployment;
    mergeResults?: Array<{ repositoryId: string; merged: boolean; error?: string }>;
  };
  error?: string;
}
