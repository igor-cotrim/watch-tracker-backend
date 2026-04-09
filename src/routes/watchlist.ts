import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db, isUniqueConstraintError } from '../db/index.js';
import { userWatchlist, userEpisodesWatched } from '../db/schema.js';
import { authMiddleware, getAuthUser } from '../middleware/auth.js';
import { tmdbService } from '../services/tmdb.js';
import { GENRE_ID } from '../config/constants.js';
import type { MediaType } from '../types/index.js';

const router = Router();

const addToWatchlistSchema = z.object({
  tmdb_id: z.number().int().positive(),
  media_type: z.enum(['movie', 'tv']),
  status: z.enum(['watching', 'completed', 'plan_to_watch', 'dropped']),
});

// All routes require authentication
router.use(authMiddleware);

// GET / — get user's watchlist with optional filters
router.get('/', async (req, res, next) => {
  try {
    const { status, media_type } = req.query;
    const { id: userId } = getAuthUser(req);

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

    // Enrich with TMDB data (title, poster, isAnime)
    const enriched = await Promise.all(
      items.map(async (item) => {
        try {
          const details = await tmdbService.getMediaDetails(
            item.tmdbId,
            item.mediaType as MediaType,
          );
          const isAnime =
            item.mediaType === 'tv' &&
            Array.isArray(details.origin_country) &&
            details.origin_country.includes('JP') &&
            details.genres?.some((g) => g.id === GENRE_ID.ANIMATION);
          return {
            ...item,
            title: details.title ?? details.name ?? 'Unknown',
            posterPath: details.poster_path,
            isAnime: isAnime || false,
          };
        } catch {
          return { ...item, title: 'Unknown', posterPath: null, isAnime: false };
        }
      }),
    );

    res.json(enriched);
  } catch (error) {
    next(error);
  }
});

// POST / — add item to watchlist
router.post('/', async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);
    const parsed = addToWatchlistSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues });
      return;
    }

    const { tmdb_id, media_type, status } = parsed.data;

    try {
      const [item] = await db
        .insert(userWatchlist)
        .values({ userId, tmdbId: tmdb_id, mediaType: media_type, status })
        .returning();

      res.status(201).json(item);
    } catch (dbError) {
      if (isUniqueConstraintError(dbError)) {
        res.status(409).json({ error: 'Item already in watchlist' });
        return;
      }
      throw dbError;
    }
  } catch (error) {
    next(error);
  }
});

// GET /continue-watching — TV shows with status "watching" and their next unwatched episode
router.get('/continue-watching', async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);

    const watchingShows = await db
      .select()
      .from(userWatchlist)
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.status, 'watching'),
          eq(userWatchlist.mediaType, 'tv'),
        ),
      );

    const results = await Promise.allSettled(
      watchingShows.map(async (show) => {
        const [details, watchedEpisodes] = await Promise.all([
          tmdbService.getMediaDetails(show.tmdbId, 'tv'),
          db
            .select()
            .from(userEpisodesWatched)
            .where(
              and(
                eq(userEpisodesWatched.userId, userId),
                eq(userEpisodesWatched.tmdbId, show.tmdbId),
              ),
            ),
        ]);

        const isAnime =
          Array.isArray(details.origin_country) &&
          details.origin_country.includes('JP') &&
          details.genres?.some((g) => g.id === GENRE_ID.ANIMATION);

        const totalSeasons = details.number_of_seasons ?? 1;

        let nextEpisode: {
          seasonNumber: number;
          episodeNumber: number;
          name: string;
          stillPath: string | null;
          airDate: string | null;
        } | null = null;

        if (watchedEpisodes.length === 0) {
          const season1 = await tmdbService.getSeasonDetails(show.tmdbId, 1);
          const ep1 = season1.episodes[0];
          if (ep1) {
            nextEpisode = {
              seasonNumber: 1,
              episodeNumber: ep1.episode_number,
              name: ep1.name,
              stillPath: ep1.still_path,
              airDate: ep1.air_date,
            };
          }
        } else {
          const last = watchedEpisodes.reduce((max, ep) => {
            if (ep.seasonNumber > max.seasonNumber) return ep;
            if (ep.seasonNumber === max.seasonNumber && ep.episodeNumber > max.episodeNumber)
              return ep;
            return max;
          });

          const currentSeason = await tmdbService.getSeasonDetails(show.tmdbId, last.seasonNumber);
          const nextInSeason = currentSeason.episodes.find(
            (ep) => ep.episode_number === last.episodeNumber + 1,
          );

          if (nextInSeason) {
            nextEpisode = {
              seasonNumber: last.seasonNumber,
              episodeNumber: nextInSeason.episode_number,
              name: nextInSeason.name,
              stillPath: nextInSeason.still_path,
              airDate: nextInSeason.air_date,
            };
          } else if (last.seasonNumber < totalSeasons) {
            const nextSeason = await tmdbService.getSeasonDetails(
              show.tmdbId,
              last.seasonNumber + 1,
            );
            const firstEp = nextSeason.episodes[0];
            if (firstEp) {
              nextEpisode = {
                seasonNumber: last.seasonNumber + 1,
                episodeNumber: firstEp.episode_number,
                name: firstEp.name,
                stillPath: firstEp.still_path,
                airDate: firstEp.air_date,
              };
            }
          }
        }

        return {
          id: show.id,
          tmdbId: show.tmdbId,
          title: details.title ?? details.name ?? 'Unknown',
          posterPath: details.poster_path,
          isAnime: isAnime || false,
          nextEpisode,
        };
      }),
    );

    const items = results
      .flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []))
      .filter((item) => item.nextEpisode !== null);

    res.json(items);
  } catch (error) {
    next(error);
  }
});

// DELETE /:id — remove item from watchlist (verify ownership)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id: userId } = getAuthUser(req);
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

    await db.delete(userWatchlist).where(eq(userWatchlist.id, itemId));

    res.json({ message: 'Item removed from watchlist' });
  } catch (error) {
    next(error);
  }
});

export default router;
