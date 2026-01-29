import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getOrCreateConversation } from '../services/conversationService.js';
import { prisma } from '../lib/prisma.js';

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    conversation: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../services/websocketService.js', () => ({
  subscribeDeviceToConversation: vi.fn(),
}));

describe('conversationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOrCreateConversation', () => {
    it('should return existing conversation if found', async () => {
      const existingConv = {
        id: 'conv_123',
        visitorId: 'vis_123',
        status: 'open',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        metadata: {},
      };

      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(existingConv as any);

      const result = await getOrCreateConversation('app_123', 'device_123', {});

      expect(result.id).toBe('conv_123');
      expect(result.visitor_id).toBe('vis_123');
      expect(result.status).toBe('open');
      expect(prisma.conversation.create).not.toHaveBeenCalled();
    });

    it('should create new conversation if not found', async () => {
      const newConv = {
        id: 'conv_456',
        visitorId: 'vis_456',
        status: 'open',
        createdAt: new Date('2026-01-02'),
        updatedAt: new Date('2026-01-02'),
        metadata: {},
      };

      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.conversation.create).mockResolvedValue(newConv as any);

      const result = await getOrCreateConversation('app_123', 'device_456', {
        user: { id: 'user_123' },
      });

      expect(result.id).toBe('conv_456');
      expect(prisma.conversation.create).toHaveBeenCalled();
    });

    it('should include device_context in metadata', async () => {
      const newConv = {
        id: 'conv_789',
        visitorId: 'vis_789',
        status: 'open',
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: { device_context: { platform: 'android' } },
      };

      vi.mocked(prisma.conversation.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.conversation.create).mockResolvedValue(newConv as any);

      const result = await getOrCreateConversation('app_123', 'device_789', {
        device_context: { platform: 'android' },
      });

      expect(result.metadata).toEqual({ device_context: { platform: 'android' } });
    });
  });
});
