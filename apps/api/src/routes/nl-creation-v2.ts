/**
 * @fileoverview NL PR Creation v2 Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { nlCreationV2Service } from '../services/nl-creation-v2.js';

const createRequestSchema = z.object({
  tenantId: z.string(),
  repositoryId: z.string(),
  description: z.string(),
});

export async function nlCreationV2Routes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof createRequestSchema> }>('/requests', async (request) => {
    const data = createRequestSchema.parse(request.body);
    return nlCreationV2Service.createRequest(data);
  });

  app.get<{ Params: { requestId: string } }>('/requests/:requestId', async (request) => {
    const req = nlCreationV2Service.getRequest(request.params.requestId);
    if (!req) return { error: 'Request not found' };
    return req;
  });

  app.post<{ Params: { requestId: string } }>('/requests/:requestId/plan', async (request) => {
    const plan = nlCreationV2Service.generatePlan(request.params.requestId);
    if (!plan) return { error: 'Request not found' };
    return plan;
  });

  app.post<{ Params: { requestId: string } }>('/requests/:requestId/generate', async (request) => {
    const files = nlCreationV2Service.generateCode(request.params.requestId);
    return { files, count: files.length };
  });

  app.post<{ Params: { requestId: string }; Body: { message: string } }>(
    '/requests/:requestId/message',
    async (request) => {
      const msg = nlCreationV2Service.addUserMessage(
        request.params.requestId,
        request.body.message
      );
      if (!msg) return { error: 'Request not found' };
      return msg;
    }
  );

  app.post<{ Params: { requestId: string } }>('/requests/:requestId/assemble', async (request) => {
    const result = nlCreationV2Service.assemble(request.params.requestId);
    if (!result) return { error: 'Request not found or plan not generated' };
    return result;
  });

  app.get<{ Params: { conversationId: string } }>(
    '/conversations/:conversationId',
    async (request) => {
      return nlCreationV2Service.getConversation(request.params.conversationId);
    }
  );

  app.get<{ Params: { orgId: string } }>('/stats/:orgId', async (request) => {
    return nlCreationV2Service.getStats(request.params.orgId);
  });
}
