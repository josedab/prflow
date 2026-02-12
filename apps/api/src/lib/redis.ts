import Redis from 'ioredis';
import { loadConfigSafe } from '@prflow/config';

const config = loadConfigSafe();

let redis: InstanceType<typeof Redis.default> | null = null;

export function getRedis(): InstanceType<typeof Redis.default> {
  if (!redis) {
    redis = new Redis.default(config.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      retryStrategy(times: number) {
        if (times > 3) return null; // stop retrying after 3 attempts
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('error', (err: Error) => {
      console.error(`[redis] Connection error: ${err.message}`);
    });
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
