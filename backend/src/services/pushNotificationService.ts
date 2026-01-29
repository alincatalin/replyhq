import admin from 'firebase-admin';
import { prisma } from '../lib/prisma.js';

// Initialize Firebase Admin SDK
let fcmInitialized = false;

export function initFirebase(serviceAccount?: object) {
  if (fcmInitialized) return;

  try {
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      });
      fcmInitialized = true;
      console.log('[Push] Firebase Admin SDK initialized');
    } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const parsedAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(parsedAccount),
      });
      fcmInitialized = true;
      console.log('[Push] Firebase Admin SDK initialized from env');
    }
  } catch (error) {
    console.warn('[Push] Firebase initialization failed:', error);
  }
}

// Auto-initialize on module load
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  initFirebase();
}

export interface PushNotificationPayload {
  title?: string;
  body: string;
  data?: Record<string, string>;
  conversationId?: string;
  messageId?: string;
}

export interface SendPushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Send push notification to a specific device
 */
export async function sendPushNotification(
  deviceId: string,
  notification: PushNotificationPayload
): Promise<SendPushResult> {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: {
      pushToken: true,
      platform: true,
      pushTokenProvider: true,
    },
  });

  if (!device?.pushToken) {
    return {
      success: false,
      error: 'No push token registered for device',
      errorCode: 'NO_TOKEN',
    };
  }

  if (!fcmInitialized) {
    return {
      success: false,
      error: 'Firebase not configured',
      errorCode: 'NOT_CONFIGURED',
    };
  }

  // Build FCM message with platform-specific configs
  const collapseKey = notification.conversationId
    ? `conv_${notification.conversationId}`
    : `device_${deviceId}`;

  const message: admin.messaging.Message = {
    token: device.pushToken,
    notification: notification.title
      ? {
          title: notification.title,
          body: notification.body,
        }
      : undefined,
    data: {
      ...notification.data,
      conversationId: notification.conversationId || '',
      messageId: notification.messageId || '',
    },
    android: {
      priority: 'normal',
      collapseKey,
      notification: {
        channelId: 'messages',
        priority: 'default',
        sound: 'default',
      },
    },
    apns: {
      headers: {
        'apns-collapse-id': collapseKey,
        'apns-priority': '5', // Normal priority
      },
      payload: {
        aps: {
          alert: notification.title
            ? {
                title: notification.title,
                body: notification.body,
              }
            : notification.body,
          sound: 'default',
          'content-available': 1,
        },
      },
    },
  };

  try {
    const response = await admin.messaging().send(message);

    // Record notification as sent
    await prisma.pushNotification.create({
      data: {
        deviceId,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        status: 'sent',
        sentAt: new Date(),
      },
    });

    console.log('[Push] Sent notification to device:', deviceId, 'messageId:', response);

    return {
      success: true,
      messageId: response,
    };
  } catch (error: any) {
    console.error('[Push] Failed to send notification:', error);

    // Handle specific Firebase errors
    await handlePushError(deviceId, error);

    return {
      success: false,
      error: error.message || 'Unknown error',
      errorCode: error.code || 'UNKNOWN_ERROR',
    };
  }
}

/**
 * Send push notification to multiple devices
 */
export async function sendPushNotificationToDevices(
  deviceIds: string[],
  notification: PushNotificationPayload
): Promise<SendPushResult[]> {
  const results = await Promise.all(
    deviceIds.map((deviceId) => sendPushNotification(deviceId, notification))
  );

  return results;
}

/**
 * Send push notification to user (all their devices)
 */
export async function sendPushNotificationToUser(
  appId: string,
  userId: string,
  notification: PushNotificationPayload
): Promise<SendPushResult[]> {
  // Find all devices for this user
  const devices = await prisma.device.findMany({
    where: {
      appId,
      userId,
      pushToken: { not: null },
    },
    select: { id: true },
  });

  if (devices.length === 0) {
    return [
      {
        success: false,
        error: 'No devices with push tokens found for user',
        errorCode: 'NO_DEVICES',
      },
    ];
  }

  const deviceIds = devices.map((d) => d.id);
  return sendPushNotificationToDevices(deviceIds, notification);
}

/**
 * Handle push notification errors (token cleanup, etc.)
 */
async function handlePushError(deviceId: string, error: any): Promise<void> {
  // Record failed notification
  await prisma.pushNotification.create({
    data: {
      deviceId,
      body: 'Failed notification',
      status: 'failed',
      errorMessage: error.message,
      errorCode: error.code,
    },
  });

  // Clean up invalid tokens
  const invalidTokenCodes = [
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
    'messaging/invalid-argument',
  ];

  if (invalidTokenCodes.includes(error.code)) {
    console.log('[Push] Removing invalid push token for device:', deviceId);

    await prisma.device.update({
      where: { id: deviceId },
      data: {
        pushToken: null,
        pushTokenProvider: null,
        pushTokenUpdatedAt: null,
      },
    });
  }
}

/**
 * Register push token for a device
 */
export async function registerPushToken(
  deviceId: string,
  pushToken: string,
  provider: 'fcm' | 'apns'
): Promise<void> {
  // Validate token format
  if (!pushToken || pushToken.length < 10) {
    throw new Error('Invalid push token format');
  }

  // Check if another device has this token (token migration)
  const existingDevice = await prisma.device.findFirst({
    where: {
      pushToken,
      NOT: { id: deviceId },
    },
  });

  if (existingDevice) {
    // Clear token from old device (user switched devices)
    await prisma.device.update({
      where: { id: existingDevice.id },
      data: {
        pushToken: null,
        pushTokenProvider: null,
        pushTokenUpdatedAt: null,
      },
    });

    console.log('[Push] Migrated token from device:', existingDevice.id, 'to:', deviceId);
  }

  // Update device with new token
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      pushToken,
      pushTokenProvider: provider,
      pushTokenUpdatedAt: new Date(),
    },
  });

  console.log('[Push] Registered token for device:', deviceId, 'provider:', provider);
}

/**
 * Unregister push token from a device
 */
export async function unregisterPushToken(deviceId: string): Promise<void> {
  await prisma.device.update({
    where: { id: deviceId },
    data: {
      pushToken: null,
      pushTokenProvider: null,
      pushTokenUpdatedAt: null,
    },
  });

  console.log('[Push] Unregistered push token for device:', deviceId);
}

/**
 * Cleanup expired push notification records (30+ days old)
 */
export async function cleanupExpiredNotifications(): Promise<number> {
  const result = await prisma.pushNotification.deleteMany({
    where: {
      retainUntil: {
        lt: new Date(),
      },
    },
  });

  if (result.count > 0) {
    console.log(`[Push] Cleaned up ${result.count} expired notifications`);
  }

  return result.count;
}

export default {
  initFirebase,
  sendPushNotification,
  sendPushNotificationToDevices,
  sendPushNotificationToUser,
  registerPushToken,
  unregisterPushToken,
  cleanupExpiredNotifications,
};
