import express, { Request, Response, NextFunction, type IRouter } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireJWT } from '../middleware/jwt.js';
import { requirePermission, Permission } from '../middleware/permissions.js';
import * as analyticsService from '../services/analyticsService.js';
import * as segmentationService from '../services/segmentationService.js';
import { validateSegmentQuery, describeSegmentQuery } from '../lib/queryDSL.js';

const router: IRouter = express.Router();

/**
 * POST /admin/analytics/track
 * Track a custom event
 */
router.post(
  '/track',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { userId, eventName, properties, userPlan, userCountry, sessionId, platform, appVersion } = req.body;

      if (!userId || !eventName) {
        return res.status(400).json({
          error: 'Missing required fields',
          code: 'MISSING_FIELDS',
          message: 'userId and eventName are required',
        });
      }

      await analyticsService.trackEvent({
        userId,
        appId,
        eventName,
        properties,
        userPlan,
        userCountry,
        sessionId,
        platform,
        appVersion,
      });

      return res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/analytics/events/counts
 * Get event counts by event name
 */
router.get(
  '/events/counts',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { startDate, endDate, eventNames } = req.query;

      const options: any = {};

      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      if (eventNames) options.eventNames = (eventNames as string).split(',');

      const counts = await analyticsService.getEventCounts(appId, options);

      return res.json({ counts });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/analytics/events/top
 * Get top events by count
 */
router.get(
  '/events/top',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { limit, startDate, endDate } = req.query;

      const options: any = {};

      if (limit) options.limit = parseInt(limit as string, 10);
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);

      const topEvents = await analyticsService.getTopEvents(appId, options);

      return res.json({ topEvents });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/analytics/events/timeline
 * Get event timeline (time-series data)
 */
router.get(
  '/events/timeline',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { eventName, startDate, endDate, interval } = req.query;

      if (!eventName || !startDate || !endDate || !interval) {
        return res.status(400).json({
          error: 'Missing required parameters',
          code: 'MISSING_PARAMS',
          message: 'eventName, startDate, endDate, and interval are required',
        });
      }

      const validIntervals = ['hour', 'day', 'week', 'month'];
      if (!validIntervals.includes(interval as string)) {
        return res.status(400).json({
          error: 'Invalid interval',
          code: 'INVALID_INTERVAL',
          message: `Interval must be one of: ${validIntervals.join(', ')}`,
        });
      }

      const timeline = await analyticsService.getEventTimeline(appId, eventName as string, {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        interval: interval as 'hour' | 'day' | 'week' | 'month',
      });

      return res.json({ timeline });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/analytics/users/:userId/events
 * Get events for a specific user
 */
router.get(
  '/users/:userId/events',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { userId } = req.params;
      const { limit, startDate, endDate, eventNames } = req.query;

      const options: any = {};

      if (limit) options.limit = parseInt(limit as string, 10);
      if (startDate) options.startDate = new Date(startDate as string);
      if (endDate) options.endDate = new Date(endDate as string);
      if (eventNames) options.eventNames = (eventNames as string).split(',');

      const events = await analyticsService.getUserEvents(appId, userId, options);

      return res.json({ events });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/analytics/segments/evaluate
 * Evaluate a segment query and return matching users
 */
router.post(
  '/segments/evaluate',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Missing query',
          code: 'MISSING_QUERY',
          message: 'Segment query is required',
        });
      }

      // Validate query
      const validation = validateSegmentQuery(query);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid query',
          code: 'INVALID_QUERY',
          errors: validation.errors,
        });
      }

      const userIds = await segmentationService.evaluateSegment(appId, query);

      return res.json({
        userIds,
        count: userIds.length,
        description: describeSegmentQuery(query),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/analytics/segments/preview
 * Get a preview of users matching a segment
 */
router.post(
  '/segments/preview',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { query, limit } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Missing query',
          code: 'MISSING_QUERY',
        });
      }

      // Validate query
      const validation = validateSegmentQuery(query);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid query',
          code: 'INVALID_QUERY',
          errors: validation.errors,
        });
      }

      const preview = await segmentationService.getSegmentPreview(appId, query, limit || 10);

      return res.json({
        users: preview,
        description: describeSegmentQuery(query),
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /admin/analytics/segments/export
 * Export segment users to CSV
 */
router.post(
  '/segments/export',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;
      const { query } = req.body;

      if (!query) {
        return res.status(400).json({
          error: 'Missing query',
          code: 'MISSING_QUERY',
        });
      }

      // Validate query
      const validation = validateSegmentQuery(query);
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Invalid query',
          code: 'INVALID_QUERY',
          errors: validation.errors,
        });
      }

      const csv = await segmentationService.exportSegment(appId, query);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=segment-export.csv');

      return res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /admin/analytics/overview
 * Get analytics overview dashboard
 */
router.get(
  '/overview',
  requireJWT,
  requirePermission(Permission.VIEW_ANALYTICS),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { appId } = req.jwtPayload!;

      // Get stats for last 30 days
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);

      const [topEvents, totalEvents] = await Promise.all([
        analyticsService.getTopEvents(appId, { limit: 10, startDate }),
        prisma.event.count({ where: { appId, eventTimestamp: { gte: startDate } } }),
      ]);

      // Get unique users count
      const uniqueUsersResult = await prisma.event.groupBy({
        by: ['userId'],
        where: { appId, eventTimestamp: { gte: startDate } },
      });

      return res.json({
        totalEvents,
        uniqueUsers: uniqueUsersResult.length,
        topEvents,
        period: {
          startDate,
          endDate: new Date(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
