import { z } from 'zod';

// ============================================
// Predictive CI Types
// ============================================

export const TestPrioritySchema = z.enum([
  'critical',    // Must run - likely to fail
  'high',        // Should run - moderately likely to fail
  'medium',      // Can run - some chance of failure
  'low',         // Skip if time constrained
  'skip',        // Unlikely to be affected
]);
export type TestPriority = z.infer<typeof TestPrioritySchema>;

export const PredictionConfidenceSchema = z.enum([
  'very_high',   // >90% confidence
  'high',        // 70-90%
  'medium',      // 50-70%
  'low',         // 30-50%
  'very_low',    // <30%
]);
export type PredictionConfidence = z.infer<typeof PredictionConfidenceSchema>;

// ============================================
// Test Prediction
// ============================================

export interface TestPrediction {
  testId: string;
  testName: string;
  testFile: string;
  priority: TestPriority;
  failureProbability: number;  // 0-1
  confidence: PredictionConfidence;
  reasons: PredictionReason[];
  estimatedDuration: number;  // milliseconds
  lastFailedAt?: Date;
  failureRate: number;  // Historical failure rate
  affectedBy: string[];  // Files that affect this test
}

export interface PredictionReason {
  type: 'file_change' | 'dependency_change' | 'historical_failure' | 'code_complexity' | 'flaky_test';
  description: string;
  weight: number;  // Contribution to final score
}

// ============================================
// Test Selection
// ============================================

export interface TestSelection {
  id: string;
  prNumber: number;
  repositoryId: string;
  changedFiles: string[];
  selectedTests: SelectedTest[];
  skippedTests: SkippedTest[];
  estimatedTime: CITimeEstimate;
  strategy: SelectionStrategy;
  createdAt: Date;
}

export interface SelectedTest {
  testId: string;
  testName: string;
  testFile: string;
  priority: TestPriority;
  failureProbability: number;
  estimatedDuration: number;
  order: number;  // Execution order (highest priority first)
}

export interface SkippedTest {
  testId: string;
  testName: string;
  testFile: string;
  reason: 'low_impact' | 'time_constraint' | 'no_file_change' | 'flaky' | 'manual_skip';
  confidence: PredictionConfidence;
}

export interface CITimeEstimate {
  fullSuiteTime: number;       // ms - time for all tests
  optimizedTime: number;       // ms - time for selected tests
  timeSaved: number;           // ms
  timeSavedPercent: number;    // 0-100
  parallelFactor: number;      // Number of parallel workers
}

export interface SelectionStrategy {
  type: 'all' | 'affected' | 'optimized' | 'critical_only' | 'custom';
  maxDuration?: number;        // ms - max test runtime
  minCoverage?: number;        // 0-100 - min code coverage
  failureThreshold?: number;   // 0-1 - min failure probability to include
  includeFlaky?: boolean;
}

// ============================================
// Historical Data
// ============================================

export interface TestHistoryEntry {
  testId: string;
  runId: string;
  result: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;  // ms
  prNumber?: number;
  commit: string;
  changedFiles: string[];
  timestamp: Date;
  errorMessage?: string;
  flaky?: boolean;
}

export interface TestStatistics {
  testId: string;
  testName: string;
  testFile: string;
  totalRuns: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  errorCount: number;
  passRate: number;           // 0-1
  avgDuration: number;        // ms
  p50Duration: number;        // ms - median
  p95Duration: number;        // ms - 95th percentile
  flakyScore: number;         // 0-1 - likelihood of being flaky
  lastRun?: Date;
  lastFailed?: Date;
  recentTrend: 'improving' | 'stable' | 'degrading';
}

export interface FileTestMapping {
  file: string;
  directTests: string[];      // Tests that directly test this file
  indirectTests: string[];    // Tests affected via dependencies
  coveragePercent: number;
  lastUpdated: Date;
}

// ============================================
// CI Run Analysis
// ============================================

export interface CIRunPrediction {
  runId: string;
  prNumber: number;
  predictions: TestPrediction[];
  expectedResult: 'pass' | 'fail' | 'unstable';
  expectedFailures: string[];
  expectedDuration: number;   // ms
  confidence: PredictionConfidence;
  recommendations: CIRecommendation[];
  createdAt: Date;
}

export interface CIRecommendation {
  type: 'run_first' | 'skip' | 'parallelize' | 'investigate' | 'fix_flaky';
  testIds: string[];
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
}

export interface CIRunResult {
  runId: string;
  prNumber: number;
  commit: string;
  status: 'success' | 'failure' | 'cancelled' | 'timeout';
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  duration: number;           // ms
  testResults: TestResult[];
  prediction?: CIRunPrediction;
  predictionAccuracy?: PredictionAccuracy;
  startedAt: Date;
  completedAt: Date;
}

export interface TestResult {
  testId: string;
  testName: string;
  testFile: string;
  result: 'passed' | 'failed' | 'skipped' | 'error';
  duration: number;           // ms
  errorMessage?: string;
  stackTrace?: string;
  retries?: number;
}

export interface PredictionAccuracy {
  correctPredictions: number;
  incorrectPredictions: number;
  accuracy: number;           // 0-1
  falsePositives: string[];   // Predicted to fail but passed
  falseNegatives: string[];   // Predicted to pass but failed
}

// ============================================
// Flaky Test Detection
// ============================================

export interface FlakyTestAnalysis {
  testId: string;
  testName: string;
  testFile: string;
  flakyScore: number;         // 0-1
  confidence: PredictionConfidence;
  indicators: FlakyIndicator[];
  recommendations: string[];
  lastAnalyzedAt: Date;
}

export interface FlakyIndicator {
  type: 'inconsistent_results' | 'timing_sensitive' | 'resource_dependent' | 'order_dependent' | 'external_dependency';
  description: string;
  evidence: string[];
  score: number;              // 0-1
}

// ============================================
// Agent Input/Output
// ============================================

export interface PredictiveCIInput {
  operation: 'predict' | 'select' | 'analyze' | 'record' | 'flaky_detection';
  repositoryId: string;
  prNumber?: number;
  changedFiles?: string[];
  commit?: string;
  strategy?: SelectionStrategy;
  testResults?: TestResult[];
}

export interface PredictiveCIResult {
  operation: string;
  success: boolean;
  data?: {
    predictions?: TestPrediction[];
    selection?: TestSelection;
    runPrediction?: CIRunPrediction;
    statistics?: TestStatistics[];
    flakyAnalysis?: FlakyTestAnalysis[];
    accuracy?: PredictionAccuracy;
  };
  error?: string;
}
