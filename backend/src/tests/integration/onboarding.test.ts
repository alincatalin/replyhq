import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../app.js';
import { prisma } from '../../lib/prisma.js';

describe('Onboarding Flow', () => {
  let testAppId: string;
  let ownerUser: { id: string; email: string; token: string };
  const testPassword = 'SecurePassword123!';

  beforeAll(async () => {
    // Create test app
    const testApp = await prisma.app.create({
      data: {
        name: 'Test App Onboarding',
        apiKeyHash: 'test:hash',
      },
    });
    testAppId = testApp.id;

    const passwordHash = await bcrypt.hash(testPassword, 10);

    // Create OWNER user
    const owner = await prisma.adminUser.create({
      data: {
        email: 'onboarding-owner@example.com',
        passwordHash,
        role: 'OWNER',
        appId: testAppId,
      },
    });

    // Login to get token
    const ownerLogin = await request(app)
      .post('/admin/auth/login')
      .send({ email: owner.email, password: testPassword });

    ownerUser = { id: owner.id, email: owner.email, token: ownerLogin.body.access_token };
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.onboardingState.deleteMany({ where: { appId: testAppId } });
    await prisma.refreshToken.deleteMany({ where: { userId: ownerUser.id } });
    await prisma.adminUser.deleteMany({ where: { appId: testAppId } });
    await prisma.app.deleteMany({ where: { id: testAppId } });
    await prisma.$disconnect();
  });

  describe('POST /admin/onboarding/platform', () => {
    it('should set platform and use case', async () => {
      const response = await request(app)
        .post('/admin/onboarding/platform')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({
          platform: 'ios',
          useCase: 'support',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        platform: 'ios',
        useCase: 'support',
      });
      expect(response.body).toHaveProperty('updatedAt');
    });

    it('should reject invalid platform', async () => {
      const response = await request(app)
        .post('/admin/onboarding/platform')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({
          platform: 'invalid',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid platform',
        code: 'INVALID_PLATFORM',
      });
    });

    it('should reject missing platform', async () => {
      const response = await request(app)
        .post('/admin/onboarding/platform')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({
          useCase: 'support',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Missing platform',
        code: 'MISSING_PLATFORM',
      });
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/admin/onboarding/platform')
        .send({
          platform: 'ios',
        })
        .expect(401);
    });
  });

  describe('GET /admin/onboarding/checklist', () => {
    it('should return default checklist when no state exists', async () => {
      // Clean up any existing state
      await prisma.onboardingState.deleteMany({ where: { appId: testAppId } });

      const response = await request(app)
        .get('/admin/onboarding/checklist')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        progress: 0,
        completed: false,
      });
      expect(response.body.checklist).toHaveLength(4);
      expect(response.body.checklist[0]).toMatchObject({
        id: 'sdk_installed',
        title: 'Install SDK',
        completed: false,
        required: true,
      });
    });

    it('should return checklist with progress when state exists', async () => {
      // Create state with some tasks completed
      await prisma.onboardingState.upsert({
        where: { appId: testAppId },
        create: {
          appId: testAppId,
          platform: 'ios',
          sdkInstalled: true,
          firstMessageSent: false,
        },
        update: {
          sdkInstalled: true,
          firstMessageSent: false,
        },
      });

      const response = await request(app)
        .get('/admin/onboarding/checklist')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.progress).toBe(40); // 1 of 2 required tasks = 50% of 80% = 40%
      expect(response.body.completed).toBe(false);
      expect(response.body.checklist[0].completed).toBe(true);
    });

    it('should mark as completed when all required tasks done', async () => {
      // Complete all required tasks
      await prisma.onboardingState.upsert({
        where: { appId: testAppId },
        create: {
          appId: testAppId,
          platform: 'ios',
          sdkInstalled: true,
          firstMessageSent: true,
          userIdentified: true,
          teamInvited: true,
        },
        update: {
          sdkInstalled: true,
          firstMessageSent: true,
          userIdentified: true,
          teamInvited: true,
        },
      });

      const response = await request(app)
        .get('/admin/onboarding/checklist')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.progress).toBe(100);
      expect(response.body.completed).toBe(true);
      expect(response.body).toHaveProperty('completedAt');
    });
  });

  describe('POST /admin/onboarding/mark-complete/:taskId', () => {
    beforeEach(async () => {
      // Reset state before each test
      await prisma.onboardingState.deleteMany({ where: { appId: testAppId } });
    });

    it('should mark sdk_installed as complete', async () => {
      const response = await request(app)
        .post('/admin/onboarding/mark-complete/sdk_installed')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        taskId: 'sdk_installed',
        completed: true,
        progress: 40, // 1 of 2 required tasks
      });

      // Verify in database
      const state = await prisma.onboardingState.findUnique({
        where: { appId: testAppId },
      });
      expect(state?.sdkInstalled).toBe(true);
    });

    it('should mark first_message_sent as complete', async () => {
      const response = await request(app)
        .post('/admin/onboarding/mark-complete/first_message_sent')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        taskId: 'first_message_sent',
        completed: true,
      });
    });

    it('should reject invalid task ID', async () => {
      const response = await request(app)
        .post('/admin/onboarding/mark-complete/invalid_task')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid task ID',
        code: 'INVALID_TASK_ID',
      });
    });
  });

  describe('GET /admin/onboarding/status', () => {
    it('should return status with no state', async () => {
      await prisma.onboardingState.deleteMany({ where: { appId: testAppId } });

      const response = await request(app)
        .get('/admin/onboarding/status')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        platform: null,
        useCase: null,
        progress: 0,
        completed: false,
      });
    });

    it('should return status with existing state', async () => {
      await prisma.onboardingState.upsert({
        where: { appId: testAppId },
        create: {
          appId: testAppId,
          platform: 'android',
          useCase: 'sales',
          sdkInstalled: true,
          firstMessageSent: true,
        },
        update: {
          platform: 'android',
          useCase: 'sales',
          sdkInstalled: true,
          firstMessageSent: true,
        },
      });

      const response = await request(app)
        .get('/admin/onboarding/status')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        platform: 'android',
        useCase: 'sales',
        progress: 80, // All required tasks done = 80%
        completed: false, // Optional tasks not done
      });
    });
  });

  describe('GET /admin/docs/quickstart/:platform', () => {
    it('should return iOS quickstart guide', async () => {
      const response = await request(app)
        .get('/admin/docs/quickstart/ios')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.platform).toBe('ios');
      expect(response.body.markdown).toContain('iOS Quickstart');
      expect(response.body.markdown).toContain('CocoaPods');
      expect(response.body.markdown).toContain('ReplyHQ.initialize');
      expect(response.body.codeSnippets).toBeInstanceOf(Array);
      expect(response.body.codeSnippets.length).toBeGreaterThan(0);
    });

    it('should return Android quickstart guide', async () => {
      const response = await request(app)
        .get('/admin/docs/quickstart/android')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.platform).toBe('android');
      expect(response.body.markdown).toContain('Android Quickstart');
      expect(response.body.markdown).toContain('gradle');
    });

    it('should return React Native quickstart guide', async () => {
      const response = await request(app)
        .get('/admin/docs/quickstart/react-native')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.platform).toBe('react-native');
      expect(response.body.markdown).toContain('React Native Quickstart');
      expect(response.body.markdown).toContain('@replyhq/react-native');
    });

    it('should return Flutter quickstart guide', async () => {
      const response = await request(app)
        .get('/admin/docs/quickstart/flutter')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);

      expect(response.body.platform).toBe('flutter');
      expect(response.body.markdown).toContain('Flutter Quickstart');
      expect(response.body.markdown).toContain('pubspec.yaml');
    });

    it('should reject invalid platform', async () => {
      const response = await request(app)
        .get('/admin/docs/quickstart/invalid')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid platform',
        code: 'INVALID_PLATFORM',
      });
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/admin/docs/quickstart/ios')
        .expect(401);
    });
  });
});
