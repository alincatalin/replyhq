import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Type extension for Express Request to include admin auth
declare global {
  namespace Express {
    interface Request {
      adminAuth?: {
        appId: string;
        apiKey: string;
      };
    }
  }
}

/**
 * Validate master API key for /setup endpoints
 * Requires X-Master-API-Key header to match MASTER_API_KEY env var
 */
export function validateMasterApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const masterKeyHeader = req.headers['x-master-api-key'];

  // Type guard: Ensure header is a string, not string[]
  if (Array.isArray(masterKeyHeader)) {
    res.status(400).json({
      error: 'Invalid header format',
      code: 'INVALID_HEADER_FORMAT',
    });
    return;
  }

  const masterKey = masterKeyHeader as string | undefined;
  const expectedKey = process.env.MASTER_API_KEY;

  if (!expectedKey) {
    console.error('MASTER_API_KEY environment variable not set');
    res.status(500).json({
      error: 'Server configuration error',
      code: 'MASTER_KEY_NOT_SET',
    });
    return;
  }

  if (!masterKey) {
    res.status(401).json({
      error: 'Master API key required',
      code: 'MISSING_MASTER_KEY',
    });
    return;
  }

  try {
    const expectedBuffer = Buffer.from(expectedKey);
    const providedBuffer = Buffer.from(masterKey);

    // CRITICAL: Check buffer lengths match before timing-safe comparison
    if (expectedBuffer.length !== providedBuffer.length) {
      res.status(403).json({
        error: 'Invalid master API key',
        code: 'INVALID_MASTER_KEY',
      });
      return;
    }

    const isValid = crypto.timingSafeEqual(expectedBuffer, providedBuffer);

    if (!isValid) {
      res.status(403).json({
        error: 'Invalid master API key',
        code: 'INVALID_MASTER_KEY',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Master API key validation error:', error);
    res.status(500).json({
      error: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
}

/**
 * Validate client authentication headers
 * Requires X-App-ID, X-Device-ID, and X-API-Key headers
 * NOTE: This is redundant with validateHeaders middleware - consider removing
 */
export function validateClientAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const appIdHeader = req.headers['x-app-id'];
  const deviceIdHeader = req.headers['x-device-id'];
  const apiKeyHeader = req.headers['x-api-key'];

  // Type guards for all headers
  if (Array.isArray(appIdHeader) || Array.isArray(deviceIdHeader) || Array.isArray(apiKeyHeader)) {
    res.status(400).json({
      error: 'Invalid header format',
      code: 'INVALID_HEADER_FORMAT',
    });
    return;
  }

  const appId = appIdHeader as string | undefined;
  const deviceId = deviceIdHeader as string | undefined;
  const apiKey = apiKeyHeader as string | undefined;

  if (!appId || !deviceId || !apiKey) {
    res.status(401).json({
      error: 'Missing required authentication headers',
      code: 'MISSING_AUTH_HEADERS',
      required: ['X-App-ID', 'X-Device-ID', 'X-API-Key'],
    });
    return;
  }

  // appHeaders already set by validateHeaders middleware
  // This middleware just validates the same headers exist

  next();
}

/**
 * Validate admin authentication headers
 * Requires X-App-ID and X-API-Key headers
 */
export function validateAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const appIdHeader = req.headers['x-app-id'];
  const apiKeyHeader = req.headers['x-api-key'];

  // Type guards
  if (Array.isArray(appIdHeader) || Array.isArray(apiKeyHeader)) {
    res.status(400).json({
      error: 'Invalid header format',
      code: 'INVALID_HEADER_FORMAT',
    });
    return;
  }

  const appId = appIdHeader as string | undefined;
  const apiKey = apiKeyHeader as string | undefined;

  if (!appId || !apiKey) {
    res.status(401).json({
      error: 'Missing required authentication headers',
      code: 'MISSING_AUTH_HEADERS',
      required: ['X-App-ID', 'X-API-Key'],
    });
    return;
  }

  // Store typed headers on request object
  req.adminAuth = {
    appId,
    apiKey,
  };

  next();
}
