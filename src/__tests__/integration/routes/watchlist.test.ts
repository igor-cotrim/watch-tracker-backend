import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from '../../helpers/app.js';

vi.mock('../../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
  isUniqueConstraintError: vi.fn(),
}));

vi.mock('../../../services/tmdb.js', () => ({
  tmdbService: {
    getMediaDetails: vi.fn(),
    getSeasonDetails: vi.fn(),
  },
  TMDBError: class TMDBError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'TMDBError';
    }
  },
}));

// Mock auth to inject user
vi.mock('../../../middleware/auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../middleware/auth.js')>();
  return {
    ...original,
    authMiddleware: vi.fn((req, _res, next) => {
      (req as Record<string, unknown>).user = { id: 'user-uuid', email: 'test@example.com' };
      next();
    }),
  };
});

import { db, isUniqueConstraintError } from '../../../db/index.js';
import { tmdbService } from '../../../services/tmdb.js';
import {
  makeWatchlistItem,
  makeTMDBMedia,
  makeTMDBSeasonDetails,
  makeNextEpisode,
} from '../../helpers/mockFactory.js';

const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockTmdb = tmdbService as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockIsUnique = isUniqueConstraintError as ReturnType<typeof vi.fn>;

function makeSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

describe('Watchlist routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsUnique.mockReturnValue(false);
  });

  describe('GET /api/watchlist', () => {
    it('returns 200 with enriched watchlist items', async () => {
      const item = makeWatchlistItem({ mediaType: 'movie' });
      mockDb.select.mockReturnValue(makeSelectChain([item]));
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ title: 'Inception' }));

      const res = await request.get('/api/watchlist');
      expect(res.status).toBe(200);
      expect(res.body[0].title).toBe('Inception');
    });

    it('returns empty array when watchlist is empty', async () => {
      mockDb.select.mockReturnValue(makeSelectChain([]));

      const res = await request.get('/api/watchlist');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('includes posterPath in enriched response', async () => {
      mockDb.select.mockReturnValue(makeSelectChain([makeWatchlistItem()]));
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ poster_path: '/poster.jpg' }));

      const res = await request.get('/api/watchlist');
      expect(res.body[0].posterPath).toBe('/poster.jpg');
    });

    it('marks isAnime=true for JP TV shows with animation genre', async () => {
      const tvItem = makeWatchlistItem({ mediaType: 'tv' });
      mockDb.select.mockReturnValue(makeSelectChain([tvItem]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({
          origin_country: ['JP'],
          genres: [{ id: 16, name: 'Animation' }],
        }),
      );

      const res = await request.get('/api/watchlist');
      expect(res.body[0].isAnime).toBe(true);
    });

    it('marks isAnime=false for JP non-animation TV', async () => {
      const tvItem = makeWatchlistItem({ mediaType: 'tv' });
      mockDb.select.mockReturnValue(makeSelectChain([tvItem]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({
          origin_country: ['JP'],
          genres: [{ id: 18, name: 'Drama' }],
        }),
      );

      const res = await request.get('/api/watchlist');
      expect(res.body[0].isAnime).toBe(false);
    });

    it('marks isAnime=false for non-JP animation', async () => {
      const tvItem = makeWatchlistItem({ mediaType: 'tv' });
      mockDb.select.mockReturnValue(makeSelectChain([tvItem]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({
          origin_country: ['US'],
          genres: [{ id: 16, name: 'Animation' }],
        }),
      );

      const res = await request.get('/api/watchlist');
      expect(res.body[0].isAnime).toBe(false);
    });

    it('falls back gracefully when TMDB enrichment fails', async () => {
      const item = makeWatchlistItem();
      mockDb.select.mockReturnValue(makeSelectChain([item]));
      mockTmdb.getMediaDetails.mockRejectedValue(new Error('TMDB down'));

      const res = await request.get('/api/watchlist');
      expect(res.status).toBe(200);
      expect(res.body[0].title).toBe('Unknown');
      expect(res.body[0].posterPath).toBeNull();
    });
  });

  describe('POST /api/watchlist', () => {
    function setupInsert(returnItem: unknown) {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([returnItem]),
      };
      mockDb.insert.mockReturnValue(mockInsert);
      return mockInsert;
    }

    it('returns 201 with created item for valid body', async () => {
      const item = makeWatchlistItem({ tmdbId: 100, mediaType: 'movie', status: 'plan_to_watch' });
      setupInsert(item);

      const res = await request
        .post('/api/watchlist')
        .send({ tmdb_id: 100, media_type: 'movie', status: 'plan_to_watch' });

      expect(res.status).toBe(201);
      expect(res.body.tmdbId).toBe(100);
    });

    it('returns 400 when tmdb_id is missing', async () => {
      const res = await request
        .post('/api/watchlist')
        .send({ media_type: 'movie', status: 'watching' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid media_type', async () => {
      const res = await request
        .post('/api/watchlist')
        .send({ tmdb_id: 1, media_type: 'anime', status: 'watching' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status', async () => {
      const res = await request
        .post('/api/watchlist')
        .send({ tmdb_id: 1, media_type: 'movie', status: 'someday' });
      expect(res.status).toBe(400);
    });

    it('returns 409 when item already exists', async () => {
      const dbError = new Error('unique violation');
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(dbError),
      };
      mockDb.insert.mockReturnValue(mockInsert);
      mockIsUnique.mockReturnValue(true);

      const res = await request
        .post('/api/watchlist')
        .send({ tmdb_id: 1, media_type: 'movie', status: 'watching' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Item already in watchlist');
    });
  });

  describe('GET /api/watchlist/continue-watching', () => {
    it('returns shows with status=watching and media_type=tv only', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv', tmdbId: 1396 });
      mockDb.select.mockReturnValue(makeSelectChain([tvShow]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({ id: 1396, name: 'Breaking Bad', number_of_seasons: 5 }),
      );
      // No watched episodes
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([tvShow])) // watchingShows query
        .mockReturnValue(makeSelectChain([])); // watched episodes query
      mockTmdb.getSeasonDetails.mockResolvedValue(makeTMDBSeasonDetails());

      const res = await request.get('/api/watchlist/continue-watching');
      expect(res.status).toBe(200);
    });

    it('returns S1E1 as next episode when nothing has been watched', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv', tmdbId: 1396 });
      // First select: watchingShows; inner selects: getMediaDetails via tmdb (mocked), episodes watched
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([tvShow]))
        .mockReturnValue(makeSelectChain([]));

      const season = makeTMDBSeasonDetails({
        episodes: [
          {
            id: 1,
            name: 'Pilot',
            episode_number: 1,
            season_number: 1,
            overview: '',
            still_path: null,
            air_date: '2008-01-20',
            runtime: 58,
            vote_average: 9.0,
          },
        ],
      });
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({ id: 1396, name: 'Breaking Bad', number_of_seasons: 5 }),
      );
      mockTmdb.getSeasonDetails.mockResolvedValue(season);

      const res = await request.get('/api/watchlist/continue-watching');
      expect(res.status).toBe(200);
      expect(res.body[0].nextEpisode.seasonNumber).toBe(1);
      expect(res.body[0].nextEpisode.episodeNumber).toBe(1);
    });

    it('returns next episode in same season when some episodes are watched', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv', tmdbId: 1396 });
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([tvShow]))
        .mockReturnValueOnce(makeSelectChain([{ seasonNumber: 1, episodeNumber: 1 }]));

      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({ id: 1396, name: 'Breaking Bad', number_of_seasons: 5 }),
      );
      mockTmdb.getSeasonDetails.mockResolvedValue(makeTMDBSeasonDetails());

      const res = await request.get('/api/watchlist/continue-watching');
      expect(res.status).toBe(200);
      expect(res.body[0].nextEpisode.episodeNumber).toBe(2);
      expect(res.body[0].nextEpisode.seasonNumber).toBe(1);
    });

    it('advances to next season when all episodes in current season are watched', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv', tmdbId: 1396 });
      // Episode 2 is the last in season 1 (makeTMDBSeasonDetails has eps 1 and 2)
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([tvShow]))
        .mockReturnValueOnce(makeSelectChain([{ seasonNumber: 1, episodeNumber: 2 }]));

      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({ id: 1396, name: 'Breaking Bad', number_of_seasons: 2 }),
      );
      mockTmdb.getSeasonDetails
        .mockResolvedValueOnce(makeTMDBSeasonDetails({ season_number: 1 })) // current season
        .mockResolvedValueOnce(makeTMDBSeasonDetails({ season_number: 2 })); // next season

      const res = await request.get('/api/watchlist/continue-watching');
      expect(res.status).toBe(200);
      expect(res.body[0].nextEpisode.seasonNumber).toBe(2);
      expect(res.body[0].nextEpisode.episodeNumber).toBe(1);
    });

    it('excludes shows where TMDB call fails', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv', tmdbId: 9999 });
      mockDb.select.mockReturnValue(makeSelectChain([tvShow]));
      mockTmdb.getMediaDetails.mockRejectedValue(new Error('TMDB error'));

      const res = await request.get('/api/watchlist/continue-watching');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('GET /api/watchlist/upcoming', () => {
    it('returns 200 with shows that have a next_episode_to_air', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv', tmdbId: 100 });
      mockDb.select.mockReturnValue(makeSelectChain([tvShow]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({
          id: 100,
          title: undefined,
          name: 'Daredevil: Born Again',
          next_episode_to_air: makeNextEpisode({
            air_date: '2099-04-08',
            season_number: 2,
            episode_number: 5,
            name: 'The Grand Design',
          }),
        }),
      );

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Daredevil: Born Again');
      expect(res.body[0].nextEpisode.seasonNumber).toBe(2);
      expect(res.body[0].nextEpisode.episodeNumber).toBe(5);
      expect(res.body[0].nextEpisode.name).toBe('The Grand Design');
    });

    it('filters out shows where next_episode_to_air is null', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv' });
      mockDb.select.mockReturnValue(makeSelectChain([tvShow]));
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ next_episode_to_air: null }));

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns empty array when watchlist has no TV shows', async () => {
      mockDb.select.mockReturnValue(makeSelectChain([]));

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('sorts results by airDate ascending', async () => {
      const show1 = makeWatchlistItem({ mediaType: 'tv', tmdbId: 1 });
      const show2 = makeWatchlistItem({ mediaType: 'tv', tmdbId: 2 });
      mockDb.select.mockReturnValue(makeSelectChain([show1, show2]));

      mockTmdb.getMediaDetails
        .mockResolvedValueOnce(
          makeTMDBMedia({
            id: 1,
            title: undefined,
            name: 'Show Later',
            next_episode_to_air: makeNextEpisode({ air_date: '2099-06-01' }),
          }),
        )
        .mockResolvedValueOnce(
          makeTMDBMedia({
            id: 2,
            title: undefined,
            name: 'Show Sooner',
            next_episode_to_air: makeNextEpisode({ air_date: '2099-04-01' }),
          }),
        );

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body[0].title).toBe('Show Sooner');
      expect(res.body[1].title).toBe('Show Later');
    });

    it('computes daysUntilAir correctly for a far-future date', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv' });
      mockDb.select.mockReturnValue(makeSelectChain([tvShow]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({ next_episode_to_air: makeNextEpisode({ air_date: '2099-01-01' }) }),
      );

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body[0].nextEpisode.daysUntilAir).toBeGreaterThan(0);
    });

    it('excludes shows where TMDB call fails (allSettled)', async () => {
      const show1 = makeWatchlistItem({ mediaType: 'tv', tmdbId: 1 });
      const show2 = makeWatchlistItem({ mediaType: 'tv', tmdbId: 2 });
      mockDb.select.mockReturnValue(makeSelectChain([show1, show2]));

      mockTmdb.getMediaDetails.mockRejectedValueOnce(new Error('TMDB error')).mockResolvedValueOnce(
        makeTMDBMedia({
          id: 2,
          title: undefined,
          name: 'Good Show',
          next_episode_to_air: makeNextEpisode(),
        }),
      );

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].title).toBe('Good Show');
    });

    it('extracts BR flatrate watch providers', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv' });
      mockDb.select.mockReturnValue(makeSelectChain([tvShow]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({
          next_episode_to_air: makeNextEpisode(),
          'watch/providers': {
            results: {
              BR: {
                flatrate: [{ provider_name: 'Disney+' }, { provider_name: 'Star+' }],
              },
            },
          },
        }),
      );

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body[0].watchProviders).toContain('Disney+');
      expect(res.body[0].watchProviders).toContain('Star+');
    });

    it('returns empty watchProviders when no BR providers', async () => {
      const tvShow = makeWatchlistItem({ mediaType: 'tv' });
      mockDb.select.mockReturnValue(makeSelectChain([tvShow]));
      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({
          next_episode_to_air: makeNextEpisode(),
          'watch/providers': { results: {} },
        }),
      );

      const res = await request.get('/api/watchlist/upcoming');
      expect(res.status).toBe(200);
      expect(res.body[0].watchProviders).toEqual([]);
    });
  });

  describe('PATCH /api/watchlist/:id/status', () => {
    it('returns 400 for non-numeric id', async () => {
      const res = await request.patch('/api/watchlist/abc/status').send({ status: 'watching' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid status value', async () => {
      const res = await request.patch('/api/watchlist/1/status').send({ status: 'invalid' });
      expect(res.status).toBe(400);
    });

    it('returns 404 when item not found', async () => {
      mockDb.select.mockReturnValue(makeSelectChain([]));
      const res = await request.patch('/api/watchlist/999/status').send({ status: 'completed' });
      expect(res.status).toBe(404);
    });

    it('returns 200 with updated item', async () => {
      const item = makeWatchlistItem({ id: 1, status: 'watching' });
      const updated = { ...item, status: 'completed' };
      mockDb.select.mockReturnValue(makeSelectChain([item]));
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([updated]),
      });

      const res = await request.patch('/api/watchlist/1/status').send({ status: 'completed' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
    });
  });

  describe('DELETE /api/watchlist/:id', () => {
    it('returns 200 when item is owned by user', async () => {
      const item = makeWatchlistItem({ id: 42, userId: 'user-uuid' });
      mockDb.select.mockReturnValue(makeSelectChain([item]));
      const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete.mockReturnValue(mockDeleteChain);

      const res = await request.delete('/api/watchlist/42');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Item removed from watchlist');
    });

    it('returns 400 for non-numeric id', async () => {
      const res = await request.delete('/api/watchlist/abc');
      expect(res.status).toBe(400);
    });

    it('returns 404 when item not found', async () => {
      mockDb.select.mockReturnValue(makeSelectChain([]));

      const res = await request.delete('/api/watchlist/999');
      expect(res.status).toBe(404);
    });

    it('returns 404 when item belongs to different user', async () => {
      mockDb.select.mockReturnValue(makeSelectChain([])); // no match for user+id combo

      const res = await request.delete('/api/watchlist/1');
      expect(res.status).toBe(404);
    });
  });
});
