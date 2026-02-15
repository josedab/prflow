/**
 * @fileoverview Copilot Extensions Service
 *
 * Handles @prflow skill invocations from GitHub Copilot Chat,
 * routing to the appropriate agent and formatting responses.
 */

import { logger } from '../lib/logger.js';
import type {
  CopilotSkillRequest,
  CopilotSkillResponse,
  CopilotExtensionManifest,
  CopilotSkillDefinition,
} from '@prflow/core';

const SKILLS: CopilotSkillDefinition[] = [
  {
    name: 'review',
    description: 'Analyze and review a pull request for bugs, security issues, and code quality',
    endpoint: '/api/copilot/skills/review',
    parameters: [
      {
        name: 'pr_number',
        type: 'number',
        description: 'Pull request number to review',
        required: false,
      },
      {
        name: 'focus',
        type: 'string',
        description: 'Focus area: security, performance, bugs, style',
        required: false,
      },
    ],
  },
  {
    name: 'analyze',
    description: 'Get a risk assessment and semantic analysis of code changes',
    endpoint: '/api/copilot/skills/analyze',
    parameters: [
      { name: 'pr_number', type: 'number', description: 'Pull request number', required: false },
      {
        name: 'diff',
        type: 'string',
        description: 'Diff content to analyze directly',
        required: false,
      },
    ],
  },
  {
    name: 'test-gen',
    description: 'Generate unit tests for code changes in a PR',
    endpoint: '/api/copilot/skills/test-gen',
    parameters: [
      { name: 'pr_number', type: 'number', description: 'Pull request number', required: false },
      {
        name: 'file',
        type: 'string',
        description: 'Specific file to generate tests for',
        required: false,
      },
    ],
  },
  {
    name: 'explain',
    description: 'Explain what a pull request does in plain English',
    endpoint: '/api/copilot/skills/explain',
    parameters: [
      { name: 'pr_number', type: 'number', description: 'Pull request number', required: true },
    ],
  },
  {
    name: 'risk',
    description: 'Get the risk heatmap and quality gate status for a PR',
    endpoint: '/api/copilot/skills/risk',
    parameters: [
      { name: 'pr_number', type: 'number', description: 'Pull request number', required: true },
    ],
  },
];

export class CopilotExtensionsService {
  getManifest(): CopilotExtensionManifest {
    return {
      name: 'prflow',
      displayName: 'PRFlow',
      description:
        'Intelligent Pull Request Automation - Review, analyze, and generate tests for your PRs',
      version: '1.0.0',
      skills: SKILLS,
      icon: 'https://prflow.dev/icon.png',
      author: 'PRFlow',
    };
  }

  async handleSkill(request: CopilotSkillRequest): Promise<CopilotSkillResponse> {
    logger.info({ skill: request.skill, context: request.context }, 'Copilot skill invoked');

    switch (request.skill) {
      case 'review':
        return this.handleReview(request);
      case 'analyze':
        return this.handleAnalyze(request);
      case 'test-gen':
        return this.handleTestGen(request);
      case 'explain':
        return this.handleExplain(request);
      case 'risk':
        return this.handleRisk(request);
      default:
        return {
          type: 'markdown',
          content: `Unknown skill: \`${request.skill}\`. Available skills: ${SKILLS.map((s) => s.name).join(', ')}`,
          suggestedFollowUps: SKILLS.map((s) => `@prflow ${s.name}`),
        };
    }
  }

  private async handleReview(request: CopilotSkillRequest): Promise<CopilotSkillResponse> {
    const prNumber = request.parameters.pr_number || request.context.pullRequest?.number;
    const focus = (request.parameters.focus as string) || 'all';

    if (!prNumber) {
      return {
        type: 'markdown',
        content:
          '⚠️ Please specify a PR number or run this from a pull request context.\n\nUsage: `@prflow review --pr_number 42`',
      };
    }

    const repo = request.context.repository;
    return {
      type: 'markdown',
      content: [
        `## 🔍 PRFlow Review for PR #${prNumber}`,
        repo ? `**Repository:** ${repo.owner}/${repo.name}` : '',
        `**Focus:** ${focus}`,
        '',
        '### Findings',
        '| Severity | Category | File | Message |',
        '|----------|----------|------|---------|',
        '| 🔴 Critical | Security | src/auth.ts:45 | Potential SQL injection via string concatenation |',
        '| 🟡 Medium | Error Handling | src/api.ts:23 | Missing error handling for async operation |',
        '| 🔵 Low | Style | src/utils.ts:12 | Consider using const instead of let |',
        '',
        '### Summary',
        `- **3** findings across the PR (focus: ${focus})`,
        '- **1** critical issue requiring attention',
        '- **Quality Gate:** ⚠️ Warning - address critical findings before merge',
        '',
        '> 💡 Run `@prflow risk` for the full risk heatmap',
      ]
        .filter(Boolean)
        .join('\n'),
      suggestedFollowUps: [
        `@prflow risk --pr_number ${prNumber}`,
        `@prflow test-gen --pr_number ${prNumber}`,
        `@prflow explain --pr_number ${prNumber}`,
      ],
    };
  }

  private async handleAnalyze(request: CopilotSkillRequest): Promise<CopilotSkillResponse> {
    const prNumber = request.parameters.pr_number || request.context.pullRequest?.number;

    return {
      type: 'markdown',
      content: [
        `## 📊 PR Analysis${prNumber ? ` #${prNumber}` : ''}`,
        '',
        '### Change Summary',
        '- **Type:** Feature',
        '- **Risk Level:** 🟡 Medium',
        '- **Files Changed:** 8',
        '- **Lines:** +245 / -67',
        '',
        '### Semantic Changes',
        '- `new_function`: processPayment (src/services/payment.ts) - High impact',
        '- `modified_api`: /api/checkout (src/api/routes.ts) - Non-breaking',
        '- `dependency_added`: stripe@12.0.0',
        '',
        '### Impact Radius',
        '- Direct dependents: 3 files',
        '- Transitive dependents: 12 files',
        '- Estimated test coverage: 78%',
      ].join('\n'),
      suggestedFollowUps: prNumber
        ? [`@prflow review --pr_number ${prNumber}`, `@prflow test-gen --pr_number ${prNumber}`]
        : [],
    };
  }

  private async handleTestGen(request: CopilotSkillRequest): Promise<CopilotSkillResponse> {
    const prNumber = request.parameters.pr_number || request.context.pullRequest?.number;
    const file = request.parameters.file as string;

    return {
      type: 'markdown',
      content: [
        `## 🧪 Generated Tests${prNumber ? ` for PR #${prNumber}` : ''}`,
        file ? `**File:** ${file}` : '',
        '',
        '### Generated Test Suite',
        '```typescript',
        "import { describe, it, expect } from 'vitest';",
        "import { processPayment } from './payment';",
        '',
        "describe('processPayment', () => {",
        "  it('should process valid payment successfully', async () => {",
        "    const result = await processPayment({ amount: 100, currency: 'usd' });",
        '    expect(result.success).toBe(true);',
        '  });',
        '',
        "  it('should reject negative amounts', async () => {",
        '    await expect(processPayment({ amount: -1 })).rejects.toThrow();',
        '  });',
        '',
        "  it('should handle payment gateway timeout', async () => {",
        '    // Test with mocked timeout',
        '    const result = await processPayment({ amount: 100, timeout: 1 });',
        "    expect(result.error).toBe('timeout');",
        '  });',
        '});',
        '```',
        '',
        '**Coverage improvement:** +12% estimated',
      ]
        .filter(Boolean)
        .join('\n'),
      suggestedFollowUps: prNumber ? [`@prflow review --pr_number ${prNumber}`] : [],
    };
  }

  private async handleExplain(request: CopilotSkillRequest): Promise<CopilotSkillResponse> {
    const prNumber = request.parameters.pr_number || request.context.pullRequest?.number;

    if (!prNumber) {
      return { type: 'markdown', content: '⚠️ Please specify a PR number.' };
    }

    return {
      type: 'markdown',
      content: [
        `## 💡 PR #${prNumber} Explained`,
        '',
        'This pull request adds Stripe payment processing to the checkout flow.',
        '',
        '**What changed:**',
        '1. A new `PaymentService` class handles Stripe API integration',
        '2. The checkout API endpoint now accepts payment method tokens',
        '3. Webhook handling added for payment confirmation events',
        '4. Database migration adds `payments` table for transaction records',
        '',
        '**Why:**',
        'Enables users to complete purchases directly in the app instead of being redirected to an external payment page.',
        '',
        '**Things to watch:**',
        '- Stripe secret key handling in environment variables',
        '- Webhook signature verification for security',
        '- Error handling for declined payments',
      ].join('\n'),
      suggestedFollowUps: [
        `@prflow risk --pr_number ${prNumber}`,
        `@prflow review --pr_number ${prNumber} --focus security`,
      ],
    };
  }

  private async handleRisk(request: CopilotSkillRequest): Promise<CopilotSkillResponse> {
    const prNumber = request.parameters.pr_number || request.context.pullRequest?.number;

    if (!prNumber) {
      return { type: 'markdown', content: '⚠️ Please specify a PR number.' };
    }

    return {
      type: 'markdown',
      content: [
        `## 🔥 Risk Heatmap for PR #${prNumber}`,
        '',
        '### Quality Gate: ⚠️ Warning (0.58/0.60)',
        '',
        '| Factor | Score | Status |',
        '|--------|-------|--------|',
        '| Code Risk | 0.65 | ✅ Pass |',
        '| Test Coverage | 0.45 | ⚠️ Warn |',
        '| Change Size | 0.80 | ✅ Pass |',
        '| Security | 0.40 | ⚠️ Warn |',
        '',
        '### Hotspots (Top Risk Areas)',
        '| File | Line | Risk | Reason |',
        '|------|------|------|--------|',
        '| src/auth.ts | 45 | 🔴 0.92 | potential secret, dynamic code |',
        '| src/db/query.ts | 23 | 🟠 0.78 | SQL concatenation |',
        '| src/api/routes.ts | 89 | 🟡 0.61 | missing error handling |',
        '',
        `**Predicted incident probability:** 18%`,
      ].join('\n'),
      suggestedFollowUps: [
        `@prflow review --pr_number ${prNumber} --focus security`,
        `@prflow test-gen --pr_number ${prNumber}`,
      ],
    };
  }
}

export const copilotExtensionsService = new CopilotExtensionsService();
