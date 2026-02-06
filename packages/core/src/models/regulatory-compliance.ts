/**
 * @fileoverview Regulatory Compliance Engine Models
 *
 * Types for automated compliance checking against GDPR, SOC2, HIPAA,
 * PCI-DSS, and custom organizational policies.
 *
 * @module models/regulatory-compliance
 */

// ============================================
// Compliance Framework Types
// ============================================

/**
 * Supported regulatory frameworks
 */
export type RegulatoryComplianceFramework =
  | 'gdpr'
  | 'soc2'
  | 'hipaa'
  | 'pci_dss'
  | 'iso27001'
  | 'ccpa'
  | 'fedramp'
  | 'custom';

/**
 * Compliance check severity
 */
export type ComplianceSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

/**
 * Compliance check status
 */
export type RegulatoryStatus = 'passed' | 'failed' | 'warning' | 'skipped' | 'pending';

// ============================================
// Compliance Rule Types
// ============================================

/**
 * A compliance rule definition
 */
export interface ComplianceRule {
  /** Rule ID */
  id: string;
  /** Framework this rule belongs to */
  framework: RegulatoryComplianceFramework;
  /** Rule category */
  category: ComplianceCategory;
  /** Rule name */
  name: string;
  /** Rule description */
  description: string;
  /** Severity if violated */
  severity: ComplianceSeverity;
  /** Rule pattern (regex or AST pattern) */
  pattern?: string;
  /** File patterns to check */
  filePatterns?: string[];
  /** Whether rule is enabled */
  enabled: boolean;
  /** Auto-fix available */
  autoFixable: boolean;
  /** Reference URL */
  referenceUrl?: string;
  /** Control ID (e.g., SOC2 CC6.1) */
  controlId?: string;
}

/**
 * Compliance rule categories
 */
export type ComplianceCategory =
  | 'data_protection'
  | 'access_control'
  | 'encryption'
  | 'logging'
  | 'authentication'
  | 'input_validation'
  | 'secrets_management'
  | 'pii_handling'
  | 'audit_trail'
  | 'data_retention'
  | 'consent_management'
  | 'breach_notification';

// ============================================
// Compliance Check Types
// ============================================

/**
 * Result of a compliance check
 */
export interface ComplianceCheckResult {
  /** Check ID */
  id: string;
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Frameworks checked */
  frameworks: RegulatoryComplianceFramework[];
  /** Overall status */
  overallStatus: RegulatoryStatus;
  /** Overall score (0-100) */
  complianceScore: number;
  /** Individual findings */
  findings: ComplianceFinding[];
  /** Summary by framework */
  frameworkSummary: RegulatoryFrameworkSummary[];
  /** Recommendations */
  recommendations: RegulatoryRecommendation[];
  /** Checked at */
  checkedAt: Date;
  /** Check duration (ms) */
  durationMs: number;
}

/**
 * A compliance finding
 */
export interface ComplianceFinding {
  /** Finding ID */
  id: string;
  /** Rule that triggered this finding */
  ruleId: string;
  /** Framework */
  framework: RegulatoryComplianceFramework;
  /** Category */
  category: ComplianceCategory;
  /** Severity */
  severity: ComplianceSeverity;
  /** Status */
  status: RegulatoryStatus;
  /** File path */
  file: string;
  /** Line number */
  line?: number;
  /** End line */
  endLine?: number;
  /** Finding title */
  title: string;
  /** Finding description */
  description: string;
  /** Evidence (code snippet) */
  evidence?: string;
  /** Remediation guidance */
  remediation: string;
  /** Auto-fix available */
  autoFixAvailable: boolean;
  /** Suggested fix */
  suggestedFix?: CodeFix;
  /** Control reference */
  controlReference?: string;
}

/**
 * Code fix suggestion
 */
export interface CodeFix {
  /** Original code */
  original: string;
  /** Fixed code */
  fixed: string;
  /** Explanation */
  explanation: string;
}

/**
 * Summary for a framework
 */
export interface RegulatoryFrameworkSummary {
  /** Framework */
  framework: RegulatoryComplianceFramework;
  /** Status */
  status: RegulatoryStatus;
  /** Score */
  score: number;
  /** Passed checks */
  passed: number;
  /** Failed checks */
  failed: number;
  /** Warnings */
  warnings: number;
  /** Critical findings */
  criticalFindings: number;
}

/**
 * Compliance recommendation
 */
export interface RegulatoryRecommendation {
  /** Recommendation ID */
  id: string;
  /** Priority */
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** Framework */
  framework: RegulatoryComplianceFramework;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Actions to take */
  actions: string[];
  /** Estimated effort */
  effort: 'trivial' | 'small' | 'medium' | 'large';
  /** Impact on compliance score */
  scoreImpact: number;
}

// ============================================
// Policy Types
// ============================================

/**
 * Custom compliance policy
 */
export interface CompliancePolicy {
  /** Policy ID */
  id: string;
  /** Policy name */
  name: string;
  /** Description */
  description: string;
  /** Organization ID */
  organizationId: string;
  /** Based on frameworks */
  frameworks: RegulatoryComplianceFramework[];
  /** Custom rules */
  rules: ComplianceRule[];
  /** Severity thresholds */
  thresholds: ComplianceThresholds;
  /** Created at */
  createdAt: Date;
  /** Updated at */
  updatedAt: Date;
  /** Active */
  active: boolean;
}

/**
 * Compliance thresholds
 */
export interface ComplianceThresholds {
  /** Block merge if score below */
  blockMergeBelow?: number;
  /** Require review if score below */
  requireReviewBelow?: number;
  /** Auto-approve above */
  autoApproveAbove?: number;
  /** Max critical findings allowed */
  maxCriticalFindings?: number;
  /** Max high findings allowed */
  maxHighFindings?: number;
}

// ============================================
// Audit Types
// ============================================

/**
 * Compliance audit record
 */
export interface ComplianceAudit {
  /** Audit ID */
  id: string;
  /** Repository */
  repository: { owner: string; name: string };
  /** Audit type */
  type: 'pr_check' | 'full_scan' | 'scheduled' | 'manual';
  /** Frameworks audited */
  frameworks: RegulatoryComplianceFramework[];
  /** Audit result */
  result: ComplianceCheckResult;
  /** Auditor (system or user) */
  auditor: string;
  /** Started at */
  startedAt: Date;
  /** Completed at */
  completedAt: Date;
  /** Artifacts */
  artifacts: AuditArtifact[];
}

/**
 * Audit artifact
 */
export interface AuditArtifact {
  /** Artifact type */
  type: 'report' | 'evidence' | 'remediation_plan' | 'attestation';
  /** Name */
  name: string;
  /** URL or path */
  url: string;
  /** Generated at */
  generatedAt: Date;
}

// ============================================
// Evidence Types
// ============================================

/**
 * Compliance evidence
 */
export interface ComplianceEvidence {
  /** Evidence ID */
  id: string;
  /** Control ID */
  controlId: string;
  /** Framework */
  framework: RegulatoryComplianceFramework;
  /** Evidence type */
  type: EvidenceType;
  /** Title */
  title: string;
  /** Description */
  description: string;
  /** Source (PR, commit, file) */
  source: {
    type: 'pr' | 'commit' | 'file' | 'config';
    reference: string;
  };
  /** Collected at */
  collectedAt: Date;
  /** Valid until */
  validUntil?: Date;
  /** Attachments */
  attachments: string[];
}

/**
 * Evidence types
 */
export type EvidenceType =
  | 'code_review'
  | 'test_execution'
  | 'security_scan'
  | 'access_log'
  | 'configuration'
  | 'documentation'
  | 'approval';

// ============================================
// Report Types
// ============================================

/**
 * Compliance report
 */
export interface RegulatoryReport {
  /** Report ID */
  id: string;
  /** Report type */
  type: 'summary' | 'detailed' | 'executive' | 'audit';
  /** Repository or organization */
  scope: {
    type: 'repository' | 'organization';
    id: string;
    name: string;
  };
  /** Period */
  period: {
    start: Date;
    end: Date;
  };
  /** Frameworks covered */
  frameworks: RegulatoryComplianceFramework[];
  /** Overall metrics */
  metrics: ComplianceMetrics;
  /** Trends */
  trends: RegulatoryTrends;
  /** Top issues */
  topIssues: ComplianceFinding[];
  /** Generated at */
  generatedAt: Date;
}

/**
 * Compliance metrics
 */
export interface ComplianceMetrics {
  /** Overall score */
  overallScore: number;
  /** Scores by framework */
  byFramework: Record<RegulatoryComplianceFramework, number>;
  /** Total checks run */
  totalChecks: number;
  /** Passed checks */
  passedChecks: number;
  /** Failed checks */
  failedChecks: number;
  /** Auto-fixed issues */
  autoFixedIssues: number;
  /** PRs checked */
  prsChecked: number;
  /** PRs blocked */
  prsBlocked: number;
}

/**
 * Compliance trends
 */
export interface RegulatoryTrends {
  /** Score trend */
  scoreTrend: 'improving' | 'stable' | 'declining';
  /** Score change */
  scoreChange: number;
  /** Historical data points */
  history: Array<{
    date: Date;
    score: number;
    findings: number;
  }>;
}

// ============================================
// Request/Response Types
// ============================================

/**
 * Run compliance check request
 */
export interface RunComplianceCheckRequest {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** PR number */
  prNumber: number;
  /** Frameworks to check */
  frameworks?: RegulatoryComplianceFramework[];
  /** Policy ID */
  policyId?: string;
  /** Auto-fix enabled */
  autoFix?: boolean;
}

/**
 * Create policy request
 */
export interface CreatePolicyRequest {
  /** Policy name */
  name: string;
  /** Description */
  description: string;
  /** Frameworks */
  frameworks: RegulatoryComplianceFramework[];
  /** Custom rules */
  rules?: Partial<ComplianceRule>[];
  /** Thresholds */
  thresholds?: ComplianceThresholds;
}

/**
 * Generate report request
 */
export interface GenerateReportRequest {
  /** Scope type */
  scopeType: 'repository' | 'organization';
  /** Scope ID */
  scopeId: string;
  /** Report type */
  reportType: 'summary' | 'detailed' | 'executive' | 'audit';
  /** Frameworks */
  frameworks?: RegulatoryComplianceFramework[];
  /** Period start */
  periodStart: Date;
  /** Period end */
  periodEnd: Date;
}

// ============================================
// GDPR Specific Types
// ============================================

/**
 * GDPR specific finding details
 */
export interface GDPRFindingDetails {
  /** Article reference */
  article: string;
  /** Personal data types affected */
  personalDataTypes: string[];
  /** Data subject rights impacted */
  dataSubjectRights: string[];
  /** Cross-border transfer involved */
  crossBorderTransfer: boolean;
  /** DPO notification required */
  dpoNotificationRequired: boolean;
}

// ============================================
// SOC2 Specific Types
// ============================================

/**
 * SOC2 specific finding details
 */
export interface SOC2FindingDetails {
  /** Trust service criteria */
  trustServiceCriteria: 'security' | 'availability' | 'processing_integrity' | 'confidentiality' | 'privacy';
  /** Control point */
  controlPoint: string;
  /** Common criteria reference */
  commonCriteria: string;
  /** Audit trail exists */
  auditTrailExists: boolean;
}

// ============================================
// HIPAA Specific Types
// ============================================

/**
 * HIPAA specific finding details
 */
export interface HIPAAFindingDetails {
  /** Rule type */
  ruleType: 'privacy' | 'security' | 'breach_notification';
  /** PHI involved */
  phiInvolved: boolean;
  /** PHI types */
  phiTypes: string[];
  /** Safeguard type */
  safeguardType: 'administrative' | 'physical' | 'technical';
  /** CFR reference */
  cfrReference: string;
}

// ============================================
// PCI-DSS Specific Types
// ============================================

/**
 * PCI-DSS specific finding details
 */
export interface PCIDSSFindingDetails {
  /** Requirement number */
  requirement: string;
  /** Sub-requirement */
  subRequirement: string;
  /** Cardholder data involved */
  cardholderDataInvolved: boolean;
  /** SAD involved */
  sensitiveAuthDataInvolved: boolean;
  /** SAQ type applicable */
  saqType: 'A' | 'A-EP' | 'B' | 'B-IP' | 'C' | 'C-VT' | 'D' | 'P2PE';
}
