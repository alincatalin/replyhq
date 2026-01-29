import { prisma } from '../lib/prisma.js';
import { isOnline } from './presenceService.js';
import { sendPushNotificationToUser, PushNotificationPayload } from './pushNotificationService.js';

export interface NotificationDecision {
  shouldSend: boolean;
  reason: string;
  useCollapsing: boolean;
}

export interface UserPreferences {
  quietHoursEnabled: boolean;
  quietHours?: {
    start: string; // HH:MM format (e.g., "22:00")
    end: string; // HH:MM format (e.g., "08:00")
  };
  timezone: string; // IANA timezone (e.g., "America/New_York")
  maxNotificationsPerHour: number;
}

/**
 * Decide whether to send a push notification to a user
 */
export async function shouldSendNotification(
  appId: string,
  userId: string,
  messageId: string
): Promise<NotificationDecision> {
  // Check if user is online (has active presence)
  const devices = await prisma.device.findMany({
    where: { appId, userId },
    select: { deviceId: true },
  });

  const isUserOnline = await Promise.all(
    devices.map((device) => isOnline(appId, device.deviceId))
  ).then((results) => results.some(Boolean));

  if (isUserOnline) {
    return {
      shouldSend: false,
      reason: 'User is currently online',
      useCollapsing: false,
    };
  }

  // Get user preferences
  const prefs = await getUserPreferences(appId, userId);

  // Check quiet hours
  if (prefs.quietHoursEnabled && prefs.quietHours) {
    const inQuietHours = isInQuietHours(prefs.quietHours, prefs.timezone);

    if (inQuietHours) {
      return {
        shouldSend: false,
        reason: 'Within user quiet hours',
        useCollapsing: false,
      };
    }
  }

  // Check rate limit
  const withinLimit = await checkRateLimit(appId, userId, prefs.maxNotificationsPerHour);

  if (!withinLimit) {
    return {
      shouldSend: false,
      reason: 'Rate limit exceeded',
      useCollapsing: true, // Use collapsing to batch messages
    };
  }

  return {
    shouldSend: true,
    reason: 'User offline, outside quiet hours',
    useCollapsing: true,
  };
}

/**
 * Get user notification preferences
 */
async function getUserPreferences(appId: string, userId: string): Promise<UserPreferences> {
  // In a real app, this would load from a UserPreferences table
  // For now, return sensible defaults

  // TODO: Add UserPreferences model to schema and load from DB
  return {
    quietHoursEnabled: false,
    quietHours: {
      start: '22:00',
      end: '08:00',
    },
    timezone: 'UTC',
    maxNotificationsPerHour: 10,
  };
}

/**
 * Check if current time is within quiet hours
 */
function isInQuietHours(
  quietHours: { start: string; end: string },
  timezone: string
): boolean {
  try {
    const now = new Date();

    // Get current time in user's timezone
    const userTime = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);

    const [currentHour, currentMinute] = userTime.split(':').map(Number);
    const currentMinutes = currentHour * 60 + currentMinute;

    const [startHour, startMinute] = quietHours.start.split(':').map(Number);
    const startMinutes = startHour * 60 + startMinute;

    const [endHour, endMinute] = quietHours.end.split(':').map(Number);
    const endMinutes = endHour * 60 + endMinute;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    // Normal quiet hours (e.g., 13:00 - 15:00)
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  } catch (error) {
    console.error('[Delivery] Error checking quiet hours:', error);
    return false; // Default to not in quiet hours on error
  }
}

/**
 * Check if user is within rate limit for notifications
 */
async function checkRateLimit(
  appId: string,
  userId: string,
  maxPerHour: number
): Promise<boolean> {
  const oneHourAgo = new Date();
  oneHourAgo.setHours(oneHourAgo.getHours() - 1);

  // Find all devices for this user
  const devices = await prisma.device.findMany({
    where: { appId, userId },
    select: { id: true },
  });

  if (devices.length === 0) {
    return true; // No devices, no limit
  }

  const deviceIds = devices.map((d) => d.id);

  // Count notifications sent in last hour
  const count = await prisma.pushNotification.count({
    where: {
      deviceId: { in: deviceIds },
      status: 'sent',
      sentAt: { gte: oneHourAgo },
    },
  });

  return count < maxPerHour;
}

/**
 * Send notification with smart delivery logic
 */
export async function sendSmartNotification(
  appId: string,
  userId: string,
  notification: PushNotificationPayload
): Promise<void> {
  const decision = await shouldSendNotification(appId, userId, notification.messageId || '');

  if (!decision.shouldSend) {
    console.log(`[Delivery] Not sending notification: ${decision.reason}`);
    return;
  }

  // Send to all user devices
  const results = await sendPushNotificationToUser(appId, userId, notification);

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.filter((r) => !r.success).length;

  console.log(
    `[Delivery] Sent notification to user ${userId}: ${successCount} sent, ${failureCount} failed`
  );
}

/**
 * Send batch notification with collapsing
 */
export async function sendBatchNotification(
  appId: string,
  userId: string,
  notifications: PushNotificationPayload[]
): Promise<void> {
  if (notifications.length === 0) return;

  // Use the latest notification body, but indicate multiple messages
  const latestNotification = notifications[notifications.length - 1];
  const count = notifications.length;

  const collapsedNotification: PushNotificationPayload = {
    title: count > 1 ? `${count} new messages` : latestNotification.title,
    body: latestNotification.body,
    data: {
      ...latestNotification.data,
      messageCount: count.toString(),
    },
    conversationId: latestNotification.conversationId,
  };

  await sendSmartNotification(appId, userId, collapsedNotification);
}

export default {
  shouldSendNotification,
  sendSmartNotification,
  sendBatchNotification,
};
