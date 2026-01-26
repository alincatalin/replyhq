import { prisma } from '../lib/prisma.js';
import type { RegisterPushTokenInput } from '../schemas/pushToken.js';

export async function registerPushToken(
  appId: string,
  input: RegisterPushTokenInput
): Promise<{ success: boolean }> {
  // Validate token format
  if (!input.token || input.token.length < 10) {
    throw new Error('Invalid push token format');
  }

  // Check if another device has this token (token migration)
  const existingDevice = await prisma.device.findFirst({
    where: {
      appId,
      pushToken: input.token,
      NOT: {
        deviceId: input.device_id,
      },
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

    console.log('[PushToken] Migrated token from device:', existingDevice.deviceId, 'to:', input.device_id);
  }

  // Determine provider from platform
  const provider = input.platform === 'ios' ? 'apns' : 'fcm';

  // Upsert device with push token
  await prisma.device.upsert({
    where: {
      appId_deviceId: {
        appId,
        deviceId: input.device_id,
      },
    },
    update: {
      pushToken: input.token,
      pushTokenProvider: provider,
      pushTokenUpdatedAt: new Date(),
      platform: input.platform,
      updatedAt: new Date(),
    },
    create: {
      deviceId: input.device_id,
      appId,
      pushToken: input.token,
      pushTokenProvider: provider,
      pushTokenUpdatedAt: new Date(),
      platform: input.platform,
    },
  });

  return { success: true };
}

export async function getDevicePushToken(
  appId: string,
  deviceId: string
): Promise<{ token: string; platform: string } | null> {
  const device = await prisma.device.findUnique({
    where: {
      appId_deviceId: {
        appId,
        deviceId,
      },
    },
    select: {
      pushToken: true,
      platform: true,
    },
  });

  if (!device || !device.pushToken) {
    return null;
  }

  return {
    token: device.pushToken,
    platform: device.platform,
  };
}
