import express, { Request, Response, NextFunction, type IRouter } from 'express';
import path from 'path';
import { prisma } from '../lib/prisma.js';
import { validateMasterApiKey } from '../middleware/auth.js';
import { generateApiKey, hashApiKey } from '../lib/apiKey.js';

const router: IRouter = express.Router();

router.get('/', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  const filePath = path.join(__dirname, '../setup/index.html');
  res.sendFile(filePath);
});

router.get('/api/apps', validateMasterApiKey, async (_req, res, next) => {
  try {
    const apps = await prisma.app.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
      },
    });

    res.json({
      apps: apps.map((app) => ({
        id: app.id,
        name: app.name,
        created_at: app.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/apps', validateMasterApiKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = (req.body?.name as string | undefined)?.trim();

    if (!name) {
      return res.status(400).json({
        error: 'App name is required',
        code: 'MISSING_NAME',
      });
    }

    const apiKey = generateApiKey();
    const apiKeyHash = hashApiKey(apiKey);

    const app = await prisma.app.create({
      data: {
        name,
        apiKeyHash,
      },
    });

    res.json({
      app: {
        id: app.id,
        name: app.name,
        api_key: apiKey,
        created_at: app.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
