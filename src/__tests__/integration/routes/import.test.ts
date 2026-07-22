import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from '../../helpers/app.js';

vi.mock('../../../db/index.js', () => ({
  db: {
    insert: vi.fn(),
  },
  isUniqueConstraintError: vi.fn(),
}));

vi.mock('../../../services/tmdb.js', () => ({
  tmdbService: {
    search: vi.fn(),
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

// Mock auth to inject a user without verifying a real token.
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

import { db } from '../../../db/index.js';
import { tmdbService } from '../../../services/tmdb.js';
import { makeTMDBSearchResult } from '../../helpers/mockFactory.js';

const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockTmdb = tmdbService as unknown as Record<string, ReturnType<typeof vi.fn>>;

/** A single insert chain mock that supports every write path the route uses. */
function setupInsertMock() {
  const mockInsert = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
  };
  mockDb.insert.mockReturnValue(mockInsert);
  return mockInsert;
}

/** A TMDB search result containing a single movie with the given id. */
function searchHit(id = 550) {
  return makeTMDBSearchResult([
    { id, title: 'Fight Club', overview: '', poster_path: null, vote_average: 8 },
  ]);
}

describe('Import routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/import — validation', () => {
    it('returns 400 when items is empty', async () => {
      const res = await request.post('/api/import').send({ source: 'letterboxd', items: [] });
      expect(res.status).toBe(400);
    });

    it('returns 400 for an unknown source', async () => {
      const res = await request
        .post('/api/import')
        .send({ source: 'tvtime', items: [{ title: 'Fight Club' }] });
      expect(res.status).toBe(400);
    });

    it('returns 400 when an item has no title', async () => {
      const res = await request
        .post('/api/import')
        .send({ source: 'letterboxd', items: [{ year: 1999 }] });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a rating outside 1–10', async () => {
      const res = await request
        .post('/api/import')
        .send({ source: 'letterboxd', items: [{ title: 'Fight Club', rating: 11 }] });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/import — matching & writes', () => {
    it('imports a completed movie with a rating and reports counts', async () => {
      const mockInsert = setupInsertMock();
      mockTmdb.search.mockResolvedValue(searchHit(550));

      const res = await request.post('/api/import').send({
        source: 'letterboxd',
        items: [
          {
            title: 'Fight Club',
            year: 1999,
            status: 'completed',
            rating: 8,
            watched_date: '1999-10-15',
          },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        total: 1,
        matched: 1,
        imported: { watchlist: 1, ratings: 1 },
        unmatched: [],
      });
      expect(mockTmdb.search).toHaveBeenCalledWith('Fight Club', 'en-US', 'movie', 1999);

      // First insert = rating (with preserved date), second = watchlist status.
      const ratingValues = mockInsert.values.mock.calls[0][0] as Record<string, unknown>;
      const watchlistValues = mockInsert.values.mock.calls[1][0] as Record<string, unknown>;
      expect(ratingValues).toMatchObject({ tmdbId: 550, mediaType: 'movie', rating: 8 });
      expect(ratingValues.createdAt).toBeInstanceOf(Date);
      expect(watchlistValues).toMatchObject({ tmdbId: 550, status: 'completed' });
      expect(watchlistValues.addedAt).toBeInstanceOf(Date);
    });

    it('uses an idempotent upsert for completed status', async () => {
      const mockInsert = setupInsertMock();
      mockTmdb.search.mockResolvedValue(searchHit(550));

      const res = await request
        .post('/api/import')
        .send({ source: 'letterboxd', items: [{ title: 'Fight Club', status: 'completed' }] });

      expect(res.status).toBe(200);
      const conflictArg = mockInsert.onConflictDoUpdate.mock.calls[0][0] as { set: unknown };
      expect(conflictArg.set).toEqual({ status: 'completed' });
    });

    it('never downgrades an existing entry for plan_to_watch (onConflictDoNothing)', async () => {
      const mockInsert = setupInsertMock();
      mockTmdb.search.mockResolvedValue(searchHit(550));

      const res = await request
        .post('/api/import')
        .send({ source: 'letterboxd', items: [{ title: 'Dune', status: 'plan_to_watch' }] });

      expect(res.status).toBe(200);
      expect(res.body.imported).toEqual({ watchlist: 1, ratings: 0 });
      expect(mockInsert.onConflictDoNothing).toHaveBeenCalledTimes(1);
      expect(mockInsert.onConflictDoUpdate).not.toHaveBeenCalled();
    });

    it('imports a rating-only item without touching the watchlist', async () => {
      const mockInsert = setupInsertMock();
      mockTmdb.search.mockResolvedValue(searchHit(550));

      const res = await request
        .post('/api/import')
        .send({ source: 'letterboxd', items: [{ title: 'Fight Club', rating: 10 }] });

      expect(res.status).toBe(200);
      expect(res.body.imported).toEqual({ watchlist: 0, ratings: 1 });
      expect(mockInsert.onConflictDoNothing).not.toHaveBeenCalled();
    });

    it('falls back to a title-only search when the year-filtered search misses', async () => {
      setupInsertMock();
      mockTmdb.search
        .mockResolvedValueOnce(makeTMDBSearchResult([]))
        .mockResolvedValueOnce(searchHit(603));

      const res = await request.post('/api/import').send({
        source: 'letterboxd',
        items: [{ title: 'The Matrix', year: 1999, status: 'completed' }],
      });

      expect(res.status).toBe(200);
      expect(res.body.matched).toBe(1);
      expect(mockTmdb.search).toHaveBeenCalledTimes(2);
      expect(mockTmdb.search).toHaveBeenLastCalledWith('The Matrix', 'en-US', 'movie');
    });

    it('reports titles with no TMDB match as unmatched', async () => {
      setupInsertMock();
      mockTmdb.search.mockResolvedValue(makeTMDBSearchResult([]));

      const res = await request.post('/api/import').send({
        source: 'letterboxd',
        items: [{ title: 'Totally Made Up Film', year: 1888, status: 'completed' }],
      });

      expect(res.status).toBe(200);
      expect(res.body.matched).toBe(0);
      expect(res.body.imported).toEqual({ watchlist: 0, ratings: 0 });
      expect(res.body.unmatched).toEqual([{ title: 'Totally Made Up Film', year: 1888 }]);
    });

    it('treats a TMDB search failure as an unmatched item (does not 500)', async () => {
      setupInsertMock();
      mockTmdb.search.mockRejectedValue(new Error('TMDB down'));

      const res = await request
        .post('/api/import')
        .send({ source: 'letterboxd', items: [{ title: 'Fight Club', status: 'completed' }] });

      expect(res.status).toBe(200);
      expect(res.body.matched).toBe(0);
      expect(res.body.unmatched).toHaveLength(1);
    });

    it('processes a batch of multiple items', async () => {
      setupInsertMock();
      mockTmdb.search.mockResolvedValue(searchHit(550));

      const res = await request.post('/api/import').send({
        source: 'letterboxd',
        items: [
          { title: 'Fight Club', year: 1999, status: 'completed', rating: 9 },
          { title: 'Dune', year: 2021, status: 'plan_to_watch' },
        ],
      });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        total: 2,
        matched: 2,
        imported: { watchlist: 2, ratings: 1 },
      });
    });
  });
});
