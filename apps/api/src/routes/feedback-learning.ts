/**
 * @fileoverview Feedback Learning Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { feedbackLearningService } from '../services/feedback-learning.js';

const feedbackSchema = z.object({
  organizationId: z.string(),
  repositoryId: z.string(),
  workflowId: z.string(),
  commentId: z.string(),
  rule: z.string(),
  category: z.string(),
  severity: z.string(),
  action: z.enum(['accepted', 'dismissed', 'false_positive', 'modified']),
  fileType: z.string().default('unknown'),
  language: z.string().default('unknown'),
});

export async function feedbackLearningRoutes(app: FastifyInstance) {
  // Record feedback on a review comment
  app.post<{ Body: z.infer<typeof feedbackSchema> }>('/feedback', async (request) => {
    const data = feedbackSchema.parse(request.body);
    feedbackLearningService.recordFeedback({
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      timestamp: new Date(),
    });
    return { success: true };
  });

  // Get learning stats for an org
  app.get<{ Params: { orgId: string } }>('/stats/:orgId', async (request) => {
    return feedbackLearningService.getStats(request.params.orgId);
  });

  // Get adaptive config for an org
  app.get<{ Params: { orgId: string } }>('/adaptive/:orgId', async (request) => {
    return feedbackLearningService.getAdaptiveConfig(request.params.orgId);
  });

  // Get confidence scores for an org
  app.get<{ Params: { orgId: string } }>('/confidence/:orgId', async (request) => {
    return feedbackLearningService.getConfidenceScores(request.params.orgId);
  });

  // Check if a specific rule should be suppressed
  app.get<{ Params: { orgId: string }; Querystring: { rule: string } }>(
    '/suppress/:orgId',
    async (request) => {
      const { orgId } = request.params;
      const { rule } = request.query;
      return {
        rule,
        suppressed: feedbackLearningService.shouldSuppress(orgId, rule),
        confidence: feedbackLearningService.getConfidence(orgId, rule),
      };
    }
  );
}
