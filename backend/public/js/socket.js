/**
 * Socket.IO connection manager for ReplyHQ Admin Dashboard
 * Handles real-time connections with authentication and reconnection logic
 */

let adminSocket = null;
let socketConnectionCallbacks = [];
let socketDisconnectCallbacks = [];

/**
 * Initialize Socket.IO connection for admin namespace
 * @returns {Promise<Socket>} - Socket.IO client instance
 */
async function initAdminSocket() {
  if (adminSocket && adminSocket.connected) {
    return adminSocket;
  }

  const appId = getAppId();
  const token = await getValidAccessToken();

  if (!appId || !token) {
    console.error('Cannot initialize socket: missing appId or token');
    return null;
  }

  // Socket.IO client library should be loaded via CDN in HTML
  if (typeof io === 'undefined') {
    console.error('Socket.IO client library not loaded');
    return null;
  }

  adminSocket = io('/admin', {
    path: '/api/v1/socket.io',
    auth: {
      app_id: appId,
      admin_token: token
    },
    transports: ['websocket'], // WebSocket only for better performance
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity
  });

  // Connection event handlers
  adminSocket.on('connected', (data) => {
    console.log('[Socket.IO] Connected to admin namespace', data);
    socketConnectionCallbacks.forEach(cb => cb(data));
  });

  adminSocket.on('connect', () => {
    console.log('[Socket.IO] Connection established');
  });

  adminSocket.on('disconnect', (reason) => {
    console.log('[Socket.IO] Disconnected:', reason);
    socketDisconnectCallbacks.forEach(cb => cb(reason));
  });

  adminSocket.on('connect_error', (error) => {
    console.error('[Socket.IO] Connection error:', error);

    // If auth error, try refreshing token and reconnecting
    if (error.message.includes('auth') || error.message.includes('unauthorized')) {
      getValidAccessToken().then(newToken => {
        if (newToken && adminSocket) {
          adminSocket.auth = {
            app_id: appId,
            admin_token: newToken
          };
          adminSocket.connect();
        }
      });
    }
  });

  // Graceful shutdown handler
  adminSocket.on('server:shutdown', (data) => {
    console.log('[Socket.IO] Server shutting down, will reconnect in', data.reconnect_delay_ms, 'ms');
    adminSocket.close();

    setTimeout(() => {
      if (adminSocket) {
        adminSocket.connect();
      }
    }, data.reconnect_delay_ms || 5000);
  });

  // Heartbeat (ping/pong)
  adminSocket.on('pong', () => {
    // Server acknowledged heartbeat
  });

  // Send ping every 25 seconds to keep connection alive
  setInterval(() => {
    if (adminSocket && adminSocket.connected) {
      adminSocket.emit('ping');
    }
  }, 25000);

  return adminSocket;
}

/**
 * Get admin socket instance (creates if doesn't exist)
 * @returns {Promise<Socket|null>}
 */
async function getAdminSocket() {
  if (!adminSocket || !adminSocket.connected) {
    return await initAdminSocket();
  }
  return adminSocket;
}

/**
 * Close admin socket connection
 */
function closeAdminSocket() {
  if (adminSocket) {
    adminSocket.close();
    adminSocket = null;
  }
}

/**
 * Register callback for socket connection event
 * @param {Function} callback - Function to call on connection
 */
function onSocketConnect(callback) {
  socketConnectionCallbacks.push(callback);
}

/**
 * Register callback for socket disconnection event
 * @param {Function} callback - Function to call on disconnection
 */
function onSocketDisconnect(callback) {
  socketDisconnectCallbacks.push(callback);
}

/**
 * Join a conversation room for real-time updates
 * @param {string} conversationId - Conversation ID to join
 * @returns {Promise<any>} - Server response
 */
async function joinConversation(conversationId) {
  const socket = await getAdminSocket();
  if (!socket) return null;

  return new Promise((resolve, reject) => {
    socket.emit('conversation:join', { conversation_id: conversationId }, (response) => {
      if (response.error) {
        reject(new Error(response.error));
      } else {
        console.log('[Socket.IO] Joined conversation:', conversationId, response);
        resolve(response);
      }
    });
  });
}

/**
 * Leave a conversation room
 * @param {string} conversationId - Conversation ID to leave
 */
async function leaveConversation(conversationId) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.emit('conversation:leave', { conversation_id: conversationId });
  console.log('[Socket.IO] Left conversation:', conversationId);
}

/**
 * Send typing start indicator
 * @param {string} conversationId - Conversation ID
 */
async function sendTypingStart(conversationId) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.emit('typing:start', { conversation_id: conversationId });
}

/**
 * Send typing stop indicator
 * @param {string} conversationId - Conversation ID
 */
async function sendTypingStop(conversationId) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.emit('typing:stop', { conversation_id: conversationId });
}

/**
 * Listen for new messages
 * @param {Function} callback - Function to call when message received
 */
async function onNewMessage(callback) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.on('message:new', callback);
}

/**
 * Listen for user typing events
 * @param {Function} callback - Function to call when user typing status changes
 */
async function onUserTyping(callback) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.on('user:typing', callback);
}

/**
 * Listen for agent typing events
 * @param {Function} callback - Function to call when agent typing status changes
 */
async function onAgentTyping(callback) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.on('agent:typing', callback);
}

/**
 * Listen for session connect events (user came online)
 * @param {Function} callback - Function to call when user connects
 */
async function onSessionConnect(callback) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.on('session:connect', callback);
}

/**
 * Listen for session disconnect events (user went offline)
 * @param {Function} callback - Function to call when user disconnects
 */
async function onSessionDisconnect(callback) {
  const socket = await getAdminSocket();
  if (!socket) return;

  socket.on('session:disconnect', callback);
}

/**
 * Remove all socket event listeners (cleanup)
 */
function removeAllSocketListeners() {
  if (adminSocket) {
    adminSocket.off('message:new');
    adminSocket.off('user:typing');
    adminSocket.off('agent:typing');
    adminSocket.off('session:connect');
    adminSocket.off('session:disconnect');
    adminSocket.off('conversation:joined');
  }
}
