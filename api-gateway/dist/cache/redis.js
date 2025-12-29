"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cache = void 0;
// ===== src/cache/redis.ts =====
const ioredis_1 = __importDefault(require("ioredis"));
const redis = new ioredis_1.default({
    host: process.env.REDIS_HOST || 'redis',
    port: 6379,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
});
redis.on('connect', () => {
    console.log('Redis connected');
});
redis.on('error', (err) => {
    console.error('Redis error:', err);
});
// Cache helper functions
exports.cache = {
    async get(key) {
        try {
            const data = await redis.get(key);
            return data ? JSON.parse(data) : null;
        }
        catch (error) {
            console.error('Cache get error:', error);
            return null;
        }
    },
    async set(key, data, ttlSeconds = 300) {
        try {
            await redis.setex(key, ttlSeconds, JSON.stringify(data));
            return true;
        }
        catch (error) {
            console.error('Cache set error:', error);
            return false;
        }
    },
    async del(key) {
        try {
            await redis.del(key);
            return true;
        }
        catch (error) {
            console.error('Cache delete error:', error);
            return false;
        }
    },
    async flush() {
        try {
            await redis.flushall();
            return true;
        }
        catch (error) {
            console.error('Cache flush error:', error);
            return false;
        }
    }
};
exports.default = redis;
