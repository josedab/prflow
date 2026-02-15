/**
 * @fileoverview Copilot Extensions Routes
 *
 * Handles @prflow skill invocations from GitHub Copilot Chat.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { copilotExtensionsService } from '../services/copilot-extensions.js';

const skillRequestSchema = z.object({
  skill: z.string(),
  parameters: z.record(z.unknown()).default({}),
  context: z.object({
    repository: z.object({ owner: z.string(), name: z.string() }).optional(),
    pullRequest: z.object({ number: z.number() }).optional(),
    file: z.object({ path: z.string() }).optional(),
    user: z.object({ login: z.string() }),
  }),
  conversationId: z.string().optional(),
});

export async function copilotExtensionsRoutes(app: FastifyInstance) {
  // Get the extension manifest
  app.get('/manifest', async () => {
    return copilotExtensionsService.getManifest();
  });

  // Handle skill invocations (main entry point for Copilot Chat)
  app.post<{ Body: z.infer<typeof skillRequestSchema> }>('/skills', async (request) => {
    const req = skillRequestSchema.parse(request.body);
    return copilotExtensionsService.handleSkill(req);
  });

  // Individual skill endpoints
  app.post<{ Body: z.infer<typeof skillRequestSchema> }>('/skills/review', async (request) => {
    const req = skillRequestSchema.parse(request.body);
    req.skill = 'review';
    return copilotExtensionsService.handleSkill(req);
  });

  app.post<{ Body: z.infer<typeof skillRequestSchema> }>('/skills/analyze', async (request) => {
    const req = skillRequestSchema.parse(request.body);
    req.skill = 'analyze';
    return copilotExtensionsService.handleSkill(req);
  });

  app.post<{ Body: z.infer<typeof skillRequestSchema> }>('/skills/test-gen', async (request) => {
    const req = skillRequestSchema.parse(request.body);
    req.skill = 'test-gen';
    return copilotExtensionsService.handleSkill(req);
  });

  app.post<{ Body: z.infer<typeof skillRequestSchema> }>('/skills/explain', async (request) => {
    const req = skillRequestSchema.parse(request.body);
    req.skill = 'explain';
    return copilotExtensionsService.handleSkill(req);
  });

  app.post<{ Body: z.infer<typeof skillRequestSchema> }>('/skills/risk', async (request) => {
    const req = skillRequestSchema.parse(request.body);
    req.skill = 'risk';
    return copilotExtensionsService.handleSkill(req);
  });
}
