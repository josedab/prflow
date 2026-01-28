import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from './redis.js';
import { logger } from './logger.js';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  keyPrefix?: string;
  skipFailedRequests?: boolean;
  skip?: (request: FastifyRequest) => boolean;
}

interface RateLimitInfo {
  remaining: number;
  reset: number;
  total: number;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyPrefix: 'ratelimit:',
  skipFailedRequests: false,
};

export async function rateLimitPlugin(app: FastifyInstance, options: Partial<RateLimitConfig> = {}) {
  const config = { ...defaultConfig, ...options };
  const redis = getRedisClient();

  app.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip if configured
    if (config.skip && config.skip(request)) {
      return;
    }

    // Skip health checks
    if (request.url.includes('/health')) {
      return;
    }

    const key = getKey(request, config.keyPrefix!);
    const now = Date.now();
    const windowStart = now - config.windowMs;

    try {
      // Use Redis sorted set for sliding window rate limiting
      const multi = redis.multi();
      
      // Remove old entries outside the window
      multi.zremrangebyscore(key, 0, windowStart);
      
      // Count requests in current window
      multi.zcard(key);
      
      // Add current request
      multi.zadd(key, now.toString(), `${now}-${Math.random()}`);
      
      // Set expiry on the key
      multi.expire(key, Math.ceil(config.windowMs / 1000) + 1);
      
      const results = await multi.exec();
      
      if (!results) {
        logger.warn('Rate limit Redis transaction returned null');
        return;
      }

      const requestCount = (results[1]?.[1] as number) || 0;
      const remaining = Math.max(0, config.max - requestCount - 1);
      const resetTime = now + config.windowMs;

      // Set rate limit headers
      reply.header('X-RateLimit-Limit', config.max);
      reply.header('X-RateLimit-Remaining', remaining);
      reply.header('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

      if (requestCount >= config.max) {
        const retryAfter = Math.ceil((resetTime - now) / 1000);
        reply.header('Retry-After', retryAfter);
        
        logger.warn({ key, requestCount, max: config.max }, 'Rate limit exceeded');
        
        return reply.status(429).send({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Please retry after ${retryAfter} seconds.`,
          retryAfter,
        });
      }
    } catch (error) {
      // Log error but don't block request if Redis fails
      logger.error({ error }, 'Rate limiting error');
    }
  });
}

function getKey(request: FastifyRequest, prefix: string): string {
  // Use user ID if authenticated, otherwise use IP
  const userId = (request as FastifyRequest & { user?: { id: string } }).user?.id;
  
  if (userId) {
    return `${prefix}user:${userId}`;
  }

  // Get IP from various headers (for proxies) or connection
  const forwarded = request.headers['x-forwarded-for'];
  const ip = typeof forwarded === 'string' 
    ? forwarded.split(',')[0].trim() 
    : request.ip || 'unknown';
  
  return `${prefix}ip:${ip}`;
}

// Specific rate limiters for different endpoints
export const apiRateLimiter: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyPrefix: 'ratelimit:api:',
};

export const webhookRateLimiter: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 500, // Higher limit for webhooks
  keyPrefix: 'ratelimit:webhook:',
};

export const authRateLimiter: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 auth attempts per 15 minutes
  keyPrefix: 'ratelimit:auth:',
};

// Helper to get rate limit info for a key
export async function getRateLimitInfo(key: string, config: RateLimitConfig): Promise<RateLimitInfo> {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - config.windowMs;

  try {
    await redis.zremrangebyscore(key, 0, windowStart);
    const count = await redis.zcard(key);

    return {
      remaining: Math.max(0, config.max - count),
      reset: Math.ceil((now + config.windowMs) / 1000),
      total: config.max,
    };
  } catch {
    return {
      remaining: config.max,
      reset: Math.ceil((now + config.windowMs) / 1000),
      total: config.max,
    };
  }
}
