import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';

interface CacheEntry {
  valid: boolean;
  expiresAt: number;
}

const appCache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CACHE_MAX_SIZE = 10000;

let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 60000; // 1 minute

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) {
    return;
  }
  lastCleanup = now;

  for (const [key, entry] of appCache) {
    if (entry.expiresAt < now) {
      appCache.delete(key);
    }
  }
}

export async function validateAppId(req: Request, res: Response, next: NextFunction) {
  const { appId, apiKey } = req.appHeaders;

  cleanupExpiredEntries();

  const cacheKey = `${appId}:${apiKey}`;
  const cached = appCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!cached.valid) {
      return res.status(403).json({
        error: 'Invalid app_id',
        code: 'INVALID_APP_ID',
        message: 'The provided X-App-Id or X-Api-Key is not valid',
      });
    }
    return next();
  }

  try {
    const app = await prisma.app.findUnique({ where: { id: appId } });
    const valid = !!app && app.apiKey === apiKey;

    if (appCache.size >= CACHE_MAX_SIZE) {
      const oldestKey = appCache.keys().next().value;
      if (oldestKey) appCache.delete(oldestKey);
    }

    appCache.set(cacheKey, { valid, expiresAt: Date.now() + CACHE_TTL });

    if (!valid) {
      console.warn(`[appValidator] invalid appId=${appId}`);
      return res.status(403).json({
        error: 'Invalid app_id',
        code: 'INVALID_APP_ID',
        message: 'The provided X-App-Id or X-Api-Key is not valid',
      });
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function clearAppCache() {
  appCache.clear();
}

export function getAppCacheSize(): number {
  return appCache.size;
}
