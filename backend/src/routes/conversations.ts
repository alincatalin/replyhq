import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { createConversationSchema } from '../schemas/conversation.js';
import { createMessageSchema, getMessagesQuerySchema } from '../schemas/message.js';
import { getOrCreateConversation, getConversationForDevice } from '../services/conversationService.js';
import { createMessage, getMessages } from '../services/messageService.js';
import { messageRateLimit } from '../middleware/rateLimit.js';
import { redisMessageRateLimit } from '../middleware/redisRateLimit.js';
import { ApiError } from '../middleware/errorHandler.js';
import { isRedisReady } from '../lib/redis.js';
import { markMessagesDelivered, markMessagesRead, updateMessageStatus } from '../services/deliveryReceiptService.js';
import { syncMessages } from '../services/syncService.js';
import { z } from 'zod';

const router: IRouter = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = createConversationSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const conversation = await getOrCreateConversation(appId, deviceId, parseResult.data);

    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/messages', (req: Request, res: Response, next: NextFunction) => {
  if (isRedisReady()) {
    return void redisMessageRateLimit(req, res, next);
  }
  return void messageRateLimit(req, res, next);
}, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = createMessageSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const message = await createMessage(req.params.id, parseResult.data, appId, deviceId);

    res.json({ message });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/messages', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = getMessagesQuerySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid query parameters', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { after, limit } = parseResult.data;
    const { appId, deviceId } = req.appHeaders;
    const result = await getMessages(req.params.id, appId, deviceId, after, limit);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

const updateStatusSchema = z.object({
  message_id: z.string().min(1),
  status: z.enum(['QUEUED', 'SENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']),
});

const deliveredSchema = z.object({
  message_ids: z.array(z.string().min(1)).min(1),
});

const readSchema = z.object({
  up_to_message_id: z.string().min(1).nullable().optional(),
});

router.post('/:id/messages/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = updateStatusSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const conversation = await getConversationForDevice(appId, deviceId, req.params.id);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    const update = await updateMessageStatus(
      parseResult.data.message_id,
      parseResult.data.status,
      req.params.id
    );

    res.json(update);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/messages/delivered', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = deliveredSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const conversation = await getConversationForDevice(appId, deviceId, req.params.id);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    const updates = await markMessagesDelivered(req.params.id, parseResult.data.message_ids);
    res.json({ updates });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/messages/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = readSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const conversation = await getConversationForDevice(appId, deviceId, req.params.id);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    const updates = await markMessagesRead(
      req.params.id,
      parseResult.data.up_to_message_id ?? undefined
    );
    res.json({ updates });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/sync', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const querySchema = z.object({
      after_sequence: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 0)),
      limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 50)),
    });

    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid query parameters', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const conversation = await getConversationForDevice(appId, deviceId, req.params.id);
    if (!conversation) {
      throw new ApiError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');
    }

    const result = await syncMessages(req.params.id, parseResult.data.after_sequence, parseResult.data.limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
