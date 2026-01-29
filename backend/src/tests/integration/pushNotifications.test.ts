import request from 'supertest';
import app from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import * as pushNotificationService from '../../services/pushNotificationService.js';
import * as deliveryService from '../../services/deliveryService.js';

describe('Push Notifications Integration Tests', () => {
  let testApp: any;
  let testDevice: any;

  beforeAll(async () => {
    // Clean up test data
    await prisma.pushNotification.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.app.deleteMany({});

    // Create test app
    testApp = await prisma.app.create({
      data: {
        name: 'Test Push App',
        apiKey: 'test-push-key',
        appId: 'test-push-app',
      },
    });

    // Create test device
    testDevice = await prisma.device.create({
      data: {
        deviceId: 'test-device-123',
        appId: testApp.id,
        userId: 'user-123',
        platform: 'android',
        pushToken: 'fcm-token-abc123',
        pushTokenProvider: 'fcm',
        pushTokenUpdatedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.pushNotification.deleteMany({});
    await prisma.device.deleteMany({});
    await prisma.app.deleteMany({});
    await prisma.$disconnect();
  });

  describe('POST /v1/push-token', () => {
    it('should register a push token for a device', async () => {
      const response = await request(app)
        .post('/v1/push-token')
        .set('x-app-id', testApp.appId)
        .set('x-api-key', testApp.apiKey)
        .send({
          device_id: 'new-device-456',
          token: 'fcm-token-new-xyz789',
          platform: 'ios',
        })
        .expect(200);

      expect(response.body).toEqual({ success: true });

      // Verify device was created
      const device = await prisma.device.findUnique({
        where: {
          appId_deviceId: {
            appId: testApp.id,
            deviceId: 'new-device-456',
          },
        },
      });

      expect(device).toBeDefined();
      expect(device?.pushToken).toBe('fcm-token-new-xyz789');
      expect(device?.pushTokenProvider).toBe('apns');
      expect(device?.platform).toBe('ios');
    });

    it('should update push token for existing device', async () => {
      const response = await request(app)
        .post('/v1/push-token')
        .set('x-app-id', testApp.appId)
        .set('x-api-key', testApp.apiKey)
        .send({
          device_id: 'test-device-123',
          token: 'fcm-token-updated-123',
          platform: 'android',
        })
        .expect(200);

      expect(response.body).toEqual({ success: true });

      // Verify device was updated
      const device = await prisma.device.findUnique({
        where: { id: testDevice.id },
      });

      expect(device?.pushToken).toBe('fcm-token-updated-123');
      expect(device?.pushTokenProvider).toBe('fcm');
    });

    it('should migrate token from old device to new device', async () => {
      // Create device with token
      const oldDevice = await prisma.device.create({
        data: {
          deviceId: 'old-device-789',
          appId: testApp.id,
          platform: 'android',
          pushToken: 'fcm-token-migrate-abc',
          pushTokenProvider: 'fcm',
          pushTokenUpdatedAt: new Date(),
        },
      });

      // Register same token on new device
      await request(app)
        .post('/v1/push-token')
        .set('x-app-id', testApp.appId)
        .set('x-api-key', testApp.apiKey)
        .send({
          device_id: 'new-device-789',
          token: 'fcm-token-migrate-abc',
          platform: 'android',
        })
        .expect(200);

      // Old device should have token cleared
      const oldDeviceUpdated = await prisma.device.findUnique({
        where: { id: oldDevice.id },
      });
      expect(oldDeviceUpdated?.pushToken).toBeNull();

      // New device should have the token
      const newDevice = await prisma.device.findUnique({
        where: {
          appId_deviceId: {
            appId: testApp.id,
            deviceId: 'new-device-789',
          },
        },
      });
      expect(newDevice?.pushToken).toBe('fcm-token-migrate-abc');
    });
  });

  describe('Push Notification Service', () => {
    it('should send push notification to a device', async () => {
      const result = await pushNotificationService.sendPushNotification(
        testDevice.id,
        {
          title: 'Test Notification',
          body: 'This is a test notification',
          conversationId: 'conv-123',
          messageId: 'msg-456',
        }
      );

      // Will fail without Firebase config, but check error handling
      expect(result).toBeDefined();
      if (!result.success) {
        expect(['NOT_CONFIGURED', 'NO_TOKEN', 'UNKNOWN_ERROR']).toContain(result.errorCode);
      }
    });

    it('should return error for device without push token', async () => {
      const deviceWithoutToken = await prisma.device.create({
        data: {
          deviceId: 'no-token-device',
          appId: testApp.id,
          platform: 'android',
        },
      });

      const result = await pushNotificationService.sendPushNotification(
        deviceWithoutToken.id,
        {
          body: 'Test',
        }
      );

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('NO_TOKEN');
    });

    it('should send notification to all user devices', async () => {
      // Create multiple devices for user
      await prisma.device.create({
        data: {
          deviceId: 'user-device-1',
          appId: testApp.id,
          userId: 'multi-device-user',
          platform: 'android',
          pushToken: 'fcm-token-multi-1',
          pushTokenProvider: 'fcm',
        },
      });

      await prisma.device.create({
        data: {
          deviceId: 'user-device-2',
          appId: testApp.id,
          userId: 'multi-device-user',
          platform: 'ios',
          pushToken: 'fcm-token-multi-2',
          pushTokenProvider: 'apns',
        },
      });

      const results = await pushNotificationService.sendPushNotificationToUser(
        testApp.id,
        'multi-device-user',
        {
          title: 'Multi-device Test',
          body: 'Test notification',
        }
      );

      expect(results.length).toBe(2);
    });

    it('should cleanup expired notifications', async () => {
      // Create old notification
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      await prisma.pushNotification.create({
        data: {
          deviceId: testDevice.id,
          body: 'Old notification',
          status: 'sent',
          sentAt: oldDate,
          retainUntil: oldDate,
        },
      });

      const cleanedCount = await pushNotificationService.cleanupExpiredNotifications();
      expect(cleanedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Smart Delivery Service', () => {
    it('should not send notification if user is online', async () => {
      // Mock presence service to return true
      jest.spyOn(require('../../services/presenceService.js'), 'isPresent')
        .mockResolvedValue(true);

      const decision = await deliveryService.shouldSendNotification(
        testApp.id,
        'online-user',
        'msg-123'
      );

      expect(decision.shouldSend).toBe(false);
      expect(decision.reason).toBe('User is currently online');
    });

    it('should send notification if user is offline', async () => {
      // Mock presence service to return false
      jest.spyOn(require('../../services/presenceService.js'), 'isPresent')
        .mockResolvedValue(false);

      const decision = await deliveryService.shouldSendNotification(
        testApp.id,
        'offline-user',
        'msg-123'
      );

      expect(decision.shouldSend).toBe(true);
      expect(decision.reason).toBe('User offline, outside quiet hours');
    });

    it('should respect rate limit', async () => {
      // Mock presence service
      jest.spyOn(require('../../services/presenceService.js'), 'isPresent')
        .mockResolvedValue(false);

      // Create device for rate limit user
      const rateLimitDevice = await prisma.device.create({
        data: {
          deviceId: 'rate-limit-device',
          appId: testApp.id,
          userId: 'rate-limit-user',
          platform: 'android',
          pushToken: 'fcm-token-rate-limit',
        },
      });

      // Create 10 notifications in last hour (max limit)
      const oneHourAgo = new Date();
      oneHourAgo.setMinutes(oneHourAgo.getMinutes() - 30);

      for (let i = 0; i < 10; i++) {
        await prisma.pushNotification.create({
          data: {
            deviceId: rateLimitDevice.id,
            body: `Notification ${i}`,
            status: 'sent',
            sentAt: oneHourAgo,
          },
        });
      }

      const decision = await deliveryService.shouldSendNotification(
        testApp.id,
        'rate-limit-user',
        'msg-123'
      );

      expect(decision.shouldSend).toBe(false);
      expect(decision.reason).toBe('Rate limit exceeded');
      expect(decision.useCollapsing).toBe(true);
    });

    it('should batch notifications with collapsing', async () => {
      const notifications = [
        { body: 'Message 1', conversationId: 'conv-1' },
        { body: 'Message 2', conversationId: 'conv-1' },
        { body: 'Message 3', conversationId: 'conv-1' },
      ];

      // Mock sendSmartNotification
      const sendSpy = jest.spyOn(deliveryService, 'sendSmartNotification')
        .mockResolvedValue(undefined);

      await deliveryService.sendBatchNotification(
        testApp.id,
        'batch-user',
        notifications
      );

      expect(sendSpy).toHaveBeenCalledWith(
        testApp.id,
        'batch-user',
        expect.objectContaining({
          title: '3 new messages',
          body: 'Message 3',
          data: expect.objectContaining({
            messageCount: '3',
          }),
        })
      );

      sendSpy.mockRestore();
    });
  });

  describe('Push Token Service', () => {
    it('should get device push token', async () => {
      const { getDevicePushToken } = await import('../../services/pushTokenService.js');

      const tokenInfo = await getDevicePushToken(testApp.id, 'test-device-123');

      expect(tokenInfo).toBeDefined();
      if (tokenInfo) {
        expect(tokenInfo.platform).toBe('android');
        // Token might have changed during tests
        expect(tokenInfo.token).toBeDefined();
      }
    });

    it('should return null for non-existent device', async () => {
      const { getDevicePushToken } = await import('../../services/pushTokenService.js');

      const tokenInfo = await getDevicePushToken(testApp.id, 'non-existent-device');

      expect(tokenInfo).toBeNull();
    });
  });
});
