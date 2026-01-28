import { Worker } from 'bullmq';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { processWorkflow } from '../services/orchestrator.js';
import type { PRWorkflowJobData } from '../lib/queue.js';

export function createQueueWorker(): Worker<PRWorkflowJobData> {
  const worker = new Worker<PRWorkflowJobData>(
    'pr-workflow',
    async (job) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing PR workflow job');

      const startTime = Date.now();
      
      try {
        const result = await processWorkflow(job.data);
        
        logger.info(
          {
            jobId: job.id,
            workflowId: result.workflowId,
            status: result.status,
            durationMs: Date.now() - startTime,
          },
          'PR workflow completed'
        );

        return result;
      } catch (error) {
        logger.error(
          {
            jobId: job.id,
            error: (error as Error).message,
            durationMs: Date.now() - startTime,
          },
          'PR workflow failed'
        );
        throw error;
      }
    },
    {
      connection: getRedis(),
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000,
      },
    }
  );

  return worker;
}
