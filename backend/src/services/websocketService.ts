import { WebSocketServer, WebSocket } from 'ws';
import { Server, IncomingMessage } from 'http';
import { URL } from 'url';
import { config } from '../config/index.js';
import { generateConnectionId } from '../utils/ids.js';
import { prisma } from '../lib/prisma.js';
import { isRedisReady, publish, subscribe } from '../lib/redis.js';
import { broadcastPresenceChange, removePresence, setPresence } from './presenceService.js';

interface ClientConnection {
  ws: WebSocket;
  appId: string;
  deviceId: string;
  connectionId: string;
  conversationId?: string;
  lastPong: number;
  isAlive: boolean;
}

const connections = new Map<string, ClientConnection>();
const conversationClients = new Map<string, Set<string>>();

interface AdminConnection {
  ws: WebSocket;
  appId: string;
  connectionId: string;
  lastPong: number;
  isAlive: boolean;
}

const adminConnections = new Map<string, AdminConnection>();
const adminConversationClients = new Map<string, Set<string>>();

let wss: WebSocketServer | null = null;
let adminWss: WebSocketServer | null = null;
let heartbeatInterval: NodeJS.Timeout | null = null;
let cleanupInterval: NodeJS.Timeout | null = null;

const MAX_BUFFERED_AMOUNT = 1024 * 1024; // 1MB backpressure threshold
const HEARTBEAT_INTERVAL = 30000; // 30s
const STALE_THRESHOLD = 90000; // 90s (3 missed heartbeats)

export async function initWebSocket(server: Server) {
  wss = new WebSocketServer({
    server,
    path: '/v1/realtime',
    perMessageDeflate: false
  });

  if (isRedisReady()) {
    try {
      await subscribe('conversation:*', handleRedisPubSub);
    } catch (err) {
      console.warn('Redis subscribe failed, continuing without pub/sub:', (err as Error).message);
    }
  }

  wss.on('connection', async (ws, req) => {
    console.log('Realtime connection attempt', {
      url: req.url,
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
    const connectionResult = await handleConnection(ws, req);
    if (!connectionResult) {
      return;
    }

    const { connectionId } = connectionResult;

    ws.on('pong', () => {
      const client = connections.get(connectionId);
      if (client) {
        client.isAlive = true;
        client.lastPong = Date.now();
        console.log('Realtime pong received', { connectionId });
      }
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(connectionId, message);
      } catch {
        safeSend(ws, { type: 'error', error: 'Invalid JSON', code: 'INVALID_JSON' });
      }
    });

    ws.on('close', (code, reason) => {
      const reasonText = reason?.toString() || '';
      console.log('Realtime connection closed', { connectionId, code, reason: reasonText });
      removeClient(connectionId);
    });

    ws.on('error', (err) => {
      console.error(`WebSocket error for ${connectionId}:`, err.message);
      removeClient(connectionId);
    });
  });

  heartbeatInterval = setInterval(sendHeartbeats, HEARTBEAT_INTERVAL);
  cleanupInterval = setInterval(cleanupStaleConnections, STALE_THRESHOLD);
}

export async function initAdminWebSocket() {
  adminWss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false
  });

  adminWss.on('connection', async (ws, req) => {
    const connectionResult = await handleAdminConnection(ws, req);
    if (!connectionResult) {
      return;
    }

    const { connectionId } = connectionResult;

    ws.on('pong', () => {
      const client = adminConnections.get(connectionId);
      if (client) {
        client.isAlive = true;
        client.lastPong = Date.now();
        console.log('Admin realtime pong received', { connectionId });
      }
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleAdminMessage(connectionId, message);
      } catch {
        safeSend(ws, { type: 'error', error: 'Invalid JSON', code: 'INVALID_JSON' });
      }
    });

    ws.on('close', () => {
      removeAdminClient(connectionId);
    });

    ws.on('error', (err) => {
      console.error(`Admin WebSocket error for ${connectionId}:`, err.message);
      removeAdminClient(connectionId);
    });
  });
}

export function handleAdminUpgrade(
  req: IncomingMessage,
  socket: any,
  head: Buffer
): boolean {
  if (!adminWss) {
    return false;
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  if (url.pathname !== '/admin/realtime') {
    return false;
  }

  adminWss.handleUpgrade(req, socket, head, (ws) => {
    adminWss?.emit('connection', ws, req);
  });
  return true;
}

async function handleConnection(
  ws: WebSocket,
  req: IncomingMessage
): Promise<{ connectionId: string } | null> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const appId = url.searchParams.get('app_id');
  const deviceId = url.searchParams.get('device_id');
  const apiKeyHeader = req.headers['x-api-key'] as string | undefined;
  const apiKeyParam = url.searchParams.get('api_key') || undefined;
  const apiKey = apiKeyHeader ?? apiKeyParam;

  if (!appId || !deviceId || !apiKey) {
    console.warn('Realtime missing params', {
      appId: Boolean(appId),
      deviceId: Boolean(deviceId),
      apiKey: Boolean(apiKey),
    });
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Missing required parameters',
      code: 'MISSING_PARAMS',
    }));
    ws.close(4400, 'Missing parameters');
    return null;
  }

  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app) {
    console.warn('Realtime invalid app_id', { appId, deviceId });
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Invalid app_id',
      code: 'INVALID_APP_ID',
    }));
    ws.close(4403, 'Invalid app_id');
    return null;
  }

  if (app.apiKey !== apiKey) {
    console.warn('Realtime invalid API key', { appId, deviceId });
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Invalid API key',
      code: 'INVALID_API_KEY',
    }));
    ws.close(4401, 'Invalid API key');
    return null;
  }

  const connectionId = generateConnectionId();
  const client: ClientConnection = {
    ws,
    appId,
    deviceId,
    connectionId,
    lastPong: Date.now(),
    isAlive: true,
  };

  connections.set(connectionId, client);
  console.log('Realtime connected', { connectionId, appId, deviceId });

  safeSend(ws, {
    type: 'connection.established',
    connection_id: connectionId,
  });

  // Record presence and attempt auto-subscribe to last conversation for this device.
  void setPresence(appId, deviceId, connectionId);
  void broadcastPresenceChange(appId, deviceId, true);
  void autoSubscribeToLatestConversation(connectionId, appId, deviceId);

  return { connectionId };
}

function handleRedisPubSub(channel: string, message: string) {
  try {
    const parsed = JSON.parse(message);
    const conversationId = channel.replace('conversation:', '');
    
    localBroadcastToConversation(conversationId, parsed.data, parsed.excludeConnectionId);
    localBroadcastToAdmin(conversationId, parsed.data);
  } catch (err) {
    console.error('Redis pubsub parse error:', err);
  }
}

async function handleClientMessage(
  connectionId: string,
  message: { type: string; conversation_id?: string; is_typing?: boolean }
) {
  const client = connections.get(connectionId);
  if (!client) return;
  console.log('Realtime message', {
    connectionId,
    type: message.type,
    conversationId: message.conversation_id,
  });

  switch (message.type) {
    case 'ping':
      client.lastPong = Date.now();
      client.isAlive = true;
      safeSend(client.ws, { type: 'pong' });
      break;

    case 'subscribe':
      if (message.conversation_id) {
        await handleSubscribe(connectionId, message.conversation_id);
      }
      break;

    case 'user.typing':
      if (message.conversation_id && client.conversationId === message.conversation_id) {
        await broadcastToConversation(message.conversation_id, {
          type: 'user.typing',
          conversation_id: message.conversation_id,
          is_typing: message.is_typing ?? true,
        }, connectionId);
      }
      break;
  }
}

async function handleSubscribe(connectionId: string, conversationId: string) {
  const client = connections.get(connectionId);
  if (!client) return;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      appId: client.appId,
      deviceId: client.deviceId,
    },
  });

  if (!conversation) {
    safeSend(client.ws, {
      type: 'error',
      error: 'Conversation not found or access denied',
      code: 'UNAUTHORIZED_CONVERSATION',
    });
    return;
  }

  if (client.conversationId) {
    const oldClients = conversationClients.get(client.conversationId);
    if (oldClients) {
      oldClients.delete(connectionId);
      if (oldClients.size === 0) {
        conversationClients.delete(client.conversationId);
      }
    }
  }

  client.conversationId = conversationId;

  if (!conversationClients.has(conversationId)) {
    conversationClients.set(conversationId, new Set());
  }
  conversationClients.get(conversationId)!.add(connectionId);

  safeSend(client.ws, {
    type: 'subscribed',
    conversation_id: conversationId,
  });
}

function safeSend(ws: WebSocket, message: unknown): boolean {
  try {
    if (ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    if (ws.bufferedAmount > MAX_BUFFERED_AMOUNT) {
      console.warn('Client backpressure exceeded, closing connection');
      ws.close(4429, 'Backpressure exceeded');
      return false;
    }

    ws.send(JSON.stringify(message), (err) => {
      if (err) {
        console.error('WebSocket send error:', err.message);
      }
    });
    return true;
  } catch (err) {
    console.error('safeSend error:', err);
    return false;
  }
}

function localBroadcastToConversation(
  conversationId: string,
  message: unknown,
  excludeConnectionId?: string
) {
  const clientIds = conversationClients.get(conversationId);
  if (!clientIds) return;

  for (const connectionId of clientIds) {
    if (connectionId === excludeConnectionId) continue;

    const client = connections.get(connectionId);
    if (client) {
      safeSend(client.ws, message);
    }
  }
}

function localBroadcastToAdmin(conversationId: string, message: unknown) {
  const clientIds = adminConversationClients.get(conversationId);
  if (!clientIds) return;

  for (const connectionId of clientIds) {
    const client = adminConnections.get(connectionId);
    if (client) {
      safeSend(client.ws, message);
    }
  }
}

export async function broadcastToConversation(
  conversationId: string,
  message: unknown,
  excludeConnectionId?: string
) {
  localBroadcastToConversation(conversationId, message, excludeConnectionId);
  localBroadcastToAdmin(conversationId, message);

  if (isRedisReady()) {
    try {
      await publish(`conversation:${conversationId}`, {
        data: message,
        excludeConnectionId,
      });
    } catch (err) {
      console.error('Redis publish error:', err);
    }
  }
}

export async function broadcastAgentTyping(conversationId: string, isTyping: boolean) {
  await broadcastToConversation(conversationId, {
    type: 'agent.typing',
    conversation_id: conversationId,
    is_typing: isTyping,
  });
}

function removeClient(connectionId: string) {
  const client = connections.get(connectionId);
  if (client?.conversationId) {
    const clients = conversationClients.get(client.conversationId);
    if (clients) {
      clients.delete(connectionId);
      if (clients.size === 0) {
        conversationClients.delete(client.conversationId);
      }
    }
  }
  if (client) {
    void removePresence(client.appId, client.deviceId, connectionId);
    void broadcastPresenceChange(client.appId, client.deviceId, false);
  }
  connections.delete(connectionId);
  console.log('Realtime client removed', { connectionId });
}

function sendHeartbeats() {
  for (const [connectionId, client] of connections) {
    if (!client.isAlive) {
      console.log(`Client ${connectionId} failed heartbeat, terminating`);
      client.ws.terminate();
      removeClient(connectionId);
      continue;
    }

    client.isAlive = false;
    try {
      client.ws.ping();
    } catch (err) {
      console.error(`Ping failed for ${connectionId}:`, err);
      removeClient(connectionId);
    }
  }

  for (const [connectionId, client] of adminConnections) {
    if (!client.isAlive) {
      console.log(`Admin client ${connectionId} failed heartbeat, terminating`);
      client.ws.terminate();
      removeAdminClient(connectionId);
      continue;
    }

    client.isAlive = false;
    try {
      client.ws.ping();
    } catch (err) {
      console.error(`Admin ping failed for ${connectionId}:`, err);
      removeAdminClient(connectionId);
    }
  }
}

function cleanupStaleConnections() {
  const now = Date.now();

  for (const [connectionId, client] of connections) {
    if (now - client.lastPong > STALE_THRESHOLD) {
      console.log(`Removing stale connection ${connectionId}`);
      safeSend(client.ws, {
        type: 'error',
        error: 'Connection timed out',
        code: 'CONNECTION_TIMEOUT',
      });
      client.ws.close(4408, 'Connection timeout');
      removeClient(connectionId);
    }
  }

  for (const [connectionId, client] of adminConnections) {
    if (now - client.lastPong > STALE_THRESHOLD) {
      console.log(`Removing stale admin connection ${connectionId}`);
      safeSend(client.ws, {
        type: 'error',
        error: 'Connection timed out',
        code: 'CONNECTION_TIMEOUT',
      });
      client.ws.close(4408, 'Connection timeout');
      removeAdminClient(connectionId);
    }
  }
}

export function isClientConnected(deviceId: string): boolean {
  for (const client of connections.values()) {
    if (client.deviceId === deviceId && client.ws.readyState === WebSocket.OPEN) {
      return true;
    }
  }
  return false;
}

export function getConnectionCount(): number {
  return connections.size;
}

export async function gracefulShutdown(): Promise<void> {
  console.log('WebSocket graceful shutdown initiated');

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }

  for (const client of connections.values()) {
    safeSend(client.ws, {
      type: 'server.going_away',
      message: 'Server is shutting down',
    });
    client.ws.close(1001, 'Server shutdown');
  }

  connections.clear();
  conversationClients.clear();
  adminConnections.clear();
  adminConversationClients.clear();

  if (wss) {
    await new Promise<void>((resolve) => {
      wss!.close(() => {
        console.log('WebSocket server closed');
        resolve();
      });
    });
  }

  if (adminWss) {
    await new Promise<void>((resolve) => {
      adminWss!.close(() => {
        console.log('Admin WebSocket server closed');
        resolve();
      });
    });
  }
}

async function autoSubscribeToLatestConversation(
  connectionId: string,
  appId: string,
  deviceId: string
) {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { appId, deviceId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });
    if (conversation) {
      await handleSubscribe(connectionId, conversation.id);
    }
  } catch (err) {
    console.error('Auto-subscribe failed:', err);
  }
}

export async function subscribeDeviceToConversation(
  appId: string,
  deviceId: string,
  conversationId: string
): Promise<void> {
  const clients = Array.from(connections.values()).filter(
    (client) => client.appId === appId && client.deviceId === deviceId
  );

  await Promise.all(
    clients.map((client) => handleSubscribe(client.connectionId, conversationId))
  );
}

async function handleAdminConnection(
  ws: WebSocket,
  req: IncomingMessage
): Promise<{ connectionId: string } | null> {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const appId = url.searchParams.get('app_id');
  const apiKey = url.searchParams.get('api_key');

  if (!appId || !apiKey) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Missing required parameters',
      code: 'MISSING_PARAMS',
    }));
    ws.close(4400, 'Missing parameters');
    return null;
  }

  const app = await prisma.app.findUnique({ where: { id: appId } });
  if (!app || app.apiKey !== apiKey) {
    ws.send(JSON.stringify({
      type: 'error',
      error: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    }));
    ws.close(4401, 'Invalid credentials');
    return null;
  }

  const connectionId = generateConnectionId();
  const client: AdminConnection = {
    ws,
    appId,
    connectionId,
    lastPong: Date.now(),
    isAlive: true,
  };

  adminConnections.set(connectionId, client);

  safeSend(ws, {
    type: 'connection.established',
    connection_id: connectionId,
  });

  return { connectionId };
}

async function handleAdminMessage(
  connectionId: string,
  message: { type: string; conversation_id?: string }
) {
  const client = adminConnections.get(connectionId);
  if (!client) return;

  switch (message.type) {
    case 'ping':
      client.lastPong = Date.now();
      client.isAlive = true;
      safeSend(client.ws, { type: 'pong' });
      break;

    case 'subscribe':
      if (message.conversation_id) {
        await handleAdminSubscribe(connectionId, message.conversation_id);
      }
      break;

    case 'unsubscribe':
      if (message.conversation_id) {
        handleAdminUnsubscribe(connectionId, message.conversation_id);
      }
      break;
  }
}

async function handleAdminSubscribe(connectionId: string, conversationId: string) {
  const client = adminConnections.get(connectionId);
  if (!client) return;

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: conversationId,
      appId: client.appId,
    },
    select: { id: true },
  });

  if (!conversation) {
    safeSend(client.ws, {
      type: 'error',
      error: 'Conversation not found',
      code: 'CONVERSATION_NOT_FOUND',
    });
    return;
  }

  if (!adminConversationClients.has(conversationId)) {
    adminConversationClients.set(conversationId, new Set());
  }
  adminConversationClients.get(conversationId)!.add(connectionId);

  safeSend(client.ws, {
    type: 'subscribed',
    conversation_id: conversationId,
  });
}

function handleAdminUnsubscribe(connectionId: string, conversationId: string) {
  const clients = adminConversationClients.get(conversationId);
  if (clients) {
    clients.delete(connectionId);
    if (clients.size === 0) {
      adminConversationClients.delete(conversationId);
    }
  }
}

function removeAdminClient(connectionId: string) {
  for (const [conversationId, clients] of adminConversationClients) {
    if (clients.delete(connectionId) && clients.size === 0) {
      adminConversationClients.delete(conversationId);
    }
  }
  adminConnections.delete(connectionId);
}
