/**
 * @fileoverview Self-Healing CI Integration Models
 *
 * Types for automatic CI failure detection, diagnosis, and remediation.
 * Includes flaky test detection, dependency resolution, and build fix suggestions.
 *
 * @module models/self-healing-ci
 */

// ============================================
// CI Status Types
// ============================================

/**
 * CI provider
 */
export type CIProvider = 'github_actions' | 'jenkins' | 'circleci' | 'gitlab_ci' | 'azure_pipelines' | 'travis';

/**
 * CI run status
 */
export type CIRunStatus = 'queued' | 'in_progress' | 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out';

/**
 * Failure category
 */
export type FailureCategory =
  | 'test_failure'
  | 'build_failure'
  | 'lint_error'
  | 'type_error'
  | 'dependency_error'
  | 'timeout'
  | 'infrastructure'
  | 'flaky_test'
  | 'resource_exhaustion'
  | 'configuration_error'
  | 'unknown';

// ============================================
// CI Run Types
// ============================================

/**
 * CI run information
 */
export interface CIRun {
  /** Run ID */
  id: string;
  /** CI provider */
  provider: CIProvider;
  /** Workflow/pipeline name */
  workflowName: string;
  /** Run number */
  runNumber: number;
  /** Status */
  status: CIRunStatus;
  /** Conclusion */
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out';
  /** PR number */
  prNumber?: number;
  /** Branch */
  branch: string;
  /** Commit SHA */
  commitSha: string;
  /** Jobs */
  jobs: CIJob[];
  /** Started at */
  startedAt: Date;
  /** Completed at */
  completedAt?: Date;
  /** Duration (ms) */
  durationMs?: number;
  /** URL */
  url: string;
}

/**
 * CI job
 */
export interface CIJob {
  /** Job ID */
  id: string;
  /** Job name */
  name: string;
  /** Status */
  status: CIRunStatus;
  /** Conclusion */
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped' | 'timed_out';
  /** Steps */
  steps: CIStep[];
  /** Started at */
  startedAt?: Date;
  /** Completed at */
  completedAt?: Date;
  /** Duration (ms) */
  durationMs?: number;
  /** Runner OS */
  runnerOS?: string;
  /** Runner labels */
  runnerLabels?: string[];
}

/**
 * CI step
 */
export interface CIStep {
  /** Step number */
  number: number;
  /** Step name */
  name: string;
  /** Status */
  status: CIRunStatus;
  /** Conclusion */
  conclusion?: 'success' | 'failure' | 'cancelled' | 'skipped';
  /** Started at */
  startedAt?: Date;
  /** Completed at */
  completedAt?: Date;
  /** Log output (truncated) */
  log?: string;
}

// ============================================
// Failure Analysis Types
// ============================================

/**
 * CI failure analysis result
 */
export interface CIFailureAnalysis {
  /** Analysis ID */
  id: string;
  /** CI run */
  run: CIRun;
  /** Detected failures */
  failures: DetectedFailure[];
  /** Root cause analysis */
  rootCause: RootCauseAnalysis;
  /** Is flaky */
  isFlaky: boolean;
  /** Flakiness confidence */
  flakinessConfidence?: number;
  /** Suggested fixes */
  suggestedFixes: CIFix[];
  /** Auto-fixable */
  autoFixable: boolean;
  /** Analysis confidence */
  confidence: number;
  /** Analyzed at */
  analyzedAt: Date;
}

/**
 * Detected failure
 */
export interface DetectedFailure {
  /** Failure ID */
  id: string;
  /** Job name */
  job: string;
  /** Step name */
  step?: string;
  /** Category */
  category: FailureCategory;
  /** Error message */
  errorMessage: string;
  /** File (if applicable) */
  file?: string;
  /** Line (if applicable) */
  line?: number;
  /** Stack trace */
  stackTrace?: string;
  /** Test name (if test failure) */
  testName?: string;
  /** Similar past failures */
  similarPastFailures: number;
}

/**
 * Root cause analysis
 */
export interface RootCauseAnalysis {
  /** Primary cause */
  primaryCause: string;
  /** Category */
  category: FailureCategory;
  /** Confidence */
  confidence: number;
  /** Contributing factors */
  contributingFactors: string[];
  /** Evidence */
  evidence: string[];
  /** Affected components */
  affectedComponents: string[];
}

// ============================================
// Fix Suggestion Types
// ============================================

/**
 * CI fix suggestion
 */
export interface CIFix {
  /** Fix ID */
  id: string;
  /** Fix type */
  type: CIFixType;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Auto-applicable */
  autoApplicable: boolean;
  /** Confidence */
  confidence: number;
  /** Code changes */
  codeChanges?: CodeChange[];
  /** CI config changes */
  ciConfigChanges?: CIConfigChange[];
  /** Commands to run */
  commands?: string[];
  /** Expected outcome */
  expectedOutcome: string;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Fix types
 */
export type CIFixType =
  | 'code_fix'
  | 'test_fix'
  | 'dependency_update'
  | 'config_change'
  | 'retry'
  | 'skip_test'
  | 'increase_timeout'
  | 'add_retry'
  | 'fix_flaky_test'
  | 'update_baseline';

/**
 * Code change
 */
export interface CodeChange {
  /** File path */
  file: string;
  /** Line number */
  line?: number;
  /** Original code */
  original?: string;
  /** Fixed code */
  fixed: string;
  /** Explanation */
  explanation: string;
}

/**
 * CI config change
 */
export interface CIConfigChange {
  /** Config file */
  file: string;
  /** Path in config */
  path: string;
  /** Original value */
  original?: unknown;
  /** New value */
  newValue: unknown;
  /** Explanation */
  explanation: string;
}

// ============================================
// Flaky Test Types
// ============================================

/**
 * Flaky test record
 */
export interface FlakyTest {
  /** Test ID */
  id: string;
  /** Test name */
  name: string;
  /** Test file */
  file: string;
  /** Test suite */
  suite?: string;
  /** Repository */
  repository: { owner: string; name: string };
  /** Flakiness score (0-100) */
  flakinessScore: number;
  /** Pass rate */
  passRate: number;
  /** Total runs */
  totalRuns: number;
  /** Failures */
  failures: number;
  /** Passes */
  passes: number;
  /** First detected */
  firstDetected: Date;
  /** Last failure */
  lastFailure?: Date;
  /** Failure patterns */
  failurePatterns: FailurePattern[];
  /** Status */
  status: 'active' | 'fixed' | 'quarantined' | 'ignored';
  /** Assigned to */
  assignedTo?: string;
}

/**
 * Failure pattern
 */
export interface FailurePattern {
  /** Pattern type */
  type: 'timing' | 'resource' | 'ordering' | 'network' | 'state' | 'concurrency' | 'unknown';
  /** Description */
  description: string;
  /** Frequency */
  frequency: number;
  /** Example error */
  exampleError?: string;
}

// ============================================
// Auto-Healing Types
// ============================================

/**
 * Auto-healing result
 */
export interface AutoHealingResult {
  /** Result ID */
  id: string;
  /** CI run */
  runId: string;
  /** Fixes applied */
  fixesApplied: AppliedFix[];
  /** Fixes skipped */
  fixesSkipped: Array<{ fix: CIFix; reason: string }>;
  /** New CI run triggered */
  newRunTriggered: boolean;
  /** New run ID */
  newRunId?: string;
  /** Success */
  success: boolean;
  /** Commit created */
  commitSha?: string;
  /** Applied at */
  appliedAt: Date;
}

/**
 * Applied fix
 */
export interface AppliedFix {
  /** Fix */
  fix: CIFix;
  /** Changes made */
  changesMade: string[];
  /** Commit SHA */
  commitSha?: string;
  /** Success */
  success: boolean;
  /** Error if failed */
  error?: string;
}

// ============================================
// CI Health Types
// ============================================

/**
 * CI health dashboard
 */
export interface CIHealthDashboard {
  /** Repository */
  repository: { owner: string; name: string };
  /** Period */
  period: { start: Date; end: Date };
  /** Overall health score */
  healthScore: number;
  /** Success rate */
  successRate: number;
  /** Average duration (ms) */
  avgDurationMs: number;
  /** Total runs */
  totalRuns: number;
  /** Successful runs */
  successfulRuns: number;
  /** Failed runs */
  failedRuns: number;
  /** Flaky test count */
  flakyTestCount: number;
  /** Auto-healed count */
  autoHealedCount: number;
  /** Failure breakdown */
  failureBreakdown: Record<FailureCategory, number>;
  /** Trends */
  trends: CITrends;
  /** Top failures */
  topFailures: Array<{ error: string; count: number; lastOccurred: Date }>;
  /** Recommendations */
  recommendations: SelfHealingRecommendation[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * CI trends
 */
export interface CITrends {
  /** Success rate trend */
  successRateTrend: 'improving' | 'stable' | 'degrading';
  /** Duration trend */
  durationTrend: 'improving' | 'stable' | 'degrading';
  /** Flakiness trend */
  flakinessTrend: 'improving' | 'stable' | 'degrading';
  /** Historical data */
  history: Array<{
    date: Date;
    successRate: number;
    avgDuration: number;
    flakyTests: number;
  }>;
}

/**
 * CI recommendation
 */
export interface SelfHealingRecommendation {
  /** Recommendation ID */
  id: string;
  /** Type */
  type: 'performance' | 'reliability' | 'flakiness' | 'cost' | 'security';
  /** Priority */
  priority: 'low' | 'medium' | 'high';
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Actions */
  actions: string[];
  /** Expected impact */
  expectedImpact: string;
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Analyze CI failure request
 */
export interface AnalyzeCIFailureRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Run ID */
  runId: string;
  /** Provider */
  provider?: CIProvider;
  /** Include fix suggestions */
  includeFixes?: boolean;
  /** Include flakiness analysis */
  includeFlakinessAnalysis?: boolean;
}

/**
 * Apply fix request
 */
export interface ApplyFixRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Run ID */
  runId: string;
  /** Fix IDs to apply */
  fixIds: string[];
  /** Create commit */
  createCommit?: boolean;
  /** Trigger re-run */
  triggerRerun?: boolean;
  /** Dry run */
  dryRun?: boolean;
}

/**
 * Get flaky tests request
 */
export interface GetFlakyTestsRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Minimum flakiness score */
  minScore?: number;
  /** Status filter */
  status?: FlakyTest['status'];
  /** Limit */
  limit?: number;
}

/**
 * Quarantine test request
 */
export interface QuarantineTestRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Test ID */
  testId: string;
  /** Reason */
  reason: string;
  /** Auto-unquarantine after fix */
  autoUnquarantine?: boolean;
}

// ============================================
// Webhook Types
// ============================================

/**
 * CI webhook payload
 */
export interface CIWebhookPayload {
  /** Provider */
  provider: CIProvider;
  /** Event type */
  event: 'run_started' | 'run_completed' | 'job_started' | 'job_completed';
  /** Repository */
  repository: { owner: string; name: string };
  /** Run ID */
  runId: string;
  /** Status */
  status: CIRunStatus;
  /** Conclusion */
  conclusion?: string;
  /** PR number */
  prNumber?: number;
  /** Branch */
  branch: string;
  /** Commit SHA */
  commitSha: string;
  /** Timestamp */
  timestamp: Date;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Self-healing configuration
 */
export interface SelfHealingConfig {
  /** Enabled */
  enabled: boolean;
  /** Auto-fix enabled */
  autoFixEnabled: boolean;
  /** Auto-retry on flaky failure */
  autoRetryFlaky: boolean;
  /** Max auto-retries */
  maxAutoRetries: number;
  /** Auto-quarantine flaky tests */
  autoQuarantineFlaky: boolean;
  /** Flakiness threshold for quarantine */
  flakinessThreshold: number;
  /** Allowed fix types */
  allowedFixTypes: CIFixType[];
  /** Notification settings */
  notifications: {
    onFailure: boolean;
    onAutoFix: boolean;
    onFlakyDetected: boolean;
    channels: string[];
  };
}
