import { prisma } from '../lib/prisma.js';
import { broadcastToConversation } from './websocketService.js';
import { ApiError } from '../middleware/errorHandler.js';

export type MessageStatus = 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface StatusUpdate {
  message_id: string;
  status: MessageStatus;
  updated_at: string;
}

export async function updateMessageStatus(
  messageId: string,
  status: MessageStatus,
  conversationId?: string
): Promise<StatusUpdate> {
  const message = await prisma.message.update({
    where: { id: messageId },
    data: { status },
    select: {
      id: true,
      conversationId: true,
      status: true,
    },
  });

  const update: StatusUpdate = {
    message_id: message.id,
    status: message.status as MessageStatus,
    updated_at: new Date().toISOString(),
  };

  const convId = conversationId || message.conversationId;
  broadcastToConversation(convId, {
    type: 'message.status',
    ...update,
  });

  return update;
}

export async function markMessagesDelivered(
  conversationId: string,
  messageIds: string[]
): Promise<StatusUpdate[]> {
  const updates: StatusUpdate[] = [];

  for (const messageId of messageIds) {
    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
        select: { status: true, conversationId: true },
      });

      if (!message) continue;
      if (message.conversationId !== conversationId) continue;
      if (message.status === 'DELIVERED' || message.status === 'READ') continue;

      const update = await updateMessageStatus(messageId, 'DELIVERED', conversationId);
      updates.push(update);
    } catch (error) {
      console.error(`Failed to mark message ${messageId} as delivered:`, error);
    }
  }

  return updates;
}

export async function markMessagesRead(
  conversationId: string,
  upToMessageId?: string
): Promise<StatusUpdate[]> {
  const updates: StatusUpdate[] = [];

  let whereClause: {
    conversationId: string;
    status: { in: string[] };
    sender: string;
    createdAt?: { lte: Date };
  } = {
    conversationId,
    status: { in: ['SENT', 'DELIVERED'] },
    sender: 'agent',
  };

  if (upToMessageId) {
    const upToMessage = await prisma.message.findUnique({
      where: { id: upToMessageId },
      select: { createdAt: true },
    });

    if (upToMessage) {
      whereClause.createdAt = { lte: upToMessage.createdAt };
    }
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  for (const message of messages) {
    try {
      const update = await updateMessageStatus(message.id, 'READ', conversationId);
      updates.push(update);
    } catch (error) {
      console.error(`Failed to mark message ${message.id} as read:`, error);
    }
  }

  if (updates.length > 0) {
    broadcastToConversation(conversationId, {
      type: 'messages.read',
      conversation_id: conversationId,
      message_ids: updates.map((u) => u.message_id),
      read_at: new Date().toISOString(),
    });
  }

  return updates;
}

export async function getUnreadCount(conversationId: string): Promise<number> {
  const count = await prisma.message.count({
    where: {
      conversationId,
      sender: 'agent',
      status: { in: ['SENT', 'DELIVERED'] },
    },
  });

  return count;
}
