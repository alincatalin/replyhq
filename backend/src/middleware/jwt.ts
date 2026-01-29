import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type JWTPayload } from '../lib/jwt.js';

// Extend Express Request to include JWT payload
declare global {
  namespace Express {
    interface Request {
      jwtPayload?: JWTPayload;
    }
  }
}

/**
 * Middleware to require valid JWT authentication
 * Validates Bearer token from Authorization header
 */
export function requireJWT(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({
      error: 'Missing authentication',
      code: 'MISSING_AUTH_HEADER',
      message: 'Authorization header is required',
    });
    return;
  }

  const parts = authHeader.split(' ');

  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    res.status(401).json({
      error: 'Invalid authentication format',
      code: 'INVALID_AUTH_FORMAT',
      message: 'Authorization header must be in format: Bearer <token>',
    });
    return;
  }

  const token = parts[1];

  try {
    const payload = verifyAccessToken(token);

    // Store payload on request for downstream middleware/handlers
    req.jwtPayload = payload;

    next();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Token expired') {
        res.status(401).json({
          error: 'Token expired',
          code: 'TOKEN_EXPIRED',
          message: 'Your session has expired. Please refresh your token.',
        });
        return;
      }

      if (error.message === 'Invalid token') {
        res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
          message: 'The provided token is invalid',
        });
        return;
      }
    }

    res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}
