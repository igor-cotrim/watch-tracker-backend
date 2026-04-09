import 'dotenv/config';
import app from './app.js';
import { env } from './config/env.js';

const server = app.listen(env.PORT, () => {
  console.warn(`WatchTracker API running on http://localhost:${env.PORT}`);
});

const shutdown = (signal: string) => {
  console.warn(`${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.warn('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
