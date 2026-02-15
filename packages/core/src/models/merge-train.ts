/**
 * @fileoverview Types for Intelligent Merge Train
 *
 * ML-powered merge queue with PR batching, CI prediction,
 * and real-time visualization.
 */

export type MergeTrainStatus = 'queued' | 'testing' | 'merging' | 'merged' | 'failed' | 'ejected';

export interface MergeTrainEntry {
  id: string;
  repositoryId: string;
  pullRequestNumber: number;
  pullRequestTitle: string;
  author: string;
  position: number;
  status: MergeTrainStatus;
  priority: number;
  ciPrediction: MergeTrainCIPrediction;
  enqueuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  batchId?: string;
}

export interface MergeTrainCIPrediction {
  passProb: number;
  estimatedDurationMinutes: number;
  riskFactors: string[];
  confidence: number;
  model: string;
}

export interface MergeTrainBatch {
  id: string;
  repositoryId: string;
  entries: MergeTrainEntry[];
  combinedPassProb: number;
  status: 'pending' | 'testing' | 'passed' | 'failed' | 'bisecting';
  createdAt: Date;
  ciRunId?: string;
  failedEntryId?: string;
}

export interface MergeTrainState {
  repositoryId: string;
  queue: MergeTrainEntry[];
  activeBatches: MergeTrainBatch[];
  completedToday: number;
  failedToday: number;
  averageWaitMinutes: number;
  estimatedClearTimeMinutes: number;
}

export interface MergeTrainConfig {
  enabled: boolean;
  maxBatchSize: number;
  minPassProbForBatch: number;
  autoRebase: boolean;
  priorityLabels: Record<string, number>;
  requiredChecks: string[];
  bisectOnFailure: boolean;
}

export interface BatchCompatibilityResult {
  compatible: boolean;
  reason?: string;
  fileOverlapCount: number;
  conflictRisk: number;
}

export interface MergeTrainMetrics {
  repositoryId: string;
  period: { start: Date; end: Date };
  totalMerged: number;
  totalFailed: number;
  totalBatches: number;
  averageBatchSize: number;
  ciMinutesSaved: number;
  predictionAccuracy: number;
  averageTimeToMergeMinutes: number;
  bisectionCount: number;
}
