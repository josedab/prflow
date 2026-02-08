/**
 * @fileoverview Security Threat Model Integration Models
 *
 * Types for STRIDE threat modeling, sensitive area detection,
 * OWASP pattern matching, and security posture dashboards.
 *
 * @module models/security-threat-model
 */

import { z } from 'zod';

// ============================================
// STRIDE Types
// ============================================

/**
 * STRIDE threat category
 */
export const STRIDECategorySchema = z.enum([
  'spoofing',
  'tampering',
  'repudiation',
  'information_disclosure',
  'denial_of_service',
  'elevation_of_privilege',
]);
export type STRIDECategory = z.infer<typeof STRIDECategorySchema>;

/**
 * A STRIDE threat assessment
 */
export interface STRIDEThreat {
  /** Threat ID */
  id: string;
  /** STRIDE category */
  category: STRIDECategory;
  /** Threat title */
  title: string;
  /** Description */
  description: string;
  /** Severity */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Likelihood */
  likelihood: 'unlikely' | 'possible' | 'likely' | 'very_likely';
  /** Affected files */
  affectedFiles: Array<{ file: string; line?: number }>;
  /** Attack vector */
  attackVector: string;
  /** Potential impact */
  potentialImpact: string;
  /** Mitigations (existing) */
  existingMitigations: string[];
  /** Recommended mitigations */
  recommendedMitigations: string[];
  /** Related OWASP category */
  owaspCategory?: string;
  /** Related CWE ID */
  cweId?: string;
  /** Status */
  status: 'open' | 'mitigated' | 'accepted' | 'false_positive';
}

// ============================================
// Sensitive Area Types
// ============================================

/**
 * Sensitivity classification
 */
export type SensitivityClassification =
  | 'authentication'
  | 'authorization'
  | 'cryptography'
  | 'payment_processing'
  | 'data_access'
  | 'network_communication'
  | 'file_system'
  | 'user_input'
  | 'session_management'
  | 'logging'
  | 'configuration';

/**
 * A detected sensitive area
 */
export interface SensitiveArea {
  /** Area ID */
  id: string;
  /** File path */
  file: string;
  /** Start line */
  startLine: number;
  /** End line */
  endLine: number;
  /** Classification */
  classification: SensitivityClassification;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Description of why this is sensitive */
  reason: string;
  /** Required review types */
  requiredReviews: string[];
  /** Data sensitivity */
  dataSensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
}

// ============================================
// Threat Model Types
// ============================================

/**
 * Complete threat model assessment for a PR
 */
export interface ThreatModelAssessment {
  /** Assessment ID */
  id: string;
  /** PR number */
  prNumber: number;
  /** Repository */
  repository: { owner: string; name: string };
  /** Overall risk score (0-100) */
  overallRiskScore: number;
  /** Risk level */
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  /** Sensitive areas touched */
  sensitiveAreas: SensitiveArea[];
  /** STRIDE threats identified */
  threats: STRIDEThreat[];
  /** OWASP Top 10 matches */
  owaspMatches: OWASPMatch[];
  /** Security checklist */
  securityChecklist: SecurityChecklistItem[];
  /** Compliance flags */
  complianceFlags: ComplianceFlag[];
  /** Summary */
  summary: string;
  /** Recommendations */
  recommendations: string[];
  /** Assessed at */
  assessedAt: Date;
  /** Assessment duration (ms) */
  assessmentDurationMs: number;
}

/**
 * OWASP Top 10 match
 */
export interface OWASPMatch {
  /** OWASP category (e.g., A01:2021) */
  category: string;
  /** Category name */
  name: string;
  /** Matched pattern */
  pattern: string;
  /** Confidence */
  confidence: number;
  /** File and line */
  location: { file: string; line: number };
  /** Description */
  description: string;
  /** Remediation */
  remediation: string;
}

/**
 * Security checklist item
 */
export interface SecurityChecklistItem {
  /** Item ID */
  id: string;
  /** Category */
  category: string;
  /** Description */
  description: string;
  /** Status */
  status: 'pass' | 'fail' | 'not_applicable' | 'needs_review';
  /** Details */
  details?: string;
  /** Priority */
  priority: 'required' | 'recommended' | 'optional';
}

/**
 * Compliance flag
 */
export interface ComplianceFlag {
  /** Framework */
  framework: 'soc2' | 'hipaa' | 'pci_dss' | 'gdpr' | 'iso27001';
  /** Requirement ID */
  requirementId: string;
  /** Description */
  description: string;
  /** Status */
  status: 'compliant' | 'non_compliant' | 'needs_review';
  /** Evidence */
  evidence?: string;
}

// ============================================
// Security Dashboard Types
// ============================================

/**
 * Security posture dashboard data
 */
export interface SecurityPostureDashboard {
  /** Repository (or org-wide) */
  repositoryId?: string;
  /** Period */
  period: { start: Date; end: Date };
  /** Overall security score (0-100) */
  securityScore: number;
  /** Score trend */
  scoreTrend: 'improving' | 'stable' | 'declining';
  /** Threat distribution by STRIDE category */
  threatDistribution: Record<STRIDECategory, number>;
  /** Open threats by severity */
  openThreatsBySeverity: Record<string, number>;
  /** OWASP coverage */
  owaspCoverage: Record<string, { total: number; mitigated: number }>;
  /** Security debt (unresolved threats) */
  securityDebt: number;
  /** Average time to mitigate (hours) */
  avgTimeToMitigateHours: number;
  /** Top recurring patterns */
  recurringPatterns: Array<{ pattern: string; count: number; severity: string }>;
  /** Generated at */
  generatedAt: Date;
}
