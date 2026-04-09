import type { Request, Response, NextFunction } from 'express';
import { TMDBError } from '../services/tmdb.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error('Unhandled error:', err);

  if (err instanceof TMDBError) {
    // Treat TMDB 5xx as 502 Bad Gateway; pass through 4xx as-is
    const status = err.statusCode >= 500 ? 502 : err.statusCode;
    res.status(status).json({ error: err.message });
    return;
  }

  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: 'Internal server error',
    ...(isDev && { message: err.message }),
  });
}
