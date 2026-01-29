import * as crypto from 'crypto';
import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';

/**
 * Supported compliance frameworks
 */
export type ComplianceFramework = 'SOC2' | 'HIPAA' | 'PCI_DSS' | 'GDPR' | 'ISO27001';

/**
 * Compliance violation severity
 */
export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'informational';

/**
 * A compliance rule definition
 */
export interface ComplianceRule {
  id: string;
  framework: ComplianceFramework;
  category: string;
  name: string;
  description: string;
  severity: ViolationSeverity;
  patterns: {
    type: 'regex' | 'ast' | 'semantic';
    value: string;
    fileGlob?: string;
  }[];
  remediation: string;
  references: string[];
  autoFix?: {
    available: boolean;
    strategy: string;
  };
}

/**
 * A detected compliance violation
 */
export interface ComplianceViolation {
  id: string;
  workflowId: string;
  ruleId: string;
  ruleName: string;
  framework: ComplianceFramework;
  category: string;
  severity: ViolationSeverity;
  file: string;
  line: number;
  column?: number;
  codeSnippet: string;
  message: string;
  remediation: string;
  references: string[];
  autoFixAvailable: boolean;
  status: 'detected' | 'acknowledged' | 'fixed' | 'false_positive' | 'risk_accepted';
  detectedAt: Date;
}

/**
 * Compliance scan result
 */
export interface ComplianceScanResult {
  workflowId: string;
  frameworks: ComplianceFramework[];
  scanStartedAt: Date;
  scanCompletedAt: Date;
  summary: {
    totalFiles: number;
    filesScanned: number;
    totalViolations: number;
    bySeverity: Record<ViolationSeverity, number>;
    byFramework: Record<ComplianceFramework, number>;
    byCategory: Record<string, number>;
  };
  violations: ComplianceViolation[];
  passedChecks: number;
  complianceScore: number; // 0-100
  auditTrail: AuditEntry[];
}

/**
 * Audit trail entry
 */
export interface AuditEntry {
  id: string;
  timestamp: Date;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  hash: string; // SHA256 of entry for tamper detection
}

/**
 * Repository compliance configuration
 */
export interface ComplianceConfig {
  repositoryId: string;
  enabledFrameworks: ComplianceFramework[];
  customRules: ComplianceRule[];
  exemptions: Array<{
    ruleId: string;
    filePattern: string;
    reason: string;
    approvedBy: string;
    expiresAt?: Date;
  }>;
  severityOverrides: Record<string, ViolationSeverity>;
  blockingThreshold: ViolationSeverity; // Block merge if violations >= this severity
  requireAcknowledgement: boolean;
  auditRetentionDays: number;
}

// Built-in compliance rules
const COMPLIANCE_RULES: ComplianceRule[] = [
  // SOC2 Rules
  {
    id: 'soc2-secrets-001',
    framework: 'SOC2',
    category: 'Secret Management',
    name: 'Hardcoded Secrets',
    description: 'Detects hardcoded API keys, passwords, and tokens',
    severity: 'critical',
    patterns: [
      { type: 'regex', value: '(?i)(api[_-]?key|apikey)\\s*[=:]\\s*["\'][a-zA-Z0-9]{16,}["\']' },
      { type: 'regex', value: '(?i)(password|passwd|pwd)\\s*[=:]\\s*["\'][^"\']+["\']' },
      { type: 'regex', value: '(?i)(secret|token)\\s*[=:]\\s*["\'][a-zA-Z0-9+/=]{20,}["\']' },
      { type: 'regex', value: 'AKIA[0-9A-Z]{16}' }, // AWS Access Key
      { type: 'regex', value: 'ghp_[a-zA-Z0-9]{36}' }, // GitHub Personal Token
    ],
    remediation: 'Use environment variables or a secrets manager (e.g., AWS Secrets Manager, HashiCorp Vault)',
    references: ['SOC2 CC6.1', 'CIS Control 3.10'],
    autoFix: { available: false, strategy: 'manual' },
  },
  {
    id: 'soc2-logging-001',
    framework: 'SOC2',
    category: 'Logging & Monitoring',
    name: 'Sensitive Data Logging',
    description: 'Detects logging of potentially sensitive information',
    severity: 'high',
    patterns: [
      { type: 'regex', value: '(?i)console\\.log\\([^)]*password[^)]*\\)' },
      { type: 'regex', value: '(?i)console\\.log\\([^)]*token[^)]*\\)' },
      { type: 'regex', value: '(?i)logger\\.[^(]+\\([^)]*credential[^)]*\\)' },
    ],
    remediation: 'Remove sensitive data from logs or use log redaction',
    references: ['SOC2 CC7.2', 'OWASP Logging Guide'],
  },
  {
    id: 'soc2-auth-001',
    framework: 'SOC2',
    category: 'Authentication',
    name: 'Weak Authentication Check',
    description: 'Detects potentially weak authentication patterns',
    severity: 'high',
    patterns: [
      { type: 'regex', value: '(?i)auth\\s*===?\\s*(true|false|1|0)' },
      { type: 'regex', value: '(?i)skip[_-]?auth\\s*[=:]\\s*true' },
      { type: 'regex', value: '(?i)noAuth|disableAuth' },
    ],
    remediation: 'Use proper authentication middleware and avoid authentication bypasses',
    references: ['SOC2 CC6.1', 'OWASP Auth Cheatsheet'],
  },

  // HIPAA Rules
  {
    id: 'hipaa-phi-001',
    framework: 'HIPAA',
    category: 'PHI Protection',
    name: 'Unencrypted PHI',
    description: 'Detects potential storage of Protected Health Information without encryption',
    severity: 'critical',
    patterns: [
      { type: 'regex', value: '(?i)(ssn|social[_-]?security|patient[_-]?id)\\s*[=:]' },
      { type: 'regex', value: '(?i)(medical[_-]?record|diagnosis|treatment)\\s*[=:]\\s*["\']' },
      { type: 'regex', value: '(?i)healthData\\s*=\\s*{' },
    ],
    remediation: 'Encrypt PHI at rest and in transit using AES-256 or stronger',
    references: ['HIPAA §164.312(a)(2)(iv)', '45 CFR 164.312'],
  },
  {
    id: 'hipaa-access-001',
    framework: 'HIPAA',
    category: 'Access Control',
    name: 'Missing Access Control',
    description: 'Detects endpoints handling health data without access control',
    severity: 'high',
    patterns: [
      { type: 'regex', value: '(?i)@(Get|Post|Put)\\(["\'][^"\']*health[^"\']*["\']\\)(?![\\s\\S]*@Auth)', fileGlob: '*.controller.ts' },
      { type: 'regex', value: '(?i)router\\.(get|post)\\(["\'][^"\']*patient[^"\']*["\'](?![\\s\\S]*auth)' },
    ],
    remediation: 'Add proper authentication and authorization middleware to all PHI endpoints',
    references: ['HIPAA §164.312(d)', 'HIPAA Access Control Requirements'],
  },
  {
    id: 'hipaa-audit-001',
    framework: 'HIPAA',
    category: 'Audit Controls',
    name: 'Missing Audit Logging',
    description: 'Detects PHI access without audit logging',
    severity: 'medium',
    patterns: [
      { type: 'regex', value: '(?i)getPatient(?!.*audit|.*log)', fileGlob: '*.ts' },
      { type: 'regex', value: '(?i)accessMedicalRecord(?!.*audit)', fileGlob: '*.ts' },
    ],
    remediation: 'Add audit logging for all PHI access with timestamp, user, and action',
    references: ['HIPAA §164.312(b)', '45 CFR 164.312(b)'],
  },

  // PCI-DSS Rules
  {
    id: 'pci-card-001',
    framework: 'PCI_DSS',
    category: 'Card Data Protection',
    name: 'Card Number Storage',
    description: 'Detects potential storage of full card numbers',
    severity: 'critical',
    patterns: [
      { type: 'regex', value: '(?i)(card[_-]?number|pan)\\s*[=:]\\s*["\']?\\d{13,19}' },
      { type: 'regex', value: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b' },
    ],
    remediation: 'Never store full card numbers. Use tokenization or a PCI-compliant payment processor',
    references: ['PCI DSS Req 3.4', 'PCI DSS Req 3.2'],
    autoFix: { available: false, strategy: 'manual' },
  },
  {
    id: 'pci-cvv-001',
    framework: 'PCI_DSS',
    category: 'Card Data Protection',
    name: 'CVV/CVC Storage',
    description: 'Detects storage of card verification values',
    severity: 'critical',
    patterns: [
      { type: 'regex', value: '(?i)(cvv|cvc|cvv2|cvc2)\\s*[=:]' },
      { type: 'regex', value: '(?i)securityCode\\s*[=:]' },
    ],
    remediation: 'Never store CVV/CVC. These must not be retained after authorization',
    references: ['PCI DSS Req 3.2.2'],
  },
  {
    id: 'pci-encryption-001',
    framework: 'PCI_DSS',
    category: 'Encryption',
    name: 'Weak Encryption Algorithm',
    description: 'Detects use of deprecated or weak encryption',
    severity: 'high',
    patterns: [
      { type: 'regex', value: '(?i)createCipher\\(["\']?(des|rc4|md5)["\']?' },
      { type: 'regex', value: '(?i)algorithm\\s*[=:]\\s*["\']?(DES|3DES|RC4|MD5)["\']?' },
    ],
    remediation: 'Use AES-256 or stronger encryption algorithms',
    references: ['PCI DSS Req 3.5.2', 'NIST SP 800-131A'],
  },

  // GDPR Rules
  {
    id: 'gdpr-consent-001',
    framework: 'GDPR',
    category: 'Consent Management',
    name: 'Missing Consent Check',
    description: 'Detects data processing without consent verification',
    severity: 'high',
    patterns: [
      { type: 'regex', value: '(?i)collectUserData(?!.*consent)', fileGlob: '*.ts' },
      { type: 'regex', value: '(?i)trackUser(?!.*consent|.*opt)', fileGlob: '*.ts' },
    ],
    remediation: 'Verify user consent before processing personal data',
    references: ['GDPR Article 6', 'GDPR Article 7'],
  },
  {
    id: 'gdpr-retention-001',
    framework: 'GDPR',
    category: 'Data Retention',
    name: 'Indefinite Data Retention',
    description: 'Detects data storage without retention limits',
    severity: 'medium',
    patterns: [
      { type: 'regex', value: '(?i)user[_-]?data.*=.*{(?![\\s\\S]*expir|[\\s\\S]*ttl|[\\s\\S]*retention)', fileGlob: '*.ts' },
    ],
    remediation: 'Define data retention periods and implement automatic deletion',
    references: ['GDPR Article 5(1)(e)', 'Storage Limitation Principle'],
  },

  // ISO 27001 Rules
  {
    id: 'iso27001-input-001',
    framework: 'ISO27001',
    category: 'Input Validation',
    name: 'Missing Input Validation',
    description: 'Detects user input used without validation',
    severity: 'high',
    patterns: [
      { type: 'regex', value: '(?i)req\\.body\\.[a-z]+(?![\\s\\S]*valid|[\\s\\S]*saniti|[\\s\\S]*escap)' },
      { type: 'regex', value: '(?i)eval\\(.*req\\.' },
      { type: 'regex', value: '(?i)exec\\(.*\\$\\{' },
    ],
    remediation: 'Validate and sanitize all user inputs before processing',
    references: ['ISO 27001 A.14.2.5', 'OWASP Input Validation'],
  },
  {
    id: 'iso27001-error-001',
    framework: 'ISO27001',
    category: 'Error Handling',
    name: 'Verbose Error Messages',
    description: 'Detects detailed error messages exposed to users',
    severity: 'medium',
    patterns: [
      { type: 'regex', value: '(?i)res\\.send\\(.*error\\.stack' },
      { type: 'regex', value: '(?i)res\\.json\\(.*err\\.message' },
    ],
    remediation: 'Return generic error messages to users, log details internally',
    references: ['ISO 27001 A.14.2.1', 'OWASP Error Handling'],
  },
];

export class SecurityComplianceService {
  private rules = new Map<string, ComplianceRule>();
  private configs = new Map<string, ComplianceConfig>();

  constructor() {
    // Load built-in rules
    for (const rule of COMPLIANCE_RULES) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Configure compliance settings for a repository
   */
  async configureRepository(
    repositoryId: string,
    config: Partial<ComplianceConfig>
  ): Promise<ComplianceConfig> {
    const existing = this.configs.get(repositoryId) || this.getDefaultConfig(repositoryId);
    const updated = { ...existing, ...config };
    this.configs.set(repositoryId, updated);

    // Store in database
    await db.analyticsEvent.create({
      data: {
        eventType: 'COMPLIANCE_CONFIG',
        repositoryId,
        eventData: JSON.parse(JSON.stringify(updated)),
        
        
      },
    });

    logger.info({ repositoryId, frameworks: updated.enabledFrameworks }, 'Compliance configured');
    return updated;
  }

  /**
   * Get compliance configuration for a repository
   */
  async getConfiguration(repositoryId: string): Promise<ComplianceConfig> {
    if (this.configs.has(repositoryId)) {
      return this.configs.get(repositoryId)!;
    }

    // Try to load from database
    const stored = await db.analyticsEvent.findFirst({
      where: {
        repositoryId,
        eventType: 'COMPLIANCE_CONFIG',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (stored) {
      const config = stored.eventData as unknown as ComplianceConfig;
      this.configs.set(repositoryId, config);
      return config;
    }

    return this.getDefaultConfig(repositoryId);
  }

  /**
   * Scan a workflow for compliance violations
   */
  async scanWorkflow(
    workflowId: string,
    frameworks?: ComplianceFramework[]
  ): Promise<ComplianceScanResult> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true, analysis: true },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const config = await this.getConfiguration(workflow.repositoryId);
    const activeFrameworks = frameworks || config.enabledFrameworks;

    const scanStartedAt = new Date();
    const violations: ComplianceViolation[] = [];
    const auditTrail: AuditEntry[] = [];

    // Get relevant rules
    const rulesToApply = Array.from(this.rules.values()).filter(
      (rule) => activeFrameworks.includes(rule.framework)
    );

    // Add custom rules
    rulesToApply.push(...config.customRules.filter(
      (rule) => activeFrameworks.includes(rule.framework)
    ));

    // Extract files from analysis (simplified - just file paths)
    const analysis = workflow.analysis as { changedFiles?: Array<{ path: string; patch?: string }> } | null;
    const files = analysis?.changedFiles || [];

    // Scan each file
    let filesScanned = 0;
    for (const file of files) {
      if (!file.patch) continue;
      filesScanned++;

      for (const rule of rulesToApply) {
        // Check if file matches rule's glob pattern
        if (rule.patterns.some(p => p.fileGlob && !this.matchGlob(file.path, p.fileGlob))) {
          continue;
        }

        // Check for exemptions
        if (this.isExempted(file.path, rule.id, config)) {
          continue;
        }

        // Apply patterns
        const matches = this.findMatches(file.patch, rule);
        for (const match of matches) {
          violations.push({
            id: `viol-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            workflowId,
            ruleId: rule.id,
            ruleName: rule.name,
            framework: rule.framework,
            category: rule.category,
            severity: config.severityOverrides[rule.id] || rule.severity,
            file: file.path,
            line: match.line,
            column: match.column,
            codeSnippet: match.snippet,
            message: `${rule.name}: ${rule.description}`,
            remediation: rule.remediation,
            references: rule.references,
            autoFixAvailable: rule.autoFix?.available || false,
            status: 'detected',
            detectedAt: new Date(),
          });
        }
      }
    }

    const scanCompletedAt = new Date();

    // Calculate summary
    const summary = this.calculateSummary(violations, files.length, filesScanned);
    const complianceScore = this.calculateComplianceScore(violations, rulesToApply.length);

    // Create audit entry
    const scanAuditEntry = this.createAuditEntry('compliance_scan', 'system', {
      workflowId,
      frameworks: activeFrameworks,
      violationCount: violations.length,
      complianceScore,
    });
    auditTrail.push(scanAuditEntry);

    // Store violations in database
    await this.storeViolations(workflowId, violations);

    // Store scan result
    const result: ComplianceScanResult = {
      workflowId,
      frameworks: activeFrameworks,
      scanStartedAt,
      scanCompletedAt,
      summary,
      violations,
      passedChecks: rulesToApply.length - new Set(violations.map(v => v.ruleId)).size,
      complianceScore,
      auditTrail,
    };

    await db.analyticsEvent.create({
      data: {
        eventType: 'COMPLIANCE_SCAN',
        repositoryId: workflow.repositoryId,
        eventData: JSON.parse(JSON.stringify({
          ...result,
          violations: violations.map(v => v.id), // Store only IDs for space
        })),
        
        
      },
    });

    logger.info({
      workflowId,
      frameworks: activeFrameworks,
      violations: violations.length,
      score: complianceScore,
    }, 'Compliance scan completed');

    return result;
  }

  /**
   * Get violations for a workflow
   */
  async getViolations(
    workflowId: string,
    filters?: {
      framework?: ComplianceFramework;
      severity?: ViolationSeverity;
      status?: string;
    }
  ): Promise<ComplianceViolation[]> {
    const events = await db.analyticsEvent.findMany({
      where: {
        eventType: 'COMPLIANCE_VIOLATION',
      },
    });

    let violations = events
      .map(e => e.eventData as unknown as ComplianceViolation)
      .filter(v => v.workflowId === workflowId);

    if (filters?.framework) {
      violations = violations.filter(v => v.framework === filters.framework);
    }
    if (filters?.severity) {
      violations = violations.filter(v => v.severity === filters.severity);
    }
    if (filters?.status) {
      violations = violations.filter(v => v.status === filters.status);
    }

    return violations;
  }

  /**
   * Update violation status
   */
  async updateViolationStatus(
    violationId: string,
    status: ComplianceViolation['status'],
    actor: string,
    reason?: string
  ): Promise<void> {
    // Find and update the violation
    const events = await db.analyticsEvent.findMany({
      where: { eventType: 'COMPLIANCE_VIOLATION' },
    });

    for (const event of events) {
      const violation = event.eventData as unknown as ComplianceViolation;
      if (violation.id === violationId) {
        violation.status = status;
        
        await db.analyticsEvent.update({
          where: { id: event.id },
          data: { eventData: JSON.parse(JSON.stringify(violation)) },
        });

        // Create audit entry
        await db.analyticsEvent.create({
          data: {
            eventType: 'COMPLIANCE_AUDIT',
            repositoryId: event.repositoryId,
            eventData: JSON.parse(JSON.stringify(this.createAuditEntry('violation_status_change', actor, {
              violationId,
              newStatus: status,
              reason,
            }))),
            
            
          },
        });

        break;
      }
    }

    logger.info({ violationId, status, actor }, 'Violation status updated');
  }

  /**
   * Check if PR can be merged based on compliance
   */
  async checkMergeReadiness(workflowId: string): Promise<{
    canMerge: boolean;
    blockingViolations: ComplianceViolation[];
    warnings: string[];
  }> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) {
      return { canMerge: false, blockingViolations: [], warnings: ['Workflow not found'] };
    }

    const config = await this.getConfiguration(workflow.repositoryId);
    const violations = await this.getViolations(workflowId);

    const severityOrder: ViolationSeverity[] = ['critical', 'high', 'medium', 'low', 'informational'];
    const blockingIndex = severityOrder.indexOf(config.blockingThreshold);

    const blockingViolations = violations.filter(v => {
      if (v.status === 'fixed' || v.status === 'false_positive' || v.status === 'risk_accepted') {
        return false;
      }
      const violationIndex = severityOrder.indexOf(v.severity);
      return violationIndex <= blockingIndex;
    });

    const warnings: string[] = [];
    if (config.requireAcknowledgement) {
      const unacknowledged = violations.filter(v => v.status === 'detected');
      if (unacknowledged.length > 0) {
        warnings.push(`${unacknowledged.length} violations require acknowledgement`);
      }
    }

    return {
      canMerge: blockingViolations.length === 0,
      blockingViolations,
      warnings,
    };
  }

  /**
   * Generate compliance report
   */
  async generateReport(
    workflowId: string,
    format: 'json' | 'markdown' | 'html' = 'json'
  ): Promise<string> {
    const violations = await this.getViolations(workflowId);
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
      include: { repository: true },
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const report = {
      title: `Compliance Report for PR #${workflow.prNumber}`,
      repository: workflow.repository.fullName,
      generatedAt: new Date().toISOString(),
      summary: this.calculateSummary(violations, 0, 0),
      violations: violations.map(v => ({
        rule: v.ruleName,
        framework: v.framework,
        severity: v.severity,
        file: v.file,
        line: v.line,
        status: v.status,
        remediation: v.remediation,
      })),
    };

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    }

    if (format === 'markdown') {
      return this.formatMarkdownReport(report);
    }

    return this.formatHTMLReport(report);
  }

  /**
   * Get all available rules
   */
  getRules(framework?: ComplianceFramework): ComplianceRule[] {
    const rules = Array.from(this.rules.values());
    if (framework) {
      return rules.filter(r => r.framework === framework);
    }
    return rules;
  }

  /**
   * Add a custom rule
   */
  addCustomRule(rule: ComplianceRule): void {
    this.rules.set(rule.id, rule);
    logger.info({ ruleId: rule.id, framework: rule.framework }, 'Custom rule added');
  }

  // Private helper methods

  private getDefaultConfig(repositoryId: string): ComplianceConfig {
    return {
      repositoryId,
      enabledFrameworks: ['SOC2'],
      customRules: [],
      exemptions: [],
      severityOverrides: {},
      blockingThreshold: 'high',
      requireAcknowledgement: false,
      auditRetentionDays: 365,
    };
  }

  private matchGlob(path: string, glob: string): boolean {
    const regexPattern = glob
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regexPattern}$`).test(path);
  }

  private isExempted(file: string, ruleId: string, config: ComplianceConfig): boolean {
    const now = new Date();
    return config.exemptions.some(e => 
      e.ruleId === ruleId &&
      this.matchGlob(file, e.filePattern) &&
      (!e.expiresAt || e.expiresAt > now)
    );
  }

  private findMatches(
    content: string,
    rule: ComplianceRule
  ): Array<{ line: number; column?: number; snippet: string }> {
    const matches: Array<{ line: number; column?: number; snippet: string }> = [];
    const lines = content.split('\n');

    for (const pattern of rule.patterns) {
      if (pattern.type === 'regex') {
        try {
          const regex = new RegExp(pattern.value, 'gm');
          let lineNumber = 0;
          let match: RegExpExecArray | null;

          for (const line of lines) {
            lineNumber++;
            regex.lastIndex = 0;
            match = regex.exec(line);
            while (match !== null) {
              matches.push({
                line: lineNumber,
                column: match.index + 1,
                snippet: line.trim().substring(0, 100),
              });
              match = regex.exec(line);
            }
          }
        } catch {
          logger.warn({ pattern: pattern.value }, 'Invalid regex pattern');
        }
      }
    }

    return matches;
  }

  private calculateSummary(
    violations: ComplianceViolation[],
    totalFiles: number,
    filesScanned: number
  ): ComplianceScanResult['summary'] {
    const bySeverity: Record<ViolationSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };

    const byFramework: Record<string, number> = {};
    const byCategory: Record<string, number> = {};

    for (const v of violations) {
      bySeverity[v.severity]++;
      byFramework[v.framework] = (byFramework[v.framework] || 0) + 1;
      byCategory[v.category] = (byCategory[v.category] || 0) + 1;
    }

    return {
      totalFiles,
      filesScanned,
      totalViolations: violations.length,
      bySeverity,
      byFramework: byFramework as Record<ComplianceFramework, number>,
      byCategory,
    };
  }

  private calculateComplianceScore(
    violations: ComplianceViolation[],
    totalRules: number
  ): number {
    if (totalRules === 0) return 100;

    const weights: Record<ViolationSeverity, number> = {
      critical: 25,
      high: 15,
      medium: 8,
      low: 3,
      informational: 1,
    };

    const totalPenalty = violations.reduce(
      (sum, v) => sum + weights[v.severity],
      0
    );

    const maxPenalty = totalRules * 10;
    const score = Math.max(0, 100 - (totalPenalty / maxPenalty) * 100);

    return Math.round(score);
  }

  private createAuditEntry(
    action: string,
    actor: string,
    details: Record<string, unknown>
  ): AuditEntry {
    const entry: AuditEntry = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      action,
      actor,
      details,
      hash: '', // Will be calculated
    };

    // Calculate hash for tamper detection
    entry.hash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ ...entry, hash: '' }))
      .digest('hex');

    return entry;
  }

  private async storeViolations(
    workflowId: string,
    violations: ComplianceViolation[]
  ): Promise<void> {
    const workflow = await db.pRWorkflow.findUnique({
      where: { id: workflowId },
    });

    if (!workflow) return;

    for (const violation of violations) {
      await db.analyticsEvent.create({
        data: {
          eventType: 'COMPLIANCE_VIOLATION',
          repositoryId: workflow.repositoryId,
          eventData: JSON.parse(JSON.stringify(violation)),
          
          
        },
      });
    }
  }

  private formatMarkdownReport(report: {
    title: string;
    repository: string;
    generatedAt: string;
    summary: ComplianceScanResult['summary'];
    violations: Array<{
      rule: string;
      framework: string;
      severity: string;
      file: string;
      line: number;
      status: string;
      remediation: string;
    }>;
  }): string {
    let md = `# ${report.title}\n\n`;
    md += `**Repository:** ${report.repository}\n`;
    md += `**Generated:** ${report.generatedAt}\n\n`;

    md += `## Summary\n\n`;
    md += `- Total Violations: ${report.summary.totalViolations}\n`;
    md += `- Critical: ${report.summary.bySeverity.critical}\n`;
    md += `- High: ${report.summary.bySeverity.high}\n`;
    md += `- Medium: ${report.summary.bySeverity.medium}\n`;
    md += `- Low: ${report.summary.bySeverity.low}\n\n`;

    if (report.violations.length > 0) {
      md += `## Violations\n\n`;
      md += `| Severity | Framework | Rule | File | Line | Status |\n`;
      md += `|----------|-----------|------|------|------|--------|\n`;

      for (const v of report.violations) {
        md += `| ${v.severity} | ${v.framework} | ${v.rule} | ${v.file} | ${v.line} | ${v.status} |\n`;
      }
    }

    return md;
  }

  private formatHTMLReport(report: {
    title: string;
    repository: string;
    generatedAt: string;
    summary: ComplianceScanResult['summary'];
    violations: Array<{
      rule: string;
      framework: string;
      severity: string;
      file: string;
      line: number;
      status: string;
      remediation: string;
    }>;
  }): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>${report.title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    .critical { color: #d32f2f; }
    .high { color: #f57c00; }
    .medium { color: #fbc02d; }
    .low { color: #388e3c; }
  </style>
</head>
<body>
  <h1>${report.title}</h1>
  <p><strong>Repository:</strong> ${report.repository}</p>
  <p><strong>Generated:</strong> ${report.generatedAt}</p>
  
  <h2>Summary</h2>
  <ul>
    <li>Total Violations: ${report.summary.totalViolations}</li>
    <li class="critical">Critical: ${report.summary.bySeverity.critical}</li>
    <li class="high">High: ${report.summary.bySeverity.high}</li>
    <li class="medium">Medium: ${report.summary.bySeverity.medium}</li>
    <li class="low">Low: ${report.summary.bySeverity.low}</li>
  </ul>
  
  <h2>Violations</h2>
  <table>
    <tr>
      <th>Severity</th>
      <th>Framework</th>
      <th>Rule</th>
      <th>File</th>
      <th>Line</th>
      <th>Status</th>
    </tr>
    ${report.violations.map(v => `
    <tr>
      <td class="${v.severity}">${v.severity}</td>
      <td>${v.framework}</td>
      <td>${v.rule}</td>
      <td>${v.file}</td>
      <td>${v.line}</td>
      <td>${v.status}</td>
    </tr>
    `).join('')}
  </table>
</body>
</html>`;
  }
}

export const securityComplianceService = new SecurityComplianceService();
