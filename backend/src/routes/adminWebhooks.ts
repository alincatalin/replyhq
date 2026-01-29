import express, { Request, Response, NextFunction, type IRouter } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';

const router: IRouter = express.Router();

function normalizeLimit(value: unknown, fallback = 50): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 200);
}

function normalizeOffset(value: unknown): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

function generateSecret(): string {
  return crypto.randomBytes(24).toString('hex');
}

router.get('/', requireJWT, requirePermission(Permission.VIEW_WEBHOOKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const limit = normalizeLimit(req.query.limit, 50);
    const offset = normalizeOffset(req.query.offset);

    const [webhooks, total] = await Promise.all([
      prisma.webhook.findMany({
        where: { appId },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.webhook.count({ where: { appId } }),
    ]);

    res.json({
      webhooks: webhooks.map((webhook) => ({
        id: webhook.id,
        url: webhook.url,
        events: webhook.events,
        isActive: webhook.isActive,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      })),
      total,
      hasMore: offset + webhooks.length < total,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireJWT, requirePermission(Permission.MANAGE_WEBHOOKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const { url, events, isActive } = req.body;

    if (!url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        code: 'MISSING_FIELDS',
        message: 'url and events are required',
      });
    }

    const webhook = await prisma.webhook.create({
      data: {
        appId,
        url,
        events,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
        secret: generateSecret(),
      },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireJWT, requirePermission(Permission.MANAGE_WEBHOOKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const { url, events, isActive } = req.body;

    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!webhook) {
      return res.status(404).json({
        error: 'Webhook not found',
        code: 'WEBHOOK_NOT_FOUND',
      });
    }

    const updated = await prisma.webhook.update({
      where: { id: webhook.id },
      data: {
        url: url ?? undefined,
        events: Array.isArray(events) ? events : undefined,
        isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      },
      select: {
        id: true,
        url: true,
        events: true,
        isActive: true,
        updatedAt: true,
      },
    });

    res.json({
      id: updated.id,
      url: updated.url,
      events: updated.events,
      isActive: updated.isActive,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireJWT, requirePermission(Permission.MANAGE_WEBHOOKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, appId },
      select: { id: true },
    });

    if (!webhook) {
      return res.status(404).json({
        error: 'Webhook not found',
        code: 'WEBHOOK_NOT_FOUND',
      });
    }

    await prisma.webhook.delete({ where: { id: webhook.id } });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/test', requireJWT, requirePermission(Permission.MANAGE_WEBHOOKS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const webhook = await prisma.webhook.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!webhook) {
      return res.status(404).json({
        error: 'Webhook not found',
        code: 'WEBHOOK_NOT_FOUND',
      });
    }

    const payload = {
      event: 'webhook.test',
      app_id: appId,
      timestamp: new Date().toISOString(),
    };
    const body = JSON.stringify(payload);
    const signature = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');

    let status = 'success';
    let httpStatus: number | null = null;
    let responseBody: string | null = null;

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ReplyHQ-Signature': `sha256=${signature}`,
        },
        body,
      });
      httpStatus = response.status;
      responseBody = await response.text();
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
        event: payload.event,
        payload,
        status,
        httpStatus: httpStatus ?? undefined,
        responseBody: responseBody ?? undefined,
        deliveredAt: status === 'success' ? new Date() : undefined,
      },
    });

    res.json({ success: status === 'success', status, httpStatus, responseBody });
  } catch (error) {
    next(error);
  }
});

export default router;
