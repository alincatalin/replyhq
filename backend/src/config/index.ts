export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  baseUrl: process.env.BASE_URL || 'https://api.replyhq.dev',
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/replyhq',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  rateLimit: {
    messagesPerSecond: 5,
    windowMs: 1000,
  },

  message: {
    maxLength: 5000,
    defaultLimit: 50,
  },

  websocket: {
    heartbeatInterval: 30000,
    staleThreshold: 90000,
    maxBufferedAmount: 1024 * 1024, // 1MB
  },
} as const;
