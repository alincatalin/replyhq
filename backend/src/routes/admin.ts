import express, { Request, Response, NextFunction, type IRouter } from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { generateConversationId, generateVisitorId } from '../utils/ids.js';
import { prisma } from '../lib/prisma.js';
import { createMessage } from '../services/messageService.js';
import { getConversationPresence } from '../services/presenceService.js';
import { config } from '../config/index.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';

/**
 * Basic HTML sanitization to prevent XSS in admin dashboard
 * Escapes HTML special characters
 */
function sanitizeHtml(html: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return html.replace(/[&<>"'/]/g, (char) => map[char] || char);
}

const router: IRouter = express.Router();

router.get('/', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  const filePath = path.join(__dirname, '../admin/index.html');
  res.sendFile(filePath);
});

router.get('/api/users', requireJWT, requirePermission(Permission.VIEW_USERS), async (req, res, next) => {
  try {
    const { appId } = req.jwtPayload!;

    const conversations = await prisma.conversation.findMany({
      where: { appId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        deviceId: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        metadata: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            body: true,
            sender: true,
            createdAt: true,
          },
        },
      },
    });

    const devices = await prisma.device.findMany({
      where: { appId },
      select: {
        deviceId: true,
        userId: true,
        platform: true,
        pushToken: true,
        pushTokenProvider: true,
        pushTokenUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const presence = await getConversationPresence(
      appId,
      conversations.map((conv) => conv.deviceId)
    );

    type UserAggregate = {
      key: string;
      userId: string | null;
      deviceIds: Set<string>;
      conversationCount: number;
      primaryConversationId: string | null;
      lastMessage: string | null;
      lastSender: string | null;
      lastMessageAt: Date | null;
      lastSeenAt: Date | null;
      createdAt: Date | null;
      profileName: string | null;
      profileEmail: string | null;
      profileAttributes: Record<string, unknown> | null;
      profileUpdatedAt: Date | null;
      isOnline: boolean;
      displayName: string;
    };

    const usersMap = new Map<string, UserAggregate>();

    const ensureUser = (key: string, userId: string | null, deviceId: string): UserAggregate => {
      const existing = usersMap.get(key);
      if (existing) return existing;
      const displayName = userId ? `User ${userId}` : `Visitor ${deviceId.slice(0, 6)}`;
      const fresh: UserAggregate = {
        key,
        userId,
        deviceIds: new Set(),
        conversationCount: 0,
        primaryConversationId: null,
        lastMessage: null,
        lastSender: null,
        lastMessageAt: null,
        lastSeenAt: null,
        createdAt: null,
        profileName: null,
        profileEmail: null,
        profileAttributes: null,
        profileUpdatedAt: null,
        isOnline: false,
        displayName,
      };
      usersMap.set(key, fresh);
      return fresh;
    };

    for (const conv of conversations) {
      const key = conv.userId ? `user:${conv.userId}` : `device:${conv.deviceId}`;
      const user = ensureUser(key, conv.userId, conv.deviceId);
      user.deviceIds.add(conv.deviceId);
      user.conversationCount += 1;

      if (!user.primaryConversationId) {
        user.primaryConversationId = conv.id;
      }

      const isOnline = presence.get(conv.deviceId) ?? false;
      if (isOnline) user.isOnline = true;

      const lastSeenCandidate = conv.updatedAt;
      if (!user.lastSeenAt || lastSeenCandidate > user.lastSeenAt) {
        user.lastSeenAt = lastSeenCandidate;
        user.primaryConversationId = conv.id;
      }

      if (!user.createdAt || conv.createdAt < user.createdAt) {
        user.createdAt = conv.createdAt;
      }

      const lastMessage = conv.messages[0];
      if (lastMessage?.createdAt) {
        if (!user.lastMessageAt || lastMessage.createdAt > user.lastMessageAt) {
          user.lastMessageAt = lastMessage.createdAt;
          user.lastMessage = lastMessage.body ? sanitizeHtml(lastMessage.body) : null;
          user.lastSender = lastMessage.sender ?? null;
        }
      }

      const metadata = (conv.metadata ?? {}) as Record<string, unknown>;
      const userMeta = metadata.user && typeof metadata.user === 'object' ? (metadata.user as Record<string, unknown>) : null;
      if (userMeta) {
        const updatedAt = conv.updatedAt;
        if (!user.profileUpdatedAt || updatedAt > user.profileUpdatedAt) {
          user.profileUpdatedAt = updatedAt;
          user.profileName = typeof userMeta.name === 'string' ? userMeta.name : null;
          user.profileEmail = typeof userMeta.email === 'string' ? userMeta.email : null;
          user.profileAttributes = (userMeta.attributes ?? null) as Record<string, unknown> | null;
        }
      }
    }

    for (const device of devices) {
      const key = device.userId ? `user:${device.userId}` : `device:${device.deviceId}`;
      const user = ensureUser(key, device.userId, device.deviceId);
      user.deviceIds.add(device.deviceId);
      if (!user.createdAt || device.createdAt < user.createdAt) {
        user.createdAt = device.createdAt;
      }
      if (!user.lastSeenAt || device.updatedAt > user.lastSeenAt) {
        user.lastSeenAt = device.updatedAt;
      }
    }

    const users = Array.from(usersMap.values())
      .map((user) => {
        const displayName = user.profileName
          ? sanitizeHtml(user.profileName)
          : user.displayName;
        return {
          user_key: user.key,
          user_id: user.userId,
          device_ids: Array.from(user.deviceIds),
          conversation_count: user.conversationCount,
          primary_conversation_id: user.primaryConversationId,
          last_message: user.lastMessage,
          last_sender: user.lastSender,
          last_message_at: user.lastMessageAt ? user.lastMessageAt.toISOString() : null,
          last_seen_at: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
          created_at: user.createdAt ? user.createdAt.toISOString() : null,
          is_online: user.isOnline,
          display_name: displayName,
        };
      })
      .sort((a, b) => {
        const aTime = a.last_seen_at ? new Date(a.last_seen_at).getTime() : 0;
        const bTime = b.last_seen_at ? new Date(b.last_seen_at).getTime() : 0;
        return bTime - aTime;
      });

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.get('/api/conversations', requireJWT, requirePermission(Permission.VIEW_CONVERSATIONS), async (req, res, next) => {
  try {
    const { appId } = req.jwtPayload!;

    const conversations = await prisma.conversation.findMany({
      where: { appId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        deviceId: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        metadata: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            body: true,
            sender: true,
            createdAt: true,
          },
        },
      },
    });

    const presence = await getConversationPresence(
      appId,
      conversations.map((conv) => conv.deviceId)
    );

    const items = conversations.map((conv) => {
      const lastMessage = conv.messages[0];
      const metadata = (conv.metadata ?? {}) as Record<string, unknown>;
      const deviceContext = (metadata.device_context ?? {}) as Record<string, unknown>;

      return {
        conversation_id: conv.id,
        user_id: conv.userId,
        device_id: conv.deviceId,
        status: conv.status,
        updated_at: conv.updatedAt.toISOString(),
        created_at: conv.createdAt.toISOString(),
        device_context: deviceContext,
        last_message: lastMessage?.body ? sanitizeHtml(lastMessage.body) : null,
        last_sender: lastMessage?.sender ?? null,
        last_message_at: lastMessage?.createdAt.toISOString() ?? null,
        is_online: presence.get(conv.deviceId) ?? false,
        display_name: conv.userId ? `User ${conv.userId}` : `Visitor ${conv.deviceId.slice(0, 6)}`,
      };
    });

    res.json({ conversations: items });
  } catch (error) {
    next(error);
  }
});

router.get('/api/users/:userKey', requireJWT, requirePermission(Permission.VIEW_USERS), async (req, res, next) => {
  try {
    const { appId } = req.jwtPayload!;
    const { userKey } = req.params;

    const [type, ...rest] = userKey.split(':');
    const identifier = rest.join(':');

    if (!type || !identifier || (type !== 'user' && type !== 'device')) {
      return res.status(400).json({
        error: 'Invalid user key',
        code: 'INVALID_USER_KEY',
      });
    }

    const userId = type === 'user' ? identifier : null;
    const deviceId = type === 'device' ? identifier : null;

    const conversations = await prisma.conversation.findMany({
      where: {
        appId,
        ...(userId ? { userId } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        userId: true,
        deviceId: true,
        status: true,
        updatedAt: true,
        createdAt: true,
        metadata: true,
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: {
            body: true,
            sender: true,
            createdAt: true,
          },
        },
      },
    });

    const devices = await prisma.device.findMany({
      where: {
        appId,
        ...(userId ? { userId } : {}),
        ...(deviceId ? { deviceId } : {}),
      },
      select: {
        deviceId: true,
        userId: true,
        platform: true,
        pushToken: true,
        pushTokenProvider: true,
        pushTokenUpdatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const presence = await getConversationPresence(
      appId,
      conversations.map((conv) => conv.deviceId)
    );

    let profileName: string | null = null;
    let profileEmail: string | null = null;
    let profileAttributes: Record<string, unknown> | null = null;
    let profileUpdatedAt: Date | null = null;
    let deviceContext: Record<string, unknown> | null = null;
    let deviceContextUpdatedAt: Date | null = null;

    let createdAt: Date | null = null;
    let lastSeenAt: Date | null = null;
    let isOnline = false;
    const formatDate = (value?: Date | null): string | null => (value ? value.toISOString() : null);

    const normalizedConversations = conversations.map((conv) => {
      const lastMessage = conv.messages[0];
      const metadata = (conv.metadata ?? {}) as Record<string, unknown>;
      const userMeta = metadata.user && typeof metadata.user === 'object' ? (metadata.user as Record<string, unknown>) : null;
      const currentDeviceContext = metadata.device_context && typeof metadata.device_context === 'object'
        ? (metadata.device_context as Record<string, unknown>)
        : null;

      if (userMeta) {
        if (!profileUpdatedAt || conv.updatedAt > profileUpdatedAt) {
          profileUpdatedAt = conv.updatedAt;
          profileName = typeof userMeta.name === 'string' ? userMeta.name : null;
          profileEmail = typeof userMeta.email === 'string' ? userMeta.email : null;
          profileAttributes = (userMeta.attributes ?? null) as Record<string, unknown> | null;
        }
      }

      if (currentDeviceContext) {
        if (!deviceContextUpdatedAt || conv.updatedAt > deviceContextUpdatedAt) {
          deviceContext = currentDeviceContext;
          deviceContextUpdatedAt = conv.updatedAt;
        }
      }

      if (!createdAt || conv.createdAt < createdAt) {
        createdAt = conv.createdAt;
      }

      if (!lastSeenAt || conv.updatedAt > lastSeenAt) {
        lastSeenAt = conv.updatedAt;
      }

      const online = presence.get(conv.deviceId) ?? false;
      if (online) isOnline = true;

      return {
        id: conv.id,
        user_id: conv.userId,
        device_id: conv.deviceId,
        status: conv.status,
        updated_at: conv.updatedAt.toISOString(),
        created_at: conv.createdAt.toISOString(),
        last_message: lastMessage?.body ? sanitizeHtml(lastMessage.body) : null,
        last_sender: lastMessage?.sender ?? null,
        last_message_at: lastMessage?.createdAt.toISOString() ?? null,
      };
    });

    devices.forEach((device) => {
      if (!createdAt || device.createdAt < createdAt) {
        createdAt = device.createdAt;
      }
      if (!lastSeenAt || device.updatedAt > lastSeenAt) {
        lastSeenAt = device.updatedAt;
      }
    });

    const broadcastRecipients = await prisma.broadcastRecipient.findMany({
      where: {
        userId: userId ?? deviceId ?? '',
        broadcast: { appId },
      },
      select: {
        status: true,
        sentAt: true,
        deliveredAt: true,
        openedAt: true,
        clickedAt: true,
        errorMessage: true,
        broadcast: {
          select: {
            id: true,
            title: true,
            status: true,
            targetType: true,
            scheduledAt: true,
            sentAt: true,
            completedAt: true,
            createdAt: true,
          },
        },
      },
    });

    const broadcasts = broadcastRecipients
      .map((recipient) => ({
        id: recipient.broadcast.id,
        title: sanitizeHtml(recipient.broadcast.title),
        broadcast_status: recipient.broadcast.status,
        recipient_status: recipient.status,
        target_type: recipient.broadcast.targetType,
        scheduled_at: recipient.broadcast.scheduledAt?.toISOString() ?? null,
        sent_at: recipient.broadcast.sentAt?.toISOString() ?? null,
        completed_at: recipient.broadcast.completedAt?.toISOString() ?? null,
        created_at: recipient.broadcast.createdAt.toISOString(),
        recipient_sent_at: recipient.sentAt?.toISOString() ?? null,
        recipient_delivered_at: recipient.deliveredAt?.toISOString() ?? null,
        recipient_opened_at: recipient.openedAt?.toISOString() ?? null,
        recipient_clicked_at: recipient.clickedAt?.toISOString() ?? null,
        error_message: recipient.errorMessage ? sanitizeHtml(recipient.errorMessage) : null,
      }))
      .sort((a, b) => {
        const aTime = new Date(a.sent_at || a.created_at).getTime();
        const bTime = new Date(b.sent_at || b.created_at).getTime();
        return bTime - aTime;
      });

    const displayName = profileName ? sanitizeHtml(profileName) : userId ? `User ${userId}` : `Visitor ${identifier.slice(0, 6)}`;

    res.json({
      user: {
        user_key: userKey,
        user_id: userId,
        device_id: deviceId,
        display_name: displayName,
        name: profileName ? sanitizeHtml(profileName) : null,
        email: profileEmail ? sanitizeHtml(profileEmail) : null,
        attributes: profileAttributes,
        device_context: deviceContext,
        devices: devices.map((device) => ({
          device_id: device.deviceId,
          user_id: device.userId,
          platform: device.platform,
          push_token_provider: device.pushTokenProvider,
          push_token_updated_at: device.pushTokenUpdatedAt?.toISOString() ?? null,
          created_at: device.createdAt.toISOString(),
          updated_at: device.updatedAt.toISOString(),
        })),
        created_at: formatDate(createdAt),
        last_seen_at: formatDate(lastSeenAt),
        is_online: isOnline,
      },
      conversations: normalizedConversations,
      broadcasts,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/dashboard/stats', requireJWT, requirePermission(Permission.VIEW_CONVERSATIONS), async (req, res, next) => {
  try {
    const { appId } = req.jwtPayload!;

    const [totalConversations, openConversations, resolvedConversations, deviceRows] = await Promise.all([
      prisma.conversation.count({ where: { appId } }),
      prisma.conversation.count({ where: { appId, status: 'open' } }),
      prisma.conversation.count({ where: { appId, status: 'resolved' } }),
      prisma.conversation.findMany({
        where: { appId },
        select: { deviceId: true },
      }),
    ]);

    const deviceIds = deviceRows.map((row) => row.deviceId);
    const presence = await getConversationPresence(appId, deviceIds);
    let onlineConversations = 0;
    presence.forEach((isOnline) => {
      if (isOnline) onlineConversations += 1;
    });

    res.json({
      total_conversations: totalConversations,
      open_conversations: openConversations,
      resolved_conversations: resolvedConversations,
      online_conversations: onlineConversations,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/conversations/:id/messages', requireJWT, requirePermission(Permission.VIEW_CONVERSATIONS), async (req, res, next) => {
  try {
    const { appId } = req.jwtPayload!;
    const conversationId = req.params.id;
    const after = req.query.after ? Number(req.query.after) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : Math.min(200, config.message.defaultLimit * 4);

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, appId },
      select: { id: true },
    });

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND',
      });
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
      take: limit,
    });

    res.json({
      messages: messages.map((message) => ({
        id: message.id,
        local_id: message.localId,
        conversation_id: message.conversationId,
        body: sanitizeHtml(message.body),
        sender: message.sender,
        created_at: message.createdAt.toISOString(),
        status: message.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/conversations/:id/messages', requireJWT, requirePermission(Permission.SEND_MESSAGES), async (req, res, next) => {
  try {
    const { appId } = req.jwtPayload!;
    const conversationId = req.params.id;
    const body = req.body?.body as string | undefined;

    if (!body || !body.trim()) {
      return res.status(400).json({
        error: 'Message body is required',
        code: 'MISSING_BODY',
      });
    }

    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, appId },
      select: { deviceId: true },
    });

    if (!conversation) {
      return res.status(404).json({
        error: 'Conversation not found',
        code: 'CONVERSATION_NOT_FOUND',
      });
    }

    const message = await createMessage(
      conversationId,
      {
        local_id: uuidv4(),
        body,
      },
      appId,
      conversation.deviceId,
      'agent'
    );

    res.json({ message });
  } catch (error) {
    next(error);
  }
});

router.post('/api/conversations', requireJWT, requirePermission(Permission.MANAGE_CONVERSATIONS), async (req, res, next) => {
  try {
    const { appId } = req.jwtPayload!;
    const deviceId = (req.body?.device_id as string | undefined)?.trim();
    const userId = (req.body?.user_id as string | undefined)?.trim();
    const deviceContext = req.body?.device_context;

    if (!deviceId) {
      return res.status(400).json({
        error: 'Device ID is required',
        code: 'MISSING_DEVICE_ID',
      });
    }

    // Ensure device exists for future push notifications
    await prisma.device.upsert({
      where: { appId_deviceId: { appId, deviceId } },
      update: {},
      create: {
        appId,
        deviceId,
        userId: userId || null,
        platform: 'unknown',
      },
    });

    const conversation = await prisma.conversation.create({
      data: {
        id: generateConversationId(),
        visitorId: generateVisitorId(),
        appId,
        deviceId,
        userId: userId || null,
        status: 'open',
        metadata: deviceContext ? { device_context: deviceContext } : {},
      },
    });

    res.json({
      conversation: {
        id: conversation.id,
        device_id: conversation.deviceId,
        user_id: conversation.userId,
        status: conversation.status,
        created_at: conversation.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
