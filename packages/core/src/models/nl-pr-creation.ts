/**
 * @fileoverview Natural Language PR Creation Models
 *
 * Types for generating complete PRs from natural language descriptions,
 * including branch creation, code changes, tests, and PR metadata.
 *
 * @module models/nl-pr-creation
 */

// ============================================
// Request Types
// ============================================

/**
 * Natural language PR creation request
 */
export interface NLPRCreationRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Natural language description of the change */
  description: string;
  /** Target branch (default: main) */
  targetBranch?: string;
  /** Additional context */
  context?: NLPRContext;
  /** Options */
  options?: NLPRCreationOptions;
}

/**
 * Additional context for PR creation
 */
export interface NLPRContext {
  /** Related issue numbers */
  relatedIssues?: number[];
  /** Files to focus on */
  focusFiles?: string[];
  /** Existing code snippets to reference */
  codeSnippets?: Array<{
    file: string;
    content: string;
  }>;
  /** Requirements or acceptance criteria */
  requirements?: string[];
  /** Constraints or limitations */
  constraints?: string[];
}

/**
 * Options for PR creation
 */
export interface NLPRCreationOptions {
  /** Generate tests */
  generateTests?: boolean;
  /** Generate documentation */
  generateDocs?: boolean;
  /** Auto-format code */
  autoFormat?: boolean;
  /** Dry run (don't actually create PR) */
  dryRun?: boolean;
  /** Review before creation */
  reviewBeforeCreate?: boolean;
  /** Branch naming strategy */
  branchNaming?: 'auto' | 'conventional' | 'custom';
  /** Custom branch name */
  customBranchName?: string;
}

// ============================================
// Analysis Types
// ============================================

/**
 * Intent analysis result
 */
export interface NLIntentAnalysis {
  /** Primary intent */
  intent: NLIntent;
  /** Confidence score */
  confidence: number;
  /** Extracted entities */
  entities: ExtractedEntity[];
  /** Inferred change type */
  changeType: InferredChangeType;
  /** Scope assessment */
  scope: ScopeAssessment;
  /** Clarification questions (if any) */
  clarifications?: ClarificationQuestion[];
}

/**
 * Primary intent types
 */
export type NLIntent =
  | 'bug_fix'
  | 'new_feature'
  | 'enhancement'
  | 'refactor'
  | 'documentation'
  | 'test_addition'
  | 'dependency_update'
  | 'configuration_change'
  | 'performance_improvement'
  | 'security_fix';

/**
 * Extracted entity from natural language
 */
export interface ExtractedEntity {
  /** Entity type */
  type: EntityType;
  /** Entity value */
  value: string;
  /** Confidence */
  confidence: number;
  /** Source span in original text */
  span?: { start: number; end: number };
}

/**
 * Entity types
 */
export type EntityType =
  | 'file_path'
  | 'function_name'
  | 'class_name'
  | 'variable_name'
  | 'config_key'
  | 'error_message'
  | 'value'
  | 'duration'
  | 'version';

/**
 * Inferred change type
 */
export interface InferredChangeType {
  /** Primary change type */
  type: 'add' | 'modify' | 'delete' | 'rename' | 'move';
  /** Target type */
  target: 'file' | 'function' | 'class' | 'config' | 'dependency';
  /** Estimated complexity */
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
}

/**
 * Scope assessment
 */
export interface ScopeAssessment {
  /** Estimated files affected */
  estimatedFiles: number;
  /** Estimated lines of change */
  estimatedLines: number;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high';
  /** Affected areas */
  affectedAreas: string[];
}

/**
 * Clarification question
 */
export interface ClarificationQuestion {
  /** Question ID */
  id: string;
  /** Question text */
  question: string;
  /** Question type */
  type: 'choice' | 'text' | 'confirm';
  /** Options (for choice type) */
  options?: string[];
  /** Default value */
  defaultValue?: string;
  /** Required */
  required: boolean;
}

// ============================================
// Plan Types
// ============================================

/**
 * PR creation plan
 */
export interface PRCreationPlan {
  /** Plan ID */
  id: string;
  /** Original description */
  originalDescription: string;
  /** Intent analysis */
  intent: NLIntentAnalysis;
  /** Planned changes */
  changes: PlannedChange[];
  /** Branch name */
  branchName: string;
  /** PR title */
  prTitle: string;
  /** PR description */
  prDescription: string;
  /** Labels */
  labels: string[];
  /** Reviewers */
  suggestedReviewers: string[];
  /** Estimated effort */
  estimatedEffort: {
    complexity: string;
    risk: string;
    confidence: number;
  };
  /** Plan status */
  status: 'draft' | 'approved' | 'executing' | 'completed' | 'failed';
  /** Created at */
  createdAt: Date;
}

/**
 * A planned change
 */
export interface PlannedChange {
  /** Change ID */
  id: string;
  /** Change type */
  type: 'create' | 'modify' | 'delete' | 'rename';
  /** File path */
  file: string;
  /** New file path (for rename) */
  newFile?: string;
  /** Change description */
  description: string;
  /** Planned content (for create/modify) */
  plannedContent?: string;
  /** Code diff preview */
  diffPreview?: string;
  /** Dependencies on other changes */
  dependsOn?: string[];
  /** Order */
  order: number;
}

// ============================================
// Execution Types
// ============================================

/**
 * PR creation execution result
 */
export interface PRCreationResult {
  /** Result ID */
  id: string;
  /** Plan ID */
  planId: string;
  /** Success */
  success: boolean;
  /** Created PR (if successful) */
  pullRequest?: CreatedPullRequest;
  /** Applied changes */
  appliedChanges: AppliedChange[];
  /** Errors (if any) */
  errors: ExecutionError[];
  /** Execution metrics */
  metrics: ExecutionMetrics;
  /** Completed at */
  completedAt: Date;
}

/**
 * Created pull request info
 */
export interface CreatedPullRequest {
  /** PR number */
  number: number;
  /** PR URL */
  url: string;
  /** PR title */
  title: string;
  /** Branch name */
  branch: string;
  /** Commit SHA */
  commitSha: string;
  /** Files changed */
  filesChanged: number;
  /** Lines added */
  linesAdded: number;
  /** Lines deleted */
  linesDeleted: number;
}

/**
 * Applied change
 */
export interface AppliedChange {
  /** Change ID */
  changeId: string;
  /** File path */
  file: string;
  /** Change type */
  type: 'create' | 'modify' | 'delete' | 'rename';
  /** Success */
  success: boolean;
  /** Error (if failed) */
  error?: string;
  /** Commit SHA */
  commitSha?: string;
}

/**
 * Execution error
 */
export interface ExecutionError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Related change ID */
  changeId?: string;
  /** Related file */
  file?: string;
  /** Recoverable */
  recoverable: boolean;
  /** Suggestion */
  suggestion?: string;
}

/**
 * Execution metrics
 */
export interface ExecutionMetrics {
  /** Total execution time (ms) */
  totalTimeMs: number;
  /** Planning time (ms) */
  planningTimeMs: number;
  /** Code generation time (ms) */
  codeGenTimeMs: number;
  /** Git operations time (ms) */
  gitOpsTimeMs: number;
  /** LLM tokens used */
  tokensUsed: number;
  /** Retries */
  retries: number;
}

// ============================================
// Template Types
// ============================================

/**
 * PR creation template
 */
export interface PRCreationTemplate {
  /** Template ID */
  id: string;
  /** Template name */
  name: string;
  /** Description */
  description: string;
  /** Intent pattern */
  intentPattern: NLIntent[];
  /** Template prompt */
  prompt: string;
  /** Variable placeholders */
  variables: TemplateVariable[];
  /** Example descriptions */
  examples: string[];
  /** Usage count */
  usageCount: number;
}

/**
 * Template variable
 */
export interface TemplateVariable {
  /** Variable name */
  name: string;
  /** Variable type */
  type: 'string' | 'number' | 'file' | 'function';
  /** Description */
  description: string;
  /** Required */
  required: boolean;
  /** Default value */
  defaultValue?: string;
}

// ============================================
// History Types
// ============================================

/**
 * PR creation history entry
 */
export interface PRCreationHistory {
  /** Entry ID */
  id: string;
  /** User ID */
  userId: string;
  /** Repository */
  repository: {
    owner: string;
    name: string;
  };
  /** Original description */
  description: string;
  /** Created PR number (if successful) */
  prNumber?: number;
  /** Success */
  success: boolean;
  /** Error message (if failed) */
  error?: string;
  /** Intent detected */
  intent: NLIntent;
  /** Files affected */
  filesAffected: number;
  /** Created at */
  createdAt: Date;
  /** Feedback */
  feedback?: {
    rating: 1 | 2 | 3 | 4 | 5;
    comment?: string;
  };
}

// ============================================
// Suggestion Types
// ============================================

/**
 * PR description suggestion
 */
export interface PRDescriptionSuggestion {
  /** Original input */
  originalInput: string;
  /** Improved description */
  improvedDescription: string;
  /** Suggested title */
  suggestedTitle: string;
  /** Key points */
  keyPoints: string[];
  /** Missing information */
  missingInfo: string[];
  /** Confidence */
  confidence: number;
}

/**
 * Code generation suggestion
 */
export interface CodeGenerationSuggestion {
  /** File path */
  file: string;
  /** Suggested code */
  code: string;
  /** Language */
  language: string;
  /** Explanation */
  explanation: string;
  /** Alternatives */
  alternatives?: Array<{
    code: string;
    description: string;
  }>;
  /** Confidence */
  confidence: number;
}
