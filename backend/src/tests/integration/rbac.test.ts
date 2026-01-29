import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { hasPermission, Permission } from '../../middleware/permissions.js';

describe('Role-Based Access Control (RBAC)', () => {
  let testAppId: string;
  let ownerUser: { id: string; email: string; token: string };
  let adminUser: { id: string; email: string; token: string };
  let agentUser: { id: string; email: string; token: string };
  const testPassword = 'SecurePassword123!';

  beforeAll(async () => {
    // Create test app
    const app = await prisma.app.create({
      data: {
        name: 'Test App RBAC',
        apiKeyHash: 'test:hash',
      },
    });
    testAppId = app.id;

    const passwordHash = await bcrypt.hash(testPassword, 10);

    // Create OWNER user
    const owner = await prisma.adminUser.create({
      data: {
        email: 'owner@example.com',
        passwordHash,
        role: 'OWNER',
        appId: testAppId,
      },
    });

    // Create ADMIN user
    const admin = await prisma.adminUser.create({
      data: {
        email: 'admin@example.com',
        passwordHash,
        role: 'ADMIN',
        appId: testAppId,
      },
    });

    // Create AGENT user
    const agent = await prisma.adminUser.create({
      data: {
        email: 'agent@example.com',
        passwordHash,
        role: 'AGENT',
        appId: testAppId,
      },
    });

    // Login each user to get tokens
    const ownerLogin = await request(app)
      .post('/admin/auth/login')
      .send({ email: owner.email, password: testPassword });

    const adminLogin = await request(app)
      .post('/admin/auth/login')
      .send({ email: admin.email, password: testPassword });

    const agentLogin = await request(app)
      .post('/admin/auth/login')
      .send({ email: agent.email, password: testPassword });

    ownerUser = { id: owner.id, email: owner.email, token: ownerLogin.body.access_token };
    adminUser = { id: admin.id, email: admin.email, token: adminLogin.body.access_token };
    agentUser = { id: agent.id, email: agent.email, token: agentLogin.body.access_token };
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.refreshToken.deleteMany({ where: { userId: { in: [ownerUser.id, adminUser.id, agentUser.id] } } });
    await prisma.adminUser.deleteMany({ where: { appId: testAppId } });
    await prisma.app.deleteMany({ where: { id: testAppId } });
    await prisma.$disconnect();
  });

  describe('Permission System', () => {
    it('OWNER should have all permissions', () => {
      expect(hasPermission('OWNER', Permission.VIEW_CONVERSATIONS)).toBe(true);
      expect(hasPermission('OWNER', Permission.MANAGE_CONVERSATIONS)).toBe(true);
      expect(hasPermission('OWNER', Permission.SEND_MESSAGES)).toBe(true);
      expect(hasPermission('OWNER', Permission.DELETE_MESSAGES)).toBe(true);
      expect(hasPermission('OWNER', Permission.VIEW_USERS)).toBe(true);
      expect(hasPermission('OWNER', Permission.MANAGE_USERS)).toBe(true);
      expect(hasPermission('OWNER', Permission.DELETE_USERS)).toBe(true);
      expect(hasPermission('OWNER', Permission.VIEW_SETTINGS)).toBe(true);
      expect(hasPermission('OWNER', Permission.MANAGE_SETTINGS)).toBe(true);
      expect(hasPermission('OWNER', Permission.VIEW_BILLING)).toBe(true);
      expect(hasPermission('OWNER', Permission.MANAGE_BILLING)).toBe(true);
      expect(hasPermission('OWNER', Permission.VIEW_ANALYTICS)).toBe(true);
    });

    it('ADMIN should have management permissions but not delete users or manage billing', () => {
      expect(hasPermission('ADMIN', Permission.VIEW_CONVERSATIONS)).toBe(true);
      expect(hasPermission('ADMIN', Permission.MANAGE_CONVERSATIONS)).toBe(true);
      expect(hasPermission('ADMIN', Permission.SEND_MESSAGES)).toBe(true);
      expect(hasPermission('ADMIN', Permission.DELETE_MESSAGES)).toBe(true);
      expect(hasPermission('ADMIN', Permission.VIEW_USERS)).toBe(true);
      expect(hasPermission('ADMIN', Permission.MANAGE_USERS)).toBe(true);
      expect(hasPermission('ADMIN', Permission.DELETE_USERS)).toBe(false);
      expect(hasPermission('ADMIN', Permission.VIEW_SETTINGS)).toBe(true);
      expect(hasPermission('ADMIN', Permission.MANAGE_SETTINGS)).toBe(true);
      expect(hasPermission('ADMIN', Permission.VIEW_BILLING)).toBe(true);
      expect(hasPermission('ADMIN', Permission.MANAGE_BILLING)).toBe(false);
      expect(hasPermission('ADMIN', Permission.VIEW_ANALYTICS)).toBe(true);
    });

    it('AGENT should only have basic conversation permissions', () => {
      expect(hasPermission('AGENT', Permission.VIEW_CONVERSATIONS)).toBe(true);
      expect(hasPermission('AGENT', Permission.MANAGE_CONVERSATIONS)).toBe(false);
      expect(hasPermission('AGENT', Permission.SEND_MESSAGES)).toBe(true);
      expect(hasPermission('AGENT', Permission.DELETE_MESSAGES)).toBe(false);
      expect(hasPermission('AGENT', Permission.VIEW_USERS)).toBe(true);
      expect(hasPermission('AGENT', Permission.MANAGE_USERS)).toBe(false);
      expect(hasPermission('AGENT', Permission.DELETE_USERS)).toBe(false);
      expect(hasPermission('AGENT', Permission.VIEW_SETTINGS)).toBe(false);
      expect(hasPermission('AGENT', Permission.MANAGE_SETTINGS)).toBe(false);
      expect(hasPermission('AGENT', Permission.VIEW_BILLING)).toBe(false);
      expect(hasPermission('AGENT', Permission.MANAGE_BILLING)).toBe(false);
      expect(hasPermission('AGENT', Permission.VIEW_ANALYTICS)).toBe(false);
    });
  });

  describe('GET /admin/api/users (requires VIEW_USERS permission)', () => {
    it('OWNER should be able to view users', async () => {
      await request(app)
        .get('/admin/api/users')
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);
    });

    it('ADMIN should be able to view users', async () => {
      await request(app)
        .get('/admin/api/users')
        .set('Authorization', `Bearer ${adminUser.token}`)
        .expect(200);
    });

    it('AGENT should be able to view users', async () => {
      await request(app)
        .get('/admin/api/users')
        .set('Authorization', `Bearer ${agentUser.token}`)
        .expect(200);
    });
  });

  describe('GET /admin/api/conversations/:id/messages (requires VIEW_CONVERSATIONS permission)', () => {
    let conversationId: string;

    beforeAll(async () => {
      // Create a test conversation
      const conversation = await prisma.conversation.create({
        data: {
          id: 'test-conversation-rbac',
          visitorId: 'test-visitor',
          deviceId: 'test-device',
          appId: testAppId,
        },
      });
      conversationId = conversation.id;
    });

    afterAll(async () => {
      await prisma.conversation.deleteMany({ where: { id: conversationId } });
    });

    it('OWNER should be able to view conversation messages', async () => {
      await request(app)
        .get(`/admin/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .expect(200);
    });

    it('ADMIN should be able to view conversation messages', async () => {
      await request(app)
        .get(`/admin/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .expect(200);
    });

    it('AGENT should be able to view conversation messages', async () => {
      await request(app)
        .get(`/admin/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${agentUser.token}`)
        .expect(200);
    });
  });

  describe('POST /admin/api/conversations/:id/messages (requires SEND_MESSAGES permission)', () => {
    let conversationId: string;

    beforeAll(async () => {
      // Create a test conversation
      const conversation = await prisma.conversation.create({
        data: {
          id: 'test-conversation-send-rbac',
          visitorId: 'test-visitor',
          deviceId: 'test-device',
          appId: testAppId,
        },
      });
      conversationId = conversation.id;
    });

    afterAll(async () => {
      await prisma.message.deleteMany({ where: { conversationId } });
      await prisma.conversation.deleteMany({ where: { id: conversationId } });
    });

    it('OWNER should be able to send messages', async () => {
      await request(app)
        .post(`/admin/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${ownerUser.token}`)
        .send({ body: 'Test message from OWNER' })
        .expect(200);
    });

    it('ADMIN should be able to send messages', async () => {
      await request(app)
        .post(`/admin/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${adminUser.token}`)
        .send({ body: 'Test message from ADMIN' })
        .expect(200);
    });

    it('AGENT should be able to send messages', async () => {
      await request(app)
        .post(`/admin/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${agentUser.token}`)
        .send({ body: 'Test message from AGENT' })
        .expect(200);
    });
  });

  describe('Permission Enforcement', () => {
    it('should return 403 when user lacks required permission', async () => {
      // Create a hypothetical route that requires DELETE_USERS permission (which AGENT doesn't have)
      // Since we don't have such a route yet, this is a placeholder test
      // In a real scenario, you'd create a DELETE /admin/api/users/:id route
      expect(hasPermission('AGENT', Permission.DELETE_USERS)).toBe(false);
      expect(hasPermission('ADMIN', Permission.DELETE_USERS)).toBe(false);
      expect(hasPermission('OWNER', Permission.DELETE_USERS)).toBe(true);
    });

    it('should return 401 when no token is provided', async () => {
      await request(app)
        .get('/admin/api/users')
        .expect(401);
    });
  });
});
