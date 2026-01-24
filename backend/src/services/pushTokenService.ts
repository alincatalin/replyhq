import { prisma } from '../lib/prisma.js';
import type { RegisterPushTokenInput } from '../schemas/pushToken.js';

export async function registerPushToken(
  appId: string,
  input: RegisterPushTokenInput
): Promise<{ success: boolean }> {
  await prisma.device.upsert({
    where: {
      appId_deviceId: {
        appId,
        deviceId: input.device_id,
      },
    },
    update: {
      pushToken: input.token,
      platform: input.platform,
      updatedAt: new Date(),
    },
    create: {
      deviceId: input.device_id,
      appId,
      pushToken: input.token,
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
