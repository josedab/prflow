import { z } from 'zod';

// ============================================
// Compliance Framework Types
// ============================================

export const ComplianceFrameworkSchema = z.enum([
  'owasp_top10',
  'soc2',
  'hipaa',
  'pci_dss',
  'gdpr',
  'iso27001',
  'nist',
  'cis',
  'custom',
]);
export type ComplianceFramework = z.infer<typeof ComplianceFrameworkSchema>;

export const ComplianceStatusSchema = z.enum([
  'compliant',
  'non_compliant',
  'partial',
  'not_applicable',
  'needs_review',
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

export const ViolationSeveritySchema = z.enum([
  'critical',
  'high',
  'medium',
  'low',
  'informational',
]);
export type ViolationSeverity = z.infer<typeof ViolationSeveritySchema>;

// ============================================
// Security Rules
// ============================================

export interface SecurityRule {
  id: string;
  framework: ComplianceFramework;
  category: string;
  name: string;
  description: string;
  severity: ViolationSeverity;
  pattern?: string;
  antiPattern?: string;
  languages: string[];
  enabled: boolean;
  autoFix?: AutoFixConfig;
  references: RuleReference[];
  metadata: RuleMetadata;
}

export interface AutoFixConfig {
  available: boolean;
  template?: string;
  requiresReview: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface RuleReference {
  type: 'cwe' | 'cve' | 'owasp' | 'documentation' | 'standard';
  id: string;
  url?: string;
  description?: string;
}

export interface RuleMetadata {
  createdAt: Date;
  updatedAt: Date;
  author?: string;
  version: string;
  tags: string[];
  falsePositiveRate?: number;
}

// ============================================
// Compliance Profile
// ============================================

export interface ComplianceProfile {
  id: string;
  name: string;
  description: string;
  frameworks: ComplianceFramework[];
  rules: SecurityRule[];
  customRules: SecurityRule[];
  exclusions: RuleExclusion[];
  settings: ProfileSettings;
  createdAt: Date;
  updatedAt: Date;
}

export interface RuleExclusion {
  ruleId: string;
  reason: string;
  approvedBy?: string;
  expiresAt?: Date;
  scope?: ExclusionScope;
}

export interface ExclusionScope {
  files?: string[];
  directories?: string[];
  functions?: string[];
}

export interface ProfileSettings {
  failOnSeverity: ViolationSeverity;
  requireApprovalFor: ViolationSeverity[];
  autoFixEnabled: boolean;
  blockMergeOnViolation: boolean;
  notifyOnViolation: string[];
  scanSchedule?: string;
}

// ============================================
// Compliance Scan
// ============================================

export interface ComplianceScan {
  id: string;
  repositoryId: string;
  profileId: string;
  prNumber?: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  results: ScanResults;
  startedAt: Date;
  completedAt?: Date;
}

export interface ScanResults {
  summary: ComplianceSummary;
  violations: ComplianceViolation[];
  passedRules: string[];
  skippedRules: SkippedRule[];
  coverage: ScanCoverage;
}

export interface ComplianceSummary {
  totalRules: number;
  passedRules: number;
  failedRules: number;
  skippedRules: number;
  overallStatus: ComplianceStatus;
  bySeverity: Record<ViolationSeverity, number>;
  byFramework: Record<ComplianceFramework, FrameworkSummary>;
}

export interface FrameworkSummary {
  status: ComplianceStatus;
  passed: number;
  failed: number;
  score: number;  // 0-100
}

export interface ComplianceViolation {
  id: string;
  ruleId: string;
  ruleName: string;
  framework: ComplianceFramework;
  severity: ViolationSeverity;
  file: string;
  line: number;
  endLine?: number;
  column?: number;
  message: string;
  evidence: string;
  suggestion?: ViolationSuggestion;
  references: RuleReference[];
  status: 'open' | 'fixed' | 'suppressed' | 'false_positive';
  suppressedBy?: string;
  suppressedReason?: string;
}

export interface ViolationSuggestion {
  description: string;
  code?: string;
  autoFixAvailable: boolean;
}

export interface SkippedRule {
  ruleId: string;
  reason: 'excluded' | 'not_applicable' | 'error';
  details?: string;
}

export interface ScanCoverage {
  filesScanned: number;
  linesScanned: number;
  languagesCovered: string[];
  frameworksCovered: ComplianceFramework[];
}

// ============================================
// Compliance Report
// ============================================

export interface ComplianceReport {
  id: string;
  repositoryId: string;
  profileId: string;
  period: { start: Date; end: Date };
  scans: string[];  // Scan IDs
  trends: ComplianceTrends;
  recommendations: ComplianceRecommendation[];
  exportFormats: ('pdf' | 'json' | 'csv' | 'html')[];
  generatedAt: Date;
}

export interface ComplianceTrends {
  overallScore: TrendData[];
  violationCounts: TrendData[];
  byFramework: Record<ComplianceFramework, TrendData[]>;
  topViolations: Array<{ ruleId: string; count: number; trend: 'increasing' | 'decreasing' | 'stable' }>;
}

export interface TrendData {
  date: Date;
  value: number;
  delta?: number;
}

export interface ComplianceRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  affectedRules: string[];
  estimatedEffort: string;
  resources: string[];
}

// ============================================
// Pre-built Compliance Rulesets
// ============================================

export interface ComplianceRuleset {
  framework: ComplianceFramework;
  version: string;
  rules: SecurityRule[];
  categories: RuleCategory[];
}

export interface RuleCategory {
  id: string;
  name: string;
  description: string;
  rules: string[];
}

// ============================================
// Agent Input/Output
// ============================================

export interface ComplianceAgentInput {
  repositoryId: string;
  operation: 'scan' | 'report' | 'configure' | 'remediate';
  prNumber?: number;
  profileId?: string;
  files?: Array<{ path: string; content: string }>;
  diff?: { files: Array<{ filename: string; patch?: string }> };
}

export interface ComplianceAgentResult {
  operation: string;
  success: boolean;
  data?: {
    scan?: ComplianceScan;
    report?: ComplianceReport;
    profile?: ComplianceProfile;
    remediations?: RemediationResult[];
  };
  error?: string;
}

export interface RemediationResult {
  violationId: string;
  status: 'fixed' | 'failed' | 'skipped';
  file: string;
  originalCode: string;
  fixedCode?: string;
  error?: string;
}
