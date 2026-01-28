import { Queue, QueueEvents } from 'bullmq';
import { getRedis } from './redis.js';

export interface PRWorkflowJobData {
  installationId: number;
  repositoryId: string;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  action: string;
}

const connection = { connection: getRedis() };

export const prWorkflowQueue = new Queue<PRWorkflowJobData>('pr-workflow', connection);

export const prWorkflowEvents = new QueueEvents('pr-workflow', connection);

export async function enqueuePRWorkflow(data: PRWorkflowJobData): Promise<string> {
  const job = await prWorkflowQueue.add('process-pr', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  });
  return job.id!;
}
