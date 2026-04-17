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
    getTrending: vi.fn(),
    search: vi.fn(),
    discover: vi.fn(),
    getNowPlaying: vi.fn(),
    getTopRated: vi.fn(),
    getUpcoming: vi.fn(),
    getPopular: vi.fn(),
    getGenres: vi.fn(),
    getWatchProviders: vi.fn(),
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

describe('Media routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks doesn't reset `.mockReturnValueOnce` queues or implementations —
    // reset the db and tmdb stubs so per-test `.mockReturnValueOnce` doesn't bleed.
    for (const fn of Object.values(mockDb)) fn.mockReset();
    for (const fn of Object.values(mockTmdb)) fn.mockReset();
    mockIsUnique.mockReset();
    mockIsUnique.mockReturnValue(false);
  });

  describe('GET /api/media/:type/:id', () => {
    it('returns 200 with media details', async () => {
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ id: 550 }));

      const res = await request.get('/api/media/movie/550');
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(550);
    });

    it('renames watch/providers to watch_providers', async () => {
      const media = makeTMDBMedia();
      (media as unknown as Record<string, unknown>)['watch/providers'] = { results: { BR: {} } };
      mockTmdb.getMediaDetails.mockResolvedValue(media);

      const res = await request.get('/api/media/movie/550');
      expect(res.body).toHaveProperty('watch_providers');
      expect(res.body).not.toHaveProperty('watch/providers');
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.get('/api/media/anime/550');
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric id', async () => {
      const res = await request.get('/api/media/movie/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/media/tv/:id/season/:seasonNumber', () => {
    it('returns 200 with season details', async () => {
      mockTmdb.getSeasonDetails.mockResolvedValue(makeTMDBSeasonDetails({ season_number: 1 }));

      const res = await request.get('/api/media/tv/1396/season/1');
      expect(res.status).toBe(200);
      expect(res.body.season_number).toBe(1);
    });

    it('returns 400 for non-numeric id', async () => {
      const res = await request.get('/api/media/tv/abc/season/1');
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-numeric season number', async () => {
      const res = await request.get('/api/media/tv/1396/season/abc');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/media/:type/:id/rate', () => {
    function setupInsert(returnItem: unknown) {
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([returnItem]),
      };
      mockDb.insert.mockReturnValue(mockInsert);
      return mockInsert;
    }

    it('returns 201 with rating for valid body', async () => {
      const rating = { id: 1, userId: 'user-uuid', tmdbId: 550, mediaType: 'movie', rating: 8 };
      setupInsert(rating);

      const res = await request.post('/api/media/movie/550/rate').send({ rating: 8 });
      expect(res.status).toBe(201);
      expect(res.body.rating).toBe(8);
    });

    it('returns 400 for rating below 1', async () => {
      const res = await request.post('/api/media/movie/550/rate').send({ rating: 0 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for rating above 10', async () => {
      const res = await request.post('/api/media/movie/550/rate').send({ rating: 11 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for non-integer rating', async () => {
      const res = await request.post('/api/media/movie/550/rate').send({ rating: 7.5 });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.post('/api/media/anime/550/rate').send({ rating: 8 });
      expect(res.status).toBe(400);
    });

    it('returns 409 when user already rated this media', async () => {
      const dbError = new Error('unique violation');
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(dbError),
      };
      mockDb.insert.mockReturnValue(mockInsert);
      mockIsUnique.mockReturnValue(true);

      const res = await request.post('/api/media/movie/550/rate').send({ rating: 7 });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/media/tv/:id/episodes/:seasonNumber/:episodeNumber/watch', () => {
    it('returns 201 with created episode record', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      };
      mockDb.insert.mockReturnValue(mockInsert);

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.episodeNumber).toBe(1);
    });

    it('returns 400 for non-numeric params', async () => {
      const res = await request.post('/api/media/tv/abc/episodes/1/1/watch');
      expect(res.status).toBe(400);
    });

    it('returns 409 when episode already marked', async () => {
      const dbError = new Error('unique violation');
      const mockInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockRejectedValue(dbError),
      };
      mockDb.insert.mockReturnValue(mockInsert);
      mockIsUnique.mockReturnValue(true);

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(409);
    });

    it('returns statusChanged=null when show has dropped status', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      });
      const droppedEntry = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'dropped',
      };
      // ensureWatchingOnEpisodeMark + checkAndUpdateTVStatus both short-circuit on 'dropped'
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([droppedEntry]))
        .mockReturnValueOnce(makeSelectChain([droppedEntry]));

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBeNull();
    });

    it('returns statusChanged=null when show is already completed', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      });
      const completedEntry = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'completed',
      };
      // ensureWatchingOnEpisodeMark + checkAndUpdateTVStatus both short-circuit on 'completed'
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([completedEntry]))
        .mockReturnValueOnce(makeSelectChain([completedEntry]));

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBeNull();
    });

    it('returns statusChanged=null when no episodes have aired yet', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      });
      const watchingEntry = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'watching',
      };
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([watchingEntry])) // ensureWatchingOnEpisodeMark
        .mockReturnValueOnce(makeSelectChain([watchingEntry])); // checkAndUpdateTVStatus
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ id: 1396, number_of_seasons: 1 }));
      // All episodes have a future air_date — none have aired yet
      mockTmdb.getSeasonDetails.mockResolvedValue(
        makeTMDBSeasonDetails({
          episodes: [
            {
              id: 101,
              name: 'Upcoming',
              episode_number: 1,
              season_number: 1,
              overview: '',
              still_path: null,
              air_date: '2099-01-01',
              runtime: 45,
              vote_average: 0,
            },
          ],
        }),
      );

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBeNull();
    });

    it('returns statusChanged=completed when all episodes watched after marking', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      });

      const watchingEntry = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'watching',
      };
      // ensureWatchingOnEpisodeMark: already watching → noop
      // checkAndUpdateTVStatus: entry + watched episodes for season 1
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([watchingEntry]))
        .mockReturnValueOnce(makeSelectChain([watchingEntry]))
        .mockReturnValueOnce(makeSelectChain([{ episodeNumber: 1 }]));

      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ id: 1396, number_of_seasons: 1 }));
      mockTmdb.getSeasonDetails.mockResolvedValue(
        makeTMDBSeasonDetails({
          episodes: [
            {
              id: 101,
              name: 'Pilot',
              episode_number: 1,
              season_number: 1,
              overview: '',
              still_path: null,
              air_date: '2024-01-01',
              runtime: 45,
              vote_average: 8.0,
            },
          ],
        }),
      );
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBe('completed');
    });

    it('returns statusChanged=null when all aired episodes watched but future episodes exist', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      });

      const watchingEntry = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'watching',
      };
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([watchingEntry]))
        .mockReturnValueOnce(makeSelectChain([watchingEntry]))
        .mockReturnValueOnce(makeSelectChain([{ episodeNumber: 1 }]));

      mockTmdb.getMediaDetails.mockResolvedValue(
        makeTMDBMedia({
          id: 1396,
          number_of_seasons: 1,
          next_episode_to_air: makeNextEpisode(),
        }),
      );
      mockTmdb.getSeasonDetails.mockResolvedValue(
        makeTMDBSeasonDetails({
          episodes: [
            {
              id: 101,
              name: 'Pilot',
              episode_number: 1,
              season_number: 1,
              overview: '',
              still_path: null,
              air_date: '2024-01-01',
              runtime: 45,
              vote_average: 8.0,
            },
          ],
        }),
      );

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBeNull();
    });

    it('returns statusChanged=watching when show is not on the watchlist yet', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      // Two inserts expected: (1) user_episodes_watched, (2) user_watchlist auto-add
      const episodeInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      };
      const watchlistInsert = { values: vi.fn().mockResolvedValue(undefined) };
      mockDb.insert.mockReturnValueOnce(episodeInsert).mockReturnValueOnce(watchlistInsert);

      // ensureWatchingOnEpisodeMark: no entry → insert as watching
      // checkAndUpdateTVStatus: entry now watching, no aired episodes yet
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([]))
        .mockReturnValueOnce(
          makeSelectChain([
            {
              id: 1,
              userId: 'user-uuid',
              tmdbId: 1396,
              mediaType: 'tv',
              status: 'watching',
            },
          ]),
        )
        .mockReturnValueOnce(makeSelectChain([]));
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ id: 1396, number_of_seasons: 1 }));
      mockTmdb.getSeasonDetails.mockResolvedValue(
        makeTMDBSeasonDetails({
          episodes: [
            {
              id: 101,
              name: 'Upcoming',
              episode_number: 1,
              season_number: 1,
              overview: '',
              still_path: null,
              air_date: '2099-01-01',
              runtime: 45,
              vote_average: 0,
            },
          ],
        }),
      );

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBe('watching');
      expect(watchlistInsert.values).toHaveBeenCalledWith({
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'watching',
      });
    });

    it('returns statusChanged=watching when promoting plan_to_watch → watching', async () => {
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      });
      const planEntry = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'plan_to_watch',
      };
      const watchingEntry = { ...planEntry, status: 'watching' };
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([planEntry])) // ensure sees plan_to_watch
        .mockReturnValueOnce(makeSelectChain([watchingEntry])) // check sees watching (after ensure's update)
        .mockReturnValueOnce(makeSelectChain([]));
      const updateSet = vi.fn().mockReturnThis();
      const updateWhere = vi.fn().mockResolvedValue([]);
      mockDb.update.mockReturnValue({ set: updateSet, where: updateWhere });
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ id: 1396, number_of_seasons: 1 }));
      mockTmdb.getSeasonDetails.mockResolvedValue(
        makeTMDBSeasonDetails({
          episodes: [
            {
              id: 101,
              name: 'Upcoming',
              episode_number: 1,
              season_number: 1,
              overview: '',
              still_path: null,
              air_date: '2099-01-01',
              runtime: 45,
              vote_average: 0,
            },
          ],
        }),
      );

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBe('watching');
      expect(updateSet).toHaveBeenCalledWith({ status: 'watching' });
    });

    it('returns statusChanged=completed when promotion to watching + all aired watched', async () => {
      // Show not on list → ensure auto-adds as watching → all aired watched → completed wins
      const episode = {
        id: 1,
        userId: 'user-uuid',
        tmdbId: 1396,
        seasonNumber: 1,
        episodeNumber: 1,
      };
      const episodeInsert = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([episode]),
      };
      const watchlistInsert = { values: vi.fn().mockResolvedValue(undefined) };
      mockDb.insert.mockReturnValueOnce(episodeInsert).mockReturnValueOnce(watchlistInsert);

      mockDb.select
        .mockReturnValueOnce(makeSelectChain([])) // ensure: no entry
        .mockReturnValueOnce(
          makeSelectChain([
            {
              id: 1,
              userId: 'user-uuid',
              tmdbId: 1396,
              mediaType: 'tv',
              status: 'watching',
            },
          ]),
        ) // check: now on list
        .mockReturnValueOnce(makeSelectChain([{ episodeNumber: 1 }]));
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });
      mockTmdb.getMediaDetails.mockResolvedValue(makeTMDBMedia({ id: 1396, number_of_seasons: 1 }));
      mockTmdb.getSeasonDetails.mockResolvedValue(
        makeTMDBSeasonDetails({
          episodes: [
            {
              id: 101,
              name: 'Pilot',
              episode_number: 1,
              season_number: 1,
              overview: '',
              still_path: null,
              air_date: '2024-01-01',
              runtime: 45,
              vote_average: 8.0,
            },
          ],
        }),
      );

      const res = await request.post('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(201);
      // Completed wins over watching in the ?? chain
      expect(res.body.statusChanged).toBe('completed');
    });
  });

  describe('DELETE /api/media/tv/:id/episodes/:seasonNumber/:episodeNumber/watch', () => {
    it('returns 200 with success message', async () => {
      const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete.mockReturnValue(mockDeleteChain);

      const res = await request.delete('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Episode unmarked as watched');
    });

    it('returns statusChanged=watching when show was completed before unmarking', async () => {
      const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete.mockReturnValue(mockDeleteChain);

      // revertCompletedToWatching: entry with status 'completed'
      mockDb.select.mockReturnValueOnce(
        makeSelectChain([
          {
            id: 1,
            userId: 'user-uuid',
            tmdbId: 1396,
            mediaType: 'tv',
            status: 'completed',
          },
        ]),
      );
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });

      const res = await request.delete('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(200);
      expect(res.body.statusChanged).toBe('watching');
    });

    it('returns 500 when db.delete throws', async () => {
      mockDb.delete.mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('DB error')),
      });

      const res = await request.delete('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(500);
    });

    it('returns 400 for non-numeric params', async () => {
      const res = await request.delete('/api/media/tv/abc/episodes/1/1/watch');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/media/tv/:id/seasons/:seasonNumber/watched', () => {
    it('returns 200 with array of episode numbers', async () => {
      const watched = [{ episodeNumber: 1 }, { episodeNumber: 2 }];
      mockDb.select.mockReturnValue(makeSelectChain(watched));

      const res = await request.get('/api/media/tv/1396/seasons/1/watched');
      expect(res.status).toBe(200);
      expect(res.body.watchedEpisodes).toEqual([1, 2]);
    });

    it('returns empty array when none watched', async () => {
      mockDb.select.mockReturnValue(makeSelectChain([]));

      const res = await request.get('/api/media/tv/1396/seasons/1/watched');
      expect(res.body.watchedEpisodes).toEqual([]);
    });

    it('returns 400 for non-numeric params', async () => {
      const res = await request.get('/api/media/tv/abc/seasons/1/watched');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/media/tv/:id/seasons/:seasonNumber/watch', () => {
    it('marks only unwatched episodes (skips existing)', async () => {
      const season = makeTMDBSeasonDetails(); // has episodes 1 and 2
      mockTmdb.getSeasonDetails.mockResolvedValue(season);

      // Episode 1 already watched
      const existingWatched = [{ episodeNumber: 1 }];
      mockDb.select.mockReturnValue(makeSelectChain(existingWatched));

      const mockInsert = { values: vi.fn().mockResolvedValue(undefined) };
      mockDb.insert.mockReturnValue(mockInsert);

      const res = await request.post('/api/media/tv/1396/seasons/1/watch');
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Marked 1 episodes as watched');
      // Only episode 2 should be inserted
      const insertedValues = mockInsert.values.mock.calls[0][0] as Array<{ episodeNumber: number }>;
      expect(insertedValues.every((v) => v.episodeNumber !== 1)).toBe(true);
    });

    it('returns count=0 when all already watched', async () => {
      const season = makeTMDBSeasonDetails(); // eps 1 and 2
      mockTmdb.getSeasonDetails.mockResolvedValue(season);
      mockDb.select.mockReturnValue(makeSelectChain([{ episodeNumber: 1 }, { episodeNumber: 2 }]));

      const res = await request.post('/api/media/tv/1396/seasons/1/watch');
      expect(res.body.message).toBe('Marked 0 episodes as watched');
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('returns 400 for non-numeric params', async () => {
      const res = await request.post('/api/media/tv/abc/seasons/1/watch');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/media/tv/:id/seasons/:seasonNumber/watch', () => {
    it('returns 200 with success message', async () => {
      const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete.mockReturnValue(mockDeleteChain);

      const res = await request.delete('/api/media/tv/1396/seasons/1/watch');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Season unmarked as watched');
    });

    it('returns 400 for non-numeric params', async () => {
      const res = await request.delete('/api/media/tv/abc/seasons/1/watch');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/media/tv/:id/watch-all', () => {
    function setupWatchAll({
      numberOfSeasons,
      seasonDetails,
      existingWatched,
      watchlistStatus = 'watching',
    }: {
      numberOfSeasons: number;
      seasonDetails?: ReturnType<typeof makeTMDBSeasonDetails>;
      existingWatched?: { episodeNumber: number }[];
      watchlistStatus?: 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | null;
    }) {
      const show = makeTMDBMedia({ id: 1396, number_of_seasons: numberOfSeasons });
      mockTmdb.getMediaDetails.mockResolvedValue(show);
      mockTmdb.getSeasonDetails.mockResolvedValue(seasonDetails ?? makeTMDBSeasonDetails());

      const watchlistEntry =
        watchlistStatus === null
          ? []
          : [
              {
                id: 1,
                userId: 'user-uuid',
                tmdbId: 1396,
                mediaType: 'tv',
                status: watchlistStatus,
              },
            ];

      // Select call order in watch-all:
      //   1..N = seasons loop (per-season existing watched episodes)
      //   N+1  = ensureWatchingOnEpisodeMark (watchlist entry)
      //   N+2  = checkAndUpdateTVStatus (watchlist entry; may short-circuit)
      //   rest = checkAndUpdateTVStatus per-season reads (when aired episodes exist)
      for (let i = 0; i < numberOfSeasons; i++) {
        mockDb.select.mockReturnValueOnce(makeSelectChain(existingWatched ?? []));
      }
      mockDb.select.mockReturnValueOnce(makeSelectChain(watchlistEntry));
      // Fallback for check entry + per-season reads — returns existingWatched for per-season
      // queries; check's entry read sees a malformed row, then short-circuits without changing status.
      mockDb.select.mockReturnValue(makeSelectChain(existingWatched ?? []));

      const mockInsert = { values: vi.fn().mockResolvedValue(undefined) };
      mockDb.insert.mockReturnValue(mockInsert);
      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });
      return { mockInsert };
    }

    it('marks all episodes across all seasons and returns markedCount', async () => {
      // 2 seasons × 2 episodes each = 4 total, none watched yet
      const { mockInsert } = setupWatchAll({ numberOfSeasons: 2 });

      const res = await request.post('/api/media/tv/1396/watch-all');
      expect(res.status).toBe(201);
      expect(res.body.markedCount).toBe(4);
      expect(mockInsert.values).toHaveBeenCalledTimes(2);
    });

    it('auto-adds show to watchlist as watching when not on list', async () => {
      const show = makeTMDBMedia({ id: 1396, number_of_seasons: 1 });
      mockTmdb.getMediaDetails.mockResolvedValue(show);
      mockTmdb.getSeasonDetails.mockResolvedValue(makeTMDBSeasonDetails());

      // Seasons loop reads existing watched (empty), then ensure reads the watchlist entry (none).
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([])) // season 1 watched
        .mockReturnValueOnce(makeSelectChain([])) // ensure entry: no entry
        .mockReturnValue(makeSelectChain([]));

      // Insert order: (1) season-1 episodes, (2) watchlist auto-add from ensure.
      const episodesInsert = { values: vi.fn().mockResolvedValue(undefined) };
      const watchlistInsert = { values: vi.fn().mockResolvedValue(undefined) };
      mockDb.insert.mockReturnValueOnce(episodesInsert).mockReturnValueOnce(watchlistInsert);

      const res = await request.post('/api/media/tv/1396/watch-all');
      expect(res.status).toBe(201);
      expect(watchlistInsert.values).toHaveBeenCalledWith({
        userId: 'user-uuid',
        tmdbId: 1396,
        mediaType: 'tv',
        status: 'watching',
      });
    });

    it('promotes plan_to_watch → watching on watch-all', async () => {
      setupWatchAll({ numberOfSeasons: 1, watchlistStatus: 'plan_to_watch' });
      const updateSet = vi.fn().mockReturnThis();
      const updateWhere = vi.fn().mockResolvedValue([]);
      mockDb.update.mockReturnValue({ set: updateSet, where: updateWhere });

      const res = await request.post('/api/media/tv/1396/watch-all');
      expect(res.status).toBe(201);
      expect(res.body.statusChanged).toBe('watching');
      expect(updateSet).toHaveBeenCalledWith({ status: 'watching' });
    });

    it('skips already-watched episodes and counts only new ones', async () => {
      // 1 season, 2 episodes, episode 1 already watched
      setupWatchAll({
        numberOfSeasons: 1,
        existingWatched: [{ episodeNumber: 1 }],
      });

      const res = await request.post('/api/media/tv/1396/watch-all');
      expect(res.status).toBe(201);
      expect(res.body.markedCount).toBe(1);
      const insertedValues = mockDb.insert.mock.results[0].value.values.mock.calls[0][0] as Array<{
        episodeNumber: number;
      }>;
      expect(insertedValues.every((v: { episodeNumber: number }) => v.episodeNumber !== 1)).toBe(
        true,
      );
    });

    it('returns markedCount 0 and skips TMDB season calls when number_of_seasons is 0', async () => {
      setupWatchAll({ numberOfSeasons: 0 });

      const res = await request.post('/api/media/tv/1396/watch-all');
      expect(res.status).toBe(201);
      expect(res.body.markedCount).toBe(0);
      expect(mockTmdb.getSeasonDetails).not.toHaveBeenCalled();
    });

    it('does not call db.insert when all episodes are already watched', async () => {
      setupWatchAll({
        numberOfSeasons: 1,
        existingWatched: [{ episodeNumber: 1 }, { episodeNumber: 2 }],
      });

      const res = await request.post('/api/media/tv/1396/watch-all');
      expect(res.status).toBe(201);
      expect(res.body.markedCount).toBe(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('returns 500 when TMDB getMediaDetails fails', async () => {
      mockTmdb.getMediaDetails.mockRejectedValue(new Error('TMDB unavailable'));

      const res = await request.post('/api/media/tv/1396/watch-all');
      expect(res.status).toBe(500);
    });

    it('returns 400 for non-numeric TV ID', async () => {
      const res = await request.post('/api/media/tv/abc/watch-all');
      expect(res.status).toBe(400);
    });
  });
});
