import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { auditLogger } from '../services/audit.js';

const auditQuerySchema = z.object({
  repositoryId: z.string().optional(),
  organizationId: z.string().optional(),
  actorLogin: z.string().optional(),
  eventTypes: z.string().optional().transform((s) => s?.split(',') || undefined),
  startDate: z.string().optional().transform((s) => s ? new Date(s) : undefined),
  endDate: z.string().optional().transform((s) => s ? new Date(s) : undefined),
  limit: z.coerce.number().min(1).max(1000).default(100),
  offset: z.coerce.number().min(0).default(0),
});

const exportQuerySchema = z.object({
  repositoryId: z.string(),
  startDate: z.string().transform((s) => new Date(s)),
  endDate: z.string().transform((s) => new Date(s)),
  format: z.enum(['json', 'csv']).default('json'),
});

export async function auditRoutes(app: FastifyInstance) {
  // Get audit log
  app.get<{ Querystring: z.infer<typeof auditQuerySchema> }>(
    '/',
    async (request) => {
      const query = auditQuerySchema.parse(request.query);

      const result = await auditLogger.getAuditLog({
        repositoryId: query.repositoryId,
        organizationId: query.organizationId,
        actorLogin: query.actorLogin,
        eventTypes: query.eventTypes as Parameters<typeof auditLogger.getAuditLog>[0]['eventTypes'],
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit,
        offset: query.offset,
      });

      return {
        entries: result.entries,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      };
    }
  );

  // Export audit log
  app.get<{ Querystring: z.infer<typeof exportQuerySchema> }>(
    '/export',
    async (request, reply) => {
      const query = exportQuerySchema.parse(request.query);

      const data = await auditLogger.exportAuditLog({
        repositoryId: query.repositoryId,
        startDate: query.startDate,
        endDate: query.endDate,
        format: query.format,
      });

      if (query.format === 'csv') {
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename=audit-log-${query.repositoryId}.csv`);
      } else {
        reply.header('Content-Type', 'application/json');
      }

      return data;
    }
  );

  // Get audit log for specific repository
  app.get<{ Params: { owner: string; repo: string }; Querystring: z.infer<typeof auditQuerySchema> }>(
    '/repositories/:owner/:repo',
    async (request) => {
      const { owner, repo } = request.params;
      const query = auditQuerySchema.parse(request.query);

      // Get repository ID from full name
      const { db } = await import('@prflow/db');
      const repository = await db.repository.findUnique({
        where: { fullName: `${owner}/${repo}` },
      });

      if (!repository) {
        return { entries: [], pagination: { total: 0, limit: query.limit, offset: query.offset } };
      }

      const result = await auditLogger.getAuditLog({
        repositoryId: repository.id,
        actorLogin: query.actorLogin,
        eventTypes: query.eventTypes as Parameters<typeof auditLogger.getAuditLog>[0]['eventTypes'],
        startDate: query.startDate,
        endDate: query.endDate,
        limit: query.limit,
        offset: query.offset,
      });

      return {
        entries: result.entries,
        pagination: {
          total: result.total,
          limit: query.limit,
          offset: query.offset,
        },
      };
    }
  );
}
