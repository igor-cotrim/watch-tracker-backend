import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userWatchlist } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../types/index.js';

const router = Router();

const addToWatchlistSchema = z.object({
  tmdb_id: z.number().int().positive(),
  media_type: z.enum(['movie', 'tv']),
  status: z.enum(['watching', 'completed', 'plan_to_watch', 'dropped']),
});

// All routes require authentication
router.use(authMiddleware as any);

// GET / — get user's watchlist with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { status, media_type } = req.query;
    const userId = (req as AuthenticatedRequest).user.id;

    const conditions = [eq(userWatchlist.userId, userId)];

    if (status && typeof status === 'string') {
      conditions.push(eq(userWatchlist.status, status));
    }

    if (media_type && typeof media_type === 'string') {
      conditions.push(eq(userWatchlist.mediaType, media_type));
    }

    const items = await db
      .select()
      .from(userWatchlist)
      .where(and(...conditions));

    res.json(items);
  } catch (error) {
    next(error);
  }
});

// POST / — add item to watchlist
router.post('/', async (req, res, next) => {
  try {
    const userId = (req as AuthenticatedRequest).user.id;
    const parsed = addToWatchlistSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    const { tmdb_id, media_type, status } = parsed.data;

    const [item] = await db
      .insert(userWatchlist)
      .values({
        userId,
        tmdbId: tmdb_id,
        mediaType: media_type,
        status,
      })
      .returning();

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

// DELETE /:id — remove item from watchlist (verify ownership)
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = (req as unknown as AuthenticatedRequest).user.id;
    const itemId = parseInt(req.params.id, 10);

    if (isNaN(itemId)) {
      res.status(400).json({ error: 'Invalid item ID' });
      return;
    }

    const [existing] = await db
      .select()
      .from(userWatchlist)
      .where(and(eq(userWatchlist.id, itemId), eq(userWatchlist.userId, userId)));

    if (!existing) {
      res.status(404).json({ error: 'Item not found or not owned by user' });
      return;
    }

    await db
      .delete(userWatchlist)
      .where(eq(userWatchlist.id, itemId));

    res.json({ message: 'Item removed from watchlist' });
  } catch (error) {
    next(error);
  }
});

export default router;
