/**
 * @fileoverview LLM Routing API Routes
 *
 * Endpoints for managing multi-provider LLM routing configuration,
 * monitoring provider health, and viewing usage metrics.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { llmRouterService } from '../services/llm-router.js';

const routeQuerySchema = z.object({
  taskType: z.string().default('code-review'),
  complexity: z.enum(['simple', 'moderate', 'complex', 'critical']).default('moderate'),
});

const strategyUpdateSchema = z.object({
  strategy: z.enum(['cost-optimized', 'quality-optimized', 'latency-optimized', 'air-gapped']),
});

export async function llmRoutingRoutes(app: FastifyInstance) {
  // Get current routing configuration
  app.get('/config', async () => {
    const config = llmRouterService.getConfig();
    return {
      strategy: config.strategy,
      defaultProvider: config.defaultProvider,
      providers: config.providers.map((p) => ({
        name: p.name,
        enabled: p.enabled,
        defaultModel: p.defaultModel,
        costPerInputToken: p.costPerInputToken,
        costPerOutputToken: p.costPerOutputToken,
        qualityScore: p.qualityScore,
      })),
      rules: config.rules,
      fallbackToMock: config.fallbackToMock,
      maxRetries: config.maxRetries,
    };
  });

  // Update routing strategy
  app.put<{ Body: z.infer<typeof strategyUpdateSchema> }>('/strategy', async (request) => {
    const { strategy } = strategyUpdateSchema.parse(request.body);
    llmRouterService.updateStrategy(strategy);
    return { success: true, strategy };
  });

  // Get routing decision for a task (dry-run)
  app.get<{ Querystring: z.infer<typeof routeQuerySchema> }>('/route', async (request) => {
    const query = routeQuerySchema.parse(request.query);
    const decision = llmRouterService.route(query.taskType, query.complexity);
    return decision;
  });

  // Get provider health status
  app.get('/health', async () => {
    return { providers: llmRouterService.getProviderHealth() };
  });

  // Get usage summary
  app.get<{ Querystring: { hours?: string } }>('/usage', async (request) => {
    const hours = parseInt(request.query.hours || '24', 10);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    return llmRouterService.getUsageSummary(since);
  });
}
