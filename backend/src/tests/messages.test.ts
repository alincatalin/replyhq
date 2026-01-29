import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMessage, getMessages } from '../services/messageService.js';
import { prisma } from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    conversation: {
      findFirst: vi.fn(),
    },
    message: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../services/websocketService.js', () => ({
  broadcastToConversation: vi.fn(),
}));

describe('messageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createMessage', () => {
    it('should create a new message', async () => {
      const conv = { id: 'conv_123', appId: 'app_123', deviceId: 'device_123' };
      const newMsg = {
        id: 'msg_123',
        localId: 'local_123',
        conversationId: 'conv_123',
        body: 'Hello',
        sender: 'user',
        createdAt: new Date(),
        status: 'SENT',
      };

      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(conv as any);
      vi.mocked(prisma.message.upsert).mockResolvedValue(newMsg as any);

      const result = await createMessage('conv_123', {
        local_id: 'local_123',
        body: 'Hello',
      }, 'app_123', 'device_123');

      expect(result.id).toBe('msg_123');
      expect(result.body).toBe('Hello');
      expect(result.sender).toBe('user');
    });

    it('should return existing message for duplicate local_id (idempotency)', async () => {
      const conv = { id: 'conv_123', appId: 'app_123', deviceId: 'device_123' };
      const existingMsg = {
        id: 'msg_existing',
        localId: 'local_dup',
        conversationId: 'conv_123',
        body: 'Already sent',
        sender: 'user',
        createdAt: new Date(),
        status: 'SENT',
      };

      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(conv as any);
      vi.mocked(prisma.message.upsert).mockResolvedValue(existingMsg as any);

      const result = await createMessage('conv_123', {
        local_id: 'local_dup',
        body: 'Already sent',
      }, 'app_123', 'device_123');

      expect(result.id).toBe('msg_existing');
    });

    it('should throw error for non-existent conversation', async () => {
      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(null);

      await expect(
        createMessage('conv_nonexistent', {
          local_id: 'local_123',
          body: 'Hello',
        }, 'app_123', 'device_123')
      ).rejects.toThrow('Conversation not found');
    });
  });

  describe('getMessages', () => {
    it('should return messages for conversation', async () => {
      const conv = { id: 'conv_123', appId: 'app_123', deviceId: 'device_123' };
      const messages = [
        {
          id: 'msg_1',
          localId: 'local_1',
          conversationId: 'conv_123',
          body: 'First',
          sender: 'user',
          createdAt: new Date(),
          status: 'SENT',
        },
        {
          id: 'msg_2',
          localId: 'local_2',
          conversationId: 'conv_123',
          body: 'Second',
          sender: 'agent',
          createdAt: new Date(),
          status: 'SENT',
        },
      ];

      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(conv as any);
      vi.mocked(prisma.message.findMany).mockResolvedValue(messages as any);

      const result = await getMessages('conv_123', 'app_123', 'device_123');

      expect(result.messages).toHaveLength(2);
      expect(result.has_more).toBe(false);
    });

    it('should indicate has_more when more messages exist', async () => {
      const conv = { id: 'conv_123', appId: 'app_123', deviceId: 'device_123' };
      const messages = Array.from({ length: 51 }, (_, i) => ({
        id: `msg_${i}`,
        localId: `local_${i}`,
        conversationId: 'conv_123',
        body: `Message ${i}`,
        sender: 'user',
        createdAt: new Date(),
        status: 'SENT',
      }));

      vi.mocked(prisma.conversation.findFirst).mockResolvedValue(conv as any);
      vi.mocked(prisma.message.findMany).mockResolvedValue(messages as any);

      const result = await getMessages('conv_123', 'app_123', 'device_123', undefined, 50);

      expect(result.messages).toHaveLength(50);
      expect(result.has_more).toBe(true);
    });
  });
});
