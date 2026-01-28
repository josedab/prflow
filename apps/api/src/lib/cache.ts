import { getRedis } from './redis.js';
import { logger } from './logger.js';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

const DEFAULT_TTL = 300; // 5 minutes
const CACHE_PREFIX = 'prflow:cache:';

type CacheValue = string | number | object | null;

/**
 * Generic cache service with Redis backend
 */
export class CacheService {
  private prefix: string;
  private defaultTTL: number;

  constructor(options: CacheOptions = {}) {
    this.prefix = options.prefix ? `${CACHE_PREFIX}${options.prefix}:` : CACHE_PREFIX;
    this.defaultTTL = options.ttl || DEFAULT_TTL;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  /**
   * Get a value from cache
   */
  async get<T extends CacheValue>(key: string): Promise<T | null> {
    try {
      const redis = getRedis();
      const value = await redis.get(this.getKey(key));
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      logger.warn({ error, key }, 'Cache get failed');
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T extends CacheValue>(key: string, value: T, ttl?: number): Promise<boolean> {
    try {
      const redis = getRedis();
      const serialized = JSON.stringify(value);
      const expiresIn = ttl || this.defaultTTL;

      await redis.setex(this.getKey(key), expiresIn, serialized);
      return true;
    } catch (error) {
      logger.warn({ error, key }, 'Cache set failed');
      return false;
    }
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const redis = getRedis();
      await redis.del(this.getKey(key));
      return true;
    } catch (error) {
      logger.warn({ error, key }, 'Cache delete failed');
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const redis = getRedis();
      const keys = await redis.keys(`${this.prefix}${pattern}`);
      if (keys.length === 0) return 0;

      const deleted = await redis.del(...keys);
      return deleted;
    } catch (error) {
      logger.warn({ error, pattern }, 'Cache deletePattern failed');
      return 0;
    }
  }

  /**
   * Get or set with a factory function
   */
  async getOrSet<T extends CacheValue>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const redis = getRedis();
      return (await redis.exists(this.getKey(key))) === 1;
    } catch (error) {
      logger.warn({ error, key }, 'Cache exists check failed');
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      const redis = getRedis();
      return await redis.ttl(this.getKey(key));
    } catch (error) {
      logger.warn({ error, key }, 'Cache ttl check failed');
      return -1;
    }
  }
}

// Pre-configured cache instances for different data types
export const repositoryCache = new CacheService({
  prefix: 'repo',
  ttl: 600, // 10 minutes
});

export const workflowCache = new CacheService({
  prefix: 'workflow',
  ttl: 300, // 5 minutes
});

export const analysisCache = new CacheService({
  prefix: 'analysis',
  ttl: 3600, // 1 hour - analysis results don't change often
});

export const userCache = new CacheService({
  prefix: 'user',
  ttl: 900, // 15 minutes
});

export const analyticsCache = new CacheService({
  prefix: 'analytics',
  ttl: 1800, // 30 minutes
});

// Cache key generators
export const cacheKeys = {
  repository: (owner: string, repo: string) => `${owner}/${repo}`,
  repositorySettings: (repoId: string) => `settings:${repoId}`,
  workflow: (workflowId: string) => workflowId,
  workflowByPR: (repoId: string, prNumber: number) => `pr:${repoId}:${prNumber}`,
  prAnalysis: (owner: string, repo: string, prNumber: number, sha: string) =>
    `${owner}/${repo}:${prNumber}:${sha}`,
  user: (userId: string) => userId,
  userByLogin: (login: string) => `login:${login}`,
  repositoryAnalytics: (repoId: string, period: string) => `${repoId}:${period}`,
  teamAnalytics: (teamId: string, period: string) => `team:${teamId}:${period}`,
};

/**
 * Cache decorator for async methods
 * Usage: @cached('prefix', 3600)
 */
export function cached(prefix: string, ttl?: number) {
  const cache = new CacheService({ prefix, ttl });

  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: unknown, ...args: unknown[]) {
      const cacheKey = JSON.stringify(args);

      const cachedValue = await cache.get(cacheKey);
      if (cachedValue !== null) {
        return cachedValue;
      }

      const result = await originalMethod.apply(this, args);
      await cache.set(cacheKey, result);

      return result;
    };

    return descriptor;
  };
}
