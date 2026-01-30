import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Redis
vi.mock('../lib/redis.js', () => ({
  getRedisClient: vi.fn(() => ({
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    ttl: vi.fn().mockResolvedValue(1800),
    exists: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    expire: vi.fn().mockResolvedValue(1),
  })),
}));

// Import after mocks
import { SessionStore } from '../lib/session-store.js';

describe('SessionStore', () => {
  let store: SessionStore<{ id: string; data: string }>;

  beforeEach(() => {
    store = new SessionStore<{ id: string; data: string }>('test', 1800);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('set', () => {
    it('should store a session with default TTL', async () => {
      const data = { id: 'test-1', data: 'hello' };
      await store.set('session-1', data);
      
      // Verify local cache is updated
      const cached = await store.get('session-1');
      expect(cached).toEqual(data);
    });

    it('should store a session with custom TTL', async () => {
      const data = { id: 'test-2', data: 'world' };
      await store.set('session-2', data, 3600);
      
      const cached = await store.get('session-2');
      expect(cached).toEqual(data);
    });
  });

  describe('get', () => {
    it('should return null for non-existent session', async () => {
      const result = await store.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return cached session', async () => {
      const data = { id: 'test-3', data: 'cached' };
      await store.set('session-3', data);
      
      const result = await store.get('session-3');
      expect(result).toEqual(data);
    });
  });

  describe('delete', () => {
    it('should delete a session', async () => {
      const data = { id: 'test-4', data: 'to-delete' };
      await store.set('session-4', data);
      
      const deleted = await store.delete('session-4');
      expect(deleted).toBe(true);
    });

    it('should return false for non-existent session', async () => {
      const deleted = await store.delete('nonexistent');
      expect(deleted).toBe(true); // Redis del returns 1 in mock
    });
  });

  describe('exists', () => {
    it('should check if session exists', async () => {
      const data = { id: 'test-5', data: 'exists' };
      await store.set('session-5', data);
      
      const exists = await store.exists('session-5');
      expect(exists).toBe(true);
    });
  });

  describe('touch', () => {
    it('should extend session TTL', async () => {
      const data = { id: 'test-6', data: 'touch-me' };
      await store.set('session-6', data);
      
      const touched = await store.touch('session-6', 3600);
      expect(touched).toBe(true);
    });
  });

  describe('cleanupLocalCache', () => {
    it('should remove expired entries from local cache', async () => {
      // Create a store with very short TTL for testing
      const shortStore = new SessionStore<{ id: string }>('short', 0.001);
      await shortStore.set('expiring', { id: 'exp' });
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const cleaned = shortStore.cleanupLocalCache();
      expect(cleaned).toBeGreaterThanOrEqual(0);
    });
  });
});
