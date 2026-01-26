import express, { Request, Response, NextFunction, type IRouter } from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { createMessage } from '../services/messageService.js';
import { getConversationPresence } from '../services/presenceService.js';
import { config } from '../config/index.js';
import { validateAdminAuth } from '../middleware/auth.js';
import { verifyApiKey } from '../lib/apiKey.js';

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

async function validateAdmin(req: Request, res: Response, next: NextFunction) {
  // Get credentials from headers (set by validateAdminAuth middleware)
  const { appId, apiKey } = req.adminAuth!;

  try {
    const app = await prisma.app.findUnique({
      where: { id: appId },
      select: { id: true, apiKeyHash: true },
    });

    if (!app) {
      return res.status(403).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid app_id',
      });
    }

    // Verify API key against stored hash
    const isValidKey = verifyApiKey(apiKey, app.apiKeyHash);

    if (!isValidKey) {
      return res.status(403).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid API key',
      });
    }

    next();
  } catch (error) {
    console.error('Admin validation error:', error);
    return res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}

router.get('/', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  const filePath = path.join(__dirname, '../admin/index.html');
  res.sendFile(filePath);
});

router.get('/api/users', validateAdminAuth, validateAdmin, async (req, res, next) => {
  try {
    const { appId } = req.adminAuth!;

    // FIX N+1: Use Prisma's include to fetch conversations with their last message in a single query
    // This uses a LEFT JOIN which is much more efficient than N separate queries
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

    const users = conversations.map((conv) => {
      const lastMessage = conv.messages[0];

      return {
        conversation_id: conv.id,
        user_id: conv.userId,
        device_id: conv.deviceId,
        status: conv.status,
        updated_at: conv.updatedAt.toISOString(),
        created_at: conv.createdAt.toISOString(),
        last_message: lastMessage?.body ? sanitizeHtml(lastMessage.body) : null,
        last_sender: lastMessage?.sender ?? null,
        last_message_at: lastMessage?.createdAt.toISOString() ?? null,
        is_online: presence.get(conv.deviceId) ?? false,
        display_name: conv.userId ? `User ${conv.userId}` : `Visitor ${conv.deviceId.slice(0, 6)}`,
      };
    });

    res.json({ users });
  } catch (error) {
    next(error);
  }
});

router.get('/api/conversations/:id/messages', validateAdminAuth, validateAdmin, async (req, res, next) => {
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

router.post('/api/conversations/:id/messages', validateAdminAuth, validateAdmin, async (req, res, next) => {
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
