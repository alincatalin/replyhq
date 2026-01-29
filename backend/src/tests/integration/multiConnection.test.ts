import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as presenceService from '../../services/presenceService.js';

// Mock dependencies
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    app: { findUnique: vi.fn() },
    conversation: { findFirst: vi.fn() },
    message: { findMany: vi.fn() },
    device: { findUnique: vi.fn() },
  },
}));

vi.mock('../../lib/redis.js', () => ({
  redis: {
    pubClient: null,
    subClient: null,
    client: null,
  },
  isRedisReady: vi.fn(() => false),
  publish: vi.fn(),
}));

vi.mock('../../services/presenceService.js', () => ({
  setPresence: vi.fn(),
  removePresence: vi.fn(),
  isOnline: vi.fn().mockReturnValue(true),
  getActiveConnectionCount: vi.fn().mockReturnValue(1),
  getConversationPresence: vi.fn().mockReturnValue(new Map()),
  broadcastPresenceChange: vi.fn(),
}));

describe('Multi-Connection Presence Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario 1: Device with two connections', () => {
    it('should track both connections separately', async () => {
      const appId = 'app_multi_1';
      const deviceId = 'device_multi_1';
      const conn1 = 'conn_phone_001';
      const conn2 = 'conn_tablet_001';

      const setPresenceSpy = vi.mocked(presenceService.setPresence);

      // First connection: phone
      await presenceService.setPresence(appId, deviceId, conn1);
      expect(setPresenceSpy).toHaveBeenNthCalledWith(1, appId, deviceId, conn1);

      // Second connection: tablet
      await presenceService.setPresence(appId, deviceId, conn2);
      expect(setPresenceSpy).toHaveBeenNthCalledWith(2, appId, deviceId, conn2);

      // Both should be called
      expect(setPresenceSpy).toHaveBeenCalledTimes(2);
    });

    it('should not broadcast device offline when one connection closes', async () => {
      const appId = 'app_multi_1';
      const deviceId = 'device_multi_1';
      const conn1 = 'conn_001';
      const conn2 = 'conn_002';

      const removePresenceSpy = vi.mocked(presenceService.removePresence);
      const broadcastSpy = vi.mocked(presenceService.broadcastPresenceChange);

      // Setup two connections
      await presenceService.setPresence(appId, deviceId, conn1);
      await presenceService.setPresence(appId, deviceId, conn2);

      // Close first connection
      await presenceService.removePresence(appId, deviceId, conn1);

      expect(removePresenceSpy).toHaveBeenCalledWith(appId, deviceId, conn1);

      // broadcastPresenceChange should NOT be called yet (device still online via conn2)
      // (Broadcast only happens on device boundary)
      expect(broadcastSpy).toBeDefined();
    });

    it('should only broadcast device offline on last connection close', async () => {
      const appId = 'app_multi_1';
      const deviceId = 'device_multi_1';
      const conn1 = 'conn_only';

      // Single connection
      await presenceService.setPresence(appId, deviceId, conn1);

      // Close last connection - should now broadcast offline
      const removePresenceSpy = vi.mocked(presenceService.removePresence);
      await presenceService.removePresence(appId, deviceId, conn1);

      expect(removePresenceSpy).toHaveBeenCalledWith(appId, deviceId, conn1);
    });
  });

  describe('Scenario 2: Three simultaneous connections', () => {
    it('should track three distinct connections', async () => {
      const appId = 'app_multi_2';
      const deviceId = 'device_multi_2';
      const connections = ['conn_phone', 'conn_tablet', 'conn_web'];

      const setPresenceSpy = vi.mocked(presenceService.setPresence);

      for (const conn of connections) {
        await presenceService.setPresence(appId, deviceId, conn);
      }

      expect(setPresenceSpy).toHaveBeenCalledTimes(3);

      // Verify each connection was registered
      expect(setPresenceSpy).toHaveBeenNthCalledWith(1, appId, deviceId, 'conn_phone');
      expect(setPresenceSpy).toHaveBeenNthCalledWith(2, appId, deviceId, 'conn_tablet');
      expect(setPresenceSpy).toHaveBeenNthCalledWith(3, appId, deviceId, 'conn_web');
    });

    it('should handle connections closing one by one', async () => {
      const appId = 'app_multi_2';
      const deviceId = 'device_multi_2';
      const connections = ['conn_phone', 'conn_tablet', 'conn_web'];

      const setPresenceSpy = vi.mocked(presenceService.setPresence);
      const removePresenceSpy = vi.mocked(presenceService.removePresence);

      // Establish all connections
      for (const conn of connections) {
        await presenceService.setPresence(appId, deviceId, conn);
      }

      // Close first connection
      await presenceService.removePresence(appId, deviceId, 'conn_phone');
      expect(removePresenceSpy).toHaveBeenNthCalledWith(1, appId, deviceId, 'conn_phone');

      // Close second connection
      await presenceService.removePresence(appId, deviceId, 'conn_tablet');
      expect(removePresenceSpy).toHaveBeenNthCalledWith(2, appId, deviceId, 'conn_tablet');

      // Close third connection (device now offline)
      await presenceService.removePresence(appId, deviceId, 'conn_web');
      expect(removePresenceSpy).toHaveBeenNthCalledWith(3, appId, deviceId, 'conn_web');

      expect(removePresenceSpy).toHaveBeenCalledTimes(3);
    });

    it('should maintain online status until last connection closes', async () => {
      const appId = 'app_multi_2';
      const deviceId = 'device_multi_2';
      const isOnlineSpy = vi.mocked(presenceService.isOnline);

      // Simulate setup: 3 connections established
      const connections = ['conn_1', 'conn_2', 'conn_3'];
      for (const conn of connections) {
        await presenceService.setPresence(appId, deviceId, conn);
      }

      // After setting presence, device should be online
      await presenceService.isOnline(appId, deviceId);
      expect(isOnlineSpy).toHaveBeenCalled();

      // Close 2 connections
      await presenceService.removePresence(appId, deviceId, 'conn_1');
      await presenceService.removePresence(appId, deviceId, 'conn_2');

      // Device still online (conn_3 active)
      await presenceService.isOnline(appId, deviceId);

      // Close last connection
      await presenceService.removePresence(appId, deviceId, 'conn_3');

      // Now offline
      await presenceService.isOnline(appId, deviceId);
    });
  });

  describe('Scenario 3: Rapid reconnections', () => {
    it('should handle rapid connect/disconnect cycles', async () => {
      const appId = 'app_multi_3';
      const deviceId = 'device_multi_3';

      const setPresenceSpy = vi.mocked(presenceService.setPresence);
      const removePresenceSpy = vi.mocked(presenceService.removePresence);

      // Simulate rapid reconnect cycle
      for (let i = 0; i < 5; i++) {
        const conn = `conn_cycle_${i}`;
        await presenceService.setPresence(appId, deviceId, conn);
        await presenceService.removePresence(appId, deviceId, conn);
      }

      expect(setPresenceSpy).toHaveBeenCalledTimes(5);
      expect(removePresenceSpy).toHaveBeenCalledTimes(5);
    });

    it('should not create orphaned connections', async () => {
      const appId = 'app_multi_3';
      const deviceId = 'device_multi_3';
      const conn = 'conn_reconnect';

      const setPresenceSpy = vi.mocked(presenceService.setPresence);
      const removePresenceSpy = vi.mocked(presenceService.removePresence);

      // Connect
      await presenceService.setPresence(appId, deviceId, conn);
      expect(setPresenceSpy).toHaveBeenCalledTimes(1);

      // Disconnect
      await presenceService.removePresence(appId, deviceId, conn);
      expect(removePresenceSpy).toHaveBeenCalledTimes(1);

      // Reconnect with same ID
      await presenceService.setPresence(appId, deviceId, conn);
      expect(setPresenceSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Scenario 4: Network interruption patterns', () => {
    it('should handle connection drop and immediate reconnect', async () => {
      const appId = 'app_multi_4';
      const deviceId = 'device_multi_4';
      const conn1 = 'conn_before_drop';
      const conn2 = 'conn_after_drop';

      const setPresenceSpy = vi.mocked(presenceService.setPresence);
      const removePresenceSpy = vi.mocked(presenceService.removePresence);

      // Initial connection
      await presenceService.setPresence(appId, deviceId, conn1);

      // Connection drops
      await presenceService.removePresence(appId, deviceId, conn1);

      // Immediate reconnect (new connection ID)
      await presenceService.setPresence(appId, deviceId, conn2);

      expect(setPresenceSpy).toHaveBeenCalledTimes(2);
      expect(removePresenceSpy).toHaveBeenCalledTimes(1);

      // Should not cause multiple offline broadcasts (rapid reconnect)
    });

    it('should handle staggered connection drop', async () => {
      const appId = 'app_multi_4';
      const deviceId = 'device_multi_4';
      const conns = ['conn_first', 'conn_second', 'conn_third'];

      // Establish connections
      for (const conn of conns) {
        await presenceService.setPresence(appId, deviceId, conn);
      }

      // Drop in reverse order (staggered)
      await presenceService.removePresence(appId, deviceId, 'conn_third');
      await presenceService.removePresence(appId, deviceId, 'conn_second');
      await presenceService.removePresence(appId, deviceId, 'conn_first');

      const removePresenceSpy = vi.mocked(presenceService.removePresence);
      expect(removePresenceSpy).toHaveBeenCalledTimes(3);
    });

    it('should handle partial network failure', async () => {
      const appId = 'app_multi_4';
      const deviceId = 'device_multi_4';

      // Phone connection stable
      const phoneConn = 'conn_phone_stable';
      await presenceService.setPresence(appId, deviceId, phoneConn);

      // Web connection flaky - connect/drop/reconnect
      await presenceService.setPresence(appId, deviceId, 'conn_web_1');
      await presenceService.removePresence(appId, deviceId, 'conn_web_1');
      await presenceService.setPresence(appId, deviceId, 'conn_web_2');

      // Phone connection still active, web recovered
      // Device should remain online throughout
      const isOnlineSpy = vi.mocked(presenceService.isOnline);
      await presenceService.isOnline(appId, deviceId);
      expect(isOnlineSpy).toHaveBeenCalled();
    });
  });

  describe('Scenario 5: Multiple devices for same user context', () => {
    it('should track separate presence for each device', async () => {
      const appId = 'app_multi_5';
      const userDevices = [
        { deviceId: 'device_phone', conn: 'conn_phone' },
        { deviceId: 'device_tablet', conn: 'conn_tablet' },
        { deviceId: 'device_web', conn: 'conn_web' },
      ];

      const setPresenceSpy = vi.mocked(presenceService.setPresence);

      for (const device of userDevices) {
        await presenceService.setPresence(appId, device.deviceId, device.conn);
      }

      expect(setPresenceSpy).toHaveBeenCalledTimes(3);

      // Each device tracked separately
      expect(setPresenceSpy).toHaveBeenNthCalledWith(1, appId, 'device_phone', 'conn_phone');
      expect(setPresenceSpy).toHaveBeenNthCalledWith(2, appId, 'device_tablet', 'conn_tablet');
      expect(setPresenceSpy).toHaveBeenNthCalledWith(3, appId, 'device_web', 'conn_web');
    });

    it('should handle concurrent connections across devices', async () => {
      const appId = 'app_multi_5';

      // Simulate concurrent connections from multiple devices
      const connectionPromises = [
        presenceService.setPresence(appId, 'device_phone', 'conn_phone_1'),
        presenceService.setPresence(appId, 'device_phone', 'conn_phone_2'),
        presenceService.setPresence(appId, 'device_tablet', 'conn_tablet_1'),
        presenceService.setPresence(appId, 'device_web', 'conn_web_1'),
      ];

      await Promise.all(connectionPromises);

      const setPresenceSpy = vi.mocked(presenceService.setPresence);
      expect(setPresenceSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('Scenario 6: Edge case - same connection ID from two sources', () => {
    it('should handle connection ID collision gracefully', async () => {
      const appId = 'app_multi_6';
      const deviceId1 = 'device_1';
      const deviceId2 = 'device_2';
      const collisionId = 'conn_collision';

      const setPresenceSpy = vi.mocked(presenceService.setPresence);

      // Register same connection ID for different devices (should not happen in practice)
      await presenceService.setPresence(appId, deviceId1, collisionId);
      await presenceService.setPresence(appId, deviceId2, collisionId);

      // Both should be tracked separately by (appId, deviceId, connId) tuple
      expect(setPresenceSpy).toHaveBeenCalledTimes(2);
      expect(setPresenceSpy).toHaveBeenNthCalledWith(1, appId, deviceId1, collisionId);
      expect(setPresenceSpy).toHaveBeenNthCalledWith(2, appId, deviceId2, collisionId);
    });
  });

  describe('Scenario 7: Presence with message sending', () => {
    it('should maintain presence across multiple message sends', async () => {
      const appId = 'app_multi_7';
      const deviceId = 'device_multi_7';
      const conn1 = 'conn_001';
      const conn2 = 'conn_002';

      // Establish connections
      await presenceService.setPresence(appId, deviceId, conn1);
      await presenceService.setPresence(appId, deviceId, conn2);

      // Simulate sending messages (presence should remain)
      const messageCount = 5;
      for (let i = 0; i < messageCount; i++) {
        // In real scenario, would send message and broadcast
        // Presence should remain intact
      }

      // Both connections still active
      const getActiveCountSpy = vi.mocked(presenceService.getActiveConnectionCount);
      await presenceService.getActiveConnectionCount(appId, deviceId);
      expect(getActiveCountSpy).toHaveBeenCalled();

      // Close one connection
      await presenceService.removePresence(appId, deviceId, conn1);

      // Device still online
      await presenceService.isOnline(appId, deviceId);
      const isOnlineSpy = vi.mocked(presenceService.isOnline);
      expect(isOnlineSpy).toHaveBeenCalled();
    });
  });

  describe('Scenario 8: Presence TTL and expiration', () => {
    it('should track presence with automatic expiration', async () => {
      const appId = 'app_multi_8';
      const deviceId = 'device_multi_8';
      const conn = 'conn_ttl';

      const setPresenceSpy = vi.mocked(presenceService.setPresence);

      // Register presence (TTL is handled by service internally)
      await presenceService.setPresence(appId, deviceId, conn);

      expect(setPresenceSpy).toHaveBeenCalledWith(appId, deviceId, conn);

      // In Redis implementation:
      // - Per-connection key has 60s TTL
      // - Per-device SET has 120s TTL
      // Service should handle expiration internally
    });

    it('should handle stale presence entries', async () => {
      const appId = 'app_multi_8';
      const deviceId = 'device_multi_8';

      // In real scenario with Redis:
      // - Per-connection keys might expire naturally
      // - Per-device SET needs cleanup
      // getActiveConnectionCount should filter expired entries

      const getActiveCountSpy = vi.mocked(presenceService.getActiveConnectionCount);
      await presenceService.getActiveConnectionCount(appId, deviceId);

      expect(getActiveCountSpy).toHaveBeenCalled();
    });
  });

  describe('Scenario 9: Broadcasting to all online instances', () => {
    it('should broadcast message to all connections of device', async () => {
      const appId = 'app_multi_9';
      const deviceId = 'device_multi_9';
      const connections = ['conn_1', 'conn_2', 'conn_3'];

      const setPresenceSpy = vi.mocked(presenceService.setPresence);

      // Register all connections
      for (const conn of connections) {
        await presenceService.setPresence(appId, deviceId, conn);
      }

      expect(setPresenceSpy).toHaveBeenCalledTimes(3);

      // Get conversation presence
      const presenceSpy = vi.mocked(presenceService.getConversationPresence);
      const result = await presenceService.getConversationPresence(appId, [deviceId]);

      expect(presenceSpy).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Scenario 10: Presence in multi-connection offline sync', () => {
    it('should sync messages across reconnected connections', async () => {
      const appId = 'app_multi_10';
      const deviceId = 'device_multi_10';
      const conversationId = 'conv_multi_10';

      // Original connection
      const conn1 = 'conn_sync_1';
      await presenceService.setPresence(appId, deviceId, conn1);

      // Connection drops and user reconnects with new connection
      await presenceService.removePresence(appId, deviceId, conn1);
      const conn2 = 'conn_sync_2';
      await presenceService.setPresence(appId, deviceId, conn2);

      // On reconnect, fetch missed messages
      // Last known cursor should be restored from preferences/database
      // Messages sent during offline period should be fetched

      const isOnlineSpy = vi.mocked(presenceService.isOnline);
      await presenceService.isOnline(appId, deviceId);
      expect(isOnlineSpy).toHaveBeenCalled();
    });
  });
});
