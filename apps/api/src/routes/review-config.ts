/**
 * @fileoverview Review-as-Code Configuration Routes
 */

import type { FastifyInstance } from 'fastify';
import { reviewConfigService } from '../services/review-config.js';

export async function reviewConfigRoutes(app: FastifyInstance) {
  // Validate a .prflowrc config
  app.post<{ Body: { content: string } }>('/validate', async (request) => {
    const { content } = request.body;
    return reviewConfigService.validateConfig(content);
  });

  // Parse and return effective config
  app.post<{ Body: { orgConfig?: string; repoConfig?: string; repositoryId?: string } }>(
    '/effective',
    async (request) => {
      const { orgConfig, repoConfig, repositoryId } = request.body;
      return reviewConfigService.getEffectiveConfig(
        repositoryId || 'default',
        orgConfig,
        repoConfig
      );
    }
  );

  // Get JSON Schema for IDE autocompletion
  app.get('/schema', async () => {
    return reviewConfigService.getJsonSchema();
  });

  // Clear config cache
  app.delete<{ Params: { repositoryId: string } }>('/cache/:repositoryId', async (request) => {
    reviewConfigService.clearCache(request.params.repositoryId);
    return { success: true };
  });

  // Get default config
  app.get('/defaults', async () => {
    return reviewConfigService.getEffectiveConfig('defaults');
  });
}
