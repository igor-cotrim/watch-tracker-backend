import type { Request, Response, NextFunction } from 'express';

interface CacheEntry {
  body: unknown;
  expiresAt: number;
}

const MAX_ENTRIES = 500;
const store = new Map<string, CacheEntry>();

/**
 * In-memory response cache for idempotent GET routes. Keyed by the full URL
 * (path + query, including `language`). On a hit within the TTL the cached JSON
 * is served without invoking the route handler, sparing a TMDB round-trip. Also
 * sets `Cache-Control` so the iOS `URLSession` cache serves repeats client-side.
 *
 * Note: the store is per-instance and is cleared on Cloud Run cold starts — it
 * still absorbs request bursts within a warm instance, and the `Cache-Control`
 * header covers the rest on the client.
 */
export function cacheMiddleware(ttlSeconds: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const key = req.originalUrl;
    const cached = store.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
      res.setHeader('X-Cache', 'HIT');
      res.json(cached.body);
      return;
    }

    if (cached) {
      store.delete(key);
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown): Response => {
      // Only cache successful responses.
      if (res.statusCode >= 200 && res.statusCode < 300) {
        if (store.size >= MAX_ENTRIES) {
          const oldest = store.keys().next().value;
          if (oldest !== undefined) {
            store.delete(oldest);
          }
        }
        store.set(key, { body, expiresAt: Date.now() + ttlSeconds * 1000 });
        res.setHeader('Cache-Control', `public, max-age=${ttlSeconds}`);
        res.setHeader('X-Cache', 'MISS');
      }
      return originalJson(body);
    };

    next();
  };
}
