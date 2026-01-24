import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { validateHeaders } from '../middleware/headers.js';

describe('validateHeaders', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should return 400 if X-App-Id is missing', () => {
    mockReq.headers = {
      'x-device-id': 'device_123',
    };

    validateHeaders(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Missing required header',
        code: 'MISSING_APP_ID',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should return 400 if X-Device-Id is missing', () => {
    mockReq.headers = {
      'x-app-id': 'app_123',
    };

    validateHeaders(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Missing required header',
        code: 'MISSING_DEVICE_ID',
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should call next() and set appHeaders when all required headers present', () => {
    mockReq.headers = {
      'x-app-id': 'app_123',
      'x-device-id': 'device_123',
      'x-sdk-version': '1.0.0',
    };

    validateHeaders(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.appHeaders).toEqual({
      appId: 'app_123',
      deviceId: 'device_123',
      sdkVersion: '1.0.0',
    });
  });
});
