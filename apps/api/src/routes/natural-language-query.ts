import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { naturalLanguageQueryService } from '../services/natural-language-query.js';
import { logger } from '../lib/logger.js';

const repositoryParamsSchema = z.object({
  repositoryId: z.string(),
});

const queryBodySchema = z.object({
  query: z.string().min(3).max(500),
  limit: z.number().min(1).max(100).optional(),
});

const autocompleteQuerySchema = z.object({
  q: z.string().min(1).max(100),
});

export async function naturalLanguageQueryRoutes(app: FastifyInstance) {
  /**
   * Execute a natural language query
   */
  app.post<{
    Params: z.infer<typeof repositoryParamsSchema>;
    Body: z.infer<typeof queryBodySchema>;
  }>(
    '/repositories/:repositoryId/query',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      const { query, limit } = queryBodySchema.parse(request.body);

      try {
        const result = await naturalLanguageQueryService.executeQuery(repositoryId, query);

        return {
          success: true,
          query: {
            original: result.query.originalQuery,
            parsed: {
              type: result.query.type,
              intent: result.query.intent,
              confidence: Math.round(result.query.confidence * 100),
            },
            filters: result.query.filters,
          },
          results: result.results.slice(0, limit || 50).map((r) => ({
            prId: r.workflowId,
            prNumber: r.prNumber,
            title: r.title,
            author: r.author,
            status: r.status,
            riskLevel: r.riskLevel,
            createdAt: r.createdAt.toISOString(),
            relevance: Math.round(r.relevanceScore * 100),
            matchedFilters: r.matchedFilters,
          })),
          aggregation: result.aggregation,
          metadata: {
            totalCount: result.totalCount,
            executionTimeMs: result.executionTimeMs,
            suggestions: result.suggestions,
          },
        };
      } catch (error) {
        logger.error({ error, repositoryId, query }, 'Failed to execute query');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Query execution failed',
        });
      }
    }
  );

  /**
   * Parse a query without executing (for debugging/preview)
   */
  app.post<{
    Body: { query: string };
  }>(
    '/query/parse',
    async (request, reply) => {
      const { query } = request.body;

      if (!query || query.length < 3) {
        return reply.status(400).send({ error: 'Query must be at least 3 characters' });
      }

      try {
        const parsed = await naturalLanguageQueryService.parseQuery(query);

        return {
          success: true,
          parsed: {
            originalQuery: parsed.originalQuery,
            type: parsed.type,
            intent: parsed.intent,
            confidence: Math.round(parsed.confidence * 100),
            filters: parsed.filters,
            aggregation: parsed.aggregation,
            sortBy: parsed.sortBy,
            sortOrder: parsed.sortOrder,
          },
        };
      } catch (error) {
        logger.error({ error, query }, 'Failed to parse query');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Query parsing failed',
        });
      }
    }
  );

  /**
   * Get autocomplete suggestions
   */
  app.get<{
    Querystring: z.infer<typeof autocompleteQuerySchema>;
  }>(
    '/query/autocomplete',
    async (request) => {
      const { q } = autocompleteQuerySchema.parse(request.query);

      const suggestions = naturalLanguageQueryService.getAutocompleteSuggestions(q);

      return {
        success: true,
        query: q,
        suggestions: suggestions.map((s) => ({
          text: s.text,
          description: s.description,
          type: s.type,
        })),
      };
    }
  );

  /**
   * Get example queries
   */
  app.get(
    '/query/examples',
    async () => {
      const examples = naturalLanguageQueryService.getExampleQueries();

      return {
        success: true,
        examples,
        categories: [
          { name: 'Basic Search', examples: examples.slice(0, 3) },
          { name: 'Advanced Filters', examples: examples.slice(3, 6) },
          { name: 'Aggregations', examples: examples.slice(6) },
        ],
      };
    }
  );

  /**
   * Batch query execution
   */
  app.post<{
    Params: z.infer<typeof repositoryParamsSchema>;
    Body: { queries: string[] };
  }>(
    '/repositories/:repositoryId/query/batch',
    async (request, reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      const { queries } = request.body;

      if (!queries || queries.length === 0 || queries.length > 10) {
        return reply.status(400).send({ error: 'Provide 1-10 queries' });
      }

      try {
        const results = await Promise.all(
          queries.map(async (query) => {
            try {
              const result = await naturalLanguageQueryService.executeQuery(repositoryId, query);
              return {
                query,
                success: true,
                resultCount: result.totalCount,
                topResults: result.results.slice(0, 5),
              };
            } catch (error) {
              return {
                query,
                success: false,
                error: error instanceof Error ? error.message : 'Query failed',
              };
            }
          })
        );

        return {
          success: true,
          repositoryId,
          results,
          summary: {
            total: queries.length,
            successful: results.filter((r) => r.success).length,
            failed: results.filter((r) => !r.success).length,
          },
        };
      } catch (error) {
        logger.error({ error, repositoryId }, 'Failed to execute batch queries');
        return reply.status(500).send({
          error: error instanceof Error ? error.message : 'Batch query failed',
        });
      }
    }
  );

  /**
   * Save a query for later use
   */
  app.post<{
    Params: z.infer<typeof repositoryParamsSchema>;
    Body: {
      name: string;
      query: string;
      description?: string;
    };
  }>(
    '/repositories/:repositoryId/query/saved',
    async (request, _reply) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);
      const { name, query, description } = request.body;

      // In a full implementation, this would save to the database
      // For now, we return a mock response
      logger.info({ repositoryId, name, query }, 'Saving query');

      return {
        success: true,
        savedQuery: {
          id: `sq_${Date.now()}`,
          name,
          query,
          description,
          repositoryId,
          createdAt: new Date().toISOString(),
        },
      };
    }
  );

  /**
   * Get query history (recent queries)
   */
  app.get<{
    Params: z.infer<typeof repositoryParamsSchema>;
  }>(
    '/repositories/:repositoryId/query/history',
    async (request) => {
      const { repositoryId } = repositoryParamsSchema.parse(request.params);

      // In a full implementation, this would fetch from database
      // For now, return empty with example structure
      return {
        success: true,
        repositoryId,
        history: [],
        note: 'Query history tracking is available in the full version',
      };
    }
  );

  logger.info('Natural language query routes registered');
}
