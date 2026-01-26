import express, { Request, Response, NextFunction, type IRouter } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma.js';
import { generateAccessToken, generateRefreshToken, getTokenExpiry, verifyAccessToken, type JWTPayload } from '../lib/jwt.js';
import { strictRateLimit } from '../middleware/rateLimit.js';

const router: IRouter = express.Router();

/**
 * POST /admin/auth/login
 * Authenticate admin user and issue JWT tokens
 */
router.post('/login', strictRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        code: 'MISSING_CREDENTIALS',
        message: 'Email and password are required',
      });
    }

    // Find admin user
    const adminUser = await prisma.adminUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        isActive: true,
        appId: true,
      },
    });

    if (!adminUser) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
    }

    if (!adminUser.isActive) {
      return res.status(403).json({
        error: 'Account disabled',
        code: 'ACCOUNT_DISABLED',
        message: 'Your account has been disabled',
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, adminUser.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect',
      });
    }

    // Generate tokens
    const tokenPayload: JWTPayload = {
      userId: adminUser.id,
      appId: adminUser.appId,
      role: adminUser.role,
      email: adminUser.email,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken();
    const { refreshTokenExpiresAt } = getTokenExpiry();

    // Store refresh token in database
    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: adminUser.id,
        expiresAt: refreshTokenExpiresAt,
      },
    });

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 900, // 15 minutes in seconds
      user: {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
        app_id: adminUser.appId,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', strictRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        error: 'Missing refresh token',
        code: 'MISSING_REFRESH_TOKEN',
      });
    }

    // Find and validate refresh token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refresh_token },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            appId: true,
            isActive: true,
          },
        },
      },
    });

    if (!storedToken) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (storedToken.revokedAt) {
      return res.status(401).json({
        error: 'Token revoked',
        code: 'TOKEN_REVOKED',
      });
    }

    if (storedToken.expiresAt < new Date()) {
      return res.status(401).json({
        error: 'Token expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    if (!storedToken.user.isActive) {
      return res.status(403).json({
        error: 'Account disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    // Generate new access token
    const tokenPayload: JWTPayload = {
      userId: storedToken.user.id,
      appId: storedToken.user.appId,
      role: storedToken.user.role,
      email: storedToken.user.email,
    };

    const accessToken = generateAccessToken(tokenPayload);

    return res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900, // 15 minutes in seconds
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/auth/logout
 * Revoke refresh token
 */
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body;

    if (refresh_token) {
      await prisma.refreshToken.updateMany({
        where: { token: refresh_token },
        data: { revokedAt: new Date() },
      });
    }

    return res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
