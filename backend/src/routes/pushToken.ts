import { Router, Request, Response, NextFunction, IRouter } from 'express';
import { registerPushTokenSchema } from '../schemas/pushToken.js';
import { registerPushToken } from '../services/pushTokenService.js';
import { ApiError } from '../middleware/errorHandler.js';

const router: IRouter = Router();

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parseResult = registerPushTokenSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new ApiError(400, 'Invalid request body', 'VALIDATION_ERROR', parseResult.error.message);
    }

    const { appId } = req.appHeaders;
    const result = await registerPushToken(appId, parseResult.data);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
