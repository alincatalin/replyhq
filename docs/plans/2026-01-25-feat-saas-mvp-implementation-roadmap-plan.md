---
title: ReplyHQ SaaS MVP Implementation Roadmap
type: feat
date: 2026-01-25
priority: critical
status: ready-for-implementation
---

# ReplyHQ SaaS MVP Implementation Roadmap

## Overview

Comprehensive implementation roadmap for ReplyHQ SaaS MVP, synthesizing findings from completed security, performance, architecture, data model, and best practices research. This roadmap prioritizes critical issues that must be addressed before production launch, followed by features needed for MVP, and optimization opportunities for scale.

**Based on Research:**
- Security Review: 12 critical vulnerabilities, 8 high-severity risks identified
- Performance Analysis: N+1 query patterns, database bottlenecks, scaling concerns
- Data Model Review: Schema integrity risks, missing constraints
- Architecture Review: Monolith vs microservices, multi-tenancy, real-time architecture
- Socket.IO Scaling: Production deployment patterns for 10K+ connections
- User Segmentation: Query DSL design, attribute storage strategies
- Push Notifications: FCM/APNs best practices, delivery optimization
- SaaS Onboarding: Self-service signup, Stripe billing, SDK setup wizards

**Current State:**
- Socket.IO migration completed (96 passing tests)
- KMP SDK with custom Socket.IO client implementation
- Multi-tenant PostgreSQL + Redis architecture
- No production security hardening yet
- Missing critical features for SaaS launch

## Implementation Phases

### Phase 0: Critical Security Fixes (Week 1) 🔴

**MUST complete before any production deployment**

**Estimated Effort:** 3-5 days
**Blockers:** None
**Risk:** Production-blocking vulnerabilities

#### 0.1 Authentication & Authorization Hardening

**Priority:** P0 - Critical
**Files to Modify:**
- `/backend/src/routes/setup.ts`
- `/backend/src/routes/admin.ts`
- `/backend/src/middleware/auth.ts` (new)

**Tasks:**

1. **Add authentication to /setup endpoints**
   ```typescript
   // backend/src/middleware/auth.ts
   export function requireMasterKey(req: Request, res: Response, next: NextFunction) {
     const masterKey = req.headers['x-master-key'];

     if (!masterKey || masterKey !== process.env.MASTER_API_KEY) {
       return res.status(401).json({
         error: 'Unauthorized',
         code: 'MASTER_KEY_REQUIRED'
       });
     }

     next();
   }
   ```

2. **Move admin auth from query params to headers**
   ```typescript
   // backend/src/routes/admin.ts (lines 24-47)
   async function validateAdmin(req: Request, res: Response, next: NextFunction) {
     // ❌ OLD: const apiKey = req.query.api_key
     // ✅ NEW:
     const appId = req.headers['x-app-id'] as string;
     const apiKey = req.headers['x-api-key'] as string;

     if (!appId || !apiKey) {
       return res.status(401).json({ error: 'Missing credentials' });
     }
     // ... rest of validation
   }
   ```

3. **Remove API key from /setup responses**
   ```typescript
   // backend/src/routes/setup.ts (lines 21-44)
   const apps = await prisma.app.findMany({
     select: {
       id: true,
       name: true,
       // ❌ apiKey: true,  // REMOVE THIS
       createdAt: true,
     },
   });
   ```

4. **Hash API keys in database**
   ```typescript
   import bcrypt from 'bcryptjs';

   // backend/src/routes/setup.ts
   async function createApp(name: string) {
     const apiKey = generateApiKey();
     const hashedKey = await bcrypt.hash(apiKey, 12);

     const app = await prisma.app.create({
       data: { name, apiKey: hashedKey }
     });

     // Return plain key only once
     return { ...app, apiKey };
   }

   // Validation
   async function validateApiKey(appId: string, providedKey: string) {
     const app = await prisma.app.findUnique({ where: { id: appId } });
     return bcrypt.compare(providedKey, app.apiKey);
   }
   ```

**Acceptance Criteria:**
- [ ] /setup endpoints require MASTER_API_KEY environment variable
- [ ] Admin API uses headers (x-app-id, x-api-key) instead of query params
- [ ] API keys are bcrypt hashed before storage (12 rounds)
- [ ] Validation uses bcrypt.compare() for timing-safe comparison
- [ ] API keys never returned in responses after initial creation
- [ ] All existing API keys migrated to hashed format

**Security Impact:** Prevents complete system compromise, credential theft from DB breach

---

#### 0.2 CORS & Rate Limiting

**Priority:** P0 - Critical
**Files to Modify:**
- `/backend/src/app.ts`
- `/backend/src/middleware/rateLimit.ts`

**Tasks:**

1. **Configure CORS properly**
   ```typescript
   // backend/src/app.ts (line 18)
   app.use(cors({
     origin: (origin, callback) => {
       const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];

       if (!origin || allowedOrigins.includes(origin)) {
         callback(null, true);
       } else {
         callback(new Error('Not allowed by CORS'));
       }
     },
     credentials: true,
     maxAge: 86400,
   }));
   ```

2. **Add rate limiting to all endpoints**
   ```typescript
   import rateLimit from 'express-rate-limit';

   // Auth endpoints (strict)
   const authLimiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 5, // 5 attempts per IP
     message: 'Too many authentication attempts',
   });

   // API endpoints (normal)
   const apiLimiter = rateLimit({
     windowMs: 15 * 60 * 1000,
     max: 100,
     message: 'Too many requests from this IP'
   });

   app.use('/admin', authLimiter);
   app.use('/setup', authLimiter);
   app.use('/v1/', apiLimiter);
   ```

3. **Socket.IO CORS fix**
   ```typescript
   // backend/src/services/socketService.ts (lines 35-36)
   const io = new Server(server, {
     cors: {
       origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
       credentials: true,
     }
   });
   ```

**Acceptance Criteria:**
- [ ] CORS restricted to ALLOWED_ORIGINS environment variable
- [ ] Rate limiting on /admin (5 req/15min)
- [ ] Rate limiting on /setup (5 req/15min)
- [ ] Rate limiting on /v1/* (100 req/15min)
- [ ] Socket.IO CORS matches HTTP CORS config
- [ ] Rate limit headers included in responses

**Security Impact:** Prevents CSRF attacks, brute force attempts, DoS attacks

---

#### 0.3 Row-Level Security (RLS) for Multi-Tenancy

**Priority:** P0 - Critical
**Files to Modify:**
- `/backend/prisma/migrations/` (new migration)
- `/backend/src/lib/prisma.ts`

**Tasks:**

1. **Enable Row-Level Security on PostgreSQL**
   ```sql
   -- migrations/YYYYMMDDHHMMSS_enable_rls/migration.sql

   -- Enable RLS on all multi-tenant tables
   ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
   ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
   ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

   -- Create policies
   CREATE POLICY tenant_isolation ON conversations
     USING (app_id = current_setting('app.current_tenant', true));

   CREATE POLICY tenant_isolation ON messages
     USING (
       EXISTS (
         SELECT 1 FROM conversations
         WHERE conversations.id = messages.conversation_id
           AND conversations.app_id = current_setting('app.current_tenant', true)
       )
     );

   CREATE POLICY tenant_isolation ON devices
     USING (app_id = current_setting('app.current_tenant', true));
   ```

2. **Set tenant context in middleware**
   ```typescript
   // backend/src/middleware/auth.ts
   export async function setTenantContext(
     req: Request,
     res: Response,
     next: NextFunction
   ) {
     const appId = req.appHeaders?.appId;

     if (appId) {
       await prisma.$executeRaw`SET LOCAL app.current_tenant = ${appId}`;
     }

     next();
   }

   // Apply to all routes
   app.use(setTenantContext);
   ```

**Alternative (if RLS too complex):** Create Prisma wrapper that auto-injects appId

```typescript
// backend/src/lib/prisma.ts
class TenantPrismaClient {
  constructor(private appId: string, private prisma: PrismaClient) {}

  get conversation() {
    return {
      findMany: (args: any) => this.prisma.conversation.findMany({
        ...args,
        where: { ...args?.where, appId: this.appId }
      }),
      // ... other methods
    };
  }
}

export function getTenantClient(appId: string) {
  return new TenantPrismaClient(appId, prisma);
}
```

**Acceptance Criteria:**
- [ ] RLS enabled on conversations, messages, devices tables
- [ ] Tenant context set via app.current_tenant session variable
- [ ] All queries automatically filtered by tenant
- [ ] Integration tests verify no cross-tenant data access
- [ ] Performance impact measured (<5% overhead acceptable)

**Security Impact:** Prevents cross-tenant data leakage at database level

---

#### 0.4 Input Validation & Sanitization

**Priority:** P0 - Critical
**Files to Modify:**
- `/backend/src/schemas/conversation.ts`
- `/backend/src/schemas/message.ts`
- `/backend/src/routes/admin.ts`

**Tasks:**

1. **Add JSONB size limits**
   ```typescript
   // backend/src/schemas/conversation.ts (line 17)
   export const userSchema = z.object({
     attributes: z.record(z.unknown())
       .refine((obj) => Object.keys(obj).length <= 50, {
         message: "Maximum 50 attributes allowed"
       })
       .refine((obj) => {
         return Object.values(obj).every(v =>
           JSON.stringify(v).length <= 1000
         );
       }, {
         message: "Attribute values too large"
       })
       .optional(),
   });
   ```

2. **Add HTML sanitization for admin dashboard**
   ```typescript
   import createDOMPurify from 'isomorphic-dompurify';
   const DOMPurify = createDOMPurify();

   // backend/src/routes/admin.ts
   const sanitizedBody = DOMPurify.sanitize(message.body);
   ```

3. **Add request body size limits**
   ```typescript
   // backend/src/app.ts
   app.use(express.json({ limit: '10kb' })); // Prevent large payloads
   ```

**Acceptance Criteria:**
- [ ] JSONB attributes limited to 50 keys max
- [ ] JSONB values limited to 1KB each
- [ ] Message bodies sanitized before display in admin dashboard
- [ ] Request body size limited to 10KB
- [ ] Validation errors return 400 with clear messages

**Security Impact:** Prevents JSONB injection, XSS attacks, DoS via large payloads

---

### Phase 1: Critical Performance Fixes (Week 1-2) 🟡

**Can run in parallel with Phase 0**

**Estimated Effort:** 5-7 days
**Dependencies:** None
**Risk:** Production performance issues under load

#### 1.1 Fix N+1 Query in Admin Dashboard

**Priority:** P0 - Critical
**Files to Modify:**
- `/backend/src/routes/admin.ts` (lines 80-102)

**Problem:**
- With 50 conversations: **51 database queries** (1 + 50)
- With 1,000 conversations: **1,001 database queries**
- P95 latency: ~2-5 seconds with 1,000 conversations

**Solution:** Use Prisma aggregation or raw SQL

```typescript
// backend/src/routes/admin.ts (lines 80-102)

// ❌ OLD: N+1 query pattern
const users = await Promise.all(
  conversations.map(async (conv) => {
    const lastMessage = await prisma.message.findFirst({
      where: { conversationId: conv.id },
      orderBy: { createdAt: 'desc' },
    });
  })
);

// ✅ NEW: Single query with DISTINCT ON (PostgreSQL)
const conversationsWithLastMessage = await prisma.$queryRaw`
  SELECT
    c.*,
    m.body as last_message_body,
    m.sender as last_message_sender,
    m.created_at as last_message_at
  FROM conversations c
  LEFT JOIN LATERAL (
    SELECT body, sender, created_at
    FROM messages
    WHERE conversation_id = c.id
    ORDER BY created_at DESC
    LIMIT 1
  ) m ON true
  WHERE c.app_id = ${appId}
  ORDER BY c.updated_at DESC
`;
```

**Acceptance Criteria:**
- [ ] Admin dashboard conversation list uses single query
- [ ] Query time <50ms for 1,000 conversations
- [ ] No N+1 queries detected in logs
- [ ] Load test validates 60x latency improvement

**Performance Impact:**
- Queries: 1,001 → **2**
- Latency: 3s → **~50ms** (60x improvement)

---

#### 1.2 Configure Database Connection Pool

**Priority:** P0 - Critical
**Files to Modify:**
- `/backend/src/lib/prisma.ts`
- `/backend/.env.example`
- `DATABASE_URL` connection string

**Problem:**
- Default pool: 10 connections
- At 10K concurrent Socket.IO auths: Connection exhaustion

**Solution:**

```typescript
// backend/src/lib/prisma.ts
export const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
  errorFormat: 'minimal',
});

// .env
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=100&pool_timeout=10"
```

**Recommended Configuration:**
- For 10K concurrent connections: **50-100 connection pool**
- `connection_limit=100`
- `pool_timeout=10` (seconds)
- Monitor pool usage via Prisma metrics

**Acceptance Criteria:**
- [ ] Connection pool configured to 100
- [ ] Pool timeout set to 10 seconds
- [ ] Connection pool monitoring added
- [ ] Load test validates no connection exhaustion at 10K connections

**Performance Impact:** Prevents connection pool exhaustion under load

---

#### 1.3 Add Redis Pipelining to Session Lookup

**Priority:** P1 - High
**Files to Modify:**
- `/backend/src/services/socketService.ts` (lines 681-710)
- `/backend/src/services/presenceService.ts` (lines 204-231)

**Problem:**
- `getActiveSessions`: O(n) Redis operations
- For 1,000 sessions: **1,001 Redis ops**, ~500-1,000ms latency

**Solution:**

```typescript
// backend/src/services/socketService.ts (lines 681-710)
async function getActiveSessions(appId: string): Promise<SessionData[]> {
  const appSetKey = `${SESSION_SET_PREFIX}${appId}`;
  const connectionIds = await redis.client.sMembers(appSetKey);

  if (connectionIds.length === 0) return [];

  // ✅ Use pipeline for batch operations
  const pipeline = redis.client.multi();

  connectionIds.forEach(id => {
    pipeline.hGetAll(`${SESSION_KEY_PREFIX}${id}`);
  });

  const results = await pipeline.exec();

  return results
    .filter((result): result is { connectionId: string } => result?.connectionId)
    .map(data => ({
      connectionId: data.connectionId,
      deviceId: data.deviceId,
      appId: data.appId,
      connectedAt: data.connectedAt,
    }));
}
```

**Also apply to `getConversationPresence`:**

```typescript
// backend/src/services/presenceService.ts (lines 204-231)
export async function getConversationPresence(
  appId: string,
  deviceIds: string[]
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();

  const redis = getPublisher();
  const pipeline = redis.multi();

  deviceIds.forEach(deviceId => {
    const deviceSetKey = `presence:device:${appId}:${deviceId}`;
    pipeline.sCard(deviceSetKey);
  });

  const results = await pipeline.exec();

  deviceIds.forEach((deviceId, index) => {
    const count = results[index] as number;
    result.set(deviceId, count > 0);
  });

  return result;
}
```

**Acceptance Criteria:**
- [ ] `getActiveSessions` uses Redis pipelining
- [ ] `getConversationPresence` uses Redis pipelining
- [ ] Latency <5ms for 1,000 sessions (down from 500ms)
- [ ] Load test validates 100x improvement

**Performance Impact:**
- Operations: 10,001 → **2** (SMEMBERS + 1 pipelined batch)
- Latency: 5s → **~50ms** (100x improvement)

---

#### 1.4 Add Database Indexes

**Priority:** P1 - High
**Files to Modify:**
- `/backend/prisma/migrations/` (new migration)

**Missing Indexes:**

```sql
-- migrations/YYYYMMDDHHMMSS_add_performance_indexes/migration.sql

-- Partial indexes for common segments (more efficient)
CREATE INDEX idx_messages_status ON messages(status)
  WHERE status IN ('QUEUED', 'SENDING', 'FAILED');

CREATE INDEX idx_conversations_status ON conversations(status);

-- Composite index for ordered fetches
CREATE INDEX idx_messages_conversation_sequence
  ON messages(conversation_id, sequence);

-- For message pagination queries
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);
```

**Acceptance Criteria:**
- [ ] Partial index on messages.status for failed/pending messages
- [ ] Index on conversations.status
- [ ] Composite index for (conversation_id, sequence)
- [ ] Descending index on messages.created_at
- [ ] Query plans verified to use new indexes

**Performance Impact:** 10-50x improvement on filtered queries

---

### Phase 2: MVP Features - Authentication & Billing (Week 2-3) 🟢

**Depends on:** Phase 0 complete
**Estimated Effort:** 7-10 days

#### 2.1 JWT-Based Admin Authentication

**Priority:** P1 - High
**Files to Create:**
- `/backend/src/routes/auth.ts`
- `/backend/src/middleware/jwt.ts`
- `/backend/prisma/schema.prisma` (add AdminUser model)

**Schema Changes:**

```prisma
// backend/prisma/schema.prisma
enum AdminRole {
  OWNER
  ADMIN
  AGENT
}

model AdminUser {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String   @map("password_hash")
  role          AdminRole @default(AGENT)
  appId         String   @map("app_id")

  createdAt     DateTime @default(now()) @map("created_at")
  lastLoginAt   DateTime? @map("last_login_at")

  app           App      @relation(fields: [appId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]

  @@index([email])
  @@map("admin_users")
}

model RefreshToken {
  id          String   @id @default(uuid())
  adminUserId String   @map("admin_user_id")
  token       String   @unique
  expiresAt   DateTime @map("expires_at")
  createdAt   DateTime @default(now()) @map("created_at")

  adminUser   AdminUser @relation(fields: [adminUserId], references: [id], onDelete: Cascade)

  @@index([adminUserId])
  @@index([expiresAt])
  @@map("refresh_tokens")
}
```

**Implementation:**

```typescript
// backend/src/routes/auth.ts
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

router.post('/admin/login', async (req, res) => {
  const { email, password } = req.body;

  const admin = await prisma.adminUser.findUnique({
    where: { email }
  });

  if (!admin || !await bcrypt.compare(password, admin.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Issue short-lived access token
  const accessToken = jwt.sign(
    { adminId: admin.id, appId: admin.appId, role: admin.role },
    process.env.JWT_SECRET!,
    { expiresIn: '15m' }
  );

  // Issue long-lived refresh token
  const refreshToken = jwt.sign(
    { adminId: admin.id, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' }
  );

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      adminUserId: admin.id,
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    }
  });

  res.json({ accessToken, refreshToken });
});

// Middleware
function requireJWT(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
```

**Acceptance Criteria:**
- [ ] AdminUser table with role (OWNER, ADMIN, AGENT)
- [ ] RefreshToken table with CASCADE delete
- [ ] /admin/login endpoint returns JWT tokens
- [ ] /admin/refresh endpoint for token renewal
- [ ] All /admin routes protected with requireJWT middleware
- [ ] Access tokens expire in 15 minutes
- [ ] Refresh tokens expire in 7 days
- [ ] Integration tests for auth flow

**Security Impact:** Proper session management, token expiration, role-based access

---

#### 2.2 RBAC (Role-Based Access Control)

**Priority:** P1 - High
**Files to Modify:**
- `/backend/src/middleware/permissions.ts` (new)
- `/backend/src/routes/admin.ts`

**Implementation:**

```typescript
// backend/src/middleware/permissions.ts
const PERMISSIONS = {
  OWNER: ['*'],
  ADMIN: [
    'conversations:read',
    'conversations:write',
    'messages:read',
    'messages:write',
    'users:read',
    'settings:read',
    'settings:write'
  ],
  AGENT: [
    'messages:read',
    'messages:write',
    'conversations:read'
  ],
};

export function requirePermission(permission: string) {
  return (req, res, next) => {
    const userRole = req.user.role;
    const allowed = PERMISSIONS[userRole];

    if (allowed.includes('*') || allowed.includes(permission)) {
      next();
    } else {
      res.status(403).json({
        error: 'Insufficient permissions',
        required: permission,
        role: userRole
      });
    }
  };
}

// Usage
router.get('/admin/api/users',
  requireJWT,
  requirePermission('conversations:read'),
  async (req, res) => { ... }
);

router.delete('/admin/api/conversations/:id',
  requireJWT,
  requirePermission('conversations:write'),
  async (req, res) => { ... }
);
```

**Acceptance Criteria:**
- [ ] Permission middleware checks role against action
- [ ] OWNER role has wildcard (*) access
- [ ] ADMIN role has full read/write except user management
- [ ] AGENT role has read-only + message write
- [ ] 403 responses include required permission in error
- [ ] All admin routes have permission checks
- [ ] Integration tests for each role

---

#### 2.3 Stripe Integration

**Priority:** P1 - High
**Files to Create:**
- `/backend/src/routes/billing.ts`
- `/backend/src/services/stripeService.ts`
- `/backend/prisma/schema.prisma` (add Subscription model)

**Schema Changes:**

```prisma
// backend/prisma/schema.prisma
model Subscription {
  id                String   @id @default(uuid())
  appId             String   @map("app_id")
  stripeCustomerId  String   @unique @map("stripe_customer_id")
  stripeSubscriptionId String? @unique @map("stripe_subscription_id")
  stripePriceId     String   @map("stripe_price_id")

  status            String   // trialing, active, past_due, canceled
  currentPeriodEnd  DateTime @map("current_period_end")
  cancelAtPeriodEnd Boolean  @default(false) @map("cancel_at_period_end")

  trialEndsAt       DateTime? @map("trial_ends_at")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  app               App      @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([status])
  @@index([currentPeriodEnd])
  @@map("subscriptions")
}
```

**Implementation:**

```typescript
// backend/src/services/stripeService.ts
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});

export async function createCheckoutSession(
  appId: string,
  priceId: string,
  trialDays: number = 14
) {
  const app = await prisma.app.findUnique({ where: { id: appId } });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    success_url: `${process.env.FRONTEND_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.FRONTEND_URL}/billing`,
    customer_email: app.email,
    subscription_data: {
      trial_period_days: trialDays,
      metadata: { appId }
    },
    metadata: { appId }
  });

  return session;
}

export async function handleWebhook(event: Stripe.Event) {
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object as Stripe.Checkout.Session;
      await createSubscription(session);
      break;

    case 'customer.subscription.updated':
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscription(subscription);
      break;

    case 'customer.subscription.deleted':
      const deletedSub = event.data.object as Stripe.Subscription;
      await cancelSubscription(deletedSub);
      break;

    case 'invoice.payment_failed':
      const invoice = event.data.object as Stripe.Invoice;
      await handlePaymentFailed(invoice);
      break;
  }
}
```

**Stripe Products Configuration:**

```typescript
// Pricing tiers
const PLANS = {
  STARTER: {
    priceId: 'price_starter_monthly',
    name: 'Starter',
    price: 29,
    limits: {
      mau: 1000,
      messages: 10000,
    }
  },
  GROWTH: {
    priceId: 'price_growth_monthly',
    name: 'Growth',
    price: 99,
    limits: {
      mau: 10000,
      messages: 100000,
    }
  },
  BUSINESS: {
    priceId: 'price_business_monthly',
    name: 'Business',
    price: 299,
    limits: {
      mau: 50000,
      messages: 500000,
    }
  }
};
```

**Acceptance Criteria:**
- [ ] Stripe SDK integrated (v17+)
- [ ] Checkout session creation endpoint
- [ ] Webhook handler for subscription events
- [ ] Subscription model stores Stripe IDs and status
- [ ] 14-day trial without credit card required
- [ ] Email sequence for trial reminders (Day 10, 12, 14)
- [ ] Smart Retries enabled for failed payments
- [ ] Proration preview for upgrades
- [ ] Integration tests with Stripe test mode
- [ ] Webhook signature verification

---

### Phase 3: MVP Features - SDK Onboarding (Week 3-4) 🟢

**Depends on:** Phase 0 complete
**Estimated Effort:** 7-10 days

#### 3.1 Platform Selection Survey

**Priority:** P1 - High
**Files to Create:**
- `/backend/src/routes/onboarding.ts`
- `/backend/prisma/schema.prisma` (add OnboardingState model)

**Schema:**

```prisma
model OnboardingState {
  id              String   @id @default(uuid())
  appId           String   @unique @map("app_id")

  platform        String?  // ios, android, react-native, flutter
  useCase         String?  // support, sales, notifications, community
  sdkInstalled    Boolean  @default(false) @map("sdk_installed")
  firstMessageSent Boolean @default(false) @map("first_message_sent")
  userIdentified  Boolean  @default(false) @map("user_identified")
  teamInvited     Boolean  @default(false) @map("team_invited")

  completedAt     DateTime? @map("completed_at")
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  app             App      @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@map("onboarding_states")
}
```

**Implementation:**

```typescript
// backend/src/routes/onboarding.ts
router.post('/onboarding/platform', requireJWT, async (req, res) => {
  const { platform, useCase } = req.body;
  const { appId } = req.user;

  const state = await prisma.onboardingState.upsert({
    where: { appId },
    create: { appId, platform, useCase },
    update: { platform, useCase }
  });

  res.json(state);
});

router.get('/onboarding/checklist', requireJWT, async (req, res) => {
  const { appId } = req.user;

  const state = await prisma.onboardingState.findUnique({
    where: { appId }
  });

  const checklist = [
    {
      id: 'install_sdk',
      title: 'Install SDK',
      description: `Add ReplyHQ to your ${state.platform} app`,
      completed: state.sdkInstalled,
      required: true,
      estimatedTime: '5 min',
    },
    {
      id: 'send_test_message',
      title: 'Send test message',
      description: 'Verify SDK integration is working',
      completed: state.firstMessageSent,
      required: true,
      estimatedTime: '2 min',
    },
    // ... more tasks
  ];

  res.json({ checklist, progress: calculateProgress(state) });
});
```

**Acceptance Criteria:**
- [ ] Platform selection survey on first login
- [ ] OnboardingState tracks checklist progress
- [ ] Checklist items marked complete automatically
- [ ] Progress bar shows completion percentage
- [ ] Personalized docs based on platform selection
- [ ] Dismissible after completion

---

#### 3.2 SDK Quickstart Guide Generator

**Priority:** P1 - High
**Files to Create:**
- `/backend/src/routes/docs.ts`
- `/backend/src/templates/` (quickstart templates)

**Implementation:**

```typescript
// backend/src/routes/docs.ts
router.get('/docs/quickstart/:platform', requireJWT, async (req, res) => {
  const { platform } = req.params;
  const { appId } = req.user;

  const app = await prisma.app.findUnique({ where: { id: appId } });

  const template = await generateQuickstart(platform, {
    apiKey: app.apiKey,
    appId: app.id,
  });

  res.json({
    platform,
    markdown: template,
    codeSnippets: extractCodeSnippets(template)
  });
});

function generateQuickstart(platform: string, config: any): string {
  switch (platform) {
    case 'ios':
      return `
# iOS Quickstart (5 minutes)

## 1. Install via CocoaPods

\`\`\`ruby
pod 'ReplyHQSDK'
\`\`\`

## 2. Initialize

\`\`\`swift
import ReplyHQSDK

ReplyHQ.initialize(apiKey: "${config.apiKey}")
\`\`\`

## 3. Send a message

\`\`\`swift
ReplyHQ.shared.sendMessage(
    conversationId: "support",
    text: "Hello from iOS!"
)
\`\`\`

✅ Check your dashboard - you should see the message appear!
      `;
    // ... other platforms
  }
}
```

**Acceptance Criteria:**
- [ ] Quickstart templates for iOS, Android, React Native, Flutter
- [ ] Templates include actual API key (masked in UI, full in clipboard)
- [ ] Code snippets have syntax highlighting
- [ ] Copy-to-clipboard functionality
- [ ] Deep link to relevant SDK documentation sections
- [ ] Verification step after each code block

---

#### 3.3 Test Console for SDK Events

**Priority:** P2 - Medium
**Files to Create:**
- `/backend/src/routes/testConsole.ts`
- WebSocket endpoint for live event stream

**Implementation:**

```typescript
// backend/src/services/socketService.ts
// Add admin namespace for test console
const adminNs = io.of('/admin');

adminNs.on('connection', (socket) => {
  const { appId } = socket.handshake.auth;

  // Subscribe to app's SDK events
  socket.join(`app:${appId}:events`);

  socket.on('disconnect', () => {
    socket.leave(`app:${appId}:events`);
  });
});

// Emit SDK events to test console
export function broadcastSDKEvent(appId: string, event: any) {
  adminNs.to(`app:${appId}:events`).emit('sdk:event', {
    timestamp: new Date().toISOString(),
    type: event.type,
    data: event.data,
    deviceId: event.deviceId,
  });
}
```

**Frontend (Admin Dashboard):**

```typescript
// Test Console component
const socket = io('/admin', {
  auth: { token: accessToken }
});

socket.on('sdk:event', (event) => {
  console.log('SDK Event:', event);
  // Display in UI with timestamp, type, payload
});
```

**Acceptance Criteria:**
- [ ] Live event stream in admin dashboard
- [ ] Events show: timestamp, type, device ID, payload
- [ ] Filter events by type (connection, message, error)
- [ ] Copy event JSON to clipboard
- [ ] Pause/resume event stream
- [ ] Clear event log
- [ ] Automatically scrolls to latest event

---

### Phase 4: Analytics & Segmentation (Week 4-5) 🔵

**Depends on:** Phase 2 complete
**Estimated Effort:** 10-14 days

#### 4.1 Event Tracking Schema

**Priority:** P2 - Medium
**Files to Modify:**
- `/backend/prisma/schema.prisma`
- `/backend/src/services/analyticsService.ts` (new)

**Schema (TimescaleDB Hypertable):**

```sql
-- migrations/YYYYMMDDHHMMSS_add_analytics/migration.sql

-- Events table as TimescaleDB hypertable
CREATE TABLE events (
  event_id BIGSERIAL,
  user_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ NOT NULL,

  properties JSONB DEFAULT '{}'::jsonb,

  -- Denormalized user context
  user_plan TEXT,
  user_country TEXT,

  -- Session tracking
  session_id UUID,

  -- Device/source
  platform TEXT,
  app_version TEXT,

  PRIMARY KEY (event_timestamp, event_id)
);

-- Convert to TimescaleDB hypertable
SELECT create_hypertable('events', 'event_timestamp',
  chunk_time_interval => INTERVAL '1 day'
);

-- Indexes
CREATE INDEX idx_events_user_time ON events(user_id, event_timestamp DESC);
CREATE INDEX idx_events_name_time ON events(event_name, event_timestamp DESC)
  WHERE event_name IN ('feature_used', 'purchase', 'signup');
CREATE INDEX idx_events_properties ON events USING GIN (properties);

-- Retention policy (auto-delete after 90 days)
SELECT add_retention_policy('events', INTERVAL '90 days');
```

**Prisma Schema (for ORM):**

```prisma
model Event {
  eventId       BigInt   @id @default(autoincrement()) @map("event_id")
  userId        String   @map("user_id")
  appId         String   @map("app_id")
  eventName     String   @map("event_name")
  eventTimestamp DateTime @default(now()) @map("event_timestamp")

  properties    Json     @default("{}")

  userPlan      String?  @map("user_plan")
  userCountry   String?  @map("user_country")

  sessionId     String?  @map("session_id")
  platform      String?
  appVersion    String?  @map("app_version")

  @@index([userId, eventTimestamp(sort: Desc)])
  @@index([eventName, eventTimestamp(sort: Desc)])
  @@map("events")
}
```

**Acceptance Criteria:**
- [ ] TimescaleDB extension enabled
- [ ] Events table created as hypertable
- [ ] Automatic partitioning by day
- [ ] GIN index on properties JSONB
- [ ] 90-day retention policy configured
- [ ] Event batching service implemented
- [ ] Integration tests for event tracking

---

#### 4.2 User Segmentation Query DSL

**Priority:** P2 - Medium
**Files to Create:**
- `/backend/src/services/segmentationService.ts`
- `/backend/src/lib/queryDSL.ts`

**DSL Schema:**

```typescript
// backend/src/lib/queryDSL.ts
type ComparisonOp =
  | "equals" | "not_equals"
  | "gt" | "gte" | "lt" | "lte"
  | "contains" | "not_contains"
  | "in" | "not_in"
  | "exists" | "not_exists";

interface Condition {
  type: "user_attribute" | "event";
  field: string;
  operator: ComparisonOp;
  value: any;

  // For event conditions
  eventName?: string;
  timeframe?: {
    type: "relative";
    value: number;
    unit: "days" | "hours";
  };
}

interface SegmentQuery {
  operator: "AND" | "OR";
  conditions: Array<Condition | SegmentQuery>;
}

// Example
const proUsersSegment: SegmentQuery = {
  operator: "AND",
  conditions: [
    {
      type: "user_attribute",
      field: "plan",
      operator: "equals",
      value: "pro"
    },
    {
      type: "event",
      eventName: "feature_used",
      field: "properties.feature_id",
      operator: "equals",
      value: "feature_x",
      timeframe: {
        type: "relative",
        value: 7,
        unit: "days"
      }
    }
  ]
};
```

**SQL Translation:**

```typescript
// backend/src/lib/queryDSL.ts
function translateToSQL(segment: SegmentQuery): string {
  if (segment.operator === 'AND') {
    const clauses = segment.conditions.map(c => buildCondition(c));
    return clauses.join(' AND ');
  } else {
    const clauses = segment.conditions.map(c => buildCondition(c));
    return '(' + clauses.join(' OR ') + ')';
  }
}

function buildCondition(condition: Condition | SegmentQuery): string {
  if ('operator' in condition && (condition.operator === 'AND' || condition.operator === 'OR')) {
    return '(' + translateToSQL(condition) + ')';
  }

  const cond = condition as Condition;

  if (cond.type === 'user_attribute') {
    return `users.${cond.field} ${sqlOperator(cond.operator)} ${sqlValue(cond.value)}`;
  }

  if (cond.type === 'event') {
    const timeClause = cond.timeframe
      ? `AND e.event_timestamp >= NOW() - INTERVAL '${cond.timeframe.value} ${cond.timeframe.unit}'`
      : '';

    return `EXISTS (
      SELECT 1 FROM events e
      WHERE e.user_id = users.user_id
        AND e.event_name = '${cond.eventName}'
        AND e.${cond.field} ${sqlOperator(cond.operator)} ${sqlValue(cond.value)}
        ${timeClause}
    )`;
  }
}
```

**Acceptance Criteria:**
- [ ] JSON DSL parser validates query structure
- [ ] SQL translator handles nested AND/OR conditions
- [ ] Support for user attribute conditions
- [ ] Support for event-based conditions with timeframes
- [ ] Comparison operators: equals, gt, contains, in, exists
- [ ] Query validation prevents SQL injection
- [ ] Performance tested with 100K users
- [ ] Integration tests for DSL → SQL translation

---

### Phase 5: Push Notifications (Week 5-6) 🔵

**Depends on:** Phase 0 complete
**Estimated Effort:** 7-10 days

#### 5.1 FCM & APNs Integration

**Priority:** P2 - Medium
**Files to Modify:**
- `/backend/src/services/pushNotificationService.ts`
- `/backend/prisma/schema.prisma`

**Schema:**

```prisma
model PushNotification {
  id            String   @id @default(uuid())
  deviceId      String   @map("device_id")
  title         String?
  body          String
  data          Json?
  status        String   // pending, sent, failed, delivered

  sentAt        DateTime? @map("sent_at")
  deliveredAt   DateTime? @map("delivered_at")
  errorMessage  String?   @map("error_message")

  createdAt     DateTime @default(now()) @map("created_at")
  retainUntil   DateTime @default(dbgenerated("NOW() + INTERVAL '30 days'")) @map("retain_until")

  device        Device   @relation(fields: [deviceId], references: [id])

  @@index([deviceId, status])
  @@index([retainUntil])
  @@map("push_notifications")
}
```

**Implementation:**

```typescript
// backend/src/services/pushNotificationService.ts
import admin from 'firebase-admin';

export async function sendPushNotification(
  deviceId: string,
  notification: {
    title: string;
    body: string;
    data?: Record<string, string>;
  }
) {
  const device = await prisma.device.findUnique({
    where: { id: deviceId },
    select: { pushToken: true, platform: true }
  });

  if (!device?.pushToken) {
    return { success: false, error: 'No push token' };
  }

  const message = {
    token: device.pushToken,
    notification: {
      title: notification.title,
      body: notification.body,
    },
    data: notification.data,
    android: {
      priority: 'normal',
      collapseKey: `messages_${deviceId}`,
    },
    apns: {
      headers: {
        'apns-collapse-id': `messages_${deviceId}`,
        'apns-priority': '5',
      },
      payload: {
        aps: {
          alert: {
            title: notification.title,
            body: notification.body,
          },
          sound: 'default',
        }
      }
    }
  };

  try {
    const response = await admin.messaging().send(message);

    await prisma.pushNotification.create({
      data: {
        deviceId,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        status: 'sent',
        sentAt: new Date(),
      }
    });

    return { success: true, messageId: response };
  } catch (error: any) {
    await handlePushError(deviceId, error);
    return { success: false, error: error.code };
  }
}
```

**Acceptance Criteria:**
- [ ] FCM integration for Android
- [ ] APNs integration for iOS
- [ ] Push token storage in Device table
- [ ] Token validation and cleanup
- [ ] Error handling for invalid tokens
- [ ] Collapse keys for batched messages
- [ ] Normal priority for non-urgent messages
- [ ] Deep links via Universal Links/App Links
- [ ] Integration tests with Firebase Test Lab

---

#### 5.2 Smart Delivery Logic

**Priority:** P2 - Medium
**Files to Create:**
- `/backend/src/services/deliveryService.ts`

**Implementation:**

```typescript
// backend/src/services/deliveryService.ts
interface NotificationDecision {
  shouldSend: boolean;
  reason: string;
  useCollapsing: boolean;
}

async function shouldSendNotification(
  userId: string,
  messageId: string
): Promise<NotificationDecision> {
  // Check if user is online
  const presence = await getUserPresenceStatus(userId);

  if (presence.isOnline) {
    return {
      shouldSend: false,
      reason: 'User is currently online',
      useCollapsing: false
    };
  }

  // Check quiet hours
  const prefs = await getUserPreferences(userId);

  if (prefs.quietHoursEnabled && isInQuietHours(prefs.quietHours, prefs.timezone)) {
    return {
      shouldSend: false,
      reason: 'Within user quiet hours',
      useCollapsing: false
    };
  }

  // Check rate limit
  const withinLimit = await checkRateLimit(userId);

  if (!withinLimit) {
    return {
      shouldSend: false,
      reason: 'Rate limit exceeded',
      useCollapsing: false
    };
  }

  return {
    shouldSend: true,
    reason: 'User offline, outside quiet hours',
    useCollapsing: true
  };
}
```

**Acceptance Criteria:**
- [ ] Online/offline detection via presence service
- [ ] Quiet hours configuration per user
- [ ] Timezone-aware quiet hours calculation
- [ ] Rate limiting (max 10 notifications per hour)
- [ ] Batching for multiple messages
- [ ] Integration tests for delivery rules

---

### Phase 6: Observability & Monitoring (Week 6-7) 🔵

**Depends on:** All previous phases
**Estimated Effort:** 5-7 days

#### 6.1 Structured Logging

**Priority:** P2 - Medium
**Files to Modify:**
- `/backend/src/lib/logger.ts` (new)
- Replace all `console.log` with structured logger

**Implementation:**

```typescript
// backend/src/lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label })
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ['apiKey', 'password', 'token', '*.apiKey', '*.password'],
    remove: true
  }
});

// Usage
logger.info({ conversationId, messageId }, 'Message created');
logger.error({ error: err, stack: err.stack }, 'Push notification failed');
```

**Acceptance Criteria:**
- [ ] Pino logger configured with ISO timestamps
- [ ] Log level configurable via LOG_LEVEL env var
- [ ] Sensitive fields redacted (apiKey, password, token)
- [ ] All console.log replaced with logger calls
- [ ] Request IDs tracked across logs
- [ ] JSON format for log aggregation

---

#### 6.2 Prometheus Metrics

**Priority:** P2 - Medium
**Files to Create:**
- `/backend/src/lib/metrics.ts`
- `/backend/src/routes/metrics.ts`

**Implementation:**

```typescript
// backend/src/lib/metrics.ts
import promClient from 'prom-client';

export const register = new promClient.Registry();

// Enable default metrics (CPU, memory, event loop)
promClient.collectDefaultMetrics({ register });

// Custom metrics
export const messageCounter = new promClient.Counter({
  name: 'messages_sent_total',
  help: 'Total messages sent',
  labelNames: ['app_id', 'sender'],
  registers: [register]
});

export const connectionGauge = new promClient.Gauge({
  name: 'socketio_connections_total',
  help: 'Current Socket.IO connections',
  labelNames: ['namespace'],
  registers: [register]
});

export const apiLatency = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register]
});

// Middleware for automatic latency tracking
export function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    apiLatency.observe(
      { method: req.method, route: req.route?.path, status: res.statusCode },
      duration
    );
  });

  next();
}
```

```typescript
// backend/src/routes/metrics.ts
router.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});
```

**Acceptance Criteria:**
- [ ] Prometheus client configured
- [ ] Default metrics enabled (CPU, memory, event loop lag)
- [ ] Custom counters for messages, connections
- [ ] Histogram for API latency (p50, p95, p99)
- [ ] /metrics endpoint exposed
- [ ] Metrics middleware on all routes
- [ ] Grafana dashboard JSON included

---

#### 6.3 Error Tracking (Sentry)

**Priority:** P2 - Medium
**Files to Modify:**
- `/backend/src/app.ts`
- `/backend/src/middleware/errorHandler.ts`

**Implementation:**

```typescript
// backend/src/app.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1, // 10% of transactions
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Sentry.Integrations.Express({ app }),
  ],
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// ... routes

app.use(Sentry.Handlers.errorHandler());
```

**Acceptance Criteria:**
- [ ] Sentry SDK integrated
- [ ] Error handler sends to Sentry
- [ ] Request context included in errors
- [ ] User context (appId, userId) attached
- [ ] Stack traces captured
- [ ] 10% transaction sampling
- [ ] Sensitive data scrubbed

---

### Phase 7: Production Readiness (Week 7-8) 🟢

**Final pre-launch tasks**

#### 7.1 Load Testing

**Priority:** P1 - High
**Tools:** k6, Artillery

**Test Scenarios:**

```javascript
// k6 load test
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up
    { duration: '5m', target: 100 },   // Steady state
    { duration: '2m', target: 1000 },  // Spike
    { duration: '5m', target: 1000 },  // Sustained load
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // <1% errors
  },
};

export default function () {
  const res = http.post('https://api.replyhq.com/v1/conversations/test/messages', {
    body: 'Load test message',
  }, {
    headers: {
      'X-App-Id': __ENV.APP_ID,
      'X-Api-Key': __ENV.API_KEY,
    }
  });

  check(res, {
    'status is 201': (r) => r.status === 201,
    'response time OK': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**Acceptance Criteria:**
- [ ] 1,000 concurrent users sustained
- [ ] P95 latency <500ms
- [ ] <1% error rate
- [ ] Database connection pool stable
- [ ] Memory usage stable (<80%)
- [ ] No memory leaks detected

---

#### 7.2 Security Audit

**Priority:** P1 - High
**Tools:** OWASP ZAP, npm audit

**Tasks:**
- [ ] Run OWASP ZAP against API endpoints
- [ ] npm audit --production (fix all high/critical)
- [ ] Review Sentry errors for security issues
- [ ] Verify HTTPS enforced in production
- [ ] Check all secrets in environment variables (not hardcoded)
- [ ] Review CORS, rate limiting, authentication
- [ ] Penetration testing (optional, recommended)

---

#### 7.3 Documentation

**Priority:** P1 - High

**Required Docs:**
- [ ] API documentation (Swagger/OpenAPI)
- [ ] SDK quickstart guides (iOS, Android, React Native, Flutter)
- [ ] Admin dashboard user guide
- [ ] Deployment runbook
- [ ] Incident response playbook
- [ ] Database backup/restore procedures
- [ ] Monitoring & alerting setup guide

---

## Success Metrics

### Phase 0 (Security) Success Criteria
- [ ] All 12 critical vulnerabilities resolved
- [ ] Security audit passes with 0 high-severity findings
- [ ] Penetration testing completed (if applicable)

### Phase 1 (Performance) Success Criteria
- [ ] Admin dashboard loads in <100ms (1K conversations)
- [ ] No N+1 queries in production logs
- [ ] Database connection pool stable under load
- [ ] P95 API latency <200ms

### Phase 2 (Auth & Billing) Success Criteria
- [ ] JWT authentication working
- [ ] RBAC enforcing permissions correctly
- [ ] Stripe integration processing test payments
- [ ] 14-day trial flow tested end-to-end

### Phase 3 (SDK Onboarding) Success Criteria
- [ ] Onboarding checklist completion rate >60%
- [ ] Time to first message <30 minutes
- [ ] Platform-specific docs generated correctly

### Phase 4 (Analytics) Success Criteria
- [ ] Event tracking latency <50ms
- [ ] Segment queries execute in <500ms (100K users)
- [ ] DSL → SQL translation handles complex nested queries

### Phase 5 (Push Notifications) Success Criteria
- [ ] Push notifications delivered in <5 seconds
- [ ] Invalid token cleanup running automatically
- [ ] Smart delivery logic prevents >90% redundant pushes

### Phase 6 (Observability) Success Criteria
- [ ] All logs in JSON format
- [ ] Prometheus metrics exported
- [ ] Grafana dashboards operational
- [ ] Sentry capturing errors with context

### Phase 7 (Production) Success Criteria
- [ ] Load test passes (1K concurrent users)
- [ ] Security audit clean
- [ ] Documentation complete
- [ ] Runbooks validated

---

## Risk Mitigation

### Critical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Security breach during Phase 0** | Medium | Critical | Deploy to staging only until Phase 0 complete |
| **Database migration failure** | Low | High | Test migrations on staging with production-size data |
| **Stripe integration issues** | Medium | High | Use Stripe test mode extensively, have rollback plan |
| **Load test failures** | Medium | High | Start load testing in Phase 1, not Phase 7 |
| **SDK breaking changes** | Low | High | Version SDK, maintain backwards compatibility |

### Rollback Plans

**Phase 0 (Security):**
- Database migrations reversible with `down` migrations
- Feature flags for new auth (fallback to old API key auth)

**Phase 2 (Stripe):**
- Keep manual billing as fallback
- Stripe webhook failures logged, retry manually

**Phase 4 (Analytics):**
- Event tracking optional, can disable without breaking app
- Segment queries cached, fallback to simple filters

---

## Resource Requirements

### Engineering Team
- **Backend Engineer (Node.js/TypeScript):** 1 FTE
- **Security Review:** External consultant (optional, 2-3 days)
- **Load Testing:** DevOps/Backend engineer (3-5 days)

### Infrastructure Costs (Estimated)

**Phase 0-3 (Staging):**
- 2x Backend instances: $40/month
- 1x PostgreSQL (4GB): $20/month
- 1x Redis (2GB): $10/month
- **Total: ~$70/month**

**Phase 7 (Production):**
- 3x Backend instances (load balanced): $120/month
- 1x PostgreSQL (8GB) + read replica: $100/month
- 1x Redis Sentinel (3 nodes): $60/month
- Monitoring (Grafana Cloud): $50/month
- **Total: ~$330/month**

### Third-Party Services
- Stripe: $0 (transaction fees only)
- Firebase (FCM): $0 (free tier sufficient for MVP)
- Sentry: $26/month (Developer plan)
- **Total: ~$26/month**

---

## Timeline Summary

```mermaid
gantt
    title ReplyHQ SaaS MVP Implementation Roadmap
    dateFormat YYYY-MM-DD
    section Phase 0: Security
    Auth Hardening           :p0-1, 2026-01-27, 3d
    CORS & Rate Limiting     :p0-2, 2026-01-27, 2d
    Row-Level Security       :p0-3, 2026-01-29, 3d
    Input Validation         :p0-4, 2026-01-30, 2d

    section Phase 1: Performance
    Fix N+1 Query            :p1-1, 2026-01-27, 2d
    DB Connection Pool       :p1-2, 2026-01-28, 1d
    Redis Pipelining         :p1-3, 2026-01-29, 2d
    Add Indexes              :p1-4, 2026-01-31, 1d

    section Phase 2: Auth & Billing
    JWT Authentication       :p2-1, 2026-02-01, 4d
    RBAC Implementation      :p2-2, 2026-02-05, 3d
    Stripe Integration       :p2-3, 2026-02-06, 5d

    section Phase 3: SDK Onboarding
    Platform Survey          :p3-1, 2026-02-01, 3d
    Quickstart Generator     :p3-2, 2026-02-04, 4d
    Test Console             :p3-3, 2026-02-08, 3d

    section Phase 4: Analytics
    Event Tracking Schema    :p4-1, 2026-02-11, 5d
    Segmentation DSL         :p4-2, 2026-02-16, 7d

    section Phase 5: Push Notifications
    FCM & APNs Integration   :p5-1, 2026-02-23, 5d
    Smart Delivery Logic     :p5-2, 2026-02-28, 3d

    section Phase 6: Observability
    Structured Logging       :p6-1, 2026-03-03, 2d
    Prometheus Metrics       :p6-2, 2026-03-05, 3d
    Sentry Integration       :p6-3, 2026-03-08, 2d

    section Phase 7: Production
    Load Testing             :p7-1, 2026-03-10, 3d
    Security Audit           :p7-2, 2026-03-13, 2d
    Documentation            :p7-3, 2026-03-15, 3d
```

**Total Duration:** ~7-8 weeks (Feb 1 - Mar 18, 2026)

**Critical Path:** Phase 0 → Phase 2 → Phase 7

---

## References & Research

### Internal References
- Security Review: `/private/tmp/claude/-Users-alin-Desktop-replyhq/tasks/af3d1dc.output`
- Performance Analysis: `/private/tmp/claude/-Users-alin-Desktop-replyhq/tasks/a0013ac.output`
- Data Model Review: `/private/tmp/claude/-Users-alin-Desktop-replyhq/tasks/a01402e.output`
- Architecture Review: `/private/tmp/claude/-Users-alin-Desktop-replyhq/tasks/ad3906e.output`
- Socket.IO Migration Solution: `/Users/alin/Desktop/replyhq/docs/solutions/integration-issues/socketio-migration-production-realtime.md`

### External References
- **Socket.IO Scaling:** Redis adapter, sticky sessions, horizontal scaling patterns
- **PostgreSQL Performance:** N+1 queries, connection pooling, RLS for multi-tenancy
- **Stripe Best Practices:** Subscription management, webhook handling, proration
- **Push Notifications:** FCM/APNs integration, smart delivery, token management
- **User Segmentation:** Query DSL design, TimescaleDB for events, JSONB indexing

### Related Documentation
- PRD: `/Users/alin/Desktop/replyhq/sdk/PRD.md`
- Backend PRD: `/Users/alin/Desktop/replyhq/sdk/backend_prd.md`
- Socket.IO Architecture: `docs/ADR-001-SOCKETIO-MIGRATION.md`

---

## Next Steps

After plan approval:

1. **Review with stakeholders** - Validate priorities and timeline
2. **Create GitHub issues** - One issue per phase (7 total)
3. **Set up project board** - Track progress across phases
4. **Begin Phase 0** - Critical security fixes (Week 1)
5. **Parallel Phase 1** - Performance fixes (Week 1-2)
6. **Schedule load testing** - Weekly throughout Phases 1-6
7. **Continuous security scanning** - npm audit, OWASP ZAP weekly
8. **Production deployment** - Post Phase 7 completion (Week 8)

---

**Plan Status:** Ready for Implementation
**Last Updated:** 2026-01-25
**Maintainer:** ReplyHQ Engineering Team
