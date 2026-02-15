/**
 * @fileoverview Multi-Tenancy & SaaS Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { multiTenancyService } from '../services/multi-tenancy.js';

const createTenantSchema = z.object({
  name: z.string(),
  slug: z.string(),
  ownerId: z.string(),
  plan: z.enum(['free', 'pro', 'team', 'enterprise']).optional(),
});

export async function multiTenancyRoutes(app: FastifyInstance) {
  app.post<{ Body: z.infer<typeof createTenantSchema> }>('/tenants', async (request) => {
    const data = createTenantSchema.parse(request.body);
    return multiTenancyService.createTenant(data);
  });

  app.get('/tenants', async () => {
    return multiTenancyService.listTenants();
  });

  app.get<{ Params: { tenantId: string } }>('/tenants/:tenantId', async (request) => {
    const tenant = multiTenancyService.getTenant(request.params.tenantId);
    if (!tenant) return { error: 'Tenant not found' };
    return tenant;
  });

  app.put<{ Params: { tenantId: string }; Body: { plan: 'free' | 'pro' | 'team' | 'enterprise' } }>(
    '/tenants/:tenantId/plan',
    async (request) => {
      const tenant = multiTenancyService.updatePlan(request.params.tenantId, request.body.plan);
      if (!tenant) return { error: 'Tenant not found' };
      return tenant;
    }
  );

  app.post<{ Params: { tenantId: string }; Body: { name: string; permissions?: string[] } }>(
    '/tenants/:tenantId/keys',
    async (request) => {
      try {
        return multiTenancyService.generateAPIKey(
          request.params.tenantId,
          request.body.name,
          request.body.permissions
        );
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
  );

  app.get<{ Params: { tenantId: string } }>('/tenants/:tenantId/keys', async (request) => {
    return multiTenancyService.listAPIKeys(request.params.tenantId);
  });

  app.delete<{ Params: { keyId: string } }>('/keys/:keyId', async (request) => {
    return { revoked: multiTenancyService.revokeAPIKey(request.params.keyId) };
  });

  app.post<{ Body: { key: string } }>('/validate-key', async (request) => {
    return multiTenancyService.validateAPIKey(request.body.key);
  });

  app.get<{ Params: { tenantId: string } }>('/tenants/:tenantId/capacity', async (request) => {
    return { hasCapacity: multiTenancyService.hasCapacity(request.params.tenantId) };
  });

  app.post<{
    Params: { tenantId: string };
    Body: { type: 'review' | 'llm_tokens' | 'storage'; amount: number };
  }>('/tenants/:tenantId/usage', async (request) => {
    const ok = multiTenancyService.trackUsage(
      request.params.tenantId,
      request.body.type,
      request.body.amount
    );
    return { success: ok };
  });

  app.post<{ Params: { tenantId: string }; Body: { start: string; end: string } }>(
    '/tenants/:tenantId/billing',
    async (request) => {
      return multiTenancyService.generateBillingRecord(
        request.params.tenantId,
        new Date(request.body.start),
        new Date(request.body.end)
      );
    }
  );
}
