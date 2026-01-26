import { z } from 'zod';

export const deviceContextSchema = z.object({
  platform: z.enum(['android', 'ios']),
  os_version: z.string().optional(),
  app_version: z.string().optional(),
  device_model: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  sdk_version: z.string().optional(),
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  attributes: z.record(z.unknown()).optional(),
});

export const createConversationSchema = z.object({
  user: userSchema.optional(),
  device_context: z.preprocess(
    (value) => (value === null ? undefined : value),
    deviceContextSchema.optional()
  ),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type DeviceContext = z.infer<typeof deviceContextSchema>;
export type User = z.infer<typeof userSchema>;
