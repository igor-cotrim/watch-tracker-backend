import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { sql } from 'drizzle-orm';
import { env } from './config/env.js';
import { db } from './db/index.js';
import watchlistRoutes from './routes/watchlist.js';
import mediaRoutes from './routes/media.js';
import discoverRoutes from './routes/discover.js';
import profileRoutes from './routes/profile.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security
app.use(helmet());
app.use(cors());

// Compression
app.use(compression());

// Logging
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const discoverLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

app.use('/api/', apiLimiter);
app.use('/api/discover', discoverLimiter);

// Body parsing
app.use(express.json());

// Routes
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/discover', discoverRoutes);
app.use('/api/profile', profileRoutes);

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await db.execute(sql`SELECT 1`);
    res.json({ status: 'ok', db: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'degraded', db: 'error', timestamp: new Date().toISOString() });
  }
});

// Global error handler
app.use(errorHandler);

export default app;
