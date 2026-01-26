import { prisma } from '../lib/prisma.js';
import { generateMessageId } from '../utils/ids.js';
import { ApiError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';
import type { CreateMessageInput } from '../schemas/message.js';
import { broadcastToConversation } from './socketService.js';
import { getConversationForDevice } from './conversationService.js';
import { sendPushNotification } from './pushNotificationService.js';

export interface MessageResponse {
  id: string;
  local_id: string;
  conversation_id: string;
  body: string;
  sender: 'user' | 'agent' | 'system';
  created_at: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

export async function createMessage(
  conversationId: string,
  input: CreateMessageInput,
  appId: string,
  deviceId: string,
  sender: 'user' | 'agent' | 'system' = 'user'
): Promise<MessageResponse> {
  const conversation = await getConversationForDevice(appId, deviceId, conversationId);

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
  }

  if (input.body.length > config.message.maxLength) {
    throw new ApiError(
      400,
      'Message too long',
      'MESSAGE_TOO_LONG',
      `Message body cannot exceed ${config.message.maxLength} characters`
    );
  }

  const messageId = generateMessageId();

  try {
    const message = await prisma.message.upsert({
      where: { localId: input.local_id },
      update: {},
      create: {
        id: messageId,
        localId: input.local_id,
        conversationId,
        appId, // Required for RLS
        body: input.body,
        sender,
        status: 'SENT',
      },
    });

    const formattedMessage = formatMessage(message);

    const isNewMessage = message.id === messageId;
    if (isNewMessage) {
      broadcastToConversation(conversationId, 'message:new', formattedMessage);

      if (sender !== 'user') {
        void sendPushNotification(conversation.appId, conversation.deviceId, formattedMessage);
      }
    }

    return formattedMessage;
  } catch (error) {
    const existingMessage = await prisma.message.findUnique({
      where: { localId: input.local_id },
    });

    if (existingMessage) {
      return formatMessage(existingMessage);
    }

    throw error;
  }
}

export async function getMessages(
  conversationId: string,
  appId: string,
  deviceId: string,
  after?: number,
  limit: number = config.message.defaultLimit
): Promise<{ messages: MessageResponse[]; has_more: boolean }> {
  const conversation = await getConversationForDevice(appId, deviceId, conversationId);

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
  }

  const whereClause: { conversationId: string; createdAt?: { gt: Date } } = {
    conversationId,
  };

  if (after) {
    whereClause.createdAt = { gt: new Date(after) };
  }

  const messages = await prisma.message.findMany({
    where: whereClause,
    orderBy: { createdAt: 'asc' },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const resultMessages = hasMore ? messages.slice(0, limit) : messages;

  return {
    messages: resultMessages.map(formatMessage),
    has_more: hasMore,
  };
}

function formatMessage(msg: {
  id: string;
  localId: string;
  conversationId: string;
  body: string;
  sender: string;
  createdAt: Date;
  status: string;
}): MessageResponse {
  return {
    id: msg.id,
    local_id: msg.localId,
    conversation_id: msg.conversationId,
    body: msg.body,
    sender: msg.sender as MessageResponse['sender'],
    created_at: msg.createdAt.toISOString(),
    status: msg.status as MessageResponse['status'],
  };
}
