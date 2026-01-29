---
title: SaaS-Worthy MVP Roadmap for ReplyHQ
type: feat
date: 2026-01-24
status: draft
---

# SaaS-Worthy MVP Roadmap for ReplyHQ

## Executive Summary

ReplyHQ aims to be an affordable, mobile-first Intercom alternative for small-to-medium apps. This plan maps the path from current state (production-ready chat infrastructure) to a market-ready SaaS MVP with push notifications, in-app messaging, user segmentation, surveys, and analytics.

**Current State**: Production-grade realtime chat (96 tests passing, Socket.IO, KMP SDK)
**Target State**: Full-featured customer messaging platform competitive with Intercom for SMB segment
**Timeline**: 8-10 weeks to MVP with existing foundation
**Market Position**: $29-299/month, mobile-first, simpler than Intercom

---

## Table of Contents

1. [Vision & Market Position](#vision--market-position)
2. [Current State Analysis](#current-state-analysis)
3. [Gap Analysis: MVP Requirements](#gap-analysis-mvp-requirements)
4. [SDK Capability Roadmap](#sdk-capability-roadmap)
5. [Backend Capability Roadmap](#backend-capability-roadmap)
6. [Implementation Phases](#implementation-phases)
7. [Technical Architecture](#technical-architecture)
8. [Success Metrics](#success-metrics)
9. [Risk Mitigation](#risk-mitigation)

---

## Vision & Market Position

### Product Vision

**ReplyHQ**: Mobile-first customer messaging platform that gives small-to-medium apps the communication superpowers of enterprise tools at startup prices.

**Core Value Propositions**:
- **Affordable**: $29/mo starter vs Intercom's $29/seat + add-ons
- **Mobile-Optimized**: Native SDK (< 2MB), offline support, smart push
- **Simple**: Self-service onboarding in < 15 minutes
- **Scalable**: Built on production Socket.IO infrastructure (tested to 1000+ concurrent)

### Target Market

**Primary**: Mobile app developers (iOS/Android) with 1K-50K users
**Budget**: $29-$299/month
**Needs**: Customer communication without full CRM complexity

**Use Cases**:
- Support chat in mobile apps
- Onboarding product tours
- Feature announcements via push/in-app
- User feedback surveys
- Transactional messaging

### Competitive Landscape

| Platform | Starting Price | Mobile Focus | Key Advantage |
|----------|---------------|--------------|---------------|
| **Intercom** | $29/seat | Medium | Feature-rich, established |
| **Crisp** | $25/mo | Low | Affordable |
| **Tawk.to** | Free | Low | Free tier |
| **ReplyHQ** | $29/mo | **High** | Mobile SDK, simple pricing |

**Differentiation**:
- **Better mobile SDK**: KMP (Kotlin Multiplatform) vs web embeds
- **Simpler pricing**: Flat rate vs per-seat with add-ons
- **Mobile-first features**: Smart push, offline queue, optimized payload size

---

## Current State Analysis

### What's Built (Strong Foundation ✅)

#### Backend Infrastructure
```
✅ Socket.IO Server (768 lines, production-tested)
   - Client namespace (/client): Device connections, auto-subscribe
   - Admin namespace (/admin): Dashboard, multi-conversation visibility
   - 96 passing tests (protocol, E2E, multi-connection, broadcasts)
   - < 100ms message latency (p95)
   - Graceful shutdown with staggered reconnect

✅ REST API (/v1/)
   - POST /conversations - Create/get conversation
   - POST /conversations/:id/messages - Send message (rate-limited)
   - GET /conversations/:id/messages - Fetch history with pagination
   - POST /conversations/:id/messages/read - Mark messages read
   - GET /conversations/:id/sync - Cursor-based sync (clock-skew immune)

✅ Multi-Tenant Architecture
   - App model with unique API keys
   - Conversations scoped to [appId, deviceId, userId]
   - Middleware: appValidator, headers, rateLimit

✅ Data Persistence (PostgreSQL + Prisma)
   - App, Conversation, Message, Device models
   - Sequence numbers for cursor-based sync
   - Unique constraint on local_id (idempotency)

✅ Realtime Features
   - Typing indicators (client ↔ admin)
   - Presence tracking (multi-connection support)
   - Message broadcasting (room-based)
   - Connection state management

✅ Admin Dashboard API
   - GET /admin/api/users - List conversations with presence
   - GET /admin/api/conversations/:id/messages - View messages
   - POST /admin/api/conversations/:id/messages - Send agent reply
```

#### SDK Capabilities (Kotlin Multiplatform)
```
✅ Socket.IO Client (475 lines, custom implementation)
   - Full Engine.IO v4 + Socket.IO protocol
   - WebSocket transport via Ktor
   - Namespace support (/client)
   - Acknowledgements (request-response pattern)
   - Auto ping/pong keepalive (25s interval)

✅ Connection Management (267 lines)
   - Auto-reconnect with exponential backoff (1s → 30s max)
   - Network connectivity monitoring (platform-specific)
   - Pause/resume for app lifecycle
   - Multi-tab/window support
   - State machine: DISCONNECTED → CONNECTING → CONNECTED ↔ RECONNECTING

✅ Message Queue & Sync (299 lines)
   - Persistent message queue (SQLDelight backend)
   - Status transitions: QUEUED → SENDING → SENT/FAILED
   - Automatic retry (max 3 retries, exponential backoff)
   - Cursor-based sync (uses last_message_id, immune to clock drift)
   - Optimistic UI updates
   - Conflict resolution (server message wins on duplicate local_id)

✅ Data Persistence (SQLDelight)
   - ConversationEntity: id, visitor_id, status, metadata
   - MessageEntity: local_id (PK), id, conversation_id, sender_type, status, retry_count
   - Indexed on: conversation_id, status

✅ UI Components (Jetpack Compose)
   - ChatScreen (188 lines) - Full chat interface
   - MessageList - Scrollable with retry button
   - MessageBubble - User/agent styling
   - InputBar - Message input + send button
   - TypingIndicator - Animated agent typing
   - ConnectionStatus - Banner for connection state

✅ Platform Support
   - Android: Kotlin implementation
   - iOS: Swift/Objective-C bridge
   - Platform-specific: Database drivers, network monitoring, preferences
```

#### Proven Architectural Patterns
```
✅ Message Idempotency
   - Client generates local_id (UUID)
   - Server upsert on conflict
   - Deduplication on receive (via local_id)

✅ Multi-Connection Presence (FIXED IN PRODUCTION)
   - Redis pattern: presence:device:{appId}:{deviceId} = SET(connectionIds)
   - Device offline only when LAST connection closes
   - TTL-based cleanup (120s)

✅ Graceful Shutdown
   - Server broadcasts 'server:shutdown' event
   - Clients delay reconnect (5s) to avoid thundering herd

✅ Cursor-Based Sync
   - Uses message.sequence for pagination
   - Immune to device clock skew
   - Efficient (fetch only new messages)
```

### What's Missing for MVP ⚠️

#### Critical Gaps (Launch Blockers)
```
❌ In-App Message Composer
   - No modal/banner/card creation UI
   - No message template system
   - No targeting rules engine
   - No delivery scheduling

❌ Push Notification System
   - No FCM integration (Android)
   - No APNs integration (iOS)
   - No device token management
   - No offline delivery logic

❌ User Segmentation
   - No user attribute storage
   - No behavioral tracking
   - No segment creation UI
   - No targeting query engine

❌ Admin Authentication
   - Uses same API key as client (security risk)
   - No separate admin tokens
   - No role-based access control (RBAC)
   - No team member management

❌ Self-Service Onboarding
   - No signup/billing flow
   - No SDK setup wizard
   - No interactive testing
   - No template library

❌ Analytics Dashboard
   - No metrics tracking
   - No reporting UI
   - No export functionality
   - No real-time stats
```

#### Important Gaps (Early Days, Within 3 Months)
```
⚠️ Survey/Feedback Tools
   - No NPS/CSAT surveys
   - No custom form builder
   - No response collection

⚠️ Product Tours
   - No step-by-step onboarding flow
   - No tooltip system
   - No progress tracking

⚠️ Cross-Platform SDKs
   - No React Native support
   - No Flutter bindings
   - Web SDK incomplete

⚠️ Team Collaboration
   - No conversation assignment
   - No internal notes
   - No team performance metrics
   - No round-robin routing
```

---

## Gap Analysis: MVP Requirements

### Tier 1: Launch Blockers (Must Have Before Beta)

Based on competitive research and SaaS best practices, these features are **non-negotiable** for a credible Intercom alternative:

#### 1. In-App Messaging System
**Why Critical**: Core value proposition. Users expect modals/banners like Intercom.

**Components**:
- **Message Composer** (Admin Dashboard)
  - Create modal/banner/card messages
  - Rich text editor with media upload
  - Preview on device simulator
  - Target by user segment
  - Schedule delivery

- **Template Library**
  - Pre-built templates (welcome, feature announcement, feedback request)
  - Customizable with variables (user name, plan, etc.)
  - Drag-and-drop editor

- **Delivery Engine** (Backend)
  - Evaluate targeting rules
  - Trigger on user events
  - Rate limiting (max 1 modal/session)
  - Track delivery status

- **SDK Rendering** (Client)
  - Modal component (center overlay with backdrop)
  - Banner component (top/bottom bar)
  - Card component (inline content)
  - Auto-dismiss logic
  - Deep link handling

**Files to Create**:
```
backend/src/services/messageComposerService.ts
backend/src/services/targetingService.ts
backend/src/routes/composer.ts
backend/src/schemas/inAppMessage.ts
backend/prisma/migrations/XXX_add_in_app_messages.sql

sdk/src/commonMain/kotlin/.../ui/InAppMessageModal.kt
sdk/src/commonMain/kotlin/.../ui/InAppMessageBanner.kt
sdk/src/commonMain/kotlin/.../ui/InAppMessageCard.kt
sdk/src/commonMain/kotlin/.../InAppMessageManager.kt
```

#### 2. Push Notification System
**Why Critical**: Expected feature. Essential for offline engagement.

**Components**:
- **FCM Integration** (Backend)
  - Firebase Admin SDK setup
  - Send to topic vs device token
  - Rich notification payloads
  - Silent push for data sync
  - Delivery receipts

- **APNs Integration** (Backend)
  - Apple certificates/tokens
  - Production/sandbox environments
  - Priority levels (iOS 18+)
  - Rich actions (reply, dismiss)

- **Token Management** (Backend)
  - Register device tokens
  - Platform tracking (android/ios)
  - Token refresh logic
  - Unregister on logout

- **Smart Delivery** (Backend)
  - Only send if user offline (check presence)
  - Batch notifications (avoid spam)
  - Respect quiet hours
  - Retry failed sends

- **SDK Integration** (Client)
  - Request permission flow
  - Token registration on grant
  - Handle incoming push
  - Deep link to conversation
  - Foreground notification UI

**Files to Create**:
```
backend/src/services/fcmService.ts
backend/src/services/apnsService.ts
backend/src/services/pushDeliveryService.ts
backend/src/routes/pushNotifications.ts

sdk/src/androidMain/kotlin/.../push/FCMService.kt
sdk/src/iosMain/kotlin/.../push/APNsHandler.kt
sdk/src/commonMain/kotlin/.../push/PushPermissionManager.kt
```

**Third-Party Dependencies**:
- `firebase-admin` (Node.js)
- `node-apn` or FCM HTTP v1 (unified)
- Firebase Cloud Messaging SDK (Android)
- UserNotifications framework (iOS)

#### 3. User Segmentation
**Why Critical**: Can't target messages without segments. Core differentiator.

**Components**:
- **User Attribute Storage** (Backend)
  - Extend Device model: `attributes: Json` field
  - Update via SDK: `identify(userId, { plan: "pro", signup_date: "..." })`
  - Store immutable (userId) and mutable (plan, last_seen) attributes

- **Event Tracking** (Backend)
  - Track user actions: `track("feature_used", { feature: "export" })`
  - Store in Events table (user_id, event_name, properties, timestamp)
  - Indexed for fast queries

- **Segment Builder** (Admin Dashboard)
  - Visual query builder (no-code)
  - Filters: attribute equals/contains, event occurred, last_seen > X days
  - Boolean logic: AND/OR conditions
  - Live preview (count matching users)

- **Targeting Engine** (Backend)
  - Evaluate segment queries
  - Cache segment results (Redis)
  - Re-evaluate on user attribute change
  - Return matching user IDs

**Files to Create**:
```
backend/src/services/segmentService.ts
backend/src/services/eventTrackingService.ts
backend/src/routes/segments.ts
backend/src/schemas/segment.ts
backend/prisma/migrations/XXX_add_user_events.sql

sdk/src/commonMain/kotlin/.../UserAttributeManager.kt
sdk/src/commonMain/kotlin/.../EventTracker.kt
```

**Schema Additions**:
```sql
-- Add to Device model
ALTER TABLE Device ADD COLUMN attributes JSONB DEFAULT '{}';
CREATE INDEX idx_device_attributes ON Device USING gin(attributes);

-- New Events table
CREATE TABLE Event (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  user_id TEXT,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX(app_id, device_id, event_name),
  INDEX(created_at)
);

-- New Segments table
CREATE TABLE Segment (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  query JSONB NOT NULL, -- Segment filter rules
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### 4. Admin Authentication & Team Management
**Why Critical**: Security risk. Can't launch without proper auth. Multi-user support expected.

**Components**:
- **Admin User Model** (Backend)
  - Email/password authentication
  - Bcrypt password hashing
  - JWT token generation
  - Refresh tokens

- **Role-Based Access Control (RBAC)**
  - Roles: Owner, Admin, Manager, Agent, Viewer
  - Permissions matrix (see section below)
  - Middleware: `requireRole(['admin', 'manager'])`

- **Team Management UI** (Admin Dashboard)
  - Invite team members via email
  - Assign roles
  - View team activity
  - Remove users

- **Session Management**
  - JWT stored in httpOnly cookie
  - Refresh token rotation
  - Logout (invalidate token)
  - Multi-device sessions

**Files to Create**:
```
backend/src/models/adminUser.ts
backend/src/services/authService.ts
backend/src/middleware/requireAuth.ts
backend/src/middleware/requireRole.ts
backend/src/routes/auth.ts
backend/src/routes/team.ts
backend/prisma/migrations/XXX_add_admin_users.sql
```

**Schema Additions**:
```sql
CREATE TABLE AdminUser (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- 'owner' | 'admin' | 'manager' | 'agent' | 'viewer'
  app_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (app_id) REFERENCES App(id) ON DELETE CASCADE,
  INDEX(app_id, email)
);

CREATE TABLE RefreshToken (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,

  FOREIGN KEY (user_id) REFERENCES AdminUser(id) ON DELETE CASCADE,
  INDEX(token)
);
```

**RBAC Permissions Matrix**:
| Feature | Owner | Admin | Manager | Agent | Viewer |
|---------|-------|-------|---------|-------|--------|
| Billing | ✓ | - | - | - | - |
| Add/Remove Users | ✓ | ✓ | - | - | - |
| App Settings | ✓ | ✓ | ✓ | - | - |
| Create Segments | ✓ | ✓ | ✓ | - | - |
| Send Messages | ✓ | ✓ | ✓ | ✓ | - |
| Assign Conversations | ✓ | ✓ | ✓ | - | - |
| Reply to Messages | ✓ | ✓ | ✓ | ✓ | - |
| View Analytics | ✓ | ✓ | ✓ | ✓ | ✓ |

#### 5. Self-Service Onboarding
**Why Critical**: SaaS standard. Can't require manual setup for every customer.

**Components**:
- **Signup Flow** (Public Website)
  - Email + password or Google SSO
  - Company name and size
  - Use case selection (support, marketing, onboarding)
  - Trial period (14 days free)

- **Billing Integration** (Stripe)
  - Subscription plans (Starter $29, Growth $99, Pro $299)
  - Payment method collection
  - Automatic billing
  - Upgrade/downgrade flow

- **SDK Setup Wizard** (Admin Dashboard)
  - Step 1: Choose platform (iOS/Android/React Native/Flutter)
  - Step 2: Copy API key
  - Step 3: Code snippet with syntax highlighting
  - Step 4: Interactive testing (send test message)
  - Step 5: Verify SDK connected

- **Onboarding Checklist** (Admin Dashboard)
  - ✓ Install SDK
  - ✓ Send first message
  - ✓ Create user segment
  - ✓ Invite team member
  - ✓ Customize branding

- **Template Library** (Pre-Built)
  - Welcome message template
  - Feature announcement template
  - Feedback request template
  - One-click deploy with customization

**Files to Create**:
```
backend/src/routes/signup.ts
backend/src/routes/billing.ts
backend/src/services/stripeService.ts
backend/src/services/onboardingService.ts

frontend/admin/pages/Signup.tsx
frontend/admin/pages/SDKSetup.tsx
frontend/admin/pages/OnboardingChecklist.tsx
frontend/admin/components/CodeSnippet.tsx
```

**Third-Party Dependencies**:
- `stripe` (Node.js SDK)
- React/Next.js for admin frontend
- Prism.js for syntax highlighting

#### 6. Analytics Dashboard
**Why Critical**: Expected feature. Teams need visibility into performance.

**Components**:
- **Metrics Tracking** (Backend)
  - Conversation volume (hourly/daily/weekly)
  - Response times (first reply, resolution time)
  - Team performance (messages per agent)
  - Message delivery rates (push, in-app)
  - User engagement (message open rate, click rate)

- **Data Collection**
  - Track events: message_sent, message_delivered, message_read, push_sent, push_opened
  - Store in TimescaleDB or append-only events table
  - Aggregate on query (or pre-aggregate hourly)

- **Dashboard UI** (Admin)
  - Overview page: Key metrics (response time, conversation volume, CSAT)
  - Charts: Line charts (trends), bar charts (comparisons)
  - Filters: Date range, team member, conversation status
  - Export to CSV/JSON

- **Real-Time Stats** (WebSocket)
  - Active conversations count
  - Online agents count
  - Unread message count
  - Update via Socket.IO admin namespace

**Files to Create**:
```
backend/src/services/analyticsService.ts
backend/src/services/metricsAggregator.ts
backend/src/routes/analytics.ts
backend/prisma/migrations/XXX_add_analytics_events.sql

frontend/admin/pages/Analytics.tsx
frontend/admin/components/MetricCard.tsx
frontend/admin/components/TrendChart.tsx
```

**Schema Additions**:
```sql
CREATE TABLE AnalyticsEvent (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  event_name TEXT NOT NULL, -- 'message_sent', 'push_delivered', etc.
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX(app_id, event_name, created_at)
);

-- For faster aggregations, use materialized view
CREATE MATERIALIZED VIEW daily_conversation_stats AS
SELECT
  app_id,
  DATE(created_at) as date,
  COUNT(*) as conversation_count,
  AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))) as avg_first_response_seconds
FROM Conversation
GROUP BY app_id, DATE(created_at);
```

---

### Tier 2: Early Days Features (Within 3 Months)

These features strengthen the product but aren't required for initial launch:

#### 1. Survey/Feedback Tools
- NPS/CSAT survey builder
- Custom form builder (multiple question types)
- In-app survey rendering (SDK)
- Response collection and analysis
- Survey templates

**Files**: `surveyService.ts`, `SurveyBuilder.tsx`, `InAppSurvey.kt`

#### 2. Product Tours
- Step-by-step onboarding flow builder
- Tooltip system with targeting
- Progress tracking (step 3 of 5)
- Skip/restart controls
- SDK rendering

**Files**: `productTourService.ts`, `TourBuilder.tsx`, `ProductTour.kt`

#### 3. React Native SDK
- JavaScript bridge to KMP core
- React hooks API
- TypeScript definitions
- Example app

**Files**: `sdk/react-native/`, `useReplyHQ.ts`, `ReplyHQProvider.tsx`

#### 4. Flutter SDK
- Dart FFI bindings to KMP core
- Flutter plugin
- Widget library
- Example app

**Files**: `sdk/flutter/`, `reply_hq.dart`, `ChatWidget.dart`

#### 5. Advanced Segmentation
- Behavioral filters (visited page X times)
- Time-based filters (signed up > 30 days ago)
- Composite segments (segment A AND segment B)
- Dynamic segments (auto-update)

**Files**: `advancedSegmentService.ts`, `BehavioralFilters.tsx`

#### 6. Team Collaboration
- Conversation assignment (manual/automatic)
- Round-robin routing
- Internal notes (not visible to user)
- @mentions for collaboration
- Team performance metrics

**Files**: `assignmentService.ts`, `InternalNotes.tsx`, `TeamMetrics.tsx`

---

## SDK Capability Roadmap

### Current SDK State (KMP - iOS + Android)

**Strengths**:
```
✓ Custom Socket.IO client (475 lines, production-tested)
✓ Connection management with auto-reconnect
✓ Message queue with offline support
✓ SQLDelight persistence (conversations + messages)
✓ Typing indicators
✓ Read receipts
✓ Jetpack Compose UI (ChatScreen, MessageBubble, InputBar)
✓ Session management
✓ Cursor-based sync
```

**Gaps**:
```
❌ In-app message rendering (modals, banners, cards)
❌ Push notification integration (FCM/APNs)
❌ User attribute management (identify, track events)
❌ Survey rendering
❌ Product tour system
❌ React Native bindings
❌ Flutter bindings
❌ Web SDK (JavaScript)
```

### Phase 1: Launch Blockers (Weeks 1-4)

#### Week 1-2: In-App Messaging
**Goal**: Render modals, banners, cards in SDK

**Tasks**:
1. **InAppMessageModal.kt** (Compose UI)
   - Full-screen overlay with backdrop
   - Title, body, image support
   - Primary/secondary CTA buttons
   - Dismiss on backdrop tap or button click
   - Track impressions and clicks

2. **InAppMessageBanner.kt** (Compose UI)
   - Top or bottom bar
   - Auto-dismiss after 5 seconds (configurable)
   - Swipe to dismiss
   - Deep link on tap

3. **InAppMessageCard.kt** (Compose UI)
   - Inline card component
   - Fits within scrollable content
   - Optional image, title, body, CTA

4. **InAppMessageManager.kt** (Core Logic)
   - Fetch pending messages from backend
   - Evaluate display rules (max 1 modal/session)
   - Queue messages for display
   - Track delivery status
   - Send analytics events

**API Integration**:
```kotlin
// New API endpoint
GET /v1/in-app-messages?device_id={id}&last_fetched={timestamp}

// Response
{
  "messages": [
    {
      "id": "msg_123",
      "type": "modal",
      "title": "Welcome to Pro!",
      "body": "You've unlocked advanced features",
      "image_url": "https://...",
      "cta_label": "Explore Features",
      "cta_action": "app://features",
      "target_segments": ["pro_users"],
      "priority": 1
    }
  ]
}
```

**Testing**:
- Unit tests: Message queuing, display rules
- UI tests: Modal rendering, banner auto-dismiss
- Integration tests: Fetch messages, track events

**Deliverable**: SDK can render in-app messages from backend

#### Week 2-3: Push Notifications
**Goal**: Integrate FCM (Android) and APNs (iOS)

**Tasks**:

**Android (FCM)**:
1. Add Firebase dependencies to `build.gradle.kts`
2. Create `ReplyHQFirebaseMessagingService.kt`
   - Override `onMessageReceived`
   - Parse notification payload
   - Show notification with deep link
   - Track notification opened
3. Create `PushPermissionManager.kt`
   - Request notification permission (Android 13+)
   - Handle permission result
4. Register device token with backend
   - Call `POST /v1/push-token` on token refresh

**iOS (APNs)**:
1. Configure APNs certificates in Xcode
2. Create `PushNotifications.ios.kt`
   - Register for remote notifications
   - Handle `didReceiveRemoteNotification`
   - Parse notification payload
   - Show notification or update badge
3. Request notification permission
   - `UNUserNotificationCenter.requestAuthorization`
4. Register device token with backend

**Shared Logic** (`PushNotificationHandler.kt`):
```kotlin
expect class PushNotificationHandler {
    fun requestPermission()
    fun registerToken(token: String)
    fun handleRemoteMessage(payload: Map<String, Any>)
}
```

**Backend Integration**:
```
POST /v1/push-token
{
  "device_id": "device_123",
  "token": "fcm_token_...",
  "platform": "android"
}

// Notification payload (from backend)
{
  "title": "New message from Support",
  "body": "Hi! How can we help?",
  "conversation_id": "conv_123",
  "deep_link": "app://conversations/conv_123"
}
```

**Testing**:
- Device tests: Send test push from Firebase Console
- Integration tests: Backend sends push on offline message
- E2E tests: User offline → message sent → push received → tap opens app

**Deliverable**: SDK receives and displays push notifications

#### Week 3-4: User Attributes & Event Tracking
**Goal**: Identify users and track events for segmentation

**Tasks**:
1. **UserAttributeManager.kt**
   - `identify(userId: String, attributes: Map<String, Any>)`
   - Store attributes locally (preferences)
   - Sync to backend on connection
   - Update on attribute change

2. **EventTracker.kt**
   - `track(eventName: String, properties: Map<String, Any>)`
   - Queue events locally
   - Batch send to backend (every 30s or 10 events)
   - Retry on failure

**API Integration**:
```kotlin
// Identify user
POST /v1/identify
{
  "device_id": "device_123",
  "user_id": "user_456",
  "attributes": {
    "email": "user@example.com",
    "plan": "pro",
    "signup_date": "2026-01-15"
  }
}

// Track event
POST /v1/events
{
  "device_id": "device_123",
  "events": [
    {
      "name": "feature_used",
      "properties": { "feature": "export" },
      "timestamp": "2026-01-24T10:30:00Z"
    }
  ]
}
```

**Usage in App**:
```kotlin
// In app code
ReplyHQ.identify("user_456", mapOf(
    "email" to "user@example.com",
    "plan" to "pro"
))

ReplyHQ.track("feature_used", mapOf(
    "feature" to "export"
))
```

**Testing**:
- Unit tests: Event batching, attribute caching
- Integration tests: Sync to backend, verify stored
- E2E tests: Create segment, verify user matches

**Deliverable**: SDK can identify users and track events for targeting

---

### Phase 2: Cross-Platform SDKs (Weeks 5-8)

#### Week 5-6: React Native SDK
**Goal**: JavaScript bindings to KMP core

**Architecture**:
```
React Native App
      ↓
  JS Bridge (Turbo Modules)
      ↓
  KMP Core (shared/)
      ↓
  Platform (iOS/Android)
```

**Tasks**:
1. Create `sdk/react-native/` module
2. Turbo Module for native bridge
   - `NativeReplyHQModule.kt` (Android)
   - `RCTReplyHQModule.m` (iOS)
3. TypeScript wrapper
   - `useReplyHQ()` hook
   - `ReplyHQProvider` context
   - Type definitions
4. Example app (Expo)

**API**:
```typescript
import { useReplyHQ } from '@replyhq/react-native';

function App() {
  const { sendMessage, messages, isConnected } = useReplyHQ({
    apiKey: 'your_api_key',
    userId: 'user_123',
  });

  return (
    <ReplyHQProvider>
      <ChatScreen />
    </ReplyHQProvider>
  );
}
```

**Deliverable**: React Native apps can use ReplyHQ SDK

#### Week 6-7: Flutter SDK
**Goal**: Dart bindings to KMP core

**Architecture**:
```
Flutter App
      ↓
  Dart FFI / Platform Channels
      ↓
  KMP Core (shared/)
      ↓
  Platform (iOS/Android)
```

**Tasks**:
1. Create `sdk/flutter/` plugin
2. Platform channel implementation
   - `ReplyHQPlugin.kt` (Android)
   - `ReplyHQPlugin.swift` (iOS)
3. Dart wrapper
   - `ReplyHQ` class
   - Stream-based API
   - Type definitions
4. Example app

**API**:
```dart
import 'package:replyhq/replyhq.dart';

void main() async {
  await ReplyHQ.initialize(
    apiKey: 'your_api_key',
    userId: 'user_123',
  );

  ReplyHQ.messageStream.listen((message) {
    print('New message: ${message.content}');
  });

  await ReplyHQ.sendMessage('Hello from Flutter!');
}
```

**Deliverable**: Flutter apps can use ReplyHQ SDK

#### Week 7-8: Web SDK (JavaScript)
**Goal**: Standalone JavaScript SDK for web apps

**Tasks**:
1. Create `sdk/web/` package
2. WebSocket client (Socket.IO JS client)
3. REST API client (fetch)
4. Event emitter pattern
5. TypeScript definitions
6. Preact/React components (optional)

**API**:
```javascript
import ReplyHQ from '@replyhq/web';

const client = ReplyHQ.init({
  apiKey: 'your_api_key',
  userId: 'user_123',
});

client.on('message', (message) => {
  console.log('New message:', message);
});

client.sendMessage('Hello from Web!');
```

**Deliverable**: Web apps can use ReplyHQ SDK

---

### SDK Feature Comparison

| Feature | iOS | Android | React Native | Flutter | Web |
|---------|-----|---------|--------------|---------|-----|
| In-app messaging | ✓ | ✓ | ✓ | ✓ | ✓ |
| Push notifications | ✓ | ✓ | ✓ | ✓ | ✗ |
| Typing indicators | ✓ | ✓ | ✓ | ✓ | ✓ |
| Read receipts | ✓ | ✓ | ✓ | ✓ | ✓ |
| User attributes | ✓ | ✓ | ✓ | ✓ | ✓ |
| Event tracking | ✓ | ✓ | ✓ | ✓ | ✓ |
| Offline support | ✓ | ✓ | ✓ | ✓ | ✗ |
| UI components | ✓ | ✓ | ✓ | ✓ | ⚠️ |

✓ = Full support | ⚠️ = Partial | ✗ = Not applicable

---

## Backend Capability Roadmap

### Current Backend State

**Strengths**:
```
✓ Socket.IO server (768 lines, production-tested)
✓ REST API (/v1/conversations, /v1/messages)
✓ Multi-tenant architecture (App model)
✓ PostgreSQL + Prisma ORM
✓ Redis (presence, rate limiting)
✓ Message idempotency (local_id)
✓ Cursor-based sync
✓ Typing indicators
✓ Admin API (/admin/api/users, /admin/api/conversations)
✓ 96 passing tests
```

**Gaps**:
```
❌ In-app message composer API
❌ Push notification service (FCM/APNs)
❌ User segmentation engine
❌ Admin authentication & RBAC
❌ Analytics & reporting
❌ Survey builder & responses
❌ Billing integration (Stripe)
❌ Onboarding API
```

### Phase 1: Launch Blockers (Weeks 1-4)

#### Week 1-2: In-App Message Composer

**Database Schema**:
```sql
CREATE TABLE InAppMessage (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  type TEXT NOT NULL, -- 'modal' | 'banner' | 'card'
  title TEXT,
  body TEXT NOT NULL,
  image_url TEXT,
  cta_label TEXT,
  cta_action TEXT, -- Deep link or URL
  target_segment_ids TEXT[], -- Array of segment IDs
  priority INTEGER DEFAULT 0, -- Higher = shown first
  max_displays INTEGER DEFAULT 1, -- Max times per user
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  status TEXT DEFAULT 'draft', -- 'draft' | 'active' | 'paused' | 'completed'
  created_by UUID, -- AdminUser ID
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (app_id) REFERENCES App(id) ON DELETE CASCADE,
  INDEX(app_id, status)
);

CREATE TABLE InAppMessageDelivery (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  delivered_at TIMESTAMP DEFAULT NOW(),
  displayed_at TIMESTAMP,
  clicked_at TIMESTAMP,
  dismissed_at TIMESTAMP,

  FOREIGN KEY (message_id) REFERENCES InAppMessage(id) ON DELETE CASCADE,
  INDEX(message_id),
  INDEX(device_id)
);
```

**API Endpoints**:
```typescript
// Admin: Create in-app message
POST /admin/api/in-app-messages
{
  "type": "modal",
  "title": "Welcome to Pro!",
  "body": "You've unlocked advanced features",
  "image_url": "https://...",
  "cta_label": "Explore Features",
  "cta_action": "app://features",
  "target_segment_ids": ["seg_123"],
  "priority": 1,
  "start_date": "2026-01-25T00:00:00Z"
}

// Admin: List in-app messages
GET /admin/api/in-app-messages?app_id={id}&status=active

// Client: Fetch pending messages
GET /v1/in-app-messages?device_id={id}&last_fetched={timestamp}

// Client: Track delivery event
POST /v1/in-app-messages/:id/events
{
  "event": "displayed", // 'displayed' | 'clicked' | 'dismissed'
  "device_id": "device_123",
  "timestamp": "2026-01-24T10:30:00Z"
}
```

**Services**:
```typescript
// messageComposerService.ts
class MessageComposerService {
  async createMessage(appId: string, data: CreateMessageInput): Promise<InAppMessage>
  async updateMessage(id: string, data: UpdateMessageInput): Promise<InAppMessage>
  async deleteMessage(id: string): Promise<void>
  async listMessages(appId: string, filters: MessageFilters): Promise<InAppMessage[]>

  // Fetch messages for device (client API)
  async fetchPendingMessages(deviceId: string, lastFetched: Date): Promise<InAppMessage[]> {
    // 1. Get device attributes and segment memberships
    // 2. Query active messages targeting device's segments
    // 3. Filter by start/end date
    // 4. Exclude already delivered (check InAppMessageDelivery)
    // 5. Sort by priority
    // 6. Return top N messages
  }

  async trackEvent(messageId: string, deviceId: string, event: 'displayed' | 'clicked' | 'dismissed'): Promise<void>
}
```

**Deliverable**: Admin can create in-app messages, SDK can fetch and render them

#### Week 2-3: Push Notification Service

**Database Schema**:
```sql
-- Add to Device model
ALTER TABLE Device ADD COLUMN push_token TEXT;
ALTER TABLE Device ADD COLUMN push_platform TEXT; -- 'android' | 'ios'
ALTER TABLE Device ADD COLUMN push_enabled BOOLEAN DEFAULT true;

CREATE INDEX idx_device_push_token ON Device(push_token);

CREATE TABLE PushNotification (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  message_id TEXT, -- Related conversation message
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}', -- Custom payload
  status TEXT DEFAULT 'pending', -- 'pending' | 'sent' | 'delivered' | 'failed'
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  error TEXT,

  INDEX(app_id, device_id),
  INDEX(status)
);
```

**Third-Party Setup**:
1. Firebase Console: Create project, download `service-account.json`
2. APNs: Generate `.p8` key, note Key ID and Team ID
3. Store credentials in environment variables

**Services**:
```typescript
// fcmService.ts
import admin from 'firebase-admin';

class FCMService {
  private app: admin.app.App;

  constructor() {
    this.app = admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  }

  async sendNotification(token: string, notification: NotificationPayload): Promise<string> {
    const message = {
      token,
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: notification.data,
      android: {
        priority: 'high',
        notification: {
          channelId: 'replyhq_messages',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title: notification.title,
              body: notification.body,
            },
            badge: notification.badge,
            sound: 'default',
          },
        },
      },
    };

    const response = await this.app.messaging().send(message);
    return response; // Message ID
  }

  async sendToMultiple(tokens: string[], notification: NotificationPayload): Promise<BatchResponse> {
    // Use sendMulticast for batching
  }
}

// pushDeliveryService.ts
class PushDeliveryService {
  async sendMessageNotification(message: Message, conversation: Conversation): Promise<void> {
    // 1. Check if user is online (presence service)
    const isOnline = await presenceService.isDeviceOnline(conversation.appId, conversation.deviceId);
    if (isOnline) return; // Don't send push if online

    // 2. Get device push token
    const device = await prisma.device.findUnique({
      where: { appId_deviceId: { appId: conversation.appId, deviceId: conversation.deviceId } },
    });
    if (!device?.pushToken || !device.pushEnabled) return;

    // 3. Send notification
    const notification = {
      title: 'New message',
      body: message.body.substring(0, 100),
      data: {
        conversation_id: conversation.id,
        message_id: message.id,
      },
      badge: await this.getUnreadCount(conversation.deviceId),
    };

    await fcmService.sendNotification(device.pushToken, notification);

    // 4. Track in database
    await prisma.pushNotification.create({
      data: {
        appId: conversation.appId,
        deviceId: conversation.deviceId,
        messageId: message.id,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }

  async trackDelivery(notificationId: string): Promise<void>
  async trackOpened(notificationId: string): Promise<void>
  async getUnreadCount(deviceId: string): Promise<number>
}
```

**API Endpoints**:
```typescript
// Register push token
POST /v1/push-token
{
  "device_id": "device_123",
  "token": "fcm_token_...",
  "platform": "android"
}

// Update push preferences
PATCH /v1/push-preferences
{
  "device_id": "device_123",
  "enabled": false
}

// Track push event (delivery, opened)
POST /v1/push-notifications/:id/events
{
  "event": "delivered", // 'delivered' | 'opened'
  "timestamp": "2026-01-24T10:30:00Z"
}
```

**Integration with Message Service**:
```typescript
// In messageService.ts
async createMessage(conversationId: string, body: string, sender: string): Promise<Message> {
  const message = await prisma.message.create({ ... });

  // Broadcast via Socket.IO
  socketService.broadcastToConversation(conversationId, 'message:new', message);

  // Send push notification if user offline
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  await pushDeliveryService.sendMessageNotification(message, conversation);

  return message;
}
```

**Testing**:
- Unit tests: FCM service, delivery logic
- Integration tests: Send push on offline message
- Device tests: Receive push, tap opens app

**Deliverable**: Backend sends push notifications to offline users

#### Week 3-4: User Segmentation Engine

**Database Schema**:
```sql
-- Add to Device model
ALTER TABLE Device ADD COLUMN attributes JSONB DEFAULT '{}';
CREATE INDEX idx_device_attributes ON Device USING gin(attributes);

CREATE TABLE Event (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  user_id TEXT,
  event_name TEXT NOT NULL,
  properties JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX(app_id, device_id, event_name),
  INDEX(app_id, event_name, created_at)
);

CREATE TABLE Segment (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  query JSONB NOT NULL, -- Filter rules in query DSL
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  INDEX(app_id)
);

-- Cache segment memberships for performance
CREATE TABLE SegmentMembership (
  segment_id UUID NOT NULL,
  device_id TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  PRIMARY KEY (segment_id, device_id),
  FOREIGN KEY (segment_id) REFERENCES Segment(id) ON DELETE CASCADE,
  INDEX(device_id)
);
```

**Query DSL** (JSON format for segment filters):
```json
{
  "operator": "AND",
  "conditions": [
    {
      "type": "attribute",
      "field": "plan",
      "operator": "equals",
      "value": "pro"
    },
    {
      "type": "event",
      "event_name": "feature_used",
      "operator": "occurred",
      "within_days": 7
    },
    {
      "type": "attribute",
      "field": "signup_date",
      "operator": "before",
      "value": "2026-01-01"
    }
  ]
}
```

**Services**:
```typescript
// segmentService.ts
class SegmentService {
  async createSegment(appId: string, name: string, query: SegmentQuery): Promise<Segment>
  async updateSegment(id: string, updates: Partial<Segment>): Promise<Segment>
  async deleteSegment(id: string): Promise<void>
  async listSegments(appId: string): Promise<Segment[]>

  // Evaluate segment membership
  async evaluateSegment(segmentId: string, deviceId: string): Promise<boolean> {
    const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
    const device = await prisma.device.findUnique({ where: { deviceId } });

    return this.evaluateQuery(segment.query, device);
  }

  private evaluateQuery(query: SegmentQuery, device: Device): boolean {
    // Recursively evaluate conditions
    if (query.operator === 'AND') {
      return query.conditions.every(c => this.evaluateCondition(c, device));
    } else if (query.operator === 'OR') {
      return query.conditions.some(c => this.evaluateCondition(c, device));
    }
  }

  private evaluateCondition(condition: Condition, device: Device): boolean {
    if (condition.type === 'attribute') {
      const value = device.attributes[condition.field];
      switch (condition.operator) {
        case 'equals': return value === condition.value;
        case 'contains': return String(value).includes(condition.value);
        case 'greater_than': return Number(value) > Number(condition.value);
        // ... more operators
      }
    } else if (condition.type === 'event') {
      // Query Event table
      const event = await prisma.event.findFirst({
        where: {
          deviceId: device.deviceId,
          eventName: condition.event_name,
          createdAt: { gte: subDays(new Date(), condition.within_days) },
        },
      });
      return !!event;
    }
  }

  // Refresh segment memberships (run periodically or on attribute change)
  async refreshSegmentMemberships(segmentId: string): Promise<void> {
    const segment = await prisma.segment.findUnique({ where: { id: segmentId } });
    const devices = await prisma.device.findMany({ where: { appId: segment.appId } });

    for (const device of devices) {
      const matches = await this.evaluateSegment(segmentId, device.deviceId);

      if (matches) {
        await prisma.segmentMembership.upsert({
          where: { segmentId_deviceId: { segmentId, deviceId: device.deviceId } },
          create: { segmentId, deviceId: device.deviceId },
          update: {},
        });
      } else {
        await prisma.segmentMembership.delete({
          where: { segmentId_deviceId: { segmentId, deviceId: device.deviceId } },
        }).catch(() => {}); // Ignore if doesn't exist
      }
    }
  }

  // Get devices in segment (for targeting)
  async getDevicesInSegment(segmentId: string): Promise<string[]> {
    const memberships = await prisma.segmentMembership.findMany({
      where: { segmentId },
      select: { deviceId: true },
    });
    return memberships.map(m => m.deviceId);
  }
}

// eventTrackingService.ts
class EventTrackingService {
  async trackEvent(appId: string, deviceId: string, eventName: string, properties: Record<string, any>): Promise<void> {
    await prisma.event.create({
      data: {
        appId,
        deviceId,
        eventName,
        properties,
      },
    });

    // Optionally: Trigger segment membership refresh for affected segments
  }

  async trackBatch(appId: string, deviceId: string, events: Array<{ name: string, properties: Record<string, any>, timestamp: Date }>): Promise<void> {
    await prisma.event.createMany({
      data: events.map(e => ({
        appId,
        deviceId,
        eventName: e.name,
        properties: e.properties,
        createdAt: e.timestamp,
      })),
    });
  }
}
```

**API Endpoints**:
```typescript
// Admin: Create segment
POST /admin/api/segments
{
  "app_id": "app_123",
  "name": "Pro users active in last 7 days",
  "query": {
    "operator": "AND",
    "conditions": [...]
  }
}

// Admin: List segments
GET /admin/api/segments?app_id={id}

// Admin: Preview segment (count matching devices)
POST /admin/api/segments/preview
{
  "app_id": "app_123",
  "query": {...}
}
// Response: { "count": 42, "sample_devices": [...] }

// Client: Identify user
POST /v1/identify
{
  "device_id": "device_123",
  "user_id": "user_456",
  "attributes": {
    "email": "user@example.com",
    "plan": "pro"
  }
}

// Client: Track events (batch)
POST /v1/events
{
  "device_id": "device_123",
  "events": [
    { "name": "feature_used", "properties": {...}, "timestamp": "..." }
  ]
}
```

**Background Job** (refresh segment memberships):
```typescript
// Run every 10 minutes or on attribute change
async function refreshAllSegments() {
  const segments = await prisma.segment.findMany();
  for (const segment of segments) {
    await segmentService.refreshSegmentMemberships(segment.id);
  }
}
```

**Deliverable**: Backend can segment users and target messages based on attributes/behavior

#### Week 3-4: Admin Authentication & RBAC

**Database Schema**:
```sql
CREATE TABLE AdminUser (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL, -- 'owner' | 'admin' | 'manager' | 'agent' | 'viewer'
  app_id TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP,

  FOREIGN KEY (app_id) REFERENCES App(id) ON DELETE CASCADE,
  INDEX(app_id, email),
  INDEX(email)
);

CREATE TABLE RefreshToken (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (user_id) REFERENCES AdminUser(id) ON DELETE CASCADE,
  INDEX(token),
  INDEX(user_id)
);

CREATE TABLE TeamInvite (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  invited_by UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),

  FOREIGN KEY (app_id) REFERENCES App(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by) REFERENCES AdminUser(id),
  INDEX(token)
);
```

**Services**:
```typescript
// authService.ts
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

class AuthService {
  async signup(email: string, password: string, appId: string): Promise<{ user: AdminUser, accessToken: string, refreshToken: string }> {
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user (first user is owner)
    const existingUsers = await prisma.adminUser.count({ where: { appId } });
    const role = existingUsers === 0 ? 'owner' : 'agent';

    const user = await prisma.adminUser.create({
      data: { email, passwordHash, appId, role },
    });

    // Generate tokens
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);

    return { user, accessToken, refreshToken };
  }

  async login(email: string, password: string): Promise<{ user: AdminUser, accessToken: string, refreshToken: string }> {
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user) throw new Error('Invalid credentials');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new Error('Invalid credentials');

    await prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user.id);

    return { user, accessToken, refreshToken };
  }

  private generateAccessToken(user: AdminUser): string {
    return jwt.sign(
      { userId: user.id, appId: user.appId, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
  }

  private async generateRefreshToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });
    return token;
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const tokenRecord = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
      throw new Error('Invalid refresh token');
    }

    const user = await prisma.adminUser.findUnique({ where: { id: tokenRecord.userId } });
    return this.generateAccessToken(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.delete({ where: { token: refreshToken } }).catch(() => {});
  }
}

// teamService.ts
class TeamService {
  async inviteTeamMember(appId: string, email: string, role: string, invitedBy: string): Promise<TeamInvite> {
    // Generate invite token
    const token = crypto.randomBytes(32).toString('hex');

    const invite = await prisma.teamInvite.create({
      data: {
        appId,
        email,
        role,
        invitedBy,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Send email
    await emailService.sendInvite(email, token);

    return invite;
  }

  async acceptInvite(token: string, password: string): Promise<AdminUser> {
    const invite = await prisma.teamInvite.findUnique({ where: { token } });
    if (!invite || invite.expiresAt < new Date() || invite.acceptedAt) {
      throw new Error('Invalid or expired invite');
    }

    // Create user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.adminUser.create({
      data: {
        email: invite.email,
        passwordHash,
        appId: invite.appId,
        role: invite.role,
      },
    });

    // Mark invite as accepted
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return user;
  }

  async listTeamMembers(appId: string): Promise<AdminUser[]> {
    return prisma.adminUser.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateRole(userId: string, role: string, updatedBy: string): Promise<void> {
    // Check updatedBy has permission (owner or admin)
    const updater = await prisma.adminUser.findUnique({ where: { id: updatedBy } });
    if (!['owner', 'admin'].includes(updater.role)) {
      throw new Error('Unauthorized');
    }

    await prisma.adminUser.update({
      where: { id: userId },
      data: { role },
    });
  }

  async removeTeamMember(userId: string, removedBy: string): Promise<void> {
    // Check removedBy has permission
    const remover = await prisma.adminUser.findUnique({ where: { id: removedBy } });
    if (!['owner', 'admin'].includes(remover.role)) {
      throw new Error('Unauthorized');
    }

    await prisma.adminUser.delete({ where: { id: userId } });
  }
}
```

**Middleware**:
```typescript
// requireAuth.ts
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies.access_token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, appId, role }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// requireRole.ts
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

**API Endpoints**:
```typescript
// Signup
POST /admin/auth/signup
{
  "email": "admin@example.com",
  "password": "secure_password",
  "app_id": "app_123"
}
// Response: { user, access_token, refresh_token }

// Login
POST /admin/auth/login
{
  "email": "admin@example.com",
  "password": "secure_password"
}

// Refresh token
POST /admin/auth/refresh
{
  "refresh_token": "..."
}

// Logout
POST /admin/auth/logout
{
  "refresh_token": "..."
}

// Invite team member (requires admin/owner)
POST /admin/team/invite
{
  "email": "agent@example.com",
  "role": "agent"
}

// Accept invite
POST /admin/team/accept-invite
{
  "token": "invite_token",
  "password": "new_password"
}

// List team members
GET /admin/team?app_id={id}

// Update role
PATCH /admin/team/:userId/role
{
  "role": "manager"
}

// Remove team member
DELETE /admin/team/:userId
```

**Update Admin Routes** (apply auth middleware):
```typescript
// Before: No auth
app.get('/admin/api/users', async (req, res) => { ... });

// After: Require auth
app.get('/admin/api/users', requireAuth, async (req, res) => {
  const { appId } = req.user;
  // Use appId from token, not query param (security)
  const users = await adminService.getUsers(appId);
  res.json({ users });
});

// Restrict certain actions to admin+
app.post('/admin/api/in-app-messages', requireAuth, requireRole(['owner', 'admin', 'manager']), async (req, res) => {
  // Only owner/admin/manager can create messages
});
```

**Deliverable**: Backend has secure admin authentication and role-based access control

#### Week 4: Analytics Dashboard

**Database Schema**:
```sql
CREATE TABLE AnalyticsEvent (
  id UUID PRIMARY KEY,
  app_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),

  INDEX(app_id, event_name, created_at)
);

-- Materialized views for faster aggregations
CREATE MATERIALIZED VIEW daily_message_stats AS
SELECT
  app_id,
  DATE(created_at) as date,
  COUNT(*) as message_count,
  COUNT(CASE WHEN sender = 'user' THEN 1 END) as user_messages,
  COUNT(CASE WHEN sender = 'agent' THEN 1 END) as agent_messages
FROM Message
GROUP BY app_id, DATE(created_at);

CREATE MATERIALIZED VIEW daily_conversation_stats AS
SELECT
  app_id,
  DATE(created_at) as date,
  COUNT(*) as conversation_count,
  COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
  COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count
FROM Conversation
GROUP BY app_id, DATE(created_at);

-- Refresh materialized views (run daily)
REFRESH MATERIALIZED VIEW daily_message_stats;
REFRESH MATERIALIZED VIEW daily_conversation_stats;
```

**Services**:
```typescript
// analyticsService.ts
class AnalyticsService {
  async trackEvent(appId: string, eventName: string, eventData: Record<string, any>): Promise<void> {
    await prisma.analyticsEvent.create({
      data: { appId, eventName, eventData },
    });
  }

  // Overview metrics
  async getOverviewMetrics(appId: string, dateRange: { start: Date, end: Date }): Promise<OverviewMetrics> {
    const [
      messageCount,
      conversationCount,
      avgResponseTime,
      pushDeliveryRate,
    ] = await Promise.all([
      this.getMessageCount(appId, dateRange),
      this.getConversationCount(appId, dateRange),
      this.getAverageResponseTime(appId, dateRange),
      this.getPushDeliveryRate(appId, dateRange),
    ]);

    return {
      messageCount,
      conversationCount,
      avgResponseTime,
      pushDeliveryRate,
    };
  }

  private async getMessageCount(appId: string, dateRange: { start: Date, end: Date }): Promise<number> {
    return prisma.message.count({
      where: {
        conversationId: { in: await this.getConversationIds(appId) },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
    });
  }

  private async getAverageResponseTime(appId: string, dateRange: { start: Date, end: Date }): Promise<number> {
    // Calculate time from user message to first agent reply
    const conversations = await prisma.conversation.findMany({
      where: {
        appId,
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 10,
        },
      },
    });

    const responseTimes = conversations.map(conv => {
      const userMsg = conv.messages.find(m => m.sender === 'user');
      const agentMsg = conv.messages.find(m => m.sender === 'agent' && m.createdAt > userMsg?.createdAt);

      if (!userMsg || !agentMsg) return null;
      return agentMsg.createdAt.getTime() - userMsg.createdAt.getTime();
    }).filter(t => t !== null);

    if (responseTimes.length === 0) return 0;
    return responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  }

  // Trend data for charts
  async getMessageTrend(appId: string, dateRange: { start: Date, end: Date }, granularity: 'hour' | 'day'): Promise<TrendData[]> {
    // Use materialized view for daily, direct query for hourly
    if (granularity === 'day') {
      return prisma.$queryRaw`
        SELECT date, message_count, user_messages, agent_messages
        FROM daily_message_stats
        WHERE app_id = ${appId}
          AND date >= ${dateRange.start}
          AND date <= ${dateRange.end}
        ORDER BY date ASC
      `;
    } else {
      // Hourly query
      return prisma.$queryRaw`
        SELECT
          DATE_TRUNC('hour', created_at) as hour,
          COUNT(*) as message_count
        FROM Message
        WHERE conversation_id IN (SELECT id FROM Conversation WHERE app_id = ${appId})
          AND created_at >= ${dateRange.start}
          AND created_at <= ${dateRange.end}
        GROUP BY DATE_TRUNC('hour', created_at)
        ORDER BY hour ASC
      `;
    }
  }

  // Team performance
  async getTeamPerformance(appId: string, dateRange: { start: Date, end: Date }): Promise<TeamPerformance[]> {
    // Count messages sent by each agent
    return prisma.$queryRaw`
      SELECT
        au.id as agent_id,
        au.first_name,
        au.last_name,
        COUNT(m.id) as message_count,
        AVG(EXTRACT(EPOCH FROM (m.created_at - prev_msg.created_at))) as avg_response_seconds
      FROM AdminUser au
      LEFT JOIN Message m ON m.sender = 'agent' AND m.sender_id = au.id
      LEFT JOIN LATERAL (
        SELECT created_at FROM Message WHERE conversation_id = m.conversation_id AND sender = 'user' AND created_at < m.created_at ORDER BY created_at DESC LIMIT 1
      ) prev_msg ON true
      WHERE au.app_id = ${appId}
        AND m.created_at >= ${dateRange.start}
        AND m.created_at <= ${dateRange.end}
      GROUP BY au.id, au.first_name, au.last_name
      ORDER BY message_count DESC
    `;
  }

  // Export data
  async exportData(appId: string, format: 'csv' | 'json', dateRange: { start: Date, end: Date }): Promise<string | object[]> {
    const data = await prisma.message.findMany({
      where: {
        conversationId: { in: await this.getConversationIds(appId) },
        createdAt: { gte: dateRange.start, lte: dateRange.end },
      },
      include: {
        conversation: true,
      },
    });

    if (format === 'csv') {
      return this.convertToCSV(data);
    } else {
      return data;
    }
  }
}
```

**API Endpoints**:
```typescript
// Overview metrics
GET /admin/api/analytics/overview?app_id={id}&start={date}&end={date}
// Response: { message_count, conversation_count, avg_response_time, push_delivery_rate }

// Message trend
GET /admin/api/analytics/messages/trend?app_id={id}&start={date}&end={date}&granularity=day
// Response: [{ date, message_count, user_messages, agent_messages }, ...]

// Team performance
GET /admin/api/analytics/team?app_id={id}&start={date}&end={date}
// Response: [{ agent_id, first_name, last_name, message_count, avg_response_seconds }, ...]

// Export data
GET /admin/api/analytics/export?app_id={id}&start={date}&end={date}&format=csv
// Response: CSV file download
```

**Real-Time Stats** (Socket.IO admin namespace):
```typescript
// In socketService.ts
adminNs.on('connection', (socket) => {
  const { app_id } = socket.handshake.auth;

  // Send real-time stats every 5 seconds
  const interval = setInterval(async () => {
    const stats = await analyticsService.getRealTimeStats(app_id);
    socket.emit('stats:update', stats);
  }, 5000);

  socket.on('disconnect', () => {
    clearInterval(interval);
  });
});
```

**Deliverable**: Backend tracks analytics and provides dashboard API

---

### Phase 2: Early Days Features (Weeks 5-8)

These features can be implemented after MVP launch to strengthen the product:

#### Week 5-6: Survey & Feedback Tools

**Components**:
- Survey builder (NPS, CSAT, custom questions)
- In-app survey rendering (SDK)
- Response collection and analysis
- Survey templates

**Files**: `surveyService.ts`, `SurveyBuilder.tsx`, `InAppSurvey.kt`

#### Week 6-7: Product Tours

**Components**:
- Tour builder (step-by-step flow)
- Tooltip positioning engine
- Progress tracking
- SDK rendering

**Files**: `productTourService.ts`, `TourBuilder.tsx`, `ProductTour.kt`

#### Week 7-8: Advanced Features

**Components**:
- Canned responses
- Conversation tags
- Assignment rules (round-robin, skill-based)
- Email notifications for agents

**Files**: `cannedResponseService.ts`, `assignmentService.ts`, `emailService.ts`

---

## Implementation Phases

### Phase 1: MVP Development (Weeks 1-8)

**Week 1-2: In-App Messaging**
- [ ] Backend: InAppMessage model, composer API
- [ ] Backend: Targeting engine (basic segment matching)
- [ ] Backend: Delivery tracking
- [ ] SDK: Modal, banner, card components
- [ ] SDK: Message manager (fetch, display, track)
- [ ] Admin UI: Message composer
- [ ] Admin UI: Template library
- [ ] Tests: 20+ tests for message flow

**Week 2-3: Push Notifications**
- [ ] Backend: FCM integration
- [ ] Backend: APNs integration (via FCM)
- [ ] Backend: Push delivery service
- [ ] Backend: Token management
- [ ] SDK Android: FCM service, permission manager
- [ ] SDK iOS: APNs handler, permission manager
- [ ] Tests: Send push, receive push, track events

**Week 3-4: User Segmentation**
- [ ] Backend: Segment model, query DSL
- [ ] Backend: Segment evaluation engine
- [ ] Backend: Event tracking API
- [ ] Backend: Attribute storage (extend Device model)
- [ ] SDK: Identify API, event tracking
- [ ] Admin UI: Segment builder
- [ ] Admin UI: Segment preview
- [ ] Tests: Create segment, evaluate membership

**Week 3-4: Admin Auth & RBAC**
- [ ] Backend: AdminUser model, auth service
- [ ] Backend: JWT tokens, refresh tokens
- [ ] Backend: RBAC middleware
- [ ] Backend: Team invitation flow
- [ ] Admin UI: Login/signup
- [ ] Admin UI: Team management
- [ ] Tests: Auth flow, permission checks

**Week 4: Analytics Dashboard**
- [ ] Backend: AnalyticsEvent model
- [ ] Backend: Metrics aggregation
- [ ] Backend: Export API (CSV/JSON)
- [ ] Admin UI: Overview dashboard
- [ ] Admin UI: Trend charts
- [ ] Admin UI: Team performance
- [ ] Tests: Metric calculations, exports

**Week 5-6: Self-Service Onboarding**
- [ ] Frontend: Public website (landing page)
- [ ] Frontend: Signup flow
- [ ] Backend: Stripe integration
- [ ] Backend: Subscription management
- [ ] Admin UI: SDK setup wizard
- [ ] Admin UI: Onboarding checklist
- [ ] Tests: Signup flow, billing webhooks

**Week 7-8: Cross-Platform SDKs**
- [ ] React Native SDK (Turbo Modules)
- [ ] Flutter SDK (Platform Channels)
- [ ] Web SDK (JavaScript)
- [ ] Example apps for each platform
- [ ] Tests: Cross-platform parity

---

### Phase 2: Launch Preparation (Weeks 9-10)

**Week 9: Testing & QA**
- [ ] Load testing (1000+ concurrent connections)
- [ ] Security audit (OWASP top 10)
- [ ] Cross-browser testing (admin UI)
- [ ] Device testing (iOS/Android SDK)
- [ ] Integration testing (end-to-end flows)
- [ ] Performance optimization
- [ ] Fix critical bugs

**Week 10: Documentation & Launch**
- [ ] Developer documentation (SDK guides)
- [ ] API reference documentation
- [ ] Admin user guide
- [ ] Video tutorials
- [ ] Migration guide (for competitors)
- [ ] Marketing website
- [ ] Launch blog post
- [ ] Beta launch to early customers

---

### Phase 3: Post-Launch Iteration (Months 3-6)

**Month 3: Survey & Feedback Tools**
- Survey builder (NPS, CSAT, custom)
- In-app survey rendering
- Response analysis

**Month 4: Product Tours**
- Tour builder
- Tooltip system
- Progress tracking

**Month 5: Advanced Segmentation**
- Behavioral filters
- Time-based filters
- Composite segments

**Month 6: Team Collaboration**
- Conversation assignment
- Internal notes
- @mentions
- Email notifications

---

## Technical Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT APPS                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │   iOS    │  │ Android  │  │   React  │  │ Flutter  │        │
│  │   SDK    │  │   SDK    │  │  Native  │  │   SDK    │        │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
│       │             │              │             │               │
│       └─────────────┴──────────────┴─────────────┘               │
│                         │                                        │
│                         ▼                                        │
│              ┌──────────────────────┐                           │
│              │   ReplyHQ KMP Core   │                           │
│              │  (Shared Business    │                           │
│              │   Logic & Networking)│                           │
│              └──────────┬───────────┘                           │
└─────────────────────────┼────────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │         BACKEND SERVICES            │
         │                                     │
         │  ┌──────────────────────────────┐  │
         │  │   Express.js + Socket.IO     │  │
         │  │                               │  │
         │  │  /v1/*    - Client REST API  │  │
         │  │  /client  - Device Socket.IO │  │
         │  │  /admin/* - Admin REST API   │  │
         │  │  /admin   - Admin Socket.IO  │  │
         │  └──────────┬───────────────────┘  │
         │             │                       │
         │             ▼                       │
         │  ┌──────────────────────────────┐  │
         │  │      CORE SERVICES           │  │
         │  │                               │  │
         │  │  • messageService            │  │
         │  │  • conversationService       │  │
         │  │  • messageComposerService    │  │
         │  │  • pushDeliveryService       │  │
         │  │  • segmentService            │  │
         │  │  • analyticsService          │  │
         │  │  • authService               │  │
         │  │  • presenceService           │  │
         │  └──────────┬───────────────────┘  │
         │             │                       │
         │             ▼                       │
         │  ┌──────────────────────────────┐  │
         │  │   DATA LAYER                 │  │
         │  │                               │  │
         │  │  PostgreSQL (Prisma ORM)     │  │
         │  │  • App, Conversation, Message│  │
         │  │  • Device, AdminUser         │  │
         │  │  • InAppMessage, Segment     │  │
         │  │  • Event, AnalyticsEvent     │  │
         │  │                               │  │
         │  │  Redis                        │  │
         │  │  • Presence tracking          │  │
         │  │  • Rate limiting              │  │
         │  │  • Socket.IO adapter          │  │
         │  │  • Segment cache              │  │
         │  └──────────────────────────────┘  │
         └─────────────────────────────────────┘
                          │
                          ▼
         ┌────────────────────────────────────┐
         │      THIRD-PARTY SERVICES           │
         │                                     │
         │  • Firebase Cloud Messaging (FCM)  │
         │  • Apple Push Notification (APNs)  │
         │  • Stripe (Billing)                │
         │  • SendGrid (Email)                │
         └─────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      ADMIN DASHBOARD                             │
│                                                                  │
│  React/Next.js Web App                                          │
│  • Login/Signup                                                 │
│  • Conversation List                                            │
│  • Message Composer (Modals, Banners)                          │
│  • Segment Builder                                              │
│  • Analytics Dashboard                                          │
│  • Team Management                                              │
│  • SDK Setup Wizard                                             │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow: In-App Message Delivery

```
1. Admin creates in-app message in dashboard
   └─> POST /admin/api/in-app-messages
       └─> Store in InAppMessage table
       └─> Trigger segment evaluation (background job)

2. SDK fetches pending messages on connection
   └─> GET /v1/in-app-messages?device_id={id}
       └─> Query InAppMessage (status=active, matching segments)
       └─> Exclude already delivered (InAppMessageDelivery)
       └─> Return top N by priority

3. SDK displays message
   └─> Evaluate display rules (max 1 modal/session)
   └─> Render modal/banner/card component
   └─> POST /v1/in-app-messages/:id/events (event=displayed)

4. User interacts with message
   └─> Click CTA
       └─> POST /v1/in-app-messages/:id/events (event=clicked)
       └─> Deep link to app screen
   └─> Dismiss
       └─> POST /v1/in-app-messages/:id/events (event=dismissed)
```

### Data Flow: Push Notification

```
1. User sends message while agent offline
   └─> POST /v1/conversations/:id/messages
       └─> Store message in database
       └─> Broadcast via Socket.IO (if agent online)
       └─> Check presence: is agent offline?
           └─> YES: Trigger push notification
               └─> pushDeliveryService.sendMessageNotification()
                   └─> Get device push token
                   └─> Call FCM/APNs API
                   └─> Store in PushNotification table (status=sent)

2. FCM/APNs delivers notification to device
   └─> Device receives notification
       └─> SDK handles in ReplyHQFirebaseMessagingService
       └─> Show notification with deep link
       └─> POST /v1/push-notifications/:id/events (event=delivered)

3. User taps notification
   └─> App opens to conversation screen
       └─> POST /v1/push-notifications/:id/events (event=opened)
```

### Data Flow: User Segmentation

```
1. SDK identifies user
   └─> POST /v1/identify
       {
         "device_id": "device_123",
         "user_id": "user_456",
         "attributes": { "plan": "pro", "signup_date": "2026-01-15" }
       }
       └─> Store in Device.attributes (JSONB)
       └─> Trigger segment membership refresh (background)

2. SDK tracks event
   └─> POST /v1/events
       {
         "device_id": "device_123",
         "events": [
           { "name": "feature_used", "properties": { "feature": "export" }, "timestamp": "..." }
         ]
       }
       └─> Store in Event table
       └─> Optionally trigger segment refresh for affected segments

3. Background job refreshes segment memberships (every 10 minutes)
   └─> For each segment:
       └─> For each device in app:
           └─> Evaluate segment query against device attributes and events
           └─> Insert/delete SegmentMembership record

4. Message targeting uses cached memberships
   └─> Query SegmentMembership table (fast)
   └─> Return matching device IDs
```

---

## Success Metrics

### Product Metrics

**Pre-Launch (Beta)**:
- 20 beta customers signed up
- 5,000+ SDK installations
- < 100ms message latency (p95)
- 99.9% uptime

**3 Months Post-Launch**:
- 100 paying customers
- $10K MRR
- 50,000+ SDK installations
- 1M+ messages sent
- 500K+ push notifications sent

**6 Months Post-Launch**:
- 500 paying customers
- $50K MRR
- 200,000+ SDK installations
- 10M+ messages sent
- 5M+ push notifications sent

### Technical Metrics

**Performance**:
- Message latency: < 100ms (p95), < 50ms (p50)
- Push delivery: < 5s (p95)
- API response time: < 200ms (p95)
- WebSocket connection time: < 2s (p95)

**Reliability**:
- Uptime: 99.9% (< 43 minutes downtime/month)
- Message delivery rate: 99.5%
- Push delivery rate: 95% (FCM/APNs dependent)

**Scalability**:
- Support 10,000+ concurrent connections per server
- Handle 1,000 messages/second
- Support 1M+ SDK installations

### User Satisfaction

**Developer Experience**:
- SDK setup time: < 15 minutes (self-service)
- Time to first message: < 30 minutes
- Documentation score: 4.5/5 stars

**Admin Experience**:
- Team onboarding time: < 10 minutes
- Average response time: < 2 minutes
- Message creation time: < 5 minutes

---

## Risk Mitigation

### Technical Risks

**Risk: Socket.IO doesn't scale to 10K+ connections**
- **Mitigation**: Load test early (Week 9), use Redis adapter for multi-node
- **Fallback**: Switch to separate WebSocket server (e.g., Pusher, Ably)

**Risk: Push notifications fail to deliver**
- **Mitigation**: Retry logic, fallback to in-app message, monitor delivery rates
- **Fallback**: Email notifications as backup

**Risk: Segment evaluation is too slow for large user bases**
- **Mitigation**: Cache memberships in SegmentMembership table, use background jobs
- **Fallback**: Pre-compute segments nightly, accept stale data

**Risk: Database performance degrades with scale**
- **Mitigation**: Indexes on all query patterns, materialized views for aggregations
- **Fallback**: Read replicas, sharding by app_id

### Business Risks

**Risk: Customers compare to Intercom and find features missing**
- **Mitigation**: Position as "mobile-first" and "simpler", not feature parity
- **Marketing**: Emphasize SDK quality, pricing, ease of setup

**Risk: Stripe integration delays launch**
- **Mitigation**: Manual invoicing for first 20 customers, add Stripe in Week 6
- **Fallback**: Use Gumroad or Paddle for payments

**Risk: Cross-platform SDKs are too much work**
- **Mitigation**: Launch with iOS + Android only, add React Native in Month 2
- **Fallback**: Partner with community for Flutter/React Native SDKs

### Operational Risks

**Risk: Customer support volume overwhelms team**
- **Mitigation**: Comprehensive documentation, video tutorials, chatbot for FAQs
- **Fallback**: Hire part-time support agent

**Risk: Security vulnerability discovered post-launch**
- **Mitigation**: Security audit before launch (Week 9), bug bounty program
- **Fallback**: Emergency patch process, incident response plan

**Risk: Server costs exceed revenue**
- **Mitigation**: Monitor costs weekly, optimize queries, use auto-scaling
- **Fallback**: Increase prices for new customers, add usage-based pricing

---

## Next Steps

### Immediate Actions (This Week)

1. **Review & Approve Plan**
   - Validate technical approach with team
   - Confirm timeline is realistic
   - Prioritize features (if needed)

2. **Set Up Infrastructure**
   - Provision production database (PostgreSQL)
   - Set up Redis cluster
   - Configure Firebase project (FCM)
   - Create APNs certificates

3. **Scaffold Project Structure**
   - Create backend folders: `services/`, `routes/`, `schemas/`
   - Create SDK folders: `ui/`, `push/`, `core/`
   - Set up Prisma migrations
   - Configure CI/CD pipeline

4. **Begin Development** (Week 1)
   - Start with in-app messaging backend
   - Create InAppMessage model and migrations
   - Build message composer API
   - Write initial tests

### Decision Points

**Now:**
- ✅ Approve plan structure and timeline
- ✅ Confirm MVP feature scope
- ✅ Allocate team resources

**Week 4:**
- Review progress (50% complete)
- Adjust timeline if needed
- Decide on beta launch date

**Week 8:**
- Go/No-Go for beta launch
- Review security audit results
- Finalize pricing model

**Month 3:**
- Evaluate beta feedback
- Prioritize post-launch features
- Plan marketing strategy

---

## Appendix

### Technology Stack

**Backend**:
- Node.js 20.x (LTS)
- TypeScript 5.x
- Express.js 4.x
- Socket.IO 4.8.x
- PostgreSQL 16.x
- Prisma 5.x (ORM)
- Redis 7.x
- Firebase Admin SDK (FCM)

**SDK (Kotlin Multiplatform)**:
- Kotlin 2.0.x
- Ktor 3.x (HTTP client)
- SQLDelight 2.x (local database)
- Jetpack Compose (Android UI)
- SwiftUI bridge (iOS UI)

**Admin Dashboard**:
- React 18.x
- Next.js 15.x
- TypeScript 5.x
- Tailwind CSS
- Chart.js (analytics)

**Infrastructure**:
- Docker + Kubernetes (deployment)
- GitHub Actions (CI/CD)
- Sentry (error tracking)
- Datadog (monitoring)

### File Structure

```
replyhq/
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── conversations.ts
│   │   │   ├── inAppMessages.ts (NEW)
│   │   │   ├── pushNotifications.ts (NEW)
│   │   │   ├── segments.ts (NEW)
│   │   │   ├── analytics.ts (NEW)
│   │   │   ├── auth.ts (NEW)
│   │   │   └── team.ts (NEW)
│   │   ├── services/
│   │   │   ├── messageService.ts
│   │   │   ├── messageComposerService.ts (NEW)
│   │   │   ├── fcmService.ts (NEW)
│   │   │   ├── pushDeliveryService.ts (NEW)
│   │   │   ├── segmentService.ts (NEW)
│   │   │   ├── eventTrackingService.ts (NEW)
│   │   │   ├── analyticsService.ts (NEW)
│   │   │   ├── authService.ts (NEW)
│   │   │   ├── teamService.ts (NEW)
│   │   │   └── stripeService.ts (NEW)
│   │   ├── middleware/
│   │   │   ├── requireAuth.ts (NEW)
│   │   │   └── requireRole.ts (NEW)
│   │   ├── schemas/
│   │   │   ├── inAppMessage.ts (NEW)
│   │   │   ├── segment.ts (NEW)
│   │   │   └── adminUser.ts (NEW)
│   │   └── tests/
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
│           ├── XXX_add_in_app_messages.sql (NEW)
│           ├── XXX_add_segments.sql (NEW)
│           ├── XXX_add_admin_users.sql (NEW)
│           └── XXX_add_analytics_events.sql (NEW)
├── sdk/
│   ├── src/
│   │   ├── commonMain/kotlin/dev/replyhq/sdk/
│   │   │   ├── ui/
│   │   │   │   ├── InAppMessageModal.kt (NEW)
│   │   │   │   ├── InAppMessageBanner.kt (NEW)
│   │   │   │   └── InAppMessageCard.kt (NEW)
│   │   │   ├── push/
│   │   │   │   ├── PushNotificationHandler.kt (NEW)
│   │   │   │   └── PushPermissionManager.kt (NEW)
│   │   │   ├── core/
│   │   │   │   ├── InAppMessageManager.kt (NEW)
│   │   │   │   ├── UserAttributeManager.kt (NEW)
│   │   │   │   └── EventTracker.kt (NEW)
│   │   ├── androidMain/kotlin/
│   │   │   └── push/
│   │   │       └── FCMService.kt (NEW)
│   │   └── iosMain/kotlin/
│   │       └── push/
│   │           └── APNsHandler.kt (NEW)
│   ├── react-native/ (NEW)
│   ├── flutter/ (NEW)
│   └── web/ (NEW)
├── frontend/
│   └── admin/ (NEW)
│       ├── pages/
│       │   ├── Login.tsx
│       │   ├── Signup.tsx
│       │   ├── Dashboard.tsx
│       │   ├── Conversations.tsx
│       │   ├── MessageComposer.tsx
│       │   ├── SegmentBuilder.tsx
│       │   ├── Analytics.tsx
│       │   ├── Team.tsx
│       │   └── SDKSetup.tsx
│       └── components/
│           ├── MetricCard.tsx
│           ├── TrendChart.tsx
│           └── CodeSnippet.tsx
└── docs/
    └── plans/
        └── 2026-01-24-feat-saas-mvp-roadmap-plan.md (THIS FILE)
```

### Reference Links

**Internal Documentation**:
- SOCKETIO_MIGRATION.md - Socket.IO implementation details
- SOCKETIO_DEVELOPER_REFERENCE.md - Quick reference
- ADR-001-SOCKETIO-MIGRATION.md - Architecture decisions
- docs/solutions/integration-issues/socketio-migration-production-realtime.md

**External Resources**:
- [Intercom Features Overview](https://www.intercom.com/)
- [Firebase Cloud Messaging Docs](https://firebase.google.com/docs/cloud-messaging)
- [Kotlin Multiplatform Docs](https://kotlinlang.org/docs/multiplatform.html)
- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [Stripe Billing API](https://stripe.com/docs/billing)

---

**Plan Status**: Draft
**Created**: 2026-01-24
**Author**: Claude (via /workflows:plan)
**Estimated Timeline**: 8-10 weeks to MVP
**Next Review**: Week 4 (Mid-Point Check)
