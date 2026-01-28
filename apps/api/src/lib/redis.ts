import Redis from 'ioredis';
import { loadConfigSafe } from '@prflow/config';

const config = loadConfigSafe();

let redis: InstanceType<typeof Redis.default> | null = null;

export function getRedis(): InstanceType<typeof Redis.default> {
  if (!redis) {
    redis = new Redis.default(config.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

// Alias for consistency
export const getRedisClient = getRedis;

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
