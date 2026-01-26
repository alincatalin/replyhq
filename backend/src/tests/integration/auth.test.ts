import request from 'supertest';
import bcrypt from 'bcryptjs';
import app from '../../app.js';
import { prisma } from '../../lib/prisma.js';
import { verifyAccessToken } from '../../lib/jwt.js';

describe('Authentication Flow', () => {
  let testAppId: string;
  let testAdminUser: { id: string; email: string; passwordHash: string };
  const testPassword = 'SecurePassword123!';

  beforeAll(async () => {
    // Create test app
    const app = await prisma.app.create({
      data: {
        name: 'Test App',
        apiKeyHash: 'test:hash',
      },
    });
    testAppId = app.id;

    // Create test admin user
    const passwordHash = await bcrypt.hash(testPassword, 10);
    testAdminUser = await prisma.adminUser.create({
      data: {
        email: 'test@example.com',
        passwordHash,
        role: 'ADMIN',
        appId: testAppId,
      },
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.refreshToken.deleteMany({ where: { userId: testAdminUser.id } });
    await prisma.adminUser.deleteMany({ where: { appId: testAppId } });
    await prisma.app.deleteMany({ where: { id: testAppId } });
    await prisma.$disconnect();
  });

  describe('POST /admin/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: testAdminUser.email,
          password: testPassword,
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('refresh_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).toHaveProperty('expires_in', 900);
      expect(response.body.user).toMatchObject({
        email: testAdminUser.email,
        role: 'ADMIN',
        app_id: testAppId,
      });

      // Verify access token is valid
      const payload = verifyAccessToken(response.body.access_token);
      expect(payload.userId).toBe(testAdminUser.id);
      expect(payload.email).toBe(testAdminUser.email);
      expect(payload.role).toBe('ADMIN');
      expect(payload.appId).toBe(testAppId);
    });

    it('should reject login with missing email', async () => {
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          password: testPassword,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Missing credentials',
        code: 'MISSING_CREDENTIALS',
      });
    });

    it('should reject login with missing password', async () => {
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: testAdminUser.email,
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Missing credentials',
        code: 'MISSING_CREDENTIALS',
      });
    });

    it('should reject login with invalid email', async () => {
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testPassword,
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('should reject login with invalid password', async () => {
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: testAdminUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    });

    it('should reject login for inactive user', async () => {
      // Deactivate user
      await prisma.adminUser.update({
        where: { id: testAdminUser.id },
        data: { isActive: false },
      });

      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: testAdminUser.email,
          password: testPassword,
        })
        .expect(403);

      expect(response.body).toMatchObject({
        error: 'Account disabled',
        code: 'ACCOUNT_DISABLED',
      });

      // Reactivate user for other tests
      await prisma.adminUser.update({
        where: { id: testAdminUser.id },
        data: { isActive: true },
      });
    });
  });

  describe('POST /admin/auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Login to get a refresh token
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: testAdminUser.email,
          password: testPassword,
        });

      refreshToken = response.body.refresh_token;
    });

    it('should refresh access token with valid refresh token', async () => {
      const response = await request(app)
        .post('/admin/auth/refresh')
        .send({
          refresh_token: refreshToken,
        })
        .expect(200);

      expect(response.body).toHaveProperty('access_token');
      expect(response.body).toHaveProperty('token_type', 'Bearer');
      expect(response.body).toHaveProperty('expires_in', 900);

      // Verify new access token is valid
      const payload = verifyAccessToken(response.body.access_token);
      expect(payload.userId).toBe(testAdminUser.id);
    });

    it('should reject refresh with missing token', async () => {
      const response = await request(app)
        .post('/admin/auth/refresh')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Missing refresh token',
        code: 'MISSING_REFRESH_TOKEN',
      });
    });

    it('should reject refresh with invalid token', async () => {
      const response = await request(app)
        .post('/admin/auth/refresh')
        .send({
          refresh_token: 'invalid-token',
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    });

    it('should reject refresh with revoked token', async () => {
      // Revoke the token
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { revokedAt: new Date() },
      });

      const response = await request(app)
        .post('/admin/auth/refresh')
        .send({
          refresh_token: refreshToken,
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Token revoked',
        code: 'TOKEN_REVOKED',
      });
    });

    it('should reject refresh with expired token', async () => {
      // Set token expiry to past
      await prisma.refreshToken.updateMany({
        where: { token: refreshToken },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const response = await request(app)
        .post('/admin/auth/refresh')
        .send({
          refresh_token: refreshToken,
        })
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    });
  });

  describe('POST /admin/auth/logout', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Login to get a refresh token
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: testAdminUser.email,
          password: testPassword,
        });

      refreshToken = response.body.refresh_token;
    });

    it('should logout successfully and revoke refresh token', async () => {
      const response = await request(app)
        .post('/admin/auth/logout')
        .send({
          refresh_token: refreshToken,
        })
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Logged out successfully',
      });

      // Verify token is revoked
      const storedToken = await prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      });
      expect(storedToken?.revokedAt).not.toBeNull();

      // Verify token cannot be used for refresh
      await request(app)
        .post('/admin/auth/refresh')
        .send({
          refresh_token: refreshToken,
        })
        .expect(401);
    });

    it('should succeed even without refresh token', async () => {
      const response = await request(app)
        .post('/admin/auth/logout')
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Logged out successfully',
      });
    });
  });

  describe('JWT Middleware', () => {
    let accessToken: string;

    beforeEach(async () => {
      // Login to get an access token
      const response = await request(app)
        .post('/admin/auth/login')
        .send({
          email: testAdminUser.email,
          password: testPassword,
        });

      accessToken = response.body.access_token;
    });

    it('should allow access with valid Bearer token', async () => {
      const response = await request(app)
        .get('/admin/api/users')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('users');
    });

    it('should reject request without Authorization header', async () => {
      const response = await request(app)
        .get('/admin/api/users')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Missing authentication',
        code: 'MISSING_AUTH_HEADER',
      });
    });

    it('should reject request with invalid Authorization format', async () => {
      const response = await request(app)
        .get('/admin/api/users')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid authentication format',
        code: 'INVALID_AUTH_FORMAT',
      });
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/admin/api/users')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toMatchObject({
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    });
  });
});
