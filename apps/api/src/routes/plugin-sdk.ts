/**
 * @fileoverview Plugin SDK Routes
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pluginSDKService } from '../services/plugin-sdk.js';

const executeSchema = z.object({
  diff: z.object({
    files: z.array(
      z.object({
        path: z.string(),
        status: z.string(),
        additions: z.number(),
        deletions: z.number(),
        patch: z.string().optional(),
      })
    ),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
  }),
  context: z.object({
    repositoryId: z.string(),
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    author: z.string(),
  }),
  config: z.record(z.unknown()).default({}),
});

export async function pluginSDKRoutes(app: FastifyInstance) {
  // List all plugins
  app.get<{ Querystring: { type?: string } }>('/list', async (request) => {
    return { plugins: pluginSDKService.listPlugins(request.query.type) };
  });

  // Get plugin manifest
  app.get<{ Params: { name: string } }>('/:name', async (request, reply) => {
    const manifest = pluginSDKService.getManifest(request.params.name);
    if (!manifest) {
      reply.status(404);
      return { error: 'Plugin not found' };
    }
    return manifest;
  });

  // Execute a specific plugin
  app.post<{ Params: { name: string }; Body: z.infer<typeof executeSchema> }>(
    '/:name/execute',
    async (request) => {
      const input = executeSchema.parse(request.body);
      return pluginSDKService.executePlugin(request.params.name, input);
    }
  );

  // Execute all enabled plugins
  app.post<{ Body: z.infer<typeof executeSchema> }>('/execute-all', async (request) => {
    const input = executeSchema.parse(request.body);
    return pluginSDKService.executeAll(input);
  });

  // Enable/disable a plugin
  app.put<{ Params: { name: string }; Body: { enabled: boolean } }>(
    '/:name/toggle',
    async (request) => {
      const success = pluginSDKService.setEnabled(request.params.name, request.body.enabled);
      return { success };
    }
  );

  // Unregister a plugin
  app.delete<{ Params: { name: string } }>('/:name', async (request) => {
    const success = pluginSDKService.unregisterPlugin(request.params.name);
    return { success };
  });
}
