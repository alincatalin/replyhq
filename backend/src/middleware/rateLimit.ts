import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

interface RateLimitEntry {
  tokens: number;
  lastRefill: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
const STORE_MAX_SIZE = 100000;
const ENTRY_TTL = 60000; // 1 minute

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 30000; // 30 seconds

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) {
    return;
  }
  lastCleanup = now;

  for (const [key, entry] of rateLimitStore) {
    if (now - entry.lastRefill > ENTRY_TTL) {
      rateLimitStore.delete(key);
    }
  }

  if (rateLimitStore.size > STORE_MAX_SIZE) {
    const keysToDelete = Array.from(rateLimitStore.keys()).slice(0, rateLimitStore.size - STORE_MAX_SIZE);
    for (const key of keysToDelete) {
      rateLimitStore.delete(key);
    }
  }
}

export function messageRateLimit(req: Request, res: Response, next: NextFunction) {
  const { deviceId } = req.appHeaders;
  const now = Date.now();
  const { messagesPerSecond, windowMs } = config.rateLimit;

  cleanupExpiredEntries();

  let entry = rateLimitStore.get(deviceId);

  if (!entry) {
    if (rateLimitStore.size >= STORE_MAX_SIZE) {
      const oldestKey = rateLimitStore.keys().next().value;
      if (oldestKey) rateLimitStore.delete(oldestKey);
    }
    
    entry = { tokens: messagesPerSecond, lastRefill: now };
    rateLimitStore.set(deviceId, entry);
  }

  const timePassed = now - entry.lastRefill;
  const tokensToAdd = (timePassed / windowMs) * messagesPerSecond;
  entry.tokens = Math.min(messagesPerSecond, entry.tokens + tokensToAdd);
  entry.lastRefill = now;

  if (entry.tokens < 1) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Maximum ${messagesPerSecond} messages per second`,
      retry_after: Math.ceil((1 - entry.tokens) * (windowMs / messagesPerSecond) / 1000),
    });
  }

  entry.tokens -= 1;
  next();
}

export function clearRateLimitStore() {
  rateLimitStore.clear();
}

export function getRateLimitStoreSize(): number {
  return rateLimitStore.size;
}

// ====== Redis-backed Rate Limiting for Admin/Setup Endpoints ======

let redisClient: ReturnType<typeof createClient> | null = null;

/**
 * Get or create Redis client for rate limiting
 * Implements fail-open pattern: if Redis unavailable, allow requests through
 */
function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  const rawRedisUrl = process.env.REDIS_URL;
  if (rawRedisUrl !== undefined) {
    const trimmed = rawRedisUrl.trim().toLowerCase();
    if (trimmed === '' || trimmed === 'disabled' || trimmed === 'false') {
      return null;
    }
  }

  const redisUrl = rawRedisUrl || 'redis://localhost:6379';

  redisClient = createClient({
    url: redisUrl,
    socket: {
      reconnectStrategy: (retries: number) => {
        if (retries > 10) {
          console.error('Redis connection failed after 10 retries, disabling rate limiting');
          return new Error('Redis unavailable');
        }
        return Math.min(retries * 100, 3000);
      },
    },
  });

  redisClient.on('error', (error: unknown) => {
    console.error('Redis client error:', error);
  });

  redisClient.on('connect', () => {
    console.log('Redis client connected for rate limiting');
  });

  redisClient.connect().catch((error: unknown) => {
    console.error('Failed to connect to Redis for rate limiting:', error);
    console.warn('Rate limiting will fail-open (allow requests)');
  });

  return redisClient;
}

/**
 * Create rate limit store with Redis backend and fail-open error handling
 */
function createRateLimitStore(prefix: string) {
  try {
    const client = getRedisClient();
    if (!client) {
      return undefined;
    }

    return new RedisStore({
      sendCommand: (...args: any[]) => client.sendCommand(args as any),
      prefix: `rl:${prefix}:`,
    });
  } catch (error) {
    console.error('Failed to create Redis store for rate limiting:', error);
    console.warn('Rate limiting will use in-memory store (not distributed)');
    // Return undefined to use default in-memory store
    return undefined;
  }
}

/**
 * Strict rate limiter for authentication and setup endpoints
 * 5 requests per 15 minutes per IP
 */
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  message: {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests from this IP, please try again later',
    retry_after: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('strict'),
  // Custom handler to ensure consistent error format
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts, please try again later',
      retry_after: '15 minutes',
    });
  },
  // Skip rate limiting if it fails (fail-open)
  skip: (req: Request) => {
    // If Redis is unavailable, rate limiting fails open
    return false;
  },
});

/**
 * Standard rate limiter for API endpoints
 * 100 requests per 15 minutes per IP
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  message: {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many API requests, please try again later',
    retry_after: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRateLimitStore('api'),
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      error: 'Too many requests',
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many API requests, please slow down',
      retry_after: '15 minutes',
    });
  },
  skip: (req: Request) => {
    return false;
  },
});

/**
 * Cleanup function to disconnect Redis client
 */
export async function disconnectRateLimitRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
