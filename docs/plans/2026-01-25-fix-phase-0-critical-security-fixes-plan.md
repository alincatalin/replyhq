---
title: Phase 0 - Critical Security Fixes
type: fix
date: 2026-01-25
priority: P0
estimated_effort: 3-5 days
timeline: Week 1
github_issue: 1
---

# Phase 0: Critical Security Fixes

**Priority:** P0 - Critical (Production Blocking)
**Estimated Effort:** 3-5 days
**Timeline:** Week 1
**GitHub Issue:** [#1](https://github.com/replyhq/replyhq/issues/1)

## Overview

This plan addresses **12 critical vulnerabilities** and **8 high-severity risks** identified in the security review. These fixes are **production-blocking** and must be completed before any production deployment.

## Problem Statement

The current implementation has critical security vulnerabilities that expose the system to:

1. **Complete system compromise** via plaintext API key storage
2. **Credential theft** through query parameter authentication
3. **CSRF attacks** via unrestricted CORS
4. **Brute force attacks** due to missing rate limiting
5. **Cross-tenant data leakage** without row-level security
6. **DoS attacks** via unbounded JSONB inputs

## Research Summary

### Local Context (Codebase Analysis)

**Current Security State:**
- ❌ API keys stored in **plaintext** in database (`schema.prisma:13`)
- ❌ `/setup` endpoints have **no authentication** (`routes/setup.ts:21,46`)
- ❌ Admin auth uses **query parameters** (`routes/admin.ts:24-47`)
- ❌ CORS accepts **all origins** (`app.ts:18`, `socketService.ts:36`)
- ❌ No rate limiting on `/setup` or `/admin` endpoints
- ❌ No row-level security policies in database
- ❌ JSONB fields have **no size limits** (`schemas/conversation.ts:17`)

**Existing Strengths:**
- ✅ Zod validation on all API inputs
- ✅ Helmet security headers enabled
- ✅ Prisma ORM prevents SQL injection
- ✅ Rate limiting on message endpoints (5 msg/sec)
- ✅ Headers-based auth for SDK clients
- ✅ Multi-tenant indexing on `appId`

### External Research (Best Practices 2026)

**Key Findings:**

1. **API Key Hashing:** Use **SHA-256** (not bcrypt) for API keys
   - API keys are high-entropy (256 bits), don't need slow hashing
   - bcrypt adds 0.5-1s per request (unacceptable for API auth)
   - Use bcrypt/Argon2id only for user passwords

2. **CORS Configuration:** Never use `origin: '*'` in production
   - Must explicitly whitelist origins
   - Socket.IO CORS must match HTTP CORS
   - Use `credentials: true` only with specific origins

3. **Rate Limiting:** Token bucket algorithm recommended
   - Authentication endpoints: 5 requests/15min
   - API endpoints: 100 requests/15min
   - Use Redis for distributed rate limiting

4. **Row-Level Security (RLS):** Use PostgreSQL session variables
   - Set `app.current_tenant` before each query
   - Create policies with `USING` clause
   - Defense-in-depth: RLS + application-level checks

5. **Input Validation:** Enforce JSONB size limits
   - Maximum 50 keys per object
   - Maximum 1KB per value
   - Maximum nesting depth of 5

### Framework Documentation

**Prisma 5.x:**
- Client Extensions for automatic tenant filtering
- PgBouncer integration with `pgbouncer=true` flag
- Connection pool: 10-20 connections per instance

**Express 4.x:**
- Helmet 7.x for security headers
- express-rate-limit with Redis store
- Body size limits: `express.json({ limit: '10kb' })`

**Socket.IO 4.8.3:**
- CORS must use array of origins (not `'*'`)
- Authentication via `socket.handshake.auth`
- `maxHttpBufferSize: 1e6` to prevent DoS

## Proposed Solution

### Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Security Layers                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  1. Rate Limiting (express-rate-limit + Redis)         │
│     ├─ /setup: 5 req/15min                            │
│     ├─ /admin: 5 req/15min                            │
│     └─ /v1/*: 100 req/15min                           │
│                                                         │
│  2. CORS Whitelist (ALLOWED_ORIGINS env var)           │
│     ├─ HTTP: cors({ origin: whitelist })              │
│     └─ Socket.IO: cors: { origin: whitelist }         │
│                                                         │
│  3. Authentication & Authorization                      │
│     ├─ /setup: MASTER_API_KEY (headers)               │
│     ├─ /admin: API key (headers, hashed in DB)        │
│     └─ /v1/*: API key (headers, hashed in DB)         │
│                                                         │
│  4. Input Validation (Zod schemas)                      │
│     ├─ JSONB size limits (50 keys, 1KB values)        │
│     ├─ Request body limit (10KB)                       │
│     └─ HTML sanitization for admin dashboard           │
│                                                         │
│  5. Database Security (PostgreSQL RLS)                  │
│     ├─ Enable RLS on conversations, messages, devices  │
│     ├─ Policies use app.current_tenant variable        │
│     └─ Middleware sets tenant context per request      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## Implementation Tasks

### 0.1 Authentication & Authorization Hardening

**Priority:** P0 - Critical
**Estimated Effort:** 4-6 hours

#### Task 0.1.1: Add MASTER_API_KEY to /setup endpoints

**Files:**
- `backend/.env.example`
- `backend/src/routes/setup.ts`
- `backend/src/middleware/auth.ts` (new file)

**Implementation:**

```typescript
// backend/src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function validateMasterApiKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const masterKey = req.headers['x-master-api-key'] as string;
  const expectedKey = process.env.MASTER_API_KEY;

  if (!expectedKey) {
    return res.status(500).json({
      error: 'Server configuration error',
      code: 'MASTER_KEY_NOT_SET'
    });
  }

  if (!masterKey) {
    return res.status(401).json({
      error: 'Master API key required',
      code: 'MISSING_MASTER_KEY'
    });
  }

  // Timing-safe comparison
  const isValid = crypto.timingSafeEqual(
    Buffer.from(masterKey),
    Buffer.from(expectedKey)
  );

  if (!isValid) {
    return res.status(403).json({
      error: 'Invalid master API key',
      code: 'INVALID_MASTER_KEY'
    });
  }

  next();
}

// backend/src/routes/setup.ts
import { validateMasterApiKey } from '../middleware/auth';

// Apply to all /setup routes
router.use(validateMasterApiKey);

router.get('/api/apps', async (_req, res, next) => {
  const apps = await prisma.app.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      // ❌ REMOVED: apiKey: true (never return API keys)
      createdAt: true,
    },
  });
  res.json({ apps });
});

router.post('/api/apps', async (req: Request, res: Response) => {
  const { name } = req.body;

  const plainApiKey = generateApiKey(); // Generate before hashing
  const hashedApiKey = hashApiKey(plainApiKey);

  const app = await prisma.app.create({
    data: {
      name,
      apiKey: hashedApiKey,
    },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  // Return plain key ONLY ONCE at creation
  res.status(201).json({ app, apiKey: plainApiKey });
});
```

**Environment Variables:**

```env
# backend/.env.example
MASTER_API_KEY="generate_a_secure_random_key_here"
```

**Acceptance Criteria:**
- [ ] `/setup` endpoints require `X-Master-API-Key` header
- [ ] Returns 401 if header missing
- [ ] Returns 403 if key invalid
- [ ] Uses timing-safe comparison
- [ ] API keys never returned in GET responses

---

#### Task 0.1.2: Move admin auth from query params to headers

**Files:**
- `backend/src/routes/admin.ts`

**Implementation:**

```typescript
// backend/src/routes/admin.ts
async function validateAdmin(req: Request, res: Response, next: NextFunction) {
  // ✅ FROM HEADERS (not query params)
  const appId = req.headers['x-app-id'] as string | undefined;
  const apiKey = req.headers['x-api-key'] as string | undefined;

  if (!appId || !apiKey) {
    return res.status(400).json({
      error: 'Missing required headers',
      code: 'MISSING_HEADERS',
    });
  }

  const app = await prisma.app.findUnique({ where: { id: appId } });

  if (!app) {
    return res.status(403).json({
      error: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    });
  }

  // ✅ Timing-safe comparison (after hashing implementation)
  const isValid = await verifyApiKey(apiKey, app.apiKey);

  if (!isValid) {
    return res.status(403).json({
      error: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    });
  }

  req.adminAuth = { appId, apiKey };
  next();
}
```

**Acceptance Criteria:**
- [ ] Admin endpoints use `X-App-ID` and `X-API-Key` headers
- [ ] Query param authentication removed entirely
- [ ] Timing-safe comparison used
- [ ] Same error message for "not found" vs "wrong key" (prevent enumeration)

---

#### Task 0.1.3: Hash API keys in database

**Files:**
- `backend/src/lib/apiKey.ts` (new file)
- `backend/src/routes/setup.ts`
- `backend/src/middleware/appValidator.ts`
- `backend/prisma/migrations/xxx_hash_existing_api_keys.ts` (new migration)

**Implementation:**

```typescript
// backend/src/lib/apiKey.ts
import crypto from 'crypto';

/**
 * Generate a cryptographically secure API key (256 bits)
 */
export function generateApiKey(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Hash an API key using SHA-256 with salt
 *
 * Note: We use SHA-256 (not bcrypt) for API keys because:
 * 1. API keys are high-entropy (256 bits) generated by the system
 * 2. bcrypt adds 0.5-1s latency per request (unacceptable for APIs)
 * 3. The security comes from the key's entropy, not hash slowness
 */
export function hashApiKey(apiKey: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(salt + apiKey)
    .digest('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify an API key against its hash (timing-safe)
 */
export function verifyApiKey(providedKey: string, storedHash: string): boolean {
  try {
    const [salt, hash] = storedHash.split(':');
    const computedHash = crypto
      .createHash('sha256')
      .update(salt + providedKey)
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );
  } catch (error) {
    return false;
  }
}
```

**Migration Script:**

```typescript
// backend/prisma/migrations/xxx_hash_existing_api_keys.ts
import { PrismaClient } from '@prisma/client';
import { hashApiKey } from '../../src/lib/apiKey';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting API key migration...');

  // Get all apps with plaintext API keys
  const apps = await prisma.app.findMany({
    select: { id: true, apiKey: true }
  });

  console.log(`Found ${apps.length} apps to migrate`);

  // Hash each API key
  for (const app of apps) {
    // Skip if already hashed (contains colon separator)
    if (app.apiKey.includes(':')) {
      console.log(`Skipping app ${app.id} - already hashed`);
      continue;
    }

    const hashedKey = hashApiKey(app.apiKey);

    await prisma.app.update({
      where: { id: app.id },
      data: { apiKey: hashedKey }
    });

    console.log(`Migrated app ${app.id}`);
  }

  console.log('Migration complete!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Update appValidator:**

```typescript
// backend/src/middleware/appValidator.ts
import { verifyApiKey } from '../lib/apiKey';

export async function validateAppId(req: Request, res: Response, next: NextFunction) {
  const { appId, apiKey } = req.appHeaders;

  // Check cache
  const cacheKey = `${appId}:${apiKey}`;
  const cached = appCache.get(cacheKey);

  if (!cached || cached.expiresAt <= Date.now()) {
    const app = await prisma.app.findUnique({ where: { id: appId } });

    // ✅ Use timing-safe verification
    const valid = !!app && verifyApiKey(apiKey, app.apiKey);

    appCache.set(cacheKey, { valid, expiresAt: Date.now() + CACHE_TTL });

    if (!valid) {
      return res.status(403).json({
        error: 'Invalid app_id',
        code: 'INVALID_APP_ID',
      });
    }
  }

  next();
}
```

**Acceptance Criteria:**
- [ ] `generateApiKey()` produces 256-bit base64url keys
- [ ] `hashApiKey()` uses SHA-256 with random salt
- [ ] `verifyApiKey()` uses timing-safe comparison
- [ ] Migration script hashes all existing keys
- [ ] `/setup` returns plain key only at creation
- [ ] `appValidator` middleware uses hashed verification
- [ ] Cache still works with hashed keys

---

### 0.2 CORS & Rate Limiting

**Priority:** P0 - Critical
**Estimated Effort:** 3-4 hours

#### Task 0.2.1: Configure CORS with ALLOWED_ORIGINS whitelist

**Files:**
- `backend/.env.example`
- `backend/src/app.ts`
- `backend/src/services/socketService.ts`

**Implementation:**

```typescript
// backend/.env.example
ALLOWED_ORIGINS="https://app.replyhq.com,https://dashboard.replyhq.com"
# For development:
# ALLOWED_ORIGINS="http://localhost:3000,http://localhost:5173"

// backend/src/app.ts
import cors from 'cors';

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-App-ID', 'X-API-Key', 'X-Device-ID'],
  exposedHeaders: ['X-Total-Count'],
  maxAge: 600 // 10 minutes preflight cache
}));

// backend/src/services/socketService.ts
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

io = new Server(server, {
  path: '/v1/socket.io',
  cors: {
    origin: allowedOrigins, // ✅ Must match HTTP CORS
    credentials: true,
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e6, // 1MB (prevent DoS)
  pingTimeout: 60000,
  pingInterval: 25000
});
```

**Acceptance Criteria:**
- [ ] CORS only accepts origins from `ALLOWED_ORIGINS` env var
- [ ] Socket.IO CORS matches HTTP CORS configuration
- [ ] Requests with no origin are allowed (mobile apps)
- [ ] Invalid origins receive CORS error
- [ ] `credentials: true` enabled with whitelist

---

#### Task 0.2.2: Add rate limiting to /admin and /setup

**Files:**
- `backend/src/middleware/rateLimit.ts`
- `backend/src/routes/admin.ts`
- `backend/src/routes/setup.ts`

**Implementation:**

```typescript
// backend/src/middleware/rateLimit.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../lib/redis';

/**
 * Strict rate limiter for authentication/admin endpoints
 * 5 requests per 15 minutes
 */
export const strictRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 900
  },
  statusCode: 429,
  store: new RedisStore({
    client: getRedisClient(),
    prefix: 'rl:strict:'
  }),
  skip: (req) => {
    // Don't rate limit in development
    return process.env.NODE_ENV === 'development';
  }
});

/**
 * Standard API rate limiter
 * 100 requests per 15 minutes
 */
export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    code: 'RATE_LIMIT_EXCEEDED',
    retry_after_seconds: 900
  },
  statusCode: 429,
  store: new RedisStore({
    client: getRedisClient(),
    prefix: 'rl:api:'
  })
});

// backend/src/routes/admin.ts
import { strictRateLimit } from '../middleware/rateLimit';

// Apply rate limiting BEFORE authentication
router.use(strictRateLimit);

// backend/src/routes/setup.ts
import { strictRateLimit } from '../middleware/rateLimit';

router.use(strictRateLimit);

// backend/src/app.ts
import { apiRateLimit } from '../middleware/rateLimit';

// Apply to all API routes
app.use('/v1/', apiRateLimit);
```

**Acceptance Criteria:**
- [ ] `/admin` endpoints limited to 5 requests per 15 minutes
- [ ] `/setup` endpoints limited to 5 requests per 15 minutes
- [ ] `/v1/*` endpoints limited to 100 requests per 15 minutes
- [ ] Rate limit state stored in Redis (distributed)
- [ ] Returns 429 status with retry_after when limit exceeded
- [ ] RateLimit headers included in responses

---

### 0.3 Row-Level Security for Multi-Tenancy

**Priority:** P0 - Critical
**Estimated Effort:** 6-8 hours

#### Task 0.3.1: Enable RLS on multi-tenant tables

**Files:**
- `backend/prisma/migrations/xxx_enable_rls.sql` (new migration)

**Implementation:**

```sql
-- Enable Row Level Security on all multi-tenant tables
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Create RLS policies using session variable
CREATE POLICY tenant_isolation_conversations ON conversations
  FOR ALL
  USING (app_id = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_messages ON messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
        AND conversations.app_id = current_setting('app.current_tenant', true)
    )
  );

CREATE POLICY tenant_isolation_devices ON devices
  FOR ALL
  USING (app_id = current_setting('app.current_tenant', true));

-- Verify policies are created
SELECT tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'messages', 'devices');
```

**Acceptance Criteria:**
- [ ] RLS enabled on `conversations`, `messages`, `devices` tables
- [ ] Policies use `app.current_tenant` session variable
- [ ] Policies apply to all operations (SELECT, INSERT, UPDATE, DELETE)
- [ ] Migration is idempotent (can run multiple times safely)

---

#### Task 0.3.2: Set tenant context in middleware

**Files:**
- `backend/src/middleware/tenantContext.ts` (new file)
- `backend/src/app.ts`

**Implementation:**

```typescript
// backend/src/middleware/tenantContext.ts
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

/**
 * Sets PostgreSQL session variable for RLS tenant isolation
 *
 * CRITICAL: This must run BEFORE any database queries
 */
export async function setTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Extract tenant ID from authenticated request
  const appId = req.appHeaders?.appId || req.adminAuth?.appId;

  if (!appId) {
    // Skip RLS for non-tenanted endpoints (e.g., /setup)
    return next();
  }

  try {
    // Set session variable for this connection
    // Using raw query because Prisma doesn't support SET LOCAL
    await prisma.$executeRaw`SELECT set_config('app.current_tenant', ${appId}, TRUE)`;

    next();
  } catch (error) {
    console.error('Failed to set tenant context:', error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'TENANT_CONTEXT_FAILED'
    });
  }
}

// backend/src/app.ts
import { setTenantContext } from './middleware/tenantContext';

// Apply AFTER authentication middleware
app.use('/v1/', validateAppId, setTenantContext);
app.use('/admin/', validateAdmin, setTenantContext);
```

**Important Notes:**

1. **Use `set_config()` with `TRUE` parameter:**
   - `TRUE` = transaction-local (resets after commit/rollback)
   - `FALSE` = session-local (persists for entire connection)
   - We want transaction-local for connection pooling safety

2. **Ordering matters:**
   ```
   1. Rate limiting (first)
   2. Authentication (extract appId)
   3. Tenant context (set RLS variable)
   4. Route handlers (run queries)
   ```

3. **Connection pooling compatibility:**
   - Transaction-local variables are automatically reset
   - No risk of tenant leakage between requests

**Acceptance Criteria:**
- [ ] Middleware sets `app.current_tenant` before database queries
- [ ] Uses transaction-local setting (not session-local)
- [ ] Applied to all tenanted routes (`/v1/`, `/admin/`)
- [ ] Skips non-tenanted routes (`/setup`)
- [ ] Handles errors gracefully

---

#### Task 0.3.3: Integration tests for cross-tenant isolation

**Files:**
- `backend/src/tests/integration/tenantIsolation.test.ts` (new file)

**Implementation:**

```typescript
// backend/src/tests/integration/tenantIsolation.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../../app';
import { prisma } from '../../lib/prisma';
import { generateApiKey, hashApiKey } from '../../lib/apiKey';

describe('Tenant Isolation (RLS)', () => {
  let app1: { id: string; apiKey: string; hashedKey: string };
  let app2: { id: string; apiKey: string; hashedKey: string };
  let conversation1: { id: string };
  let conversation2: { id: string };

  beforeAll(async () => {
    // Create two separate apps (tenants)
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    app1 = {
      id: 'test-app-1',
      apiKey: key1,
      hashedKey: hashApiKey(key1)
    };

    app2 = {
      id: 'test-app-2',
      apiKey: key2,
      hashedKey: hashApiKey(key2)
    };

    await prisma.app.createMany({
      data: [
        { id: app1.id, name: 'Test App 1', apiKey: app1.hashedKey },
        { id: app2.id, name: 'Test App 2', apiKey: app2.hashedKey }
      ]
    });

    // Create conversations for each tenant
    conversation1 = await prisma.conversation.create({
      data: {
        id: 'conv-1',
        appId: app1.id,
        deviceId: 'device-1',
        userId: 'user-1',
        status: 'open'
      }
    });

    conversation2 = await prisma.conversation.create({
      data: {
        id: 'conv-2',
        appId: app2.id,
        deviceId: 'device-2',
        userId: 'user-2',
        status: 'open'
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.conversation.deleteMany({
      where: { id: { in: ['conv-1', 'conv-2'] } }
    });
    await prisma.app.deleteMany({
      where: { id: { in: [app1.id, app2.id] } }
    });
  });

  it('should only return conversations for authenticated tenant', async () => {
    const response = await request(app)
      .get('/v1/conversations')
      .set('X-App-ID', app1.id)
      .set('X-API-Key', app1.apiKey)
      .set('X-Device-ID', 'device-1')
      .expect(200);

    expect(response.body.conversations).toHaveLength(1);
    expect(response.body.conversations[0].id).toBe(conversation1.id);
  });

  it('should NOT allow app1 to read app2 conversations', async () => {
    const response = await request(app)
      .get(`/v1/conversations/${conversation2.id}`)
      .set('X-App-ID', app1.id)
      .set('X-API-Key', app1.apiKey)
      .set('X-Device-ID', 'device-1')
      .expect(404); // Should not exist from app1's perspective

    expect(response.body.error).toBe('Conversation not found');
  });

  it('should NOT allow app1 to create messages in app2 conversations', async () => {
    const response = await request(app)
      .post(`/v1/conversations/${conversation2.id}/messages`)
      .set('X-App-ID', app1.id)
      .set('X-API-Key', app1.apiKey)
      .set('X-Device-ID', 'device-1')
      .send({
        local_id: 'msg-1',
        body: 'Test message',
        role: 'user'
      })
      .expect(404);

    expect(response.body.error).toBe('Conversation not found');
  });

  it('should allow app2 to read its own conversations', async () => {
    const response = await request(app)
      .get(`/v1/conversations/${conversation2.id}`)
      .set('X-App-ID', app2.id)
      .set('X-API-Key', app2.apiKey)
      .set('X-Device-ID', 'device-2')
      .expect(200);

    expect(response.body.conversation.id).toBe(conversation2.id);
  });

  it('should enforce RLS at database level (direct query attempt)', async () => {
    // Set tenant context for app1
    await prisma.$executeRaw`SELECT set_config('app.current_tenant', ${app1.id}, TRUE)`;

    // Try to query all conversations (should only see app1's)
    const conversations = await prisma.conversation.findMany();

    expect(conversations).toHaveLength(1);
    expect(conversations[0].id).toBe(conversation1.id);
  });
});
```

**Acceptance Criteria:**
- [ ] Tests verify cross-tenant isolation at API level
- [ ] Tests verify RLS at database level
- [ ] App1 cannot read/write App2's data
- [ ] Each tenant can only see their own data
- [ ] Tests run in CI/CD pipeline

---

#### Task 0.3.4: Measure performance impact

**Files:**
- `backend/src/tests/performance/rlsPerformance.test.ts` (new file)

**Implementation:**

```typescript
// backend/src/tests/performance/rlsPerformance.test.ts
import { describe, it, expect } from '@jest/globals';
import { prisma } from '../../lib/prisma';
import { performance } from 'perf_hooks';

describe('RLS Performance Impact', () => {
  it('should have <5% overhead with RLS enabled', async () => {
    const iterations = 100;
    const appId = 'test-app';

    // Warm up
    for (let i = 0; i < 10; i++) {
      await prisma.$executeRaw`SELECT set_config('app.current_tenant', ${appId}, TRUE)`;
      await prisma.conversation.findMany({ take: 10 });
    }

    // Measure with RLS
    const startWithRLS = performance.now();
    for (let i = 0; i < iterations; i++) {
      await prisma.$executeRaw`SELECT set_config('app.current_tenant', ${appId}, TRUE)`;
      await prisma.conversation.findMany({ take: 10 });
    }
    const timeWithRLS = performance.now() - startWithRLS;

    // Disable RLS temporarily
    await prisma.$executeRaw`ALTER TABLE conversations DISABLE ROW LEVEL SECURITY`;

    // Measure without RLS
    const startWithoutRLS = performance.now();
    for (let i = 0; i < iterations; i++) {
      await prisma.conversation.findMany({ take: 10, where: { appId } });
    }
    const timeWithoutRLS = performance.now() - startWithoutRLS;

    // Re-enable RLS
    await prisma.$executeRaw`ALTER TABLE conversations ENABLE ROW LEVEL SECURITY`;

    const overhead = ((timeWithRLS - timeWithoutRLS) / timeWithoutRLS) * 100;

    console.log(`RLS Performance:
      With RLS: ${timeWithRLS.toFixed(2)}ms
      Without RLS: ${timeWithoutRLS.toFixed(2)}ms
      Overhead: ${overhead.toFixed(2)}%
    `);

    expect(overhead).toBeLessThan(5);
  });
});
```

**Acceptance Criteria:**
- [ ] RLS overhead is less than 5% compared to application-level filtering
- [ ] Performance test runs in CI/CD
- [ ] Results logged for monitoring

---

### 0.4 Input Validation & Sanitization

**Priority:** P0 - Critical
**Estimated Effort:** 3-4 hours

#### Task 0.4.1: Add JSONB size limits

**Files:**
- `backend/src/schemas/conversation.ts`
- `backend/src/schemas/message.ts`

**Implementation:**

```typescript
// backend/src/schemas/conversation.ts
import { z } from 'zod';

/**
 * Validates JSONB object size and nesting depth
 */
const jsonbValidator = z.unknown().superRefine((value, ctx) => {
  if (typeof value !== 'object' || value === null) {
    return; // Allow primitives
  }

  const obj = value as Record<string, unknown>;

  // Check maximum keys
  const keyCount = Object.keys(obj).length;
  if (keyCount > 50) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Maximum 50 keys allowed in attributes',
    });
  }

  // Check maximum value size (1KB per value)
  for (const [key, val] of Object.entries(obj)) {
    const valueSize = JSON.stringify(val).length;
    if (valueSize > 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Value for "${key}" is too large (max 1KB)`,
        path: [key],
      });
    }
  }

  // Check nesting depth (prevent deeply nested objects)
  const maxDepth = 5;
  const checkDepth = (obj: unknown, depth = 0): number => {
    if (depth > maxDepth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Object nesting too deep (max ${maxDepth} levels)`,
      });
      return depth;
    }
    if (typeof obj !== 'object' || obj === null) return depth;
    return Math.max(...Object.values(obj as Record<string, unknown>).map(v => checkDepth(v, depth + 1)));
  };
  checkDepth(obj);
});

export const userSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  attributes: jsonbValidator.optional(),
});

export const deviceContextSchema = z.object({
  platform: z.enum(['android', 'ios']),
  os_version: z.string().optional(),
  app_version: z.string().optional(),
  device_model: z.string().optional(),
  locale: z.string().optional(),
  timezone: z.string().optional(),
  sdk_version: z.string().optional(),
  // No custom attributes here - strictly defined fields only
});
```

**Acceptance Criteria:**
- [ ] User attributes limited to 50 keys
- [ ] Each attribute value limited to 1KB
- [ ] Nesting depth limited to 5 levels
- [ ] Returns 400 with clear error message on violation
- [ ] Device context uses strict schema (no custom attributes)

---

#### Task 0.4.2: Add HTML sanitization for admin dashboard

**Files:**
- `backend/src/routes/admin.ts`
- `backend/package.json` (add isomorphic-dompurify)

**Implementation:**

```typescript
// backend/src/routes/admin.ts
import createDOMPurify from 'isomorphic-dompurify';

const DOMPurify = createDOMPurify();

/**
 * Sanitizes message body for display in admin dashboard
 * Prevents XSS attacks via user-generated content
 */
function sanitizeMessageBody(body: string): string {
  return DOMPurify.sanitize(body, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

router.get('/conversations', validateAdmin, async (req, res, next) => {
  // ... fetch conversations ...

  const sanitizedConversations = conversations.map(conv => ({
    ...conv,
    last_message: conv.last_message ? {
      ...conv.last_message,
      body: sanitizeMessageBody(conv.last_message.body),
    } : null,
  }));

  res.json({ conversations: sanitizedConversations });
});

// backend/package.json
{
  "dependencies": {
    "isomorphic-dompurify": "^2.11.0"
  }
}
```

**Acceptance Criteria:**
- [ ] Message bodies sanitized before returning to admin dashboard
- [ ] Removes `<script>`, `<iframe>`, event handlers
- [ ] Keeps safe formatting tags (`<p>`, `<strong>`, `<em>`)
- [ ] Prevents XSS attacks via message content

---

#### Task 0.4.3: Add request body size limits

**Files:**
- `backend/src/app.ts`

**Implementation:**

```typescript
// backend/src/app.ts
app.use(express.json({
  limit: '10kb',
  strict: true // Only accept objects and arrays
}));

app.use(express.urlencoded({
  limit: '10kb',
  extended: true
}));

// Global error handler for payload too large
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Request body too large',
      code: 'PAYLOAD_TOO_LARGE',
      max_size: '10KB'
    });
  }
  next(err);
});
```

**Acceptance Criteria:**
- [ ] Request bodies limited to 10KB
- [ ] Returns 413 status when exceeded
- [ ] Applies to all JSON and URL-encoded requests
- [ ] Error message includes max size

---

#### Task 0.4.4: Return 400 with clear validation errors

**Files:**
- `backend/src/routes/conversations.ts`
- `backend/src/routes/admin.ts`

**Implementation:**

```typescript
// backend/src/routes/conversations.ts
router.post('/', async (req, res, next) => {
  const parseResult = createConversationSchema.safeParse(req.body);

  if (!parseResult.success) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: parseResult.error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
  }

  // Use parseResult.data (validated)
  const data = parseResult.data;
  // ... create conversation ...
});
```

**Acceptance Criteria:**
- [ ] Returns 400 status for validation errors
- [ ] Includes field path and error message
- [ ] Provides clear, actionable error messages
- [ ] Does not leak internal implementation details

---

## Acceptance Criteria (Overall)

### Security Validation

- [ ] **Critical vulnerabilities resolved:**
  - [ ] API keys hashed in database (SHA-256 with salt)
  - [ ] `/setup` endpoints require MASTER_API_KEY
  - [ ] Admin auth uses headers (not query params)
  - [ ] CORS restricted to whitelist
  - [ ] Rate limiting on all sensitive endpoints
  - [ ] RLS enforced at database level
  - [ ] JSONB inputs have size limits

- [ ] **Security tests passing:**
  - [ ] OWASP ZAP scan: 0 high-severity findings
  - [ ] Integration tests verify tenant isolation
  - [ ] Performance tests show <5% RLS overhead
  - [ ] API key migration completed successfully

- [ ] **Production readiness:**
  - [ ] All environment variables documented
  - [ ] Migration scripts tested in staging
  - [ ] Rollback plan documented
  - [ ] Security monitoring configured

### Testing Strategy

**Unit Tests:**
- API key hashing/verification functions
- JSONB size validation
- CORS origin validation
- Rate limiter logic

**Integration Tests:**
- Cross-tenant isolation (cannot read/write other tenant's data)
- Authentication flows (valid/invalid credentials)
- Rate limiting (enforced correctly)
- Input validation (rejects malformed data)

**Performance Tests:**
- RLS overhead <5% compared to application filtering
- API key verification <10ms per request
- Rate limiter adds <5ms per request

**Security Tests:**
- OWASP ZAP automated scan
- Manual penetration testing of authentication
- SQL injection attempts (should fail via Prisma)
- XSS attempts in admin dashboard (should be sanitized)

## Rollback Plan

If critical issues are discovered after deployment:

1. **Disable RLS temporarily:**
   ```sql
   ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
   ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
   ALTER TABLE devices DISABLE ROW LEVEL SECURITY;
   ```

2. **Revert to application-level filtering:**
   - Remove `setTenantContext` middleware
   - Queries will still filter by `appId` manually

3. **Keep other security fixes:**
   - API key hashing can remain (backward compatible)
   - Rate limiting can remain
   - CORS whitelist can remain

## Dependencies & Prerequisites

**External Services:**
- Redis (required for distributed rate limiting)
- PostgreSQL 12+ (required for RLS)

**Environment Variables:**
- `MASTER_API_KEY` - Master key for /setup endpoints
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins
- `REDIS_URL` - Redis connection string

**Database Migration:**
- Existing API keys must be hashed (one-time migration)
- RLS policies must be created

## Security Impact

| Vulnerability | Before | After | Impact |
|--------------|--------|-------|--------|
| **API Key Storage** | Plaintext | SHA-256 hashed | Prevents credential theft from DB breach |
| **Setup Auth** | None | MASTER_API_KEY required | Prevents unauthorized app creation |
| **Admin Auth** | Query params | Headers + timing-safe | Prevents credential leakage in logs |
| **CORS** | Accept all | Whitelist only | Prevents CSRF attacks |
| **Rate Limiting** | Messages only | All endpoints | Prevents brute force, DoS |
| **Multi-Tenancy** | Application-level | RLS + application | Prevents cross-tenant data leakage |
| **JSONB Injection** | Unbounded | 50 keys, 1KB/value | Prevents DoS via large payloads |

## References

### Internal Documentation
- Implementation Roadmap: `docs/plans/2026-01-25-feat-saas-mvp-implementation-roadmap-plan.md`
- Backend Reference: `docs/backend.md`
- Socket.IO Migration: `docs/solutions/integration-issues/socketio-migration-production-realtime.md`

### Research Findings
- Repo Analysis: Agent ad89389
- Institutional Learnings: Agent a543cbb
- Best Practices 2026: Agent ab5b0fb
- Framework Documentation: Agent a9399fc

### External Resources
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [AWS Multi-tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security)
- [Socket.IO v4 Security](https://socket.io/docs/v4/middlewares)
- [OWASP API Security Top 10:2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)

## Next Steps

After Phase 0 completion:

1. **Phase 1: Critical Performance Fixes** (Week 1-2)
   - Fix N+1 query in admin dashboard
   - Configure database connection pool
   - Add Redis pipelining
   - Add database indexes

2. **Phase 2: MVP Features** (Week 2-3)
   - Authentication & billing integration
   - JWT-based admin authentication
   - Stripe subscription management

3. **Security Monitoring** (Parallel)
   - Set up Sentry error tracking
   - Configure Prometheus metrics
   - Implement structured logging
