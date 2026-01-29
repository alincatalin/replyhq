import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { createMessage } from './messageService.js';
import { getOrCreateConversation } from './conversationService.js';
import { resolveBroadcastRecipients, type BroadcastTarget } from './broadcastService.js';
import { dispatchWebhook } from './webhookDispatchService.js';

async function sendToRecipient(appId: string, broadcastId: string, target: BroadcastTarget, body: string) {
  const conversation = await getOrCreateConversation(appId, target.deviceId, {
    user: target.userId ? { id: target.userId } : undefined,
    device_context: target.deviceContext,
  });

  await createMessage(
    conversation.id,
    {
      local_id: uuidv4(),
      body,
      device_context: target.deviceContext,
    },
    appId,
    target.deviceId,
    'agent'
  );

  const resolvedUserId = target.userId ?? target.deviceId;

  await prisma.broadcastRecipient.upsert({
    where: {
      broadcastId_deviceId: {
        broadcastId,
        deviceId: target.deviceId,
      },
    },
    update: {
      status: 'SENT',
      sentAt: new Date(),
      userId: resolvedUserId,
      errorMessage: null,
    },
    create: {
      broadcastId,
      deviceId: target.deviceId,
      userId: resolvedUserId,
      status: 'SENT',
      sentAt: new Date(),
    },
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export async function sendBroadcast(broadcastId: string): Promise<void> {
  const broadcast = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
  });

  if (!broadcast) {
    throw new Error('Broadcast not found');
  }

  if (['SENT', 'SENDING'].includes(broadcast.status)) {
    return;
  }

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: {
      status: 'SENDING',
      sentAt: broadcast.sentAt ?? new Date(),
      errorMessage: null,
    },
  });

  const recipients = await resolveBroadcastRecipients({
    appId: broadcast.appId,
    targetType: broadcast.targetType,
    segmentQuery: broadcast.segmentQuery,
    userIds: broadcast.userIds,
  });

  const uniqueRecipients = new Map<string, BroadcastTarget>();
  recipients.forEach((recipient) => {
    uniqueRecipients.set(recipient.deviceId, recipient);
  });

  const dedupedRecipients = Array.from(uniqueRecipients.values());
  let sentCount = 0;
  let failedCount = 0;

  const batches = chunk(dedupedRecipients, 10);
  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((target) => sendToRecipient(broadcast.appId, broadcast.id, target, broadcast.body))
    );

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        sentCount += 1;
      } else {
        failedCount += 1;
        const target = batch[index];
        const resolvedUserId = target.userId ?? target.deviceId;
        void prisma.broadcastRecipient.upsert({
          where: {
            broadcastId_deviceId: {
              broadcastId: broadcast.id,
              deviceId: target.deviceId,
            },
          },
          update: {
            status: 'FAILED',
            errorMessage: result.reason instanceof Error ? result.reason.message : 'Send failed',
          },
          create: {
            broadcastId: broadcast.id,
            deviceId: target.deviceId,
            userId: resolvedUserId,
            status: 'FAILED',
            errorMessage: result.reason instanceof Error ? result.reason.message : 'Send failed',
          },
        });
      }
    });
  }

  await prisma.broadcast.update({
    where: { id: broadcast.id },
    data: {
      status: failedCount > 0 && sentCount === 0 ? 'FAILED' : 'SENT',
      completedAt: new Date(),
      totalRecipients: dedupedRecipients.length,
      totalSent: sentCount,
    },
  });

  const status = failedCount > 0 && sentCount === 0 ? 'failed' : 'sent';
  void dispatchWebhook(broadcast.appId, `broadcast.${status}`, {
    broadcast_id: broadcast.id,
    title: broadcast.title,
    total_recipients: dedupedRecipients.length,
    total_sent: sentCount,
    total_failed: failedCount,
  });
}
