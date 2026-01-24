import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function generateApiKey(): string {
  return `key_${uuidv4().replace(/-/g, '')}`;
}

router.get('/', (_req, res) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
  );
  const filePath = path.join(__dirname, '../setup/index.html');
  res.sendFile(filePath);
});

router.get('/api/apps', async (_req, res, next) => {
  try {
    const apps = await prisma.app.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        apiKey: true,
        createdAt: true,
      },
    });

    res.json({
      apps: apps.map((app) => ({
        id: app.id,
        name: app.name,
        api_key: app.apiKey,
        created_at: app.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/apps', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const name = (req.body?.name as string | undefined)?.trim();

    if (!name) {
      return res.status(400).json({
        error: 'App name is required',
        code: 'MISSING_NAME',
      });
    }

    const app = await prisma.app.create({
      data: {
        name,
        apiKey: generateApiKey(),
      },
    });

    res.json({
      app: {
        id: app.id,
        name: app.name,
        api_key: app.apiKey,
        created_at: app.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
