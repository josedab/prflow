import Redis from 'ioredis';
import { loadConfigSafe } from '@prflow/config';

const config = loadConfigSafe();
const isLite = process.env.PRFLOW_LITE === '1';

let redis: InstanceType<typeof Redis.default> | null = null;

export function getRedis(): InstanceType<typeof Redis.default> {
  if (!redis) {
    if (isLite) {
      // In lite mode, use ioredis-mock so the app starts without a real Redis
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const IORedisMock = require('ioredis-mock');
      redis = new IORedisMock() as InstanceType<typeof Redis.default>;
    } else {
      redis = new Redis.default(config.REDIS_URL || 'redis://localhost:6379', {
        maxRetriesPerRequest: null,
        retryStrategy(times: number) {
          if (times > 3) return null;
          return Math.min(times * 200, 2000);
        },
      });

      redis.on('error', (err: Error) => {
        console.error(`[redis] Connection error: ${err.message}`);
      });
    }
  }
  return redis;
}

// Alias for consistency
export const getRedisClient = getRedis;

export async function checkRedisConnection(): Promise<boolean> {
  try {
    const client = getRedis();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
