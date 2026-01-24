import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { createMessage } from '../services/messageService.js';
import { getConversationPresence } from '../services/presenceService.js';
import { config } from '../config/index.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface AdminAuth {
  appId: string;
  apiKey: string;
}

declare global {
  namespace Express {
    interface Request {
      adminAuth?: AdminAuth;
    }
  }
}

async function validateAdmin(req: Request, res: Response, next: NextFunction) {
  const appId = req.query.app_id as string | undefined;
  const apiKey = req.query.api_key as string | undefined;

  if (!appId || !apiKey) {
    return res.status(400).json({
      error: 'Missing required parameters',
      code: 'MISSING_PARAMS',
      message: 'app_id and api_key are required',
    });
  }

  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app || app.apiKey !== apiKey) {
    return res.status(403).json({
      error: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
      message: 'app_id or api_key is not valid',
    });
  }

  req.adminAuth = { appId, apiKey };
  next();
}

router.get('/', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  const filePath = path.join(__dirname, '../admin/index.html');
  res.sendFile(filePath);
});

router.get('/api/users', validateAdmin, async (req, res, next) => {
  try {
    const { appId } = req.adminAuth!;

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
      },
    });

    const presence = await getConversationPresence(
      appId,
      conversations.map((conv) => conv.deviceId)
    );

    const users = await Promise.all(
      conversations.map(async (conv) => {
        const lastMessage = await prisma.message.findFirst({
          where: { conversationId: conv.id },
          orderBy: { createdAt: 'desc' },
          select: { body: true, sender: true, createdAt: true },
        });

        return {
          conversation_id: conv.id,
          user_id: conv.userId,
          device_id: conv.deviceId,
          status: conv.status,
          updated_at: conv.updatedAt.toISOString(),
          created_at: conv.createdAt.toISOString(),
          last_message: lastMessage?.body ?? null,
          last_sender: lastMessage?.sender ?? null,
          last_message_at: lastMessage?.createdAt.toISOString() ?? null,
          is_online: presence.get(conv.deviceId) ?? false,
          display_name: conv.userId ? `User ${conv.userId}` : `Visitor ${conv.deviceId.slice(0, 6)}`,
        };
      })
    );

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.get('/api/conversations/:id/messages', validateAdmin, async (req, res, next) => {
  try {
    const { appId } = req.adminAuth!;
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
        body: message.body,
        sender: message.sender,
        created_at: message.createdAt.toISOString(),
        status: message.status,
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/conversations/:id/messages', validateAdmin, async (req, res, next) => {
  try {
    const { appId } = req.adminAuth!;
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

export default router;
