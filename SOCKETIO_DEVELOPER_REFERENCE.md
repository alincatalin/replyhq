# Socket.IO Developer Reference Guide

**Quick Reference for developers implementing or maintaining Socket.IO features**

---

## Quick Start: Adding a New Socket Event

### Adding a Server Event Handler

**1. Define the event in backend/src/services/socketService.ts:**

```typescript
socket.on('my:event', (data: MyEventData) => {
  handleMyEvent(socket, data);
});
```

**2. Implement the handler:**

```typescript
async function handleMyEvent(socket: ClientSocket, data: MyEventData) {
  const { appId, deviceId } = socket.data;

  try {
    // 1. Validate
    if (!data.required_field) {
      socket.emit('error', {
        code: 'INVALID_DATA',
        message: 'required_field is required'
      });
      return;
    }

    // 2. Process
    const result = await processEvent(appId, deviceId, data);

    // 3. Broadcast to clients
    clientNs.to(`conversation:${data.conversation_id}`).emit('event:result', result);

    // 4. Broadcast to admins
    adminNs.to(`conversation:${data.conversation_id}`).emit('event:result', result);

  } catch (error) {
    socket.emit('error', {
      code: 'EVENT_FAILED',
      message: (error as Error).message
    });
  }
}
```

**3. Add the event to TypeScript types (backend/src/types/socket.ts):**

```typescript
interface ClientToServerEvents {
  'my:event': (data: MyEventData) => void;
}

interface ServerToClientEvents {
  'event:result': (data: MyEventResult) => void;
}

interface MyEventData {
  conversation_id: string;
  required_field: string;
  optional_field?: string;
}

interface MyEventResult {
  success: boolean;
  data?: any;
}
```

**4. Add test:**

```typescript
describe('my:event', () => {
  test('should handle valid event', async () => {
    const { client, server } = await setupConnection();

    client.emit('my:event', {
      conversation_id: 'conv_1',
      required_field: 'test'
    });

    // Wait for response
    const result = await new Promise((resolve) => {
      client.once('event:result', resolve);
    });

    expect(result.success).toBe(true);
  });

  test('should reject invalid event', async () => {
    const { client } = await setupConnection();

    client.emit('my:event', {
      conversation_id: 'conv_1'
      // missing required_field
    });

    const error = await new Promise((resolve) => {
      client.once('error', resolve);
    });

    expect(error.code).toBe('INVALID_DATA');
  });
});
```

---

### Adding a Client Event Handler (SDK)

**1. Define the event in SDK (SocketIOEvent.kt):**

```kotlin
sealed class SocketIOEvent {
  // ... existing events ...
  data class MyEvent(val conversationId: String, val data: JsonObject) : SocketIOEvent()
}
```

**2. Parse the event in SocketIOClient (handleEvent function):**

```kotlin
when (eventName) {
  // ... existing events ...
  "my:event" -> {
    val conversationId = eventData?.jsonObject?.get("conversation_id")?.jsonPrimitive?.content
    if (conversationId != null) {
      _events.emit(SocketIOEvent.MyEvent(conversationId, eventData.jsonObject))
    }
  }
}
```

**3. Handle in SyncManager:**

```kotlin
when (event) {
  // ... existing events ...
  is SocketIOEvent.MyEvent -> {
    handleMyEvent(event)
  }
}

private fun handleMyEvent(event: SocketIOEvent.MyEvent) {
  // Process the event
  // Update local database
  // Update UI state
}
```

**4. Add test:**

```kotlin
@Test
fun testMyEventReceived() = runTest {
  val client = SocketIOClient(appId, apiKey, deviceId, testUrl)

  val eventReceived = CompletableFuture<SocketIOEvent.MyEvent>()
  client.events
    .filterIsInstance<SocketIOEvent.MyEvent>()
    .onEach { eventReceived.complete(it) }
    .launchIn(this)

  // Simulate server sending event
  // (in real test: server sends via socket.emit)

  val event = eventReceived.await()
  assertEquals("conv_1", event.conversationId)
}
```

---

## Common Patterns

### Pattern 1: Request-Response with Acknowledgement

**Server Side:**
```typescript
socket.on('request:data', (data: RequestData, callback) => {
  // callback is the ack function provided by client
  callback({
    success: true,
    data: processedData
  });
});
```

**SDK Side:**
```kotlin
val result = socketClient.emitWithAck("request:data", buildJsonObject {
  put("param", "value")
})

when {
  result.isSuccess -> {
    val response = result.getOrNull()
    val success = response?.get("success")?.jsonPrimitive?.boolean
    // Handle response
  }
  result.isFailure -> {
    // Handle error
  }
}
```

### Pattern 2: Broadcasting to Room

**Single Broadcast:**
```typescript
// Send to everyone in room EXCEPT sender
socket.to(`conversation:${conversationId}`).emit('event', data);
```

**Dual Broadcast (Client + Admin):**
```typescript
// Send to both namespaces
clientNs.to(`conversation:${conversationId}`).emit('event', data);
adminNs.to(`conversation:${conversationId}`).emit('event', data);
```

**Broadcast from Other Service:**
```typescript
import { broadcastToConversation } from './socketService.js';

// In messageService.ts, after creating message:
broadcastToConversation(conversationId, 'message:new', {
  id: message.id,
  local_id: message.localId,
  conversation_id: conversationId,
  body: message.body,
  sender: message.sender,
  created_at: message.createdAt.toISOString(),
  status: message.status
});
```

### Pattern 3: Presence Tracking

**When Device Connects:**
```typescript
await presenceService.setPresence(appId, deviceId, connectionId);
```

**When Device Disconnects:**
```typescript
await presenceService.removePresence(appId, deviceId, connectionId);
```

**Check if Device is Online:**
```typescript
const isOnline = await presenceService.isOnline(appId, deviceId);
if (isOnline) {
  // Device has at least one active connection
}
```

**Get Connection Count:**
```typescript
const count = await presenceService.getActiveConnectionCount(appId, deviceId);
if (count > 1) {
  // Device has multiple connections
}
```

### Pattern 4: Room-Based Message Filtering

**Subscribe to Room:**
```typescript
socket.on('conversation:join', (data, ack) => {
  const { conversation_id } = data;

  // Leave old room
  if (socket.data.conversationId) {
    socket.leave(`conversation:${socket.data.conversationId}`);
  }

  // Join new room
  socket.data.conversationId = conversation_id;
  socket.join(`conversation:${conversation_id}`);

  ack({ success: true });
});
```

**Broadcast to Room Members Only:**
```typescript
clientNs.to(`conversation:${conversationId}`).emit('message:new', message);
// Only clients in this room receive it
// Other conversations don't see it
```

### Pattern 5: Error Handling

**Emit Error from Server:**
```typescript
socket.emit('error', {
  code: 'CONVERSATION_NOT_FOUND',
  message: 'The conversation does not exist'
});
```

**Handle Error on Client:**
```kotlin
when (event) {
  is SocketIOEvent.Error -> {
    when (event.code) {
      "CONVERSATION_NOT_FOUND" -> {
        showError("Conversation not found")
      }
      "INVALID_CREDENTIALS" -> {
        logout()  // Force re-authentication
      }
      else -> {
        showError("Unknown error: ${event.message}")
      }
    }
  }
}
```

---

## File Reference

### Backend Files

| File | Purpose |
|------|---------|
| `backend/src/services/socketService.ts` | Main Socket.IO server (700 lines) |
| `backend/src/types/socket.ts` | TypeScript type definitions |
| `backend/src/services/presenceService.ts` | Device presence tracking |
| `backend/src/tests/integration/socketIO.test.ts` | Core integration tests (22 tests) |
| `backend/src/tests/integration/e2e.test.ts` | End-to-end flow tests (18 tests) |
| `backend/src/tests/integration/multiConnection.test.ts` | Multi-connection tests (19 tests) |

### SDK Files

| File | Purpose |
|------|---------|
| `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOClient.kt` | Main client class (500 lines) |
| `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOPacket.kt` | Packet types and state |
| `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOEvent.kt` | Event sealed classes |
| `sdk/src/commonMain/kotlin/dev/replyhq/sdk/data/remote/SocketIOParser.kt` | Protocol parser (150 lines) |
| `sdk/src/commonMain/kotlin/dev/replyhq/sdk/core/ConnectionManager.kt` | Connection lifecycle |
| `sdk/src/commonMain/kotlin/dev/replyhq/sdk/core/SyncManager.kt` | Event handling |

---

## Debug Tips

### Enabling Socket.IO Debug Logging

```typescript
// In backend/src/index.ts
import debug from 'debug';

if (process.env.DEBUG === 'socket.io:*') {
  debug.enable('socket.io:*');
  console.log('Socket.IO debug logging enabled');
}
```

```bash
# Run with debug output
DEBUG=socket.io:* npm start
```

### Inspecting Socket.IO Namespaces

```typescript
// List all connected clients in a namespace
console.log(clientNs.sockets.sockets);
// → Map { socketId → Socket, ... }

// List all rooms and members
for (const [room, sockets] of clientNs.adapter.rooms) {
  console.log(`Room: ${room}, Members: ${sockets.size}`);
}

// Get connection count
console.log(`Total connections: ${io.engine.clientsCount}`);
```

### Testing Socket.IO Locally

```typescript
// Test with socket.io-client-v4
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/client', {
  auth: {
    app_id: 'test_app',
    device_id: 'test_device',
    api_key: 'test_key'
  }
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
});

socket.on('message:new', (data) => {
  console.log('Message received:', data);
});

socket.emit('conversation:join', {
  conversation_id: 'conv_123'
}, (response) => {
  console.log('Join response:', response);
});
```

### Checking Redis Presence

```bash
# List all presence keys
redis-cli KEYS "presence:*"

# Check device presence
redis-cli SCARD presence:device:{appId}:{deviceId}
# Returns: 0 (offline) or > 0 (online)

# List connections for device
redis-cli SMEMBERS presence:device:{appId}:{deviceId}
# Returns: [connectionId1, connectionId2, ...]

# Check connection TTL
redis-cli TTL presence:conn:{connectionId}
# Returns: seconds until expiry
```

### Monitoring Message Flow

```typescript
// In messageService.ts, add logging
export async function createMessage(data: CreateMessageInput) {
  const startTime = Date.now();

  const message = await prisma.message.create({
    data: {
      conversationId: data.conversationId,
      localId: data.localId,
      body: data.body,
      sender: data.sender,
    }
  });

  // Broadcast
  const broadcastStart = Date.now();
  broadcastToConversation(data.conversationId, 'message:new', {
    id: message.id,
    local_id: message.localId,
    conversation_id: message.conversationId,
    body: message.body,
    sender: message.sender,
    created_at: message.createdAt.toISOString(),
    status: 'sent'
  });

  console.log('Message created and broadcast', {
    messageId: message.id,
    conversationId: data.conversationId,
    dbTime: broadcastStart - startTime,
    broadcastTime: Date.now() - broadcastStart,
    totalTime: Date.now() - startTime
  });

  return message;
}
```

---

## Performance Optimization Tips

### 1. Batch Typing Events

**Problem:** Typing indicator fires on every keystroke (10-100/sec)

```kotlin
// BEFORE: Every keystroke
onTextChange { text ->
  socketClient.startTyping(conversationId)  // ❌ 100 per second
}

// AFTER: Debounced
private var typingJob: Job? = null

onTextChange { text ->
  typingJob?.cancel()
  if (!isTyping) {
    isTyping = true
    scope.launch {
      socketClient.startTyping(conversationId)  // ✅ Once
    }
  }

  typingJob = scope.launch {
    delay(3000)
    isTyping = false
    socketClient.stopTyping(conversationId)  // ✅ Once after 3s
  }
}
```

### 2. Optimize Message Payloads

**Problem:** Large message objects repeated in broadcast

```typescript
// ❌ Inefficient: Full message object
socket.emit('message:new', {
  id: 'msg_abc',
  local_id: 'uuid_xyz',
  conversation_id: 'conv_123',
  body: 'Hello world...',
  sender: 'user',
  created_at: '2026-01-24T...',
  status: 'sent',
  // ...more fields
});

// ✅ Efficient: Minimal required fields
socket.emit('message:new', {
  id: 'msg_abc',
  local_id: 'uuid_xyz',
  conversation_id: 'conv_123',
  body: 'Hello world...',
  sender: 'user',
  created_at: '2026-01-24T...'
});
```

### 3. Use Cursor Pagination

**Problem:** Fetching old messages by timestamp (clock-skew issues)

```typescript
// ❌ Inefficient: Timestamp-based
GET /conversations/conv_123/messages?since=2026-01-24T10:00:00Z
// Issues: Clock skew, gaps, duplicates

// ✅ Efficient: Cursor-based
GET /conversations/conv_123/messages?after=msg_abc123
// Returns: Messages created after msg_abc123
// Index: O(1) lookup
// No duplicates: ID is unique
```

### 4. Redis Connection Pooling

**Problem:** Creating new Redis connections per request

```typescript
// ✅ Reuse single connection throughout app
import { redis } from './lib/redis.js';

// redis is singleton, pooled internally
await redis.get('key');
await redis.sAdd('set', 'value');
```

### 5. Disable HTTP Polling

**Problem:** Socket.IO tries HTTP polling as fallback (slower)

```typescript
const io = new Server(server, {
  transports: ['websocket']  // ✅ Only WebSocket
  // Don't include 'polling'
});
```

---

## Testing Checklist

Before deploying Socket.IO changes:

```
[ ] Unit tests pass
    npm test

[ ] Type checking passes
    npm run typecheck

[ ] Can manually connect with socket.io-client
    - Open browser console
    - Connect to /v1/socket.io
    - Verify 'connected' event received

[ ] Multi-connection presence works
    - Open 2 browser tabs
    - Both connect
    - Close one tab
    - Device still shows online ✅
    - Close second tab
    - Device goes offline ✅

[ ] Message broadcast works
    - Connect client and admin
    - Client sends message via REST
    - Both client and admin namespaces receive via Socket.IO
    - Message appears in both consoles

[ ] Graceful shutdown works
    - Start server
    - Kill process (SIGTERM)
    - Clients receive 'server:shutdown' event
    - Clients reconnect after delay

[ ] Load test
    - 100+ concurrent connections
    - No memory leaks
    - Message latency < 500ms (p95)
    - Redis adapter functioning
```

---

## Troubleshooting Matrix

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Clients can't connect | Socket.IO not initialized | Check `initSocketIO()` called in index.ts |
| "INVALID_CREDENTIALS" error | Wrong app_id or api_key | Verify credentials in client config |
| Messages not broadcast | Event not emitted | Check `broadcastToConversation()` called |
| Device stays offline when should be online | Presence bug | Check per-connection tracking in Redis |
| Memory usage increasing | Connection leaks | Verify disconnect handler cleans up |
| Messages arrive out of order | Race condition | Add message ID ordering |
| High latency (> 1s) | Redis slow | Check Redis connection pool |
| Admin doesn't see sessions | Wrong namespace/room | Verify admin joins `app:{appId}` room |

---

## Code Review Questions

When reviewing Socket.IO changes, ask:

1. **Namespace Isolation:** Does this event work correctly with both `/client` and `/admin`?
2. **Multi-Connection:** Would this break if device has 2+ connections?
3. **Room Isolation:** Are messages scoped correctly (not leaking between conversations)?
4. **Error Handling:** Does the code gracefully handle disconnects/errors?
5. **Testing:** Are happy path AND error cases tested?
6. **Performance:** Is this event sent too frequently? Should it be debounced?
7. **Data Security:** Is the payload validated before processing?
8. **Idempotency:** Is this operation safe if the same request arrives twice?

---

## Useful Links

- Socket.IO Docs: https://socket.io/docs/v4/
- Socket.IO Protocol: https://socket.io/docs/v4/socket-io-protocol/
- Kotlin Multiplatform: https://kotlinlang.org/docs/multiplatform.html
- Ktor Client: https://ktor.io/docs/client-overview.html
- Redis Adapter: https://github.com/socketio/socket.io-redis-adapter

---

**Last Updated:** January 24, 2026
