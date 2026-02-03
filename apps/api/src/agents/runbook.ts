/**
 * @fileoverview Runbook Generator Agent
 * 
 * AI agent that generates deployment runbooks from PR changes.
 */

import { BaseAgent, callLLM, type LLMMessage } from './base.js';
import { parseLLMJsonOrThrow } from '../lib/llm-parser.js';
import type {
  DeploymentRunbook,
  RunbookStep,
  RiskAssessment,
  RunbookRollbackPlan,
  RiskFactor,
  RunbookStepType,
  StepRiskLevel,
} from '@prflow/core';

export interface RunbookAgentInput {
  prTitle: string;
  prBody: string;
  prNumber: number;
  repository: { owner: string; name: string };
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }>;
  commits: Array<{
    message: string;
    sha: string;
  }>;
  environment: string;
  existingInfra?: string[];
}

export interface RunbookAgentOutput {
  runbook: DeploymentRunbook;
}

export class RunbookGeneratorAgent extends BaseAgent<RunbookAgentInput, RunbookAgentOutput> {
  name = 'RunbookGeneratorAgent';
  description = 'Generates deployment runbooks from PR changes';

  async execute(input: RunbookAgentInput, _context: import('@prflow/core').AgentContext): Promise<import('@prflow/core').AgentResult<RunbookAgentOutput>> {
    const { result, latencyMs } = await this.measureExecution(async () => {
      return this.doExecute(input);
    });

    return result.success
      ? this.createSuccessResult(result.data!, latencyMs)
      : this.createErrorResult(result.error!, latencyMs);
  }

  private async doExecute(input: RunbookAgentInput): Promise<{ success: boolean; data?: RunbookAgentOutput; error?: string }> {
    try {
      // Analyze changes for deployment considerations
      const changeAnalysis = this.analyzeChanges(input.files);

      // Generate risk assessment
      const riskAssessment = await this.assessRisk(input, changeAnalysis);

      // Generate deployment steps
      const steps = await this.generateSteps(input, changeAnalysis, riskAssessment);

      // Generate rollback plan
      const rollbackPlan = await this.generateRollbackPlan(input, changeAnalysis);

      // Build complete runbook
      const runbook: DeploymentRunbook = {
        id: crypto.randomUUID(),
        prNumber: input.prNumber,
        repository: input.repository,
        prTitle: input.prTitle,
        generatedAt: new Date(),
        environment: input.environment,
        riskAssessment,
        prerequisites: this.generatePrerequisites(changeAnalysis),
        steps,
        rollbackPlan,
        contacts: this.getDefaultContacts(input.environment),
        estimatedTotalMinutes: steps.reduce((sum, s) => sum + s.estimatedMinutes, 0),
        checklist: this.generateChecklist(changeAnalysis, input.environment),
      };

      return { success: true, data: { runbook } };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private analyzeChanges(files: RunbookAgentInput['files']): ChangeAnalysis {
    const analysis: ChangeAnalysis = {
      hasDatabaseChanges: false,
      hasConfigChanges: false,
      hasInfraChanges: false,
      hasApiChanges: false,
      hasDependencyChanges: false,
      hasSecurityChanges: false,
      affectedServices: new Set(),
      fileCategories: {},
    };

    for (const file of files) {
      // Database changes
      if (file.filename.includes('migration') || file.filename.includes('schema.prisma')) {
        analysis.hasDatabaseChanges = true;
        analysis.fileCategories[file.filename] = 'database';
      }

      // Config changes
      if (file.filename.match(/\.(yml|yaml|json|env|toml)$/i) || file.filename.includes('config')) {
        analysis.hasConfigChanges = true;
        analysis.fileCategories[file.filename] = 'config';
      }

      // Infrastructure changes
      if (file.filename.match(/dockerfile|docker-compose|k8s|terraform|\.tf$/i)) {
        analysis.hasInfraChanges = true;
        analysis.fileCategories[file.filename] = 'infrastructure';
      }

      // API changes
      if (file.filename.includes('routes') || file.filename.includes('api') || file.filename.includes('endpoints')) {
        analysis.hasApiChanges = true;
        analysis.fileCategories[file.filename] = 'api';
      }

      // Dependency changes
      if (file.filename.match(/package\.json|yarn\.lock|pnpm-lock|requirements\.txt|go\.mod/)) {
        analysis.hasDependencyChanges = true;
        analysis.fileCategories[file.filename] = 'dependencies';
      }

      // Security changes
      if (file.filename.includes('auth') || file.filename.includes('security') || file.filename.includes('permission')) {
        analysis.hasSecurityChanges = true;
        analysis.fileCategories[file.filename] = 'security';
      }

      // Extract affected services
      const serviceMatch = file.filename.match(/^(apps|services|packages)\/([^/]+)/);
      if (serviceMatch) {
        analysis.affectedServices.add(serviceMatch[2]);
      }
    }

    return analysis;
  }

  private async assessRisk(input: RunbookAgentInput, analysis: ChangeAnalysis): Promise<RiskAssessment> {
    const factors: RiskFactor[] = [];

    // Database changes are high risk
    if (analysis.hasDatabaseChanges) {
      factors.push({
        name: 'Database Schema Changes',
        description: 'Migrations may require downtime or data transformation',
        severity: 'high',
      });
    }

    // Infrastructure changes
    if (analysis.hasInfraChanges) {
      factors.push({
        name: 'Infrastructure Changes',
        description: 'Changes to deployment configuration may affect availability',
        severity: 'high',
      });
    }

    // Security changes
    if (analysis.hasSecurityChanges) {
      factors.push({
        name: 'Security Changes',
        description: 'Authentication/authorization changes require careful verification',
        severity: 'critical',
      });
    }

    // API changes
    if (analysis.hasApiChanges) {
      factors.push({
        name: 'API Changes',
        description: 'API modifications may affect downstream consumers',
        severity: 'medium',
      });
    }

    // Production environment
    if (input.environment === 'production') {
      factors.push({
        name: 'Production Deployment',
        description: 'Direct impact on end users',
        severity: 'high',
      });
    }

    // Determine overall level
    let level: StepRiskLevel = 'low';
    if (factors.some(f => f.severity === 'critical')) level = 'critical';
    else if (factors.some(f => f.severity === 'high')) level = 'high';
    else if (factors.some(f => f.severity === 'medium')) level = 'medium';

    // Generate mitigations
    const mitigations: string[] = [];
    if (analysis.hasDatabaseChanges) {
      mitigations.push('Take database backup before deployment');
      mitigations.push('Test migrations on staging first');
    }
    if (analysis.hasInfraChanges) {
      mitigations.push('Deploy during low-traffic window');
      mitigations.push('Have rollback commands ready');
    }
    if (analysis.hasSecurityChanges) {
      mitigations.push('Security team review required');
      mitigations.push('Test authentication flows post-deployment');
    }

    // Recommended window
    let recommendedWindow = 'Any time';
    if (level === 'critical' || level === 'high') {
      recommendedWindow = 'Tuesday-Thursday, 10am-2pm local time';
    } else if (level === 'medium') {
      recommendedWindow = 'Business hours, avoid Friday deployments';
    }

    return {
      level,
      factors,
      mitigations,
      recommendedWindow,
      requiredApprovers: this.getRequiredApprovers(level, analysis),
    };
  }

  private getRequiredApprovers(level: StepRiskLevel, analysis: ChangeAnalysis): string[] {
    const approvers: string[] = [];

    if (level === 'critical' || level === 'high') {
      approvers.push('Tech Lead');
    }
    if (analysis.hasSecurityChanges) {
      approvers.push('Security Team');
    }
    if (analysis.hasDatabaseChanges) {
      approvers.push('DBA or Database Owner');
    }
    if (analysis.hasInfraChanges) {
      approvers.push('DevOps/SRE');
    }

    return approvers.length > 0 ? approvers : ['Code Owner'];
  }

  private async generateSteps(
    input: RunbookAgentInput,
    analysis: ChangeAnalysis,
    risk: RiskAssessment
  ): Promise<RunbookStep[]> {
    const steps: RunbookStep[] = [];
    let order = 1;

    // Pre-deployment steps
    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'pre_deployment',
      title: 'Verify Prerequisites',
      description: 'Ensure all prerequisites are met before deployment',
      verification: [
        'All tests passing',
        'Required approvals obtained',
        'Staging deployment successful',
      ],
      riskLevel: 'low',
      estimatedMinutes: 5,
      requiresApproval: false,
    });

    if (analysis.hasDatabaseChanges) {
      steps.push({
        id: crypto.randomUUID(),
        order: order++,
        type: 'pre_deployment',
        title: 'Database Backup',
        description: 'Create a backup of the database before applying migrations',
        commands: [
          `# Create database backup`,
          `pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql`,
        ],
        expectedOutput: 'Backup file created successfully',
        riskLevel: 'low',
        estimatedMinutes: 10,
        requiresApproval: false,
        notes: ['Store backup in secure location', 'Verify backup integrity'],
      });
    }

    // Notification
    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'notification',
      title: 'Notify Stakeholders',
      description: 'Announce deployment to relevant channels',
      commands: [
        `# Post to Slack`,
        `echo "🚀 Starting deployment of PR #${input.prNumber}: ${input.prTitle}"`,
      ],
      riskLevel: 'low',
      estimatedMinutes: 2,
      requiresApproval: false,
    });

    // Database migration
    if (analysis.hasDatabaseChanges) {
      steps.push({
        id: crypto.randomUUID(),
        order: order++,
        type: 'deployment',
        title: 'Run Database Migrations',
        description: 'Apply database schema changes',
        commands: [
          `npx prisma migrate deploy`,
        ],
        expectedOutput: 'All migrations applied successfully',
        verification: [
          'No migration errors',
          'Schema matches expected state',
        ],
        rollback: [
          `# Rollback to previous migration`,
          `npx prisma migrate resolve --rolled-back <migration_name>`,
        ],
        riskLevel: 'high',
        estimatedMinutes: 5,
        requiresApproval: true,
        notes: ['Watch for timeout errors on large tables'],
      });
    }

    // Dependency installation
    if (analysis.hasDependencyChanges) {
      steps.push({
        id: crypto.randomUUID(),
        order: order++,
        type: 'deployment',
        title: 'Install Dependencies',
        description: 'Install updated packages',
        commands: [
          `pnpm install --frozen-lockfile`,
        ],
        expectedOutput: 'Dependencies installed successfully',
        riskLevel: 'medium',
        estimatedMinutes: 5,
        requiresApproval: false,
      });
    }

    // Main deployment
    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'deployment',
      title: 'Deploy Application',
      description: 'Deploy the application to the target environment',
      commands: this.getDeployCommands(input.environment),
      expectedOutput: 'Deployment completed successfully',
      verification: [
        'Health check endpoint returns 200',
        'Application logs show successful startup',
      ],
      rollback: this.getRollbackCommands(input.environment),
      riskLevel: risk.level,
      estimatedMinutes: 10,
      requiresApproval: risk.level === 'high' || risk.level === 'critical',
    });

    // Verification steps
    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'verification',
      title: 'Verify Deployment',
      description: 'Confirm the deployment was successful',
      commands: [
        `curl -f ${this.getHealthEndpoint(input.environment)} || exit 1`,
      ],
      verification: [
        'Health check passes',
        'Key user flows working',
        'No error spike in monitoring',
      ],
      riskLevel: 'low',
      estimatedMinutes: 10,
      requiresApproval: false,
    });

    // Post-deployment
    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'post_deployment',
      title: 'Post-Deployment Checks',
      description: 'Final verification and cleanup',
      verification: [
        'Monitor error rates for 15 minutes',
        'Check key metrics dashboards',
        'Verify logs for anomalies',
      ],
      riskLevel: 'low',
      estimatedMinutes: 15,
      requiresApproval: false,
    });

    // Completion notification
    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'notification',
      title: 'Announce Completion',
      description: 'Notify stakeholders of successful deployment',
      commands: [
        `echo "✅ Deployment of PR #${input.prNumber} completed successfully"`,
      ],
      riskLevel: 'low',
      estimatedMinutes: 2,
      requiresApproval: false,
    });

    return steps;
  }

  private getDeployCommands(environment: string): string[] {
    switch (environment) {
      case 'production':
        return [
          `# Production deployment`,
          `git fetch origin`,
          `git checkout main`,
          `pnpm build`,
          `pm2 reload ecosystem.config.js --env production`,
        ];
      case 'staging':
        return [
          `# Staging deployment`,
          `git fetch origin`,
          `git checkout staging`,
          `pnpm build`,
          `pm2 reload ecosystem.config.js --env staging`,
        ];
      default:
        return [
          `# Development deployment`,
          `git pull`,
          `pnpm build`,
          `pnpm start`,
        ];
    }
  }

  private getRollbackCommands(environment: string): string[] {
    return [
      `# Rollback to previous version`,
      `git checkout HEAD~1`,
      `pnpm build`,
      `pm2 reload ecosystem.config.js --env ${environment}`,
    ];
  }

  private getHealthEndpoint(environment: string): string {
    switch (environment) {
      case 'production':
        return 'https://api.prflow.io/health';
      case 'staging':
        return 'https://staging-api.prflow.io/health';
      default:
        return 'http://localhost:3000/health';
    }
  }

  private async generateRollbackPlan(
    input: RunbookAgentInput,
    analysis: ChangeAnalysis
  ): Promise<RunbookRollbackPlan> {
    const steps: RunbookStep[] = [];
    let order = 1;

    // Can auto-rollback if no DB changes
    const canAutoRollback = !analysis.hasDatabaseChanges;

    if (analysis.hasDatabaseChanges) {
      steps.push({
        id: crypto.randomUUID(),
        order: order++,
        type: 'rollback',
        title: 'Restore Database',
        description: 'Restore database from backup taken before deployment',
        commands: [
          `# Restore from backup`,
          `psql -h $DB_HOST -U $DB_USER -d $DB_NAME < backup_file.sql`,
        ],
        riskLevel: 'high',
        estimatedMinutes: 15,
        requiresApproval: true,
        notes: ['Verify backup file exists', 'May cause brief downtime'],
      });
    }

    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'rollback',
      title: 'Revert Application',
      description: 'Deploy the previous version of the application',
      commands: this.getRollbackCommands(input.environment),
      riskLevel: 'medium',
      estimatedMinutes: 10,
      requiresApproval: !canAutoRollback,
    });

    steps.push({
      id: crypto.randomUUID(),
      order: order++,
      type: 'verification',
      title: 'Verify Rollback',
      description: 'Confirm the rollback was successful',
      verification: [
        'Health check passes',
        'Previous functionality restored',
        'Error rates normalized',
      ],
      riskLevel: 'low',
      estimatedMinutes: 10,
      requiresApproval: false,
    });

    return {
      canAutoRollback,
      triggers: [
        'Error rate exceeds 5% for 2 minutes',
        'Health check fails 3 consecutive times',
        'Critical alert triggered',
        'Manual trigger by on-call engineer',
      ],
      steps,
      estimatedMinutes: steps.reduce((sum, s) => sum + s.estimatedMinutes, 0),
      dataRecovery: analysis.hasDatabaseChanges
        ? 'Restore from backup taken at step 2. Data written between backup and rollback may be lost.'
        : undefined,
    };
  }

  private generatePrerequisites(analysis: ChangeAnalysis): string[] {
    const prereqs = [
      'All CI checks passing',
      'Required approvals obtained',
      'No blocking issues on the PR',
    ];

    if (analysis.hasDatabaseChanges) {
      prereqs.push('Database backup completed');
      prereqs.push('Migration tested on staging');
    }

    if (analysis.hasInfraChanges) {
      prereqs.push('Infrastructure changes reviewed by DevOps');
    }

    if (analysis.hasSecurityChanges) {
      prereqs.push('Security review completed');
    }

    return prereqs;
  }

  private getDefaultContacts(environment: string): DeploymentRunbook['contacts'] {
    return [
      {
        role: 'On-Call Engineer',
        name: 'See PagerDuty schedule',
        contact: 'PagerDuty',
        escalation: 'If deployment fails or rollback needed',
      },
      {
        role: 'Tech Lead',
        name: 'Team Lead',
        contact: '#engineering Slack',
        escalation: 'For high-risk decisions',
      },
    ];
  }

  private generateChecklist(
    analysis: ChangeAnalysis,
    environment: string
  ): DeploymentRunbook['checklist'] {
    const items: DeploymentRunbook['checklist'] = [];

    // Pre-deployment
    items.push(
      { id: crypto.randomUUID(), description: 'All tests passing', category: 'pre', required: true, checked: false },
      { id: crypto.randomUUID(), description: 'Required approvals obtained', category: 'pre', required: true, checked: false },
      { id: crypto.randomUUID(), description: 'Staging deployment verified', category: 'pre', required: environment === 'production', checked: false },
    );

    if (analysis.hasDatabaseChanges) {
      items.push(
        { id: crypto.randomUUID(), description: 'Database backup completed', category: 'pre', required: true, checked: false },
        { id: crypto.randomUUID(), description: 'Migration tested on staging', category: 'pre', required: true, checked: false },
      );
    }

    // During
    items.push(
      { id: crypto.randomUUID(), description: 'Monitoring dashboards open', category: 'during', required: true, checked: false },
      { id: crypto.randomUUID(), description: 'Rollback commands ready', category: 'during', required: true, checked: false },
    );

    // Post
    items.push(
      { id: crypto.randomUUID(), description: 'Health checks passing', category: 'post', required: true, checked: false },
      { id: crypto.randomUUID(), description: 'No error spike in monitoring', category: 'post', required: true, checked: false },
      { id: crypto.randomUUID(), description: 'Stakeholders notified', category: 'post', required: false, checked: false },
    );

    return items;
  }
}

interface ChangeAnalysis {
  hasDatabaseChanges: boolean;
  hasConfigChanges: boolean;
  hasInfraChanges: boolean;
  hasApiChanges: boolean;
  hasDependencyChanges: boolean;
  hasSecurityChanges: boolean;
  affectedServices: Set<string>;
  fileCategories: Record<string, string>;
}
