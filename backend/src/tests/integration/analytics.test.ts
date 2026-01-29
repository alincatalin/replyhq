import request from 'supertest';
import app from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hashPassword } from '../../lib/password.js';
import * as jwt from '../../lib/jwt.js';
import { Permission } from '../../middleware/permissions.js';

describe('Analytics Integration Tests', () => {
  let ownerUser: any;
  let testApp: any;

  beforeAll(async () => {
    // Clean up test data
    await prisma.event.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.app.deleteMany({});

    // Create test app
    testApp = await prisma.app.create({
      data: {
        name: 'Test Analytics App',
        apiKey: 'test-analytics-key',
        appId: 'test-analytics-app',
      },
    });

    // Create owner user with analytics permissions
    const hashedPassword = await hashPassword('password123');
    const user = await prisma.user.create({
      data: {
        email: 'analytics-owner@test.com',
        passwordHash: hashedPassword,
        role: 'OWNER',
        appId: testApp.id,
      },
    });

    // Generate JWT token with analytics permissions
    ownerUser = {
      ...user,
      token: jwt.generateToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        appId: testApp.id,
        permissions: [
          Permission.VIEW_ANALYTICS,
          Permission.EDIT_ANALYTICS,
        ],
      }),
    };
  });

  afterAll(async () => {
    await prisma.event.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.app.deleteMany({});
    await prisma.$disconnect();
  });

  describe('POST /admin/analytics/track', () => {
    it('should track a custom event', async () => {
      const response = await request(app)
        .post('/admin/analytics/track')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({
          userId: 'user-123',
          eventName: 'feature_used',
          properties: {
            feature: 'analytics',
            duration: 120,
          },
          userPlan: 'pro',
          userCountry: 'US',
          sessionId: 'session-abc',
          platform: 'web',
          appVersion: '1.0.0',
        })
        .expect(200);

      expect(response.body).toEqual({ success: true });

      // Wait for batch to flush
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Verify event was stored
      const events = await prisma.event.findMany({
        where: {
          appId: testApp.id,
          userId: 'user-123',
          eventName: 'feature_used',
        },
      });

      expect(events.length).toBeGreaterThan(0);
      expect(events[0]).toMatchObject({
        userId: 'user-123',
        eventName: 'feature_used',
        userPlan: 'pro',
        userCountry: 'US',
      });
    });

    it('should require userId and eventName', async () => {
      const response = await request(app)
        .post('/admin/analytics/track')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({
          properties: { test: true },
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Missing required fields',
        code: 'MISSING_FIELDS',
      });
    });
  });

  describe('GET /admin/analytics/events/counts', () => {
    beforeAll(async () => {
      // Create test events
      const events = [
        {
          userId: 'user-1',
          appId: testApp.id,
          eventName: 'page_view',
          properties: {},
          eventTimestamp: new Date(),
        },
        {
          userId: 'user-2',
          appId: testApp.id,
          eventName: 'page_view',
          properties: {},
          eventTimestamp: new Date(),
        },
        {
          userId: 'user-1',
          appId: testApp.id,
          eventName: 'button_click',
          properties: {},
          eventTimestamp: new Date(),
        },
      ];

      await prisma.event.createMany({ data: events });
    });

    it('should get event counts', async () => {
      const response = await request(app)
        .get('/admin/analytics/events/counts')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.counts).toBeDefined();
      expect(response.body.counts.page_view).toBeGreaterThanOrEqual(2);
      expect(response.body.counts.button_click).toBeGreaterThanOrEqual(1);
    });

    it('should filter by event names', async () => {
      const response = await request(app)
        .get('/admin/analytics/events/counts?eventNames=page_view')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.counts).toBeDefined();
      expect(response.body.counts.page_view).toBeDefined();
      expect(response.body.counts.button_click).toBeUndefined();
    });

    it('should filter by date range', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      const response = await request(app)
        .get(
          `/admin/analytics/events/counts?startDate=${yesterday.toISOString()}&endDate=${tomorrow.toISOString()}`
        )
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.counts).toBeDefined();
    });
  });

  describe('GET /admin/analytics/events/top', () => {
    it('should get top events', async () => {
      const response = await request(app)
        .get('/admin/analytics/events/top?limit=5')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.topEvents).toBeDefined();
      expect(Array.isArray(response.body.topEvents)).toBe(true);
      expect(response.body.topEvents.length).toBeLessThanOrEqual(5);

      if (response.body.topEvents.length > 0) {
        expect(response.body.topEvents[0]).toHaveProperty('eventName');
        expect(response.body.topEvents[0]).toHaveProperty('count');
      }
    });
  });

  describe('GET /admin/analytics/events/timeline', () => {
    it('should get event timeline', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);

      const endDate = new Date();

      const response = await request(app)
        .get(
          `/admin/analytics/events/timeline?eventName=page_view&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&interval=day`
        )
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.timeline).toBeDefined();
      expect(Array.isArray(response.body.timeline)).toBe(true);
    });

    it('should require all parameters', async () => {
      const response = await request(app)
        .get('/admin/analytics/events/timeline?eventName=page_view')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Missing required parameters',
        code: 'MISSING_PARAMS',
      });
    });

    it('should validate interval', async () => {
      const startDate = new Date();
      const endDate = new Date();

      const response = await request(app)
        .get(
          `/admin/analytics/events/timeline?eventName=page_view&startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&interval=invalid`
        )
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid interval',
        code: 'INVALID_INTERVAL',
      });
    });
  });

  describe('GET /admin/analytics/users/:userId/events', () => {
    it('should get events for a specific user', async () => {
      const response = await request(app)
        .get('/admin/analytics/users/user-1/events')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.events).toBeDefined();
      expect(Array.isArray(response.body.events)).toBe(true);

      response.body.events.forEach((event: any) => {
        expect(event.userId).toBe('user-1');
      });
    });

    it('should support limit parameter', async () => {
      const response = await request(app)
        .get('/admin/analytics/users/user-1/events?limit=1')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.events).toBeDefined();
      expect(response.body.events.length).toBeLessThanOrEqual(1);
    });
  });

  describe('POST /admin/analytics/segments/evaluate', () => {
    beforeAll(async () => {
      // Create events for segmentation testing
      const events = [
        {
          userId: 'pro-user-1',
          appId: testApp.id,
          eventName: 'message_sent',
          properties: { plan: 'pro' },
          userPlan: 'pro',
          eventTimestamp: new Date(),
        },
        {
          userId: 'pro-user-1',
          appId: testApp.id,
          eventName: 'message_sent',
          properties: { plan: 'pro' },
          userPlan: 'pro',
          eventTimestamp: new Date(),
        },
        {
          userId: 'free-user-1',
          appId: testApp.id,
          eventName: 'message_sent',
          properties: { plan: 'free' },
          userPlan: 'free',
          eventTimestamp: new Date(),
        },
      ];

      await prisma.event.createMany({ data: events });
    });

    it('should evaluate a segment query', async () => {
      const query = {
        operator: 'AND',
        conditions: [
          {
            type: 'user_attribute',
            field: 'userPlan',
            operator: 'equals',
            value: 'pro',
          },
        ],
      };

      const response = await request(app)
        .post('/admin/analytics/segments/evaluate')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({ query })
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.userIds).toBeDefined();
      expect(Array.isArray(response.body.userIds)).toBe(true);
      expect(response.body.count).toBeDefined();
      expect(response.body.description).toBeDefined();
    });

    it('should validate segment query', async () => {
      const invalidQuery = {
        operator: 'INVALID',
        conditions: [],
      };

      const response = await request(app)
        .post('/admin/analytics/segments/evaluate')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({ query: invalidQuery })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid query',
        code: 'INVALID_QUERY',
      });
    });

    it('should require query parameter', async () => {
      const response = await request(app)
        .post('/admin/analytics/segments/evaluate')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Missing query',
        code: 'MISSING_QUERY',
      });
    });
  });

  describe('POST /admin/analytics/segments/preview', () => {
    it('should preview segment users', async () => {
      const query = {
        operator: 'AND',
        conditions: [
          {
            type: 'user_attribute',
            field: 'userPlan',
            operator: 'equals',
            value: 'pro',
          },
        ],
      };

      const response = await request(app)
        .post('/admin/analytics/segments/preview')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({ query, limit: 5 })
        .expect(200);

      expect(response.body.users).toBeDefined();
      expect(Array.isArray(response.body.users)).toBe(true);
      expect(response.body.description).toBeDefined();
    });
  });

  describe('POST /admin/analytics/segments/export', () => {
    it('should export segment to CSV', async () => {
      const query = {
        operator: 'AND',
        conditions: [
          {
            type: 'user_attribute',
            field: 'userPlan',
            operator: 'equals',
            value: 'pro',
          },
        ],
      };

      const response = await request(app)
        .post('/admin/analytics/segments/export')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({ query })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain(
        'attachment; filename=segment-export.csv'
      );
      expect(response.text).toContain('user_id,plan,country,platform');
    });
  });

  describe('GET /admin/analytics/overview', () => {
    it('should get analytics overview', async () => {
      const response = await request(app)
        .get('/admin/analytics/overview')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body).toBeDefined();
      expect(response.body.totalEvents).toBeDefined();
      expect(response.body.uniqueUsers).toBeDefined();
      expect(response.body.topEvents).toBeDefined();
      expect(response.body.period).toBeDefined();
      expect(response.body.period.startDate).toBeDefined();
      expect(response.body.period.endDate).toBeDefined();
    });
  });

  describe('Permissions', () => {
    let viewOnlyUser: any;

    beforeAll(async () => {
      const hashedPassword = await hashPassword('password123');
      const user = await prisma.user.create({
        data: {
          email: 'analytics-viewer@test.com',
          passwordHash: hashedPassword,
          role: 'MEMBER',
          appId: testApp.id,
        },
      });

      viewOnlyUser = {
        ...user,
        token: jwt.generateToken({
          userId: user.id,
          email: user.email,
          role: user.role,
          appId: testApp.id,
          permissions: [Permission.VIEW_ANALYTICS],
        }),
      };
    });

    it('should allow viewing with VIEW_ANALYTICS permission', async () => {
      await request(app)
        .get('/admin/analytics/overview')
        .set('Authorization', `Bearer ${viewOnlyUser.token}`)
        .expect(200);
    });

    it('should allow tracking with VIEW_ANALYTICS permission', async () => {
      await request(app)
        .post('/admin/analytics/track')
        .set('Authorization', `Bearer ${viewOnlyUser.token}`)
        .send({
          userId: 'user-123',
          eventName: 'test_event',
        })
        .expect(200);
    });

    it('should deny access without authentication', async () => {
      await request(app).get('/admin/analytics/overview').expect(401);
    });
  });
});
