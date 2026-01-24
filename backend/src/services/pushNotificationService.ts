import admin from 'firebase-admin';
import { getDevicePushToken } from './pushTokenService.js';
import { isClientConnected } from './websocketService.js';
import type { MessageResponse } from './messageService.js';

let fcmInitialized = false;

export function initFirebase(serviceAccount?: object) {
  if (fcmInitialized) return;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    });
    fcmInitialized = true;
  }
}

export async function sendPushNotification(
  appId: string,
  deviceId: string,
  message: MessageResponse
): Promise<boolean> {
  if (isClientConnected(deviceId)) {
    return false;
  }

  const tokenInfo = await getDevicePushToken(appId, deviceId);
  if (!tokenInfo) {
    return false;
  }

  const { token, platform } = tokenInfo;

  try {
    if (platform === 'android') {
      return await sendFcmNotification(token, message);
    } else if (platform === 'ios') {
      return await sendApnsNotification(token, message);
    }
  } catch (error) {
    console.error('Push notification failed:', error);
  }

  return false;
}

async function sendFcmNotification(
  token: string,
  message: MessageResponse
): Promise<boolean> {
  if (!fcmInitialized) {
    console.warn('FCM not initialized, skipping push notification');
    return false;
  }

  try {
    await admin.messaging().send({
      token,
      notification: {
        title: 'New Message',
        body: message.body.substring(0, 100),
      },
      data: {
        conversation_id: message.conversation_id,
        message_id: message.id,
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'replyhq_messages',
        },
      },
    });
    return true;
  } catch (error) {
    const fcmError = error as { code?: string };
    if (fcmError.code === 'messaging/invalid-registration-token' ||
        fcmError.code === 'messaging/registration-token-not-registered') {
      console.warn('Invalid FCM token, should be removed');
    }
    throw error;
  }
}

async function sendApnsNotification(
  token: string,
  message: MessageResponse
): Promise<boolean> {
  if (!fcmInitialized) {
    console.warn('FCM not initialized for APNs, skipping push notification');
    return false;
  }

  try {
    await admin.messaging().send({
      token,
      notification: {
        title: 'New Message',
        body: message.body.substring(0, 100),
      },
      data: {
        conversation_id: message.conversation_id,
        message_id: message.id,
      },
      apns: {
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
          },
        },
      },
    });
    return true;
  } catch (error) {
    console.error('APNs notification failed:', error);
    throw error;
  }
}
