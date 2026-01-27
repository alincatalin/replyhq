---
title: Missing Backend Features for ReplyHQ Frontend
date: 2026-01-27
status: planning
---

# Missing Backend Features for ReplyHQ Frontend

This document catalogs all backend functionality that needs to be implemented to achieve full feature parity with the frontend UI in `backend/public/`.

## Summary

The ReplyHQ frontend UI includes features for **Broadcasts**, **Workflows**, and **Advanced Settings** that do not yet have corresponding backend implementations. This document provides detailed specifications for each missing feature area.

**Priority Levels:**
- 🔴 **High Priority** - Core user-facing features expected by UI
- 🟡 **Medium Priority** - Automation features that enhance UX
- 🟢 **Low Priority** - Admin convenience features

---

## 1. Broadcasts System 🔴 High Priority

### Overview
Allow admins to send targeted messages to groups of users (all users, segments, or specific individuals) with scheduling and analytics tracking.

### Business Value
- **User Engagement:** Re-engage inactive users with targeted campaigns
- **Product Updates:** Announce new features or changes
- **Marketing:** Promote upgrades, events, or content
- **Analytics:** Track open rates, click rates, conversion rates

### Database Schema

```prisma
model Broadcast {
  id              String          @id @default(cuid())
  appId           String
  title           String          // Admin-facing title
  body            String          @db.Text  // Message body
  data            Json?           // Custom data payload
  targetType      TargetType      // ALL_USERS | SEGMENT | SPECIFIC_USERS
  segmentQuery    Json?           // Segment query DSL (for SEGMENT type)
  userIds         String[]        // User IDs (for SPECIFIC_USERS type)
  status          BroadcastStatus // DRAFT | SCHEDULED | SENDING | SENT | FAILED | CANCELLED
  scheduledAt     DateTime?       // When to send (null = send immediately)
  sentAt          DateTime?       // When sending started
  completedAt     DateTime?       // When sending completed
  totalRecipients Int             @default(0)  // Total users targeted
  totalSent       Int             @default(0)  // Messages sent
  totalDelivered  Int             @default(0)  // Messages delivered
  totalOpened     Int             @default(0)  // Messages opened
  totalClicked    Int             @default(0)  // Links clicked
  errorMessage    String?         // Error if failed
  createdBy       String          // AdminUser ID
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  app             App             @relation(fields: [appId], references: [id], onDelete: Cascade)
  creator         AdminUser       @relation(fields: [createdBy], references: [id])
  recipients      BroadcastRecipient[]

  @@index([appId, status])
  @@index([appId, scheduledAt])
}

model BroadcastRecipient {
  id            String          @id @default(cuid())
  broadcastId   String
  userId        String          // User identifier
  deviceId      String          // Device to send to
  status        RecipientStatus // PENDING | SENT | DELIVERED | OPENED | CLICKED | FAILED
  sentAt        DateTime?       // When message sent
  deliveredAt   DateTime?       // When message delivered (push notification)
  openedAt      DateTime?       // When user opened message
  clickedAt     DateTime?       // When user clicked link
  errorMessage  String?         // Error if failed
  metadata      Json?           // User metadata snapshot (for analytics)

  broadcast     Broadcast       @relation(fields: [broadcastId], references: [id], onDelete: Cascade)

  @@unique([broadcastId, deviceId])
  @@index([broadcastId, status])
  @@index([userId])
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
  CANCELLED
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

### API Endpoints

#### `GET /admin/broadcasts`
List all broadcasts with pagination and filtering.

**Query Parameters:**
- `status` (optional) - Filter by status (draft, scheduled, sent, etc.)
- `limit` (optional, default: 50) - Results per page
- `offset` (optional, default: 0) - Pagination offset

**Response:**
```json
{
  "broadcasts": [
    {
      "id": "broadcast_123",
      "title": "v2.4.0 Release Notes",
      "status": "sent",
      "targetType": "ALL_USERS",
      "scheduledAt": null,
      "sentAt": "2026-01-24T10:00:00Z",
      "completedAt": "2026-01-24T10:15:00Z",
      "stats": {
        "totalRecipients": 3200,
        "totalSent": 3200,
        "totalDelivered": 3150,
        "totalOpened": 1440,
        "totalClicked": 384,
        "openRate": 0.45,
        "clickRate": 0.12
      },
      "createdAt": "2026-01-24T09:30:00Z"
    }
  ],
  "total": 12,
  "hasMore": false
}
```

**RBAC:** Requires `Permission.VIEW_BROADCASTS`

---

#### `POST /admin/broadcasts`
Create a new broadcast (draft).

**Request Body:**
```json
{
  "title": "Weekend Sale Announcement",
  "body": "Get 50% off Pro plan this weekend!",
  "data": {
    "action": "open_url",
    "url": "https://example.com/sale"
  },
  "targetType": "SEGMENT",
  "segmentQuery": {
    "conditions": [
      { "field": "plan", "operator": "eq", "value": "free" }
    ]
  }
}
```

**Response:**
```json
{
  "id": "broadcast_456",
  "title": "Weekend Sale Announcement",
  "status": "draft",
  "targetType": "SEGMENT",
  "totalRecipients": 0,
  "createdAt": "2026-01-27T14:30:00Z"
}
```

**RBAC:** Requires `Permission.CREATE_BROADCASTS`

---

#### `GET /admin/broadcasts/:id`
Get broadcast details.

**Response:**
```json
{
  "id": "broadcast_123",
  "title": "v2.4.0 Release Notes",
  "body": "Check out our latest features...",
  "data": { "action": "open_changelog" },
  "targetType": "ALL_USERS",
  "status": "sent",
  "sentAt": "2026-01-24T10:00:00Z",
  "completedAt": "2026-01-24T10:15:00Z",
  "stats": {
    "totalRecipients": 3200,
    "totalSent": 3200,
    "totalDelivered": 3150,
    "totalOpened": 1440,
    "totalClicked": 384,
    "openRate": 0.45,
    "clickRate": 0.12,
    "openRateByHour": [...],
    "deviceBreakdown": {
      "ios": 1800,
      "android": 1400
    },
    "countryBreakdown": {
      "US": 1200,
      "UK": 500,
      "CA": 300,
      "other": 1200
    }
  }
}
```

**RBAC:** Requires `Permission.VIEW_BROADCASTS`

---

#### `PUT /admin/broadcasts/:id`
Update broadcast (only allowed if status is DRAFT or SCHEDULED).

**Request Body:**
```json
{
  "title": "Updated Title",
  "body": "Updated body",
  "scheduledAt": "2026-01-28T12:00:00Z"
}
```

**Response:**
```json
{
  "id": "broadcast_123",
  "title": "Updated Title",
  "status": "scheduled",
  "scheduledAt": "2026-01-28T12:00:00Z",
  "updatedAt": "2026-01-27T14:45:00Z"
}
```

**RBAC:** Requires `Permission.EDIT_BROADCASTS`

---

#### `DELETE /admin/broadcasts/:id`
Delete broadcast (only allowed if status is DRAFT).

**Response:**
```json
{
  "success": true,
  "message": "Broadcast deleted"
}
```

**RBAC:** Requires `Permission.DELETE_BROADCASTS`

---

#### `POST /admin/broadcasts/:id/send`
Send broadcast immediately (changes status from DRAFT to SENDING).

**Request Body:**
```json
{
  "sendAt": "now"  // or ISO timestamp for scheduling
}
```

**Response:**
```json
{
  "id": "broadcast_123",
  "status": "sending",
  "totalRecipients": 3200,
  "sentAt": "2026-01-27T15:00:00Z"
}
```

**RBAC:** Requires `Permission.SEND_BROADCASTS`

---

#### `POST /admin/broadcasts/:id/cancel`
Cancel scheduled broadcast (changes status to CANCELLED).

**Response:**
```json
{
  "id": "broadcast_123",
  "status": "cancelled"
}
```

**RBAC:** Requires `Permission.SEND_BROADCASTS`

---

#### `GET /admin/broadcasts/:id/recipients`
List recipients with individual delivery status.

**Query Parameters:**
- `status` (optional) - Filter by recipient status
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Response:**
```json
{
  "recipients": [
    {
      "userId": "user_789",
      "deviceId": "device_abc",
      "status": "opened",
      "sentAt": "2026-01-24T10:00:15Z",
      "deliveredAt": "2026-01-24T10:00:18Z",
      "openedAt": "2026-01-24T11:30:00Z",
      "metadata": {
        "platform": "ios",
        "country": "US"
      }
    }
  ],
  "total": 3200,
  "hasMore": true
}
```

**RBAC:** Requires `Permission.VIEW_BROADCASTS`

---

### Services to Implement

#### `broadcastService.ts`
Core CRUD operations:
- `createBroadcast(data)` - Create draft broadcast
- `updateBroadcast(id, data)` - Update draft/scheduled broadcast
- `deleteBroadcast(id)` - Delete draft broadcast
- `getBroadcast(id)` - Get broadcast details
- `listBroadcasts(filters)` - List with pagination
- `resolveBroadcastRecipients(broadcast)` - Resolve users based on targetType
- `cancelBroadcast(id)` - Cancel scheduled broadcast

#### `broadcastScheduler.ts`
Cron job to check for scheduled broadcasts:
- Run every minute
- Query broadcasts with `status = SCHEDULED` and `scheduledAt <= now()`
- Trigger `broadcastSender.sendBroadcast(id)`

#### `broadcastSender.ts`
Send broadcast to all recipients:
- `sendBroadcast(broadcastId)` - Main entry point
- Update status to SENDING
- Resolve recipients via `broadcastService.resolveBroadcastRecipients()`
- For each recipient:
  - Create `BroadcastRecipient` record with status PENDING
  - Send via push notification (if device offline) OR in-app message (if online)
  - Update recipient status to SENT
- Update broadcast status to SENT when complete
- Handle errors gracefully (mark failed recipients)

#### `broadcastAnalyticsService.ts`
Track broadcast analytics:
- `trackBroadcastOpened(broadcastId, deviceId)` - Update openedAt timestamp
- `trackBroadcastClicked(broadcastId, deviceId)` - Update clickedAt timestamp
- `getBroadcastAnalytics(broadcastId)` - Aggregate stats (open rate, click rate, breakdowns)

---

### Estimated Effort
- Database migration: 1 hour
- CRUD routes: 4 hours
- Broadcast sender service: 6 hours
- Scheduler cron job: 2 hours
- Analytics service: 3 hours
- Testing: 4 hours
- **Total: ~20 hours (2.5 days)**

---

## 2. Workflows System 🟡 Medium Priority

### Overview
Visual workflow builder for automating user journeys (e.g., onboarding sequences, re-engagement campaigns, conditional messaging).

### Business Value
- **Automation:** Reduce manual messaging for common scenarios
- **Personalization:** Trigger actions based on user behavior
- **Conversion:** Optimize user funnels with automated nudges
- **Retention:** Re-engage inactive users automatically

### Database Schema

```prisma
model Workflow {
  id          String          @id @default(cuid())
  appId       String
  name        String          // User-facing name
  description String?         // Description
  trigger     Json            // Trigger config: { type: 'event', event_name: 'user_signup' }
  nodes       Json            // DAG nodes: { id: 'node_1', type: 'send_message', config: {...} }
  edges       Json            // Connections: [{ from: 'node_1', to: 'node_2' }]
  status      WorkflowStatus  // DRAFT | ACTIVE | PAUSED
  version     Int             @default(1)  // Version number (for history)
  createdBy   String          // AdminUser ID
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  app         App             @relation(fields: [appId], references: [id], onDelete: Cascade)
  creator     AdminUser       @relation(fields: [createdBy], references: [id])
  executions  WorkflowExecution[]

  @@index([appId, status])
  @@index([appId, trigger])  // For fast trigger lookup
}

model WorkflowExecution {
  id            String            @id @default(cuid())
  workflowId    String
  userId        String            // User who triggered workflow
  deviceId      String?           // Device ID (if applicable)
  status        ExecutionStatus   // RUNNING | COMPLETED | FAILED | CANCELLED
  currentNodeId String?           // Current node being executed
  context       Json              // Execution state/variables
  startedAt     DateTime          @default(now())
  completedAt   DateTime?
  errorMessage  String?

  workflow      Workflow          @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  steps         WorkflowStep[]

  @@index([workflowId, status])
  @@index([userId, status])
  @@index([workflowId, startedAt])  // For analytics
}

model WorkflowStep {
  id            String          @id @default(cuid())
  executionId   String
  nodeId        String          // Node ID from workflow.nodes
  action        String          // send_message | wait | condition | webhook | track_event
  status        StepStatus      // PENDING | RUNNING | COMPLETED | FAILED | SKIPPED
  input         Json            // Input data for this step
  output        Json?           // Output/result from this step
  startedAt     DateTime        @default(now())
  completedAt   DateTime?
  errorMessage  String?

  execution     WorkflowExecution @relation(fields: [executionId], references: [id], onDelete: Cascade)

  @@index([executionId])
  @@index([nodeId, status])
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

### API Endpoints

#### `GET /admin/workflows`
List all workflows.

**Query Parameters:**
- `status` (optional) - Filter by status (active, paused, draft)

**Response:**
```json
{
  "workflows": [
    {
      "id": "workflow_123",
      "name": "Onboarding + Upsell",
      "description": "Welcome sequence for new signups",
      "status": "active",
      "trigger": {
        "type": "event",
        "event_name": "user_signup"
      },
      "stats": {
        "totalExecutions": 842,
        "conversionRate": 0.12
      },
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "total": 3
}
```

**RBAC:** Requires `Permission.VIEW_WORKFLOWS`

---

#### `POST /admin/workflows`
Create workflow.

**Request Body:**
```json
{
  "name": "Winback 30 Days",
  "description": "Re-engage inactive users",
  "trigger": {
    "type": "event",
    "event_name": "user_inactive_30d"
  },
  "nodes": [
    {
      "id": "node_1",
      "type": "send_message",
      "config": {
        "body": "We miss you! Come back for 20% off.",
        "data": { "action": "open_offer" }
      }
    },
    {
      "id": "node_2",
      "type": "wait",
      "config": { "duration": "3d" }
    },
    {
      "id": "node_3",
      "type": "condition",
      "config": {
        "field": "last_active",
        "operator": "gt",
        "value": "now() - 7d"
      }
    }
  ],
  "edges": [
    { "from": "node_1", "to": "node_2" },
    { "from": "node_2", "to": "node_3" }
  ]
}
```

**Response:**
```json
{
  "id": "workflow_456",
  "name": "Winback 30 Days",
  "status": "draft",
  "createdAt": "2026-01-27T15:00:00Z"
}
```

**RBAC:** Requires `Permission.CREATE_WORKFLOWS`

---

#### `GET /admin/workflows/:id`
Get workflow details.

**Response:**
```json
{
  "id": "workflow_123",
  "name": "Onboarding + Upsell",
  "description": "Welcome sequence",
  "status": "active",
  "trigger": { "type": "event", "event_name": "user_signup" },
  "nodes": [...],
  "edges": [...],
  "version": 2,
  "stats": {
    "totalExecutions": 842,
    "completionRate": 0.68,
    "conversionRate": 0.12,
    "avgDuration": "4h 32m"
  }
}
```

**RBAC:** Requires `Permission.VIEW_WORKFLOWS`

---

#### `PUT /admin/workflows/:id`
Update workflow (creates new version if status is ACTIVE).

**Request Body:**
```json
{
  "name": "Updated Name",
  "nodes": [...],
  "edges": [...]
}
```

**Response:**
```json
{
  "id": "workflow_123",
  "version": 3,
  "updatedAt": "2026-01-27T15:30:00Z"
}
```

**RBAC:** Requires `Permission.EDIT_WORKFLOWS`

---

#### `DELETE /admin/workflows/:id`
Delete workflow (only if status is DRAFT).

**RBAC:** Requires `Permission.DELETE_WORKFLOWS`

---

#### `POST /admin/workflows/:id/activate`
Activate workflow (change status to ACTIVE).

**RBAC:** Requires `Permission.MANAGE_WORKFLOWS`

---

#### `POST /admin/workflows/:id/pause`
Pause workflow (change status to PAUSED).

**RBAC:** Requires `Permission.MANAGE_WORKFLOWS`

---

#### `GET /admin/workflows/:id/executions`
List workflow executions with pagination.

**Query Parameters:**
- `status` (optional) - Filter by status
- `limit` (optional, default: 50)
- `offset` (optional, default: 0)

**Response:**
```json
{
  "executions": [
    {
      "id": "exec_789",
      "userId": "user_456",
      "status": "completed",
      "currentNodeId": null,
      "startedAt": "2026-01-27T10:00:00Z",
      "completedAt": "2026-01-27T14:30:00Z",
      "duration": "4h 30m"
    }
  ],
  "total": 842,
  "hasMore": true
}
```

**RBAC:** Requires `Permission.VIEW_WORKFLOWS`

---

#### `GET /admin/workflows/:id/analytics`
Get workflow analytics.

**Response:**
```json
{
  "totalExecutions": 842,
  "completionRate": 0.68,
  "conversionRate": 0.12,
  "avgDuration": "4h 32m",
  "dropoffByNode": {
    "node_1": 0,
    "node_2": 125,
    "node_3": 145
  },
  "executionsByDay": [
    { "date": "2026-01-20", "count": 42 },
    { "date": "2026-01-21", "count": 38 }
  ]
}
```

**RBAC:** Requires `Permission.VIEW_WORKFLOWS`

---

### Services to Implement

#### `workflowService.ts`
Core CRUD operations:
- `createWorkflow(data)` - Create workflow
- `updateWorkflow(id, data)` - Update workflow (version increment if active)
- `deleteWorkflow(id)` - Delete draft workflow
- `activateWorkflow(id)` - Activate workflow
- `pauseWorkflow(id)` - Pause workflow
- `getWorkflow(id)` - Get workflow details
- `listWorkflows(filters)` - List workflows

#### `workflowEngine.ts`
Execute workflow instances:
- `executeWorkflow(workflowId, userId, context)` - Start execution
- `continueExecution(executionId)` - Resume after wait/async step
- `cancelExecution(executionId)` - Cancel running execution
- DAG traversal logic:
  - Start at trigger node
  - Execute node action (send_message, wait, condition, webhook)
  - Follow edges based on node output (conditions)
  - Track steps in `WorkflowStep` table
  - Handle errors and retries

#### `workflowTriggerService.ts`
Listen for events and trigger workflows:
- Subscribe to event stream (from analytics service)
- Match event to workflow triggers
- Create workflow execution for matching workflows
- Call `workflowEngine.executeWorkflow()`

#### `workflowAnalyticsService.ts`
Track workflow performance:
- `getWorkflowAnalytics(workflowId)` - Aggregate stats
- Completion rate: executions completed / total executions
- Conversion rate: executions with conversion event / total
- Drop-off analysis: count failures per node

---

### Workflow Node Types

**send_message:**
```json
{
  "type": "send_message",
  "config": {
    "body": "Welcome to our app!",
    "data": { "action": "open_onboarding" }
  }
}
```

**wait:**
```json
{
  "type": "wait",
  "config": {
    "duration": "3d"  // 3 days, or "2h", "30m"
  }
}
```

**condition:**
```json
{
  "type": "condition",
  "config": {
    "field": "event_count",
    "operator": "gte",
    "value": 5
  },
  "branches": {
    "true": "node_5",
    "false": "node_6"
  }
}
```

**webhook:**
```json
{
  "type": "webhook",
  "config": {
    "url": "https://example.com/api/notify",
    "method": "POST",
    "body": {
      "user_id": "{{user_id}}",
      "event": "workflow_completed"
    }
  }
}
```

**track_event:**
```json
{
  "type": "track_event",
  "config": {
    "event_name": "workflow_conversion",
    "properties": {
      "workflow_id": "{{workflow_id}}"
    }
  }
}
```

---

### Estimated Effort
- Database migration: 2 hours
- CRUD routes: 6 hours
- Workflow engine (DAG execution): 12 hours
- Trigger service: 4 hours
- Analytics service: 4 hours
- Testing: 6 hours
- **Total: ~34 hours (4-5 days)**

---

## 3. Settings Enhancements 🟢 Low Priority

### Overview
Admin settings for app configuration, team management, API keys, and webhooks.

### Features Needed

#### 3.1 App Settings

**Endpoints:**
- `GET /admin/settings/app` - Get app settings
- `PUT /admin/settings/app` - Update app settings

**Settings:**
```json
{
  "name": "My App",
  "branding": {
    "logo_url": "https://...",
    "primary_color": "#DC2626"
  },
  "webhooks": [
    {
      "id": "webhook_123",
      "url": "https://example.com/webhooks",
      "events": ["message.created", "conversation.resolved"],
      "secret": "whsec_xxx"
    }
  ],
  "notifications": {
    "email_on_new_message": true,
    "email_on_new_conversation": true
  }
}
```

**Estimated Effort: 4 hours**

---

#### 3.2 API Key Management

**Endpoints:**
- `GET /admin/settings/api-keys` - List API keys
- `POST /admin/settings/api-keys` - Create new API key
- `POST /admin/settings/api-keys/:id/regenerate` - Regenerate key
- `DELETE /admin/settings/api-keys/:id` - Revoke key

**Features:**
- Multiple API keys per app (for different environments)
- Key rotation without downtime
- Last used timestamp tracking
- Key naming (e.g., "Production", "Staging")

**Schema Addition:**
```prisma
model ApiKey {
  id          String   @id @default(cuid())
  appId       String
  name        String   // User-friendly name
  keyHash     String   @unique  // Bcrypt hash
  keyPrefix   String   // First 8 chars for display (e.g., "sk_live_abc123...")
  lastUsedAt  DateTime?
  createdBy   String   // AdminUser ID
  createdAt   DateTime @default(now())
  revokedAt   DateTime?

  app         App      @relation(fields: [appId], references: [id], onDelete: Cascade)
  creator     AdminUser @relation(fields: [createdBy], references: [id])

  @@index([appId])
}
```

**Note:** Current implementation has single API key on `App` model. This needs migration.

**Estimated Effort: 6 hours**

---

#### 3.3 Team Management

**Endpoints:**
- `GET /admin/settings/team` - List team members
- `POST /admin/settings/team/invite` - Invite team member
- `PUT /admin/settings/team/:userId/role` - Update member role
- `DELETE /admin/settings/team/:userId` - Remove member

**Features:**
- Email invitations with signup link
- Role assignment (OWNER, ADMIN, AGENT)
- Invitation expiry (7 days)
- Pending invitations list

**Schema Addition:**
```prisma
model Invitation {
  id          String   @id @default(cuid())
  appId       String
  email       String
  role        Role     // OWNER | ADMIN | AGENT
  token       String   @unique  // Invite token
  invitedBy   String   // AdminUser ID
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime @default(now())

  app         App      @relation(fields: [appId], references: [id], onDelete: Cascade)
  inviter     AdminUser @relation(fields: [invitedBy], references: [id])

  @@index([appId])
  @@index([email, appId])
}
```

**Estimated Effort: 8 hours**

---

#### 3.4 Webhook Configuration

**Endpoints:**
- `GET /admin/settings/webhooks` - List webhooks
- `POST /admin/settings/webhooks` - Create webhook
- `PUT /admin/settings/webhooks/:id` - Update webhook
- `DELETE /admin/settings/webhooks/:id` - Delete webhook
- `POST /admin/settings/webhooks/:id/test` - Send test webhook

**Features:**
- Subscribe to events (message.created, conversation.resolved, etc.)
- HMAC signature verification
- Retry logic with exponential backoff
- Delivery logs (success/failure)

**Schema Addition:**
```prisma
model Webhook {
  id          String   @id @default(cuid())
  appId       String
  url         String
  events      String[] // Event types to listen for
  secret      String   // HMAC secret for signature
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  app         App      @relation(fields: [appId], references: [id], onDelete: Cascade)
  deliveries  WebhookDelivery[]

  @@index([appId])
}

model WebhookDelivery {
  id          String   @id @default(cuid())
  webhookId   String
  event       String   // Event type (message.created, etc.)
  payload     Json     // Event payload
  status      String   // success | failed | retrying
  httpStatus  Int?     // Response status code
  responseBody String? @db.Text  // Response from webhook URL
  attempts    Int      @default(1)
  nextRetryAt DateTime?
  deliveredAt DateTime?
  createdAt   DateTime @default(now())

  webhook     Webhook  @relation(fields: [webhookId], references: [id], onDelete: Cascade)

  @@index([webhookId, status])
}
```

**Estimated Effort: 10 hours**

---

### Total Estimated Effort for Settings
- App settings: 4 hours
- API key management: 6 hours
- Team management: 8 hours
- Webhook configuration: 10 hours
- **Total: ~28 hours (3.5 days)**

---

## Implementation Priority

### Recommended Order

1. **Phase 3A: Broadcasts** (~2.5 days)
   - High user demand
   - Immediate business value (re-engagement, announcements)
   - Simpler than workflows

2. **Phase 3B: Settings Enhancements** (~3.5 days)
   - API key management (security improvement)
   - Team management (collaboration)
   - Webhook configuration (integration)
   - App settings (branding)

3. **Phase 3C: Workflows** (~4.5 days)
   - Most complex feature
   - Requires workflow engine (DAG execution)
   - High value but longer payback period

**Total Estimated Time: ~10.5 days**

---

## RBAC Permissions to Add

```typescript
enum Permission {
  // Existing permissions...

  // Broadcasts
  VIEW_BROADCASTS = 'VIEW_BROADCASTS',
  CREATE_BROADCASTS = 'CREATE_BROADCASTS',
  EDIT_BROADCASTS = 'EDIT_BROADCASTS',
  DELETE_BROADCASTS = 'DELETE_BROADCASTS',
  SEND_BROADCASTS = 'SEND_BROADCASTS',

  // Workflows
  VIEW_WORKFLOWS = 'VIEW_WORKFLOWS',
  CREATE_WORKFLOWS = 'CREATE_WORKFLOWS',
  EDIT_WORKFLOWS = 'EDIT_WORKFLOWS',
  DELETE_WORKFLOWS = 'DELETE_WORKFLOWS',
  MANAGE_WORKFLOWS = 'MANAGE_WORKFLOWS',  // Activate/pause

  // Settings
  MANAGE_SETTINGS = 'MANAGE_SETTINGS',
  MANAGE_API_KEYS = 'MANAGE_API_KEYS',
  MANAGE_TEAM = 'MANAGE_TEAM',
  MANAGE_WEBHOOKS = 'MANAGE_WEBHOOKS',
}

// Update role mappings in backend/src/lib/rbac.ts
const rolePermissions = {
  [Role.OWNER]: [
    ...existing,
    Permission.VIEW_BROADCASTS,
    Permission.CREATE_BROADCASTS,
    Permission.EDIT_BROADCASTS,
    Permission.DELETE_BROADCASTS,
    Permission.SEND_BROADCASTS,
    Permission.VIEW_WORKFLOWS,
    Permission.CREATE_WORKFLOWS,
    Permission.EDIT_WORKFLOWS,
    Permission.DELETE_WORKFLOWS,
    Permission.MANAGE_WORKFLOWS,
    Permission.MANAGE_SETTINGS,
    Permission.MANAGE_API_KEYS,
    Permission.MANAGE_TEAM,
    Permission.MANAGE_WEBHOOKS,
  ],
  [Role.ADMIN]: [
    ...existing,
    Permission.VIEW_BROADCASTS,
    Permission.CREATE_BROADCASTS,
    Permission.EDIT_BROADCASTS,
    Permission.SEND_BROADCASTS,
    Permission.VIEW_WORKFLOWS,
    Permission.CREATE_WORKFLOWS,
    Permission.EDIT_WORKFLOWS,
    Permission.MANAGE_WORKFLOWS,
  ],
  [Role.AGENT]: [
    ...existing,
    Permission.VIEW_BROADCASTS,
    Permission.VIEW_WORKFLOWS,
  ],
};
```

---

## Testing Requirements

For each feature area:

### Unit Tests
- Service functions (CRUD operations)
- Workflow engine node execution
- Broadcast recipient resolution
- Analytics calculations

### Integration Tests
- API endpoint tests (request/response validation)
- Database operations (create, read, update, delete)
- RBAC enforcement (permission checks)

### End-to-End Tests
- Broadcast: Create → Schedule → Send → Track Analytics
- Workflow: Create → Activate → Trigger → Execute → Complete
- Settings: Create API key → Use in request → Rotate → Revoke

### Performance Tests
- Broadcast sending: 10k recipients in < 5 minutes
- Workflow execution: < 500ms per node (excluding wait nodes)
- Analytics aggregation: < 2 seconds for 1M events

---

## Documentation Requirements

**For Each Feature:**
1. API Reference (OpenAPI/Swagger spec)
2. Integration Guide (how to use from frontend)
3. Architecture Decision Record (why this design)
4. Troubleshooting Guide (common issues)

**Example Docs to Create:**
- `docs/features/broadcasts.md` - Broadcast system guide
- `docs/features/workflows.md` - Workflow builder guide
- `docs/api/broadcasts.yaml` - OpenAPI spec
- `docs/api/workflows.yaml` - OpenAPI spec

---

## Migration Guide

### From Current State to Phase 3A (Broadcasts)

1. **Run Prisma Migration:**
```bash
npx prisma migrate dev --name add_broadcasts
```

2. **Update RBAC Permissions:**
```bash
# Add broadcast permissions to backend/src/lib/rbac.ts
```

3. **Create Services:**
```bash
touch backend/src/services/broadcastService.ts
touch backend/src/services/broadcastSender.ts
touch backend/src/services/broadcastScheduler.ts
touch backend/src/services/broadcastAnalyticsService.ts
```

4. **Create Routes:**
```bash
touch backend/src/routes/broadcasts.ts
```

5. **Add Cron Job:**
```typescript
// backend/src/index.ts
import { startBroadcastScheduler } from './services/broadcastScheduler.js';

// After server start
startBroadcastScheduler();
```

6. **Test:**
```bash
npm test -- broadcasts
```

7. **Deploy:**
```bash
npm run build
npm run migrate:deploy  # Production migration
pm2 restart backend
```

---

## Conclusion

This document provides a complete roadmap for implementing the missing backend features required by the ReplyHQ frontend UI. The features are prioritized by business value and estimated effort, allowing for incremental delivery.

**Next Steps:**
1. Review and approve this specification
2. Create GitHub issues for each feature area
3. Assign to engineers
4. Begin implementation starting with Phase 3A (Broadcasts)

**Questions or Feedback:**
Contact the engineering team for clarification or to propose changes to this specification.
