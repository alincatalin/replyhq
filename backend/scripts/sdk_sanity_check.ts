import { createServer } from 'http';
import { io as ioClient } from 'socket.io-client';
import crypto from 'crypto';
import app from '../src/app.js';
import { initSocketIO, gracefulShutdown as socketGracefulShutdown } from '../src/services/socketService.js';
import { connectDatabase, disconnectDatabase, prisma } from '../src/lib/prisma.js';
import { generateApiKey, hashApiKey } from '../src/lib/apiKey.js';

async function run() {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);
  let server: ReturnType<typeof createServer> | null = null;
  let socket: ReturnType<typeof ioClient> | null = null;
  let appRecord: { id: string } | null = null;

  const withTimeout = <T>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(message)), ms);
      promise.then((value) => {
        clearTimeout(timeout);
        resolve(value);
      }).catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  };

  try {
    await connectDatabase();

    appRecord = await prisma.app.create({
      data: {
        name: `sdk-sanity-${Date.now()}`,
        apiKeyHash,
      },
    });

    const deviceId = crypto.randomUUID();

    server = createServer((req, res) => {
      app(req, res);
    });

    await initSocketIO(server);

    await new Promise<void>((resolve) => server!.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to bind server');
    }
    const port = address.port;
    const baseUrl = `http://127.0.0.1:${port}/v1`;

    const headers = {
      'Content-Type': 'application/json',
      'X-App-Id': appRecord.id,
      'X-Api-Key': apiKey,
      'X-Device-Id': deviceId,
      'X-SDK-Version': 'sdk-sanity-check',
    };

    const createConversationRes = await fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user: { id: 'user_123', name: 'Sanity User' },
        device_context: {
          platform: 'ios',
          os_version: 'iOS 17.0',
          app_version: '1.0.0',
          device_model: 'iPhone',
          locale: 'en-US',
          timezone: 'UTC',
          sdk_version: 'sdk-sanity-check',
        },
      }),
    });

    if (!createConversationRes.ok) {
      throw new Error(`Create conversation failed: ${createConversationRes.status}`);
    }

    const conversationData = await createConversationRes.json();
    const conversationId = conversationData.conversation?.id;
    if (!conversationId) {
      throw new Error('Conversation id missing');
    }

    socket = ioClient(`http://127.0.0.1:${port}/client`, {
      path: '/v1/socket.io',
      transports: ['websocket'],
      auth: {
        app_id: appRecord.id,
        device_id: deviceId,
        api_key: apiKey,
      },
      timeout: 5000,
    });

    await withTimeout(new Promise<void>((resolve, reject) => {
      socket!.once('connected', () => resolve());
      socket!.once('connect_error', () => reject(new Error('connect_error')));
    }), 5000, 'Socket.IO did not connect');

    socket!.emit('conversation:join', { conversation_id: conversationId });

    const localId = crypto.randomUUID();
    const messagePromise = withTimeout(new Promise<void>((resolve) => {
      socket!.on('message:new', (payload) => {
        if (payload?.conversation_id !== conversationId) return;
        if (payload?.local_id === localId || payload?.body === 'Hello from sanity check') {
          resolve();
        }
      });
    }), 5000, 'Did not receive realtime message');

    const sendMessageRes = await fetch(`${baseUrl}/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        local_id: localId,
        body: 'Hello from sanity check',
      }),
    });

    if (!sendMessageRes.ok) {
      throw new Error(`Send message failed: ${sendMessageRes.status}`);
    }

    await messagePromise;

    console.log('SDK sanity check passed');
  } finally {
    try {
      socket?.disconnect();
    } catch (e) {
      // ignore
    }
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await socketGracefulShutdown();
    if (appRecord) {
      await prisma.message.deleteMany({ where: { appId: appRecord.id } }).catch(() => undefined);
      await prisma.conversation.deleteMany({ where: { appId: appRecord.id } }).catch(() => undefined);
      await prisma.device.deleteMany({ where: { appId: appRecord.id } }).catch(() => undefined);
      await prisma.app.delete({ where: { id: appRecord.id } }).catch(() => undefined);
    }
    await disconnectDatabase();
  }
}

run().catch(async (error) => {
  console.error('SDK sanity check failed:', error);
  try {
    await disconnectDatabase();
  } catch (e) {
    // ignore
  }
  process.exit(1);
});
