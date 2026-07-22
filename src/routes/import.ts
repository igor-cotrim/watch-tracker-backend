import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { userWatchlist, userRatings } from '../db/schema.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { languageMiddleware } from '../middleware/language.js';
import { tmdbService } from '../services/tmdb.js';

const router = Router();

router.use(languageMiddleware);
router.use(authMiddleware);

const importItemSchema = z.object({
  title: z.string().min(1),
  year: z.number().int().optional(),
  status: z.enum(['completed', 'plan_to_watch']).optional(),
  // Client normalizes Letterboxd's 0.5–5.0 stars to the backend's 1–10 int scale.
  rating: z.number().int().min(1).max(10).optional(),
  // ISO date string; used to preserve the original watch/rating date.
  watched_date: z.string().optional(),
});

const importSchema = z.object({
  source: z.literal('letterboxd'),
  // The client sends the library in batches to keep each request small.
  items: z.array(importItemSchema).min(1).max(200),
});

type ImportItem = z.infer<typeof importItemSchema>;

/**
 * Runs `fn` over `items` with at most `limit` concurrent executions, preserving
 * input order in the returned array. Used to throttle TMDB resolution calls.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Parses a Date from an ISO-ish string, returning undefined if invalid. */
function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Resolves a Letterboxd title (+ optional year) to a TMDB movie id. Searches
 * with the year filter first, then falls back to a title-only search so an
 * off-by-one year in the export doesn't cause a false miss.
 */
async function resolveTmdbId(
  item: ImportItem,
  language: 'en-US' | 'pt-BR',
): Promise<number | null> {
  const withYear = await tmdbService.search(item.title, language, 'movie', item.year);
  if (withYear.results[0]) return withYear.results[0].id;

  if (item.year) {
    const withoutYear = await tmdbService.search(item.title, language, 'movie');
    if (withoutYear.results[0]) return withoutYear.results[0].id;
  }

  return null;
}

// POST / — import a batch of movies (watchlist status + ratings) from Letterboxd
router.post('/', async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);

    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    const { items } = parsed.data;
    const unmatched: Array<{ title: string; year?: number }> = [];

    // Resolve all titles → TMDB ids (throttled), keeping input order.
    const resolvedIds = await mapWithConcurrency(items, 6, async (item) => {
      try {
        return await resolveTmdbId(item, req.language);
      } catch {
        return null;
      }
    });

    const matched: Array<{ item: ImportItem; tmdbId: number }> = [];
    resolvedIds.forEach((tmdbId, index) => {
      if (tmdbId !== null) {
        matched.push({ item: items[index], tmdbId });
      } else {
        unmatched.push({ title: items[index].title, year: items[index].year });
      }
    });

    let watchlistCount = 0;
    let ratingsCount = 0;

    // Idempotent upserts — safe to re-run the same import without duplicating rows.
    for (const { item, tmdbId } of matched) {
      const watchedAt = parseDate(item.watched_date);

      if (item.rating != null) {
        await db
          .insert(userRatings)
          .values({
            userId,
            tmdbId,
            mediaType: 'movie',
            rating: item.rating,
            ...(watchedAt ? { createdAt: watchedAt } : {}),
          })
          .onConflictDoUpdate({
            target: [userRatings.userId, userRatings.tmdbId, userRatings.mediaType],
            set: { rating: item.rating },
          });
        ratingsCount++;
      }

      if (item.status) {
        const values = {
          userId,
          tmdbId,
          mediaType: 'movie',
          status: item.status,
          ...(watchedAt ? { addedAt: watchedAt } : {}),
        };

        if (item.status === 'completed') {
          // 'completed' always wins over an existing status.
          await db
            .insert(userWatchlist)
            .values(values)
            .onConflictDoUpdate({
              target: [userWatchlist.userId, userWatchlist.tmdbId, userWatchlist.mediaType],
              set: { status: 'completed' },
            });
        } else {
          // 'plan_to_watch' never downgrades an existing entry (e.g. 'completed').
          await db.insert(userWatchlist).values(values).onConflictDoNothing();
        }
        watchlistCount++;
      }
    }

    res.status(200).json({
      total: items.length,
      matched: matched.length,
      imported: { watchlist: watchlistCount, ratings: ratingsCount },
      unmatched,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
