import { FastifyPluginAsync } from 'fastify';
import { prDescriptionGeneratorService } from '../services/pr-description-generator.js';
import { logger } from '../lib/logger.js';

/**
 * AI-Powered PR Description Generator routes
 */
export const prDescriptionRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Generate a PR description
   */
  fastify.post<{
    Body: {
      owner: string;
      repo: string;
      branch: string;
      baseBranch: string;
      commits: Array<{ sha: string; message: string; author: string; filesChanged: string[]; timestamp: string }>;
      diffSummary: { filesChanged: number; additions: number; deletions: number; fileTypes: Record<string, number> };
      linkedIssues?: Array<{ type: string; key: string; title: string; body?: string; url?: string }>;
      templateId?: string;
      preferredLength?: 'concise' | 'standard' | 'detailed';
    };
  }>('/generate', async (request, reply) => {
    try {
      const commits = request.body.commits.map(c => ({
        ...c,
        timestamp: new Date(c.timestamp),
      }));

      const description = await prDescriptionGeneratorService.generateDescription({
        ...request.body,
        commits,
      });

      return reply.send({ success: true, description });
    } catch (error) {
      logger.error({ error }, 'Failed to generate PR description');
      return reply.status(500).send({ success: false, error: 'Failed to generate description' });
    }
  });

  /**
   * Get available templates
   */
  fastify.get<{
    Querystring: { scope?: string };
  }>('/templates', async (request, reply) => {
    try {
      const templates = await prDescriptionGeneratorService.getTemplates(request.query.scope);

      return reply.send({ success: true, templates, total: templates.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get templates');
      return reply.status(500).send({ success: false, error: 'Failed to get templates' });
    }
  });

  /**
   * Create a custom template
   */
  fastify.post<{
    Body: {
      name: string;
      description: string;
      content: string;
      requiredSections: string[];
      optionalSections: string[];
      scope: string;
      createdBy: string;
    };
  }>('/templates', async (request, reply) => {
    try {
      const template = await prDescriptionGeneratorService.createTemplate(request.body);

      return reply.status(201).send({ success: true, template });
    } catch (error) {
      logger.error({ error }, 'Failed to create template');
      return reply.status(500).send({ success: false, error: 'Failed to create template' });
    }
  });

  /**
   * Regenerate a section
   */
  fastify.post<{
    Body: {
      sectionKey: string;
      context: { commits: Array<Record<string, unknown>>; diffSummary: Record<string, unknown> };
      instructions?: string;
    };
  }>('/regenerate-section', async (request, reply) => {
    try {
      const section = await prDescriptionGeneratorService.regenerateSection(request.body as unknown as Parameters<typeof prDescriptionGeneratorService.regenerateSection>[0]);

      return reply.send({ success: true, section });
    } catch (error) {
      logger.error({ error }, 'Failed to regenerate section');
      return reply.status(500).send({ success: false, error: 'Failed to regenerate section' });
    }
  });
};
