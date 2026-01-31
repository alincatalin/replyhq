import express, { Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import path from 'path';
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
import onboardingRouter from './routes/onboarding.js';
import docsRouter from './routes/docs.js';
import analyticsRouter from './routes/analytics.js';
import setupRouter from './routes/setup.js';
import broadcastsRouter from './routes/broadcasts.js';
import workflowsRouter from './routes/workflows.js';
import adminWebhooksRouter from './routes/adminWebhooks.js';
import eventsRouter from './routes/events.js';
import identifyRouter from './routes/identify.js';

const app: Express = express();

// Define public path for static files
const publicPath = path.join(process.cwd(), 'public');
console.log('[Static Files] Serving from:', publicPath);

// Trust proxy for correct client IPs behind Railway/load balancers
app.set('trust proxy', 1);

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

// Clean routes for static pages
app.get('/', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/dashboard', (_req, res) => {
  res.sendFile(path.join(publicPath, 'dashboard.html'));
});

app.get('/index.html', (_req, res) => {
  res.redirect(302, '/');
});

app.get('/dashboard.html', (_req, res) => {
  res.redirect(302, '/dashboard');
});

// Landing page at root
app.use('/', express.static(publicPath, {
  index: 'index.html',
  maxAge: '1h',
  etag: true,
  lastModified: true
}));

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

// Onboarding routes with JWT authentication
app.use('/admin/onboarding', onboardingRouter);

// Documentation routes with JWT authentication
app.use('/admin/docs', docsRouter);

// Analytics routes with JWT authentication
app.use('/admin/analytics', analyticsRouter);

// Broadcasts routes with JWT authentication
app.use('/admin/broadcasts', broadcastsRouter);

// Workflows routes with JWT authentication
app.use('/admin/workflows', workflowsRouter);

// Admin webhooks routes with JWT authentication
app.use('/admin/webhooks', adminWebhooksRouter);

// Admin routes with JWT authentication
app.use('/admin', adminRouter);

// Serve static files for admin dashboard (HTML, CSS, JS)
// IMPORTANT: This must come AFTER admin API routes so /admin/api/* routes take precedence
app.use('/admin', express.static(publicPath, {
  maxAge: '1h', // Cache static files for 1 hour
  etag: true,
  lastModified: true
}));

// Setup routes with strict rate limiting (applied BEFORE auth)
app.use('/setup', strictRateLimit, setupRouter);

// Skip header validation for WebSocket upgrade requests (socket.io path)
// API routes with standard rate limiting
app.use('/api/v1', apiRateLimit);

app.use('/api/v1', (req, res, next) => {
  const isUpgrade = Boolean(req.headers.upgrade);
  console.log(`[Express] ${req.method} ${req.url}`, { upgrade: isUpgrade, isSocket: req.url.startsWith('/socket.io') });
  if (req.url.startsWith('/socket.io') || isUpgrade) {
    return next();
  }
  validateHeaders(req, res, next);
});

app.use('/api/v1', (req, res, next) => {
  if (req.url.startsWith('/socket.io') || Boolean(req.headers.upgrade)) {
    return next();
  }
  validateAppId(req, res, next);
});

app.use('/api/v1/conversations', conversationsRouter);
app.use('/api/v1/push-token', pushTokenRouter);
app.use('/api/v1/events', eventsRouter);
app.use('/api/v1/identify', identifyRouter);

app.use(errorHandler);

export default app;
