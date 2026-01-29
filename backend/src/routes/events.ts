import express, { Request, Response, NextFunction, type IRouter } from 'express';
import { z } from 'zod';
import * as analyticsService from '../services/analyticsService.js';
import { triggerWorkflows } from '../services/workflowTriggerService.js';
import { ApiError } from '../middleware/errorHandler.js';

const router: IRouter = express.Router();

const trackEventSchema = z.object({
  user_id: z.string().min(1),
  event_name: z.string().min(1),
  properties: z.record(z.unknown()).optional(),
  user_plan: z.string().optional(),
  user_country: z.string().optional(),
  session_id: z.string().optional(),
  platform: z.string().optional(),
  app_version: z.string().optional(),
});

router.post('/track', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = trackEventSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId, deviceId } = req.appHeaders;
    const {
      user_id,
      event_name,
      properties,
      user_plan,
      user_country,
      session_id,
      platform,
      app_version,
    } = parseResult.data;

    await analyticsService.trackEvent({
      userId: user_id,
      appId,
      eventName: event_name,
      properties,
      userPlan: user_plan,
      userCountry: user_country,
      sessionId: session_id ?? deviceId,
      platform,
      appVersion: app_version,
    });

    await triggerWorkflows({
      appId,
      userId: user_id,
      deviceId,
      sessionId: session_id,
      eventName: event_name,
      properties,
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
