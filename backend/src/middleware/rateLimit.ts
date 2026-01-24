import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

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
