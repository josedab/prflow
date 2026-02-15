/**
 * @fileoverview Types for Auto-Fix Pipeline
 *
 * Generate, validate, and apply fixes automatically for detected issues.
 */

export type FixConfidence = 'high' | 'medium' | 'low';

export interface GeneratedFix {
  id: string;
  issueId: string;
  rule: string;
  filePath: string;
  startLine: number;
  endLine: number;
  originalCode: string;
  fixedCode: string;
  explanation: string;
  confidence: FixConfidence;
  confidenceScore: number;
  category: string;
  validationStatus: 'pending' | 'valid' | 'invalid' | 'untested';
}

export interface FixValidationResult {
  fixId: string;
  compiles: boolean;
  testsPass: boolean;
  noNewIssues: boolean;
  lintClean: boolean;
  overallValid: boolean;
  errors: string[];
}

export interface FixBatch {
  id: string;
  workflowId: string;
  repositoryId: string;
  pullRequestNumber: number;
  fixes: GeneratedFix[];
  status: 'pending' | 'validating' | 'ready' | 'applied' | 'failed';
  createdAt: Date;
  appliedAt?: Date;
}

export interface AutoFixPR {
  id: string;
  batchId: string;
  baseBranch: string;
  fixBranch: string;
  prNumber?: number;
  prUrl?: string;
  fixCount: number;
  status: 'creating' | 'open' | 'merged' | 'closed' | 'failed';
  createdAt: Date;
}

export interface AutoFixStats {
  organizationId: string;
  totalFixesGenerated: number;
  totalFixesApplied: number;
  totalFixesRejected: number;
  fixAccuracy: number;
  averageConfidence: number;
  topFixCategories: Array<{ category: string; count: number; accuracy: number }>;
  timeSavedHours: number;
}

export interface FixPipelineConfig {
  enabled: boolean;
  autoApplyThreshold: number;
  requireHumanApproval: boolean;
  maxFixesPerPR: number;
  allowedCategories: string[];
  blockedPaths: string[];
}
