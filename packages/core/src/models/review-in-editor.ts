/**
 * @fileoverview Types for Review-in-Editor (LSP Integration)
 *
 * LSP server, inline diagnostics, and multi-IDE support types.
 */

export type DiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';

export interface EditorDiagnostic {
  id: string;
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  severity: DiagnosticSeverity;
  message: string;
  source: string;
  rule: string;
  category: string;
  quickFixes: QuickFixAction[];
  relatedInformation?: RelatedDiagnostic[];
}

export interface QuickFixAction {
  title: string;
  isPreferred: boolean;
  edits: TextEdit[];
}

export interface TextEdit {
  filePath: string;
  range: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
  newText: string;
}

export interface RelatedDiagnostic {
  filePath: string;
  line: number;
  message: string;
}

export interface PreflightResult {
  filePath: string;
  diagnostics: EditorDiagnostic[];
  riskScore: number;
  analysisTimeMs: number;
  analyzedAt: Date;
}

export interface LSPServerConfig {
  port: number;
  host: string;
  apiEndpoint: string;
  debounceMs: number;
  maxFileSizeKB: number;
  enabledCategories: string[];
  autoAnalyzeOnSave: boolean;
  showInlineSeverity: DiagnosticSeverity;
}

export interface LSPAnalysisRequest {
  filePath: string;
  content: string;
  languageId: string;
  version: number;
  repositoryId?: string;
}

export interface LSPAnalysisResponse {
  filePath: string;
  version: number;
  diagnostics: EditorDiagnostic[];
  riskScore: number;
  codeActions: QuickFixAction[];
}

export interface EditorIntegrationStats {
  totalAnalyses: number;
  issuesDetectedPrePush: number;
  fixesAppliedInEditor: number;
  averageAnalysisTimeMs: number;
  topIssueCategories: Array<{ category: string; count: number }>;
  activeEditors: Array<{ editor: string; users: number }>;
}
