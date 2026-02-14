import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { loadConfigSafe, isGitHubConfigured } from '@prflow/config';
import { setupRoutes } from './routes/index.js';
import { setupWebhooks } from './routes/webhooks.js';
import { createQueueWorker } from './jobs/worker.js';
import { logger } from './lib/logger.js';
import { rateLimitPlugin, apiRateLimiter } from './lib/rate-limit.js';
import { setupWebSocket } from './lib/websocket.js';
import { setupErrorHandler } from './lib/error-handler.js';

// Friendly guard: detect missing .env before Prisma crashes with a confusing error
const isLiteMode = process.env.PRFLOW_LITE === '1';
const projectRoot = resolve(import.meta.dirname ?? '.', '..', '..', '..');
if (!isLiteMode && !process.env.DATABASE_URL && !existsSync(resolve(projectRoot, '.env'))) {
  console.error(`
╔══════════════════════════════════════════════════╗
║     PRFlow — Environment Not Configured          ║
╚══════════════════════════════════════════════════╝

  It looks like you haven't run the initial setup yet.
  No .env file was found and DATABASE_URL is not set.

  Quick fix (recommended):
    pnpm bootstrap

  Or try lite mode (no Docker needed):
    pnpm dev:lite

  Or configure manually:
    cp .env.example .env
    docker compose -f docker/docker-compose.yml up -d
    pnpm db:generate && pnpm db:migrate
`);
  process.exit(1);
}

const config = loadConfigSafe();
const githubEnabled = isGitHubConfigured(config);

const app: FastifyInstance = Fastify({
  logger: false,
});

async function start() {
  try {
    // Setup global error handling first
    setupErrorHandler(app);

    // Security plugins
    await app.register(cors, {
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://prflow.dev'] 
        : true,
    });
    await app.register(helmet);

    // Rate limiting
    await app.register(rateLimitPlugin, apiRateLimiter);

    // Routes
    await setupRoutes(app);

    // GitHub webhook routes (only if credentials are configured)
    if (githubEnabled) {
      await setupWebhooks(app);
    } else {
      logger.warn('⚠ GitHub App credentials not configured — webhook processing disabled');
      logger.warn('  Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_WEBHOOK_SECRET in .env to enable');
    }

    // WebSocket support for real-time updates
    await setupWebSocket(app);

    // Start queue worker (only if GitHub is configured)
    if (githubEnabled) {
      const worker = createQueueWorker();
      worker.on('completed', (job) => {
        logger.info({ jobId: job.id }, 'Job completed');
      });
      worker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
      });
    }

    // Start server
    const port = config.PORT || 3001;
    await app.listen({ port, host: '0.0.0.0' });
    logger.info(`Server running on port ${port}`);
    logger.info(`WebSocket available at ws://localhost:${port}/ws`);
    if (isLiteMode) {
      logger.info('Running in LITE mode (in-memory Redis, no database) — perfect for exploring the API');
      logger.info(`Try: curl -X POST http://localhost:${port}/api/playground/analyze -H "Content-Type: application/json" -d '{"diff":"..."}'`);
    } else if (!githubEnabled) {
      logger.info('Running in local exploration mode (no GitHub integration)');
    }
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const signals = ['SIGINT', 'SIGTERM'] as const;
signals.forEach((signal) => {
  process.on(signal, async () => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    await app.close();
    process.exit(0);
  });
});

start();
