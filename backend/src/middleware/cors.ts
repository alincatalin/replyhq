import cors from 'cors';

/**
 * CORS middleware with whitelist-based origin validation
 * Uses ALLOWED_ORIGINS environment variable for allowed origins
 */
export function createCorsMiddleware() {
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '';
  const allowedOrigins = allowedOriginsEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  // Default to localhost for development if no origins configured
  if (allowedOrigins.length === 0) {
    console.warn(
      'ALLOWED_ORIGINS not configured, defaulting to localhost for development'
    );
    allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
  }

  console.log('CORS allowed origins:', allowedOrigins);

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS rejected origin: ${origin}`);
        callback(
          new Error(
            `CORS policy: Origin ${origin} is not in the allowed origins list`
          )
        );
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-App-ID',
      'X-Device-ID',
      'X-API-Key',
      'X-Master-API-Key',
    ],
  });
}
