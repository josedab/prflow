import { getRedisClient } from './redis.js';
import { logger } from './logger.js';

/**
 * Redis-backed session store with TTL support
 * Used for persisting conversation sessions, wizard states, and other ephemeral data
 */
export class SessionStore<T> {
  private readonly prefix: string;
  private readonly defaultTTL: number;
  private localCache: Map<string, { data: T; expiresAt: number }>;

  constructor(prefix: string, defaultTTLSeconds: number = 1800) {
    this.prefix = prefix;
    this.defaultTTL = defaultTTLSeconds;
    this.localCache = new Map();
  }

  private key(id: string): string {
    return `${this.prefix}:${id}`;
  }

  /**
   * Store a session with optional TTL
   */
  async set(id: string, data: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds ?? this.defaultTTL;
    const serialized = JSON.stringify(data);

    try {
      const redis = getRedisClient();
      await redis.setex(this.key(id), ttl, serialized);
      
      // Update local cache for fast reads
      this.localCache.set(id, {
        data,
        expiresAt: Date.now() + ttl * 1000,
      });
    } catch (error) {
      logger.warn({ error, prefix: this.prefix, id }, 'Redis set failed, using local cache only');
      // Fallback to local cache only
      this.localCache.set(id, {
        data,
        expiresAt: Date.now() + ttl * 1000,
      });
    }
  }

  /**
   * Retrieve a session by ID
   */
  async get(id: string): Promise<T | null> {
    // Check local cache first
    const cached = this.localCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Remove expired cache entry
    if (cached) {
      this.localCache.delete(id);
    }

    try {
      const redis = getRedisClient();
      const serialized = await redis.get(this.key(id));
      
      if (!serialized) {
        return null;
      }

      const data = JSON.parse(serialized) as T;
      
      // Get remaining TTL and update local cache
      const ttl = await redis.ttl(this.key(id));
      if (ttl > 0) {
        this.localCache.set(id, {
          data,
          expiresAt: Date.now() + ttl * 1000,
        });
      }

      return data;
    } catch (error) {
      logger.warn({ error, prefix: this.prefix, id }, 'Redis get failed');
      return null;
    }
  }

  /**
   * Check if a session exists
   */
  async exists(id: string): Promise<boolean> {
    // Check local cache first
    const cached = this.localCache.get(id);
    if (cached && cached.expiresAt > Date.now()) {
      return true;
    }

    try {
      const redis = getRedisClient();
      const exists = await redis.exists(this.key(id));
      return exists === 1;
    } catch (error) {
      logger.warn({ error, prefix: this.prefix, id }, 'Redis exists check failed');
      return false;
    }
  }

  /**
   * Delete a session
   */
  async delete(id: string): Promise<boolean> {
    this.localCache.delete(id);

    try {
      const redis = getRedisClient();
      const deleted = await redis.del(this.key(id));
      return deleted === 1;
    } catch (error) {
      logger.warn({ error, prefix: this.prefix, id }, 'Redis delete failed');
      return false;
    }
  }

  /**
   * Extend the TTL of a session
   */
  async touch(id: string, ttlSeconds?: number): Promise<boolean> {
    const ttl = ttlSeconds ?? this.defaultTTL;

    // Update local cache
    const cached = this.localCache.get(id);
    if (cached) {
      cached.expiresAt = Date.now() + ttl * 1000;
    }

    try {
      const redis = getRedisClient();
      const result = await redis.expire(this.key(id), ttl);
      return result === 1;
    } catch (error) {
      logger.warn({ error, prefix: this.prefix, id }, 'Redis touch failed');
      return false;
    }
  }

  /**
   * Get all session IDs (for debugging/admin purposes)
   */
  async keys(): Promise<string[]> {
    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${this.prefix}:*`);
      return keys.map(k => k.replace(`${this.prefix}:`, ''));
    } catch (error) {
      logger.warn({ error, prefix: this.prefix }, 'Redis keys failed');
      return Array.from(this.localCache.keys());
    }
  }

  /**
   * Clear all sessions (use with caution)
   */
  async clear(): Promise<number> {
    this.localCache.clear();

    try {
      const redis = getRedisClient();
      const keys = await redis.keys(`${this.prefix}:*`);
      if (keys.length === 0) {
        return 0;
      }
      return await redis.del(...keys);
    } catch (error) {
      logger.warn({ error, prefix: this.prefix }, 'Redis clear failed');
      return 0;
    }
  }

  /**
   * Clean up expired entries from local cache
   */
  cleanupLocalCache(): number {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, entry] of this.localCache.entries()) {
      if (entry.expiresAt <= now) {
        this.localCache.delete(id);
        cleaned++;
      }
    }
    
    return cleaned;
  }
}

// Pre-configured session stores for different use cases
export const conversationSessionStore = new SessionStore<{
  id: string;
  workflowId: string;
  repositoryId: string;
  userId?: string;
  prNumber: number;
  prTitle: string;
  context: unknown[];
  createdAt: string;
  lastActivityAt: string;
}>('prflow:conversation', 1800); // 30 minutes

export const wizardSessionStore = new SessionStore<{
  id: string;
  workflowId: string;
  repositoryId: string;
  prNumber: number;
  step: string;
  files: unknown[];
  aiRecommendations: unknown[];
  userSelections: unknown;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}>('prflow:wizard', 3600); // 1 hour

export const preflightSessionStore = new SessionStore<{
  id: string;
  repositoryId: string;
  sessionToken: string;
  files: unknown[];
  results: unknown;
  createdAt: string;
  expiresAt: string;
}>('prflow:preflight', 900); // 15 minutes
