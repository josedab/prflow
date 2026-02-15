/**
 * @fileoverview AI Confidence Calibration Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { confidenceCalibrationService } from '../services/confidence-calibration.js';

const outcomeSchema = z.object({
  workflowId: z.string(),
  repositoryId: z.string(),
  organizationId: z.string(),
  rule: z.string(),
  severity: z.string(),
  predictedConfidence: z.number().min(0).max(1),
  actualOutcome: z.enum(['true_positive', 'false_positive', 'true_negative', 'false_negative']),
  outcomeSource: z.enum(['feedback', 'revert', 'incident', 'hotfix']),
});

export async function confidenceCalibrationRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof outcomeSchema> }>('/outcomes', async (request) => {
    const data = outcomeSchema.parse(request.body);
    confidenceCalibrationService.recordOutcome({
      id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...data,
      predictedAt: new Date(),
      resolvedAt: new Date(),
    });
    return { success: true };
  });

  app.post<{ Body: { outcomes: z.infer<typeof outcomeSchema>[] } }>(
    '/outcomes/batch',
    async (request) => {
      const items = z.array(outcomeSchema).parse(request.body.outcomes);
      const outcomes = items.map((data) => ({
        id: `outcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        ...data,
        predictedAt: new Date(),
        resolvedAt: new Date(),
      }));
      confidenceCalibrationService.recordBatch(outcomes);
      return { recorded: outcomes.length };
    }
  );

  app.get<{ Params: { orgId: string } }>('/report/:orgId', async (request) => {
    return confidenceCalibrationService.generateReport(request.params.orgId);
  });

  app.get<{ Params: { orgId: string }; Querystring: { severity?: string; category?: string } }>(
    '/curve/:orgId',
    async (request) => {
      return confidenceCalibrationService.generateCalibrationCurve(request.params.orgId, {
        severity: request.query.severity,
        category: request.query.category,
      });
    }
  );

  app.post<{ Params: { orgId: string } }>('/fit/:orgId', async (request) => {
    return confidenceCalibrationService.fitPlattScaling(request.params.orgId);
  });

  app.post<{ Params: { orgId: string }; Body: { rawConfidence: number } }>(
    '/calibrate/:orgId',
    async (request) => {
      const { rawConfidence } = request.body;
      const calibrated = confidenceCalibrationService.calibrate(
        request.params.orgId,
        rawConfidence
      );
      return { rawConfidence, calibratedConfidence: calibrated };
    }
  );

  app.get<{ Params: { orgId: string }; Querystring: { rule: string } }>(
    '/badge/:orgId',
    async (request) => {
      return confidenceCalibrationService.getConfidenceBadge(
        request.params.orgId,
        request.query.rule
      );
    }
  );

  app.get<{ Params: { orgId: string } }>('/stats/:orgId', async (request) => {
    return confidenceCalibrationService.getOutcomeStats(request.params.orgId);
  });
}
