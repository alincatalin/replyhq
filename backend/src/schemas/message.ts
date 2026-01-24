import { z } from 'zod';
import { config } from '../config/index.js';
import { deviceContextSchema } from './conversation.js';

export const createMessageSchema = z.object({
  local_id: z.string().uuid(),
  body: z.string().min(1).max(config.message.maxLength),
  device_context: deviceContextSchema.optional(),
});

export const getMessagesQuerySchema = z.object({
  after: z.string().optional().transform((val) => val ? parseInt(val, 10) : undefined),
  limit: z.string().optional().transform((val) => val ? parseInt(val, 10) : config.message.defaultLimit),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type GetMessagesQuery = z.infer<typeof getMessagesQuerySchema>;
