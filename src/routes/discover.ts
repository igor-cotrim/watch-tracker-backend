import { Router } from 'express';
import { tmdbService } from '../services/tmdb.js';
import { REGION } from '../config/constants.js';
import type { MediaType } from '../types/index.js';

const router = Router();

// GET / — discover with filters
router.get('/', async (req, res, next) => {
  try {
    const {
      type = 'movie',
      with_watch_providers,
      watch_region,
      with_genres,
      with_origin_country,
      sort_by,
      page,
    } = req.query;

    if (type !== 'movie' && type !== 'tv') {
      res.status(400).json({ error: 'Type must be "movie" or "tv"' });
      return;
    }

    const results = await tmdbService.discover({
      type: type as MediaType,
      ...(with_watch_providers && { with_watch_providers: String(with_watch_providers) }),
      ...(watch_region && { watch_region: String(watch_region) }),
      ...(with_genres && { with_genres: String(with_genres) }),
      ...(with_origin_country && { with_origin_country: String(with_origin_country) }),
      ...(sort_by && { sort_by: String(sort_by) }),
      ...(page && { page: parseInt(String(page), 10) }),
    });

    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

// GET /trending — trending media
router.get('/trending', async (req, res, next) => {
  try {
    const { type = 'all', time_window = 'week' } = req.query;

    const validTypes = ['movie', 'tv', 'all'];
    const validWindows = ['day', 'week'];

    if (!validTypes.includes(String(type))) {
      res.status(400).json({ error: 'Type must be "movie", "tv", or "all"' });
      return;
    }

    if (!validWindows.includes(String(time_window))) {
      res.status(400).json({ error: 'Time window must be "day" or "week"' });
      return;
    }

    const results = await tmdbService.getTrending(
      String(type) as 'movie' | 'tv' | 'all',
      String(time_window) as 'day' | 'week',
    );

    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

// GET /top-rated — top rated movies or TV
router.get('/top-rated', async (req, res, next) => {
  try {
    const { type = 'movie', page } = req.query;

    if (type !== 'movie' && type !== 'tv') {
      res.status(400).json({ error: 'Type must be "movie" or "tv"' });
      return;
    }

    const results = await tmdbService.getTopRated(
      type as MediaType,
      page ? parseInt(String(page), 10) : undefined,
    );
    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

// GET /upcoming — upcoming movies (Brazil)
router.get('/upcoming', async (req, res, next) => {
  try {
    const { page } = req.query;
    const results = await tmdbService.getUpcoming(page ? parseInt(String(page), 10) : undefined);
    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

// GET /popular — popular movies or TV
router.get('/popular', async (req, res, next) => {
  try {
    const { type = 'movie', page } = req.query;

    if (type !== 'movie' && type !== 'tv') {
      res.status(400).json({ error: 'Type must be "movie" or "tv"' });
      return;
    }

    const results = await tmdbService.getPopular(
      type as MediaType,
      page ? parseInt(String(page), 10) : undefined,
    );
    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

// GET /genres — list of genres for a media type
router.get('/genres', async (req, res, next) => {
  try {
    const { type = 'movie' } = req.query;

    if (type !== 'movie' && type !== 'tv') {
      res.status(400).json({ error: 'Type must be "movie" or "tv"' });
      return;
    }

    const results = await tmdbService.getGenres(type as MediaType);
    res.json(results.genres);
  } catch (error) {
    next(error);
  }
});

// GET /providers — list of streaming providers (Brazil)
router.get('/providers', async (req, res, next) => {
  try {
    const { type = 'movie' } = req.query;

    if (type !== 'movie' && type !== 'tv') {
      res.status(400).json({ error: 'Type must be "movie" or "tv"' });
      return;
    }

    const results = await tmdbService.getWatchProviders(type as MediaType, REGION.BRAZIL);
    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

// GET /search — search by query
router.get('/search', async (req, res, next) => {
  try {
    const { query, type, year } = req.query;

    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Query parameter is required' });
      return;
    }

    const mediaType = type === 'movie' || type === 'tv' ? type : undefined;
    const yearNum = year ? parseInt(String(year), 10) : undefined;
    const results = await tmdbService.search(query, mediaType, yearNum);

    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

// GET /now-playing — now playing in BR cinemas
router.get('/now-playing', async (req, res, next) => {
  try {
    const results = await tmdbService.getNowPlaying();
    res.json(results.results);
  } catch (error) {
    next(error);
  }
});

export default router;
