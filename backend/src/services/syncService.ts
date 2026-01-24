import { prisma } from '../lib/prisma.js';
import { ApiError } from '../middleware/errorHandler.js';

export interface SyncResult {
  messages: MessageSyncItem[];
  last_sequence: number;
  has_more: boolean;
}

export interface MessageSyncItem {
  id: string;
  local_id: string;
  conversation_id: string;
  body: string;
  sender: string;
  status: string;
  sequence: number;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

export async function syncMessages(
  conversationId: string,
  afterSequence: number = 0,
  limit: number = 50
): Promise<SyncResult> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });

  if (!conversation) {
    throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      sequence: { gt: afterSequence },
    },
    orderBy: { sequence: 'asc' },
    take: limit + 1,
  });

  const hasMore = messages.length > limit;
  const resultMessages = hasMore ? messages.slice(0, limit) : messages;

  const lastSequence =
    resultMessages.length > 0
      ? resultMessages[resultMessages.length - 1].sequence
      : afterSequence;

  return {
    messages: resultMessages.map(formatMessageSync),
    last_sequence: lastSequence,
    has_more: hasMore,
  };
}

export async function getLastSequence(conversationId: string): Promise<number> {
  const lastMessage = await prisma.message.findFirst({
    where: { conversationId },
    orderBy: { sequence: 'desc' },
    select: { sequence: true },
  });

  return lastMessage?.sequence || 0;
}

export async function getSyncStatus(
  conversationId: string,
  clientSequence: number
): Promise<{
  is_behind: boolean;
  messages_behind: number;
  server_sequence: number;
}> {
  const serverSequence = await getLastSequence(conversationId);

  const messagesBehind =
    clientSequence < serverSequence
      ? await prisma.message.count({
          where: {
            conversationId,
            sequence: { gt: clientSequence },
          },
        })
      : 0;

  return {
    is_behind: clientSequence < serverSequence,
    messages_behind: messagesBehind,
    server_sequence: serverSequence,
  };
}

function formatMessageSync(msg: {
  id: string;
  localId: string;
  conversationId: string;
  body: string;
  sender: string;
  status: string;
  sequence: number;
  createdAt: Date;
  deliveredAt: Date | null;
  readAt: Date | null;
}): MessageSyncItem {
  return {
    id: msg.id,
    local_id: msg.localId,
    conversation_id: msg.conversationId,
    body: msg.body,
    sender: msg.sender,
    status: msg.status,
    sequence: msg.sequence,
    created_at: msg.createdAt.toISOString(),
    delivered_at: msg.deliveredAt?.toISOString() || null,
    read_at: msg.readAt?.toISOString() || null,
  };
}
