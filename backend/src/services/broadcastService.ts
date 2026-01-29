import { prisma } from '../lib/prisma.js';

export type BroadcastTarget = {
  deviceId: string;
  userId: string | null;
  deviceContext?: {
    platform: 'ios' | 'android';
    os_version?: string;
    app_version?: string;
    device_model?: string;
    locale?: string;
    timezone?: string;
    sdk_version?: string;
  };
};

export async function resolveBroadcastRecipients(broadcast: {
  appId: string;
  targetType: string;
  segmentQuery: unknown | null;
  userIds: string[];
}): Promise<BroadcastTarget[]> {
  const targetType = broadcast.targetType.toUpperCase();

  if (targetType === 'SPECIFIC_USERS') {
    if (broadcast.userIds.length === 0) return [];

    const devices = await prisma.device.findMany({
      where: {
        appId: broadcast.appId,
        userId: { in: broadcast.userIds },
      },
      select: {
        deviceId: true,
        userId: true,
        platform: true,
      },
    });

    return devices.map((device) => ({
      deviceId: device.deviceId,
      userId: device.userId,
      deviceContext: {
        platform: device.platform as 'ios' | 'android',
      },
    }));
  }

  if (targetType === 'SEGMENT') {
    const segment = broadcast.segmentQuery as { preset?: string } | null;

    if (segment?.preset === 'platform_ios' || segment?.preset === 'platform_android') {
      const platform = segment.preset === 'platform_ios' ? 'ios' : 'android';
      const devices = await prisma.device.findMany({
        where: {
          appId: broadcast.appId,
          platform,
        },
        select: {
          deviceId: true,
          userId: true,
          platform: true,
        },
      });

      return devices.map((device) => ({
        deviceId: device.deviceId,
        userId: device.userId,
        deviceContext: {
          platform: device.platform as 'ios' | 'android',
        },
      }));
    }

    if (segment?.preset === 'active_30d') {
      const since = new Date();
      since.setDate(since.getDate() - 30);

      const conversations = await prisma.conversation.findMany({
        where: {
          appId: broadcast.appId,
          updatedAt: { gte: since },
        },
        distinct: ['deviceId'],
        select: {
          deviceId: true,
          userId: true,
          metadata: true,
        },
      });

      return conversations.map((conversation) => {
        const metadata = (conversation.metadata ?? {}) as Record<string, any>;
        const deviceContext = (metadata.device_context ?? {}) as Record<string, any>;

        return {
          deviceId: conversation.deviceId,
          userId: conversation.userId ?? null,
          deviceContext: deviceContext.platform
            ? {
                platform: deviceContext.platform,
                os_version: deviceContext.os_version,
                app_version: deviceContext.app_version,
                device_model: deviceContext.device_model,
                locale: deviceContext.locale,
                timezone: deviceContext.timezone,
                sdk_version: deviceContext.sdk_version,
              }
            : undefined,
        };
      });
    }

    return [];
  }

  // ALL_USERS default
  const devices = await prisma.device.findMany({
    where: { appId: broadcast.appId },
    select: {
      deviceId: true,
      userId: true,
      platform: true,
    },
  });

  return devices.map((device) => ({
    deviceId: device.deviceId,
    userId: device.userId,
    deviceContext: {
      platform: device.platform as 'ios' | 'android',
    },
  }));
}
