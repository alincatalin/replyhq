import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

export interface JWTPayload {
  userId: string;
  appId: string;
  role: string;
  email: string;
}

/**
 * Generate access token (short-lived, 15 minutes)
 */
export function generateAccessToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'replyhq-api',
    audience: 'replyhq-admin',
  });
}

/**
 * Generate refresh token (long-lived, 7 days)
 * Returns a cryptographically random token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Verify and decode JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'replyhq-api',
      audience: 'replyhq-admin',
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Get token expiry timestamps
 */
export function getTokenExpiry() {
  const now = new Date();

  return {
    accessTokenExpiresAt: new Date(now.getTime() + 15 * 60 * 1000), // 15 minutes
    refreshTokenExpiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
  };
}
