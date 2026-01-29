import { prisma } from '../lib/prisma.js';
import { generateConversationId, generateVisitorId } from '../utils/ids.js';
import { subscribeDeviceToConversation } from './websocketService.js';
import type { CreateConversationInput } from '../schemas/conversation.js';
import { dispatchWebhook } from './webhookDispatchService.js';

export interface ConversationResponse {
  id: string;
  visitor_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, unknown>;
}

export async function getOrCreateConversation(
  appId: string,
  deviceId: string,
  input: CreateConversationInput
): Promise<ConversationResponse> {
  const userId = input.user?.id ?? null;

  const existing = userId === null
    ? await prisma.conversation.findFirst({
        where: {
          appId,
          deviceId,
          userId: null,
        },
      })
    : await prisma.conversation.findUnique({
        where: {
          appId_deviceId_userId: {
            appId,
            deviceId,
            userId,
          },
        },
      });

  if (existing) {
    const formatted = formatConversation(existing);
    await subscribeDeviceToConversation(appId, deviceId, formatted.id);
    return formatted;
  }

  const conversation = await prisma.conversation.create({
    data: {
      id: generateConversationId(),
      visitorId: generateVisitorId(),
      appId,
      deviceId,
      userId,
      status: 'open',
      metadata: input.device_context ? { device_context: input.device_context } : {},
    },
  });

  const formatted = formatConversation(conversation);
  void dispatchWebhook(appId, 'conversation.created', {
    conversation_id: formatted.id,
    user_id: userId,
    device_id: deviceId,
    status: formatted.status,
    created_at: formatted.created_at,
  });
  await subscribeDeviceToConversation(appId, deviceId, formatted.id);
  return formatted;
}

export async function getConversationForDevice(
  appId: string,
  deviceId: string,
  conversationId: string
) {
  return prisma.conversation.findFirst({
    where: {
      id: conversationId,
      appId,
      deviceId,
    },
  });
}

function formatConversation(conv: {
  id: string;
  visitorId: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  metadata: unknown;
}): ConversationResponse {
  return {
    id: conv.id,
    visitor_id: conv.visitorId,
    status: conv.status,
    created_at: conv.createdAt.toISOString(),
    updated_at: conv.updatedAt.toISOString(),
    metadata: conv.metadata as Record<string, unknown>,
  };
}
