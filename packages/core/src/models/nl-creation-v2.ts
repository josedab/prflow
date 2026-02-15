/**
 * @fileoverview Types for Natural Language PR Creation v2
 *
 * Advanced NL parsing, multi-file code generation, PR assembly
 * with conversation-based refinement.
 */

export type NLCreationPhase =
  | 'parsing'
  | 'planning'
  | 'generating'
  | 'testing'
  | 'assembling'
  | 'reviewing'
  | 'completed'
  | 'failed';

export interface NLFeatureRequest {
  id: string;
  tenantId: string;
  repositoryId: string;
  description: string;
  conversationId: string;
  phase: NLCreationPhase;
  plan?: ImplementationPlan;
  generatedFiles?: GeneratedFile[];
  pullRequestNumber?: number;
  pullRequestUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ImplementationPlan {
  summary: string;
  approach: string;
  filesToCreate: PlannedFile[];
  filesToModify: PlannedFile[];
  testStrategy: string;
  estimatedComplexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  risks: string[];
  clarifyingQuestions: string[];
}

export interface PlannedFile {
  path: string;
  purpose: string;
  changeType: 'create' | 'modify' | 'delete';
  dependencies: string[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  changeType: 'create' | 'modify' | 'delete';
  originalContent?: string;
  language: string;
  linesOfCode: number;
}

export interface NLConversationMessage {
  id: string;
  requestId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    phase?: NLCreationPhase;
    filesChanged?: string[];
    clarificationAnswer?: boolean;
  };
}

export interface NLCreationResult {
  requestId: string;
  success: boolean;
  plan: ImplementationPlan;
  files: GeneratedFile[];
  testResults?: {
    passed: boolean;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    errors: string[];
  };
  pullRequest?: {
    number: number;
    url: string;
    title: string;
    branch: string;
  };
  conversationLength: number;
  totalIterations: number;
}

export interface NLCreationStats {
  organizationId: string;
  totalRequests: number;
  successfulCreations: number;
  averageIterations: number;
  averageFilesGenerated: number;
  firstAttemptCIPassRate: number;
  topLanguages: Array<{ language: string; count: number }>;
}
