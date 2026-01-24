import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { validateHeaders } from './middleware/headers.js';
import { validateAppId } from './middleware/appValidator.js';
import { errorHandler } from './middleware/errorHandler.js';
import conversationsRouter from './routes/conversations.js';
import pushTokenRouter from './routes/pushToken.js';
import healthRouter from './routes/health.js';
import adminRouter from './routes/admin.js';
import setupRouter from './routes/setup.js';

const app: Express = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(morgan('combined'));

app.use('/health', healthRouter);
app.use('/admin', adminRouter);
app.use('/setup', setupRouter);

app.use('/v1', validateHeaders);
app.use('/v1', validateAppId);

app.use('/v1/conversations', conversationsRouter);
app.use('/v1/push-token', pushTokenRouter);

app.use(errorHandler);

export default app;
