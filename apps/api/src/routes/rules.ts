import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import {
  BUILTIN_RULES,
  parseRuleFromConfig,
  serializeRule,
  type CustomRule,
} from '../services/rules-engine.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const ruleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  conditions: z.array(
    z.object({
      type: z.enum([
        'file_pattern',
        'content_match',
        'file_extension',
        'change_type',
        'line_count',
        'function_name',
        'import_added',
        'dependency_added',
      ]),
      value: z.union([z.string(), z.number(), z.array(z.string())]),
      operator: z.enum(['equals', 'contains', 'matches', 'greater_than', 'less_than']).optional(),
      negate: z.boolean().optional(),
    })
  ),
  conditionLogic: z.enum(['AND', 'OR']).optional(),
  actions: z.array(
    z.object({
      type: z.enum(['warn', 'error', 'block', 'require_reviewer', 'add_label', 'suggest']),
      severity: z.enum(['critical', 'high', 'medium', 'low', 'nitpick']).optional(),
      category: z
        .enum([
          'security',
          'bug',
          'performance',
          'error_handling',
          'testing',
          'documentation',
          'style',
          'maintainability',
        ])
        .optional(),
      message: z.string(),
      suggestion: z.string().optional(),
      reviewer: z.string().optional(),
      label: z.string().optional(),
    })
  ),
  priority: z.number().optional(),
});

export async function rulesRoutes(app: FastifyInstance) {
  // List built-in rules
  app.get('/builtin', async () => {
    return {
      rules: BUILTIN_RULES.map(serializeRule),
    };
  });

  // List custom rules for repository
  app.get<{ Params: { owner: string; repo: string } }>(
    '/repositories/:owner/:repo',
    async (request) => {
      const { owner, repo } = request.params;
      const fullName = `${owner}/${repo}`;

      const repository = await db.repository.findUnique({
        where: { fullName },
        include: { settings: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', fullName);
      }

      const customRules = (repository.settings?.customRules as unknown[]) || [];

      return {
        repositoryId: repository.id,
        rules: customRules,
        builtinRulesEnabled: BUILTIN_RULES.filter((r) => r.enabled).map((r) => r.id),
      };
    }
  );

  // Create custom rule for repository
  app.post<{ Params: { owner: string; repo: string }; Body: z.infer<typeof ruleSchema> }>(
    '/repositories/:owner/:repo',
    async (request) => {
      const { owner, repo } = request.params;
      const body = ruleSchema.parse(request.body);
      const fullName = `${owner}/${repo}`;

      const repository = await db.repository.findUnique({
        where: { fullName },
        include: { settings: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', fullName);
      }

      const rule = parseRuleFromConfig({
        ...body,
        id: body.id || `custom-${Date.now()}`,
      });

      if (!rule) {
        throw new ValidationError('Invalid rule configuration');
      }

      const existingRules = ((repository.settings?.customRules ?? []) as unknown as CustomRule[]);
      const updatedRules = [...existingRules, rule];

      await db.repositorySettings.upsert({
        where: { repositoryId: repository.id },
        update: { customRules: JSON.parse(JSON.stringify(updatedRules)) },
        create: {
          repositoryId: repository.id,
          customRules: JSON.parse(JSON.stringify(updatedRules)),
        },
      });

      return { rule: serializeRule(rule) };
    }
  );

  // Update custom rule
  app.put<{
    Params: { owner: string; repo: string; ruleId: string };
    Body: z.infer<typeof ruleSchema>;
  }>('/repositories/:owner/:repo/:ruleId', async (request) => {
    const { owner, repo, ruleId } = request.params;
    const body = ruleSchema.parse(request.body);
    const fullName = `${owner}/${repo}`;

    const repository = await db.repository.findUnique({
      where: { fullName },
      include: { settings: true },
    });

    if (!repository) {
      throw new NotFoundError('Repository', fullName);
    }

    const existingRules = ((repository.settings?.customRules ?? []) as unknown as CustomRule[]);
    const ruleIndex = existingRules.findIndex((r) => r.id === ruleId);

    if (ruleIndex === -1) {
      throw new NotFoundError('Rule', ruleId);
    }

    const updatedRule = parseRuleFromConfig({ ...body, id: ruleId });
    if (!updatedRule) {
      throw new ValidationError('Invalid rule configuration');
    }

    existingRules[ruleIndex] = updatedRule;

    await db.repositorySettings.update({
      where: { repositoryId: repository.id },
      data: { customRules: JSON.parse(JSON.stringify(existingRules)) },
    });

    return { rule: serializeRule(updatedRule) };
  });

  // Delete custom rule
  app.delete<{ Params: { owner: string; repo: string; ruleId: string } }>(
    '/repositories/:owner/:repo/:ruleId',
    async (request) => {
      const { owner, repo, ruleId } = request.params;
      const fullName = `${owner}/${repo}`;

      const repository = await db.repository.findUnique({
        where: { fullName },
        include: { settings: true },
      });

      if (!repository) {
        throw new NotFoundError('Repository', fullName);
      }

      const existingRules = ((repository.settings?.customRules ?? []) as unknown as CustomRule[]);
      const filteredRules = existingRules.filter((r) => r.id !== ruleId);

      if (filteredRules.length === existingRules.length) {
        throw new NotFoundError('Rule', ruleId);
      }

      await db.repositorySettings.update({
        where: { repositoryId: repository.id },
        data: { customRules: JSON.parse(JSON.stringify(filteredRules)) },
      });

      return { deleted: true };
    }
  );

  // Toggle built-in rule
  app.post<{
    Params: { owner: string; repo: string };
    Body: { ruleId: string; enabled: boolean };
  }>('/repositories/:owner/:repo/toggle-builtin', async (request) => {
    const { owner, repo } = request.params;
    const { ruleId, enabled } = request.body;
    const fullName = `${owner}/${repo}`;

    const repository = await db.repository.findUnique({
      where: { fullName },
      include: { settings: true },
    });

    if (!repository) {
      throw new NotFoundError('Repository', fullName);
    }

    // Store builtin rule overrides in settings
    const currentSettings = repository.settings?.customRules as Record<string, unknown> || {};
    const builtinOverrides = (currentSettings.builtinOverrides as Record<string, boolean>) || {};
    builtinOverrides[ruleId] = enabled;

    await db.repositorySettings.upsert({
      where: { repositoryId: repository.id },
      update: {
        customRules: JSON.parse(JSON.stringify({
          ...currentSettings,
          builtinOverrides,
        })),
      },
      create: {
        repositoryId: repository.id,
        customRules: JSON.parse(JSON.stringify({ builtinOverrides })),
      },
    });

    return { ruleId, enabled };
  });

  // Test rules against a PR (dry-run evaluation)
  app.post<{
    Params: { owner: string; repo: string; prNumber: string };
    Body: { includeBuiltin?: boolean };
  }>('/repositories/:owner/:repo/evaluate/:prNumber', async (request) => {
    const { owner, repo, prNumber } = request.params;
    const { includeBuiltin = true } = request.body || {};
    const fullName = `${owner}/${repo}`;

    const repository = await db.repository.findUnique({
      where: { fullName },
      include: { settings: true, organization: true },
    });

    if (!repository) {
      throw new NotFoundError('Repository', fullName);
    }

    // Get custom rules
    const customRules = ((repository.settings?.customRules ?? []) as unknown as CustomRule[])
      .filter(r => r && typeof r === 'object' && 'id' in r);

    // Get builtin rule overrides
    const settingsObj = repository.settings?.customRules as Record<string, unknown> || {};
    const builtinOverrides = (settingsObj.builtinOverrides as Record<string, boolean>) || {};

    // Build rules list
    const allRules: CustomRule[] = [];
    
    if (includeBuiltin) {
      for (const rule of BUILTIN_RULES) {
        const isEnabled = builtinOverrides[rule.id] ?? rule.enabled;
        allRules.push({ ...rule, enabled: isEnabled });
      }
    }
    
    allRules.push(...customRules);

    // Get PR files from workflow or mock data
    const workflow = await db.pRWorkflow.findFirst({
      where: {
        repositoryId: repository.id,
        prNumber: parseInt(prNumber, 10),
      },
      include: { analysis: true },
    });

    // Create mock context if no workflow exists
    const mockFiles = workflow?.analysis ? [] : [
      {
        filename: 'src/example.ts',
        status: 'modified' as const,
        additions: 10,
        deletions: 5,
        changes: 15,
        patch: '+console.log("test")\n+const apiKey = "secret123"',
      },
    ];

    const context = {
      files: mockFiles,
      prTitle: workflow?.prTitle || 'Test PR',
      prBody: null,
      authorLogin: workflow?.authorLogin || 'test-user',
    };

    // Create and run engine
    const { RuleEngine } = await import('../services/rules-engine.js');
    const engine = new RuleEngine(allRules.filter(r => r.enabled));
    const results = engine.evaluate(context);
    const comments = engine.toReviewComments(results);

    return {
      prNumber: parseInt(prNumber, 10),
      rulesEvaluated: allRules.filter(r => r.enabled).length,
      matchedRules: results.filter(r => r.matched).length,
      results: results.map(r => ({
        ruleId: r.ruleId,
        ruleName: r.ruleName,
        matched: r.matched,
        file: r.file,
        line: r.line,
      })),
      comments: comments.map(c => ({
        file: c.file,
        line: c.line,
        severity: c.severity,
        category: c.category,
        message: c.message,
      })),
    };
  });

  // Validate rule configuration (without saving)
  app.post<{
    Body: z.infer<typeof ruleSchema>;
  }>('/validate', async (request, reply) => {
    try {
      const body = ruleSchema.parse(request.body);
      
      const rule = parseRuleFromConfig({
        ...body,
        id: body.id || 'validation-test',
      });

      if (!rule) {
        return reply.status(400).send({ 
          valid: false, 
          error: 'Failed to parse rule configuration' 
        });
      }

      // Test the rule against a sample file
      const { RuleEngine } = await import('../services/rules-engine.js');
      const engine = new RuleEngine([rule]);
      
      const testContext = {
        files: [{
          filename: 'test.ts',
          status: 'modified' as const,
          additions: 10,
          deletions: 5,
          changes: 15,
          patch: '+test content',
        }],
        prTitle: 'Test PR',
        prBody: null,
        authorLogin: 'test',
      };

      // Run evaluation to ensure rule doesn't throw
      engine.evaluate(testContext);

      return { 
        valid: true, 
        rule: serializeRule(rule),
        message: 'Rule configuration is valid',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return reply.status(400).send({ 
        valid: false, 
        error: errorMessage 
      });
    }
  });
}
