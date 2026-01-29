import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';
import { getPublisher } from '../lib/redis.js';

const WINDOW_SIZE_SECONDS = 1;
const MAX_REQUESTS = config.rateLimit.messagesPerSecond;

export async function redisMessageRateLimit(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const { deviceId } = req.appHeaders;
  const key = `ratelimit:message:${deviceId}`;

  try {
    const redis = getPublisher();
    const now = Date.now();
    const windowStart = now - WINDOW_SIZE_SECONDS * 1000;

    await redis.zRemRangeByScore(key, 0, windowStart);

    const requestCount = await redis.zCard(key);

    if (requestCount >= MAX_REQUESTS) {
      const oldestRequest = await redis.zRange(key, 0, 0, { REV: false });
      const oldestTime = oldestRequest.length > 0 ? parseInt(oldestRequest[0], 10) : now;
      const retryAfter = Math.ceil((oldestTime + WINDOW_SIZE_SECONDS * 1000 - now) / 1000);

      return res.status(429).json({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Maximum ${MAX_REQUESTS} messages per second`,
        retry_after: Math.max(1, retryAfter),
      });
    }

    await redis.zAdd(key, { score: now, value: `${now}:${Math.random()}` });
    await redis.expire(key, WINDOW_SIZE_SECONDS + 1);

    next();
  } catch (error) {
    console.error('Redis rate limit error, falling back to allow:', error);
    next();
  }
}
