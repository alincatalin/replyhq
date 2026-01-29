import express, { Request, Response, NextFunction, type IRouter } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';
import { sendBroadcast } from '../services/broadcastSender.js';

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

function buildStats(broadcast: {
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
}) {
  const openRate = broadcast.totalRecipients > 0 ? broadcast.totalOpened / broadcast.totalRecipients : 0;
  const clickRate = broadcast.totalRecipients > 0 ? broadcast.totalClicked / broadcast.totalRecipients : 0;

  return {
    totalRecipients: broadcast.totalRecipients,
    totalSent: broadcast.totalSent,
    totalDelivered: broadcast.totalDelivered,
    totalOpened: broadcast.totalOpened,
    totalClicked: broadcast.totalClicked,
    openRate,
    clickRate,
  };
}

router.get('/', requireJWT, requirePermission(Permission.VIEW_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const status = req.query.status as string | undefined;
    const limit = normalizeLimit(req.query.limit, 50);
    const offset = normalizeOffset(req.query.offset);

    const whereClause: any = { appId };
    if (status) {
      whereClause.status = status.toUpperCase();
    }

    const [broadcasts, total] = await Promise.all([
      prisma.broadcast.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          title: true,
          status: true,
          targetType: true,
          scheduledAt: true,
          sentAt: true,
          completedAt: true,
          totalRecipients: true,
          totalSent: true,
          totalDelivered: true,
          totalOpened: true,
          totalClicked: true,
          createdAt: true,
        },
      }),
      prisma.broadcast.count({ where: whereClause }),
    ]);

    res.json({
      broadcasts: broadcasts.map((broadcast) => ({
        id: broadcast.id,
        title: broadcast.title,
        status: broadcast.status.toLowerCase(),
        targetType: broadcast.targetType,
        scheduledAt: broadcast.scheduledAt,
        sentAt: broadcast.sentAt,
        completedAt: broadcast.completedAt,
        stats: buildStats(broadcast),
        createdAt: broadcast.createdAt,
      })),
      total,
      hasMore: offset + broadcasts.length < total,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireJWT, requirePermission(Permission.CREATE_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId, userId } = req.jwtPayload!;
    const { title, body, data, targetType, segmentQuery, userIds, scheduledAt } = req.body;

    if (!title || !body || !targetType) {
      return res.status(400).json({
        error: 'Missing required fields',
        code: 'MISSING_FIELDS',
        message: 'title, body, and targetType are required',
      });
    }

    const normalizedTarget = String(targetType).toUpperCase();

    if (normalizedTarget === 'SEGMENT' && !segmentQuery) {
      return res.status(400).json({
        error: 'Missing segment query',
        code: 'MISSING_SEGMENT_QUERY',
      });
    }

    if (normalizedTarget === 'SPECIFIC_USERS' && (!Array.isArray(userIds) || userIds.length === 0)) {
      return res.status(400).json({
        error: 'Missing user IDs',
        code: 'MISSING_USER_IDS',
      });
    }

    const scheduled = scheduledAt ? new Date(scheduledAt) : null;
    const status = scheduled ? 'SCHEDULED' : 'DRAFT';

    const broadcast = await prisma.broadcast.create({
      data: {
        appId,
        title,
        body,
        data: data ?? undefined,
        targetType: normalizedTarget,
        segmentQuery: segmentQuery ?? undefined,
        userIds: Array.isArray(userIds) ? userIds : [],
        status,
        scheduledAt: scheduled ?? undefined,
        createdBy: userId,
      },
      select: {
        id: true,
        title: true,
        status: true,
        targetType: true,
        totalRecipients: true,
        createdAt: true,
      },
    });

    res.status(201).json({
      id: broadcast.id,
      title: broadcast.title,
      status: broadcast.status.toLowerCase(),
      targetType: broadcast.targetType,
      totalRecipients: broadcast.totalRecipients,
      createdAt: broadcast.createdAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', requireJWT, requirePermission(Permission.VIEW_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!broadcast) {
      return res.status(404).json({
        error: 'Broadcast not found',
        code: 'BROADCAST_NOT_FOUND',
      });
    }

    res.json({
      id: broadcast.id,
      title: broadcast.title,
      body: broadcast.body,
      data: broadcast.data,
      targetType: broadcast.targetType,
      status: broadcast.status.toLowerCase(),
      scheduledAt: broadcast.scheduledAt,
      sentAt: broadcast.sentAt,
      completedAt: broadcast.completedAt,
      stats: buildStats(broadcast),
      createdAt: broadcast.createdAt,
      updatedAt: broadcast.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireJWT, requirePermission(Permission.EDIT_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const { title, body, data, targetType, segmentQuery, userIds, scheduledAt } = req.body;

    const existing = await prisma.broadcast.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Broadcast not found',
        code: 'BROADCAST_NOT_FOUND',
      });
    }

    if (!['DRAFT', 'SCHEDULED'].includes(existing.status)) {
      return res.status(400).json({
        error: 'Broadcast cannot be edited',
        code: 'BROADCAST_LOCKED',
      });
    }

    const normalizedTarget = targetType ? String(targetType).toUpperCase() : undefined;
    const scheduled = scheduledAt ? new Date(scheduledAt) : null;

    const updated = await prisma.broadcast.update({
      where: { id: existing.id },
      data: {
        title: title ?? undefined,
        body: body ?? undefined,
        data: data ?? undefined,
        targetType: normalizedTarget ?? undefined,
        segmentQuery: segmentQuery ?? undefined,
        userIds: Array.isArray(userIds) ? userIds : undefined,
        scheduledAt: scheduled ?? undefined,
        status: scheduled ? 'SCHEDULED' : 'DRAFT',
      },
      select: {
        id: true,
        title: true,
        status: true,
        scheduledAt: true,
        updatedAt: true,
      },
    });

    res.json({
      id: updated.id,
      title: updated.title,
      status: updated.status.toLowerCase(),
      scheduledAt: updated.scheduledAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', requireJWT, requirePermission(Permission.DELETE_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const existing = await prisma.broadcast.findFirst({
      where: { id: req.params.id, appId },
      select: { id: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Broadcast not found',
        code: 'BROADCAST_NOT_FOUND',
      });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({
        error: 'Only draft broadcasts can be deleted',
        code: 'BROADCAST_LOCKED',
      });
    }

    await prisma.broadcast.delete({ where: { id: existing.id } });

    res.json({ success: true, message: 'Broadcast deleted' });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/send', requireJWT, requirePermission(Permission.SEND_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const { sendAt } = req.body;

    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!broadcast) {
      return res.status(404).json({
        error: 'Broadcast not found',
        code: 'BROADCAST_NOT_FOUND',
      });
    }

    const scheduled = sendAt && sendAt !== 'now' ? new Date(sendAt) : null;

    if (scheduled) {
      const updated = await prisma.broadcast.update({
        where: { id: broadcast.id },
        data: {
          status: 'SCHEDULED',
          scheduledAt: scheduled,
        },
        select: {
          id: true,
          status: true,
          totalRecipients: true,
          sentAt: true,
          scheduledAt: true,
        },
      });

      return res.json({
        id: updated.id,
        status: updated.status.toLowerCase(),
        totalRecipients: updated.totalRecipients,
        sentAt: updated.sentAt,
        scheduledAt: updated.scheduledAt,
      });
    }

    await sendBroadcast(broadcast.id);

    const refreshed = await prisma.broadcast.findUnique({
      where: { id: broadcast.id },
      select: {
        id: true,
        status: true,
        totalRecipients: true,
        sentAt: true,
        scheduledAt: true,
      },
    });

    res.json({
      id: refreshed?.id ?? broadcast.id,
      status: refreshed?.status?.toLowerCase() ?? 'sending',
      totalRecipients: refreshed?.totalRecipients ?? 0,
      sentAt: refreshed?.sentAt ?? null,
      scheduledAt: refreshed?.scheduledAt ?? null,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/cancel', requireJWT, requirePermission(Permission.SEND_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const existing = await prisma.broadcast.findFirst({
      where: { id: req.params.id, appId },
    });

    if (!existing) {
      return res.status(404).json({
        error: 'Broadcast not found',
        code: 'BROADCAST_NOT_FOUND',
      });
    }

    if (existing.status !== 'SCHEDULED') {
      return res.status(400).json({
        error: 'Only scheduled broadcasts can be cancelled',
        code: 'BROADCAST_NOT_SCHEDULED',
      });
    }

    const updated = await prisma.broadcast.update({
      where: { id: existing.id },
      data: { status: 'CANCELLED' },
      select: { id: true, status: true },
    });

    res.json({
      id: updated.id,
      status: updated.status.toLowerCase(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/recipients', requireJWT, requirePermission(Permission.VIEW_BROADCASTS), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { appId } = req.jwtPayload!;
    const limit = normalizeLimit(req.query.limit, 50);
    const offset = normalizeOffset(req.query.offset);
    const status = req.query.status as string | undefined;

    const broadcast = await prisma.broadcast.findFirst({
      where: { id: req.params.id, appId },
      select: { id: true },
    });

    if (!broadcast) {
      return res.status(404).json({
        error: 'Broadcast not found',
        code: 'BROADCAST_NOT_FOUND',
      });
    }

    const whereClause: any = { broadcastId: broadcast.id };
    if (status) {
      whereClause.status = status.toUpperCase();
    }

    const [recipients, total] = await Promise.all([
      prisma.broadcastRecipient.findMany({
        where: whereClause,
        orderBy: { sentAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.broadcastRecipient.count({ where: whereClause }),
    ]);

    res.json({
      recipients: recipients.map((recipient) => ({
        userId: recipient.userId,
        deviceId: recipient.deviceId,
        status: recipient.status.toLowerCase(),
        sentAt: recipient.sentAt,
        deliveredAt: recipient.deliveredAt,
        openedAt: recipient.openedAt,
        clickedAt: recipient.clickedAt,
        metadata: recipient.metadata,
      })),
      total,
      hasMore: offset + recipients.length < total,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
