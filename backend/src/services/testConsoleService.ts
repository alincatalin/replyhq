import { Server, Namespace } from 'socket.io';
import { verifyAccessToken } from '../lib/jwt.js';

let testConsoleNs: Namespace | null = null;

export interface SDKEvent {
  timestamp: string;
  type: string;
  data: any;
  deviceId?: string;
  userId?: string;
  conversationId?: string;
}

/**
 * Initialize test console namespace for admin dashboard
 */
export function initializeTestConsole(io: Server): void {
  console.log('[TestConsole] Initializing test console namespace...');

  testConsoleNs = io.of('/admin/test-console');

  testConsoleNs.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      // Verify JWT token
      const payload = verifyAccessToken(token);

      // Attach payload to socket
      socket.data.user = payload;

      next();
    } catch (error) {
      console.error('[TestConsole] Authentication error:', error);
      next(new Error('Invalid token'));
    }
  });

  testConsoleNs.on('connection', (socket) => {
    const { user } = socket.data;
    const { appId } = user;

    console.log(`[TestConsole] Admin connected to test console: ${socket.id} (app: ${appId})`);

    // Join room for this app's events
    socket.join(`app:${appId}:events`);

    // Send welcome message
    socket.emit('connected', {
      message: 'Connected to test console',
      appId,
    });

    socket.on('disconnect', (reason) => {
      console.log(`[TestConsole] Admin disconnected from test console: ${socket.id} (reason: ${reason})`);
      socket.leave(`app:${appId}:events`);
    });

    // Allow admins to request event history (last N events)
    socket.on('request:history', ({ limit = 50 }: { limit?: number }) => {
      // TODO: Fetch from Redis or database
      socket.emit('history', {
        events: [],
        message: 'Event history not yet implemented',
      });
    });

    // Pause/resume event stream
    let paused = false;
    socket.on('pause', () => {
      paused = true;
      socket.emit('paused', { message: 'Event stream paused' });
    });

    socket.on('resume', () => {
      paused = false;
      socket.emit('resumed', { message: 'Event stream resumed' });
    });

    // Store pause state on socket
    socket.data.paused = () => paused;
  });

  console.log('[TestConsole] Test console namespace initialized');
}

/**
 * Broadcast SDK event to test console for specific app
 */
export async function broadcastSDKEvent(appId: string, event: SDKEvent): Promise<void> {
  if (!testConsoleNs) {
    console.warn('[TestConsole] Test console not initialized, skipping event broadcast');
    return;
  }

  const room = `app:${appId}:events`;

  // Get all sockets in the room
  const sockets = await testConsoleNs.in(room).fetchSockets();

  // Emit to non-paused sockets only
  sockets.forEach((socket) => {
    const paused = socket.data.paused?.() || false;
    if (!paused) {
      socket.emit('sdk:event', {
        ...event,
        timestamp: event.timestamp || new Date().toISOString(),
      });
    }
  });

  console.log(`[TestConsole] Broadcasted ${event.type} event to ${sockets.length} admin(s) in app ${appId}`);
}

/**
 * Helper to emit common SDK event types
 */
export const SDKEvents = {
  connection: (appId: string, deviceId: string, userId?: string) => {
    void broadcastSDKEvent(appId, {
      timestamp: new Date().toISOString(),
      type: 'connection',
      data: { deviceId, userId },
      deviceId,
      userId,
    });
  },

  disconnection: (appId: string, deviceId: string, userId?: string) => {
    void broadcastSDKEvent(appId, {
      timestamp: new Date().toISOString(),
      type: 'disconnection',
      data: { deviceId, userId },
      deviceId,
      userId,
    });
  },

  messageSent: (appId: string, conversationId: string, messageId: string, deviceId: string, userId?: string) => {
    void broadcastSDKEvent(appId, {
      timestamp: new Date().toISOString(),
      type: 'message_sent',
      data: { conversationId, messageId },
      conversationId,
      deviceId,
      userId,
    });
  },

  messageDelivered: (appId: string, conversationId: string, messageId: string, deviceId: string) => {
    void broadcastSDKEvent(appId, {
      timestamp: new Date().toISOString(),
      type: 'message_delivered',
      data: { conversationId, messageId },
      conversationId,
      deviceId,
    });
  },

  messageRead: (appId: string, conversationId: string, messageId: string, deviceId: string) => {
    void broadcastSDKEvent(appId, {
      timestamp: new Date().toISOString(),
      type: 'message_read',
      data: { conversationId, messageId },
      conversationId,
      deviceId,
    });
  },

  userIdentified: (appId: string, deviceId: string, userId: string, traits?: Record<string, any>) => {
    void broadcastSDKEvent(appId, {
      timestamp: new Date().toISOString(),
      type: 'user_identified',
      data: { deviceId, userId, traits },
      deviceId,
      userId,
    });
  },

  error: (appId: string, errorType: string, errorMessage: string, deviceId?: string) => {
    void broadcastSDKEvent(appId, {
      timestamp: new Date().toISOString(),
      type: 'error',
      data: { errorType, errorMessage },
      deviceId,
    });
  },
};

export default {
  initializeTestConsole,
  broadcastSDKEvent,
  SDKEvents,
};
