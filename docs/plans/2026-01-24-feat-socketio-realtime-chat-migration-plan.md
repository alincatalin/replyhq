---
title: feat: Socket.IO Realtime Chat Migration & Integration
type: feat
date: 2026-01-24
priority: P0
estimated_phases: 4
---

# Socket.IO Realtime Chat Migration & Integration Plan

## Executive Summary

Migrate from raw `ws` WebSocket to **Socket.IO 4.x** with Redis adapter for a production-ready, scalable realtime chat system. This enables:

- **Built-in namespaces & rooms** (vs manual tracking)
- **Message acknowledgements** (request-response patterns)
- **Automatic reconnection** (vs custom exponential backoff)
- **Multi-node scaling** (Redis adapter handles cross-server broadcasting)
- **Admin dashboard integration** (separate admin namespace with full visibility)

**Timeline:** 4 days (Phase 1-4)
**Risk Level:** Medium (requires custom SDK Socket.IO protocol adapter since no official KMP client exists)
**Current State:** Backend uses raw `ws` library; SDK uses custom Ktor WebSocket with manual heartbeat

**Success Criteria:**
- ✅ Chat SDK connects to backend via Socket.IO
- ✅ Messages deliver in real-time both directions
- ✅ Presence tracking works correctly (multi-connection bug fixed)
- ✅ Admin can see sessions and send messages
- ✅ Graceful reconnection on network changes
- ✅ E2E test covering full flow
- ✅ Production metrics and logging in place

---

## Current State Analysis

### Backend Implementation

**Location:** `/Users/alin/Desktop/replyhq/backend/src/services/websocketService.ts`

**Current Architecture:**
- Raw `ws` (v8.16.0) WebSocket library
- Two separate WebSocket servers: `/v1/realtime` (clients) and `/admin/realtime` (admin)
- Manual in-memory connection tracking via Maps
- Redis pub/sub for cross-server broadcasting (fallback if unavailable)
- Custom 30-second heartbeat with stale connection cleanup (90s threshold)
- Auto-subscribe to latest conversation on connect
- Backpressure monitoring (1MB buffer threshold)

**Issues to Fix:**
1. **Multi-connection presence bug** (Task socketio-9): Closing one connection on a device with 2+ connections incorrectly marks device offline
   - Current: Per-device tracking only
   - Fix: Per-connection with device-level aggregation
2. **No acknowledgements**: Can't verify message delivery or join/leave success
3. **Manual room management**: Prone to sync bugs across instances
4. **Dual heartbeat mechanism**: Both manual JSON ping and implicit keepalive

**Files to Modify:**
- `backend/src/services/websocketService.ts` → Rewrite as Socket.IO service
- `backend/src/services/presenceService.ts` → Fix multi-connection tracking
- `backend/src/services/messageService.ts` → Update broadcast calls
- `backend/src/index.ts` → Initialize Socket.IO instead of ws
- `backend/package.json` → Add socket.io, @socket.io/redis-adapter

### SDK Implementation

**Location:** `/Users/alin/Desktop/replyhq/sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/RealtimeClient.kt`

**Current Architecture:**
- Ktor HttpClient WebSocket plugin
- Custom event serialization via Kotlin Serialization
- Manual heartbeat (ping every 30s)
- ConnectionManager with exponential backoff reconnection (1s → 30s)
- Explicit connection state machine (DISCONNECTED → CONNECTING → CONNECTED)
- SyncManager handles message queue and offline persistence

**Limitations:**
1. No official Socket.IO Kotlin Multiplatform client exists
2. Custom packet parsing required (Engine.IO + Socket.IO layers)
3. Must implement ACK handling with deferred completion tracking
4. No built-in room subscription (custom message routing)

**Files to Create/Modify:**
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOPacket.kt` (new)
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOEvent.kt` (new)
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOParser.kt` (new)
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOClient.kt` (new)
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/core/ConnectionManager.kt` (update)
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/core/SyncManager.kt` (update)
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/config/NetworkConfig.kt` (update)
- `sdk/src/commonMain/kotlin/dev/replyhq/sdk/ChatSDK.kt` (update)

---

## Architecture Design

### Socket.IO Server Configuration

```typescript
// Backend Setup
const io = require('socket.io')(server, {
  path: '/v1/socket.io',
  cors: { origin: '*' },
  pingInterval: 25000,      // 25 seconds (Engine.IO keep-alive)
  pingTimeout: 60000,       // 60 seconds auto-disconnect threshold
  transports: ['websocket'],// WebSocket only (no polling for mobile)
})

// Redis Adapter for multi-node
const { createAdapter } = require('@socket.io/redis-adapter')
const pubClient = redis.createClient()
const subClient = pubClient.duplicate()
io.adapter(createAdapter(pubClient, subClient))

// Namespaces
const clientNs = io.of('/client')     // Device SDK connections
const adminNs = io.of('/admin')       // Admin dashboard
```

### WebSocket Event Protocol

**Client Namespace (`/client`)**

Client → Server:
- `conversation:join` → Server responds with ack: `{ success, last_message_id?, error? }`
- `conversation:leave` → No ack needed
- `typing:start` → Broadcast to room (excluding sender)
- `typing:stop` → Broadcast to room
- `ping` → Implicit (Socket.IO handles heartbeat)

Server → Client:
- `connected` → Emitted after auth succeeds: `{ connection_id, server_time }`
- `message:new` → New message event: `{ id, local_id, conversation_id, body, sender, created_at, status }`
- `agent:typing` → Agent typing: `{ conversation_id, is_typing }`
- `conversation:joined` → After join: `{ conversation_id, last_message_id }`
- `server:shutdown` → Graceful shutdown: `{ message, reconnect_delay_ms }`
- `error` → Error event: `{ code, message }`

**Admin Namespace (`/admin`)**

Admin → Server:
- `app:subscribe` → Watch all app events (join app room)
- `conversation:join` → Subscribe to conversation
- `message:send` → Send message as agent, ack: `{ success, message?, error? }`
- `sessions:list` → Query active sessions, ack: `{ sessions: [...] }`
- `typing:start/stop` → Agent typing indicators

Server → Admin:
- All client events (proxied) +
- `session:connect` → Client connected: `{ connection_id, device_id, app_id }`
- `session:disconnect` → Client disconnected: `{ connection_id, device_id, reason }`
- `presence:change` → Device online/offline: `{ app_id, device_id, is_online }`
- `user:typing` → Client typing: `{ conversation_id, device_id, is_typing }`

### Rooms Strategy

```
// Client namespace
conversation:{conversationId}   → All clients in this conversation

// Admin namespace
app:{appId}                      → All admins watching this app
conversation:{conversationId}    → All admins watching this conversation
```

### Redis Data Structures

```typescript
// Per-connection session tracking (2-min TTL, refreshed on heartbeat)
session:{connectionId} → { appId, deviceId, connectionId, connectedAt }
sessions:app:{appId} → SET of active connectionIds

// Multi-connection presence (per-connection + per-device aggregation)
presence:conn:{connectionId} → TTL key (60s)
presence:device:{appId}:{deviceId} → SET of active connectionIds

// Rate limiting (1-second sliding window)
ratelimit:message:{deviceId} → ZSET of timestamps
ratelimit:typing:{deviceId} → ZSET of timestamps
```

---

## Implementation Phases

### Phase 1: Backend Socket.IO Setup (Day 1)

**Objectives:**
- Install Socket.IO dependencies
- Create Socket.IO service with types
- Implement client authentication
- Fix presence service multi-connection bug
- Integrate with existing message service

**Tasks:**

#### Task 1.1: Install Dependencies
- Run: `pnpm add socket.io @socket.io/redis-adapter`
- Run: `pnpm add -D @types/socket.io`
- Verify: `pnpm install` completes, no conflicts
- **Files:** `backend/package.json`
- **Acceptance:** Dependencies in package.json, typecheck passes

#### Task 1.2: Create Socket.IO Types
- Create `backend/src/types/socket.ts`
- Define interfaces:
  - `ClientSocket extends Socket` with data: `{ appId, deviceId, connectionId, conversationId? }`
  - `AdminSocket extends Socket` with data: `{ appId, connectionId, subscribedConversations }`
  - Server-to-client events
  - Client-to-server events
  - Admin-to-server events
  - Server-to-admin events
- **Acceptance:** All interfaces properly typed, typecheck passes

#### Task 1.3: Create Socket.IO Service Skeleton
- Create `backend/src/services/socketService.ts`
- Implement `initSocketIO(server)` function with:
  - Socket.IO server config: path `/v1/socket.io`, pingInterval 25s, pingTimeout 60s
  - Redis adapter integration (conditional on `isRedisReady()`)
  - Client namespace `/client` creation
  - Admin namespace `/admin` creation
  - Export: `io`, `clientNs`, `adminNs` references
  - Implement `gracefulShutdown()` function
- **Acceptance:** Server initializes, namespaces created, typecheck passes

#### Task 1.4: Implement Client Authentication Middleware
- Add `clientNs.use()` middleware:
  - Extract `app_id`, `device_id`, `api_key` from `socket.handshake.auth`
  - Validate all three present (error: MISSING_PARAMS)
  - Query `prisma.app.findUnique` to validate app exists
  - Check `app.apiKey` matches provided `api_key` (error: INVALID_CREDENTIALS)
  - Set `socket.data` with `appId`, `deviceId`, `connectionId` (generated)
  - Call `next()` on success, `next(new Error(code))` on failure
- **Acceptance:** Invalid credentials rejected, valid populate socket.data, typecheck passes

#### Task 1.5: Implement Client Connection Handler
- Register connection handler for `clientNs`:
  - Log connection with identifiers
  - Emit `connected` event with `{ connection_id, server_time }`
  - Register event handlers: `conversation:join`, `conversation:leave`, `typing:start`, `typing:stop`, `ping`, `disconnect`
  - Clean up on disconnect
- **Acceptance:** Connection logged, events handled, disconnect cleanup, typecheck passes

#### Task 1.6: Implement Conversation Join with Rooms
- Implement `handleConversationJoin(socket, conversationId, ack)`:
  - Validate conversation exists and belongs to appId + deviceId (Prisma)
  - If not found: `ack({ success: false, error: 'CONVERSATION_NOT_FOUND' })`
  - Leave previous room if `socket.data.conversationId` exists
  - Join new room: `socket.join(\`conversation:${conversationId}\`)`
  - Update `socket.data.conversationId`
  - Get last message ID from conversation
  - Emit `conversation:joined` with `{ conversation_id, last_message_id }`
  - `ack({ success: true, last_message_id })`
- **Acceptance:** Room membership managed, ack works, typecheck passes

#### Task 1.7: Implement Typing Indicators
- Implement `handleTyping(socket, conversationId, isTyping)`:
  - Broadcast to room excluding sender: `socket.to(\`conversation:${conversationId}\`).emit('user:typing', {...})`
  - Also emit to admin: `adminNs.to(\`conversation:${conversationId}\`).emit('user:typing', {...})`
  - Payload: `{ conversation_id, device_id, is_typing }`
- **Acceptance:** Broadcast to room, admin receives, typecheck passes

#### Task 1.8: Implement Auto-Subscribe to Latest Conversation
- Implement `autoSubscribeToConversation(socket)`:
  - Query latest conversation: `prisma.conversation.findFirst({ where: { appId, deviceId }, orderBy: { updatedAt: 'desc' } })`
  - If found, call `handleConversationJoin(socket, conversation.id)`
- Call in connection handler after emitting `connected`
- **Acceptance:** Client auto-joins latest conversation, no error if none exists, typecheck passes

#### Task 1.9: Fix Presence Service for Multi-Connection Support
- **File:** `backend/src/services/presenceService.ts`
- Change key structure:
  - Per-connection: `presence:conn:${connectionId}` with TTL
  - Per-device set: `presence:device:${appId}:${deviceId}` containing connectionIds
- Update `setPresence(appId, deviceId, connectionId)`:
  - `setEx` connection key with JSON
  - `sAdd` connectionId to device set
  - `expire` device set
  - Only broadcast online if `sCard(deviceKey) === 1` (first connection)
- Update `removePresence(appId, deviceId, connectionId)`:
  - `del` connection key
  - `sRem` connectionId from device set
  - Only broadcast offline if `sCard(deviceKey) === 0` (last connection)
  - `del` device set if empty
- Update `isOnline` to check `sCard(deviceKey) > 0`
- Add `getActiveConnectionCount(appId, deviceId)` function
- Remove `localPresenceIntervals` Map
- **Acceptance:** Multi-connection tracking works, presence broadcasts at device boundaries, typecheck passes

#### Task 1.10: Add Session Registry in Redis
- Constants: `SESSION_KEY_PREFIX = 'session:'`, `SESSION_SET_PREFIX = 'sessions:app:'`, `SESSION_TTL = 120`
- Implement `registerSession(appId, deviceId, connectionId)`:
  - `hSet` session key with `{ appId, deviceId, connectionId, connectedAt }`
  - `expire` with TTL
  - `sAdd` to app's session set
- Implement `unregisterSession(appId, deviceId, connectionId)`:
  - `del` session key
  - `sRem` from app's session set
- Implement `getActiveSessions(appId)`:
  - `sMembers` to get connectionIds
  - `hGetAll` for each to get session data
  - Return array of session objects
- **Acceptance:** Sessions stored on connect, removed on disconnect, typecheck passes

#### Task 1.11: Integrate Presence with Socket.IO Lifecycle
- On client connection (in connection handler):
  - Call `registerSession(appId, deviceId, connectionId)`
  - Call `setPresence(appId, deviceId, connectionId)`
  - Emit to admin: `adminNs.to(\`app:${appId}\`).emit('session:connect', {...})`
- On client disconnect:
  - Call `unregisterSession(appId, deviceId, connectionId)`
  - Call `removePresence(appId, deviceId, connectionId)`
  - Emit to admin: `adminNs.to(\`app:${appId}\`).emit('session:disconnect', {...})`
- **Acceptance:** Presence/session updated on connect/disconnect, admin receives events, typecheck passes

#### Task 1.12: Create Broadcast Helper Functions
- Implement `broadcastToConversation(conversationId, event, data)`:
  - `clientNs.to(\`conversation:${conversationId}\`).emit(event, data)`
  - `adminNs.to(\`conversation:${conversationId}\`).emit(event, data)`
- Implement `broadcastAgentTyping(conversationId, isTyping)`:
  - Call `broadcastToConversation` with `agent:typing` event
- Export both functions
- **Acceptance:** Functions exported, broadcasts to both namespaces, typecheck passes

#### Task 1.13: Update Message Service
- **File:** `backend/src/services/messageService.ts`
- Import `broadcastToConversation` from socketService
- Change broadcast call to: `broadcastToConversation(conversationId, 'message:new', formattedMessage)`
- Remove old websocketService import for broadcasting
- **Acceptance:** Messages broadcast via Socket.IO, typecheck passes

#### Task 1.14: Update Server Initialization
- **File:** `backend/src/index.ts`
- Import `initSocketIO` and `gracefulShutdown` from socketService
- Call `await initSocketIO(server)` after `createServer`
- Update graceful shutdown to call Socket.IO gracefulShutdown
- Update console.log to show: `ws://localhost:${port}/v1/socket.io`
- **Acceptance:** Socket.IO starts on correct path, graceful shutdown works, build passes

**Phase 1 Deliverables:**
- ✅ Socket.IO backend fully functional
- ✅ Client authentication working
- ✅ Presence multi-connection bug fixed
- ✅ Session registry in Redis
- ✅ Integration with existing message service
- ✅ All tests passing: `pnpm test`, `pnpm typecheck`, `pnpm build`

---

### Phase 2: SDK Socket.IO Protocol Implementation (Day 2)

**Objectives:**
- Implement custom Socket.IO protocol parser
- Create SocketIOClient with full event handling
- Update ConnectionManager and SyncManager
- Ensure Android and iOS platforms supported

**Tasks:**

#### Task 2.1: Create Socket.IO Packet Types
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOPacket.kt` (new)
- Define `SocketIOPacketType` enum: CONNECT(0), DISCONNECT(1), EVENT(2), ACK(3), CONNECT_ERROR(4), BINARY_EVENT(5), BINARY_ACK(6)
- Define `SocketIOPacket` data class: `type`, `namespace`, `data: JsonElement?`, `ackId: Int?`
- Define `SocketIOConnectionState` enum: DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING
- **Acceptance:** All types defined, project compiles

#### Task 2.2: Create Socket.IO Event Types
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOEvent.kt` (new)
- Create sealed class `SocketIOEvent`:
  - `object Connected`
  - `object Disconnected`
  - `data class ConnectionEstablished(connectionId: String)`
  - `data class MessageNew(data: JsonObject)`
  - `data class AgentTyping(conversationId: String, isTyping: Boolean)`
  - `data class ConversationJoined(conversationId: String, lastMessageId: String?)`
  - `data class ServerShutdown(reconnectDelayMs: Long)`
  - `data class Error(code: String, message: String?)`
- **Acceptance:** All server events represented, project compiles

#### Task 2.3: Implement Socket.IO Packet Parser
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOParser.kt` (new)
- Implement `parseEnginePacket(text: String): Pair<Char, String>` - splits Engine type from payload
- Implement `parseSocketIOPacket(data: String): SocketIOPacket?`:
  - Extract type digit
  - Parse namespace if starts with '/'
  - Parse ack ID if digits before data
  - Parse JSON data
  - Return SocketIOPacket or null on malformed input
- Implement `encodeEvent(namespace, event, data, ackId?)`:
  - Format: `"42/namespace,[\"event\",{data}]"` or with ackId: `"42/namespace,123[\"event\",{data}]"`
- Implement `encodeConnect(namespace, auth)`:
  - Format: `"0/namespace,{\"auth\":{...}}"`
- **Acceptance:** All packet types parsed/encoded correctly, handles malformed input gracefully, project compiles

#### Task 2.4: Implement SocketIOClient Core
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOClient.kt` (new)
- Constructor: `appId`, `apiKey`, `deviceId`, `baseUrl`
- Properties:
  - HttpClient with WebSockets
  - `scope: CoroutineScope`
  - `session: ClientWebSocketSession?`
  - `connectionJob: Job?`
  - `pingJob: Job?`
- Flows:
  - `_events: MutableSharedFlow<SocketIOEvent>`
  - `_connectionState: MutableStateFlow<SocketIOConnectionState>`
- Channel:
  - `outgoing: Channel<String>` for queued messages
- Implement `connect()` suspend function:
  - Build URL: `baseUrl + /v1/socket.io/?EIO=4&transport=websocket`
  - Open WebSocket connection
  - Send connect packet with auth
  - Start ping loop (send "2" every 25s)
  - Process incoming frames in loop
  - Handle disconnect
- Implement `disconnect()` suspend function
- Implement `close()` function
- **Acceptance:** WebSocket connects, sends connect packet, ping loop runs, typecheck passes

#### Task 2.5: Implement SocketIOClient Frame Handling
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOClient.kt`
- Add `handleFrame(text: String)` function:
  - Check first char for Engine.IO type:
    - '0': Engine open (config)
    - '2': Engine ping (ignore)
    - '3': Engine pong received
    - '4': Socket.IO packet → delegate to `handleSocketIOPacket`
- Add `handleSocketIOPacket(data: String)` function:
  - Parse packet
  - Switch on `packet.type`:
    - CONNECT: update state to CONNECTED, emit Connected event
    - DISCONNECT: update state, emit Disconnected
    - EVENT: call `handleEvent(packet)`
    - ACK: call `handleAck(packet)`
    - CONNECT_ERROR: emit Error event
- **Acceptance:** All packet types handled, events emitted, typecheck passes

#### Task 2.6: Implement SocketIOClient Event Dispatching
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOClient.kt`
- Add `handleEvent(packet: SocketIOPacket)` function:
  - Extract event array from `packet.data`
  - Get event name from array[0]
  - Get event data from array[1]
  - Switch on event name:
    - `'connected'`: emit `ConnectionEstablished`
    - `'message:new'`: emit `MessageNew`
    - `'agent:typing'`: emit `AgentTyping`
    - `'conversation:joined'`: emit `ConversationJoined`
    - `'server:shutdown'`: emit `ServerShutdown`
    - `'error'`: emit `Error`
    - `'pong'`: ignore
- **Acceptance:** Events converted to sealed classes, unknown events ignored, typecheck passes

#### Task 2.7: Implement SocketIOClient ACK Handling
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOClient.kt`
- Add properties:
  - `ackCounter: AtomicInt`
  - `pendingAcks: ConcurrentHashMap<Int, CompletableDeferred<JsonElement?>>`
- Add `handleAck(packet: SocketIOPacket)` function:
  - Get ackId from packet
  - Find and complete pending deferred
- Add `emitWithAck(event, data): Result<JsonElement?>` suspend function:
  - Increment ackCounter
  - Create CompletableDeferred and store
  - Encode and send packet with ackId
  - `withTimeout(10_000)` await the deferred
  - Return success/failure result
  - Clean up pending ack on timeout/error
- **Acceptance:** Acks matched by ID, timeout after 10 seconds, result returned, typecheck passes

#### Task 2.8: Implement SocketIOClient Public API
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOClient.kt`
- Add `emit(event: String, data: JsonObject)` private suspend function
- Implement:
  - `joinConversation(conversationId: String): Result<String?>` - uses emitWithAck, returns last_message_id
  - `leaveConversation(conversationId: String)` - uses emit
  - `startTyping(conversationId: String)` - uses emit
  - `stopTyping(conversationId: String)` - uses emit
- **Acceptance:** All public methods work, joinConversation returns last_message_id, events properly encoded, typecheck passes

#### Task 2.9: Update NetworkConfig
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/config/NetworkConfig.kt`
- Update `DEFAULT_WS_URL` to use Socket.IO path: `wss://api.replyhq.dev/v1/socket.io`
- Update `localhost()` function to return: `ws://host:port/v1/socket.io`
- Add constant: `SOCKET_IO_PATH = '/v1/socket.io'`
- **Acceptance:** Default URLs point to Socket.IO, localhost helper updated, typecheck passes

#### Task 2.10: Update ConnectionManager
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/core/ConnectionManager.kt`
- Change constructor from `RealtimeClient` to `SocketIOClient`
- Update state mapping: `SocketIOConnectionState` to `ConnectionState`
- Update events flow to use `SocketIOClient.events`
- Handle `ServerShutdown` event: schedule reconnect after `reconnectDelayMs`
- Simplify reconnection logic (Socket.IO handles most of it)
- Update `setActiveConversation()` to call `socketClient.joinConversation()`
- **Acceptance:** Uses SocketIOClient, server shutdown triggers delayed reconnect, typecheck passes

#### Task 2.11: Update SyncManager Event Handling
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/core/SyncManager.kt`
- Update event collection to handle `SocketIOEvent` sealed class:
  - `MessageNew`: convert JsonObject to Message, handle as before
  - `AgentTyping`: emit to agentTypingEvents flow
  - `ConversationJoined`: store lastMessageId for cursor sync
  - `ServerShutdown`: log, let ConnectionManager handle reconnect
  - `Error`: log error
- Add `lastKnownMessageId` property for cursor-based sync
- Update `fetchMissedMessages()` to use cursor if available
- **Acceptance:** All SocketIOEvent types handled, typing events emitted, typecheck passes

#### Task 2.12: Update ChatSDKInitializer
- **Files:**
  - `sdk/src/commonMain/kotlin/dev/replyhq/sdk/ChatSDK.kt`
  - `sdk/src/androidMain/kotlin/.../ChatSDKInitializer.kt` (if exists)
  - `sdk/src/iosMain/kotlin/.../ChatSDKInitializer.kt` (if exists)
- Update `createConnectionManager()`:
  - Create `SocketIOClient` with appId, apiKey, deviceId, websocketUrl
  - Create `ConnectionManager` with SocketIOClient
  - Remove RealtimeClient creation
- Ensure platform-specific initializers updated
- **Acceptance:** SDK initializes with SocketIOClient, all targets compile

**Phase 2 Deliverables:**
- ✅ Complete Socket.IO protocol implementation
- ✅ SocketIOClient fully functional
- ✅ ConnectionManager and SyncManager updated
- ✅ SDK compiles for all targets (Android, iOS, etc.)
- ✅ All typecheck and build passes

---

### Phase 3: Admin Integration & Testing (Day 3)

**Objectives:**
- Implement admin namespace handlers
- Complete broadcast integration
- Write comprehensive tests
- Verify multi-connection scenarios

**Tasks:**

#### Task 3.1: Implement Admin Authentication
- **File:** `backend/src/services/socketService.ts`
- Add `adminNs.use()` middleware:
  - Extract `app_id`, `admin_token` from `socket.handshake.auth`
  - Validate parameters present
  - Validate app exists and `admin_token` is valid (for now, match apiKey)
  - Set `socket.data` with `appId`, `connectionId`, `subscribedConversations` (empty Set)
  - Note: Future separate admin tokens from client API keys
- **Acceptance:** Admin connections authenticated, socket.data populated, invalid credentials rejected, typecheck passes

#### Task 3.2: Implement Admin Connection Handler
- **File:** `backend/src/services/socketService.ts`
- On connection event:
  - Log admin connection
  - Emit `connected` event
  - Auto-join app room: `socket.join(\`app:${appId}\`)`
  - Register event handlers: `app:subscribe`, `conversation:join`, `message:send`, `typing:start`, `typing:stop`, `sessions:list`, `ping`, `disconnect`
- **Acceptance:** Admin joins app room on connect, all event handlers registered, typecheck passes

#### Task 3.3: Implement Admin Sessions List Handler
- **File:** `backend/src/services/socketService.ts`
- Handle `sessions:list` event:
  - Extract `app_id` from data
  - Validate `app_id` matches `socket.data.appId`
  - Call `getActiveSessions(appId)`
  - Return via ack: `{ sessions: [...] }`
- Session data should include: `connectionId`, `deviceId`, `connectedAt`, `userInfo` (if available)
- **Acceptance:** Returns all active sessions, works across nodes, typecheck passes

#### Task 3.4: Implement Admin Message Send Handler
- **File:** `backend/src/services/socketService.ts`
- Handle `message:send` event:
  - Extract `conversation_id`, `body`, `local_id` from data
  - Validate conversation belongs to admin's app
  - Call `createMessage()` with `sender='agent'`
  - Return via ack: `{ success: true, message: {...} }` or `{ success: false, error: '...' }`
- Message broadcast to conversation via existing messageService logic
- **Acceptance:** Admin can send messages, messages created with sender='agent', broadcast works, ack returned, typecheck passes

#### Task 3.5: Implement Admin Typing Handlers
- **File:** `backend/src/services/socketService.ts`
- Handle `typing:start` and `typing:stop` events:
  - Validate conversation belongs to admin's app
  - Call `broadcastAgentTyping(conversationId, isTyping)`
- Agent typing broadcasts to client namespace only
- **Acceptance:** Admin typing broadcasts to clients, typecheck passes

#### Task 3.6: Implement Admin Conversation Join Handler
- **File:** `backend/src/services/socketService.ts`
- Handle `conversation:join` event:
  - Validate conversation exists and belongs to admin's app
  - Join room: `socket.join(\`conversation:${conversationId}\`)`
  - Add to `socket.data.subscribedConversations`
  - Emit `conversation:joined` with `last_message_id`
  - Return ack
- **Acceptance:** Admin can subscribe to any conversation in their app, receives realtime updates, typecheck passes

#### Task 3.7: Write Backend Integration Tests
- **File:** `backend/src/services/socketService.test.ts` (new)
- Test scenarios:
  - Client connection with valid/invalid credentials
  - Conversation join/leave
  - Message broadcast to room members
  - Multi-connection presence (connect 2, disconnect 1, still online)
  - Admin session listing
  - Admin message sending
  - Typing indicators both directions
- Use `socket.io-client` for test connections
- Mock Redis for unit tests or use test Redis
- **Acceptance:** All critical paths tested, tests pass: `pnpm test`, typecheck passes

#### Task 3.8: End-to-End Integration Test
- **File:** `backend/src/e2e/socketio.e2e.test.ts` (new)
- Test full flow:
  1. Start backend server
  2. Connect SDK client (simulated or real)
  3. Send message via REST API
  4. Verify message received via Socket.IO
  5. Send typing indicator
  6. Verify typing broadcast
  7. Disconnect and verify presence updates
  8. Reconnect after server:shutdown simulation
- Document manual test steps if automated not feasible
- **Acceptance:** Full flow tested, reconnection works, typecheck passes

**Phase 3 Deliverables:**
- ✅ Admin namespace fully functional
- ✅ Comprehensive integration tests
- ✅ E2E test covering full client-server flow
- ✅ Multi-connection scenarios verified
- ✅ All tests passing: `pnpm test`

---

### Phase 4: Polish, Metrics & Production Readiness (Day 4)

**Objectives:**
- Add metrics and structured logging
- Implement rate limiting
- Deprecate old implementations
- Update documentation
- Final testing and validation

**Tasks:**

#### Task 4.1: Deprecate Old Websocket Service
- **File:** `backend/src/services/websocketService.ts`
- Add `@deprecated` JSDoc to all exports
- Update any remaining imports to use socketService
- Keep functional for backward compatibility
- Add console.warn on initWebSocket: `'websocketService is deprecated, use socketService'`
- Update README with migration notes
- **Acceptance:** Deprecation warnings in place, no active usage for new features, documentation updated, typecheck passes

#### Task 4.2: Deprecate Old RealtimeClient in SDK
- **File:** `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/RealtimeClient.kt`
- Add `@Deprecated` annotation
- Add deprecation message pointing to SocketIOClient
- Keep functional for external usage
- Update SDK README with migration notes
- **Acceptance:** Deprecation annotation in place, documentation updated, project compiles

#### Task 4.3: Add Connection Metrics and Logging
- **File:** `backend/src/services/socketService.ts`
- Add metrics tracking:
  - `connection_count` (gauge)
  - `connections_total` (counter by namespace)
  - `disconnections_total` (counter by reason)
  - `messages_sent_total` (counter)
  - `messages_received_total` (counter)
- Add structured logging with fields:
  - `connectionId`, `appId`, `deviceId` on all connection logs
  - `conversationId` on message/typing logs
  - `reason` on disconnect logs
- Export `getConnectionCount()` function
- **Acceptance:** Metrics exported, logs include correlation IDs, typecheck passes

#### Task 4.4: Implement Rate Limiting
- **File:** `backend/src/services/socketService.ts` and `backend/src/middleware/rateLimiter.ts`
- Add connection rate limiting:
  - Max connections per IP: 10/minute
  - Max connections per device: 5 concurrent
- Add message rate limiting:
  - Max messages per connection: 60/minute
  - Max typing events per connection: 10/minute
- Use Redis for distributed rate limiting
- Emit `error` event with code `RATE_LIMITED` when exceeded
- Disconnect repeat offenders
- **Acceptance:** Rate limits enforced, Redis used for consistency, graceful error messaging, typecheck passes

#### Task 4.5: Update Deployment Documentation
- **Files:** `backend/README.md`, deployment docs
- Document new WebSocket endpoint: `/v1/socket.io`
- Document sticky sessions recommendation for load balancers
- Document Redis requirements for multi-node
- Document environment variables if any new ones added
- Add troubleshooting section for common Socket.IO issues
- **Acceptance:** Clear deployment instructions, load balancer configuration documented, Redis requirements documented

#### Task 4.6: Final Integration Validation
- Verify all components working together:
  - Backend Socket.IO service running
  - SDK can connect and authenticate
  - Messages deliver in real-time
  - Presence tracking works correctly
  - Admin can see sessions and send messages
  - Graceful reconnection works
  - Rate limiting enforced
  - Metrics being recorded
- Run full test suite: `pnpm test`
- Run build: `pnpm build` (backend), SDK compile (all targets)
- **Acceptance:** All systems operational, tests passing, builds passing

**Phase 4 Deliverables:**
- ✅ Production-ready metrics and logging
- ✅ Rate limiting in place
- ✅ Deprecation notices added
- ✅ Documentation updated
- ✅ All tests passing
- ✅ Production deployment ready

---

## Critical Implementation Details

### Socket.IO Authentication Handshake

```typescript
// Client connects with auth payload
const socket = io('wss://api.replyhq.dev/v1/socket.io', {
  auth: {
    app_id: 'app_abc123',
    device_id: 'dev_xyz789',
    api_key: 'key_secret',
  },
  transports: ['websocket'],
})

// Backend middleware validates
ns.use((socket, next) => {
  const { app_id, device_id, api_key } = socket.handshake.auth

  // Validation steps
  if (!app_id || !device_id || !api_key) {
    return next(new Error('MISSING_PARAMS'))
  }

  const app = await prisma.app.findUnique({ where: { id: app_id } })
  if (!app || app.apiKey !== api_key) {
    return next(new Error('INVALID_CREDENTIALS'))
  }

  socket.data = {
    appId: app_id,
    deviceId: device_id,
    connectionId: generateConnectionId(),
  }
  next()
})
```

### Multi-Connection Presence Bug Fix

**Current Bug:**
```typescript
// WRONG: Device with 2 connections, close 1 → shows offline
presence:device:{appId}:{deviceId} = true
// When connection closes: delete key → device offline (even though 1 connection still exists)
```

**Fix:**
```typescript
// CORRECT: Track each connection, aggregate to device
presence:conn:conn_123 = { TTL, auto-expires }
presence:conn:conn_456 = { TTL, auto-expires }
presence:device:{appId}:{deviceId} = SET[conn_123, conn_456]

// Only broadcast online if SET size goes 0 → 1
// Only broadcast offline if SET size goes 1 → 0
```

### Packet Format Examples

**Engine.IO Layer** (underlying transport)
```
0 = CONNECT
2 = PING
3 = PONG
4 = MESSAGE

Examples:
"0/namespace,{auth}"  = Engine connect
"2"                   = Engine ping
"4message_data"       = Engine message
```

**Socket.IO Layer** (on top of Engine MESSAGE)
```
Format: [type][namespace],[ackId?][data]

0 = CONNECT
1 = DISCONNECT
2 = EVENT (most common)
3 = ACK (response)
4 = CONNECT_ERROR
5 = BINARY_EVENT
6 = BINARY_ACK

Examples:
"0/admin,{\"auth\":{...}}"              = Connect to /admin
"2/client,[\"message:new\",{...}]"      = Event with no ack
"2/client,42,[\"result\",{...}]"        = Event expecting ack 42
"3/client,42[\"ok\"]"                   = Response to ack 42
```

### Message Delivery Flow

```
1. User sends message via SDK
   → SyncManager queues locally with localId
   → Sends to REST API or WebSocket (depending on connection state)

2. Backend receives message
   → Validates idempotency (upserts by localId)
   → Creates message in database
   → Broadcasts via Socket.IO: broadcastToConversation('message:new', {...})

3. All clients in conversation room receive
   → Parse message
   → Check if already in local DB (by localId)
   → If new: insert, emit newMessages flow, update UI

4. Admin receives same message (in admin namespace)
   → Parse message
   → Update admin dashboard
```

### Reconnection on Server Shutdown

```
1. Server receives SIGTERM/SIGINT
2. Call gracefulShutdown()
   → Emit to all connected clients: { type: 'server:shutdown', reconnect_delay_ms: 5000 }
   → Stop accepting new connections
   → Give existing connections 10s to finish operations

3. Clients receive server:shutdown
   → Close connection
   → Schedule reconnect after reconnect_delay_ms
   → On reconnect: auto-subscribe to conversation again

4. Server closes HTTP server
```

---

## Testing Strategy

### Unit Tests

**Backend:**
- Socket.IO packet encoding/decoding
- Presence multi-connection logic
- Message deduplication (localId)
- Rate limiting algorithms
- Session registry operations

**SDK:**
- SocketIOPacket parsing (all packet types)
- SocketIOEvent sealed class conversion
- ACK handling with timeout
- Reconnection backoff logic

### Integration Tests

**Backend:**
- Client auth (valid/invalid credentials)
- Conversation join/leave with room management
- Message broadcast to multiple subscribers
- Multi-connection presence (connect 2, close 1, verify still online)
- Admin session listing
- Admin message sending
- Typing indicators (client and admin)

**SDK:**
- Connect to backend and authenticate
- Join conversation
- Receive real-time message
- Send typing indicator
- Handle server shutdown and reconnect

### End-to-End Tests

1. **Happy Path:**
   - SDK connects and authenticates
   - Sends message via REST API
   - Receives message via Socket.IO
   - Admin dashboard receives and can send message

2. **Resilience:**
   - Network disconnection → automatic reconnect
   - Server shutdown → graceful client disconnect + delayed reconnect
   - Multi-device send → messages ordered by timestamp

3. **Scale:**
   - 100+ concurrent connections
   - 10+ messages per second
   - Presence updates scale (hundreds of devices)

---

## Risk Assessment & Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| No official Socket.IO KMP client | SDK implementation complex | High | Use provided spec, implement custom parser incrementally, test thoroughly |
| Multi-connection presence still buggy | Incorrect online status | Medium | Implement fix first (Phase 1.9), extensive test coverage |
| Packet format misalignment | Client-server desync | Low | Protocol spec well-documented, test with real backend |
| Redis adapter not available | Single-node bottleneck | Low | Graceful fallback to local-only, warn in logs |
| Rate limiting too aggressive | Legitimate users blocked | Low | Conservative limits (60 msg/min), monitoring + adjustment |
| Backward compatibility break | Existing clients break | Medium | Deprecate old service gracefully, maintain for 1 release |

---

## Success Metrics

- **Functional:**
  - ✅ SDK connects via Socket.IO
  - ✅ Messages deliver < 500ms latency
  - ✅ Presence accurate (multi-connection case)
  - ✅ Admin can send/receive messages

- **Reliability:**
  - ✅ 99.5% connection uptime (test)
  - ✅ Auto-reconnect on network change
  - ✅ Graceful server shutdown
  - ✅ No message loss (idempotency)

- **Performance:**
  - ✅ 10K+ concurrent connections per node
  - ✅ 5K+ messages/sec throughput
  - ✅ < 100ms p95 message latency

- **Quality:**
  - ✅ 90%+ test coverage (critical paths)
  - ✅ All integration tests passing
  - ✅ E2E tests covering full workflow
  - ✅ No memory leaks (connection cleanup)

---

## Rollout & Monitoring

### Pre-Deployment Checklist

- [ ] All phase 1-4 tasks completed
- [ ] Backend: `pnpm test && pnpm typecheck && pnpm build` ✅
- [ ] SDK: Compiles for Android, iOS, etc. ✅
- [ ] E2E tests passing locally ✅
- [ ] Metrics dashboard configured ✅
- [ ] Rate limits tuned and tested ✅
- [ ] Documentation updated ✅

### Deployment Steps

1. **Canary (5% traffic):**
   - Deploy backend with Socket.IO alongside old ws service
   - Monitor metrics: connection_count, error_rate, latency
   - If stable for 1 hour → proceed to Stage

2. **Stage (50% traffic):**
   - Deploy SDK with SocketIOClient to beta users
   - Monitor: reconnection frequency, message delivery time
   - If stable for 2 hours → proceed to Prod

3. **Production (100% traffic):**
   - Deploy SDK to all users
   - Monitor for 24 hours
   - Keep old ws service running for 1 week (fallback)

### Monitoring & Alerts

**Metrics to Watch:**
- `connection_count` → Alert if > 50% drop
- `message_latency_p95` → Alert if > 1s
- `error_rate` → Alert if > 1%
- `reconnection_frequency` → Alert if > 10/min per device

**Logs to Review:**
- Auth failures (invalid credentials)
- Rate limit hits (potential attacks)
- Presence flaps (device online/offline churn)
- Connection drops (network issues)

---

## Deliverables Summary

### Backend
- ✅ `/src/types/socket.ts` - Socket.IO type definitions
- ✅ `/src/services/socketService.ts` - Main Socket.IO service (39 tasks)
- ✅ `/src/services/presenceService.ts` - Updated multi-connection tracking
- ✅ `/src/services/socketService.test.ts` - Integration tests
- ✅ `package.json` - Dependencies added

### SDK
- ✅ `/src/.../data/remote/SocketIOPacket.kt` - Packet types
- ✅ `/src/.../data/remote/SocketIOEvent.kt` - Event sealed classes
- ✅ `/src/.../data/remote/SocketIOParser.kt` - Protocol parser
- ✅ `/src/.../data/remote/SocketIOClient.kt` - Main client implementation
- ✅ `/src/.../core/ConnectionManager.kt` - Updated integration
- ✅ `/src/.../core/SyncManager.kt` - Updated event handling
- ✅ `/src/.../config/NetworkConfig.kt` - Updated URL config
- ✅ `/src/.../ChatSDK.kt` - Updated initialization

### Documentation
- ✅ `backend/README.md` - Deployment and troubleshooting
- ✅ `sdk/README.md` - Migration guide (old → new)
- ✅ `/docs/plans/this-file.md` - Implementation plan (you are here)

---

## Implementation Decisions

Based on your clarification:

### ✅ Admin Token Strategy: Same as Client API Key (for now)
- Use existing `apiKey` for both client and admin authentication
- Simpler to implement, no new token system required
- Future improvement: Separate admin tokens when needed
- Note: Document this as a future security enhancement

### ✅ Rate Limiting: Review & Adjust During Implementation
- Start with proposed limits:
  - 60 messages/min per device
  - 10 typing events/min per device
  - 5 concurrent connections per device
  - 10 connection attempts/min per IP
- Monitor real usage in Phase 3 testing
- Adjust before Phase 4 production deployment
- Log rate limit hits for visibility

### ✅ Redis Availability: Implement with Graceful Fallback
- Redis is optional but highly recommended for multi-node
- Build graceful degradation:
  - WITH Redis: Full cross-server broadcasting, session registry
  - WITHOUT Redis: Single-node only, in-memory tracking
- Add health checks and fallback to local-only mode
- Log warnings when Redis unavailable
- Document operational decision: Redis required or optional?

### ✅ Message Sync: Cursor-Based (Recommended)
- Implement cursor-based sync using `last_message_id` from Socket.IO
- On `conversation:join`, server returns `last_message_id`
- Client stores this cursor locally
- On reconnect: Use cursor for pagination (`after_message_id`)
- More robust than timestamp (no clock skew)
- Future: Add `after_message_id` query param to GET /messages endpoint

---

## Next Steps

Once this plan is approved:

1. **Review & Clarify** - Ask any questions above
2. **Start Phase 1** - Backend Socket.IO setup (Day 1)
3. **Start Phase 2** - SDK protocol implementation (Day 2)
4. **Start Phase 3** - Admin integration & testing (Day 3)
5. **Start Phase 4** - Polish & production readiness (Day 4)
6. **Deploy** - Canary → Stage → Production
7. **Monitor** - 24-hour post-deployment monitoring

---

**Plan Created:** 2026-01-24
**Prepared for:** Socket.IO Realtime Chat Implementation
**Status:** ⏳ Awaiting approval and clarification on questions above
