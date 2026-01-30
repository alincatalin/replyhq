import express, { Request, Response, NextFunction, type IRouter } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';
import { generateApiKey, hashApiKey } from '../lib/apiKey.js';

const router: IRouter = express.Router();

/**
 * POST /admin/onboarding/platform
 * Set platform and use case for onboarding
 */
router.post(
  '/platform',
  requireJWT,
  requirePermission(Permission.MANAGE_SETTINGS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { platform, useCase } = req.body;
      const { appId } = req.jwtPayload!;

      if (!platform) {
        return res.status(400).json({
          error: 'Missing platform',
          code: 'MISSING_PLATFORM',
          message: 'Platform is required (ios, android, react-native, flutter)',
        });
      }

      const validPlatforms = ['ios', 'android', 'react-native', 'flutter'];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({
          error: 'Invalid platform',
          code: 'INVALID_PLATFORM',
          message: `Platform must be one of: ${validPlatforms.join(', ')}`,
        });
      }

      const state = await prisma.onboardingState.upsert({
        where: { appId },
        create: {
          appId,
          platform,
          useCase: useCase || null,
        },
        update: {
          platform,
          useCase: useCase || null,
        },
      });

      return res.json({
        platform: state.platform,
        useCase: state.useCase,
        updatedAt: state.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/onboarding/checklist
 * Get onboarding checklist with progress
 */
router.get(
  '/checklist',
  requireJWT,
  requirePermission(Permission.VIEW_SETTINGS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;

      const state = await prisma.onboardingState.findUnique({
        where: { appId },
      });

      if (!state) {
        // Return default empty checklist
        return res.json({
          checklist: getDefaultChecklist(null),
          progress: 0,
          completed: false,
        });
      }

      const checklist = getChecklistItems(state);
      const progress = calculateProgress(state);
      const completed = progress === 100;

      // Auto-mark as completed if all required tasks done
      if (completed && !state.completedAt) {
        await prisma.onboardingState.update({
          where: { appId },
          data: { completedAt: new Date() },
        });
      }

      return res.json({
        checklist,
        progress,
        completed,
        completedAt: state.completedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/onboarding/mark-complete/:taskId
 * Mark a specific onboarding task as complete
 */
router.post(
  '/mark-complete/:taskId',
  requireJWT,
  requirePermission(Permission.MANAGE_SETTINGS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { taskId } = req.params;
      const { appId } = req.jwtPayload!;

      const validTaskIds = ['sdk_installed', 'first_message_sent', 'user_identified', 'team_invited'];
      if (!validTaskIds.includes(taskId)) {
        return res.status(400).json({
          error: 'Invalid task ID',
          code: 'INVALID_TASK_ID',
          message: `Task ID must be one of: ${validTaskIds.join(', ')}`,
        });
      }

      // Map task ID to database field
      const fieldMap: Record<string, string> = {
        'sdk_installed': 'sdkInstalled',
        'first_message_sent': 'firstMessageSent',
        'user_identified': 'userIdentified',
        'team_invited': 'teamInvited',
      };

      const field = fieldMap[taskId];

      const state = await prisma.onboardingState.upsert({
        where: { appId },
        create: {
          appId,
          [field]: true,
        },
        update: {
          [field]: true,
        },
      });

      const progress = calculateProgress(state);

      return res.json({
        taskId,
        completed: true,
        progress,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/onboarding/status
 * Get current onboarding status
 */
router.get(
  '/status',
  requireJWT,
  requirePermission(Permission.VIEW_SETTINGS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;

      const state = await prisma.onboardingState.findUnique({
        where: { appId },
      });

      if (!state) {
        return res.json({
          platform: null,
          useCase: null,
          progress: 0,
          completed: false,
        });
      }

      const progress = calculateProgress(state);

      return res.json({
        platform: state.platform,
        useCase: state.useCase,
        progress,
        completed: progress === 100,
        completedAt: state.completedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/onboarding/api-key/rotate
 * Generate a new API key for the current app
 */
router.post(
  '/api-key/rotate',
  requireJWT,
  requirePermission(Permission.MANAGE_SETTINGS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;

      const apiKey = generateApiKey();
      const apiKeyHash = hashApiKey(apiKey);

      const app = await prisma.app.update({
        where: { id: appId },
        data: { apiKey, apiKeyHash },
        select: { apiKey: true },
      });

      return res.json({
        apiKey,
        maskedApiKey: maskApiKey(apiKey),
        apiKeyAvailable: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * Helper: Get checklist items based on onboarding state
 */
function getChecklistItems(state: any) {
  const platform = state?.platform || 'your platform';

  return [
    {
      id: 'sdk_installed',
      title: 'Install SDK',
      description: `Add ReplyHQ to your ${platform} app`,
      completed: state?.sdkInstalled || false,
      required: true,
      estimatedTime: '5 min',
      order: 1,
    },
    {
      id: 'first_message_sent',
      title: 'Send test message',
      description: 'Verify SDK integration is working',
      completed: state?.firstMessageSent || false,
      required: true,
      estimatedTime: '2 min',
      order: 2,
    },
    {
      id: 'user_identified',
      title: 'Identify a user',
      description: 'Associate messages with user IDs',
      completed: state?.userIdentified || false,
      required: false,
      estimatedTime: '3 min',
      order: 3,
    },
    {
      id: 'team_invited',
      title: 'Invite your team',
      description: 'Add team members to respond to messages',
      completed: state?.teamInvited || false,
      required: false,
      estimatedTime: '2 min',
      order: 4,
    },
  ];
}

/**
 * Helper: Get default checklist when no state exists
 */
function getDefaultChecklist(platform: string | null) {
  return getChecklistItems({ platform, sdkInstalled: false, firstMessageSent: false, userIdentified: false, teamInvited: false });
}

function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return `${apiKey.slice(0, 2)}****`;
  }
  const prefix = apiKey.slice(0, 6);
  const suffix = apiKey.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Helper: Calculate onboarding progress percentage
 */
function calculateProgress(state: any): number {
  if (!state) return 0;

  const requiredTasks = [
    state.sdkInstalled,
    state.firstMessageSent,
  ];

  const optionalTasks = [
    state.userIdentified,
    state.teamInvited,
  ];

  const requiredCompleted = requiredTasks.filter(Boolean).length;
  const requiredTotal = requiredTasks.length;

  const optionalCompleted = optionalTasks.filter(Boolean).length;
  const optionalTotal = optionalTasks.length;

  // Required tasks are worth 80%, optional tasks are worth 20%
  const requiredWeight = 0.8;
  const optionalWeight = 0.2;

  const requiredProgress = (requiredCompleted / requiredTotal) * requiredWeight * 100;
  const optionalProgress = (optionalCompleted / optionalTotal) * optionalWeight * 100;

  return Math.round(requiredProgress + optionalProgress);
}

export default router;
