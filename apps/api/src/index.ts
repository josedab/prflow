import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { loadConfigSafe } from '@prflow/config';
import { setupRoutes } from './routes/index.js';
import { setupWebhooks } from './routes/webhooks.js';
import { createQueueWorker } from './jobs/worker.js';
import { logger } from './lib/logger.js';
import { rateLimitPlugin, apiRateLimiter } from './lib/rate-limit.js';
import { setupWebSocket } from './lib/websocket.js';
import { setupErrorHandler } from './lib/error-handler.js';

const config = loadConfigSafe();

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
    await setupWebhooks(app);

    // WebSocket support for real-time updates
    await setupWebSocket(app);

    // Start queue worker
    if (process.env.GITHUB_APP_ID) {
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
