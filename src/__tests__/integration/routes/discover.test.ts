import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from '../../helpers/app.js';

vi.mock('../../../db/index.js', () => ({
  db: { execute: vi.fn(), select: vi.fn(), insert: vi.fn() },
  isUniqueConstraintError: vi.fn(),
}));

vi.mock('../../../services/tmdb.js', () => ({
  tmdbService: {
    discover: vi.fn(),
    getTrending: vi.fn(),
    getTopRated: vi.fn(),
    getUpcoming: vi.fn(),
    getPopular: vi.fn(),
    getGenres: vi.fn(),
    getWatchProviders: vi.fn(),
    search: vi.fn(),
    getNowPlaying: vi.fn(),
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

import { tmdbService } from '../../../services/tmdb.js';
import { makeTMDBSearchResult } from '../../helpers/mockFactory.js';

const mockTmdb = tmdbService as unknown as Record<string, ReturnType<typeof vi.fn>>;

describe('Discover routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/discover', () => {
    it('returns results array', async () => {
      mockTmdb.discover.mockResolvedValue(makeTMDBSearchResult([{ id: 1 } as never]));

      const res = await request.get('/api/discover');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('passes with_watch_providers filter to service', async () => {
      mockTmdb.discover.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover?with_watch_providers=8');
      expect(mockTmdb.discover).toHaveBeenCalledWith(
        expect.objectContaining({ with_watch_providers: '8' }),
        'en-US',
      );
    });

    it('passes with_genres filter', async () => {
      mockTmdb.discover.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover?with_genres=28');
      expect(mockTmdb.discover).toHaveBeenCalledWith(
        expect.objectContaining({ with_genres: '28' }),
        'en-US',
      );
    });

    it('passes page as integer', async () => {
      mockTmdb.discover.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover?page=2');
      expect(mockTmdb.discover).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }), 'en-US');
    });

    it('forwards language=pt-BR query to TMDB', async () => {
      mockTmdb.discover.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover?language=pt-BR');
      expect(mockTmdb.discover).toHaveBeenCalledWith(expect.any(Object), 'pt-BR');
    });

    it('returns 400 for invalid language', async () => {
      const res = await request.get('/api/discover?language=fr-FR');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.get('/api/discover?type=anime');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/discover/trending', () => {
    it('defaults type=all and time_window=week', async () => {
      mockTmdb.getTrending.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/trending');
      expect(mockTmdb.getTrending).toHaveBeenCalledWith('all', 'week', 'en-US', undefined);
    });

    it('accepts type=movie', async () => {
      mockTmdb.getTrending.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/trending?type=movie');
      expect(mockTmdb.getTrending).toHaveBeenCalledWith('movie', 'week', 'en-US', undefined);
    });

    it('accepts time_window=day', async () => {
      mockTmdb.getTrending.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/trending?time_window=day');
      expect(mockTmdb.getTrending).toHaveBeenCalledWith('all', 'day', 'en-US', undefined);
    });

    it('passes page param', async () => {
      mockTmdb.getTrending.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/trending?page=2');
      expect(mockTmdb.getTrending).toHaveBeenCalledWith('all', 'week', 'en-US', 2);
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.get('/api/discover/trending?type=invalid');
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid time_window', async () => {
      const res = await request.get('/api/discover/trending?time_window=month');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/discover/top-rated', () => {
    it('returns results for movie (default)', async () => {
      mockTmdb.getTopRated.mockResolvedValue(makeTMDBSearchResult([{ id: 10 } as never]));

      const res = await request.get('/api/discover/top-rated');
      expect(res.status).toBe(200);
      expect(mockTmdb.getTopRated).toHaveBeenCalledWith('movie', 'en-US', undefined);
    });

    it('passes page param', async () => {
      mockTmdb.getTopRated.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/top-rated?page=3');
      expect(mockTmdb.getTopRated).toHaveBeenCalledWith('movie', 'en-US', 3);
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.get('/api/discover/top-rated?type=anime');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/discover/upcoming', () => {
    it('calls getUpcoming', async () => {
      mockTmdb.getUpcoming.mockResolvedValue(makeTMDBSearchResult([{ id: 5 } as never]));

      const res = await request.get('/api/discover/upcoming');
      expect(res.status).toBe(200);
      expect(mockTmdb.getUpcoming).toHaveBeenCalled();
    });

    it('passes page param', async () => {
      mockTmdb.getUpcoming.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/upcoming?page=2');
      expect(mockTmdb.getUpcoming).toHaveBeenCalledWith('en-US', 2);
    });
  });

  describe('GET /api/discover/popular', () => {
    it('returns results for movie (default)', async () => {
      mockTmdb.getPopular.mockResolvedValue(makeTMDBSearchResult());

      const res = await request.get('/api/discover/popular');
      expect(res.status).toBe(200);
      expect(mockTmdb.getPopular).toHaveBeenCalledWith('movie', 'en-US', undefined);
    });

    it('returns results for tv', async () => {
      mockTmdb.getPopular.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/popular?type=tv');
      expect(mockTmdb.getPopular).toHaveBeenCalledWith('tv', 'en-US', undefined);
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.get('/api/discover/popular?type=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/discover/genres', () => {
    it('returns genres for movie (default)', async () => {
      mockTmdb.getGenres.mockResolvedValue({ genres: [{ id: 28, name: 'Action' }] });

      const res = await request.get('/api/discover/genres');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([{ id: 28, name: 'Action' }]);
    });

    it('returns genres for tv', async () => {
      mockTmdb.getGenres.mockResolvedValue({ genres: [] });

      await request.get('/api/discover/genres?type=tv');
      expect(mockTmdb.getGenres).toHaveBeenCalledWith('tv', 'en-US');
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.get('/api/discover/genres?type=anime');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/discover/providers', () => {
    it('calls getWatchProviders with region=BR', async () => {
      mockTmdb.getWatchProviders.mockResolvedValue({ results: [] });

      await request.get('/api/discover/providers');
      expect(mockTmdb.getWatchProviders).toHaveBeenCalledWith('movie', 'en-US', 'BR');
    });

    it('accepts type=tv', async () => {
      mockTmdb.getWatchProviders.mockResolvedValue({ results: [] });

      await request.get('/api/discover/providers?type=tv');
      expect(mockTmdb.getWatchProviders).toHaveBeenCalledWith('tv', 'en-US', 'BR');
    });

    it('returns 400 for invalid type', async () => {
      const res = await request.get('/api/discover/providers?type=invalid');
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/discover/search', () => {
    it('returns results for valid query', async () => {
      mockTmdb.search.mockResolvedValue(makeTMDBSearchResult([{ id: 1 } as never]));

      const res = await request.get('/api/discover/search?query=batman');
      expect(res.status).toBe(200);
      expect(mockTmdb.search).toHaveBeenCalledWith('batman', 'en-US', undefined, undefined);
    });

    it('passes type and year params', async () => {
      mockTmdb.search.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/search?query=batman&type=movie&year=2022');
      expect(mockTmdb.search).toHaveBeenCalledWith('batman', 'en-US', 'movie', 2022);
    });

    it('returns 400 when query param is missing', async () => {
      const res = await request.get('/api/discover/search');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Query parameter is required');
    });

    it('treats unknown type as undefined (multi search)', async () => {
      mockTmdb.search.mockResolvedValue(makeTMDBSearchResult());

      await request.get('/api/discover/search?query=test&type=anime');
      expect(mockTmdb.search).toHaveBeenCalledWith('test', 'en-US', undefined, undefined);
    });
  });

  describe('GET /api/discover/now-playing', () => {
    it('returns results', async () => {
      mockTmdb.getNowPlaying.mockResolvedValue(makeTMDBSearchResult([{ id: 99 } as never]));

      const res = await request.get('/api/discover/now-playing');
      expect(res.status).toBe(200);
      expect(mockTmdb.getNowPlaying).toHaveBeenCalled();
    });
  });
});
