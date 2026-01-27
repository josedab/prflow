import { z } from 'zod';

// ============================================
// PR Decomposition Types
// ============================================

export const DecompositionStrategySchema = z.enum([
  'semantic',    // Group by semantic meaning (feature, bugfix, refactor)
  'directory',   // Group by directory structure
  'dependency',  // Group by dependency relationships
  'size',        // Split to keep PRs under size threshold
  'reviewer',    // Group by likely reviewer
  'risk',        // Separate high-risk from low-risk changes
]);
export type DecompositionStrategy = z.infer<typeof DecompositionStrategySchema>;

export const SplitStatusSchema = z.enum([
  'pending',
  'analyzing',
  'ready',
  'splitting',
  'completed',
  'failed',
  'merged',
]);
export type SplitStatus = z.infer<typeof SplitStatusSchema>;

// ============================================
// Change Cluster
// ============================================

export interface ChangeCluster {
  id: string;
  name: string;
  description: string;
  type: 'feature' | 'bugfix' | 'refactor' | 'docs' | 'test' | 'config' | 'mixed';
  files: ClusterFile[];
  priority: number;
  dependencies: string[];  // IDs of clusters this depends on
  dependents: string[];    // IDs of clusters that depend on this
  risk: 'low' | 'medium' | 'high';
  estimatedReviewTime: number;  // minutes
  suggestedReviewers: string[];
  metadata: ClusterMetadata;
}

export interface ClusterFile {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  hunks: FileHunk[];
  splitHunks?: FileHunk[][];  // If file needs to be split across clusters
}

export interface FileHunk {
  startLine: number;
  endLine: number;
  content: string;
  semanticType?: string;
}

export interface ClusterMetadata {
  semanticLabels: string[];
  affectedModules: string[];
  testCoverage: number | null;
  complexity: number;
  couplingScore: number;  // How tightly coupled to other clusters
}

// ============================================
// Decomposition Analysis
// ============================================

export interface DecompositionAnalysis {
  prNumber: number;
  originalSize: {
    files: number;
    additions: number;
    deletions: number;
  };
  suggestedSplits: SplitSuggestion[];
  dependencyGraph: ClusterDependencyGraph;
  mergeOrder: string[];  // Recommended order to merge clusters
  risks: DecompositionRisk[];
  recommendations: string[];
}

export interface SplitSuggestion {
  strategy: DecompositionStrategy;
  clusters: ChangeCluster[];
  confidence: number;
  pros: string[];
  cons: string[];
}

export interface ClusterDependencyGraph {
  nodes: Array<{ id: string; name: string; type: string }>;
  edges: Array<{ from: string; to: string; type: 'hard' | 'soft' }>;
}

export interface DecompositionRisk {
  type: 'dependency_cycle' | 'merge_conflict' | 'test_isolation' | 'semantic_split';
  severity: 'low' | 'medium' | 'high';
  description: string;
  affectedClusters: string[];
  mitigation?: string;
}

// ============================================
// Split PR
// ============================================

export interface SplitPR {
  id: string;
  parentPRNumber: number;
  prNumber?: number;  // Set after PR is created
  clusterId: string;
  clusterName: string;
  branch: string;
  title: string;
  body: string;
  files: ClusterFile[];
  status: SplitStatus;
  dependencies: string[];  // IDs of split PRs this depends on
  url?: string;
  createdAt?: Date;
  mergedAt?: Date;
}

export interface DecompositionResult {
  analysisId: string;
  prNumber: number;
  strategy: DecompositionStrategy;
  splitPRs: SplitPR[];
  parentPR: {
    number: number;
    status: 'open' | 'closed' | 'converted';
    trackingIssue?: string;
  };
  mergeQueue: MergeQueueItem[];
  status: SplitStatus;
  createdAt: Date;
  completedAt?: Date;
}

export interface MergeQueueItem {
  splitPRId: string;
  order: number;
  status: 'pending' | 'ready' | 'merging' | 'merged' | 'blocked';
  blockedBy: string[];
  estimatedMergeTime?: Date;
}

// ============================================
// Agent Input/Output
// ============================================

export interface DecompositionAgentInput {
  pr: {
    number: number;
    title: string;
    body: string | null;
    head: { ref: string; sha: string };
    base: { ref: string };
  };
  diff: {
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;
    totalAdditions: number;
    totalDeletions: number;
  };
  strategy?: DecompositionStrategy;
  maxClusterSize?: number;
  minClusterSize?: number;
  createPRs?: boolean;
}

export interface DecompositionAgentConfig {
  defaultStrategy: DecompositionStrategy;
  maxFilesPerCluster: number;
  maxLinesPerCluster: number;
  minFilesPerCluster: number;
  preserveAtomicChanges: boolean;
  createTrackingIssue: boolean;
}

// ============================================
// Hunk Analysis
// ============================================

export interface HunkAnalysis {
  hunkId: string;
  file: string;
  startLine: number;
  endLine: number;
  semanticType: string;
  relatedSymbols: string[];
  canSplit: boolean;
  splitPoints?: number[];
}

// ============================================
// Merge Coordination
// ============================================

export interface MergeCoordination {
  splitPRId: string;
  prNumber: number;
  status: 'pending' | 'ready' | 'in_progress' | 'completed' | 'failed';
  dependencies: Array<{
    splitPRId: string;
    prNumber: number;
    status: 'pending' | 'merged';
  }>;
  conflicts: Array<{
    file: string;
    conflictingPRs: number[];
    resolution?: string;
  }>;
  autoMergeEnabled: boolean;
  mergeMethod: 'merge' | 'squash' | 'rebase';
}
