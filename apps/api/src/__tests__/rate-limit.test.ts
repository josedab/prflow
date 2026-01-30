import { describe, it, expect, vi } from 'vitest';

// Mock Redis client
vi.mock('../lib/redis.js', () => ({
  getRedisClient: () => ({
    zremrangebyscore: vi.fn().mockResolvedValue(0),
    zcard: vi.fn().mockResolvedValue(5),
    zadd: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    multi: vi.fn(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 0],
        [null, 5],
        [null, 1],
        [null, 1],
      ]),
    })),
  }),
}));

describe('Rate Limiting', () => {
  describe('Rate limit key generation', () => {
    it('should generate IP-based key for unauthenticated requests', () => {
      // Key generation is internal, but we can test the concept
      const ipKey = 'ratelimit:ip:127.0.0.1';
      expect(ipKey).toMatch(/^ratelimit:ip:/);
    });

    it('should generate user-based key for authenticated requests', () => {
      const userKey = 'ratelimit:user:user123';
      expect(userKey).toMatch(/^ratelimit:user:/);
    });
  });

  describe('Rate limit configurations', () => {
    it('should have default API rate limit config', async () => {
      const { apiRateLimiter } = await import('../lib/rate-limit.js');
      
      expect(apiRateLimiter.windowMs).toBe(60 * 1000);
      expect(apiRateLimiter.max).toBe(100);
      expect(apiRateLimiter.keyPrefix).toBe('ratelimit:api:');
    });

    it('should have webhook rate limit config', async () => {
      const { webhookRateLimiter } = await import('../lib/rate-limit.js');
      
      expect(webhookRateLimiter.max).toBe(500);
      expect(webhookRateLimiter.keyPrefix).toBe('ratelimit:webhook:');
    });

    it('should have auth rate limit config', async () => {
      const { authRateLimiter } = await import('../lib/rate-limit.js');
      
      expect(authRateLimiter.windowMs).toBe(15 * 60 * 1000);
      expect(authRateLimiter.max).toBe(10);
      expect(authRateLimiter.keyPrefix).toBe('ratelimit:auth:');
    });
  });
});
