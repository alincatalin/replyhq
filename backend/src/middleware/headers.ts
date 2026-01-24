import { Request, Response, NextFunction } from 'express';

export interface AppHeaders {
  appId: string;
  apiKey: string;
  deviceId: string;
  sdkVersion?: string;
}

declare global {
  namespace Express {
    interface Request {
      appHeaders: AppHeaders;
    }
  }
}

export function validateHeaders(req: Request, res: Response, next: NextFunction) {
  const appId = req.headers['x-app-id'] as string | undefined;
  const apiKey = req.headers['x-api-key'] as string | undefined;
  const deviceId = req.headers['x-device-id'] as string | undefined;
  const sdkVersion = req.headers['x-sdk-version'] as string | undefined;
  console.log(`[headers] ${req.method} ${req.originalUrl} appId=${appId ?? 'missing'} apiKey=${apiKey ? 'provided' : 'missing'} deviceId=${deviceId ?? 'missing'} sdk=${sdkVersion ?? 'n/a'}`);

  if (!appId) {
    return res.status(400).json({
      error: 'Missing required header',
      code: 'MISSING_APP_ID',
      message: 'X-App-Id header is required',
    });
  }

  if (!deviceId) {
    return res.status(400).json({
      error: 'Missing required header',
      code: 'MISSING_DEVICE_ID',
      message: 'X-Device-Id header is required',
    });
  }
  if (!apiKey) {
    return res.status(400).json({
      error: 'Missing required header',
      code: 'MISSING_API_KEY',
      message: 'X-Api-Key header is required',
    });
  }

  req.appHeaders = {
    appId,
    apiKey,
    deviceId,
    sdkVersion,
  };

  next();
}
