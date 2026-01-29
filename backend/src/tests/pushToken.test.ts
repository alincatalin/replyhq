import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerPushToken, getDevicePushToken } from '../services/pushTokenService.js';
import { prisma } from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    device: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('pushTokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registerPushToken', () => {
    it('should register a new push token', async () => {
      vi.mocked(prisma.device.upsert).mockResolvedValue({} as any);

      const result = await registerPushToken('app_123', {
        token: 'fcm_token_123',
        platform: 'android',
        device_id: 'device_123',
      });

      expect(result.success).toBe(true);
      expect(prisma.device.upsert).toHaveBeenCalledWith({
        where: {
          appId_deviceId: {
            appId: 'app_123',
            deviceId: 'device_123',
          },
        },
        update: expect.objectContaining({
          pushToken: 'fcm_token_123',
          platform: 'android',
        }),
        create: expect.objectContaining({
          deviceId: 'device_123',
          appId: 'app_123',
          pushToken: 'fcm_token_123',
          platform: 'android',
        }),
      });
    });

    it('should upsert token for existing device', async () => {
      vi.mocked(prisma.device.upsert).mockResolvedValue({} as any);

      const result = await registerPushToken('app_123', {
        token: 'new_token',
        platform: 'ios',
        device_id: 'existing_device',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('getDevicePushToken', () => {
    it('should return token info if exists', async () => {
      vi.mocked(prisma.device.findUnique).mockResolvedValue({
        pushToken: 'token_123',
        platform: 'android',
      } as any);

      const result = await getDevicePushToken('app_123', 'device_123');

      expect(result).toEqual({
        token: 'token_123',
        platform: 'android',
      });
    });

    it('should return null if device not found', async () => {
      vi.mocked(prisma.device.findUnique).mockResolvedValue(null);

      const result = await getDevicePushToken('app_123', 'unknown_device');

      expect(result).toBeNull();
    });

    it('should return null if no push token', async () => {
      vi.mocked(prisma.device.findUnique).mockResolvedValue({
        pushToken: null,
        platform: 'android',
      } as any);

      const result = await getDevicePushToken('app_123', 'device_no_token');

      expect(result).toBeNull();
    });
  });
});
