import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrCreateConversation } from '../../services/conversationService.js';
import { createMessage, getMessages } from '../../services/messageService.js';
import { registerPushToken } from '../../services/pushTokenService.js';
import { prisma } from '../../lib/prisma.js';

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
    device: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../../services/websocketService.js', () => ({
  broadcastToConversation: vi.fn(),
  isClientConnected: vi.fn().mockReturnValue(false),
  subscribeDeviceToConversation: vi.fn(),
}));

describe('Integration: Message Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('create conversation → send message → fetch messages', () => {
    it('should complete full message flow', async () => {
      const mockConversation = {
        id: 'conv_integration',
        visitorId: 'vis_integration',
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };

      const mockMessage = {
        id: 'msg_integration',
        localId: 'local_integration',
        conversationId: 'conv_integration',
        body: 'Integration test message',
        sender: 'user',
        createdAt: new Date(),
        status: 'SENT',
      };

      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.conversation.create).mockResolvedValue(mockConversation as any);

      const conversation = await getOrCreateConversation('app_test', 'device_test', {
        user: { id: 'user_test' },
      });

      expect(conversation.id).toBe('conv_integration');
      expect(conversation.status).toBe('open');

      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConversation as any);
      vi.mocked(prisma.message.upsert).mockResolvedValue(mockMessage as any);

      const message = await createMessage('conv_integration', {
        local_id: 'local_integration',
        body: 'Integration test message',
      }, 'app_test', 'device_test');

      expect(message.id).toBe('msg_integration');
      expect(message.body).toBe('Integration test message');
      expect(message.sender).toBe('user');

      vi.mocked(prisma.message.findMany).mockResolvedValue([mockMessage] as any);

      const messagesResult = await getMessages('conv_integration', 'app_test', 'device_test');

      expect(messagesResult.messages).toHaveLength(1);
      expect(messagesResult.messages[0].body).toBe('Integration test message');
      expect(messagesResult.has_more).toBe(false);
    });
  });

  describe('idempotency: send duplicate local_id', () => {
    it('should return existing message without creating duplicate', async () => {
      const mockConversation = { id: 'conv_idem' };
      const existingMessage = {
        id: 'msg_existing',
        localId: 'local_duplicate',
        conversationId: 'conv_idem',
        body: 'Original message',
        sender: 'user',
        createdAt: new Date(),
        status: 'SENT',
      };

      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConversation as any);
      vi.mocked(prisma.message.upsert).mockResolvedValue(existingMessage as any);

      const message1 = await createMessage('conv_idem', {
        local_id: 'local_duplicate',
        body: 'Original message',
      }, 'app_test', 'device_test');

      const message2 = await createMessage('conv_idem', {
        local_id: 'local_duplicate',
        body: 'Should not matter - same local_id',
      }, 'app_test', 'device_test');

      expect(message1.id).toBe('msg_existing');
      expect(message2.id).toBe('msg_existing');
    });
  });

  describe('offline sync: reconnect and fetch missed messages', () => {
    it('should fetch messages after given timestamp', async () => {
      const mockConversation = { id: 'conv_sync' };
      const olderMessage = {
        id: 'msg_old',
        localId: 'local_old',
        conversationId: 'conv_sync',
        body: 'Old message',
        sender: 'user',
        createdAt: new Date('2026-01-01T10:00:00Z'),
        status: 'SENT',
      };
      const newerMessage = {
        id: 'msg_new',
        localId: 'local_new',
        conversationId: 'conv_sync',
        body: 'New message',
        sender: 'agent',
        createdAt: new Date('2026-01-01T12:00:00Z'),
        status: 'SENT',
      };

      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(mockConversation as any);
      vi.mocked(prisma.message.findMany).mockResolvedValue([newerMessage] as any);

      const afterTimestamp = new Date('2026-01-01T11:00:00Z').getTime();
      const result = await getMessages('conv_sync', 'app_test', 'device_test', afterTimestamp);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('msg_new');
    });
  });

  describe('push token registration flow', () => {
    it('should register and update push tokens', async () => {
      vi.mocked(prisma.device.upsert).mockResolvedValue({} as any);

      const result1 = await registerPushToken('app_test', {
        token: 'token_v1',
        platform: 'android',
        device_id: 'device_push',
      });

      expect(result1.success).toBe(true);
      expect(prisma.device.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            appId_deviceId: {
              appId: 'app_test',
              deviceId: 'device_push',
            },
          },
        })
      );

      const result2 = await registerPushToken('app_test', {
        token: 'token_v2',
        platform: 'android',
        device_id: 'device_push',
      });

      expect(result2.success).toBe(true);
      expect(prisma.device.upsert).toHaveBeenCalledTimes(2);
    });
  });

  describe('error scenarios', () => {
    it('should throw when sending message to non-existent conversation', async () => {
      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);

      await expect(
        createMessage('conv_nonexistent', {
          local_id: 'local_test',
          body: 'Test message',
        }, 'app_test', 'device_test')
      ).rejects.toThrow('Conversation not found');
    });

    it('should throw when fetching messages from non-existent conversation', async () => {
      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);

      await expect(getMessages('conv_nonexistent', 'app_test', 'device_test')).rejects.toThrow('Conversation not found');
    });
  });
});
