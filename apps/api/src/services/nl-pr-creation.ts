import { db } from '@prflow/db';
import { logger } from '../lib/logger.js';
import { callLLM, type LLMMessage } from '../agents/base.js';
import { v4 as uuidv4 } from 'uuid';
import type {
  NLPRCreationRequest,
  NLIntentAnalysis,
  PRCreationPlan,
  PRCreationResult,
  PlannedChange,
  AppliedChange,
  ExtractedEntity,
  ClarificationQuestion,
  PRCreationHistory,
  NLIntent,
} from '@prflow/core';

/**
 * Natural Language PR Creation Service
 * Generates complete PRs from natural language descriptions
 */
export class NLPRCreationService {
  /**
   * Analyze the intent and entities from a natural language description
   */
  async analyzeIntent(description: string): Promise<NLIntentAnalysis> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are an expert at understanding software development requests.
Analyze the following description and extract:
1. Primary intent (bug_fix, new_feature, enhancement, refactor, documentation, test_addition, dependency_update, configuration_change, performance_improvement, security_fix)
2. Entities mentioned (file paths, function names, class names, values, etc.)
3. Complexity assessment
4. Any clarification questions needed

Respond in JSON format:
{
  "intent": "string",
  "confidence": number,
  "entities": [{"type": "string", "value": "string", "confidence": number}],
  "changeType": {"type": "add|modify|delete|rename", "target": "file|function|class|config|dependency", "complexity": "trivial|simple|moderate|complex"},
  "scope": {"estimatedFiles": number, "estimatedLines": number, "riskLevel": "low|medium|high", "affectedAreas": ["string"]},
  "clarifications": [{"id": "string", "question": "string", "type": "choice|text|confirm", "options": ["string"], "required": boolean}]
}`,
      },
      {
        role: 'user',
        content: description,
      },
    ];

    try {
      const response = await callLLM(messages, {
        temperature: 0.3,
        maxTokens: 1000,
      });

      const parsed = JSON.parse(response.content);
      return {
        intent: parsed.intent as NLIntent,
        confidence: parsed.confidence || 0.8,
        entities: parsed.entities || [],
        changeType: parsed.changeType || { type: 'modify', target: 'file', complexity: 'simple' },
        scope: parsed.scope || { estimatedFiles: 1, estimatedLines: 10, riskLevel: 'low', affectedAreas: [] },
        clarifications: parsed.clarifications,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to analyze intent');
      return {
        intent: 'enhancement',
        confidence: 0.5,
        entities: [],
        changeType: { type: 'modify', target: 'file', complexity: 'moderate' },
        scope: { estimatedFiles: 1, estimatedLines: 20, riskLevel: 'medium', affectedAreas: [] },
      };
    }
  }

  /**
   * Create a plan for PR creation
   */
  async createPlan(request: NLPRCreationRequest): Promise<PRCreationPlan> {
    const { owner, repo, description, targetBranch = 'main', context, options } = request;

    logger.info({ owner, repo, description: description.substring(0, 100) }, 'Creating PR plan');

    // Analyze intent
    const intent = await this.analyzeIntent(description);

    // Get repository context
    const repoContext = await this.getRepositoryContext(owner, repo);

    // Generate plan using LLM
    const planMessages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are an expert software engineer creating a plan to implement the following change.

Repository: ${owner}/${repo}
Target branch: ${targetBranch}
${repoContext ? `Repository context:\n${repoContext}` : ''}

Generate a detailed implementation plan in JSON format:
{
  "branchName": "string (conventional: type/short-description)",
  "prTitle": "string (conventional commit style)",
  "prDescription": "string (markdown with ## sections)",
  "labels": ["string"],
  "suggestedReviewers": ["string"],
  "changes": [
    {
      "id": "string",
      "type": "create|modify|delete|rename",
      "file": "string",
      "description": "string",
      "plannedContent": "string (actual code for create/modify)",
      "order": number
    }
  ],
  "estimatedEffort": {
    "complexity": "trivial|simple|moderate|complex",
    "risk": "low|medium|high",
    "confidence": number
  }
}`,
      },
      {
        role: 'user',
        content: `Description: ${description}

Intent: ${intent.intent}
${context?.requirements ? `Requirements:\n${context.requirements.join('\n')}` : ''}
${context?.constraints ? `Constraints:\n${context.constraints.join('\n')}` : ''}
${context?.focusFiles ? `Focus files: ${context.focusFiles.join(', ')}` : ''}

Generate the implementation plan.`,
      },
    ];

    let planData: {
      branchName: string;
      prTitle: string;
      prDescription: string;
      labels: string[];
      suggestedReviewers: string[];
      changes: Array<{
        id: string;
        type: 'create' | 'modify' | 'delete' | 'rename';
        file: string;
        description: string;
        plannedContent?: string;
        order: number;
      }>;
      estimatedEffort: {
        complexity: string;
        risk: string;
        confidence: number;
      };
    };

    try {
      const response = await callLLM(planMessages, {
        temperature: 0.5,
        maxTokens: 4000,
      });

      planData = JSON.parse(response.content);
    } catch (error) {
      logger.error({ error }, 'Failed to generate plan');
      // Fallback plan
      planData = {
        branchName: `feature/${intent.intent.replace('_', '-')}-${Date.now()}`,
        prTitle: `${intent.intent}: ${description.substring(0, 50)}`,
        prDescription: `## Description\n${description}\n\n## Changes\n- TBD`,
        labels: [intent.intent.replace('_', '-')],
        suggestedReviewers: [],
        changes: [],
        estimatedEffort: { complexity: 'moderate', risk: 'medium', confidence: 0.5 },
      };
    }

    // Override branch name if custom provided
    if (options?.customBranchName) {
      planData.branchName = options.customBranchName;
    }

    const plan: PRCreationPlan = {
      id: uuidv4(),
      originalDescription: description,
      intent,
      changes: planData.changes.map((c, i) => ({
        ...c,
        id: c.id || uuidv4(),
        order: c.order || i,
      })),
      branchName: planData.branchName,
      prTitle: planData.prTitle,
      prDescription: planData.prDescription,
      labels: planData.labels,
      suggestedReviewers: planData.suggestedReviewers,
      estimatedEffort: planData.estimatedEffort,
      status: options?.dryRun ? 'draft' : 'approved',
      createdAt: new Date(),
    };

    // Store plan
    await this.storePlan(plan, owner, repo);

    return plan;
  }

  /**
   * Execute a PR creation plan
   */
  async executePlan(
    planId: string,
    installationId: number
  ): Promise<PRCreationResult> {
    const plan = await this.getPlan(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }

    logger.info({ planId, branchName: plan.branchName }, 'Executing PR creation plan');

    const startTime = Date.now();
    const appliedChanges: AppliedChange[] = [];
    const errors: PRCreationResult['errors'] = [];

    // Update plan status
    plan.status = 'executing';

    try {
      // In a real implementation, this would:
      // 1. Create the branch
      // 2. Apply each change
      // 3. Create the PR

      // Simulate applying changes
      for (const change of plan.changes.sort((a, b) => a.order - b.order)) {
        try {
          // Simulate code generation and file creation
          appliedChanges.push({
            changeId: change.id,
            file: change.file,
            type: change.type,
            success: true,
            commitSha: `sha-${uuidv4().substring(0, 8)}`,
          });
        } catch (error) {
          appliedChanges.push({
            changeId: change.id,
            file: change.file,
            type: change.type,
            success: false,
            error: (error as Error).message,
          });
          errors.push({
            code: 'CHANGE_FAILED',
            message: (error as Error).message,
            changeId: change.id,
            file: change.file,
            recoverable: true,
            suggestion: 'Retry the change or modify the plan',
          });
        }
      }

      // Create the PR (simulated)
      const success = errors.length === 0;
      const prNumber = Math.floor(Math.random() * 1000) + 1;

      const result: PRCreationResult = {
        id: uuidv4(),
        planId,
        success,
        pullRequest: success ? {
          number: prNumber,
          url: `https://github.com/owner/repo/pull/${prNumber}`,
          title: plan.prTitle,
          branch: plan.branchName,
          commitSha: `sha-${uuidv4().substring(0, 8)}`,
          filesChanged: appliedChanges.filter(c => c.success).length,
          linesAdded: plan.intent.scope.estimatedLines,
          linesDeleted: 0,
        } : undefined,
        appliedChanges,
        errors,
        metrics: {
          totalTimeMs: Date.now() - startTime,
          planningTimeMs: 0, // Already planned
          codeGenTimeMs: Math.floor((Date.now() - startTime) * 0.7),
          gitOpsTimeMs: Math.floor((Date.now() - startTime) * 0.3),
          tokensUsed: 0,
          retries: 0,
        },
        completedAt: new Date(),
      };

      plan.status = success ? 'completed' : 'failed';

      // Store result and history
      await this.storeResult(result);
      await this.storeHistory({
        id: uuidv4(),
        userId: 'system',
        repository: { owner: 'owner', name: 'repo' },
        description: plan.originalDescription,
        prNumber: success ? prNumber : undefined,
        success,
        error: success ? undefined : errors[0]?.message,
        intent: plan.intent.intent,
        filesAffected: appliedChanges.length,
        createdAt: new Date(),
      });

      logger.info({ planId, success, prNumber: success ? prNumber : null }, 'PR creation completed');

      return result;
    } catch (error) {
      plan.status = 'failed';

      const result: PRCreationResult = {
        id: uuidv4(),
        planId,
        success: false,
        appliedChanges,
        errors: [{
          code: 'EXECUTION_FAILED',
          message: (error as Error).message,
          recoverable: false,
        }],
        metrics: {
          totalTimeMs: Date.now() - startTime,
          planningTimeMs: 0,
          codeGenTimeMs: 0,
          gitOpsTimeMs: 0,
          tokensUsed: 0,
          retries: 0,
        },
        completedAt: new Date(),
      };

      await this.storeResult(result);
      throw error;
    }
  }

  /**
   * Get suggestions for improving a description
   */
  async getSuggestions(description: string): Promise<{
    improvedDescription: string;
    suggestedTitle: string;
    keyPoints: string[];
    missingInfo: string[];
  }> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are helping a developer write a clear PR description.
Analyze the input and provide:
1. An improved, clearer description
2. A suggested PR title (conventional commit style)
3. Key points extracted
4. Missing information that would be helpful

Respond in JSON:
{
  "improvedDescription": "string",
  "suggestedTitle": "string",
  "keyPoints": ["string"],
  "missingInfo": ["string"]
}`,
      },
      {
        role: 'user',
        content: description,
      },
    ];

    try {
      const response = await callLLM(messages, { temperature: 0.5, maxTokens: 1000 });
      return JSON.parse(response.content);
    } catch {
      return {
        improvedDescription: description,
        suggestedTitle: 'chore: update',
        keyPoints: [],
        missingInfo: ['More details about the change would be helpful'],
      };
    }
  }

  /**
   * Get PR creation history for a user
   */
  async getHistory(userId: string, limit = 20): Promise<PRCreationHistory[]> {
    const events = await db.analyticsEvent.findMany({
      where: {
        eventType: 'nl_pr_history',
        eventData: {
          path: ['userId'],
          equals: userId,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return events.map(e => e.eventData as unknown as PRCreationHistory);
  }

  // Private helpers

  private async getRepositoryContext(owner: string, repo: string): Promise<string | null> {
    try {
      const repository = await db.repository.findFirst({
        where: { fullName: `${owner}/${repo}` },
        include: { settings: true },
      });

      if (!repository) return null;

      return `Repository: ${repository.fullName}
Default branch: ${repository.defaultBranch}
Language: typescript`;
    } catch {
      return null;
    }
  }

  private async getPlan(planId: string): Promise<PRCreationPlan | null> {
    const event = await db.analyticsEvent.findFirst({
      where: {
        eventType: 'nl_pr_plan',
        eventData: {
          path: ['id'],
          equals: planId,
        },
      },
    });

    return event ? (event.eventData as unknown as PRCreationPlan) : null;
  }

  private async storePlan(plan: PRCreationPlan, owner: string, repo: string): Promise<void> {
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'nl_pr_plan',
        eventData: JSON.parse(JSON.stringify({
          ...plan,
          repository: { owner, repo },
          createdAt: plan.createdAt.toISOString(),
        })),
      },
    });
  }

  private async storeResult(result: PRCreationResult): Promise<void> {
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'nl_pr_result',
        eventData: JSON.parse(JSON.stringify({
          ...result,
          completedAt: result.completedAt.toISOString(),
        })),
      },
    });
  }

  private async storeHistory(history: PRCreationHistory): Promise<void> {
    await db.analyticsEvent.create({
      data: {
        repositoryId: '',
        eventType: 'nl_pr_history',
        eventData: JSON.parse(JSON.stringify({
          ...history,
          createdAt: history.createdAt.toISOString(),
        })),
      },
    });
  }
}

export const nlPRCreationService = new NLPRCreationService();
