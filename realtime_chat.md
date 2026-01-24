# Realtime Chat System — Socket.IO Migration PRD

## Executive Summary

Migrate from raw `ws` WebSocket implementation to **Socket.IO** for a more robust, scalable, and maintainable realtime chat system. This enables built-in rooms, acknowledgements, automatic reconnection, and simplified multi-node scaling via Redis adapter.

**Timeline:** 3-4 days  
**Risk Level:** Medium (requires SDK protocol adapter)  
**Dependencies:** None (can be done incrementally)

---

## Current State Analysis

### Backend (Node.js)
| Component | Implementation | Issues |
|-----------|----------------|--------|
| WebSocket Server | `ws` library | Manual room/subscription tracking |
| Multi-node scaling | Custom Redis pub/sub | No message acknowledgements |
| Heartbeat | Manual ping/pong + JSON ping | Dual mechanism (confusing) |
| Presence | Redis with TTL | Multi-connection bug |
| Admin separation | Separate WSS instance | Same API key as clients |

### SDK (Kotlin Multiplatform)
| Component | Implementation | Issues |
|-----------|----------------|--------|
| WebSocket Client | Ktor WebSockets | No official Socket.IO client for KMP |
| Reconnection | Custom ConnectionManager | Works but complex |
| Event handling | Manual JSON parsing | Missing event types |
| Message sync | Timestamp-based | Clock skew vulnerability |

### Files to Modify

**Backend:**
- `backend/src/services/websocketService.ts` → Replace with Socket.IO
- `backend/src/services/presenceService.ts` → Fix multi-connection bug
- `backend/src/lib/redis.ts` → Add Socket.IO adapter integration
- `backend/src/index.ts` → Initialize Socket.IO
- `backend/package.json` → Add dependencies

**SDK:**
- `sdk/.../data/remote/RealtimeClient.kt` → Implement Socket.IO protocol
- `sdk/.../data/remote/RealtimeModels.kt` → Update event models
- `sdk/.../core/ConnectionManager.kt` → Simplify (Socket.IO handles reconnect)
- `sdk/.../config/NetworkConfig.kt` → Add Socket.IO path

---

## Architecture Design

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐    ┌──────────────────┐    ┌────────────────┐ │
│  │ Mobile SDK (KMP) │    │  Web Dashboard   │    │  Admin Panel   │ │
│  │ Socket.IO Proto  │    │ Socket.IO Client │    │ Socket.IO JS   │ │
│  └────────┬─────────┘    └────────┬─────────┘    └───────┬────────┘ │
└───────────┼───────────────────────┼──────────────────────┼──────────┘
            │                       │                      │
            ▼                       ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      SOCKET.IO SERVER                                │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Namespace: /client                       │    │
│  │  • Device connections (mobile/web SDK)                       │    │
│  │  • Rooms: conversation:{id}                                  │    │
│  │  • Events: message:new, typing:start, typing:stop            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Namespace: /admin                        │    │
│  │  • Admin dashboard connections                               │    │
│  │  • Rooms: conversation:{id}, app:{id}                       │    │
│  │  • Events: session:connect, session:disconnect, presence     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                    Redis Adapter                              │  │
│  │  • Cross-node message broadcasting                            │  │
│  │  • Session registry (active connections)                      │  │
│  │  • Presence tracking                                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       DATA LAYER                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐              ┌─────────────────────────────┐   │
│  │   PostgreSQL    │              │          Redis              │   │
│  │   (Prisma)      │              │  • Pub/Sub (adapter)        │   │
│  │  • Messages     │              │  • Session registry         │   │
│  │  • Conversations│              │  • Presence (per-connection)│   │
│  │  • Users        │              │  • Rate limiting            │   │
│  └─────────────────┘              └─────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Socket.IO Event Protocol

#### Namespace: `/client` (SDK Connections)

**Client → Server Events:**
```typescript
// Authentication (on connect via handshake)
{
  auth: {
    app_id: string;
    device_id: string;
    api_key: string;
  }
}

// Join conversation room
socket.emit('conversation:join', { conversation_id: string }, ack)
// ack: { success: boolean, error?: string }

// Leave conversation room
socket.emit('conversation:leave', { conversation_id: string })

// Typing indicator
socket.emit('typing:start', { conversation_id: string })
socket.emit('typing:stop', { conversation_id: string })

// Ping (optional, Socket.IO handles this but we keep for compatibility)
socket.emit('ping')
```

**Server → Client Events:**
```typescript
// Connection established
socket.emit('connected', { 
  connection_id: string,
  server_time: number 
})

// New message in conversation
socket.emit('message:new', {
  id: string,
  local_id: string,
  conversation_id: string,
  body: string,
  sender: 'user' | 'agent' | 'system',
  created_at: string,
  status: string
})

// Agent typing indicator
socket.emit('agent:typing', { 
  conversation_id: string, 
  is_typing: boolean 
})

// Subscription confirmed
socket.emit('conversation:joined', { 
  conversation_id: string,
  last_message_id?: string  // For cursor-based sync
})

// Error
socket.emit('error', { 
  code: string, 
  message: string 
})

// Server shutdown warning
socket.emit('server:shutdown', { 
  message: string,
  reconnect_delay_ms: number 
})
```

#### Namespace: `/admin` (Dashboard Connections)

**Client → Server Events:**
```typescript
// Authentication
{
  auth: {
    app_id: string;
    admin_token: string;  // Different from client API key
  }
}

// Subscribe to app-wide events
socket.emit('app:subscribe', { app_id: string })

// Subscribe to specific conversation
socket.emit('conversation:join', { conversation_id: string }, ack)

// Send message as agent
socket.emit('message:send', { 
  conversation_id: string,
  body: string,
  local_id: string 
}, ack)
// ack: { success: boolean, message?: MessageResponse, error?: string }

// Agent typing
socket.emit('typing:start', { conversation_id: string })
socket.emit('typing:stop', { conversation_id: string })

// Query active sessions
socket.emit('sessions:list', { app_id: string }, ack)
// ack: { sessions: SessionInfo[] }
```

**Server → Client Events:**
```typescript
// All /client events plus:

// Session connected
socket.emit('session:connect', {
  app_id: string,
  device_id: string,
  connection_id: string,
  connected_at: string,
  user_info?: { user_id: string, name?: string }
})

// Session disconnected
socket.emit('session:disconnect', {
  app_id: string,
  device_id: string,
  connection_id: string,
  reason: string
})

// Presence change
socket.emit('presence:change', {
  app_id: string,
  device_id: string,
  is_online: boolean,
  active_connections: number
})

// User typing (from client)
socket.emit('user:typing', {
  conversation_id: string,
  device_id: string,
  is_typing: boolean
})
```

---

## Implementation Plan

### Phase 1: Backend Socket.IO Setup (Day 1)

#### 1.1 Install Dependencies
```bash
cd backend
pnpm add socket.io @socket.io/redis-adapter
pnpm add -D @types/socket.io
```

#### 1.2 Create Socket.IO Service

**New file: `backend/src/services/socketService.ts`**

```typescript
import { Server as HttpServer } from 'http';
import { Server, Socket, Namespace } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getPublisher, getSubscriber, isRedisReady } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';
import { generateConnectionId } from '../utils/ids.js';
import { 
  setPresence, 
  removePresence, 
  broadcastPresenceChange 
} from './presenceService.js';

// Types
interface ClientSocket extends Socket {
  data: {
    appId: string;
    deviceId: string;
    connectionId: string;
    conversationId?: string;
  };
}

interface AdminSocket extends Socket {
  data: {
    appId: string;
    connectionId: string;
    subscribedConversations: Set<string>;
  };
}

// State
let io: Server | null = null;
let clientNs: Namespace | null = null;
let adminNs: Namespace | null = null;

// Session registry in Redis
const SESSION_KEY_PREFIX = 'session:';
const SESSION_SET_PREFIX = 'sessions:app:';
const SESSION_TTL = 120; // 2 minutes, refreshed on heartbeat

export async function initSocketIO(server: HttpServer): Promise<Server> {
  io = new Server(server, {
    path: '/v1/socket.io',
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket'], // Disable polling for mobile SDK
  });

  // Redis adapter for multi-node
  if (isRedisReady()) {
    const pubClient = getPublisher();
    const subClient = getSubscriber();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('Socket.IO Redis adapter initialized');
  }

  // Initialize namespaces
  clientNs = io.of('/client');
  adminNs = io.of('/admin');

  setupClientNamespace(clientNs);
  setupAdminNamespace(adminNs);

  console.log('Socket.IO initialized');
  return io;
}

function setupClientNamespace(ns: Namespace) {
  // Authentication middleware
  ns.use(async (socket: ClientSocket, next) => {
    try {
      const { app_id, device_id, api_key } = socket.handshake.auth;

      if (!app_id || !device_id || !api_key) {
        return next(new Error('MISSING_PARAMS'));
      }

      const app = await prisma.app.findUnique({ where: { id: app_id } });
      if (!app || app.apiKey !== api_key) {
        return next(new Error('INVALID_CREDENTIALS'));
      }

      socket.data = {
        appId: app_id,
        deviceId: device_id,
        connectionId: generateConnectionId(),
      };

      next();
    } catch (err) {
      next(new Error('AUTH_ERROR'));
    }
  });

  ns.on('connection', async (socket: ClientSocket) => {
    const { appId, deviceId, connectionId } = socket.data;
    console.log('Client connected', { connectionId, appId, deviceId });

    // Register session
    await registerSession(appId, deviceId, connectionId);
    await setPresence(appId, deviceId, connectionId);
    
    // Notify admin namespace
    adminNs?.to(`app:${appId}`).emit('session:connect', {
      app_id: appId,
      device_id: deviceId,
      connection_id: connectionId,
      connected_at: new Date().toISOString(),
    });

    // Send connection confirmation
    socket.emit('connected', {
      connection_id: connectionId,
      server_time: Date.now(),
    });

    // Auto-subscribe to latest conversation
    await autoSubscribeToConversation(socket);

    // Event handlers
    socket.on('conversation:join', async (data, ack) => {
      await handleConversationJoin(socket, data.conversation_id, ack);
    });

    socket.on('conversation:leave', (data) => {
      handleConversationLeave(socket, data.conversation_id);
    });

    socket.on('typing:start', (data) => {
      handleTyping(socket, data.conversation_id, true);
    });

    socket.on('typing:stop', (data) => {
      handleTyping(socket, data.conversation_id, false);
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });

    socket.on('disconnect', async (reason) => {
      console.log('Client disconnected', { connectionId, reason });
      await unregisterSession(appId, deviceId, connectionId);
      await removePresence(appId, deviceId, connectionId);
      
      adminNs?.to(`app:${appId}`).emit('session:disconnect', {
        app_id: appId,
        device_id: deviceId,
        connection_id: connectionId,
        reason,
      });
    });
  });
}

async function handleConversationJoin(
  socket: ClientSocket, 
  conversationId: string,
  ack?: (response: { success: boolean; error?: string; last_message_id?: string }) => void
) {
  const { appId, deviceId, connectionId } = socket.data;

  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, appId, deviceId },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!conversation) {
    ack?.({ success: false, error: 'CONVERSATION_NOT_FOUND' });
    return;
  }

  // Leave previous conversation room
  if (socket.data.conversationId) {
    socket.leave(`conversation:${socket.data.conversationId}`);
  }

  // Join new room
  socket.data.conversationId = conversationId;
  socket.join(`conversation:${conversationId}`);

  const lastMessageId = conversation.messages[0]?.id;

  socket.emit('conversation:joined', {
    conversation_id: conversationId,
    last_message_id: lastMessageId,
  });

  ack?.({ success: true, last_message_id: lastMessageId });

  console.log('Client joined conversation', { connectionId, conversationId });
}

function handleConversationLeave(socket: ClientSocket, conversationId: string) {
  socket.leave(`conversation:${conversationId}`);
  if (socket.data.conversationId === conversationId) {
    socket.data.conversationId = undefined;
  }
}

function handleTyping(socket: ClientSocket, conversationId: string, isTyping: boolean) {
  const { deviceId } = socket.data;
  
  // Broadcast to conversation room (excluding sender)
  socket.to(`conversation:${conversationId}`).emit('user:typing', {
    conversation_id: conversationId,
    device_id: deviceId,
    is_typing: isTyping,
  });

  // Also notify admin
  adminNs?.to(`conversation:${conversationId}`).emit('user:typing', {
    conversation_id: conversationId,
    device_id: deviceId,
    is_typing: isTyping,
  });
}

async function autoSubscribeToConversation(socket: ClientSocket) {
  const { appId, deviceId } = socket.data;

  const conversation = await prisma.conversation.findFirst({
    where: { appId, deviceId },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  });

  if (conversation) {
    await handleConversationJoin(socket, conversation.id);
  }
}

// Session registry functions
async function registerSession(appId: string, deviceId: string, connectionId: string) {
  if (!isRedisReady()) return;

  const redis = getPublisher();
  const sessionKey = `${SESSION_KEY_PREFIX}${connectionId}`;
  const appSetKey = `${SESSION_SET_PREFIX}${appId}`;

  await redis.hSet(sessionKey, {
    appId,
    deviceId,
    connectionId,
    connectedAt: Date.now().toString(),
  });
  await redis.expire(sessionKey, SESSION_TTL);
  await redis.sAdd(appSetKey, connectionId);
}

async function unregisterSession(appId: string, deviceId: string, connectionId: string) {
  if (!isRedisReady()) return;

  const redis = getPublisher();
  const sessionKey = `${SESSION_KEY_PREFIX}${connectionId}`;
  const appSetKey = `${SESSION_SET_PREFIX}${appId}`;

  await redis.del(sessionKey);
  await redis.sRem(appSetKey, connectionId);
}

// ... Admin namespace setup (similar pattern)

// Public API for broadcasting from other services
export function broadcastToConversation(
  conversationId: string,
  event: string,
  data: unknown
) {
  clientNs?.to(`conversation:${conversationId}`).emit(event, data);
  adminNs?.to(`conversation:${conversationId}`).emit(event, data);
}

export function broadcastAgentTyping(conversationId: string, isTyping: boolean) {
  clientNs?.to(`conversation:${conversationId}`).emit('agent:typing', {
    conversation_id: conversationId,
    is_typing: isTyping,
  });
}

export async function getActiveSessions(appId: string) {
  if (!isRedisReady()) return [];

  const redis = getPublisher();
  const appSetKey = `${SESSION_SET_PREFIX}${appId}`;
  const connectionIds = await redis.sMembers(appSetKey);

  const sessions = await Promise.all(
    connectionIds.map(async (connectionId) => {
      const data = await redis.hGetAll(`${SESSION_KEY_PREFIX}${connectionId}`);
      return data.connectionId ? data : null;
    })
  );

  return sessions.filter(Boolean);
}

export async function gracefulShutdown() {
  if (!io) return;

  console.log('Socket.IO graceful shutdown initiated');

  // Notify all clients
  clientNs?.emit('server:shutdown', {
    message: 'Server is shutting down',
    reconnect_delay_ms: 5000,
  });

  adminNs?.emit('server:shutdown', {
    message: 'Server is shutting down',
    reconnect_delay_ms: 5000,
  });

  // Close all connections
  await io.close();
  console.log('Socket.IO server closed');
}
```

#### 1.3 Fix Presence Service for Multi-Connection

**Update: `backend/src/services/presenceService.ts`**

```typescript
// Change from per-device to per-connection tracking
// Key: presence:conn:{connectionId} with TTL
// Set: presence:device:{appId}:{deviceId} containing connection IDs

export async function setPresence(
  appId: string,
  deviceId: string,
  connectionId: string
): Promise<void> {
  const connKey = `presence:conn:${connectionId}`;
  const deviceKey = `presence:device:${appId}:${deviceId}`;

  const redis = getPublisher();
  
  // Track this connection
  await redis.setEx(connKey, PRESENCE_TTL_SECONDS, JSON.stringify({
    appId, deviceId, connectionId, lastSeen: Date.now()
  }));
  
  // Add to device's connection set
  await redis.sAdd(deviceKey, connectionId);
  await redis.expire(deviceKey, PRESENCE_TTL_SECONDS);

  // Broadcast presence if this is first connection
  const connectionCount = await redis.sCard(deviceKey);
  if (connectionCount === 1) {
    await broadcastPresenceChange(appId, deviceId, true);
  }
}

export async function removePresence(
  appId: string,
  deviceId: string,
  connectionId: string
): Promise<void> {
  const connKey = `presence:conn:${connectionId}`;
  const deviceKey = `presence:device:${appId}:${deviceId}`;

  const redis = getPublisher();
  
  await redis.del(connKey);
  await redis.sRem(deviceKey, connectionId);
  
  // Only broadcast offline if no more connections
  const remaining = await redis.sCard(deviceKey);
  if (remaining === 0) {
    await redis.del(deviceKey);
    await broadcastPresenceChange(appId, deviceId, false);
  }
}

export async function isOnline(appId: string, deviceId: string): Promise<boolean> {
  const deviceKey = `presence:device:${appId}:${deviceId}`;
  const redis = getPublisher();
  const count = await redis.sCard(deviceKey);
  return count > 0;
}

export async function getActiveConnectionCount(
  appId: string, 
  deviceId: string
): Promise<number> {
  const deviceKey = `presence:device:${appId}:${deviceId}`;
  const redis = getPublisher();
  return redis.sCard(deviceKey);
}
```

---

### Phase 2: SDK Socket.IO Protocol Adapter (Day 2)

#### 2.1 Socket.IO Packet Format

Socket.IO uses Engine.IO as transport layer with this packet format:

```
Packet Type (1 char) + Namespace (optional) + Data (JSON)

Types:
0 = CONNECT
1 = DISCONNECT  
2 = EVENT
3 = ACK
4 = CONNECT_ERROR
5 = BINARY_EVENT
6 = BINARY_ACK

Examples:
- Connect to /client: "0/client,"
- Event: "2/client,["message:new",{"id":"123"}]"
- Ack: "3/client,42["response"]"  (42 is ack ID)
```

#### 2.2 Create SocketIO Protocol Handler

**New file: `sdk/.../data/remote/SocketIOClient.kt`**

```kotlin
package dev.replyhq.sdk.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import kotlinx.serialization.json.*

enum class SocketIOPacketType(val value: Int) {
    CONNECT(0),
    DISCONNECT(1),
    EVENT(2),
    ACK(3),
    CONNECT_ERROR(4),
    BINARY_EVENT(5),
    BINARY_ACK(6);
    
    companion object {
        fun fromValue(value: Int) = entries.find { it.value == value }
    }
}

data class SocketIOPacket(
    val type: SocketIOPacketType,
    val namespace: String = "/",
    val data: JsonElement? = null,
    val ackId: Int? = null
)

class SocketIOClient(
    private val appId: String,
    private val apiKey: String,
    private val deviceId: String,
    private val baseUrl: String
) {
    companion object {
        private const val NAMESPACE = "/client"
        private const val PING_INTERVAL = 25_000L
        private const val PING_TIMEOUT = 60_000L
    }
    
    private val json = Json { 
        ignoreUnknownKeys = true 
        encodeDefaults = true
    }
    
    private val client = HttpClient { install(WebSockets) }
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    private var session: WebSocketSession? = null
    private var connectionJob: Job? = null
    private var pingJob: Job? = null
    private var ackCounter = 0
    private val pendingAcks = mutableMapOf<Int, CompletableDeferred<JsonElement?>>()
    
    private val _events = MutableSharedFlow<SocketIOEvent>(extraBufferCapacity = 64)
    val events: Flow<SocketIOEvent> = _events.asSharedFlow()
    
    private val _connectionState = MutableStateFlow(SocketIOConnectionState.DISCONNECTED)
    val connectionState: StateFlow<SocketIOConnectionState> = _connectionState.asStateFlow()
    
    private val outgoing = Channel<String>(Channel.BUFFERED)

    suspend fun connect() {
        if (_connectionState.value != SocketIOConnectionState.DISCONNECTED) return
        
        _connectionState.value = SocketIOConnectionState.CONNECTING
        
        connectionJob = scope.launch {
            try {
                // Socket.IO handshake URL
                val wsUrl = buildSocketIOUrl()
                
                client.webSocket(wsUrl) {
                    session = this
                    
                    // Send Socket.IO CONNECT packet with auth
                    sendConnectPacket()
                    
                    // Start ping/pong
                    startPingLoop()
                    
                    // Handle outgoing messages
                    val sendJob = launch {
                        for (msg in outgoing) {
                            send(Frame.Text(msg))
                        }
                    }
                    
                    try {
                        for (frame in incoming) {
                            when (frame) {
                                is Frame.Text -> handleFrame(frame.readText())
                                else -> {}
                            }
                        }
                    } finally {
                        sendJob.cancel()
                    }
                }
            } catch (e: Exception) {
                _connectionState.value = SocketIOConnectionState.DISCONNECTED
                _events.emit(SocketIOEvent.Error("CONNECTION_FAILED", e.message))
            } finally {
                pingJob?.cancel()
                session = null
                _connectionState.value = SocketIOConnectionState.DISCONNECTED
            }
        }
    }
    
    private fun buildSocketIOUrl(): String {
        // Socket.IO uses Engine.IO transport
        // URL format: ws://host/path/?EIO=4&transport=websocket
        val path = "/v1/socket.io"
        return "$baseUrl$path/?EIO=4&transport=websocket"
    }
    
    private suspend fun sendConnectPacket() {
        // Socket.IO CONNECT packet with auth data
        val authData = buildJsonObject {
            put("app_id", appId)
            put("device_id", deviceId)
            put("api_key", apiKey)
        }
        
        // Format: 0/namespace,{"auth":...}
        val packet = "0$NAMESPACE,${json.encodeToString(JsonElement.serializer(), 
            buildJsonObject { put("auth", authData) }
        )}"
        
        outgoing.send(packet)
    }
    
    private fun startPingLoop() {
        pingJob = scope.launch {
            while (isActive) {
                delay(PING_INTERVAL)
                // Engine.IO ping is just "2"
                outgoing.send("2")
            }
        }
    }
    
    private suspend fun handleFrame(text: String) {
        if (text.isEmpty()) return
        
        // Engine.IO packet types (single digit)
        when (text[0]) {
            '0' -> handleEngineOpen(text.substring(1))
            '2' -> {} // Engine ping, respond with pong
            '3' -> {} // Engine pong received
            '4' -> handleSocketIOPacket(text.substring(1))
            else -> {}
        }
    }
    
    private suspend fun handleEngineOpen(data: String) {
        // Engine.IO open packet contains config
        // We've already connected, just acknowledge
    }
    
    private suspend fun handleSocketIOPacket(data: String) {
        val packet = parseSocketIOPacket(data) ?: return
        
        when (packet.type) {
            SocketIOPacketType.CONNECT -> {
                _connectionState.value = SocketIOConnectionState.CONNECTED
                _events.emit(SocketIOEvent.Connected)
            }
            SocketIOPacketType.DISCONNECT -> {
                _connectionState.value = SocketIOConnectionState.DISCONNECTED
                _events.emit(SocketIOEvent.Disconnected)
            }
            SocketIOPacketType.EVENT -> {
                handleEvent(packet)
            }
            SocketIOPacketType.ACK -> {
                handleAck(packet)
            }
            SocketIOPacketType.CONNECT_ERROR -> {
                val errorData = packet.data?.jsonObject
                val message = errorData?.get("message")?.jsonPrimitive?.content ?: "Unknown error"
                _events.emit(SocketIOEvent.Error("CONNECT_ERROR", message))
            }
            else -> {}
        }
    }
    
    private fun parseSocketIOPacket(data: String): SocketIOPacket? {
        if (data.isEmpty()) return null
        
        val typeChar = data[0].digitToIntOrNull() ?: return null
        val type = SocketIOPacketType.fromValue(typeChar) ?: return null
        
        var rest = data.substring(1)
        var namespace = "/"
        var ackId: Int? = null
        
        // Parse namespace if present
        if (rest.startsWith("/")) {
            val commaIndex = rest.indexOf(',')
            if (commaIndex > 0) {
                namespace = rest.substring(0, commaIndex)
                rest = rest.substring(commaIndex + 1)
            } else {
                namespace = rest
                rest = ""
            }
        }
        
        // Parse ack ID if present (digits before data)
        val ackMatch = Regex("^(\\d+)").find(rest)
        if (ackMatch != null) {
            ackId = ackMatch.value.toIntOrNull()
            rest = rest.substring(ackMatch.value.length)
        }
        
        // Parse JSON data
        val jsonData = if (rest.isNotEmpty()) {
            try {
                json.parseToJsonElement(rest)
            } catch (e: Exception) {
                null
            }
        } else null
        
        return SocketIOPacket(type, namespace, jsonData, ackId)
    }
    
    private suspend fun handleEvent(packet: SocketIOPacket) {
        val array = packet.data?.jsonArray ?: return
        if (array.isEmpty()) return
        
        val eventName = array[0].jsonPrimitive.content
        val eventData = array.getOrNull(1)
        
        when (eventName) {
            "connected" -> {
                val connId = eventData?.jsonObject?.get("connection_id")?.jsonPrimitive?.content
                _events.emit(SocketIOEvent.ConnectionEstablished(connId ?: ""))
            }
            "message:new" -> {
                eventData?.let { 
                    _events.emit(SocketIOEvent.MessageNew(it.jsonObject))
                }
            }
            "agent:typing" -> {
                eventData?.jsonObject?.let {
                    val convId = it["conversation_id"]?.jsonPrimitive?.content ?: return
                    val isTyping = it["is_typing"]?.jsonPrimitive?.boolean ?: false
                    _events.emit(SocketIOEvent.AgentTyping(convId, isTyping))
                }
            }
            "conversation:joined" -> {
                eventData?.jsonObject?.let {
                    val convId = it["conversation_id"]?.jsonPrimitive?.content ?: return
                    val lastMsgId = it["last_message_id"]?.jsonPrimitive?.contentOrNull
                    _events.emit(SocketIOEvent.ConversationJoined(convId, lastMsgId))
                }
            }
            "server:shutdown" -> {
                val delay = eventData?.jsonObject?.get("reconnect_delay_ms")?.jsonPrimitive?.long ?: 5000
                _events.emit(SocketIOEvent.ServerShutdown(delay))
            }
            "error" -> {
                eventData?.jsonObject?.let {
                    val code = it["code"]?.jsonPrimitive?.content ?: "UNKNOWN"
                    val message = it["message"]?.jsonPrimitive?.content ?: "Unknown error"
                    _events.emit(SocketIOEvent.Error(code, message))
                }
            }
            "pong" -> {
                // Application-level pong
            }
        }
    }
    
    private fun handleAck(packet: SocketIOPacket) {
        val ackId = packet.ackId ?: return
        val deferred = pendingAcks.remove(ackId) ?: return
        deferred.complete(packet.data)
    }
    
    // Public API
    
    suspend fun joinConversation(conversationId: String): Result<String?> {
        return emitWithAck("conversation:join", buildJsonObject {
            put("conversation_id", conversationId)
        })
    }
    
    suspend fun leaveConversation(conversationId: String) {
        emit("conversation:leave", buildJsonObject {
            put("conversation_id", conversationId)
        })
    }
    
    suspend fun startTyping(conversationId: String) {
        emit("typing:start", buildJsonObject {
            put("conversation_id", conversationId)
        })
    }
    
    suspend fun stopTyping(conversationId: String) {
        emit("typing:stop", buildJsonObject {
            put("conversation_id", conversationId)
        })
    }
    
    private suspend fun emit(event: String, data: JsonObject) {
        val payload = buildJsonArray {
            add(event)
            add(data)
        }
        // Format: 42/namespace,["event",{data}]
        val packet = "42$NAMESPACE,${json.encodeToString(JsonElement.serializer(), payload)}"
        outgoing.send(packet)
    }
    
    private suspend fun emitWithAck(event: String, data: JsonObject): Result<String?> {
        val ackId = ++ackCounter
        val deferred = CompletableDeferred<JsonElement?>()
        pendingAcks[ackId] = deferred
        
        val payload = buildJsonArray {
            add(event)
            add(data)
        }
        // Format: 42/namespace,123["event",{data}]  (123 is ack ID)
        val packet = "42$NAMESPACE,$ackId${json.encodeToString(JsonElement.serializer(), payload)}"
        outgoing.send(packet)
        
        return try {
            withTimeout(10_000) {
                val response = deferred.await()
                val success = response?.jsonArray?.getOrNull(0)
                    ?.jsonObject?.get("success")?.jsonPrimitive?.boolean ?: false
                if (success) {
                    val lastMsgId = response?.jsonArray?.getOrNull(0)
                        ?.jsonObject?.get("last_message_id")?.jsonPrimitive?.contentOrNull
                    Result.success(lastMsgId)
                } else {
                    val error = response?.jsonArray?.getOrNull(0)
                        ?.jsonObject?.get("error")?.jsonPrimitive?.content ?: "Unknown error"
                    Result.failure(Exception(error))
                }
            }
        } catch (e: Exception) {
            pendingAcks.remove(ackId)
            Result.failure(e)
        }
    }
    
    suspend fun disconnect() {
        pingJob?.cancel()
        connectionJob?.cancel()
        session?.close()
        session = null
        _connectionState.value = SocketIOConnectionState.DISCONNECTED
    }
    
    fun close() {
        scope.launch { disconnect() }
        client.close()
    }
}

enum class SocketIOConnectionState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    RECONNECTING
}

sealed class SocketIOEvent {
    object Connected : SocketIOEvent()
    object Disconnected : SocketIOEvent()
    data class ConnectionEstablished(val connectionId: String) : SocketIOEvent()
    data class MessageNew(val data: JsonObject) : SocketIOEvent()
    data class AgentTyping(val conversationId: String, val isTyping: Boolean) : SocketIOEvent()
    data class ConversationJoined(val conversationId: String, val lastMessageId: String?) : SocketIOEvent()
    data class ServerShutdown(val reconnectDelayMs: Long) : SocketIOEvent()
    data class Error(val code: String, val message: String?) : SocketIOEvent()
}
```

#### 2.3 Update ConnectionManager

Simplify to use Socket.IO's built-in reconnection awareness:

```kotlin
// ConnectionManager becomes thinner - delegates reconnection handling
// to the SocketIOClient which benefits from Socket.IO's patterns

class ConnectionManager(
    private val socketClient: SocketIOClient,
    private val connectivity: Connectivity
) {
    // ... simplified version that:
    // 1. Monitors network state
    // 2. Calls socketClient.connect() / disconnect()
    // 3. Handles ServerShutdown event for graceful reconnect
    // 4. No longer needs manual exponential backoff (simpler)
}
```

---

### Phase 3: Integration & Testing (Day 3)

#### 3.1 Update Message Service

```typescript
// backend/src/services/messageService.ts

import { broadcastToConversation } from './socketService.js';

// Change broadcast call
broadcastToConversation(conversationId, 'message:new', formattedMessage);
```

#### 3.2 Backward Compatibility (Optional)

Keep old `ws` endpoint running in parallel during migration:

```typescript
// backend/src/index.ts
await initSocketIO(server);      // New Socket.IO
await initWebSocket(server);     // Legacy ws (deprecate later)
```

#### 3.3 Test Scenarios

| Scenario | Test Case |
|----------|-----------|
| **Connection** | Client connects with valid credentials |
| **Connection** | Client rejected with invalid API key |
| **Connection** | Client auto-subscribes to latest conversation |
| **Multi-connection** | Same device opens 2 connections, both work |
| **Multi-connection** | Close 1 of 2 connections, presence stays online |
| **Multi-connection** | Close last connection, presence goes offline |
| **Messaging** | Agent sends message, client receives via Socket.IO |
| **Messaging** | Client receives message with ACK confirmation |
| **Typing** | Client typing broadcasts to admin |
| **Typing** | Agent typing broadcasts to client |
| **Reconnection** | Network drop → automatic reconnect |
| **Reconnection** | Server shutdown → client reconnects after delay |
| **Admin** | Admin sees all connected sessions |
| **Admin** | Admin receives session connect/disconnect events |
| **Multi-node** | Message sent on node A reaches client on node B |
| **Presence** | Admin sees accurate online/offline status |

---

### Phase 4: Admin Dashboard Integration (Day 4)

#### 4.1 Admin Namespace Implementation

Complete the `/admin` namespace with:
- Session listing endpoint
- Conversation subscription
- Agent message sending with ACK
- Presence monitoring

#### 4.2 Dashboard WebSocket Client

```typescript
// Admin dashboard (React/Svelte)
import { io } from 'socket.io-client';

const socket = io('/admin', {
  auth: {
    app_id: 'app_xxx',
    admin_token: 'admin_xxx',  // Separate from client API key
  },
  path: '/v1/socket.io',
});

socket.on('session:connect', (data) => {
  // Add to active sessions list
});

socket.on('session:disconnect', (data) => {
  // Remove from active sessions list
});

// Get initial session list
socket.emit('sessions:list', { app_id: 'app_xxx' }, (response) => {
  // Populate sessions
});
```

---

## Edge Cases & Error Handling

### Connection Edge Cases

| Scenario | Handling |
|----------|----------|
| **API key rotation** | Reject with `INVALID_CREDENTIALS`, client should refresh token |
| **Network flap** | Socket.IO auto-reconnects; session registry has TTL |
| **Server crash** | Redis adapter maintains room state; clients reconnect |
| **Stale session in Redis** | TTL-based cleanup; heartbeat refreshes TTL |
| **Client connects during deploy** | `server:shutdown` event triggers delayed reconnect |

### Message Delivery Edge Cases

| Scenario | Handling |
|----------|----------|
| **Message while disconnected** | SDK queues locally; syncs on reconnect via REST |
| **Duplicate message** | `localId` deduplication in DB (upsert) |
| **Out-of-order delivery** | `last_message_id` on join enables cursor sync |
| **Large message** | Backend validates `maxLength`; Socket.IO handles chunking |

### Presence Edge Cases

| Scenario | Handling |
|----------|----------|
| **Zombie connection** | Socket.IO ping timeout cleans up |
| **Redis connection lost** | Fall back to in-memory; log warning |
| **Split brain (network partition)** | TTL ensures eventual consistency |

---

## Scalability Considerations

### Horizontal Scaling

```
                    Load Balancer (sticky sessions optional)
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
        Node 1          Node 2          Node 3
        Socket.IO       Socket.IO       Socket.IO
            │               │               │
            └───────────────┴───────────────┘
                            │
                        Redis Cluster
                    (Pub/Sub + Adapter)
```

**Sticky Sessions:** Not required with Redis adapter, but recommended for performance.

### Capacity Planning

| Metric | Single Node | With Redis Adapter |
|--------|-------------|-------------------|
| Concurrent connections | ~10K | ~100K+ (horizontal) |
| Messages/second | ~5K | ~50K+ |
| Memory per connection | ~10KB | ~10KB |

### Redis Adapter Tuning

```typescript
// For high-throughput scenarios
const adapter = createAdapter(pubClient, subClient, {
  requestsTimeout: 5000,
  publishOnSpecificResponseChannel: true,
});
```

---

## Performance Optimizations

### 1. Disable HTTP Polling
```typescript
transports: ['websocket']  // Already in config
```

### 2. Binary Messages (Future)
Socket.IO supports binary; can optimize large payloads later.

### 3. Message Batching
For high-frequency events (typing), consider debouncing:
```typescript
// Server-side: batch typing events per 100ms window
```

### 4. Connection Pooling
Redis connections are pooled via the `redis` client.

---

## Security Considerations

### Current (Phase 1)
- API key in handshake auth (not query params)
- Conversation access validated on join
- Rate limiting via Redis (add per-connection counters)

### Future Improvements
- [ ] JWT tokens with expiry instead of API keys
- [ ] Separate admin authentication flow
- [ ] Per-IP connection limits
- [ ] Message content validation/sanitization

---

## Migration Checklist

### Backend
- [ ] Install `socket.io` and `@socket.io/redis-adapter`
- [ ] Create `socketService.ts` with client/admin namespaces
- [ ] Fix `presenceService.ts` for multi-connection
- [ ] Update `messageService.ts` to use new broadcast
- [ ] Update `index.ts` initialization
- [ ] Add admin authentication middleware
- [ ] Add session registry in Redis
- [ ] Add graceful shutdown handling
- [ ] Write integration tests

### SDK
- [ ] Create `SocketIOClient.kt` with protocol implementation
- [ ] Create `SocketIOEvent.kt` sealed class
- [ ] Update `ConnectionManager.kt` to use Socket.IO client
- [ ] Update `SyncManager.kt` event handling
- [ ] Update `NetworkConfig.kt` with Socket.IO path
- [ ] Handle `server:shutdown` event for graceful reconnect
- [ ] Handle `conversation:joined` with `last_message_id`
- [ ] Write unit tests for packet parsing

### Testing
- [ ] Connection flow tests
- [ ] Multi-connection presence tests
- [ ] Message delivery tests
- [ ] Reconnection tests
- [ ] Multi-node broadcast tests
- [ ] Admin visibility tests
- [ ] Load testing (100+ concurrent connections)

### Deployment
- [ ] Update infrastructure for sticky sessions (optional)
- [ ] Ensure Redis is available in all environments
- [ ] Update monitoring/alerting for Socket.IO metrics
- [ ] Plan rolling deployment (keep old ws during transition)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Connection success rate | >99.5% |
| Message delivery latency (p95) | <100ms |
| Reconnection time after network drop | <5s |
| Admin session visibility accuracy | 100% |
| Zero message loss during server restart | ✓ |

---

## Timeline

| Day | Tasks |
|-----|-------|
| **Day 1** | Backend Socket.IO setup, namespaces, presence fix |
| **Day 2** | SDK Socket.IO protocol adapter, ConnectionManager update |
| **Day 3** | Integration, testing, edge case handling |
| **Day 4** | Admin dashboard integration, load testing, documentation |

---

## Open Questions

1. **Admin authentication:** Use separate admin tokens or extend current API key system?
2. **Message history sync:** Keep timestamp-based or migrate to cursor-based immediately?
3. **Legacy ws support:** How long to maintain backward compatibility?
4. **Rate limiting:** Per-device or per-connection limits?
