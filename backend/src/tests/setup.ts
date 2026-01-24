import { vi } from 'vitest';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    message: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    conversation: {
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    device: {
      deleteMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    app: {
      findUnique: vi.fn(),
    },
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  },
}));

vi.mock('../lib/redis.js', () => ({
  initRedis: vi.fn(),
  disconnectRedis: vi.fn(),
  publish: vi.fn(),
  subscribe: vi.fn(),
  getPublisher: vi.fn(),
  getSubscriber: vi.fn(),
  setWithTTL: vi.fn(),
  get: vi.fn(),
  increment: vi.fn(),
  expire: vi.fn(),
}));
