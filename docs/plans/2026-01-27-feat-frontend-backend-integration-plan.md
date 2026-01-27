---
title: Frontend-Backend Integration for ReplyHQ Dashboard
type: feat
date: 2026-01-27
---

# Frontend-Backend Integration for ReplyHQ Dashboard

## Overview

Integrate the vanilla HTML/CSS/JavaScript frontend pages (located in `backend/public/`) with the existing Node.js/Express backend to create a fully functional ReplyHQ dashboard. The frontend consists of 10 pages representing different features: dashboard, chat, broadcasts, workflows, settings, onboarding, and analytics. This plan maps existing UI requirements to backend functionality and identifies missing features that need future implementation.

## Problem Statement

The ReplyHQ backend has a comprehensive Node.js/Express API with:
- Real-time messaging via Socket.IO
- JWT-based admin authentication
- Analytics and segmentation
- Push notifications (FCM/APNs)
- Stripe billing integration
- SDK onboarding flow

However, the vanilla HTML/CSS/JS frontend pages in `backend/public/` are currently static mockups with no backend integration. Users cannot:
- View actual conversations or send messages
- Access real analytics data
- Manage settings or billing
- Create broadcasts or workflows (features not yet implemented in backend)

## Proposed Solution

Implement a phased integration approach:

### Phase 1: Core Infrastructure (Foundation)
Set up the essential plumbing to serve frontend pages and handle authentication.

### Phase 2: Existing Feature Integration
Connect frontend pages to backend APIs that already exist (chat, analytics, onboarding, settings).

### Phase 3: Missing Features Implementation
Build backend APIs for features that exist in the UI but not in the backend (broadcasts, workflows).

## Technical Approach

### Architecture

**Frontend Architecture:**
- Pure vanilla HTML/CSS/JavaScript (no build step)
- Socket.IO client library for real-time updates
- JWT tokens stored in `localStorage` for authentication
- Fetch API for REST calls
- Event-driven architecture matching Socket.IO server events

**Backend Architecture:**
- Node.js with Express.js and TypeScript
- PostgreSQL via Prisma ORM
- Socket.IO for real-time messaging
- Redis for presence tracking and pub/sub
- JWT-based authentication (15min access, 7d refresh)

**Authentication Flow:**
```
User Login → POST /admin/auth/login → {accessToken, refreshToken}
                                        ↓
                            Store in localStorage
                                        ↓
                    All requests: Authorization: Bearer {accessToken}
                                        ↓
                    Token expired? → POST /admin/auth/refresh
```

**Real-time Flow:**
```
Connect Socket.IO → /admin namespace
                         ↓
            Auth via socket.handshake.auth {app_id, admin_token}
                         ↓
            Join app room: app:${appId}
                         ↓
    Listen: message:new, user:typing, session:connect
    Emit: message:send, typing:start, conversation:join
```

### Feature-by-Feature Mapping

#### 1. Dashboard (`dashboard.html`)
**Status:** ✅ Backend Ready

**Frontend Requirements:**
- Display conversation list with last message, time, user info
- Show online/offline status for users
- Real-time updates when new messages arrive
- Filter conversations by status (open/resolved)
- Quick stats: total conversations, response time, resolution rate

**Backend APIs:**
- `GET /admin/api/users` - List conversations with presence
- Socket.IO `/admin` namespace - Real-time conversation updates
- Event: `message:new` - New message broadcast
- Event: `session:connect` - User came online

**Implementation Files:**
- Backend: `backend/src/routes/admin.ts:20-50`
- Service: `backend/src/services/messageService.ts`
- Real-time: `backend/src/services/socketService.ts`

**Integration Tasks:**
```javascript
// dashboard.js (new file to create)
const socket = io('/admin', {
  auth: {
    app_id: getAppId(),
    admin_token: getAccessToken()
  }
});

async function loadConversations() {
  const response = await fetch('/admin/api/users', {
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  const { conversations } = await response.json();
  renderConversationList(conversations);
}

socket.on('message:new', (message) => {
  updateConversationPreview(message.conversationId, message);
});

socket.on('session:connect', ({ deviceId }) => {
  updatePresenceIndicator(deviceId, 'online');
});
```

**Database Models Used:**
- `Conversation` - Chat conversations
- `Message` - Last message preview
- Presence data from Redis

---

#### 2. Chat Interface (`chat.html`)
**Status:** ✅ Backend Ready

**Frontend Requirements:**
- Display conversation messages in chronological order
- Send messages as agent
- Typing indicators (both directions)
- Message delivery status (SENT/DELIVERED/READ)
- Auto-scroll to latest message
- User metadata sidebar (device info, platform, location)
- Conversation status controls (resolve/reopen)

**Backend APIs:**
- `GET /admin/api/conversations/:id/messages` - Fetch messages with pagination
- `POST /admin/api/conversations/:id/messages` - Send message as agent
- Socket.IO events:
  - Emit: `conversation:join`, `typing:start`, `typing:stop`, `message:send`
  - Listen: `message:new`, `user:typing`, `conversation:joined`

**Implementation Files:**
- Backend: `backend/src/routes/admin.ts:55-120`
- Service: `backend/src/services/messageService.ts`
- Real-time: `backend/src/services/socketService.ts:180-250`

**Integration Tasks:**
```javascript
// chat.js (new file to create)
const conversationId = getConversationIdFromUrl();

// Join conversation room for real-time updates
socket.emit('conversation:join', { conversation_id: conversationId }, (response) => {
  console.log('Joined conversation:', response.last_message_id);
});

// Load historical messages
async function loadMessages() {
  const response = await fetch(`/admin/api/conversations/${conversationId}/messages`, {
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  const { messages } = await response.json();
  renderMessages(messages);
}

// Send message
async function sendMessage(body) {
  const response = await fetch(`/admin/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body, sender: 'agent' })
  });
  const message = await response.json();
  appendMessage(message);
}

// Real-time message updates
socket.on('message:new', (message) => {
  if (message.conversation_id === conversationId) {
    appendMessage(message);
    autoScrollToBottom();
  }
});

// Typing indicators
let typingTimeout;
messageInput.addEventListener('input', () => {
  clearTimeout(typingTimeout);
  socket.emit('typing:start', { conversation_id: conversationId });
  typingTimeout = setTimeout(() => {
    socket.emit('typing:stop', { conversation_id: conversationId });
  }, 3000);
});

socket.on('user:typing', ({ device_id, is_typing }) => {
  showTypingIndicator(is_typing);
});
```

**Database Models Used:**
- `Conversation` - Conversation metadata
- `Message` - Messages with sender, status, timestamps
- `Device` - User device info for sidebar

**Critical Learnings to Apply:**
1. **Multi-connection presence** - Don't mark device offline if ONE tab closes
2. **Cursor-based sync** - Use `last_message_id` cursor, NOT timestamps (clock skew protection)
3. **Message idempotency** - Generate `local_id` UUID client-side for deduplication
4. **Graceful shutdown** - Handle `server:shutdown` event to prevent message loss

Reference: `docs/solutions/integration-issues/socketio-migration-production-realtime.md`

---

#### 3. Onboarding (`onboarding.html`)
**Status:** ✅ Backend Ready

**Frontend Requirements:**
- Platform selection (iOS, Android, React Native, Flutter)
- Step-by-step integration guide
- Progress tracking (4 tasks: SDK install, first message, user ID, team invite)
- Code snippets with pre-filled API credentials
- Checklist with completion indicators

**Backend APIs:**
- `POST /admin/onboarding/platform` - Set platform and use case
- `GET /admin/onboarding/checklist` - Get progress
- `POST /admin/onboarding/mark-complete/:taskId` - Mark task complete
- `GET /admin/onboarding/status` - Get overall status
- `GET /admin/docs/quickstart/:platform` - Platform-specific quickstart with credentials

**Implementation Files:**
- Backend: `backend/src/routes/onboarding.ts`
- Backend: `backend/src/routes/docs.ts`
- Database: `OnboardingState` model in Prisma schema

**Integration Tasks:**
```javascript
// onboarding.js (new file to create)
async function selectPlatform(platform, useCase) {
  await fetch('/admin/onboarding/platform', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ platform, use_case: useCase })
  });

  // Load quickstart guide
  const response = await fetch(`/admin/docs/quickstart/${platform}`, {
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  const { quickstart } = await response.json();
  renderQuickstart(quickstart); // Contains API key, app ID pre-filled
}

async function loadProgress() {
  const response = await fetch('/admin/onboarding/checklist', {
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  const { tasks } = await response.json();

  // tasks = [
  //   { id: 'sdk_installed', label: 'Install SDK', completed: true },
  //   { id: 'first_message', label: 'Send first message', completed: false },
  //   ...
  // ]
  renderChecklist(tasks);
}

async function markTaskComplete(taskId) {
  await fetch(`/admin/onboarding/mark-complete/${taskId}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  loadProgress(); // Refresh UI
}
```

**Database Models Used:**
- `OnboardingState` - Progress tracking per app
- Fields: platform, useCase, sdkInstalled, firstMessageSent, userIdentified, teamInvited

---

#### 4. Settings (`settings.html`)
**Status:** ⚠️ Partially Ready

**Frontend Requirements:**
- App name and branding settings
- API key management (view, regenerate)
- Team member management (invite, remove, role assignment)
- Webhook configuration
- Notification preferences
- Billing information (plan, usage, payment method)

**Backend APIs Available:**
- `GET /admin/billing/subscription` - Current subscription details
- `POST /admin/billing/checkout` - Create Stripe checkout session
- `POST /admin/billing/cancel` - Cancel subscription
- `POST /admin/billing/reactivate` - Reactivate subscription

**Backend APIs Missing:**
- ❌ `GET /admin/settings/app` - Get app settings (name, branding, webhooks)
- ❌ `PUT /admin/settings/app` - Update app settings
- ❌ `GET /admin/settings/api-keys` - List API keys
- ❌ `POST /admin/settings/api-keys/regenerate` - Regenerate API key
- ❌ `GET /admin/settings/team` - List team members
- ❌ `POST /admin/settings/team/invite` - Invite team member
- ❌ `DELETE /admin/settings/team/:userId` - Remove team member
- ❌ `PUT /admin/settings/team/:userId/role` - Update member role
- ❌ `GET /admin/settings/webhooks` - List webhooks
- ❌ `POST /admin/settings/webhooks` - Create webhook
- ❌ `DELETE /admin/settings/webhooks/:id` - Delete webhook

**Integration Tasks (Billing Only - Settings Deferred to Phase 3):**
```javascript
// settings.js - Billing section only
async function loadBillingInfo() {
  const response = await fetch('/admin/billing/subscription', {
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  const subscription = await response.json();

  // subscription = {
  //   status: 'active',
  //   currentPeriodEnd: '2026-03-27',
  //   planName: 'Pro',
  //   stripePriceId: 'price_xxx'
  // }
  renderBillingCard(subscription);
}

async function cancelSubscription() {
  const confirmed = confirm('Cancel subscription at period end?');
  if (!confirmed) return;

  await fetch('/admin/billing/cancel', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });

  loadBillingInfo(); // Refresh
}

async function upgradePlan() {
  const response = await fetch('/admin/billing/checkout', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getAccessToken()}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ price_id: 'price_pro_plan' })
  });

  const { url } = await response.json();
  window.location.href = url; // Redirect to Stripe Checkout
}
```

**Database Models Used:**
- `Subscription` - Stripe subscription data
- `App` - App settings (name, settings JSON)
- `AdminUser` - Team members with roles

**See:** Missing features documented in `docs/missing-backend-features.md`

---

#### 5. Broadcasts (`broadcasts.html`, `broadcast-new.html`, `broadcast-analytics.html`)
**Status:** ❌ Backend Not Implemented

**Frontend Requirements:**

**broadcasts.html:**
- List all broadcasts (sent, scheduled, drafts)
- Quick stats: total sent, avg open rate, avg click rate
- Broadcast cards showing: title, status, send date, target audience, stats

**broadcast-new.html:**
- Create new broadcast message
- Target audience selection (All Users, Segment, Specific Users)
- Message composer with rich text
- Schedule send or send immediately
- Preview before sending

**broadcast-analytics.html:**
- Detailed analytics for a specific broadcast
- Open rate, click rate, conversion rate over time
- Geographic distribution
- Device breakdown
- Individual user engagement list

**Backend APIs Missing:**
All broadcast functionality needs to be implemented:

- ❌ `GET /admin/broadcasts` - List broadcasts with stats
- ❌ `POST /admin/broadcasts` - Create broadcast
- ❌ `GET /admin/broadcasts/:id` - Get broadcast details
- ❌ `PUT /admin/broadcasts/:id` - Update broadcast
- ❌ `DELETE /admin/broadcasts/:id` - Delete broadcast
- ❌ `POST /admin/broadcasts/:id/send` - Send broadcast immediately
- ❌ `POST /admin/broadcasts/:id/schedule` - Schedule broadcast
- ❌ `GET /admin/broadcasts/:id/analytics` - Get detailed analytics
- ❌ `GET /admin/broadcasts/:id/recipients` - List recipients with status

**Database Models Needed:**
```prisma
model Broadcast {
  id              String   @id @default(cuid())
  appId           String
  title           String
  body            String   @db.Text
  targetType      TargetType  // ALL_USERS | SEGMENT | SPECIFIC_USERS
  segmentQuery    Json?    // For SEGMENT targeting
  userIds         String[] // For SPECIFIC_USERS
  status          BroadcastStatus // DRAFT | SCHEDULED | SENDING | SENT | FAILED
  scheduledAt     DateTime?
  sentAt          DateTime?
  totalRecipients Int      @default(0)
  totalSent       Int      @default(0)
  totalDelivered  Int      @default(0)
  totalOpened     Int      @default(0)
  totalClicked    Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  app             App      @relation(fields: [appId], references: [id], onDelete: Cascade)
  recipients      BroadcastRecipient[]

  @@index([appId, status])
}

model BroadcastRecipient {
  id            String   @id @default(cuid())
  broadcastId   String
  userId        String
  deviceId      String
  status        RecipientStatus // PENDING | SENT | DELIVERED | OPENED | CLICKED | FAILED
  sentAt        DateTime?
  deliveredAt   DateTime?
  openedAt      DateTime?
  clickedAt     DateTime?
  errorMessage  String?

  broadcast     Broadcast @relation(fields: [broadcastId], references: [id], onDelete: Cascade)

  @@unique([broadcastId, deviceId])
  @@index([broadcastId, status])
}

enum TargetType {
  ALL_USERS
  SEGMENT
  SPECIFIC_USERS
}

enum BroadcastStatus {
  DRAFT
  SCHEDULED
  SENDING
  SENT
  FAILED
}

enum RecipientStatus {
  PENDING
  SENT
  DELIVERED
  OPENED
  CLICKED
  FAILED
}
```

**Services Needed:**
- `broadcastService.ts` - CRUD operations, recipient resolution
- `broadcastScheduler.ts` - Cron job for scheduled broadcasts
- `broadcastSender.ts` - Send messages via push notifications + in-app

**See:** Missing features documented in `docs/missing-backend-features.md`

---

#### 6. Workflows (`workflows.html`, `workflow-editor.html`)
**Status:** ❌ Backend Not Implemented

**Frontend Requirements:**

**workflows.html:**
- List all workflows (active, paused, draft)
- Workflow cards showing: title, description, status, stats (entered, converted)
- Create new workflow button

**workflow-editor.html:**
- Visual workflow builder with drag-and-drop
- Trigger configuration (user event, time-based, API)
- Action nodes (send message, wait, condition, webhook)
- Condition branching (if/else logic)
- Save, activate, pause, delete workflow

**Backend APIs Missing:**
All workflow functionality needs to be implemented:

- ❌ `GET /admin/workflows` - List workflows
- ❌ `POST /admin/workflows` - Create workflow
- ❌ `GET /admin/workflows/:id` - Get workflow details
- ❌ `PUT /admin/workflows/:id` - Update workflow
- ❌ `DELETE /admin/workflows/:id` - Delete workflow
- ❌ `POST /admin/workflows/:id/activate` - Activate workflow
- ❌ `POST /admin/workflows/:id/pause` - Pause workflow
- ❌ `GET /admin/workflows/:id/analytics` - Get workflow analytics
- ❌ `GET /admin/workflows/:id/executions` - List executions

**Database Models Needed:**
```prisma
model Workflow {
  id          String   @id @default(cuid())
  appId       String
  name        String
  description String?
  trigger     Json     // { type: 'event', event_name: 'user_signup' }
  nodes       Json     // DAG of action nodes
  edges       Json     // Connections between nodes
  status      WorkflowStatus // DRAFT | ACTIVE | PAUSED
  version     Int      @default(1)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  app         App      @relation(fields: [appId], references: [id], onDelete: Cascade)
  executions  WorkflowExecution[]

  @@index([appId, status])
}

model WorkflowExecution {
  id          String   @id @default(cuid())
  workflowId  String
  userId      String
  deviceId    String
  status      ExecutionStatus // RUNNING | COMPLETED | FAILED | CANCELLED
  currentNodeId String?
  context     Json     // Execution state
  startedAt   DateTime @default(now())
  completedAt DateTime?
  errorMessage String?

  workflow    Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  steps       WorkflowStep[]

  @@index([workflowId, status])
  @@index([userId, status])
}

model WorkflowStep {
  id          String   @id @default(cuid())
  executionId String
  nodeId      String
  action      String   // send_message | wait | condition | webhook
  status      StepStatus // PENDING | RUNNING | COMPLETED | FAILED | SKIPPED
  input       Json
  output      Json?
  startedAt   DateTime @default(now())
  completedAt DateTime?
  errorMessage String?

  execution   WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([executionId])
}

enum WorkflowStatus {
  DRAFT
  ACTIVE
  PAUSED
}

enum ExecutionStatus {
  RUNNING
  COMPLETED
  FAILED
  CANCELLED
}

enum StepStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
  SKIPPED
}
```

**Services Needed:**
- `workflowService.ts` - CRUD operations
- `workflowEngine.ts` - Execute workflows (DAG traversal)
- `workflowTriggerService.ts` - Listen for events and trigger workflows

**Workflow Execution Logic:**
1. Event occurs (e.g., `user_signup`)
2. Find active workflows with matching trigger
3. Create `WorkflowExecution` record
4. Traverse DAG: execute each node based on edges
5. Handle conditions: evaluate, choose branch
6. Execute actions: send message, call webhook, wait
7. Update execution status (COMPLETED/FAILED)
8. Track analytics (conversion rate, drop-off points)

**See:** Missing features documented in `docs/missing-backend-features.md`

---

#### 7. Analytics Dashboard (implied in UI stats)
**Status:** ✅ Backend Ready

**Frontend Requirements:**
- Overview stats: total users, conversations, messages
- Event timeline (hourly/daily/weekly)
- Top events list
- User segmentation preview
- Export to CSV

**Backend APIs:**
- `GET /admin/analytics/overview` - Dashboard stats
- `GET /admin/analytics/events/counts` - Event counts by name
- `GET /admin/analytics/events/top` - Top events
- `GET /admin/analytics/events/timeline` - Time-series data
- `POST /admin/analytics/segments/preview` - Preview segment users
- `POST /admin/analytics/segments/export` - Export to CSV

**Implementation Files:**
- Backend: `backend/src/routes/analytics.ts`
- Service: `backend/src/services/analyticsService.ts`
- Database: `Event` model

**Integration Tasks:**
```javascript
// analytics.js (new file to create)
async function loadOverview() {
  const response = await fetch('/admin/analytics/overview', {
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  const stats = await response.json();

  // stats = {
  //   totalUsers: 1234,
  //   totalConversations: 567,
  //   avgResponseTime: 120, // seconds
  //   topEvents: [...]
  // }
  renderOverviewCards(stats);
}

async function loadEventTimeline(interval = 'daily') {
  const response = await fetch(`/admin/analytics/events/timeline?interval=${interval}`, {
    headers: { 'Authorization': `Bearer ${getAccessToken()}` }
  });
  const { timeline } = await response.json();

  // timeline = [
  //   { timestamp: '2026-01-27T00:00:00Z', event_name: 'user_login', count: 45 },
  //   ...
  // ]
  renderChart(timeline);
}
```

**Database Models Used:**
- `Event` - Analytics events with properties, timestamps, user segments

---

#### 8. Authentication Pages (Login/Signup)
**Status:** ✅ Backend Ready (Login Only)

**Frontend Requirements:**
- Login form (email + password)
- Token storage (localStorage)
- Token refresh on expiry
- Logout functionality
- Protected routes (redirect to login if not authenticated)

**Backend APIs:**
- `POST /admin/auth/login` - Login with email/password
- `POST /admin/auth/refresh` - Refresh access token
- `POST /admin/auth/logout` - Revoke refresh token

**Note:** Signup/registration is NOT implemented. Admin users are created manually via database or setup route.

**Implementation Files:**
- Backend: `backend/src/routes/auth.ts`
- Middleware: `backend/src/middleware/jwt.ts`

**Integration Tasks:**
```javascript
// auth.js (new file to create)
async function login(email, password) {
  const response = await fetch('/admin/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Login failed');
  }

  const { accessToken, refreshToken } = await response.json();

  // Store tokens
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);

  // Decode and store user info
  const payload = JSON.parse(atob(accessToken.split('.')[1]));
  localStorage.setItem('userId', payload.userId);
  localStorage.setItem('appId', payload.appId);
  localStorage.setItem('role', payload.role);

  // Redirect to dashboard
  window.location.href = '/admin/dashboard.html';
}

async function getValidAccessToken() {
  const token = localStorage.getItem('accessToken');
  if (!token) return null;

  const payload = JSON.parse(atob(token.split('.')[1]));
  const expiry = payload.exp * 1000; // Convert to milliseconds

  // Refresh if expired or expiring in next minute
  if (expiry < Date.now() + 60000) {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await fetch('/admin/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      // Refresh token invalid, logout
      logout();
      return null;
    }

    const { accessToken: newToken } = await response.json();
    localStorage.setItem('accessToken', newToken);
    return newToken;
  }

  return token;
}

async function logout() {
  const refreshToken = localStorage.getItem('refreshToken');
  if (refreshToken) {
    await fetch('/admin/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });
  }

  // Clear storage
  localStorage.clear();
  window.location.href = '/admin/login.html';
}

// Route protection
function requireAuth() {
  const token = localStorage.getItem('accessToken');
  if (!token) {
    window.location.href = '/admin/login.html';
    return false;
  }
  return true;
}

// Use on every protected page
if (!requireAuth()) {
  // Page will redirect to login
}
```

**Database Models Used:**
- `AdminUser` - Email, passwordHash, role
- `RefreshToken` - Refresh tokens with expiry

**Critical Learnings:**
- Access tokens: 15 minutes expiry (short-lived for security)
- Refresh tokens: 7 days expiry (stored in DB for revocation)
- Always check token expiry BEFORE making requests
- Auto-refresh before expiry to prevent failed requests

Reference: `docs/plans/2026-01-25-feat-saas-mvp-implementation-roadmap-plan.md` Section 2.1

---

### Implementation Phases

#### Phase 1: Core Infrastructure (Days 1-2)

**Tasks:**

1. **Static File Serving**
   - Add Express static middleware to serve `backend/public/` directory
   - Configure routes: `/admin/*` serves corresponding HTML files
   - Set proper MIME types and caching headers

```typescript
// backend/src/app.ts
import path from 'path';

// Serve static files
app.use('/admin', express.static(path.join(__dirname, '../public')));

// Fallback for SPA-like routing (optional)
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'dashboard.html'));
});
```

2. **Create Shared JavaScript Utilities**
   - `backend/public/js/auth.js` - Authentication helpers (login, logout, token refresh)
   - `backend/public/js/api.js` - Fetch wrapper with auto-token-refresh
   - `backend/public/js/socket.js` - Socket.IO connection manager
   - `backend/public/js/utils.js` - Common utilities (date formatting, avatars, etc.)

```javascript
// Example: backend/public/js/api.js
async function apiRequest(url, options = {}) {
  const token = await getValidAccessToken();
  if (!token) {
    window.location.href = '/admin/login.html';
    return;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (response.status === 401) {
    // Token invalid, logout
    logout();
    return;
  }

  return response;
}
```

3. **Create Login Page**
   - New file: `backend/public/login.html`
   - Form with email + password
   - Error handling and validation
   - Redirect to dashboard on success

4. **Add Route Protection**
   - Add `requireAuth()` check to all dashboard HTML files
   - Redirect to login if no token

**Success Criteria:**
- [x] Static files served at `/admin/*` routes
- [x] Login page functional with JWT token storage
- [ ] Protected routes redirect to login when unauthenticated
- [x] Token refresh works automatically before expiry
- [x] Shared utilities reusable across all pages

**Files to Create:**
- [x] `backend/public/login.html`
- [x] `backend/public/js/auth.js`
- [x] `backend/public/js/api.js`
- [x] `backend/public/js/socket.js`
- [x] `backend/public/js/utils.js`

**Files to Modify:**
- [x] `backend/src/app.ts` - Add static file serving
- [ ] All HTML files in `backend/public/*.html` - Add auth check and import utilities

---

#### Phase 2: Existing Feature Integration (Days 3-5)

Integrate pages that have complete backend support.

**2.1 Dashboard Integration**

**Tasks:**
- Create `backend/public/js/dashboard.js`
- Fetch conversations via `GET /admin/api/users`
- Connect Socket.IO `/admin` namespace
- Real-time message updates
- Presence indicators (online/offline)
- Search and filter conversations

**Acceptance Criteria:**
- [ ] Conversation list displays real data from backend
- [ ] Last message preview shows actual last message
- [ ] Online/offline status indicators work
- [ ] New messages update list in real-time
- [ ] Clicking conversation navigates to chat page with correct ID

**Files to Create:**
- `backend/public/js/dashboard.js`

**Files to Modify:**
- `backend/public/dashboard.html` - Import dashboard.js, add data-* attributes for DOM manipulation

---

**2.2 Chat Interface Integration**

**Tasks:**
- Create `backend/public/js/chat.js`
- Load messages via `GET /admin/api/conversations/:id/messages`
- Join conversation room via Socket.IO
- Send messages via `POST /admin/api/conversations/:id/messages`
- Typing indicators (emit `typing:start`, `typing:stop`)
- Auto-scroll to bottom
- Message status indicators

**Acceptance Criteria:**
- [ ] Messages load from backend
- [ ] Can send messages as agent
- [ ] Real-time message delivery (see new messages without refresh)
- [ ] Typing indicators work both directions
- [ ] Message timestamps formatted correctly
- [ ] Auto-scroll to latest message
- [ ] Message status displayed (SENT/DELIVERED/READ)

**Files to Create:**
- `backend/public/js/chat.js`

**Files to Modify:**
- `backend/public/chat.html` - Import chat.js, add IDs to DOM elements

---

**2.3 Onboarding Integration**

**Tasks:**
- Create `backend/public/js/onboarding.js`
- Platform selection via `POST /admin/onboarding/platform`
- Load quickstart guide via `GET /admin/docs/quickstart/:platform`
- Display progress via `GET /admin/onboarding/checklist`
- Mark tasks complete via `POST /admin/onboarding/mark-complete/:taskId`
- Pre-fill API credentials in code snippets

**Acceptance Criteria:**
- [ ] Platform selection saves to backend
- [ ] Quickstart guide loads with API key, app ID pre-filled
- [ ] Progress checklist shows real completion status
- [ ] Clicking "Mark Complete" updates backend and UI
- [ ] Progress percentage calculated correctly

**Files to Create:**
- `backend/public/js/onboarding.js`

**Files to Modify:**
- `backend/public/onboarding.html` - Import onboarding.js

---

**2.4 Settings (Billing Section Only)**

**Tasks:**
- Create `backend/public/js/settings.js`
- Load subscription info via `GET /admin/billing/subscription`
- Cancel subscription via `POST /admin/billing/cancel`
- Reactivate subscription via `POST /admin/billing/reactivate`
- Upgrade plan via Stripe Checkout redirect

**Acceptance Criteria:**
- [ ] Current plan displays correctly
- [ ] Subscription status shown (active, canceled, past_due)
- [ ] Cancel button works (subscription cancels at period end)
- [ ] Upgrade button redirects to Stripe Checkout
- [ ] Trial status displayed if applicable

**Files to Create:**
- `backend/public/js/settings.js`

**Files to Modify:**
- `backend/public/settings.html` - Import settings.js, disable non-billing sections with "Coming Soon" badges

---

**2.5 Analytics Dashboard Integration**

**Tasks:**
- Create `backend/public/js/analytics.js`
- Load overview stats via `GET /admin/analytics/overview`
- Load event timeline via `GET /admin/analytics/events/timeline`
- Display top events via `GET /admin/analytics/events/top`
- Segment preview via `POST /admin/analytics/segments/preview`

**Acceptance Criteria:**
- [ ] Overview cards show real stats
- [ ] Event timeline chart renders with real data
- [ ] Top events list populated from backend
- [ ] Date range selector updates data
- [ ] Segment preview shows matching user count

**Files to Create:**
- `backend/public/js/analytics.js`

**Files to Modify:**
- `backend/public/dashboard.html` - Add analytics section if missing, or create separate `analytics.html`

---

#### Phase 3: Missing Features Implementation (Days 6-10+)

**Note:** This phase is documented separately in `docs/missing-backend-features.md`. It involves:
1. Implementing broadcast backend (database models, routes, services)
2. Implementing workflow backend (database models, execution engine)
3. Implementing settings backend (API keys, team management, webhooks)
4. Integrating frontend to these new APIs

**Out of Scope for Initial Integration:**
These features will be designed and implemented in future iterations after core dashboard is functional.

---

## Database Changes

### New Models Required (Phase 3)

See Phase 3 sections above for:
- `Broadcast`, `BroadcastRecipient` models
- `Workflow`, `WorkflowExecution`, `WorkflowStep` models

### Schema Modifications Needed

None for Phases 1-2. All required models already exist:
- ✅ `App` - App configuration
- ✅ `Conversation` - Chat conversations
- ✅ `Message` - Messages
- ✅ `AdminUser` - Dashboard users
- ✅ `RefreshToken` - JWT refresh tokens
- ✅ `Subscription` - Billing
- ✅ `OnboardingState` - Onboarding progress
- ✅ `Event` - Analytics events
- ✅ `Device` - Push tokens
- ✅ `PushNotification` - Notification delivery tracking

---

## Acceptance Criteria

### Functional Requirements

**Phase 1:**
- [ ] Static files served correctly at `/admin/*` routes
- [ ] Login page authenticates users and stores JWT tokens
- [ ] Protected routes redirect to login when unauthenticated
- [ ] Token refresh happens automatically before expiry
- [ ] Logout revokes refresh token and clears storage

**Phase 2:**
- [ ] Dashboard shows real conversation list with last messages
- [ ] Chat interface loads messages and sends new messages
- [ ] Real-time updates work (new messages, typing indicators, presence)
- [ ] Onboarding wizard tracks progress and displays platform-specific guides
- [ ] Billing settings display subscription status and allow cancellation
- [ ] Analytics dashboard shows real event data and stats

**Phase 3 (Future):**
- [ ] Broadcasts can be created, scheduled, and sent
- [ ] Broadcast analytics show open rates, click rates, geographic data
- [ ] Workflows can be created with visual editor
- [ ] Workflows execute correctly based on triggers
- [ ] Settings page allows API key management, team invites, webhook config

### Non-Functional Requirements

**Performance:**
- [ ] Page load time < 2 seconds
- [ ] Real-time message delivery latency < 500ms
- [ ] Token refresh happens seamlessly without user noticing
- [ ] No N+1 query issues (conversation list uses single query with JOIN)

**Security:**
- [ ] JWT tokens stored securely (httpOnly cookies preferred, localStorage acceptable)
- [ ] All API requests authenticated with valid tokens
- [ ] Expired tokens automatically refreshed
- [ ] CORS configured with whitelist
- [ ] API keys never exposed in client-side code (use backend proxy)

**Accessibility:**
- [ ] Keyboard navigation works for all interactive elements
- [ ] ARIA labels present for screen readers
- [ ] Focus indicators visible
- [ ] Color contrast meets WCAG AA standards

**Quality Gates:**
- [ ] No console errors on any page
- [ ] All fetch requests have error handling
- [ ] Loading states shown during async operations
- [ ] Empty states displayed when no data
- [ ] Forms validate input before submission

---

## Success Metrics

**User-Facing:**
- Admins can view and respond to conversations within 30 seconds of login
- Real-time message delivery works 99.9% of the time
- Token refresh rate < 0.1% failure (should be near-zero with proper implementation)

**Technical:**
- Average API response time < 200ms
- Socket.IO connection uptime > 99%
- Zero message loss during server restarts (graceful shutdown)
- Frontend bundle size < 500KB (vanilla JS, no frameworks)

---

## Dependencies & Prerequisites

**Phase 1:**
- No dependencies (all backend APIs exist)

**Phase 2:**
- Phase 1 complete (auth and static serving)
- Socket.IO client library (already available via CDN)

**Phase 3:**
- Database migrations for new models
- Prisma schema updates
- New backend services (broadcast, workflow engines)

**External Dependencies:**
- Socket.IO client library (CDN)
- Chart.js or similar for analytics charts (optional)

---

## Risk Analysis & Mitigation

**Risk 1: Token Expiry Edge Cases**
- **Impact:** Users logged out unexpectedly
- **Mitigation:**
  - Refresh tokens 1 minute BEFORE expiry (not at expiry)
  - Queue failed requests and retry after refresh
  - Add visual indicator when refreshing

**Risk 2: Socket.IO Multi-Tab Issues**
- **Impact:** Device marked offline when closing one tab
- **Mitigation:**
  - Use per-connection tracking (already implemented in backend)
  - Frontend should track connection count per device
  - Only show "offline" when ALL connections closed
  - Reference: `docs/solutions/integration-issues/socketio-migration-production-realtime.md`

**Risk 3: Real-time Message Loss**
- **Impact:** Messages not delivered during server restarts
- **Mitigation:**
  - Handle `server:shutdown` event (already implemented in backend)
  - Client waits specified delay before reconnecting
  - Use cursor-based sync on reconnect (fetch messages after `last_message_id`)

**Risk 4: Missing Backend Features Block UI**
- **Impact:** Broadcasts and Workflows pages non-functional
- **Mitigation:**
  - Phase 3 explicitly separate from Phases 1-2
  - Add "Coming Soon" badges to unimplemented features
  - Document missing features in `docs/missing-backend-features.md`
  - Prioritize based on user feedback after Phase 2 launch

**Risk 5: N+1 Queries on Dashboard**
- **Impact:** Slow dashboard load with many conversations
- **Mitigation:**
  - Backend already optimized (single query with JOIN LATERAL)
  - Pagination for conversation list (limit 50 per page)
  - Reference: `docs/plans/2026-01-25-feat-saas-mvp-implementation-roadmap-plan.md`

---

## Resource Requirements

**Development Time:**
- Phase 1 (Infrastructure): 1-2 days
- Phase 2 (Integration): 3-5 days
- Phase 3 (New Features): 5-10 days (separate project)

**Team:**
- 1 Full-stack developer (familiar with Node.js, Socket.IO, vanilla JS)
- Optional: 1 Designer for UI polish

**Infrastructure:**
- No changes needed (all backend infrastructure exists)
- Socket.IO server already running
- Redis already configured for presence

---

## Future Considerations

**1. Framework Migration**
Consider migrating from vanilla JS to React/Vue for:
- Better state management
- Component reusability
- TypeScript support
- Easier testing

**Tradeoff:** Increased bundle size, build complexity

**2. API Key Security**
Current implementation exposes API keys client-side. For production:
- Move API key storage to backend sessions
- Use proxy routes: `/admin/api/proxy/users` → adds headers server-side
- Or use short-lived API tokens instead of long-lived keys

**3. Offline Support**
Add Service Worker for:
- Offline message queue (send when reconnected)
- Cached conversation list
- PWA installation

**4. Advanced Analytics**
Beyond current event tracking:
- Funnel analysis
- Cohort analysis
- User journey visualization
- A/B testing integration

**5. Internationalization (i18n)**
Support multiple languages:
- Extract all UI strings to language files
- Use i18n library (e.g., i18next)
- RTL layout support

---

## Documentation Plan

**During Implementation:**
- [ ] Update `BACKEND_DOCUMENTATION.md` with new routes (if any added)
- [ ] Add JSDoc comments to all JavaScript files
- [ ] Document environment variables in `.env.example`

**Post-Implementation:**
- [ ] Create `docs/frontend-integration-guide.md` - How to extend the dashboard
- [ ] Create `docs/api-reference.md` - Complete API documentation
- [ ] Update `README.md` with setup instructions
- [ ] Add Swagger/OpenAPI spec for all admin routes

---

## References & Research

### Internal References

**Backend Architecture:**
- Main docs: `docs/backend.md`
- App entry: `backend/src/index.ts`
- Express app: `backend/src/app.ts:22-95`
- Database schema: `backend/prisma/schema.prisma`

**Existing Routes:**
- Admin routes: `backend/src/routes/admin.ts`
- Auth routes: `backend/src/routes/auth.ts`
- Billing routes: `backend/src/routes/billing.ts`
- Onboarding routes: `backend/src/routes/onboarding.ts`
- Analytics routes: `backend/src/routes/analytics.ts`
- Docs routes: `backend/src/routes/docs.ts`

**Services:**
- Message service: `backend/src/services/messageService.ts`
- Socket.IO service: `backend/src/services/socketService.ts`
- Presence service: `backend/src/services/presenceService.ts`
- Analytics service: `backend/src/services/analyticsService.ts`

**Authentication:**
- JWT middleware: `backend/src/middleware/jwt.ts`
- RBAC permissions: `backend/src/middleware/rbac.ts`

### External References

**Socket.IO Client:**
- Documentation: https://socket.io/docs/v4/client-api/
- CDN: https://cdn.socket.io/4.5.4/socket.io.min.js

**Best Practices:**
- JWT Token Refresh: https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/
- Real-time Best Practices: https://socket.io/docs/v4/emit-cheatsheet/

### Institutional Learnings

**Critical Patterns:**
1. **Multi-connection Presence Tracking**
   - File: `docs/solutions/integration-issues/socketio-migration-production-realtime.md`
   - Key insight: Track per-connection, aggregate at device level
   - Prevents false "offline" when closing one browser tab

2. **Cursor-based Message Sync**
   - File: `docs/solutions/integration-issues/socketio-migration-production-realtime.md`
   - Key insight: Use message IDs as cursors, NOT timestamps
   - Eliminates clock-skew vulnerabilities

3. **Graceful Shutdown Handling**
   - File: `docs/solutions/integration-issues/socketio-migration-production-realtime.md`
   - Key insight: Server emits `server:shutdown` with delay before closing
   - Clients wait before reconnecting to prevent thundering herd

4. **N+1 Query Avoidance**
   - File: `docs/plans/2026-01-25-feat-saas-mvp-implementation-roadmap-plan.md`
   - Key insight: Use single query with JOIN LATERAL for conversation lists
   - Performance: 3s → 50ms (60x improvement)

5. **JWT Token Lifecycle**
   - File: `docs/plans/2026-01-25-feat-saas-mvp-implementation-roadmap-plan.md` Section 2.1
   - Key insight: 15min access tokens, 7d refresh tokens
   - Always refresh BEFORE expiry, not at expiry

### Related Work

**Implementation Roadmap:**
- File: `docs/plans/2026-01-25-feat-saas-mvp-implementation-roadmap-plan.md`
- Contains detailed examples of authentication, real-time chat, analytics integration

**Architecture Decision:**
- File: `docs/ADR-001-SOCKETIO-MIGRATION.md`
- Why Socket.IO over raw WebSocket
- Validated with 96 passing integration tests

---

## Appendix: Missing Backend Features Document

See separate file: `docs/missing-backend-features.md`

This document will be created alongside this plan to catalog all backend functionality that needs to be implemented for full UI feature parity:

1. **Broadcasts System** (High Priority)
   - Database models
   - CRUD routes
   - Scheduling service
   - Sending service (via push + in-app)
   - Analytics aggregation

2. **Workflows System** (Medium Priority)
   - Database models
   - CRUD routes
   - Visual editor API (save/load DAG)
   - Execution engine (DAG traversal)
   - Trigger service (event listeners)

3. **Settings Enhancements** (Low Priority)
   - API key management routes
   - Team management routes
   - Webhook configuration routes
   - App branding/settings routes

Each missing feature will have:
- Priority level
- Estimated effort
- Dependencies
- Acceptance criteria
- API specifications (routes, request/response schemas)
