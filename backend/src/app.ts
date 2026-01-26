import express, { Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { validateHeaders } from './middleware/headers.js';
import { validateAppId } from './middleware/appValidator.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createCorsMiddleware } from './middleware/cors.js';
import { strictRateLimit, apiRateLimit } from './middleware/rateLimit.js';
import conversationsRouter from './routes/conversations.js';
import pushTokenRouter from './routes/pushToken.js';
import healthRouter from './routes/health.js';
import adminRouter from './routes/admin.js';
import authRouter from './routes/auth.js';
import billingRouter from './routes/billing.js';
import webhooksRouter from './routes/webhooks.js';
import setupRouter from './routes/setup.js';

const app: Express = express();

// Security headers
app.use(helmet());

// CORS with whitelist
app.use(createCorsMiddleware());

// Compression
app.use(compression());

// Logging
app.use(morgan('combined'));

// Health check (no rate limiting)
app.use('/health', healthRouter);

// Webhooks (must come BEFORE body parsing middleware for raw body access)
// The webhook handler uses express.raw() internally
app.use('/webhooks', webhooksRouter);

// Body parsing with size limits (comes AFTER webhooks)
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Auth routes (login, refresh, logout)
app.use('/admin/auth', authRouter);

// Billing routes with JWT authentication
app.use('/admin/billing', billingRouter);

// Admin routes with JWT authentication
app.use('/admin', adminRouter);

// Setup routes with strict rate limiting (applied BEFORE auth)
app.use('/setup', strictRateLimit, setupRouter);

// Skip header validation for WebSocket upgrade requests (socket.io path)
// API routes with standard rate limiting
app.use('/v1', apiRateLimit);

app.use('/v1', (req, res, next) => {
  const isUpgrade = Boolean(req.headers.upgrade);
  console.log(`[Express] ${req.method} ${req.url}`, { upgrade: isUpgrade, isSocket: req.url.startsWith('/socket.io') });
  // Skip middleware for Socket.IO WebSocket upgrade requests
  if (req.url.startsWith('/socket.io') || isUpgrade) {
    return next();
  }
  validateHeaders(req, res, next);
});

app.use('/v1', (req, res, next) => {
  // Skip app validation for WebSocket upgrade requests
  if (req.url.startsWith('/socket.io') || Boolean(req.headers.upgrade)) {
    return next();
  }
  validateAppId(req, res, next);
});

app.use('/v1/conversations', conversationsRouter);
app.use('/v1/push-token', pushTokenRouter);

app.use(errorHandler);

export default app;
