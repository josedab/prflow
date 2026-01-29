import type { FastifyInstance } from 'fastify';
import { db } from '@prflow/db';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/health/ready', async () => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ready', database: 'connected' };
    } catch (error) {
      return { status: 'not_ready', database: 'disconnected' };
    }
  });
}
