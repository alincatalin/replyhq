import { Router, Request, Response, IRouter } from 'express';
import { getConnectionCount } from '../services/websocketService.js';

const router: IRouter = Router();

router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    websocket_connections: getConnectionCount(),
  });
});

export default router;
