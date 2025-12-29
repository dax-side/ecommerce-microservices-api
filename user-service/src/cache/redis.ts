// ===== Optimized Redis Cache with Pattern Deletion & Connection Pooling =====
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: 6379,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  // Connection pool settings for high concurrency
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > 3) return null; // Stop retrying after 3 attempts
    return Math.min(times * 200, 2000); // Exponential backoff
  },
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true; // Reconnect on READONLY errors
    }
    return false;
  }
});

redis.on('connect', () => {
  console.log('[OK] Redis connected');
});

redis.on('ready', () => {
  console.log('[OK] Redis ready for commands');
});

redis.on('error', (err) => {
  console.error('[ERROR] Redis error:', err.message);
});

redis.on('close', () => {
  console.log('[WARN] Redis connection closed');
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

  // Set multiple keys at once with same TTL
  async mset(entries: Array<{ key: string; value: any }>, ttlSeconds = 300) {
    try {
      const pipeline = redis.pipeline();
      entries.forEach(({ key, value }) => {
        pipeline.setex(key, ttlSeconds, JSON.stringify(value));
      });
      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Cache mset error:', error);
      return false;
    }
  },

  // Check if key exists
  async exists(key: string) {
    try {
      return await redis.exists(key) === 1;
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  },

  // Get TTL remaining
  async ttl(key: string) {
    try {
      return await redis.ttl(key);
    } catch (error) {
      console.error('Cache TTL error:', error);
      return -1;
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
  },

  // Get cache stats for monitoring
  async stats() {
    try {
      const info = await redis.info('memory');
      const dbSize = await redis.dbsize();
      return { info, dbSize };
    } catch (error) {
      console.error('Cache stats error:', error);
      return null;
    }
  }
};

export default redis;