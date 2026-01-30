import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { db } from '@prflow/db';
import { learningService } from '../services/learning.js';
import { requireAuth } from '../lib/auth.js';
import { NotFoundError } from '../lib/errors.js';

const repositoryIdParamsSchema = z.object({
  repositoryId: z.string(),
});

const workflowIdParamsSchema = z.object({
  workflowId: z.string(),
});

const feedbackBodySchema = z.object({
  commentId: z.string(),
  feedbackType: z.enum(['ACCEPTED', 'REJECTED', 'MODIFIED', 'DISMISSED', 'FALSE_POSITIVE']),
  originalSuggestion: z.string().optional(),
  userAction: z.string().optional(),
});

const getPatternsQuerySchema = z.object({
  patternType: z.enum([
    'NAMING_CONVENTION',
    'CODE_STYLE',
    'ERROR_HANDLING',
    'TEST_PATTERN',
    'DOCUMENTATION',
    'SECURITY',
    'ARCHITECTURE',
    'API_DESIGN',
  ]).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

const addRuleBodySchema = z.object({
  type: z.enum([
    'NAMING_CONVENTION',
    'CODE_STYLE',
    'ERROR_HANDLING',
    'TEST_PATTERN',
    'DOCUMENTATION',
    'SECURITY',
    'ARCHITECTURE',
    'API_DESIGN',
  ]),
  description: z.string().min(1).max(500),
  pattern: z.string().min(1).max(500),
  severity: z.enum(['error', 'warning', 'info']),
  autoFix: z.string().optional(),
  enabled: z.boolean().default(true),
});

const updateRuleBodySchema = addRuleBodySchema.partial();

const ruleIdParamsSchema = z.object({
  repositoryId: z.string(),
  ruleId: z.string(),
});

const analyzeBodySchema = z.object({
  files: z.array(z.object({
    filename: z.string(),
    content: z.string().optional(),
  })).min(1).max(1000),
});

const getRelevantPatternsQuerySchema = z.object({
  file: z.string(),
  category: z.string().optional(),
});

export async function learningRoutes(app: FastifyInstance) {
  // Get codebase context for a repository
  app.get<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/context/:repositoryId',
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);

      const context = await learningService.getCodebaseContext(params.repositoryId);
      return context;
    }
  );

  // Record user feedback on a review comment
  app.post<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Body: z.infer<typeof feedbackBodySchema>;
  }>(
    '/feedback/:repositoryId',
    { preHandler: [requireAuth] },
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);
      const body = feedbackBodySchema.parse(request.body);

      // Verify comment exists
      const comment = await db.reviewComment.findUnique({
        where: { id: body.commentId },
      });

      if (!comment) {
        throw new NotFoundError('Comment', body.commentId);
      }

      await learningService.recordFeedback(params.repositoryId, body);

      return {
        success: true,
        message: 'Feedback recorded successfully',
      };
    }
  );

  // Learn from a completed workflow
  app.post<{ Params: z.infer<typeof workflowIdParamsSchema> }>(
    '/learn/:workflowId',
    { preHandler: [requireAuth] },
    async (request) => {
      const params = workflowIdParamsSchema.parse(request.params);

      const result = await learningService.learnFromWorkflow(params.workflowId);
      return {
        success: true,
        ...result,
      };
    }
  );

  // Get learned patterns for a repository
  app.get<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Querystring: z.infer<typeof getPatternsQuerySchema>;
  }>(
    '/patterns/:repositoryId',
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);
      const query = getPatternsQuerySchema.parse(request.query);

      const patterns = await learningService.getLearnedPatterns(params.repositoryId, {
        patternType: query.patternType,
        minConfidence: query.minConfidence,
        limit: query.limit,
      });

      return {
        repositoryId: params.repositoryId,
        patterns,
        total: patterns.length,
      };
    }
  );

  // Get relevant patterns for a specific file
  app.get<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Querystring: z.infer<typeof getRelevantPatternsQuerySchema>;
  }>(
    '/patterns/:repositoryId/relevant',
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);
      const query = getRelevantPatternsQuerySchema.parse(request.query);

      const patterns = await learningService.getRelevantPatterns(
        params.repositoryId,
        query.file,
        query.category as Parameters<typeof learningService.getRelevantPatterns>[2]
      );

      return {
        repositoryId: params.repositoryId,
        file: query.file,
        patterns,
      };
    }
  );

  // Get feedback statistics
  app.get<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/stats/:repositoryId',
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);

      const stats = await learningService.getFeedbackStats(params.repositoryId);

      return {
        repositoryId: params.repositoryId,
        ...stats,
      };
    }
  );

  // Add a convention rule
  app.post<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Body: z.infer<typeof addRuleBodySchema>;
  }>(
    '/rules/:repositoryId',
    { preHandler: [requireAuth] },
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);
      const body = addRuleBodySchema.parse(request.body);

      const rule = await learningService.addConventionRule(params.repositoryId, body);

      return {
        success: true,
        rule,
      };
    }
  );

  // Update a convention rule
  app.patch<{
    Params: z.infer<typeof ruleIdParamsSchema>;
    Body: z.infer<typeof updateRuleBodySchema>;
  }>(
    '/rules/:repositoryId/:ruleId',
    { preHandler: [requireAuth] },
    async (request) => {
      const params = ruleIdParamsSchema.parse(request.params);
      const body = updateRuleBodySchema.parse(request.body);

      const rule = await learningService.updateConventionRule(
        params.repositoryId,
        params.ruleId,
        body
      );

      if (!rule) {
        throw new NotFoundError('Rule', params.ruleId);
      }

      return {
        success: true,
        rule,
      };
    }
  );

  // Delete a convention rule
  app.delete<{ Params: z.infer<typeof ruleIdParamsSchema> }>(
    '/rules/:repositoryId/:ruleId',
    { preHandler: [requireAuth] },
    async (request) => {
      const params = ruleIdParamsSchema.parse(request.params);

      const deleted = await learningService.deleteConventionRule(
        params.repositoryId,
        params.ruleId
      );

      if (!deleted) {
        throw new NotFoundError('Rule', params.ruleId);
      }

      return {
        success: true,
        message: 'Rule deleted successfully',
      };
    }
  );

  // Get all convention rules for a repository
  app.get<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/rules/:repositoryId',
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);

      const context = await learningService.getCodebaseContext(params.repositoryId);

      return {
        repositoryId: params.repositoryId,
        rules: context.conventionRules,
        total: context.conventionRules.length,
      };
    }
  );

  // Analyze a repository to detect frameworks and suggest rules
  app.post<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Body: z.infer<typeof analyzeBodySchema>;
  }>(
    '/analyze/:repositoryId',
    { preHandler: [requireAuth] },
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);
      const body = analyzeBodySchema.parse(request.body);

      const result = await learningService.analyzeRepository(params.repositoryId, body.files);

      return {
        repositoryId: params.repositoryId,
        ...result,
      };
    }
  );

  // Get learning summary for a repository
  app.get<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/summary/:repositoryId',
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);

      const [context, stats, patterns] = await Promise.all([
        learningService.getCodebaseContext(params.repositoryId),
        learningService.getFeedbackStats(params.repositoryId),
        learningService.getLearnedPatterns(params.repositoryId, { limit: 10 }),
      ]);

      return {
        repositoryId: params.repositoryId,
        codebaseInfo: {
          frameworks: context.detectedFrameworks,
          languages: context.detectedLanguages,
          testFramework: context.testFramework,
        },
        learningProgress: {
          totalPatterns: Object.values(context.learnedPatterns).flat().length,
          totalRules: context.conventionRules.length,
          enabledRules: context.conventionRules.filter((r) => r.enabled).length,
        },
        feedbackStats: {
          total: stats.total,
          acceptanceRate: stats.acceptanceRate,
          falsePositiveRate: stats.falsePositiveRate,
        },
        topPatterns: patterns.slice(0, 5).map((p) => ({
          type: p.patternType,
          confidence: p.confidence,
          frequency: p.frequency,
        })),
      };
    }
  );

  // Bulk import convention rules
  app.post<{
    Params: z.infer<typeof repositoryIdParamsSchema>;
    Body: { rules: z.infer<typeof addRuleBodySchema>[] };
  }>(
    '/rules/:repositoryId/import',
    { preHandler: [requireAuth] },
    async (request, _reply) => {
      const params = repositoryIdParamsSchema.parse(request.params);
      const body = z.object({
        rules: z.array(addRuleBodySchema).min(1).max(100),
      }).parse(request.body);

      const imported: string[] = [];
      const failed: Array<{ rule: unknown; error: string }> = [];

      for (const rule of body.rules) {
        try {
          const created = await learningService.addConventionRule(params.repositoryId, rule);
          imported.push(created.id);
        } catch (error) {
          failed.push({ rule, error: (error as Error).message });
        }
      }

      return {
        success: failed.length === 0,
        imported: imported.length,
        failed: failed.length,
        details: failed.length > 0 ? { failed } : undefined,
      };
    }
  );

  // Export convention rules
  app.get<{ Params: z.infer<typeof repositoryIdParamsSchema> }>(
    '/rules/:repositoryId/export',
    async (request) => {
      const params = repositoryIdParamsSchema.parse(request.params);

      const context = await learningService.getCodebaseContext(params.repositoryId);

      return {
        repositoryId: params.repositoryId,
        exportedAt: new Date().toISOString(),
        rules: context.conventionRules.map((r) => ({
          type: r.type,
          description: r.description,
          pattern: r.pattern,
          severity: r.severity,
          autoFix: r.autoFix,
          enabled: r.enabled,
        })),
      };
    }
  );
}
