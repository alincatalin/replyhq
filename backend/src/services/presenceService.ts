import { getPublisher, publish, isRedisReady } from '../lib/redis.js';

const PRESENCE_CONN_TTL_SECONDS = 60;
const PRESENCE_DEVICE_TTL_SECONDS = 120;

interface PresenceInfo {
  deviceId: string;
  appId: string;
  connectionId: string;
  lastSeen: string;
}

/**
 * Set presence for a specific connection (multi-connection support)
 * FIX: Per-connection tracking + device-level aggregation
 */
export async function setPresence(
  appId: string,
  deviceId: string,
  connectionId: string
): Promise<void> {
  if (!isRedisReady()) {
    return;
  }

  try {
    const redis = getPublisher();

    // Store per-connection presence with TTL
    const connKey = `presence:conn:${connectionId}`;
    const connInfo: PresenceInfo = {
      appId,
      deviceId,
      connectionId,
      lastSeen: new Date().toISOString(),
    };

    await redis.setEx(connKey, PRESENCE_CONN_TTL_SECONDS, JSON.stringify(connInfo));

    // Add connection to device set
    const deviceSetKey = `presence:device:${appId}:${deviceId}`;
    const connectionCount = await redis.sCard(deviceSetKey);

    await redis.sAdd(deviceSetKey, connectionId);
    await redis.expire(deviceSetKey, PRESENCE_DEVICE_TTL_SECONDS);

    // Only broadcast online if this is the first connection
    if (connectionCount === 0) {
      await broadcastPresenceChange(appId, deviceId, true);
    }
  } catch (error) {
    console.error('Set presence failed:', error);
  }
}

/**
 * Remove presence for a specific connection (multi-connection support)
 * FIX: Only broadcast offline when last connection closes
 */
export async function removePresence(
  appId: string,
  deviceId: string,
  connectionId: string
): Promise<void> {
  if (!isRedisReady()) {
    return;
  }

  try {
    const redis = getPublisher();

    // Delete per-connection presence
    const connKey = `presence:conn:${connectionId}`;
    await redis.del(connKey);

    // Remove from device set
    const deviceSetKey = `presence:device:${appId}:${deviceId}`;
    await redis.sRem(deviceSetKey, connectionId);

    // Check remaining connections
    const connectionCount = await redis.sCard(deviceSetKey);

    // Only broadcast offline if no more connections
    if (connectionCount === 0) {
      await redis.del(deviceSetKey);
      await broadcastPresenceChange(appId, deviceId, false);
    }
  } catch (error) {
    console.error('Remove presence failed:', error);
  }
}

/**
 * Check if device is online (has any active connections)
 */
export async function isOnline(appId: string, deviceId: string): Promise<boolean> {
  if (!isRedisReady()) {
    return false;
  }

  try {
    const redis = getPublisher();
    const deviceSetKey = `presence:device:${appId}:${deviceId}`;
    const connectionCount = await redis.sCard(deviceSetKey);
    return connectionCount > 0;
  } catch (error) {
    console.error('Check presence failed:', error);
    return false;
  }
}

/**
 * Get presence info for a device
 */
export async function getPresence(
  appId: string,
  deviceId: string
): Promise<PresenceInfo | null> {
  if (!isRedisReady()) {
    return null;
  }

  try {
    const redis = getPublisher();
    const deviceSetKey = `presence:device:${appId}:${deviceId}`;
    const connectionIds = await redis.sMembers(deviceSetKey);

    if (connectionIds.length === 0) return null;

    // Return info from first connection
    const connKey = `presence:conn:${connectionIds[0]}`;
    const data = await redis.get(connKey);
    if (!data) return null;

    return JSON.parse(data) as PresenceInfo;
  } catch (error) {
    console.error('Get presence failed:', error);
    return null;
  }
}

/**
 * Get active connection count for a device
 */
export async function getActiveConnectionCount(appId: string, deviceId: string): Promise<number> {
  if (!isRedisReady()) {
    return 0;
  }

  try {
    const redis = getPublisher();
    const deviceSetKey = `presence:device:${appId}:${deviceId}`;
    return await redis.sCard(deviceSetKey);
  } catch (error) {
    console.error('Get connection count failed:', error);
    return 0;
  }
}

/**
 * Get presence for multiple devices in a conversation
 */
export async function getConversationPresence(
  appId: string,
  deviceIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  if (!isRedisReady()) {
    deviceIds.forEach((id) => result.set(id, false));
    return result;
  }

  try {
    const redis = getPublisher();

    for (const deviceId of deviceIds) {
      const deviceSetKey = `presence:device:${appId}:${deviceId}`;
      const connectionCount = await redis.sCard(deviceSetKey);
      result.set(deviceId, connectionCount > 0);
    }
  } catch (error) {
    console.error('Get conversation presence failed:', error);
    deviceIds.forEach((id) => result.set(id, false));
  }

  return result;
}

/**
 * Broadcast presence change event
 */
export async function broadcastPresenceChange(
  appId: string,
  deviceId: string,
  isOnline: boolean
): Promise<void> {
  try {
    await publish(`presence:${appId}`, {
      type: 'presence.change',
      device_id: deviceId,
      is_online: isOnline,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Broadcast presence change failed:', error);
  }
}
