import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, isUniqueConstraintError } from '../db/index.js';
import { userRatings, userEpisodesWatched } from '../db/schema.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { tmdbService } from '../services/tmdb.js';
import type { MediaType } from '../types/index.js';

const router = Router();

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(10),
});

// GET /:type/:id — get media details from TMDB (no auth)
router.get('/:type/:id', async (req, res, next) => {
  try {
    const { type, id } = req.params;

    if (type !== 'movie' && type !== 'tv') {
      res.status(400).json({ error: 'Type must be "movie" or "tv"' });
      return;
    }

    const mediaId = parseInt(id, 10);
    if (isNaN(mediaId)) {
      res.status(400).json({ error: 'Invalid media ID' });
      return;
    }

    const raw = await tmdbService.getMediaDetails(mediaId, type as MediaType);
    // Rename "watch/providers" to "watch_providers" so iOS snake_case decoder maps it to watchProviders
    const { 'watch/providers': watchProviders, ...rest } = raw;
    res.json({ ...rest, watch_providers: watchProviders });
  } catch (error) {
    next(error);
  }
});

// GET /tv/:id/season/:seasonNumber — get season details from TMDB (no auth)
router.get('/tv/:id/season/:seasonNumber', async (req, res, next) => {
  try {
    const tvId = parseInt(String(req.params.id), 10);
    const seasonNumber = parseInt(String(req.params.seasonNumber), 10);

    if (isNaN(tvId) || isNaN(seasonNumber)) {
      res.status(400).json({ error: 'Invalid TV ID or season number' });
      return;
    }

    const season = await tmdbService.getSeasonDetails(tvId, seasonNumber);
    res.json(season);
  } catch (error) {
    next(error);
  }
});

// POST /:type/:id/rate — save user rating (auth required)
router.post('/:type/:id/rate', authMiddleware, async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);
    const type = String(req.params.type);
    const id = String(req.params.id);

    if (type !== 'movie' && type !== 'tv') {
      res.status(400).json({ error: 'Type must be "movie" or "tv"' });
      return;
    }

    const mediaId = parseInt(id, 10);
    if (isNaN(mediaId)) {
      res.status(400).json({ error: 'Invalid media ID' });
      return;
    }

    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid rating', details: parsed.error.issues });
      return;
    }

    try {
      const [rating] = await db
        .insert(userRatings)
        .values({ userId, tmdbId: mediaId, mediaType: type, rating: parsed.data.rating })
        .returning();

      res.status(201).json(rating);
    } catch (dbError) {
      if (isUniqueConstraintError(dbError)) {
        res.status(409).json({ error: 'You have already rated this media' });
        return;
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
});

// POST /tv/:id/episodes/:seasonNumber/:episodeNumber/watch — mark episode watched (auth required)
router.post(
  '/tv/:id/episodes/:seasonNumber/:episodeNumber/watch',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { id: userId } = getAuthUser(req);
      const tvId = parseInt(String(req.params.id), 10);
      const seasonNumber = parseInt(String(req.params.seasonNumber), 10);
      const episodeNumber = parseInt(String(req.params.episodeNumber), 10);

      if (isNaN(tvId) || isNaN(seasonNumber) || isNaN(episodeNumber)) {
        res.status(400).json({ error: 'Invalid TV ID, season number, or episode number' });
        return;
      }

      try {
        const [episode] = await db
          .insert(userEpisodesWatched)
          .values({ userId, tmdbId: tvId, seasonNumber, episodeNumber })
          .returning();

        res.status(201).json(episode);
      } catch (dbError) {
        if (isUniqueConstraintError(dbError)) {
          res.status(409).json({ error: 'Episode already marked as watched' });
          return;
        }
        throw dbError;
      }
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /tv/:id/episodes/:seasonNumber/:episodeNumber/watch — unmark episode watched (auth required)
router.delete(
  '/tv/:id/episodes/:seasonNumber/:episodeNumber/watch',
  authMiddleware,
  async (req, res, next) => {
    try {
      const { id: userId } = getAuthUser(req);
      const tvId = parseInt(String(req.params.id), 10);
      const seasonNumber = parseInt(String(req.params.seasonNumber), 10);
      const episodeNumber = parseInt(String(req.params.episodeNumber), 10);

      if (isNaN(tvId) || isNaN(seasonNumber) || isNaN(episodeNumber)) {
        res.status(400).json({ error: 'Invalid TV ID, season number, or episode number' });
        return;
      }

      await db
        .delete(userEpisodesWatched)
        .where(
          and(
            eq(userEpisodesWatched.userId, userId),
            eq(userEpisodesWatched.tmdbId, tvId),
            eq(userEpisodesWatched.seasonNumber, seasonNumber),
            eq(userEpisodesWatched.episodeNumber, episodeNumber),
          ),
        );

      res.json({ message: 'Episode unmarked as watched' });
    } catch (error) {
      next(error);
    }
  },
);

// GET /tv/:id/seasons/:seasonNumber/watched — get watched episode numbers for a season (auth required)
router.get('/tv/:id/seasons/:seasonNumber/watched', authMiddleware, async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);
    const tvId = parseInt(String(req.params.id), 10);
    const seasonNumber = parseInt(String(req.params.seasonNumber), 10);

    if (isNaN(tvId) || isNaN(seasonNumber)) {
      res.status(400).json({ error: 'Invalid TV ID or season number' });
      return;
    }

    const watched = await db
      .select()
      .from(userEpisodesWatched)
      .where(
        and(
          eq(userEpisodesWatched.userId, userId),
          eq(userEpisodesWatched.tmdbId, tvId),
          eq(userEpisodesWatched.seasonNumber, seasonNumber),
        ),
      );

    res.json({ watchedEpisodes: watched.map((e) => e.episodeNumber) });
  } catch (error) {
    next(error);
  }
});

// POST /tv/:id/seasons/:seasonNumber/watch — mark all episodes in season as watched (auth required)
router.post('/tv/:id/seasons/:seasonNumber/watch', authMiddleware, async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);
    const tvId = parseInt(String(req.params.id), 10);
    const seasonNumber = parseInt(String(req.params.seasonNumber), 10);

    if (isNaN(tvId) || isNaN(seasonNumber)) {
      res.status(400).json({ error: 'Invalid TV ID or season number' });
      return;
    }

    const season = await tmdbService.getSeasonDetails(tvId, seasonNumber);
    const episodeNumbers = season.episodes.map((e) => e.episode_number);

    const existing = await db
      .select()
      .from(userEpisodesWatched)
      .where(
        and(
          eq(userEpisodesWatched.userId, userId),
          eq(userEpisodesWatched.tmdbId, tvId),
          eq(userEpisodesWatched.seasonNumber, seasonNumber),
        ),
      );

    const existingEpisodes = new Set(existing.map((e) => e.episodeNumber));
    const toInsert = episodeNumbers
      .filter((ep) => !existingEpisodes.has(ep))
      .map((ep) => ({ userId, tmdbId: tvId, seasonNumber, episodeNumber: ep }));

    if (toInsert.length > 0) {
      await db.insert(userEpisodesWatched).values(toInsert);
    }

    res.status(201).json({ message: `Marked ${toInsert.length} episodes as watched` });
  } catch (error) {
    next(error);
  }
});

// DELETE /tv/:id/seasons/:seasonNumber/watch — unmark all episodes in season (auth required)
router.delete('/tv/:id/seasons/:seasonNumber/watch', authMiddleware, async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);
    const tvId = parseInt(String(req.params.id), 10);
    const seasonNumber = parseInt(String(req.params.seasonNumber), 10);

    if (isNaN(tvId) || isNaN(seasonNumber)) {
      res.status(400).json({ error: 'Invalid TV ID or season number' });
      return;
    }

    await db
      .delete(userEpisodesWatched)
      .where(
        and(
          eq(userEpisodesWatched.userId, userId),
          eq(userEpisodesWatched.tmdbId, tvId),
          eq(userEpisodesWatched.seasonNumber, seasonNumber),
        ),
      );

    res.json({ message: 'Season unmarked as watched' });
  } catch (error) {
    next(error);
  }
});

export default router;
