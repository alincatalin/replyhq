import 'dotenv/config';
import { createServer } from 'http';
import app from './app.js';
import { config } from './config/index.js';
import { connectDatabase, disconnectDatabase } from './lib/prisma.js';
import { initAdminWebSocket, initWebSocket, gracefulShutdown as wsGracefulShutdown } from './services/websocketService.js';
import { initSocketIO, gracefulShutdown as socketIOGracefulShutdown } from './services/socketService.js';
import { initRedis, disconnectRedis } from './lib/redis.js';
import { initFirebase } from './services/pushNotificationService.js';

let isShuttingDown = false;

async function main() {
  await connectDatabase();
  
  try {
    await initRedis();
  } catch (error) {
    console.warn('Redis not available, running without pub/sub:', (error as Error).message);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initFirebase(serviceAccount);
      console.log('Firebase initialized');
    } catch (error) {
      console.warn('Failed to initialize Firebase:', (error as Error).message);
    }
  }

  const server = createServer(app);

  // Initialize Socket.IO (new)
  await initSocketIO(server);

  // Keep old WebSocket service for backward compatibility (can be removed later)
  // await initWebSocket(server);
  // await initAdminWebSocket(server);

  server.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    console.log(`REST API: http://localhost:${config.port}/v1`);
    console.log(`Socket.IO: ws://localhost:${config.port}/v1/socket.io`);
    console.log(`Health check: http://localhost:${config.port}/health`);
  });

  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      console.log('Shutdown already in progress');
      return;
    }
    isShuttingDown = true;

    console.log(`\n${signal} received, starting graceful shutdown...`);

    server.close(() => {
      console.log('HTTP server closed');
    });

    await socketIOGracefulShutdown();
    // await wsGracefulShutdown();

    await disconnectRedis();
    await disconnectDatabase();

    console.log('Graceful shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
