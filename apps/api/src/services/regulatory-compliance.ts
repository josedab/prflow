import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { callLLM } from '../agents/base.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  ComplianceCheckResult,
  ComplianceFinding,
  RegulatoryComplianceFramework,
  CompliancePolicy,
  ComplianceRule,
  RegulatoryReport,
  ComplianceAudit,
  ComplianceEvidence,
  RegulatoryFrameworkSummary,
  RegulatoryRecommendation,
  ComplianceSeverity,
  RegulatoryStatus,
  ComplianceCategory,
} from '@prflow/core';

/**
 * Regulatory Compliance Engine Service
 * Automated compliance checking against GDPR, SOC2, HIPAA, PCI-DSS, and custom policies
 */
export class RegulatoryComplianceService {
  // Built-in compliance rules by framework
  private readonly builtInRules: Map<RegulatoryComplianceFramework, ComplianceRule[]> = new Map();

  constructor() {
    this.initializeBuiltInRules();
  }

  /**
   * Run compliance check for a PR
   */
  async runComplianceCheck(
    owner: string,
    repo: string,
    prNumber: number,
    options: {
      frameworks?: RegulatoryComplianceFramework[];
      policyId?: string;
      autoFix?: boolean;
    } = {}
  ): Promise<ComplianceCheckResult> {
    const startTime = Date.now();
    const { frameworks = ['gdpr', 'soc2'], autoFix = false } = options;

    logger.info({ owner, repo, prNumber, frameworks }, 'Running compliance check');

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (!repository) {
      throw new Error(`Repository ${owner}/${repo} not found`);
    }

    // Get PR workflow and analysis
    const workflow = await db.pRWorkflow.findFirst({
      where: {
        repositoryId: repository.id,
        prNumber,
      },
      include: {
        analysis: true,
      },
    });

    if (!workflow) {
      throw new Error(`PR #${prNumber} not found`);
    }

    // Get policy if specified
    let policy: CompliancePolicy | null = null;
    if (options.policyId) {
      policy = await this.getPolicy(options.policyId);
    }

    // Collect findings for each framework
    const allFindings: ComplianceFinding[] = [];
    const frameworkSummaries: RegulatoryFrameworkSummary[] = [];

    for (const framework of frameworks) {
      const findings = await this.checkFramework(
        framework,
        workflow,
        policy
      );
      allFindings.push(...findings);

      // Build framework summary
      const summary = this.buildRegulatoryFrameworkSummary(framework, findings);
      frameworkSummaries.push(summary);
    }

    // Calculate overall status and score
    const overallStatus = this.calculateOverallStatus(allFindings);
    const complianceScore = this.calculateComplianceScore(frameworkSummaries);

    // Generate recommendations
    const recommendations = await this.generateRecommendations(allFindings, frameworks);

    // Apply auto-fixes if enabled
    if (autoFix) {
      await this.applyAutoFixes(allFindings.filter(f => f.autoFixAvailable));
    }

    const result: ComplianceCheckResult = {
      id: uuidv4(),
      prNumber,
      repository: { owner, name: repo },
      frameworks,
      overallStatus,
      complianceScore,
      findings: allFindings,
      frameworkSummary: frameworkSummaries,
      recommendations,
      checkedAt: new Date(),
      durationMs: Date.now() - startTime,
    };

    // Store result
    await db.analyticsEvent.create({
      data: {
        repositoryId: repository.id,
        eventType: 'compliance_check',
        eventData: JSON.parse(JSON.stringify(result)),
      },
    });

    logger.info(
      { checkId: result.id, score: complianceScore, findingsCount: allFindings.length },
      'Compliance check completed'
    );

    return result;
  }

  /**
   * Create a compliance policy
   */
  async createPolicy(
    organizationId: string,
    params: {
      name: string;
      description: string;
      frameworks: RegulatoryComplianceFramework[];
      rules?: Partial<ComplianceRule>[];
      thresholds?: CompliancePolicy['thresholds'];
    }
  ): Promise<CompliancePolicy> {
    const policy: CompliancePolicy = {
      id: uuidv4(),
      name: params.name,
      description: params.description,
      organizationId,
      frameworks: params.frameworks,
      rules: (params.rules || []).map(r => this.buildRule(r)),
      thresholds: params.thresholds || {
        blockMergeBelow: 70,
        requireReviewBelow: 85,
        autoApproveAbove: 95,
        maxCriticalFindings: 0,
        maxHighFindings: 3,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      active: true,
    };

    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'compliance_policy_created',
        eventData: JSON.parse(JSON.stringify(policy)),
      },
    });

    logger.info({ policyId: policy.id, name: policy.name }, 'Compliance policy created');

    return policy;
  }

  /**
   * Get a compliance policy
   */
  async getPolicy(policyId: string): Promise<CompliancePolicy | null> {
    const event = await db.analyticsEvent.findFirst({
      where: {
        eventType: 'compliance_policy_created',
        eventData: {
          path: ['id'],
          equals: policyId,
        },
      },
    });

    return event?.eventData as unknown as CompliancePolicy | null;
  }

  /**
   * Generate compliance report
   */
  async generateReport(
    scopeType: 'repository' | 'organization',
    scopeId: string,
    options: {
      reportType: 'summary' | 'detailed' | 'executive' | 'audit';
      frameworks?: RegulatoryComplianceFramework[];
      periodStart: Date;
      periodEnd: Date;
    }
  ): Promise<RegulatoryReport> {
    logger.info({ scopeType, scopeId, ...options }, 'Generating compliance report');

    // Get all compliance checks in period
    const events = await db.analyticsEvent.findMany({
      where: {
        eventType: 'compliance_check',
        createdAt: {
          gte: options.periodStart,
          lte: options.periodEnd,
        },
        ...(scopeType === 'repository' && { repositoryId: scopeId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    const checks = events.map(e => e.eventData as unknown as ComplianceCheckResult);

    // Calculate metrics
    const totalChecks = checks.length;
    const passedChecks = checks.filter(c => c.overallStatus === 'passed').length;
    const failedChecks = checks.filter(c => c.overallStatus === 'failed').length;

    const overallScore = totalChecks > 0
      ? checks.reduce((sum, c) => sum + c.complianceScore, 0) / totalChecks
      : 100;

    const byFramework: Record<RegulatoryComplianceFramework, number> = {} as Record<RegulatoryComplianceFramework, number>;
    for (const framework of options.frameworks || ['gdpr', 'soc2']) {
      const frameworkChecks = checks.filter(c => c.frameworks.includes(framework));
      byFramework[framework] = frameworkChecks.length > 0
        ? frameworkChecks.reduce((sum, c) => {
            const summary = c.frameworkSummary.find(s => s.framework === framework);
            return sum + (summary?.score || 0);
          }, 0) / frameworkChecks.length
        : 100;
    }

    // Get top issues
    const allFindings = checks.flatMap(c => c.findings);
    const topIssues = allFindings
      .filter(f => f.severity === 'critical' || f.severity === 'high')
      .slice(0, 10);

    // Calculate trends
    const history = this.calculateHistory(checks, options.periodStart, options.periodEnd);
    const scoreTrend = this.calculateTrend(history);

    const report: RegulatoryReport = {
      id: uuidv4(),
      type: options.reportType,
      scope: {
        type: scopeType,
        id: scopeId,
        name: scopeId,
      },
      period: {
        start: options.periodStart,
        end: options.periodEnd,
      },
      frameworks: options.frameworks || ['gdpr', 'soc2'],
      metrics: {
        overallScore: Math.round(overallScore),
        byFramework,
        totalChecks,
        passedChecks,
        failedChecks,
        autoFixedIssues: allFindings.filter(f => f.autoFixAvailable).length,
        prsChecked: new Set(checks.map(c => c.prNumber)).size,
        prsBlocked: checks.filter(c => c.complianceScore < 70).length,
      },
      trends: {
        scoreTrend,
        scoreChange: history.length > 1 ? history[history.length - 1].score - history[0].score : 0,
        history,
      },
      topIssues,
      generatedAt: new Date(),
    };

    logger.info({ reportId: report.id, type: options.reportType }, 'Compliance report generated');

    return report;
  }

  /**
   * Create audit record
   */
  async createAudit(
    owner: string,
    repo: string,
    type: ComplianceAudit['type'],
    result: ComplianceCheckResult,
    auditor: string
  ): Promise<ComplianceAudit> {
    const audit: ComplianceAudit = {
      id: uuidv4(),
      repository: { owner, name: repo },
      type,
      frameworks: result.frameworks,
      result,
      auditor,
      startedAt: new Date(result.checkedAt.getTime() - result.durationMs),
      completedAt: result.checkedAt,
      artifacts: [
        {
          type: 'report',
          name: `Compliance Report - PR #${result.prNumber}`,
          url: `/api/compliance/audits/${result.id}/report`,
          generatedAt: new Date(),
        },
      ],
    };

    const repository = await db.repository.findFirst({
      where: { fullName: `${owner}/${repo}` },
    });

    if (repository) {
      await db.analyticsEvent.create({
        data: {
          repositoryId: repository.id,
          eventType: 'compliance_audit',
          eventData: JSON.parse(JSON.stringify(audit)),
        },
      });
    }

    logger.info({ auditId: audit.id, type }, 'Compliance audit created');

    return audit;
  }

  /**
   * Collect compliance evidence
   */
  async collectEvidence(
    controlId: string,
    framework: RegulatoryComplianceFramework,
    source: ComplianceEvidence['source'],
    details: {
      title: string;
      description: string;
      type: ComplianceEvidence['type'];
    }
  ): Promise<ComplianceEvidence> {
    const evidence: ComplianceEvidence = {
      id: uuidv4(),
      controlId,
      framework,
      type: details.type,
      title: details.title,
      description: details.description,
      source,
      collectedAt: new Date(),
      attachments: [],
    };

    logger.info({ evidenceId: evidence.id, controlId, framework }, 'Compliance evidence collected');

    return evidence;
  }

  /**
   * Get compliance rules for a framework
   */
  getRulesForFramework(framework: RegulatoryComplianceFramework): ComplianceRule[] {
    return this.builtInRules.get(framework) || [];
  }

  // Private helpers

  private initializeBuiltInRules(): void {
    // GDPR Rules
    this.builtInRules.set('gdpr', [
      {
        id: 'gdpr-pii-logging',
        framework: 'gdpr',
        category: 'pii_handling',
        name: 'PII in Logging',
        description: 'Personal data should not be logged without proper anonymization',
        severity: 'high',
        pattern: '(console\\.log|logger\\.).*\\b(email|password|ssn|credit.?card)\\b',
        filePatterns: ['*.ts', '*.js'],
        enabled: true,
        autoFixable: false,
        referenceUrl: 'https://gdpr.eu/article-32/',
        controlId: 'GDPR-32',
      },
      {
        id: 'gdpr-data-retention',
        framework: 'gdpr',
        category: 'data_retention',
        name: 'Data Retention Policy',
        description: 'Data retention periods must be defined and enforced',
        severity: 'medium',
        enabled: true,
        autoFixable: false,
        referenceUrl: 'https://gdpr.eu/article-5/',
        controlId: 'GDPR-5',
      },
      {
        id: 'gdpr-consent',
        framework: 'gdpr',
        category: 'consent_management',
        name: 'Consent Collection',
        description: 'User consent must be explicitly collected before processing personal data',
        severity: 'critical',
        enabled: true,
        autoFixable: false,
        referenceUrl: 'https://gdpr.eu/article-7/',
        controlId: 'GDPR-7',
      },
    ]);

    // SOC2 Rules
    this.builtInRules.set('soc2', [
      {
        id: 'soc2-access-control',
        framework: 'soc2',
        category: 'access_control',
        name: 'Access Control Checks',
        description: 'Access control must be implemented for sensitive operations',
        severity: 'high',
        enabled: true,
        autoFixable: false,
        controlId: 'CC6.1',
      },
      {
        id: 'soc2-encryption',
        framework: 'soc2',
        category: 'encryption',
        name: 'Data Encryption',
        description: 'Sensitive data must be encrypted at rest and in transit',
        severity: 'critical',
        pattern: '(http:|ftp:)',
        filePatterns: ['*.ts', '*.js', '*.json'],
        enabled: true,
        autoFixable: true,
        controlId: 'CC6.7',
      },
      {
        id: 'soc2-audit-logging',
        framework: 'soc2',
        category: 'audit_trail',
        name: 'Audit Logging',
        description: 'Security-relevant events must be logged',
        severity: 'medium',
        enabled: true,
        autoFixable: false,
        controlId: 'CC7.2',
      },
    ]);

    // HIPAA Rules
    this.builtInRules.set('hipaa', [
      {
        id: 'hipaa-phi-exposure',
        framework: 'hipaa',
        category: 'pii_handling',
        name: 'PHI Exposure',
        description: 'Protected Health Information must not be exposed',
        severity: 'critical',
        pattern: '(patient|diagnosis|medication|medical.?record)',
        enabled: true,
        autoFixable: false,
        controlId: '164.502',
      },
      {
        id: 'hipaa-access-audit',
        framework: 'hipaa',
        category: 'audit_trail',
        name: 'Access Audit Trail',
        description: 'All access to PHI must be logged',
        severity: 'high',
        enabled: true,
        autoFixable: false,
        controlId: '164.312',
      },
    ]);

    // PCI-DSS Rules
    this.builtInRules.set('pci_dss', [
      {
        id: 'pci-card-data',
        framework: 'pci_dss',
        category: 'pii_handling',
        name: 'Card Data Storage',
        description: 'Card data must not be stored in plain text',
        severity: 'critical',
        pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
        enabled: true,
        autoFixable: false,
        controlId: 'Req-3',
      },
      {
        id: 'pci-secure-transmission',
        framework: 'pci_dss',
        category: 'encryption',
        name: 'Secure Transmission',
        description: 'Card data must be encrypted during transmission',
        severity: 'critical',
        enabled: true,
        autoFixable: true,
        controlId: 'Req-4',
      },
    ]);
  }

  private async checkFramework(
    framework: RegulatoryComplianceFramework,
    workflow: { prNumber: number; prTitle: string; analysis?: unknown },
    policy: CompliancePolicy | null
  ): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];
    const rules = policy?.rules.filter(r => r.framework === framework) || this.builtInRules.get(framework) || [];

    // Get changed files from analysis
    const changedFiles = this.extractChangedFiles(workflow.analysis);

    for (const rule of rules) {
      if (!rule.enabled) continue;

      // Check each file against the rule
      for (const file of changedFiles) {
        const ruleFindings = await this.checkRule(rule, file);
        findings.push(...ruleFindings);
      }
    }

    // Use LLM for deeper analysis on complex rules
    const llmFindings = await this.runLLMComplianceCheck(framework, workflow, changedFiles);
    findings.push(...llmFindings);

    return findings;
  }

  private extractChangedFiles(analysis?: unknown): Array<{ path: string; content?: string }> {
    const analysisObj = analysis as { changedFiles?: unknown } | null | undefined;
    if (!analysisObj?.changedFiles) {
      return [];
    }

    const files = analysisObj.changedFiles as Array<{ filename?: string; path?: string; patch?: string }>;
    return files.map(f => ({
      path: f.filename || f.path || '',
      content: f.patch,
    }));
  }

  private async checkRule(
    rule: ComplianceRule,
    file: { path: string; content?: string }
  ): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Skip if file doesn't match patterns
    if (rule.filePatterns && rule.filePatterns.length > 0) {
      const matches = rule.filePatterns.some(pattern => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return regex.test(file.path);
      });
      if (!matches) return findings;
    }

    // Check pattern if defined
    if (rule.pattern && file.content) {
      const regex = new RegExp(rule.pattern, 'gi');
      const matches = file.content.match(regex);

      if (matches) {
        findings.push({
          id: uuidv4(),
          ruleId: rule.id,
          framework: rule.framework,
          category: rule.category,
          severity: rule.severity,
          status: 'failed',
          file: file.path,
          title: rule.name,
          description: rule.description,
          evidence: matches.slice(0, 3).join(', '),
          remediation: `Address the ${rule.name} violation by reviewing the code and applying appropriate fixes.`,
          autoFixAvailable: rule.autoFixable,
          controlReference: rule.controlId,
        });
      }
    }

    return findings;
  }

  private async runLLMComplianceCheck(
    framework: RegulatoryComplianceFramework,
    workflow: { prNumber: number; prTitle: string },
    files: Array<{ path: string; content?: string }>
  ): Promise<ComplianceFinding[]> {
    if (files.length === 0) return [];

    const prompt = `Analyze the following code changes for ${framework.toUpperCase()} compliance issues:

PR: #${workflow.prNumber} - ${workflow.prTitle}

Files changed:
${files.slice(0, 5).map(f => `- ${f.path}\n${f.content?.slice(0, 500) || 'No content'}`).join('\n\n')}

Identify any ${framework.toUpperCase()} compliance issues. For each issue, provide:
1. severity (critical, high, medium, low)
2. category
3. description
4. remediation

Return as JSON array: [{ severity, category, description, remediation }]
Return empty array [] if no issues found.`;

    try {
      const response = await callLLM([
        { role: 'system', content: `You are a ${framework.toUpperCase()} compliance expert. Identify compliance issues in code.` },
        { role: 'user', content: prompt },
      ], {
        maxTokens: 1000,
      });

      const parsed = JSON.parse(response.content);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((issue: { severity?: string; category?: string; description?: string; remediation?: string }) => ({
        id: uuidv4(),
        ruleId: `${framework}-llm-check`,
        framework,
        category: (issue.category || 'data_protection') as ComplianceCategory,
        severity: (issue.severity || 'medium') as ComplianceSeverity,
        status: 'failed' as RegulatoryStatus,
        file: files[0]?.path || 'unknown',
        title: `${framework.toUpperCase()} Compliance Issue`,
        description: issue.description || 'Compliance issue detected',
        remediation: issue.remediation || 'Review and fix the compliance issue',
        autoFixAvailable: false,
      }));
    } catch {
      return [];
    }
  }

  private buildRegulatoryFrameworkSummary(
    framework: RegulatoryComplianceFramework,
    findings: ComplianceFinding[]
  ): RegulatoryFrameworkSummary {
    const frameworkFindings = findings.filter(f => f.framework === framework);
    const failed = frameworkFindings.filter(f => f.status === 'failed').length;
    const warnings = frameworkFindings.filter(f => f.status === 'warning').length;
    const criticalFindings = frameworkFindings.filter(f => f.severity === 'critical').length;

    const status: RegulatoryStatus = criticalFindings > 0 ? 'failed' :
      failed > 0 ? 'warning' : 'passed';

    const score = Math.max(0, 100 - (criticalFindings * 20) - (failed * 10) - (warnings * 5));

    return {
      framework,
      status,
      score,
      passed: frameworkFindings.filter(f => f.status === 'passed').length,
      failed,
      warnings,
      criticalFindings,
    };
  }

  private calculateOverallStatus(findings: ComplianceFinding[]): RegulatoryStatus {
    const hasCritical = findings.some(f => f.severity === 'critical' && f.status === 'failed');
    if (hasCritical) return 'failed';

    const hasHigh = findings.some(f => f.severity === 'high' && f.status === 'failed');
    if (hasHigh) return 'warning';

    const hasFailed = findings.some(f => f.status === 'failed');
    if (hasFailed) return 'warning';

    return 'passed';
  }

  private calculateComplianceScore(summaries: RegulatoryFrameworkSummary[]): number {
    if (summaries.length === 0) return 100;
    const total = summaries.reduce((sum, s) => sum + s.score, 0);
    return Math.round(total / summaries.length);
  }

  private async generateRecommendations(
    findings: ComplianceFinding[],
    frameworks: RegulatoryComplianceFramework[]
  ): Promise<RegulatoryRecommendation[]> {
    const recommendations: RegulatoryRecommendation[] = [];

    // Group findings by category
    const byCategory = new Map<ComplianceCategory, ComplianceFinding[]>();
    for (const finding of findings) {
      const existing = byCategory.get(finding.category) || [];
      existing.push(finding);
      byCategory.set(finding.category, existing);
    }

    // Generate recommendations for each category with issues
    for (const [category, categoryFindings] of byCategory) {
      const hasCritical = categoryFindings.some(f => f.severity === 'critical');
      const hasHigh = categoryFindings.some(f => f.severity === 'high');

      recommendations.push({
        id: uuidv4(),
        priority: hasCritical ? 'critical' : hasHigh ? 'high' : 'medium',
        framework: categoryFindings[0].framework,
        title: `Address ${category.replace('_', ' ')} issues`,
        description: `${categoryFindings.length} ${category.replace('_', ' ')} issue(s) found`,
        actions: categoryFindings.slice(0, 3).map(f => f.remediation),
        effort: categoryFindings.length > 5 ? 'large' : categoryFindings.length > 2 ? 'medium' : 'small',
        scoreImpact: categoryFindings.reduce((sum, f) => {
          const impact = f.severity === 'critical' ? 20 : f.severity === 'high' ? 10 : 5;
          return sum + impact;
        }, 0),
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  private async applyAutoFixes(findings: ComplianceFinding[]): Promise<void> {
    for (const finding of findings) {
      if (finding.suggestedFix) {
        logger.info({ findingId: finding.id, file: finding.file }, 'Auto-fix would be applied');
        // In a real implementation, this would apply the fix via GitHub API
      }
    }
  }

  private buildRule(partial: Partial<ComplianceRule>): ComplianceRule {
    return {
      id: partial.id || uuidv4(),
      framework: partial.framework || 'custom',
      category: partial.category || 'data_protection',
      name: partial.name || 'Custom Rule',
      description: partial.description || '',
      severity: partial.severity || 'medium',
      pattern: partial.pattern,
      filePatterns: partial.filePatterns,
      enabled: partial.enabled ?? true,
      autoFixable: partial.autoFixable ?? false,
      referenceUrl: partial.referenceUrl,
      controlId: partial.controlId,
    };
  }

  private calculateHistory(
    checks: ComplianceCheckResult[],
    start: Date,
    end: Date
  ): Array<{ date: Date; score: number; findings: number }> {
    const history: Array<{ date: Date; score: number; findings: number }> = [];
    const dayMs = 24 * 60 * 60 * 1000;

    for (let d = start.getTime(); d <= end.getTime(); d += dayMs) {
      const date = new Date(d);
      const dayChecks = checks.filter(c => {
        const checkDate = new Date(c.checkedAt);
        return checkDate.toDateString() === date.toDateString();
      });

      if (dayChecks.length > 0) {
        history.push({
          date,
          score: Math.round(dayChecks.reduce((sum, c) => sum + c.complianceScore, 0) / dayChecks.length),
          findings: dayChecks.reduce((sum, c) => sum + c.findings.length, 0),
        });
      }
    }

    return history;
  }

  private calculateTrend(
    history: Array<{ date: Date; score: number; findings: number }>
  ): 'improving' | 'stable' | 'declining' {
    if (history.length < 2) return 'stable';

    const firstHalf = history.slice(0, Math.floor(history.length / 2));
    const secondHalf = history.slice(Math.floor(history.length / 2));

    const firstAvg = firstHalf.reduce((sum, h) => sum + h.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, h) => sum + h.score, 0) / secondHalf.length;

    const diff = secondAvg - firstAvg;
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }
}

export const regulatoryComplianceService = new RegulatoryComplianceService();
