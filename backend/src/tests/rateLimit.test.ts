import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { messageRateLimit, clearRateLimitStore } from '../middleware/rateLimit.js';

describe('messageRateLimit', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clearRateLimitStore();
    mockReq = {
      appHeaders: {
        appId: 'app_123',
        apiKey: 'key_123',
        deviceId: 'device_123',
      },
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    mockNext = vi.fn();
  });

  it('should allow requests within rate limit', () => {
    for (let i = 0; i < 5; i++) {
      messageRateLimit(mockReq as Request, mockRes as Response, mockNext);
    }

    expect(mockNext).toHaveBeenCalledTimes(5);
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('should block requests exceeding rate limit', () => {
    for (let i = 0; i < 6; i++) {
      messageRateLimit(mockReq as Request, mockRes as Response, mockNext);
    }

    expect(mockNext).toHaveBeenCalledTimes(5);
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
      })
    );
  });

  it('should track rate limit per device', () => {
    for (let i = 0; i < 5; i++) {
      messageRateLimit(mockReq as Request, mockRes as Response, mockNext);
    }

    const mockReq2: Partial<Request> = {
      appHeaders: {
        appId: 'app_123',
        apiKey: 'key_123',
        deviceId: 'device_456',
      },
    };

    for (let i = 0; i < 5; i++) {
      messageRateLimit(mockReq2 as Request, mockRes as Response, mockNext);
    }

    expect(mockNext).toHaveBeenCalledTimes(10);
  });
});
