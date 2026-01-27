import { z } from 'zod';

// ============================================
// Code Intent Understanding Types
// ============================================

export const IntentCategorySchema = z.enum([
  'feature_addition',      // Adding new functionality
  'bug_fix',               // Fixing a bug
  'refactoring',           // Code restructuring without behavior change
  'performance_optimization', // Improving performance
  'security_fix',          // Security vulnerability fix
  'dependency_update',     // Updating dependencies
  'documentation',         // Documentation changes
  'testing',               // Adding or modifying tests
  'configuration',         // Config/environment changes
  'cleanup',               // Code cleanup, removing dead code
  'styling',               // Code style/formatting changes
  'migration',             // Data or code migration
  'infrastructure',        // CI/CD, deployment changes
  'unknown',               // Cannot determine intent
]);
export type IntentCategory = z.infer<typeof IntentCategorySchema>;

export const IntentConfidenceSchema = z.enum([
  'very_high',   // >90% confidence
  'high',        // 70-90%
  'medium',      // 50-70%
  'low',         // 30-50%
  'very_low',    // <30%
]);
export type IntentConfidence = z.infer<typeof IntentConfidenceSchema>;

// ============================================
// Intent Signals
// ============================================

export interface BranchNameSignal {
  raw: string;
  pattern: string | null;    // e.g., 'feature/', 'fix/', 'chore/'
  issueNumber: string | null; // Extracted issue/ticket number
  keywords: string[];
  suggestedCategory: IntentCategory | null;
}

export interface CommitMessageSignal {
  messages: string[];
  conventionalCommits: ConventionalCommit[];
  keywords: string[];
  suggestedCategory: IntentCategory | null;
  averageLength: number;
  hasIssueReferences: boolean;
}

export interface ConventionalCommit {
  type: string;           // feat, fix, docs, etc.
  scope: string | null;
  description: string;
  body: string | null;
  breakingChange: boolean;
  footers: Record<string, string>;
}

export interface CodeChangeSignal {
  filePatterns: FilePatternSignal[];
  changePatterns: ChangePatternSignal[];
  semanticSignals: SemanticSignal[];
  suggestedCategory: IntentCategory | null;
}

export interface FilePatternSignal {
  pattern: 'test_files' | 'config_files' | 'docs_files' | 'source_files' | 'dependency_files' | 'ci_files';
  fileCount: number;
  percentage: number;
}

export interface ChangePatternSignal {
  pattern: 'mostly_additions' | 'mostly_deletions' | 'balanced' | 'refactor_signature';
  confidence: number;
  description: string;
}

export interface SemanticSignal {
  type: 'new_function' | 'modified_function' | 'deleted_function' | 'new_class' | 'error_handling' | 'logging' | 'validation' | 'api_change';
  count: number;
  files: string[];
}

export interface PRMetadataSignal {
  title: string;
  titleKeywords: string[];
  bodyKeywords: string[];
  labels: string[];
  suggestedCategory: IntentCategory | null;
  hasPRTemplate: boolean;
  templateSections: string[];
}

// ============================================
// Intent Analysis Result
// ============================================

export interface IntentAnalysis {
  prNumber: number;
  repositoryId: string;
  
  // Primary intent
  primaryIntent: IntentCategory;
  primaryConfidence: IntentConfidence;
  primaryConfidenceScore: number; // 0-100
  
  // Secondary intents (PR may have multiple purposes)
  secondaryIntents: Array<{
    category: IntentCategory;
    confidence: IntentConfidenceScore;
    reason: string;
  }>;
  
  // Intent signals from various sources
  signals: {
    branchName: BranchNameSignal;
    commitMessages: CommitMessageSignal;
    codeChanges: CodeChangeSignal;
    prMetadata: PRMetadataSignal;
  };
  
  // Human-readable summary
  summary: IntentSummary;
  
  // How this intent affects review strategy
  reviewStrategy: IntentBasedReviewStrategy;
  
  // Metadata
  analyzedAt: Date;
  analysisVersion: string;
}

export interface IntentConfidenceScore {
  level: IntentConfidence;
  score: number; // 0-100
}

export interface IntentSummary {
  oneLiner: string;           // "This PR adds a new user authentication feature"
  detailedExplanation: string; // Longer explanation of what the PR does
  keyChanges: string[];        // Bullet points of main changes
  suggestedFocusAreas: string[]; // Where reviewers should focus
  potentialRisks: string[];    // Based on intent, what could go wrong
}

export interface IntentBasedReviewStrategy {
  // Suggested review depth
  reviewDepth: 'quick_scan' | 'standard' | 'thorough' | 'deep_dive';
  
  // Areas to focus on based on intent
  focusAreas: ReviewFocusArea[];
  
  // Questions to consider
  reviewQuestions: string[];
  
  // Suggested reviewers based on intent
  suggestedExpertise: string[];
  
  // Test requirements
  testingExpectations: TestingExpectation;
  
  // Documentation requirements
  documentationExpectations: DocumentationExpectation;
}

export interface ReviewFocusArea {
  area: string;
  importance: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
}

export interface TestingExpectation {
  required: boolean;
  types: ('unit' | 'integration' | 'e2e' | 'performance' | 'security')[];
  minimumCoverage: number | null;
  specificTests: string[];
}

export interface DocumentationExpectation {
  required: boolean;
  types: ('code_comments' | 'readme' | 'api_docs' | 'changelog' | 'migration_guide')[];
  specificRequirements: string[];
}

// ============================================
// Intent Feedback & Learning
// ============================================

export interface IntentFeedback {
  analysisId: string;
  prNumber: number;
  repositoryId: string;
  
  // Was the predicted intent correct?
  wasCorrect: boolean;
  
  // If incorrect, what was the actual intent?
  actualIntent?: IntentCategory;
  
  // Feedback on specific signals
  signalFeedback?: {
    branchNameHelpful: boolean;
    commitMessagesHelpful: boolean;
    codeChangesHelpful: boolean;
    prMetadataHelpful: boolean;
  };
  
  // Free-form feedback
  comments?: string;
  
  // User who provided feedback
  feedbackBy: string;
  feedbackAt: Date;
}

export interface IntentLearningStats {
  repositoryId: string;
  totalAnalyses: number;
  feedbackCount: number;
  accuracyRate: number;
  
  // Accuracy by category
  categoryAccuracy: Record<IntentCategory, {
    total: number;
    correct: number;
    accuracy: number;
  }>;
  
  // Most effective signals per repository
  signalEffectiveness: {
    branchName: number;
    commitMessages: number;
    codeChanges: number;
    prMetadata: number;
  };
  
  lastUpdated: Date;
}

// ============================================
// Intent Configuration
// ============================================

export interface IntentConfiguration {
  repositoryId: string;
  
  // Custom branch patterns
  branchPatterns: BranchPattern[];
  
  // Custom commit conventions
  commitConventions: CommitConvention[];
  
  // Custom keywords
  intentKeywords: Record<IntentCategory, string[]>;
  
  // Weight adjustments for signals
  signalWeights: {
    branchName: number;
    commitMessages: number;
    codeChanges: number;
    prMetadata: number;
  };
  
  // Minimum confidence threshold
  minimumConfidence: IntentConfidence;
}

export interface BranchPattern {
  pattern: string;       // Regex pattern
  category: IntentCategory;
  weight: number;        // 0-1
}

export interface CommitConvention {
  type: string;          // Commit type prefix
  category: IntentCategory;
  description: string;
}

// ============================================
// Agent Input/Output
// ============================================

export interface IntentAgentInput {
  operation: 'analyze' | 'feedback' | 'configure' | 'get_stats';
  prData?: {
    prNumber: number;
    title: string;
    body: string | null;
    headBranch: string;
    baseBranch: string;
    labels: string[];
    commits: Array<{
      sha: string;
      message: string;
    }>;
    files: Array<{
      filename: string;
      status: string;
      additions: number;
      deletions: number;
      patch?: string;
    }>;
  };
  feedback?: IntentFeedback;
  configuration?: Partial<IntentConfiguration>;
}

export interface IntentAgentResult {
  operation: string;
  success: boolean;
  data?: {
    analysis?: IntentAnalysis;
    stats?: IntentLearningStats;
    configuration?: IntentConfiguration;
  };
  error?: string;
}

// ============================================
// Default Intent Patterns
// ============================================

export const DEFAULT_BRANCH_PATTERNS: BranchPattern[] = [
  { pattern: '^feat(ure)?/', category: 'feature_addition', weight: 0.9 },
  { pattern: '^fix/', category: 'bug_fix', weight: 0.9 },
  { pattern: '^bugfix/', category: 'bug_fix', weight: 0.9 },
  { pattern: '^hotfix/', category: 'bug_fix', weight: 0.95 },
  { pattern: '^refactor/', category: 'refactoring', weight: 0.9 },
  { pattern: '^perf(ormance)?/', category: 'performance_optimization', weight: 0.9 },
  { pattern: '^security/', category: 'security_fix', weight: 0.95 },
  { pattern: '^sec/', category: 'security_fix', weight: 0.9 },
  { pattern: '^dep(s|endenc(y|ies))?/', category: 'dependency_update', weight: 0.9 },
  { pattern: '^bump/', category: 'dependency_update', weight: 0.8 },
  { pattern: '^docs?/', category: 'documentation', weight: 0.9 },
  { pattern: '^test/', category: 'testing', weight: 0.9 },
  { pattern: '^config/', category: 'configuration', weight: 0.8 },
  { pattern: '^chore/', category: 'cleanup', weight: 0.7 },
  { pattern: '^style/', category: 'styling', weight: 0.8 },
  { pattern: '^ci/', category: 'infrastructure', weight: 0.85 },
  { pattern: '^cd/', category: 'infrastructure', weight: 0.85 },
  { pattern: '^infra/', category: 'infrastructure', weight: 0.85 },
  { pattern: '^migrat(e|ion)/', category: 'migration', weight: 0.9 },
];

export const DEFAULT_COMMIT_CONVENTIONS: CommitConvention[] = [
  { type: 'feat', category: 'feature_addition', description: 'New feature' },
  { type: 'fix', category: 'bug_fix', description: 'Bug fix' },
  { type: 'docs', category: 'documentation', description: 'Documentation only' },
  { type: 'style', category: 'styling', description: 'Code style changes' },
  { type: 'refactor', category: 'refactoring', description: 'Code refactoring' },
  { type: 'perf', category: 'performance_optimization', description: 'Performance improvement' },
  { type: 'test', category: 'testing', description: 'Adding tests' },
  { type: 'build', category: 'infrastructure', description: 'Build system changes' },
  { type: 'ci', category: 'infrastructure', description: 'CI configuration' },
  { type: 'chore', category: 'cleanup', description: 'Maintenance tasks' },
  { type: 'revert', category: 'bug_fix', description: 'Reverting changes' },
  { type: 'security', category: 'security_fix', description: 'Security fix' },
  { type: 'deps', category: 'dependency_update', description: 'Dependency update' },
];

export const DEFAULT_INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  feature_addition: ['add', 'new', 'implement', 'create', 'introduce', 'support'],
  bug_fix: ['fix', 'bug', 'issue', 'resolve', 'correct', 'repair', 'patch'],
  refactoring: ['refactor', 'restructure', 'reorganize', 'simplify', 'clean up', 'improve'],
  performance_optimization: ['performance', 'optimize', 'speed', 'faster', 'cache', 'efficient'],
  security_fix: ['security', 'vulnerability', 'CVE', 'auth', 'permission', 'sanitize', 'escape'],
  dependency_update: ['update', 'upgrade', 'bump', 'dependency', 'package', 'version'],
  documentation: ['docs', 'documentation', 'readme', 'comment', 'jsdoc', 'explain'],
  testing: ['test', 'spec', 'coverage', 'unit', 'integration', 'e2e'],
  configuration: ['config', 'env', 'environment', 'setting', 'option'],
  cleanup: ['cleanup', 'remove', 'delete', 'deprecated', 'dead code', 'unused'],
  styling: ['style', 'format', 'lint', 'prettier', 'eslint'],
  migration: ['migrate', 'migration', 'move', 'transfer', 'convert'],
  infrastructure: ['ci', 'cd', 'deploy', 'pipeline', 'workflow', 'docker', 'kubernetes'],
  unknown: [],
};
