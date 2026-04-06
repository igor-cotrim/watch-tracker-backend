import type { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('Unhandled error:', err);

  const isDev = process.env.NODE_ENV !== 'production';

  res.status(500).json({
    error: 'Internal server error',
    ...(isDev && { message: err.message }),
  });
}
