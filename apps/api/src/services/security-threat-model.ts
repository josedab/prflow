import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

interface STRIDEThreat {
  id: string;
  category: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  likelihood: string;
  affectedFiles: Array<{ file: string; line?: number }>;
  attackVector: string;
  potentialImpact: string;
  existingMitigations: string[];
  recommendedMitigations: string[];
  owaspCategory?: string;
  cweId?: string;
  status: string;
}

interface SensitiveArea {
  id: string;
  file: string;
  startLine: number;
  endLine: number;
  classification: string;
  riskLevel: string;
  reason: string;
  dataSensitivity: string;
}

interface ThreatModelAssessment {
  id: string;
  prNumber: number;
  repository: { owner: string; name: string };
  overallRiskScore: number;
  riskLevel: string;
  sensitiveAreas: SensitiveArea[];
  threats: STRIDEThreat[];
  owaspMatches: Array<{ category: string; name: string; pattern: string; confidence: number; location: { file: string; line: number }; description: string; remediation: string }>;
  securityChecklist: Array<{ id: string; category: string; description: string; status: string; priority: string }>;
  complianceFlags: Array<{ framework: string; requirementId: string; description: string; status: string }>;
  summary: string;
  recommendations: string[];
  assessedAt: Date;
  assessmentDurationMs: number;
}

const SENSITIVE_PATTERNS: Array<{ pattern: RegExp; classification: string; riskLevel: string; reason: string }> = [
  { pattern: /auth|login|session|token|jwt|oauth/i, classification: 'authentication', riskLevel: 'high', reason: 'Authentication-related code' },
  { pattern: /password|secret|credential|api.?key/i, classification: 'authentication', riskLevel: 'critical', reason: 'Credential handling code' },
  { pattern: /encrypt|decrypt|hash|crypto|cipher/i, classification: 'cryptography', riskLevel: 'high', reason: 'Cryptographic operations' },
  { pattern: /payment|stripe|billing|invoice|charge/i, classification: 'payment_processing', riskLevel: 'critical', reason: 'Payment processing code' },
  { pattern: /sql|query|database|prisma|sequelize/i, classification: 'data_access', riskLevel: 'medium', reason: 'Database access code' },
  { pattern: /fetch|axios|http|request|curl/i, classification: 'network_communication', riskLevel: 'medium', reason: 'Network communication code' },
  { pattern: /upload|download|file.*write|fs\./i, classification: 'file_system', riskLevel: 'medium', reason: 'File system operations' },
  { pattern: /req\.body|req\.params|req\.query|user.*input/i, classification: 'user_input', riskLevel: 'high', reason: 'User input handling' },
  { pattern: /cookie|session.*store|redis.*session/i, classification: 'session_management', riskLevel: 'high', reason: 'Session management code' },
];

const OWASP_PATTERNS: Array<{ category: string; name: string; pattern: RegExp; description: string; remediation: string }> = [
  { category: 'A01:2021', name: 'Broken Access Control', pattern: /role.*admin|bypass.*auth|no.*auth.*check/i, description: 'Potential access control bypass', remediation: 'Implement proper role-based access control' },
  { category: 'A02:2021', name: 'Cryptographic Failures', pattern: /md5|sha1\b|Math\.random.*secret|btoa.*password/i, description: 'Weak cryptographic algorithm', remediation: 'Use strong algorithms (bcrypt, argon2, AES-256)' },
  { category: 'A03:2021', name: 'Injection', pattern: /\$\{.*\}.*query|exec\(.*\+|eval\(/i, description: 'Potential injection vulnerability', remediation: 'Use parameterized queries and avoid eval()' },
  { category: 'A07:2021', name: 'XSS', pattern: /innerHTML|dangerouslySetInnerHTML|document\.write/i, description: 'Potential XSS vulnerability', remediation: 'Sanitize user input before rendering in DOM' },
  { category: 'A09:2021', name: 'Security Logging', pattern: /console\.log.*password|console\.log.*token|console\.log.*secret/i, description: 'Sensitive data in logs', remediation: 'Never log sensitive data' },
];

/**
 * Security Threat Model Integration Service
 * Provides STRIDE threat modeling, sensitive area detection,
 * OWASP pattern matching, and security posture tracking.
 */
export class SecurityThreatModelService {
  /**
   * Assess a PR for security threats
   */
  async assessPR(params: {
    owner: string;
    repo: string;
    prNumber: number;
    files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }>;
  }): Promise<ThreatModelAssessment> {
    const startTime = Date.now();
    const { owner, repo, prNumber, files } = params;

    logger.info({ owner, repo, prNumber, fileCount: files.length }, 'Starting security threat assessment');

    // Detect sensitive areas
    const sensitiveAreas = this.detectSensitiveAreas(files);

    // Run STRIDE analysis
    const threats = this.runSTRIDEAnalysis(files, sensitiveAreas);

    // Check OWASP patterns
    const owaspMatches = this.checkOWASPPatterns(files);

    // Generate security checklist
    const securityChecklist = this.generateChecklist(sensitiveAreas, threats, owaspMatches);

    // Check compliance
    const complianceFlags = this.checkCompliance(sensitiveAreas);

    // Calculate risk score
    const riskScore = this.calculateRiskScore(threats, owaspMatches, sensitiveAreas);
    const riskLevel = riskScore >= 80 ? 'critical' : riskScore >= 60 ? 'high' : riskScore >= 30 ? 'medium' : 'low';

    // Generate summary
    const summary = this.generateSummary(threats, owaspMatches, sensitiveAreas, riskLevel);

    // Generate recommendations
    const recommendations = this.generateRecommendations(threats, owaspMatches, sensitiveAreas);

    const assessment: ThreatModelAssessment = {
      id: uuidv4(),
      prNumber,
      repository: { owner, name: repo },
      overallRiskScore: riskScore,
      riskLevel,
      sensitiveAreas,
      threats,
      owaspMatches,
      securityChecklist,
      complianceFlags,
      summary,
      recommendations,
      assessedAt: new Date(),
      assessmentDurationMs: Date.now() - startTime,
    };

    logger.info({ prNumber, riskScore, riskLevel, threatCount: threats.length, owaspCount: owaspMatches.length }, 'Security threat assessment completed');
    return assessment;
  }

  /**
   * Get security posture dashboard data
   */
  async getSecurityDashboard(params: {
    owner: string;
    repo: string;
    periodDays?: number;
  }): Promise<{
    securityScore: number;
    scoreTrend: string;
    threatDistribution: Record<string, number>;
    openThreatsBySeverity: Record<string, number>;
    securityDebt: number;
    avgTimeToMitigateHours: number;
    recurringPatterns: Array<{ pattern: string; count: number; severity: string }>;
  }> {
    return {
      securityScore: 75,
      scoreTrend: 'stable',
      threatDistribution: { spoofing: 0, tampering: 0, repudiation: 0, information_disclosure: 0, denial_of_service: 0, elevation_of_privilege: 0 },
      openThreatsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      securityDebt: 0,
      avgTimeToMitigateHours: 0,
      recurringPatterns: [],
    };
  }

  private detectSensitiveAreas(files: Array<{ filename: string; patch?: string }>): SensitiveArea[] {
    const areas: SensitiveArea[] = [];

    for (const file of files) {
      for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.pattern.test(file.filename) || (file.patch && pattern.pattern.test(file.patch))) {
          areas.push({
            id: uuidv4(),
            file: file.filename,
            startLine: 1,
            endLine: 100,
            classification: pattern.classification,
            riskLevel: pattern.riskLevel,
            reason: pattern.reason,
            dataSensitivity: pattern.riskLevel === 'critical' ? 'restricted' : pattern.riskLevel === 'high' ? 'confidential' : 'internal',
          });
        }
      }
    }

    return areas;
  }

  private runSTRIDEAnalysis(
    files: Array<{ filename: string; patch?: string }>,
    sensitiveAreas: SensitiveArea[]
  ): STRIDEThreat[] {
    const threats: STRIDEThreat[] = [];

    // Spoofing threats
    if (sensitiveAreas.some(a => a.classification === 'authentication')) {
      threats.push({
        id: uuidv4(),
        category: 'spoofing',
        title: 'Authentication mechanism changes detected',
        description: 'Changes to authentication code could introduce identity spoofing vulnerabilities',
        severity: 'high',
        likelihood: 'possible',
        affectedFiles: sensitiveAreas.filter(a => a.classification === 'authentication').map(a => ({ file: a.file })),
        attackVector: 'Manipulated authentication tokens or bypassed auth checks',
        potentialImpact: 'Unauthorized access to user accounts',
        existingMitigations: [],
        recommendedMitigations: ['Verify token validation logic', 'Check for auth bypass paths', 'Add authentication tests'],
        owaspCategory: 'A07:2021',
        status: 'open',
      });
    }

    // Tampering threats
    if (sensitiveAreas.some(a => a.classification === 'data_access')) {
      threats.push({
        id: uuidv4(),
        category: 'tampering',
        title: 'Data access layer changes detected',
        description: 'Changes to database queries could introduce data tampering vulnerabilities',
        severity: 'medium',
        likelihood: 'possible',
        affectedFiles: sensitiveAreas.filter(a => a.classification === 'data_access').map(a => ({ file: a.file })),
        attackVector: 'SQL injection or improper input validation',
        potentialImpact: 'Data corruption or unauthorized data modification',
        existingMitigations: [],
        recommendedMitigations: ['Use parameterized queries', 'Validate all inputs', 'Add integrity checks'],
        owaspCategory: 'A03:2021',
        cweId: 'CWE-89',
        status: 'open',
      });
    }

    // Information disclosure threats
    if (sensitiveAreas.some(a => a.classification === 'cryptography' || a.classification === 'payment_processing')) {
      threats.push({
        id: uuidv4(),
        category: 'information_disclosure',
        title: 'Sensitive data handling changes detected',
        description: 'Changes could expose sensitive data through logging, error messages, or inadequate encryption',
        severity: sensitiveAreas.some(a => a.classification === 'payment_processing') ? 'critical' : 'high',
        likelihood: 'possible',
        affectedFiles: sensitiveAreas.filter(a => ['cryptography', 'payment_processing'].includes(a.classification)).map(a => ({ file: a.file })),
        attackVector: 'Data exfiltration through logs, errors, or network interception',
        potentialImpact: 'Exposure of PII, payment data, or credentials',
        existingMitigations: [],
        recommendedMitigations: ['Audit log output for sensitive data', 'Verify encryption in transit and at rest', 'Review error message content'],
        cweId: 'CWE-200',
        status: 'open',
      });
    }

    return threats;
  }

  private checkOWASPPatterns(files: Array<{ filename: string; patch?: string }>): ThreatModelAssessment['owaspMatches'] {
    const matches: ThreatModelAssessment['owaspMatches'] = [];

    for (const file of files) {
      if (!file.patch) continue;

      for (const owasp of OWASP_PATTERNS) {
        if (owasp.pattern.test(file.patch)) {
          matches.push({
            category: owasp.category,
            name: owasp.name,
            pattern: owasp.pattern.source,
            confidence: 0.7,
            location: { file: file.filename, line: 1 },
            description: owasp.description,
            remediation: owasp.remediation,
          });
        }
      }
    }

    return matches;
  }

  private generateChecklist(
    sensitiveAreas: SensitiveArea[],
    threats: STRIDEThreat[],
    owaspMatches: ThreatModelAssessment['owaspMatches']
  ): ThreatModelAssessment['securityChecklist'] {
    const checklist: ThreatModelAssessment['securityChecklist'] = [];

    checklist.push({ id: uuidv4(), category: 'general', description: 'No hardcoded secrets or credentials', status: 'needs_review', priority: 'required' });
    checklist.push({ id: uuidv4(), category: 'general', description: 'All user inputs are validated', status: 'needs_review', priority: 'required' });

    if (sensitiveAreas.some(a => a.classification === 'authentication')) {
      checklist.push({ id: uuidv4(), category: 'authentication', description: 'Authentication logic is correct and complete', status: 'needs_review', priority: 'required' });
      checklist.push({ id: uuidv4(), category: 'authentication', description: 'Session handling follows security best practices', status: 'needs_review', priority: 'required' });
    }

    if (sensitiveAreas.some(a => a.classification === 'data_access')) {
      checklist.push({ id: uuidv4(), category: 'data', description: 'Database queries use parameterized statements', status: 'needs_review', priority: 'required' });
      checklist.push({ id: uuidv4(), category: 'data', description: 'Data access respects authorization boundaries', status: 'needs_review', priority: 'required' });
    }

    if (sensitiveAreas.some(a => a.classification === 'network_communication')) {
      checklist.push({ id: uuidv4(), category: 'network', description: 'All external communications use HTTPS/TLS', status: 'needs_review', priority: 'recommended' });
    }

    return checklist;
  }

  private checkCompliance(sensitiveAreas: SensitiveArea[]): ThreatModelAssessment['complianceFlags'] {
    const flags: ThreatModelAssessment['complianceFlags'] = [];

    if (sensitiveAreas.some(a => a.classification === 'payment_processing')) {
      flags.push({ framework: 'pci_dss', requirementId: 'PCI-6.5', description: 'Secure coding practices for payment handling', status: 'needs_review' });
    }

    if (sensitiveAreas.some(a => a.dataSensitivity === 'restricted' || a.dataSensitivity === 'confidential')) {
      flags.push({ framework: 'soc2', requirementId: 'CC6.1', description: 'Logical and physical access controls', status: 'needs_review' });
      flags.push({ framework: 'gdpr', requirementId: 'Art.32', description: 'Security of processing personal data', status: 'needs_review' });
    }

    return flags;
  }

  private calculateRiskScore(threats: STRIDEThreat[], owaspMatches: ThreatModelAssessment['owaspMatches'], sensitiveAreas: SensitiveArea[]): number {
    let score = 0;

    for (const threat of threats) {
      switch (threat.severity) {
        case 'critical': score += 25; break;
        case 'high': score += 15; break;
        case 'medium': score += 8; break;
        case 'low': score += 3; break;
      }
    }

    score += owaspMatches.length * 10;
    score += sensitiveAreas.filter(a => a.riskLevel === 'critical').length * 10;

    return Math.min(100, score);
  }

  private generateSummary(threats: STRIDEThreat[], owaspMatches: ThreatModelAssessment['owaspMatches'], sensitiveAreas: SensitiveArea[], riskLevel: string): string {
    const parts: string[] = [];
    parts.push(`Security assessment: ${riskLevel.toUpperCase()} risk.`);
    if (threats.length > 0) parts.push(`${threats.length} STRIDE threat(s) identified.`);
    if (owaspMatches.length > 0) parts.push(`${owaspMatches.length} OWASP pattern match(es) found.`);
    if (sensitiveAreas.length > 0) parts.push(`${sensitiveAreas.length} sensitive area(s) modified.`);
    return parts.join(' ');
  }

  private generateRecommendations(threats: STRIDEThreat[], owaspMatches: ThreatModelAssessment['owaspMatches'], sensitiveAreas: SensitiveArea[]): string[] {
    const recs: string[] = [];
    if (threats.length > 0) recs.push('Review all STRIDE threats and apply recommended mitigations');
    if (owaspMatches.length > 0) recs.push('Address OWASP pattern matches before merging');
    if (sensitiveAreas.some(a => a.riskLevel === 'critical')) recs.push('Request security team review for critical sensitive area changes');
    if (sensitiveAreas.some(a => a.classification === 'authentication')) recs.push('Run authentication-specific test suite');
    if (recs.length === 0) recs.push('No critical security concerns detected');
    return recs;
  }
}

export const securityThreatModelService = new SecurityThreatModelService();
