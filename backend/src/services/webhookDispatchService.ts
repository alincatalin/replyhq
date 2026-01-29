import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';

export type WebhookPayload = {
  event: string;
  app_id: string;
  timestamp: string;
  data: Record<string, any>;
};

async function postWebhook(url: string, secret: string, payload: WebhookPayload) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret).update(body).digest('hex');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ReplyHQ-Signature': `sha256=${signature}`,
    },
    body,
  });

  const responseBody = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    responseBody,
  };
}

export async function dispatchWebhook(appId: string, event: string, data: Record<string, any>): Promise<void> {
  const webhooks = await prisma.webhook.findMany({
    where: {
      appId,
      isActive: true,
      events: { has: event },
    },
  });

  if (webhooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    app_id: appId,
    timestamp: new Date().toISOString(),
    data,
  };

  await Promise.all(
    webhooks.map(async (webhook) => {
      let status = 'success';
      let httpStatus: number | null = null;
      let responseBody: string | null = null;

      try {
        const response = await postWebhook(webhook.url, webhook.secret, payload);
        httpStatus = response.status;
        responseBody = response.responseBody;
        if (!response.ok) {
          status = 'failed';
        }
      } catch (error) {
        status = 'failed';
        responseBody = error instanceof Error ? error.message : 'Request failed';
      }

      await prisma.webhookDelivery.create({
        data: {
          webhookId: webhook.id,
          event,
          payload,
          status,
          httpStatus: httpStatus ?? undefined,
          responseBody: responseBody ?? undefined,
          deliveredAt: status === 'success' ? new Date() : undefined,
        },
      });
    })
  );
}
