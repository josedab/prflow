/**
 * @fileoverview Types for Enhanced PR Decomposition with One-Click Split
 */

export interface SemanticCluster {
  id: string;
  name: string;
  description: string;
  files: Array<{
    path: string;
    changeType: 'full' | 'partial';
    lines?: { start: number; end: number }[];
  }>;
  dependencies: string[];
  estimatedReviewTime: number;
  category: 'feature' | 'refactor' | 'test' | 'docs' | 'config' | 'bugfix';
}

export interface DecompositionPlan {
  originalPR: number;
  totalFiles: number;
  totalLines: number;
  clusters: SemanticCluster[];
  mergeOrder: Array<{
    order: number;
    clusterId: string;
    dependsOn: string[];
  }>;
  risks: string[];
  estimatedTotalReviewTime: number;
  confidence: number;
}

export interface SplitExecution {
  id: string;
  originalPR: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  createdPRs: Array<{
    number: number;
    branch: string;
    clusterId: string;
    title: string;
    isDraft: boolean;
  }>;
  errors: string[];
  startedAt: Date;
  completedAt?: Date;
}

export interface DecompositionThresholds {
  maxLinesPerPR: number;
  maxFilesPerPR: number;
  autoSuggestThreshold: number;
  enableAutoSplit: boolean;
}
