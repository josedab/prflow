import type {
  ComplianceAgentInput,
  ComplianceAgentResult,
  ComplianceScan,
  ComplianceViolation,
  ComplianceProfile,
  SecurityRule,
  ComplianceFramework,
  ViolationSeverity,
  ComplianceSummary,
  ScanResults,
  RemediationResult,
} from '@prflow/core';
import { BaseAgent, callLLM, buildSystemPrompt, type LLMMessage } from './base.js';
import { logger } from '../lib/logger.js';

interface LLMSecurityAnalysis {
  violations: Array<{
    ruleId: string;
    severity: string;
    file: string;
    line: number;
    message: string;
    evidence: string;
    suggestion?: string;
    cweId?: string;
  }>;
  summary: string;
}

// Pre-built security rules for common frameworks
const OWASP_RULES: SecurityRule[] = [
  {
    id: 'owasp-a01-broken-access-control',
    framework: 'owasp_top10',
    category: 'A01:2021-Broken Access Control',
    name: 'Missing Authorization Check',
    description: 'Endpoint or function lacks proper authorization verification',
    severity: 'critical',
    pattern: '(req\\.user|session|auth).*(?<!if|&&|\\|\\|).*\\.',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'owasp', id: 'A01:2021', url: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['access-control'] },
  },
  {
    id: 'owasp-a02-cryptographic-failures',
    framework: 'owasp_top10',
    category: 'A02:2021-Cryptographic Failures',
    name: 'Weak Cryptographic Algorithm',
    description: 'Use of deprecated or weak cryptographic algorithms',
    severity: 'high',
    pattern: '(md5|sha1|des|rc4|ecb)\\s*\\(',
    languages: ['typescript', 'javascript', 'python', 'java', 'go'],
    enabled: true,
    autoFix: { available: true, requiresReview: true, riskLevel: 'medium' },
    references: [{ type: 'cwe', id: 'CWE-327', url: 'https://cwe.mitre.org/data/definitions/327.html' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['crypto'] },
  },
  {
    id: 'owasp-a03-injection',
    framework: 'owasp_top10',
    category: 'A03:2021-Injection',
    name: 'SQL Injection',
    description: 'Potential SQL injection through string concatenation',
    severity: 'critical',
    pattern: '(SELECT|INSERT|UPDATE|DELETE|DROP).*\\+.*\\$|`.*\\$\\{.*\\}.*`.*(?:SELECT|INSERT|UPDATE|DELETE)',
    languages: ['typescript', 'javascript', 'python', 'java', 'php'],
    enabled: true,
    autoFix: { available: true, requiresReview: true, riskLevel: 'high', template: 'Use parameterized queries' },
    references: [{ type: 'cwe', id: 'CWE-89', url: 'https://cwe.mitre.org/data/definitions/89.html' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['injection', 'sql'] },
  },
  {
    id: 'owasp-a03-xss',
    framework: 'owasp_top10',
    category: 'A03:2021-Injection',
    name: 'Cross-Site Scripting (XSS)',
    description: 'Potential XSS through unsanitized output',
    severity: 'high',
    pattern: 'innerHTML\\s*=|document\\.write\\(|\\$\\(.*\\)\\.html\\(',
    languages: ['typescript', 'javascript'],
    enabled: true,
    autoFix: { available: true, requiresReview: true, riskLevel: 'medium' },
    references: [{ type: 'cwe', id: 'CWE-79', url: 'https://cwe.mitre.org/data/definitions/79.html' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['injection', 'xss'] },
  },
  {
    id: 'owasp-a05-security-misconfiguration',
    framework: 'owasp_top10',
    category: 'A05:2021-Security Misconfiguration',
    name: 'Debug Mode in Production',
    description: 'Debug mode or verbose error messages enabled',
    severity: 'medium',
    pattern: 'DEBUG\\s*=\\s*[Tt]rue|DEBUG_MODE|console\\.(log|debug|trace)',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'owasp', id: 'A05:2021' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['config'] },
  },
  {
    id: 'owasp-a07-auth-failures',
    framework: 'owasp_top10',
    category: 'A07:2021-Identification and Authentication Failures',
    name: 'Hardcoded Credentials',
    description: 'Hardcoded passwords, API keys, or secrets',
    severity: 'critical',
    pattern: '(password|secret|api_key|apikey|token|auth)\\s*[=:]\\s*["\'][^"\']{8,}["\']',
    languages: ['typescript', 'javascript', 'python', 'java', 'go', 'ruby'],
    enabled: true,
    references: [{ type: 'cwe', id: 'CWE-798', url: 'https://cwe.mitre.org/data/definitions/798.html' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['secrets', 'auth'] },
  },
];

const SOC2_RULES: SecurityRule[] = [
  {
    id: 'soc2-cc6.1-encryption',
    framework: 'soc2',
    category: 'CC6.1-Logical Access',
    name: 'Data Encryption Required',
    description: 'Sensitive data must be encrypted at rest and in transit',
    severity: 'high',
    pattern: 'password|creditCard|ssn|socialSecurity',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'standard', id: 'SOC2-CC6.1' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['encryption', 'data-protection'] },
  },
  {
    id: 'soc2-cc6.6-audit-logging',
    framework: 'soc2',
    category: 'CC6.6-System Operations',
    name: 'Audit Logging Required',
    description: 'Security-relevant operations should be logged',
    severity: 'medium',
    pattern: '(login|logout|auth|permission|access).*(?<!log|audit)',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'standard', id: 'SOC2-CC6.6' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['logging', 'audit'] },
  },
];

const HIPAA_RULES: SecurityRule[] = [
  {
    id: 'hipaa-phi-exposure',
    framework: 'hipaa',
    category: '164.502-Uses and Disclosures',
    name: 'PHI Exposure Risk',
    description: 'Protected Health Information may be exposed',
    severity: 'critical',
    pattern: '(patientId|medicalRecord|diagnosis|treatment|healthInfo)',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'standard', id: 'HIPAA-164.502' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['phi', 'healthcare'] },
  },
  {
    id: 'hipaa-minimum-necessary',
    framework: 'hipaa',
    category: '164.514-Minimum Necessary',
    name: 'Minimum Necessary Principle',
    description: 'Only necessary PHI should be accessed',
    severity: 'high',
    pattern: 'SELECT\\s+\\*.*patient|findAll.*patient',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'standard', id: 'HIPAA-164.514' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['phi', 'data-minimization'] },
  },
];

const PCI_DSS_RULES: SecurityRule[] = [
  {
    id: 'pci-dss-3.4-card-data',
    framework: 'pci_dss',
    category: 'Requirement 3.4',
    name: 'Card Data Storage',
    description: 'PAN must be rendered unreadable when stored',
    severity: 'critical',
    pattern: '(cardNumber|pan|creditCard)\\s*=(?!.*encrypt)',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'standard', id: 'PCI-DSS-3.4' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['pci', 'card-data'] },
  },
  {
    id: 'pci-dss-6.5-secure-coding',
    framework: 'pci_dss',
    category: 'Requirement 6.5',
    name: 'Secure Coding Practices',
    description: 'Applications must be developed using secure coding guidelines',
    severity: 'high',
    pattern: 'eval\\(|exec\\(',
    languages: ['typescript', 'javascript', 'python', 'java'],
    enabled: true,
    references: [{ type: 'standard', id: 'PCI-DSS-6.5' }],
    metadata: { createdAt: new Date(), updatedAt: new Date(), version: '1.0', tags: ['secure-coding'] },
  },
];

export class ComplianceAgent extends BaseAgent<ComplianceAgentInput, ComplianceAgentResult> {
  readonly name = 'compliance';
  readonly description = 'Scans code for security compliance violations against industry standards';

  private profiles: Map<string, ComplianceProfile> = new Map();

  async execute(input: ComplianceAgentInput, _context: unknown): Promise<{
    success: boolean;
    data?: ComplianceAgentResult;
    error?: string;
    latencyMs: number;
  }> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.processOperation(input);
    });

    if (!result) {
      return this.createErrorResult('Compliance operation failed', latencyMs);
    }

    return this.createSuccessResult(result, latencyMs);
  }

  private async processOperation(input: ComplianceAgentInput): Promise<ComplianceAgentResult> {
    const { operation, repositoryId, profileId, files, diff, prNumber } = input;

    switch (operation) {
      case 'scan':
        return this.performScan(repositoryId, profileId, files, diff, prNumber);
      case 'configure':
        return this.configureProfile(repositoryId, profileId);
      case 'remediate':
        return this.remediateViolations(repositoryId, profileId);
      default:
        return { operation, success: false, error: `Unknown operation: ${operation}` };
    }
  }

  private async performScan(
    repositoryId: string,
    profileId?: string,
    files?: Array<{ path: string; content: string }>,
    diff?: { files: Array<{ filename: string; patch?: string }> },
    prNumber?: number
  ): Promise<ComplianceAgentResult> {
    logger.info({ repositoryId, profileId, fileCount: files?.length || diff?.files.length }, 'Starting compliance scan');

    const scanId = `scan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const profile = profileId ? this.profiles.get(profileId) : this.getDefaultProfile();
    
    if (!profile) {
      return { operation: 'scan', success: false, error: 'Profile not found' };
    }

    const violations: ComplianceViolation[] = [];
    const passedRules: string[] = [];

    // Scan files using pattern matching
    const filesToScan = files || diff?.files.map(f => ({ path: f.filename, content: f.patch || '' })) || [];

    for (const file of filesToScan) {
      const fileViolations = await this.scanFile(file, profile.rules);
      violations.push(...fileViolations);
    }

    // Use LLM for deeper analysis if we have diff content
    if (diff && diff.files.some(f => f.patch)) {
      const llmViolations = await this.scanWithLLM(diff, profile.frameworks);
      violations.push(...llmViolations);
    }

    // Calculate passed rules
    const violatedRuleIds = new Set(violations.map(v => v.ruleId));
    for (const rule of profile.rules) {
      if (!violatedRuleIds.has(rule.id)) {
        passedRules.push(rule.id);
      }
    }

    // Build summary
    const summary = this.buildSummary(violations, passedRules, profile);

    const results: ScanResults = {
      summary,
      violations,
      passedRules,
      skippedRules: [],
      coverage: {
        filesScanned: filesToScan.length,
        linesScanned: filesToScan.reduce((sum, f) => sum + (f.content?.split('\n').length || 0), 0),
        languagesCovered: [...new Set(filesToScan.map(f => this.getLanguageFromFile(f.path)))],
        frameworksCovered: profile.frameworks,
      },
    };

    const scan: ComplianceScan = {
      id: scanId,
      repositoryId,
      profileId: profile.id,
      prNumber,
      status: 'completed',
      results,
      startedAt: new Date(),
      completedAt: new Date(),
    };

    return {
      operation: 'scan',
      success: true,
      data: { scan },
    };
  }

  private async scanFile(
    file: { path: string; content: string },
    rules: SecurityRule[]
  ): Promise<ComplianceViolation[]> {
    const violations: ComplianceViolation[] = [];
    const language = this.getLanguageFromFile(file.path);
    const lines = file.content.split('\n');

    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.languages.length > 0 && !rule.languages.includes(language)) continue;
      if (!rule.pattern) continue;

      try {
        const regex = new RegExp(rule.pattern, 'gi');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const matches = line.match(regex);

          if (matches) {
            violations.push({
              id: `vio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ruleId: rule.id,
              ruleName: rule.name,
              framework: rule.framework,
              severity: rule.severity,
              file: file.path,
              line: i + 1,
              message: rule.description,
              evidence: line.trim(),
              suggestion: rule.autoFix?.available ? {
                description: rule.autoFix.template || 'Review and fix manually',
                autoFixAvailable: rule.autoFix.available,
              } : undefined,
              references: rule.references,
              status: 'open',
            });
          }
        }
      } catch (error) {
        logger.warn({ error, ruleId: rule.id }, 'Failed to apply rule pattern');
      }
    }

    return violations;
  }

  private async scanWithLLM(
    diff: { files: Array<{ filename: string; patch?: string }> },
    frameworks: ComplianceFramework[]
  ): Promise<ComplianceViolation[]> {
    const systemPrompt = buildSystemPrompt('security compliance analyst', `
Compliance frameworks: ${frameworks.join(', ')}
Focus areas: OWASP Top 10, secrets exposure, injection attacks, access control
`);

    const patches = diff.files
      .filter(f => f.patch)
      .slice(0, 5)
      .map(f => `### ${f.filename}\n\`\`\`diff\n${f.patch?.substring(0, 1000)}\n\`\`\``)
      .join('\n\n');

    const userPrompt = `Analyze these code changes for security compliance violations:

${patches}

For each violation found, respond with a JSON object:
{
  "violations": [
    {
      "ruleId": "owasp-xxx or soc2-xxx or custom rule id",
      "severity": "critical|high|medium|low|informational",
      "file": "filename",
      "line": line_number,
      "message": "clear description of the issue",
      "evidence": "the problematic code snippet",
      "suggestion": "how to fix it",
      "cweId": "CWE-XXX if applicable"
    }
  ],
  "summary": "brief summary of findings"
}

Only report actual security issues. If no issues are found, return {"violations": [], "summary": "No security violations found"}.
Respond with ONLY the JSON object.`;

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.2, maxTokens: 2000 });
      const content = response.content.trim();
      const jsonStr = content.startsWith('{') ? content :
                      content.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || content;
      
      const analysis: LLMSecurityAnalysis = JSON.parse(jsonStr);

      return analysis.violations.map(v => ({
        id: `vio-llm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        ruleId: v.ruleId || 'llm-detected',
        ruleName: v.message.substring(0, 50),
        framework: 'owasp_top10' as ComplianceFramework,
        severity: v.severity as ViolationSeverity,
        file: v.file,
        line: v.line,
        message: v.message,
        evidence: v.evidence,
        suggestion: v.suggestion ? {
          description: v.suggestion,
          autoFixAvailable: false,
        } : undefined,
        references: v.cweId ? [{
          type: 'cwe' as const,
          id: v.cweId,
          url: `https://cwe.mitre.org/data/definitions/${v.cweId.replace('CWE-', '')}.html`,
        }] : [],
        status: 'open' as const,
      }));
    } catch (error) {
      logger.warn({ error }, 'Failed to analyze with LLM');
      return [];
    }
  }

  private buildSummary(
    violations: ComplianceViolation[],
    passedRules: string[],
    profile: ComplianceProfile
  ): ComplianceSummary {
    const bySeverity: Record<ViolationSeverity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      informational: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- initialize empty Record for framework stats
    const byFramework: Record<ComplianceFramework, { status: string; passed: number; failed: number; score: number }> = {} as Record<ComplianceFramework, { status: string; passed: number; failed: number; score: number }>;

    for (const framework of profile.frameworks) {
      byFramework[framework] = { status: 'compliant', passed: 0, failed: 0, score: 100 };
    }

    for (const violation of violations) {
      bySeverity[violation.severity]++;
      if (byFramework[violation.framework]) {
        byFramework[violation.framework].failed++;
        byFramework[violation.framework].status = 'non_compliant';
      }
    }

    // Calculate framework scores
    for (const framework of profile.frameworks) {
      const frameworkRules = profile.rules.filter(r => r.framework === framework).length;
      const frameworkViolations = violations.filter(v => v.framework === framework).length;
      const passed = frameworkRules - frameworkViolations;
      byFramework[framework].passed = Math.max(0, passed);
      byFramework[framework].score = frameworkRules > 0 
        ? Math.round((passed / frameworkRules) * 100) 
        : 100;
    }

    const hasViolations = violations.length > 0;
    const hasCritical = bySeverity.critical > 0;
    const hasHigh = bySeverity.high > 0;

    return {
      totalRules: profile.rules.length,
      passedRules: passedRules.length,
      failedRules: new Set(violations.map(v => v.ruleId)).size,
      skippedRules: 0,
      overallStatus: hasCritical ? 'non_compliant' : hasHigh ? 'partial' : hasViolations ? 'needs_review' : 'compliant',
      bySeverity,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- type assertion for dynamic framework structure
      byFramework: byFramework as any,
    };
  }

  private configureProfile(
    repositoryId: string,
    profileId?: string
  ): ComplianceAgentResult {
    const profile = this.getDefaultProfile();
    profile.id = profileId || `profile-${repositoryId}`;
    this.profiles.set(profile.id, profile);

    return {
      operation: 'configure',
      success: true,
      data: { profile },
    };
  }

  private async remediateViolations(
    _repositoryId: string,
    _profileId?: string
  ): Promise<ComplianceAgentResult> {
    // In a full implementation, this would apply auto-fixes
    const remediations: RemediationResult[] = [];

    return {
      operation: 'remediate',
      success: true,
      data: { remediations },
    };
  }

  private getDefaultProfile(): ComplianceProfile {
    return {
      id: 'default',
      name: 'Default Security Profile',
      description: 'Standard security checks combining OWASP, SOC2, and common best practices',
      frameworks: ['owasp_top10', 'soc2'],
      rules: [...OWASP_RULES, ...SOC2_RULES],
      customRules: [],
      exclusions: [],
      settings: {
        failOnSeverity: 'critical',
        requireApprovalFor: ['critical', 'high'],
        autoFixEnabled: false,
        blockMergeOnViolation: true,
        notifyOnViolation: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private getLanguageFromFile(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      java: 'java',
      go: 'go',
      rb: 'ruby',
      php: 'php',
    };
    return langMap[ext] || ext;
  }

  // Public methods for accessing rulesets
  getOWASPRules(): SecurityRule[] {
    return OWASP_RULES;
  }

  getSOC2Rules(): SecurityRule[] {
    return SOC2_RULES;
  }

  getHIPAARules(): SecurityRule[] {
    return HIPAA_RULES;
  }

  getPCIDSSRules(): SecurityRule[] {
    return PCI_DSS_RULES;
  }

  getAllRules(): SecurityRule[] {
    return [...OWASP_RULES, ...SOC2_RULES, ...HIPAA_RULES, ...PCI_DSS_RULES];
  }
}

export const complianceAgent = new ComplianceAgent();
