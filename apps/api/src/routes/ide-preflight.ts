import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { idePreFlightService } from '../services/ide-preflight.js';
import { logger } from '../lib/logger.js';

const FileChangeSchema = z.object({
  path: z.string(),
  content: z.string(),
  originalContent: z.string().optional(),
  language: z.string(),
});

export async function idePreFlightRoutes(fastify: FastifyInstance) {
  /**
   * Run full pre-flight check on staged changes
   */
  fastify.post<{
    Body: {
      repositoryId?: string;
      branch: string;
      baseBranch: string;
      files: Array<{
        path: string;
        content: string;
        originalContent?: string;
        language: string;
      }>;
      options?: {
        includeSecurityScan?: boolean;
        includeCompliance?: boolean;
        includePrediction?: boolean;
        includeTestSuggestions?: boolean;
        complianceFrameworks?: string[];
        maxIssues?: number;
      };
    };
  }>('/ide/preflight', {
    schema: {
      body: z.object({
        repositoryId: z.string().optional(),
        branch: z.string(),
        baseBranch: z.string(),
        files: z.array(FileChangeSchema),
        options: z.object({
          includeSecurityScan: z.boolean().optional(),
          includeCompliance: z.boolean().optional(),
          includePrediction: z.boolean().optional(),
          includeTestSuggestions: z.boolean().optional(),
          complianceFrameworks: z.array(z.string()).optional(),
          maxIssues: z.number().min(1).max(500).optional(),
        }).optional(),
      }),
    },
  }, async (request, reply) => {
    try {
      const result = await idePreFlightService.runPreFlightCheck(request.body);

      return reply.send({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error({ error }, 'Pre-flight check failed');
      return reply.status(500).send({ error: 'Pre-flight check failed' });
    }
  });

  /**
   * Quick check for a single file
   */
  fastify.post<{
    Body: {
      path: string;
      content: string;
      originalContent?: string;
      language: string;
      includeAI?: boolean;
    };
  }>('/ide/preflight/file', {
    schema: {
      body: z.object({
        path: z.string(),
        content: z.string(),
        originalContent: z.string().optional(),
        language: z.string(),
        includeAI: z.boolean().optional(),
      }),
    },
  }, async (request, reply) => {
    const { path, content, originalContent, language, includeAI } = request.body;

    try {
      const result = await idePreFlightService.checkSingleFile(
        { path, content, originalContent, language },
        { includeAI }
      );

      return reply.send({
        success: true,
        result,
      });
    } catch (error) {
      logger.error({ error, path }, 'Single file check failed');
      return reply.status(500).send({ error: 'File check failed' });
    }
  });

  /**
   * Get quick status for IDE status bar
   */
  fastify.post<{
    Body: {
      files: Array<{
        path: string;
        content: string;
        language: string;
      }>;
    };
  }>('/ide/preflight/status', {
    schema: {
      body: z.object({
        files: z.array(z.object({
          path: z.string(),
          content: z.string(),
          language: z.string(),
        })),
      }),
    },
  }, async (request, reply) => {
    try {
      const status = await idePreFlightService.getQuickStatus(request.body.files);

      return reply.send({
        success: true,
        ...status,
      });
    } catch (error) {
      logger.error({ error }, 'Quick status check failed');
      return reply.status(500).send({ error: 'Status check failed' });
    }
  });

  /**
   * Clear cache for a repository
   */
  fastify.delete<{
    Params: { repositoryId: string };
  }>('/ide/preflight/cache/:repositoryId', {
    schema: {
      params: z.object({
        repositoryId: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { repositoryId } = request.params;

    idePreFlightService.clearCache(repositoryId);

    return reply.send({
      success: true,
      message: 'Cache cleared',
    });
  });

  /**
   * Health check for IDE connection
   */
  fastify.get('/ide/health', async (_request, reply) => {
    return reply.send({
      status: 'ok',
      version: '1.0.0',
      capabilities: [
        'preflight-check',
        'security-scan',
        'compliance-check',
        'test-suggestions',
        'prediction',
      ],
    });
  });

  logger.info('IDE pre-flight routes registered');
}
