/**
 * @fileoverview Runbook Service
 * 
 * Service for generating and managing deployment runbooks.
 */

import { db } from '@prflow/db';
import { GitHubClient } from '@prflow/github-client';
import { RunbookGeneratorAgent, type RunbookAgentInput } from '../agents/runbook.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dbAny = db as any; // Temporary cast until prisma generate is run with new models

import type { DeploymentRunbook, RunbookGenerationRequest, RunbookTemplate } from '@prflow/core';

/**
 * Create GitHub client for a repository
 */
function getGitHubClient(installationId: number): GitHubClient {
  return new GitHubClient({
    appId: process.env.GITHUB_APP_ID || '',
    privateKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    installationId,
  });
}

/**
 * Get raw octokit for operations not exposed by the client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOctokit(github: GitHubClient): any {
  return (github as unknown as { octokit: unknown }).octokit;
}

interface GitHubFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

interface GitHubCommit {
  sha: string;
  commit: { message: string };
}

export class RunbookService {
  private agent = new RunbookGeneratorAgent();

  /**
   * Generate a runbook for a PR
   */
  async generateRunbook(request: RunbookGenerationRequest): Promise<DeploymentRunbook> {
    const { owner, repo, prNumber, environment, templateId, notes } = request;
    
    // Get repository for installationId
    const repoFullName = `${owner}/${repo}`;
    const repository = await db.repository.findFirst({
      where: { fullName: repoFullName },
    });
    
    if (!repository) {
      throw new Error(`Repository ${repoFullName} not found`);
    }
    
    const installationId = (repository as { installationId?: number }).installationId || 0;
    const github = getGitHubClient(installationId);

    // Get PR details
    const { data: pr } = await getOctokit(github).pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get files changed
    const { data: files } = await getOctokit(github).pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Get commits
    const { data: commits } = await getOctokit(github).pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
    });

    // Build agent input
    const agentInput: RunbookAgentInput = {
      prTitle: pr.title,
      prBody: pr.body || '',
      prNumber,
      repository: { owner, name: repo },
      files: (files as GitHubFile[]).map((f: GitHubFile) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      })),
      commits: (commits as GitHubCommit[]).map((c: GitHubCommit) => ({
        message: c.commit.message,
        sha: c.sha,
      })),
      environment,
    };

    // Generate runbook (agent doesn't use context, passing minimal placeholder)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await this.agent.execute(agentInput, {} as any);

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to generate runbook');
    }

    // The agent returns data with a runbook property
    const runbook = (result.data as unknown as { runbook: DeploymentRunbook }).runbook;

    // Store runbook
    await this.storeRunbook(runbook);

    return runbook;
  }

  /**
   * Store runbook in database
   */
  private async storeRunbook(runbook: DeploymentRunbook): Promise<void> {
    await dbAny.deploymentRunbook.create({
      data: {
        id: runbook.id,
        owner: runbook.repository.owner,
        repo: runbook.repository.name,
        prNumber: runbook.prNumber,
        prTitle: runbook.prTitle,
        environment: runbook.environment,
        riskLevel: runbook.riskAssessment.level,
        estimatedMinutes: runbook.estimatedTotalMinutes,
        runbook: runbook as any,
        generatedAt: runbook.generatedAt,
      },
    });
  }

  /**
   * Get runbook by ID
   */
  async getRunbook(id: string): Promise<DeploymentRunbook | null> {
    const record = await dbAny.deploymentRunbook.findUnique({ where: { id } });
    if (!record) return null;
    return record.runbook as unknown as DeploymentRunbook;
  }

  /**
   * Get runbooks for a PR
   */
  async getRunbooksForPR(owner: string, repo: string, prNumber: number): Promise<DeploymentRunbook[]> {
    const records = await dbAny.deploymentRunbook.findMany({
      where: { owner, repo, prNumber },
      orderBy: { generatedAt: 'desc' },
    });
    return records.map((r: { runbook: unknown }) => r.runbook as unknown as DeploymentRunbook);
  }

  /**
   * Get latest runbook for a PR and environment
   */
  async getLatestRunbook(
    owner: string,
    repo: string,
    prNumber: number,
    environment: string
  ): Promise<DeploymentRunbook | null> {
    const record = await dbAny.deploymentRunbook.findFirst({
      where: { owner, repo, prNumber, environment },
      orderBy: { generatedAt: 'desc' },
    });
    if (!record) return null;
    return record.runbook as unknown as DeploymentRunbook;
  }

  /**
   * Update checklist item
   */
  async updateChecklistItem(
    runbookId: string,
    itemId: string,
    checked: boolean
  ): Promise<DeploymentRunbook | null> {
    const record = await dbAny.deploymentRunbook.findUnique({ where: { id: runbookId } });
    if (!record) return null;

    const runbook = record.runbook as unknown as DeploymentRunbook;
    const item = runbook.checklist.find((i) => i.id === itemId);
    if (item) {
      item.checked = checked;
    }

    await dbAny.deploymentRunbook.update({
      where: { id: runbookId },
      data: { runbook: runbook as any },
    });

    return runbook;
  }

  /**
   * Get runbook templates
   */
  async getTemplates(repositoryId?: string): Promise<RunbookTemplate[]> {
    const templates = await dbAny.runbookTemplate.findMany({
      where: repositoryId ? { repositoryId } : { repositoryId: null },
      orderBy: { name: 'asc' },
    });

    interface TemplateRecord {
      id: string;
      name: string;
      description: string;
      environment: string;
      defaultSteps: unknown[];
      defaultChecklist: unknown[];
      requiredApprovers: number;
      active: boolean;
    }

    return templates.map((t: TemplateRecord) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      environment: t.environment,
      defaultSteps: t.defaultSteps as unknown[],
      defaultChecklist: t.defaultChecklist as unknown[],
      requiredApprovers: t.requiredApprovers,
      active: t.active,
    }));
  }

  /**
   * Create a runbook template
   */
  async createTemplate(template: Omit<RunbookTemplate, 'id'>, repositoryId?: string): Promise<RunbookTemplate> {
    const record = await dbAny.runbookTemplate.create({
      data: {
        name: template.name,
        description: template.description,
        environment: template.environment,
        defaultSteps: template.defaultSteps as any,
        defaultChecklist: template.defaultChecklist as any,
        requiredApprovers: template.requiredApprovers,
        active: template.active,
        repositoryId,
      },
    });

    return {
      id: record.id,
      ...template,
    };
  }

  /**
   * Export runbook as markdown
   */
  exportAsMarkdown(runbook: DeploymentRunbook): string {
    const lines: string[] = [];

    lines.push(`# Deployment Runbook: PR #${runbook.prNumber}`);
    lines.push('');
    lines.push(`**Title:** ${runbook.prTitle}`);
    lines.push(`**Environment:** ${runbook.environment}`);
    lines.push(`**Generated:** ${runbook.generatedAt.toISOString()}`);
    lines.push(`**Estimated Duration:** ${runbook.estimatedTotalMinutes} minutes`);
    lines.push('');

    // Risk Assessment
    lines.push('## Risk Assessment');
    lines.push('');
    lines.push(`**Overall Risk:** ${runbook.riskAssessment.level.toUpperCase()}`);
    lines.push(`**Recommended Window:** ${runbook.riskAssessment.recommendedWindow}`);
    lines.push('');
    
    if (runbook.riskAssessment.factors.length > 0) {
      lines.push('### Risk Factors');
      for (const factor of runbook.riskAssessment.factors) {
        lines.push(`- **${factor.name}** (${factor.severity}): ${factor.description}`);
      }
      lines.push('');
    }

    if (runbook.riskAssessment.mitigations.length > 0) {
      lines.push('### Mitigations');
      for (const m of runbook.riskAssessment.mitigations) {
        lines.push(`- ${m}`);
      }
      lines.push('');
    }

    // Prerequisites
    lines.push('## Prerequisites');
    lines.push('');
    for (const prereq of runbook.prerequisites) {
      lines.push(`- [ ] ${prereq}`);
    }
    lines.push('');

    // Steps
    lines.push('## Deployment Steps');
    lines.push('');
    for (const step of runbook.steps) {
      lines.push(`### Step ${step.order}: ${step.title}`);
      lines.push('');
      lines.push(`**Type:** ${step.type} | **Risk:** ${step.riskLevel} | **Est. Time:** ${step.estimatedMinutes} min`);
      if (step.requiresApproval) {
        lines.push('**⚠️ Requires Approval**');
      }
      lines.push('');
      lines.push(step.description);
      lines.push('');

      if (step.commands && step.commands.length > 0) {
        lines.push('**Commands:**');
        lines.push('```bash');
        for (const cmd of step.commands) {
          lines.push(cmd);
        }
        lines.push('```');
        lines.push('');
      }

      if (step.verification && step.verification.length > 0) {
        lines.push('**Verification:**');
        for (const v of step.verification) {
          lines.push(`- [ ] ${v}`);
        }
        lines.push('');
      }

      if (step.rollback && step.rollback.length > 0) {
        lines.push('<details>');
        lines.push('<summary>Rollback</summary>');
        lines.push('');
        lines.push('```bash');
        for (const cmd of step.rollback) {
          lines.push(cmd);
        }
        lines.push('```');
        lines.push('</details>');
        lines.push('');
      }
    }

    // Rollback Plan
    lines.push('## Rollback Plan');
    lines.push('');
    lines.push(`**Can Auto-Rollback:** ${runbook.rollbackPlan.canAutoRollback ? 'Yes' : 'No'}`);
    lines.push(`**Estimated Rollback Time:** ${runbook.rollbackPlan.estimatedMinutes} min`);
    lines.push('');
    lines.push('### Triggers');
    for (const trigger of runbook.rollbackPlan.triggers) {
      lines.push(`- ${trigger}`);
    }
    lines.push('');

    // Contacts
    lines.push('## Contacts');
    lines.push('');
    lines.push('| Role | Contact | Escalation |');
    lines.push('|------|---------|------------|');
    for (const contact of runbook.contacts) {
      lines.push(`| ${contact.role} | ${contact.contact} | ${contact.escalation || '-'} |`);
    }
    lines.push('');

    // Checklist
    lines.push('## Deployment Checklist');
    lines.push('');
    lines.push('### Pre-Deployment');
    for (const item of runbook.checklist.filter((i) => i.category === 'pre')) {
      lines.push(`- [ ] ${item.description}${item.required ? ' *' : ''}`);
    }
    lines.push('');
    lines.push('### During Deployment');
    for (const item of runbook.checklist.filter((i) => i.category === 'during')) {
      lines.push(`- [ ] ${item.description}${item.required ? ' *' : ''}`);
    }
    lines.push('');
    lines.push('### Post-Deployment');
    for (const item of runbook.checklist.filter((i) => i.category === 'post')) {
      lines.push(`- [ ] ${item.description}${item.required ? ' *' : ''}`);
    }
    lines.push('');
    lines.push('*\\* Required*');

    return lines.join('\n');
  }
}
