import { Router } from 'express';
import { eq, and, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userWatchlist, userEpisodesWatched, userRatings, profiles } from '../db/schema.js';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

// GET /api/profile/stats — aggregate watchlist stats for the authenticated user
router.get('/stats', async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);

    const [moviesWatched, moviesInWatchlist, showsTracking, showsCompleted, episodesWatched] =
      await Promise.all([
        db
          .select({ value: count() })
          .from(userWatchlist)
          .where(
            and(
              eq(userWatchlist.userId, userId),
              eq(userWatchlist.mediaType, 'movie'),
              eq(userWatchlist.status, 'completed'),
            ),
          ),
        db
          .select({ value: count() })
          .from(userWatchlist)
          .where(and(eq(userWatchlist.userId, userId), eq(userWatchlist.mediaType, 'movie'))),
        db
          .select({ value: count() })
          .from(userWatchlist)
          .where(and(eq(userWatchlist.userId, userId), eq(userWatchlist.mediaType, 'tv'))),
        db
          .select({ value: count() })
          .from(userWatchlist)
          .where(
            and(
              eq(userWatchlist.userId, userId),
              eq(userWatchlist.mediaType, 'tv'),
              eq(userWatchlist.status, 'completed'),
            ),
          ),
        db
          .select({ value: count() })
          .from(userEpisodesWatched)
          .where(eq(userEpisodesWatched.userId, userId)),
      ]);

    res.json({
      movies_watched: Number(moviesWatched[0]?.value ?? 0),
      movies_in_watchlist: Number(moviesInWatchlist[0]?.value ?? 0),
      shows_tracking: Number(showsTracking[0]?.value ?? 0),
      shows_completed: Number(showsCompleted[0]?.value ?? 0),
      episodes_watched: Number(episodesWatched[0]?.value ?? 0),
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/profile — permanently delete the authenticated user's account and all data
router.delete('/', async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);

    // Delete all user-owned rows atomically. There is no ON DELETE CASCADE and the
    // FKs reference public.profiles, so children must be removed before profiles.
    await db.transaction(async (tx) => {
      await tx.delete(userWatchlist).where(eq(userWatchlist.userId, userId));
      await tx.delete(userEpisodesWatched).where(eq(userEpisodesWatched.userId, userId));
      await tx.delete(userRatings).where(eq(userRatings.userId, userId));
      await tx.delete(profiles).where(eq(profiles.id, userId));
    });

    // Delete the Supabase auth user so the login is fully removed.
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ message: 'Account deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
