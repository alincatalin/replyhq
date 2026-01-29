import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { ApiError } from '../middleware/errorHandler.js';

const router: IRouter = Router();

const identifySchema = z.object({
  user: z.object({
    id: z.string().min(1),
    name: z.string().optional(),
    email: z.string().email().optional(),
    attributes: z.record(z.unknown()).optional(),
  }),
});

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = identifySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const { user } = parseResult.data;

    await prisma.device.upsert({
      where: { appId_deviceId: { appId, deviceId } },
      update: {
        userId: user.id,
        updatedAt: new Date(),
      },
      create: {
        appId,
        deviceId,
        userId: user.id,
        platform: 'unknown',
      },
    });

    await prisma.conversation.updateMany({
      where: { appId, deviceId },
      data: {
        userId: user.id,
        metadata: {
          user,
        },
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
