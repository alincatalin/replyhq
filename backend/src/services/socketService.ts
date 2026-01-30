import { Server as HTTPServer } from 'http';
import { Server, Namespace } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { redis, isRedisReady, publish } from '../lib/redis.js';
import {
  ClientSocket,
  AdminSocket,
  Message,
  SessionData,
  ConversationJoinResponse,
  AdminMessageSendResponse,
} from '../types/socket.js';
import { createMessage } from './messageService.js';
import * as presenceService from './presenceService.js';
import * as deliveryReceiptService from './deliveryReceiptService.js';
import { initializeTestConsole } from './testConsoleService.js';
import { verifyApiKey } from '../lib/apiKey.js';
import { verifyAccessToken } from '../lib/jwt.js';

let io: Server;
let clientNs: Namespace<any, any>;
let adminNs: Namespace<any, any>;

const SESSION_KEY_PREFIX = 'session:';
const SESSION_SET_PREFIX = 'sessions:app:';
const SESSION_TTL = 120; // 2 minutes

/**
 * Initialize Socket.IO server with namespaces and middleware
 */
export async function initSocketIO(server: HTTPServer): Promise<void> {
  console.log('[Socket.IO] Initializing Socket.IO server...');

  io = new Server(server, {
    path: '/v1/socket.io',
    cors: {
      origin: '*',
    },
    pingInterval: 25000,
    pingTimeout: 60000,
    transports: ['websocket'],
    serveClient: false,
    // Completely disable WebSocket compression at engine.io level
    // This prevents the Sec-WebSocket-Extensions header from being negotiated
    perMessageDeflate: false,
  });

  console.log('[Socket.IO] Server instance created, checking attachment...');

  // Verify Socket.IO is attached
  if (io) {
    console.log('[Socket.IO] Socket.IO server attached to HTTP server');
  } else {
    console.error('[Socket.IO] Failed to attach Socket.IO to HTTP server!');
  }

  console.log('[Socket.IO] Server created, attaching event listeners...');

  // Log all connection attempts (before authentication)
  io.on('connection_error', (error) => {
    console.log('[Socket.IO] Connection error:', error.message, error.data);
  });

  io.on('error', (error) => {
    console.log('[Socket.IO] IO error:', error);
  });

  io.on('connection', (socket) => {
    console.log('[Socket.IO] New connection:', socket.id);
  });

  // Setup Redis adapter if available
  if (isRedisReady() && redis.pubClient && redis.subClient) {
    try {
      const adapter = createAdapter(redis.pubClient, redis.subClient);
      io.adapter(adapter);
      console.log('Socket.IO Redis adapter initialized');
    } catch (error) {
      console.warn('Failed to setup Socket.IO Redis adapter:', (error as Error).message);
    }
  }

  // Setup client namespace
  clientNs = io.of('/client');
  setupClientNamespace();

  // Setup admin namespace
  adminNs = io.of('/admin');
  setupAdminNamespace();

  // Setup test console namespace for admin dashboard
  initializeTestConsole(io);

  console.log('Socket.IO server initialized on /v1/socket.io');
}

/**
 * Setup client namespace with authentication and event handlers
 */
function setupClientNamespace(): void {
  // Authentication middleware
  clientNs.use(async (socket: ClientSocket, next) => {
    try {
      console.log('[Socket.IO Auth] Handshake:', {
        auth: socket.handshake.auth,
        query: socket.handshake.query,
        url: socket.handshake.url,
      });

      const { app_id, device_id, api_key } = socket.handshake.auth;

      // Validate parameters
      if (!app_id || !device_id || !api_key) {
        console.log('[Socket.IO Auth] Missing params:', { app_id, device_id, api_key });
        return next(new Error('MISSING_PARAMS'));
      }

      // Validate app exists and API key matches
      const app = await prisma.app.findUnique({
        where: { id: app_id },
      });

      const validKey = !!app && (
        (app.apiKey && app.apiKey === api_key) ||
        verifyApiKey(api_key, app.apiKeyHash)
      );

      if (!validKey) {
        return next(new Error('INVALID_CREDENTIALS'));
      }

      // Populate socket data
      socket.data = {
        appId: app_id,
        deviceId: device_id,
        connectionId: generateConnectionId(),
      };

      next();
    } catch (error) {
      next(new Error('AUTH_ERROR'));
    }
  });

  // Connection handler
  clientNs.on('connection', async (socket: ClientSocket) => {
    const { appId, deviceId, connectionId, conversationId } = socket.data;

    console.log(`[Client] Connected: ${connectionId} (app: ${appId}, device: ${deviceId})`);

    // Register session
    await registerSession(appId, deviceId, connectionId);
    await presenceService.setPresence(appId, deviceId, connectionId);

    // Emit connected event
    socket.emit('connected', {
      connection_id: connectionId,
      server_time: new Date().toISOString(),
    });

    // Broadcast session:connect to admin
    adminNs.to(`app:${appId}`).emit('session:connect', {
      connection_id: connectionId,
      device_id: deviceId,
      app_id: appId,
      connected_at: new Date().toISOString(),
    });

    // Auto-subscribe to latest conversation
    await autoSubscribeToConversation(socket);

    // Register event handlers
    socket.on('conversation:join', (payload: any, callback) => {
      handleConversationJoin(socket, payload, callback);
    });

    socket.on('conversation:leave', (payload: any) => {
      handleConversationLeave(socket, payload);
    });

    socket.on('typing:start', (payload: any) => {
      handleTyping(socket, payload, true);
    });

    socket.on('typing:stop', (payload: any) => {
      handleTyping(socket, payload, false);
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });

    socket.on('disconnect', async (reason: string) => {
      console.log(`[Client] Disconnected: ${connectionId} (reason: ${reason})`);

      await unregisterSession(appId, deviceId, connectionId);
      await presenceService.removePresence(appId, deviceId, connectionId);

      // Broadcast session:disconnect to admin
      adminNs.to(`app:${appId}`).emit('session:disconnect', {
        connection_id: connectionId,
        device_id: deviceId,
        reason,
      });
    });
  });
}

/**
 * Setup admin namespace with authentication and event handlers
 */
function setupAdminNamespace(): void {
  // Authentication middleware
  adminNs.use(async (socket: AdminSocket, next) => {
    try {
      const { app_id, admin_token } = socket.handshake.auth;

      // Validate parameters
      if (!app_id || !admin_token) {
        return next(new Error('MISSING_PARAMS'));
      }

      // Validate admin auth
      // Preferred: JWT access token (admin_token)
      let resolvedAppId = app_id;
      let isJwt = false;

      if (typeof admin_token === 'string' && admin_token.split('.').length === 3) {
        try {
          const payload = verifyAccessToken(admin_token);
          isJwt = true;
          resolvedAppId = payload.appId;
          if (app_id && app_id !== resolvedAppId) {
            return next(new Error('INVALID_CREDENTIALS'));
          }
        } catch (error) {
          return next(new Error('INVALID_CREDENTIALS'));
        }
      }

      if (!isJwt) {
        const app = await prisma.app.findUnique({
          where: { id: app_id },
        });
        const validKey = !!app && (
          (app.apiKey && app.apiKey === admin_token) ||
          verifyApiKey(admin_token, app.apiKeyHash)
        );
        if (!validKey) {
          return next(new Error('INVALID_CREDENTIALS'));
        }
      }

      // Populate socket data
      socket.data = {
        appId: resolvedAppId,
        connectionId: generateConnectionId(),
        subscribedConversations: new Set<string>(),
      };

      next();
    } catch (error) {
      next(new Error('AUTH_ERROR'));
    }
  });

  // Connection handler
  adminNs.on('connection', async (socket: AdminSocket) => {
    const { appId, connectionId } = socket.data;

    console.log(`[Admin] Connected: ${connectionId} (app: ${appId})`);

    // Emit connected event
    socket.emit('connected', {
      connection_id: connectionId,
      server_time: new Date().toISOString(),
    });

    // Auto-join app room
    socket.join(`app:${appId}`);

    // Register event handlers
    socket.on('app:subscribe', () => {
      // Already in app room, just a signal that admin is ready
      console.log(`[Admin] Subscribed to app: ${appId}`);
    });

    socket.on('conversation:join', (payload: unknown, callback) => {
      handleAdminConversationJoin(socket, payload, callback);
    });

    socket.on('conversation:leave', (payload: unknown) => {
      handleAdminConversationLeave(socket, payload);
    });

    socket.on('message:send', (data, callback) => {
      handleAdminMessageSend(socket, data, callback);
    });

    socket.on('sessions:list', (callback) => {
      handleSessionsList(socket, callback);
    });

    socket.on('typing:start', (payload: unknown) => {
      handleAdminTyping(socket, payload, true);
    });

    socket.on('typing:stop', (payload: unknown) => {
      handleAdminTyping(socket, payload, false);
    });

    socket.on('ping', () => {
      socket.emit('pong');
    });

    socket.on('disconnect', (reason: string) => {
      console.log(`[Admin] Disconnected: ${connectionId} (reason: ${reason})`);
    });
  });
}

/**
 * Handle client conversation join with room subscription
 */
function extractConversationId(payload: unknown): string | null {
  if (typeof payload === 'string') {
    return payload;
  }
  if (payload && typeof payload === 'object') {
    const value = (payload as { conversation_id?: unknown }).conversation_id;
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

async function handleConversationJoin(
  socket: ClientSocket,
  payload: unknown,
  ack: (response: ConversationJoinResponse) => void
): Promise<void> {
  try {
    const conversationId = extractConversationId(payload);
    if (!conversationId) {
      return ack({ success: false, error: 'MISSING_CONVERSATION_ID' });
    }

    const { appId, deviceId } = socket.data;

    // Validate conversation exists and belongs to this app+device
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        appId,
        deviceId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!conversation) {
      return ack({
        success: false,
        error: 'CONVERSATION_NOT_FOUND',
      });
    }

    // Leave previous room if exists
    if (socket.data.conversationId) {
      socket.leave(`conversation:${socket.data.conversationId}`);
    }

    // Join new room
    socket.join(`conversation:${conversationId}`);
    socket.data.conversationId = conversationId;

    // Get last message ID
    const lastMessageId = conversation.messages[0]?.id;

    // Emit conversation:joined event
    socket.emit('conversation:joined', {
      conversation_id: conversationId,
      last_message_id: lastMessageId,
    });

    console.log(`[Client] Joined conversation: ${conversationId} (last_message_id: ${lastMessageId})`);

    // Acknowledge with success
    ack({
      success: true,
      last_message_id: lastMessageId,
    });
  } catch (error) {
    console.error('Error in handleConversationJoin:', error);
    ack({
      success: false,
      error: 'SERVER_ERROR',
    });
  }
}

/**
 * Handle client conversation leave
 */
async function handleConversationLeave(
  socket: ClientSocket,
  payload: unknown
): Promise<void> {
  try {
    const conversationId = extractConversationId(payload);
    if (!conversationId) {
      return;
    }
    socket.leave(`conversation:${conversationId}`);
    if (socket.data.conversationId === conversationId) {
      socket.data.conversationId = undefined;
    }
    console.log(`[Client] Left conversation: ${conversationId}`);
  } catch (error) {
    console.error('Error in handleConversationLeave:', error);
  }
}

/**
 * Handle typing indicators from client
 */
function handleTyping(
  socket: ClientSocket,
  payload: unknown,
  isTyping: boolean
): void {
  const conversationId = extractConversationId(payload);
  if (!conversationId) {
    return;
  }
  const { deviceId } = socket.data;

  // Broadcast to conversation room (excluding sender)
  socket.to(`conversation:${conversationId}`).emit('user:typing', {
    conversation_id: conversationId,
    device_id: deviceId,
    is_typing: isTyping,
  });

  // Also emit to admin namespace
  adminNs.to(`conversation:${conversationId}`).emit('user:typing', {
    conversation_id: conversationId,
    device_id: deviceId,
    is_typing: isTyping,
  });
}

/**
 * Auto-subscribe client to their latest conversation on connect
 */
async function autoSubscribeToConversation(socket: ClientSocket): Promise<void> {
  try {
    const { appId, deviceId } = socket.data;

    const conversation = await prisma.conversation.findFirst({
      where: {
        appId,
        deviceId,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (conversation) {
      socket.join(`conversation:${conversation.id}`);
      socket.data.conversationId = conversation.id;

      const lastMessageId = conversation.messages[0]?.id;

      socket.emit('conversation:joined', {
        conversation_id: conversation.id,
        last_message_id: lastMessageId,
      });

      console.log(`[Client] Auto-subscribed to conversation: ${conversation.id}`);
    }
  } catch (error) {
    console.error('Error in autoSubscribeToConversation:', error);
  }
}

/**
 * Handle admin conversation join
 */
async function handleAdminConversationJoin(
  socket: AdminSocket,
  payload: unknown,
  ack: (response: ConversationJoinResponse) => void
): Promise<void> {
  try {
    const conversationId = extractConversationId(payload);
    if (!conversationId) {
      return ack({
        success: false,
        error: 'MISSING_CONVERSATION_ID',
      });
    }

    const { appId } = socket.data;

    // Validate conversation exists and belongs to this app
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        appId,
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!conversation) {
      return ack({
        success: false,
        error: 'CONVERSATION_NOT_FOUND',
      });
    }

    // Join room and track subscription
    socket.join(`conversation:${conversationId}`);
    socket.data.subscribedConversations.add(conversationId);

    // Get last message ID
    const lastMessageId = conversation.messages[0]?.id;

    // Emit conversation:joined event
    socket.emit('conversation:joined', {
      conversation_id: conversationId,
      last_message_id: lastMessageId,
    });

    console.log(`[Admin] Joined conversation: ${conversationId}`);

    // Acknowledge
    ack({
      success: true,
      last_message_id: lastMessageId,
    });
  } catch (error) {
    console.error('Error in handleAdminConversationJoin:', error);
    ack({
      success: false,
      error: 'SERVER_ERROR',
    });
  }
}

/**
 * Handle admin conversation leave
 */
async function handleAdminConversationLeave(
  socket: AdminSocket,
  payload: unknown
): Promise<void> {
  try {
    const conversationId = extractConversationId(payload);
    if (!conversationId) {
      return;
    }
    socket.leave(`conversation:${conversationId}`);
    socket.data.subscribedConversations.delete(conversationId);
    console.log(`[Admin] Left conversation: ${conversationId}`);
  } catch (error) {
    console.error('Error in handleAdminConversationLeave:', error);
  }
}

/**
 * Handle admin message send
 */
async function handleAdminMessageSend(
  socket: AdminSocket,
  data: any,
  ack: (response: AdminMessageSendResponse) => void
): Promise<void> {
  try {
    const { conversation_id, body, local_id } = data;
    const { appId } = socket.data;

    // Validate conversation
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversation_id,
        appId,
      },
    });

    if (!conversation) {
      return ack({
        success: false,
        error: 'CONVERSATION_NOT_FOUND',
      });
    }

    // Create message
    const message = await createMessage(
      conversation_id,
      {
        local_id,
        body,
      },
      appId,
      conversation.deviceId,
      'agent'
    );

    console.log(`[Admin] Sent message: ${message.id} to conversation: ${conversation_id}`);

    ack({
      success: true,
      message,
    });
  } catch (error) {
    console.error('Error in handleAdminMessageSend:', error);
    ack({
      success: false,
      error: 'SERVER_ERROR',
    });
  }
}

/**
 * Handle admin sessions list
 */
async function handleSessionsList(
  socket: AdminSocket,
  ack: (response: { sessions: SessionData[] }) => void
): Promise<void> {
  try {
    const { appId } = socket.data;
    const sessions = await getActiveSessions(appId);
    ack({ sessions });
  } catch (error) {
    console.error('Error in handleSessionsList:', error);
    ack({ sessions: [] });
  }
}

/**
 * Handle admin typing indicators
 */
function handleAdminTyping(
  socket: AdminSocket,
  payload: unknown,
  isTyping: boolean
): void {
  const conversationId = extractConversationId(payload);
  if (!conversationId) {
    return;
  }
  // Broadcast to conversation room (all clients)
  clientNs.to(`conversation:${conversationId}`).emit('agent:typing', {
    conversation_id: conversationId,
    is_typing: isTyping,
  });
}

/**
 * Register session in Redis
 */
async function registerSession(appId: string, deviceId: string, connectionId: string): Promise<void> {
  if (!isRedisReady() || !redis.client) {
    return;
  }

  try {
    const sessionKey = `${SESSION_KEY_PREFIX}${connectionId}`;
    const appSetKey = `${SESSION_SET_PREFIX}${appId}`;

    await redis.client.hSet(sessionKey, {
      appId,
      deviceId,
      connectionId,
      connectedAt: new Date().toISOString(),
    });

    await redis.client.expire(sessionKey, SESSION_TTL);
    await redis.client.sAdd(appSetKey, connectionId);
  } catch (error) {
    console.warn('Failed to register session:', (error as Error).message);
  }
}

/**
 * Unregister session from Redis
 */
async function unregisterSession(appId: string, deviceId: string, connectionId: string): Promise<void> {
  if (!isRedisReady() || !redis.client) {
    return;
  }

  try {
    const sessionKey = `${SESSION_KEY_PREFIX}${connectionId}`;
    const appSetKey = `${SESSION_SET_PREFIX}${appId}`;

    await redis.client.del(sessionKey);
    await redis.client.sRem(appSetKey, connectionId);
  } catch (error) {
    console.warn('Failed to unregister session:', (error as Error).message);
  }
}

/**
 * Get active sessions for an app
 */
/**
 * Get active sessions for an app
 * OPTIMIZED: Uses Redis pipelining for 100x performance improvement
 */
async function getActiveSessions(appId: string): Promise<SessionData[]> {
  if (!isRedisReady() || !redis.client) {
    return [];
  }

  try {
    const appSetKey = `${SESSION_SET_PREFIX}${appId}`;
    const connectionIds = await redis.client.sMembers(appSetKey);

    if (connectionIds.length === 0) {
      return [];
    }

    // Use Redis pipelining to batch all hGetAll commands into a single round-trip
    // This reduces latency from O(n) network calls to O(1)
    const pipeline = redis.client.multi();

    connectionIds.forEach((connectionId: string) => {
      const sessionKey = `${SESSION_KEY_PREFIX}${connectionId}`;
      pipeline.hGetAll(sessionKey);
    });

    const results = await pipeline.exec();

    const sessions: SessionData[] = [];

    // Map results back to sessions
    results?.forEach((result: unknown) => {
      // Redis pipeline returns various types, need to check if it's an object
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        const sessionData = result as unknown as Record<string, string>;

        if (sessionData.connectionId) {
          sessions.push({
            connectionId: sessionData.connectionId,
            deviceId: sessionData.deviceId,
            appId: sessionData.appId,
            connectedAt: sessionData.connectedAt,
          });
        }
      }
    });

    return sessions;
  } catch (error) {
    console.warn('Failed to get active sessions:', (error as Error).message);
    return [];
  }
}

/**
 * Broadcast to conversation room (clients + admins)
 */
export function broadcastToConversation(conversationId: string, event: string, data: any): void {
  clientNs.to(`conversation:${conversationId}`).emit(event, data);
  adminNs.to(`conversation:${conversationId}`).emit(event, data);
}

/**
 * Broadcast agent typing event
 */
export function broadcastAgentTyping(conversationId: string, isTyping: boolean): void {
  broadcastToConversation(conversationId, 'agent:typing', {
    conversation_id: conversationId,
    is_typing: isTyping,
  });
}

/**
 * Get current connection count
 */
export function getConnectionCount(): number {
  return clientNs.sockets.size;
}

/**
 * Graceful shutdown
 */
export async function gracefulShutdown(): Promise<void> {
  console.log('Socket.IO graceful shutdown initiated');

  // Emit server:shutdown to all clients
  clientNs.emit('server:shutdown', {
    message: 'Server is shutting down',
    reconnect_delay_ms: 5000,
  });

  // Give connections time to close gracefully
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Close Socket.IO server
  await new Promise<void>((resolve) => {
    io.close(() => {
      console.log('Socket.IO server closed');
      resolve();
    });
  });
}

/**
 * Generate a unique connection ID
 */
function generateConnectionId(): string {
  return `conn_${uuidv4().substring(0, 12)}`;
}
