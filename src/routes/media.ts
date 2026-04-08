import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userRatings, userEpisodesWatched } from '../db/schema.js';
import { authMiddleware } from '../middleware/auth.js';
import { tmdbService } from '../services/tmdb.js';
import type { AuthenticatedRequest } from '../types/index.js';
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

    const details = await tmdbService.getMediaDetails(mediaId, type as MediaType);
    res.json(details);
  } catch (error) {
    next(error);
  }
});

// GET /tv/:id/season/:seasonNumber — get season details from TMDB (no auth)
router.get('/tv/:id/season/:seasonNumber', async (req, res, next) => {
  try {
    const tvId = parseInt(req.params.id, 10);
    const seasonNumber = parseInt(req.params.seasonNumber, 10);

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
router.post('/:type/:id/rate', authMiddleware as any, async (req, res, next) => {
  try {
    const userId = (req as unknown as AuthenticatedRequest).user.id;
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

    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid rating', details: parsed.error.issues });
      return;
    }

    const [rating] = await db
      .insert(userRatings)
      .values({
        userId,
        tmdbId: mediaId,
        mediaType: type,
        rating: parsed.data.rating,
      })
      .returning();

    res.status(201).json(rating);
  } catch (error) {
    next(error);
  }
});

// POST /tv/:id/episodes/:seasonNumber/:episodeNumber/watch — mark episode watched (auth required)
router.post(
  '/tv/:id/episodes/:seasonNumber/:episodeNumber/watch',
  authMiddleware as any,
  async (req, res, next) => {
    try {
      const userId = (req as unknown as AuthenticatedRequest).user.id;
      const tvId = parseInt(req.params.id, 10);
      const seasonNumber = parseInt(req.params.seasonNumber, 10);
      const episodeNumber = parseInt(req.params.episodeNumber, 10);

      if (isNaN(tvId) || isNaN(seasonNumber) || isNaN(episodeNumber)) {
        res.status(400).json({ error: 'Invalid TV ID, season number, or episode number' });
        return;
      }

      const [episode] = await db
        .insert(userEpisodesWatched)
        .values({
          userId,
          tmdbId: tvId,
          seasonNumber,
          episodeNumber,
        })
        .returning();

      res.status(201).json(episode);
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /tv/:id/episodes/:seasonNumber/:episodeNumber/watch — unmark episode watched (auth required)
router.delete(
  '/tv/:id/episodes/:seasonNumber/:episodeNumber/watch',
  authMiddleware as any,
  async (req, res, next) => {
    try {
      const userId = (req as unknown as AuthenticatedRequest).user.id;
      const tvId = parseInt(req.params.id, 10);
      const seasonNumber = parseInt(req.params.seasonNumber, 10);
      const episodeNumber = parseInt(req.params.episodeNumber, 10);

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

// POST /tv/:id/seasons/:seasonNumber/watch — mark all episodes in season as watched (auth required)
router.post(
  '/tv/:id/seasons/:seasonNumber/watch',
  authMiddleware as any,
  async (req, res, next) => {
    try {
      const userId = (req as unknown as AuthenticatedRequest).user.id;
      const tvId = parseInt(req.params.id, 10);
      const seasonNumber = parseInt(req.params.seasonNumber, 10);

      if (isNaN(tvId) || isNaN(seasonNumber)) {
        res.status(400).json({ error: 'Invalid TV ID or season number' });
        return;
      }

      const season = await tmdbService.getSeasonDetails(tvId, seasonNumber);
      const episodeNumbers = season.episodes.map((e) => e.episode_number);

      // Check which episodes are already watched
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
        .map((ep) => ({
          userId,
          tmdbId: tvId,
          seasonNumber,
          episodeNumber: ep,
        }));

      if (toInsert.length > 0) {
        await db.insert(userEpisodesWatched).values(toInsert);
      }

      res.status(201).json({ message: `Marked ${toInsert.length} episodes as watched` });
    } catch (error) {
      next(error);
    }
  },
);

// DELETE /tv/:id/seasons/:seasonNumber/watch — unmark all episodes in season (auth required)
router.delete(
  '/tv/:id/seasons/:seasonNumber/watch',
  authMiddleware as any,
  async (req, res, next) => {
    try {
      const userId = (req as unknown as AuthenticatedRequest).user.id;
      const tvId = parseInt(req.params.id, 10);
      const seasonNumber = parseInt(req.params.seasonNumber, 10);

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
  },
);

export default router;
