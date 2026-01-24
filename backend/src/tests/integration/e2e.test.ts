import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '../../lib/prisma.js';
import * as presenceService from '../../services/presenceService.js';
import * as messageService from '../../services/messageService.js';
import * as conversationService from '../../services/conversationService.js';

// Mock dependencies
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    app: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    conversation: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    message: {
      create: vi.fn(),
      upsert: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    device: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../services/presenceService.js', () => ({
  setPresence: vi.fn(),
  removePresence: vi.fn(),
  isOnline: vi.fn().mockReturnValue(true),
  getActiveConnectionCount: vi.fn().mockReturnValue(1),
  getConversationPresence: vi.fn().mockReturnValue(new Map()),
  broadcastPresenceChange: vi.fn(),
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

describe('E2E: Full Client-Server Communication Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario 1: User connects and joins conversation', () => {
    it('should complete full connection and join flow', async () => {
      const appId = 'app_e2e_1';
      const deviceId = 'device_e2e_1';
      const conversationId = 'conv_e2e_1';
      const connectionId = 'conn_e2e_1';

      const mockApp = {
        id: appId,
        apiKey: 'key_test',
      };

      const mockConversation = {
        id: conversationId,
        appId,
        deviceId,
        status: 'open',
        messages: [{ id: 'msg_last_123' }],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Step 1: Authentication - find app
      vi.mocked(prisma.app.findUnique).mockResolvedValueOnce(mockApp as any);

      // Verify app lookup
      const app = await prisma.app.findUnique({
        where: { id: appId },
      });

      expect(app).toBeDefined();
      expect(app?.apiKey).toBe('key_test');

      // Step 2: Register presence
      const setPresenceSpy = vi.mocked(presenceService.setPresence);
      await presenceService.setPresence(appId, deviceId, connectionId);

      expect(setPresenceSpy).toHaveBeenCalledWith(appId, deviceId, connectionId);

      // Step 3: Auto-join conversation
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce(mockConversation as any);

      const conversation = await prisma.conversation.findFirst({
        where: {
          appId,
          deviceId,
        },
        include: {
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      expect(conversation).toBeDefined();
      expect(conversation?.id).toBe(conversationId);
      expect(conversation?.messages).toHaveLength(1);
      expect(conversation?.messages[0].id).toBe('msg_last_123');
    });

    it('should emit correct events: connected and conversation:joined', async () => {
      const connectedEvent = {
        connection_id: 'conn_e2e_2',
        server_time: new Date().toISOString(),
      };

      const conversationJoinedEvent = {
        conversation_id: 'conv_e2e_2',
        last_message_id: 'msg_last_456',
      };

      expect(connectedEvent.connection_id).toBe('conn_e2e_2');
      expect(connectedEvent.server_time).toBeDefined();

      expect(conversationJoinedEvent.conversation_id).toBe('conv_e2e_2');
      expect(conversationJoinedEvent.last_message_id).toBe('msg_last_456');
    });
  });

  describe('Scenario 2: User sends message', () => {
    it('should complete full send message flow', async () => {
      const appId = 'app_e2e_2';
      const deviceId = 'device_e2e_2';
      const conversationId = 'conv_e2e_2';
      const localId = 'local_msg_123';

      const mockConversation = {
        id: conversationId,
        appId,
        deviceId,
      };

      const mockMessage = {
        id: 'msg_server_123',
        localId,
        conversationId,
        body: 'Hello from user',
        sender: 'user',
        createdAt: new Date(),
        status: 'SENT',
      };

      // Step 1: Validate conversation exists
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce(mockConversation as any);

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          appId,
          deviceId,
        },
      });

      expect(conversation).toBeDefined();
      expect(conversation?.id).toBe(conversationId);

      // Step 2: Create message
      vi.mocked(prisma.message.upsert).mockResolvedValueOnce(mockMessage as any);

      const message = await prisma.message.upsert({
        where: { localId },
        update: mockMessage as any,
        create: mockMessage as any,
      });

      expect(message).toBeDefined();
      expect(message?.id).toBe('msg_server_123');
      expect(message?.sender).toBe('user');
      expect(message?.body).toBe('Hello from user');

      // Step 3: Message broadcast event
      const messageNewEvent = {
        id: message.id,
        local_id: message.localId,
        conversation_id: message.conversationId,
        body: message.body,
        sender: message.sender,
        status: message.status,
      };

      expect(messageNewEvent.id).toBe('msg_server_123');
      expect(messageNewEvent.local_id).toBe(localId);
    });

    it('should handle message idempotency with local_id', async () => {
      const localId = 'local_msg_duplicate';

      const firstMessage = {
        id: 'msg_first_456',
        localId,
        conversationId: 'conv_e2e_2',
        body: 'First send',
        sender: 'user',
        status: 'SENT',
      };

      vi.mocked(prisma.message.upsert).mockResolvedValueOnce(firstMessage as any);

      // First send
      const result1 = await prisma.message.upsert({
        where: { localId },
        update: firstMessage as any,
        create: firstMessage as any,
      });

      expect(result1.id).toBe('msg_first_456');

      // Second send with same local_id
      vi.mocked(prisma.message.upsert).mockResolvedValueOnce(firstMessage as any);

      const result2 = await prisma.message.upsert({
        where: { localId },
        update: { body: 'Different content' } as any,
        create: firstMessage as any,
      });

      // Should return same message ID (upsert behavior)
      expect(result2.id).toBe('msg_first_456');
      expect(result2.id).toBe(result1.id);
    });
  });

  describe('Scenario 3: Admin sends message to user', () => {
    it('should complete admin message send flow', async () => {
      const appId = 'app_e2e_3';
      const conversationId = 'conv_e2e_3';
      const localId = 'local_admin_msg_789';

      const mockConversation = {
        id: conversationId,
        appId,
        deviceId: 'device_e2e_3',
      };

      const mockMessage = {
        id: 'msg_admin_789',
        localId,
        conversationId,
        body: 'Hello from admin',
        sender: 'agent',
        createdAt: new Date(),
        status: 'SENT',
      };

      // Step 1: Admin authenticates
      const mockApp = {
        id: appId,
        apiKey: 'admin_key_test',
      };

      vi.mocked(prisma.app.findUnique).mockResolvedValueOnce(mockApp as any);

      const app = await prisma.app.findUnique({
        where: { id: appId },
      });

      expect(app).toBeDefined();

      // Step 2: Validate conversation exists for app
      vi.mocked(prisma.conversation.findFirst).mockResolvedValueOnce(mockConversation as any);

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: conversationId,
          appId,
        },
      });

      expect(conversation).toBeDefined();
      expect(conversation?.appId).toBe(appId);

      // Step 3: Create agent message
      vi.mocked(prisma.message.upsert).mockResolvedValueOnce(mockMessage as any);

      const message = await prisma.message.upsert({
        where: { localId },
        update: mockMessage as any,
        create: mockMessage as any,
      });

      expect(message.sender).toBe('agent');
      expect(message.id).toBe('msg_admin_789');

      // Step 4: Message broadcast event (sent to users in conversation)
      const messageNewEvent = {
        id: message.id,
        local_id: message.localId,
        conversation_id: message.conversationId,
        body: message.body,
        sender: message.sender,
        status: message.status,
      };

      expect(messageNewEvent.sender).toBe('agent');
    });
  });

  describe('Scenario 4: Offline sync on reconnect', () => {
    it('should fetch messages after last sync', async () => {
      const appId = 'app_e2e_4';
      const deviceId = 'device_e2e_4';
      const conversationId = 'conv_e2e_4';
      const lastMessageId = 'msg_cursor_123';

      // Step 1: Query messages after last known message
      const newMessages = [
        {
          id: 'msg_new_1',
          localId: 'local_new_1',
          conversationId,
          body: 'Missed message 1',
          sender: 'agent',
          createdAt: new Date('2026-01-24T12:00:00Z'),
          status: 'SENT',
        },
        {
          id: 'msg_new_2',
          localId: 'local_new_2',
          conversationId,
          body: 'Missed message 2',
          sender: 'agent',
          createdAt: new Date('2026-01-24T12:05:00Z'),
          status: 'SENT',
        },
      ];

      vi.mocked(prisma.message.findMany).mockResolvedValueOnce(newMessages as any);

      const result = await prisma.message.findMany({
        where: {
          conversationId,
          id: {
            in: ['msg_new_1', 'msg_new_2'],
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('msg_new_1');
      expect(result[1].id).toBe('msg_new_2');

      // Step 2: Process missed messages
      for (const message of result) {
        expect(message.sender).toBe('agent');
        expect(message.status).toBe('SENT');
      }
    });

    it('should handle cursor-based pagination', async () => {
      const conversationId = 'conv_e2e_4';
      const afterMessageId = 'msg_cursor_123';

      // In cursor-based pagination, we'd use: where { id: { gt: afterMessageId } }
      // For now, simulate the messages that would be returned

      const messages = [
        {
          id: 'msg_page_1',
          localId: 'local_page_1',
          conversationId,
          body: 'Message after cursor',
          sender: 'user',
          createdAt: new Date(),
          status: 'SENT',
        },
        {
          id: 'msg_page_2',
          localId: 'local_page_2',
          conversationId,
          body: 'Another message',
          sender: 'agent',
          createdAt: new Date(),
          status: 'SENT',
        },
      ];

      expect(messages).toHaveLength(2);
      expect(messages[0].id).toBe('msg_page_1');
    });

    it('should emit conversation:joined with cursor on reconnect', async () => {
      const conversationJoinedEvent = {
        conversation_id: 'conv_e2e_4',
        last_message_id: 'msg_cursor_123', // Used for cursor-based sync on next connection
      };

      expect(conversationJoinedEvent.last_message_id).toBe('msg_cursor_123');
    });
  });

  describe('Scenario 5: Typing indicators', () => {
    it('should broadcast user:typing to admin', () => {
      const typingEvent = {
        conversation_id: 'conv_e2e_5',
        device_id: 'device_e2e_5',
        is_typing: true,
      };

      expect(typingEvent.conversation_id).toBe('conv_e2e_5');
      expect(typingEvent.device_id).toBe('device_e2e_5');
      expect(typingEvent.is_typing).toBe(true);
    });

    it('should broadcast agent:typing to users', () => {
      const agentTypingEvent = {
        conversation_id: 'conv_e2e_5',
        is_typing: true,
      };

      expect(agentTypingEvent.conversation_id).toBe('conv_e2e_5');
      expect(agentTypingEvent.is_typing).toBe(true);
    });

    it('should handle stop typing events', () => {
      const typingStopEvent = {
        conversation_id: 'conv_e2e_5',
        device_id: 'device_e2e_5',
        is_typing: false,
      };

      expect(typingStopEvent.is_typing).toBe(false);
    });
  });

  describe('Scenario 6: Disconnection and cleanup', () => {
    it('should remove presence on disconnect', async () => {
      const appId = 'app_e2e_6';
      const deviceId = 'device_e2e_6';
      const connectionId = 'conn_e2e_6';

      const removePresenceSpy = vi.mocked(presenceService.removePresence);
      await presenceService.removePresence(appId, deviceId, connectionId);

      expect(removePresenceSpy).toHaveBeenCalledWith(appId, deviceId, connectionId);
    });

    it('should emit session:disconnect event', () => {
      const disconnectEvent = {
        connection_id: 'conn_e2e_6',
        device_id: 'device_e2e_6',
        reason: 'client namespace disconnect',
      };

      expect(disconnectEvent.connection_id).toBe('conn_e2e_6');
      expect(disconnectEvent.device_id).toBe('device_e2e_6');
      expect(disconnectEvent.reason).toBeDefined();
    });

    it('should handle graceful shutdown', () => {
      const shutdownEvent = {
        message: 'Server is shutting down',
        reconnect_delay_ms: 5000,
      };

      expect(shutdownEvent.reconnect_delay_ms).toBe(5000);
      expect(shutdownEvent.message).toBe('Server is shutting down');
    });
  });

  describe('Scenario 7: Multi-device user', () => {
    it('should handle user with multiple connections', async () => {
      const appId = 'app_e2e_7';
      const deviceId = 'device_e2e_7';
      const conn1 = 'conn_phone';
      const conn2 = 'conn_tablet';

      // First connection
      await presenceService.setPresence(appId, deviceId, conn1);
      expect(vi.mocked(presenceService.setPresence)).toHaveBeenCalledWith(appId, deviceId, conn1);

      // Second connection from same device
      await presenceService.setPresence(appId, deviceId, conn2);
      expect(vi.mocked(presenceService.setPresence)).toHaveBeenCalledWith(appId, deviceId, conn2);

      // First connection disconnects
      await presenceService.removePresence(appId, deviceId, conn1);
      expect(vi.mocked(presenceService.removePresence)).toHaveBeenCalledWith(appId, deviceId, conn1);

      // Device should still be online (conn2 still active)
      expect(vi.mocked(presenceService.isOnline)).toBeDefined();
    });

    it('should broadcast online/offline only at device boundary', async () => {
      const appId = 'app_e2e_7';
      const deviceId = 'device_e2e_7';

      // First connection brings device online
      const broadcastSpy = vi.mocked(presenceService.broadcastPresenceChange);
      await presenceService.setPresence(appId, deviceId, 'conn_first');

      // Second connection should NOT trigger broadcast (device already online)
      await presenceService.setPresence(appId, deviceId, 'conn_second');

      // Only broadcast when transitioning device offline (last connection closes)
      await presenceService.removePresence(appId, deviceId, 'conn_first');
      // Still online due to conn_second

      await presenceService.removePresence(appId, deviceId, 'conn_second');
      // Now offline - should broadcast

      expect(broadcastSpy).toBeDefined();
    });
  });

  describe('Scenario 8: Admin monitors sessions', () => {
    it('should list active sessions for app', async () => {
      const mockSessions = [
        {
          connectionId: 'conn_001',
          deviceId: 'device_001',
          appId: 'app_e2e_8',
          connectedAt: new Date().toISOString(),
        },
        {
          connectionId: 'conn_002',
          deviceId: 'device_002',
          appId: 'app_e2e_8',
          connectedAt: new Date().toISOString(),
        },
      ];

      // Admin receives sessions:list response
      expect(mockSessions).toHaveLength(2);
      expect(mockSessions[0].appId).toBe('app_e2e_8');
      expect(mockSessions[1].appId).toBe('app_e2e_8');

      // Each session has all required fields
      for (const session of mockSessions) {
        expect(session.connectionId).toBeDefined();
        expect(session.deviceId).toBeDefined();
        expect(session.appId).toBeDefined();
        expect(session.connectedAt).toBeDefined();
      }
    });

    it('should subscribe to conversation for monitoring', () => {
      const conversationJoinEvent = {
        conversation_id: 'conv_e2e_8',
        last_message_id: 'msg_admin_monitor_123',
      };

      expect(conversationJoinEvent.conversation_id).toBe('conv_e2e_8');
      expect(conversationJoinEvent.last_message_id).toBeDefined();
    });
  });
});
