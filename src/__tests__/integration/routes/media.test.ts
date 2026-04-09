import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from '../../helpers/app.js';

vi.mock('../../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
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
import { makeTMDBMedia, makeTMDBSeasonDetails } from '../../helpers/mockFactory.js';

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
  });

  describe('DELETE /api/media/tv/:id/episodes/:seasonNumber/:episodeNumber/watch', () => {
    it('returns 200 with success message', async () => {
      const mockDeleteChain = { where: vi.fn().mockResolvedValue(undefined) };
      mockDb.delete.mockReturnValue(mockDeleteChain);

      const res = await request.delete('/api/media/tv/1396/episodes/1/1/watch');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Episode unmarked as watched');
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
});
