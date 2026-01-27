import { z } from 'zod';

// ============================================
// Natural Language PR Queries Types
// ============================================

export const QueryIntentSchema = z.enum([
  'file_changes',
  'commit_history',
  'review_status',
  'test_status',
  'code_explanation',
  'impact_analysis',
  'comparison',
  'statistics',
  'timeline',
  'contributor_activity',
  'risk_assessment',
  'merge_readiness',
  'general',
]);
export type QueryIntent = z.infer<typeof QueryIntentSchema>;

export const QueryComplexitySchema = z.enum(['simple', 'moderate', 'complex']);
export type QueryComplexity = z.infer<typeof QueryComplexitySchema>;

// ============================================
// Query Request
// ============================================

export interface NLQueryRequest {
  query: string;
  context: QueryContext;
  preferences?: QueryPreferences;
}

export interface QueryContext {
  repositoryFullName: string;
  prNumber?: number;
  prTitle?: string;
  prDescription?: string;
  files?: QueryFileContext[];
  commits?: QueryCommitContext[];
  reviews?: QueryReviewContext[];
  labels?: string[];
  assignees?: string[];
  baseBranch?: string;
  headBranch?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface QueryFileContext {
  filename: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
  language?: string;
  patch?: string;
}

export interface QueryCommitContext {
  sha: string;
  message: string;
  author: string;
  timestamp: Date;
  files?: string[];
}

export interface QueryReviewContext {
  reviewer: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'pending';
  body?: string;
  submittedAt?: Date;
}

export interface QueryPreferences {
  verbosity: 'brief' | 'detailed' | 'comprehensive';
  includeCodeSnippets: boolean;
  includeLinks: boolean;
  format: 'text' | 'markdown' | 'json';
  maxResponseLength?: number;
}

// ============================================
// Query Analysis
// ============================================

export interface QueryAnalysis {
  originalQuery: string;
  normalizedQuery: string;
  intent: QueryIntent;
  subIntents: QueryIntent[];
  complexity: QueryComplexity;
  entities: QueryEntities;
  filters: QueryFilters;
  aggregations: QueryAggregation[];
  confidence: number;
}

export interface QueryEntities {
  files?: string[];
  commits?: string[];
  users?: string[];
  dates?: { start?: Date; end?: Date };
  prNumbers?: number[];
  keywords?: string[];
  codeElements?: CodeElement[];
}

export interface CodeElement {
  type: 'function' | 'class' | 'variable' | 'import' | 'type' | 'interface';
  name: string;
  file?: string;
}

export interface QueryFilters {
  fileTypes?: string[];
  statuses?: string[];
  authors?: string[];
  dateRange?: { from?: Date; to?: Date };
  lineRange?: { from?: number; to?: number };
  changeType?: 'added' | 'modified' | 'removed';
}

export interface QueryAggregation {
  type: 'count' | 'sum' | 'average' | 'max' | 'min' | 'list' | 'group';
  field: string;
  groupBy?: string;
}

// ============================================
// Query Response
// ============================================

export interface NLQueryResponse {
  query: string;
  analysis: QueryAnalysis;
  answer: QueryAnswer;
  suggestions?: FollowUpSuggestion[];
  debug?: QueryDebugInfo;
}

export interface QueryAnswer {
  text: string;
  format: 'text' | 'markdown' | 'json';
  structured?: StructuredAnswer;
  citations?: AnswerCitation[];
  confidence: number;
  caveats?: string[];
}

export interface StructuredAnswer {
  type: 'list' | 'table' | 'summary' | 'comparison' | 'timeline' | 'statistics';
  data: unknown;
  headers?: string[];
  columns?: string[];
}

export interface AnswerCitation {
  text: string;
  source: 'file' | 'commit' | 'review' | 'pr_description';
  reference: string;
  line?: number;
}

export interface FollowUpSuggestion {
  query: string;
  description: string;
  relevance: 'high' | 'medium' | 'low';
}

export interface QueryDebugInfo {
  parseTime: number;
  executionTime: number;
  dataSourcesUsed: string[];
  queryPlan: string;
}

// ============================================
// Query Templates
// ============================================

export interface QueryTemplate {
  id: string;
  name: string;
  description: string;
  template: string;
  placeholders: TemplatePlaceholder[];
  intent: QueryIntent;
  examples: string[];
}

export interface TemplatePlaceholder {
  name: string;
  type: 'string' | 'number' | 'date' | 'file' | 'user';
  required: boolean;
  default?: string;
}

export const QUERY_TEMPLATES: QueryTemplate[] = [
  {
    id: 'files_changed',
    name: 'Files Changed',
    description: 'List all files changed in this PR',
    template: 'What files were changed in this PR?',
    placeholders: [],
    intent: 'file_changes',
    examples: [
      'Show me the changed files',
      'What did this PR modify?',
      'List all file changes',
    ],
  },
  {
    id: 'specific_file',
    name: 'Specific File Changes',
    description: 'Show changes to a specific file',
    template: 'What changes were made to {filename}?',
    placeholders: [{ name: 'filename', type: 'file', required: true }],
    intent: 'file_changes',
    examples: [
      'Show changes to src/index.ts',
      'What happened to the config file?',
    ],
  },
  {
    id: 'review_status',
    name: 'Review Status',
    description: 'Get current review status',
    template: 'What is the review status?',
    placeholders: [],
    intent: 'review_status',
    examples: [
      'Has this been approved?',
      'Who reviewed this PR?',
      'Are there any pending reviews?',
    ],
  },
  {
    id: 'test_status',
    name: 'Test Status',
    description: 'Check CI/CD test results',
    template: 'Are the tests passing?',
    placeholders: [],
    intent: 'test_status',
    examples: [
      'Did CI pass?',
      'What tests failed?',
      'Show me the build status',
    ],
  },
  {
    id: 'code_explanation',
    name: 'Code Explanation',
    description: 'Explain what the code does',
    template: 'Explain what {element} does',
    placeholders: [{ name: 'element', type: 'string', required: true }],
    intent: 'code_explanation',
    examples: [
      'What does this function do?',
      'Explain the new class',
      'Why was this code added?',
    ],
  },
  {
    id: 'impact_analysis',
    name: 'Impact Analysis',
    description: 'Understand the impact of changes',
    template: 'What is the impact of these changes?',
    placeholders: [],
    intent: 'impact_analysis',
    examples: [
      'How risky is this PR?',
      'What could break?',
      'Are there any dependencies affected?',
    ],
  },
  {
    id: 'merge_readiness',
    name: 'Merge Readiness',
    description: 'Check if PR is ready to merge',
    template: 'Is this PR ready to merge?',
    placeholders: [],
    intent: 'merge_readiness',
    examples: [
      'Can we merge this?',
      'What\'s blocking this PR?',
      'Merge checklist status',
    ],
  },
  {
    id: 'statistics',
    name: 'PR Statistics',
    description: 'Get numerical statistics about the PR',
    template: 'Show me statistics for this PR',
    placeholders: [],
    intent: 'statistics',
    examples: [
      'How many lines changed?',
      'Number of commits',
      'How long has this been open?',
    ],
  },
  {
    id: 'timeline',
    name: 'PR Timeline',
    description: 'Show the history of the PR',
    template: 'Show the timeline of this PR',
    placeholders: [],
    intent: 'timeline',
    examples: [
      'What happened since the PR was opened?',
      'Show activity history',
      'When were changes requested?',
    ],
  },
  {
    id: 'comparison',
    name: 'Compare Changes',
    description: 'Compare different aspects of the PR',
    template: 'Compare {item1} with {item2}',
    placeholders: [
      { name: 'item1', type: 'string', required: true },
      { name: 'item2', type: 'string', required: true },
    ],
    intent: 'comparison',
    examples: [
      'Compare the old and new implementation',
      'How does this differ from the main branch?',
    ],
  },
];

// ============================================
// Agent Input/Output
// ============================================

export interface NLQueryInput {
  operation: 'query' | 'analyze' | 'list_templates' | 'suggest';
  queryRequest?: NLQueryRequest;
  rawQuery?: string;
}

export interface NLQueryResult {
  operation: string;
  success: boolean;
  data?: {
    response?: NLQueryResponse;
    analysis?: QueryAnalysis;
    templates?: QueryTemplate[];
    suggestions?: FollowUpSuggestion[];
  };
  error?: string;
}
