import { createClient, RedisClientType } from 'redis';

let publisher: RedisClientType | null = null;
let subscriber: RedisClientType | null = null;
let redisReady = false;

/**
 * Exported redis object for Socket.IO adapter
 */
export const redis = {
  pubClient: null as RedisClientType | null,
  subClient: null as RedisClientType | null,
  client: null as RedisClientType | null, // Main client for other operations
};

export async function initRedis(): Promise<void> {
  const rawRedisUrl = process.env.REDIS_URL;
  if (rawRedisUrl !== undefined) {
    const trimmed = rawRedisUrl.trim().toLowerCase();
    if (trimmed === '' || trimmed === 'disabled' || trimmed === 'false') {
      console.log('Redis disabled via REDIS_URL');
      return;
    }
  }

  const redisUrl = rawRedisUrl || 'redis://localhost:6379';

  publisher = createClient({ url: redisUrl });
  subscriber = createClient({ url: redisUrl });

  publisher.on('error', (err: unknown) => console.error('Redis Publisher Error:', err));
  subscriber.on('error', (err: unknown) => console.error('Redis Subscriber Error:', err));

  await publisher.connect();
  await subscriber.connect();

  // Export clients for Socket.IO adapter
  redis.pubClient = publisher;
  redis.subClient = subscriber;
  redis.client = publisher; // Main client points to publisher

  redisReady = true;
  console.log('Redis connected');
}

export function getPublisher(): RedisClientType {
  if (!publisher) {
    throw new Error('Redis publisher not initialized');
  }
  return publisher;
}

export function getSubscriber(): RedisClientType {
  if (!subscriber) {
    throw new Error('Redis subscriber not initialized');
  }
  return subscriber;
}

export async function disconnectRedis(): Promise<void> {
  redisReady = false;
  await publisher?.disconnect();
  await subscriber?.disconnect();
}

export function isRedisReady(): boolean {
  return redisReady;
}

export async function publish(channel: string, message: unknown): Promise<void> {
  await getPublisher().publish(channel, JSON.stringify(message));
}

export async function subscribe(
  pattern: string,
  callback: (channel: string, message: string) => void
): Promise<void> {
  await getSubscriber().pSubscribe(pattern, callback);
}

export async function setWithTTL(key: string, value: string, ttlSeconds: number): Promise<void> {
  await getPublisher().setEx(key, ttlSeconds, value);
}

export async function get(key: string): Promise<string | null> {
  return getPublisher().get(key);
}

export async function increment(key: string): Promise<number> {
  return getPublisher().incr(key);
}

export async function expire(key: string, ttlSeconds: number): Promise<void> {
  await getPublisher().expire(key, ttlSeconds);
}
