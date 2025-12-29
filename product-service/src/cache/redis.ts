// ===== Optimized Redis Cache with Pattern Deletion & Connection Pooling =====
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: 6379,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  }
});

redis.on('connect', () => {
  console.log('[OK] Redis connected (product-service)');
});

redis.on('error', (err) => {
  console.error('[ERROR] Redis error:', err.message);
});

// Cache helper functions with enhanced capabilities
export const cache = {
  async get(key: string) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  },

  async set(key: string, data: any, ttlSeconds = 300) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  },

  async del(key: string) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  },

  // Pattern-based deletion using SCAN (memory efficient)
  async delPattern(pattern: string) {
    try {
      let cursor = '0';
      let deletedCount = 0;
      
      do {
        const [newCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = newCursor;
        
        if (keys.length > 0) {
          await redis.del(...keys);
          deletedCount += keys.length;
        }
      } while (cursor !== '0');
      
      return deletedCount;
    } catch (error) {
      console.error('Cache pattern delete error:', error);
      return 0;
    }
  },

  // Get multiple keys at once
  async mget(keys: string[]) {
    try {
      if (keys.length === 0) return [];
      const values = await redis.mget(keys);
      return values.map(v => v ? JSON.parse(v) : null);
    } catch (error) {
      console.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  },

  async flush() {
    try {
      await redis.flushall();
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  }
};

export default redis;