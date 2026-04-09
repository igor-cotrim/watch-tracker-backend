import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

const { mockAxiosGet } = vi.hoisted(() => {
  const mockAxiosGet = vi.fn();
  return { mockAxiosGet };
});

vi.mock('axios', async () => {
  const actual = await vi.importActual<typeof axios>('axios');
  return {
    default: {
      ...(actual as object),
      create: vi.fn().mockReturnValue({ get: mockAxiosGet }),
      isAxiosError: (actual as typeof axios).isAxiosError,
      AxiosError: (actual as typeof axios).AxiosError,
    },
  };
});

import { tmdbService, TMDBError } from '../../../services/tmdb.js';
import {
  makeTMDBMedia,
  makeTMDBSearchResult,
  makeTMDBSeasonDetails,
} from '../../helpers/mockFactory.js';

function makeAxiosError(status: number, message: string) {
  const err = new Error(message) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: { status_message: string } };
  };
  err.isAxiosError = true;
  err.response = { status, data: { status_message: message } };
  Object.setPrototypeOf(err, axios.AxiosError.prototype);
  return err;
}

describe('tmdbService', () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  describe('getMediaDetails', () => {
    it('calls the correct endpoint with append_to_response', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBMedia() });

      await tmdbService.getMediaDetails(550, 'movie');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/550', {
        params: { append_to_response: 'credits,watch/providers' },
      });
    });

    it('works for tv type', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBMedia({ id: 1396, name: 'Breaking Bad' }) });

      await tmdbService.getMediaDetails(1396, 'tv');

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/1396', expect.any(Object));
    });

    it('returns typed TMDBMediaDetails', async () => {
      const media = makeTMDBMedia({ id: 550 });
      mockAxiosGet.mockResolvedValue({ data: media });

      const result = await tmdbService.getMediaDetails(550, 'movie');

      expect(result.id).toBe(550);
      expect(result.title).toBe('Fight Club');
    });

    it('throws TMDBError on 404', async () => {
      mockAxiosGet.mockRejectedValue(
        makeAxiosError(404, 'The resource you requested could not be found.'),
      );

      await expect(tmdbService.getMediaDetails(99999, 'movie')).rejects.toBeInstanceOf(TMDBError);
    });

    it('includes the status code in TMDBError', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(429, 'Request count over limit.'));

      await expect(tmdbService.getMediaDetails(1, 'movie')).rejects.toMatchObject({
        statusCode: 429,
      });
    });
  });

  describe('getTrending', () => {
    it('calls /trending/<type>/<timeWindow>', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getTrending('movie', 'week');

      expect(mockAxiosGet).toHaveBeenCalledWith('/trending/movie/week');
    });

    it('returns TMDBSearchResult', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult([{ id: 1 } as never]) });

      const result = await tmdbService.getTrending('all', 'day');
      expect(result.results).toHaveLength(1);
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(500, 'Internal error'));

      await expect(tmdbService.getTrending('all', 'week')).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('search', () => {
    it('calls /search/multi when no type provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('batman');

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/multi', expect.any(Object));
    });

    it('calls /search/movie when type=movie', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('batman', 'movie');

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/movie', expect.any(Object));
    });

    it('uses "year" param for movie type', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('batman', 'movie', 2022);

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/movie', {
        params: { query: 'batman', year: 2022 },
      });
    });

    it('uses "first_air_date_year" param for tv type', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('game of thrones', 'tv', 2011);

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/tv', {
        params: { query: 'game of thrones', first_air_date_year: 2011 },
      });
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(400, 'Invalid query'));

      await expect(tmdbService.search('')).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('discover', () => {
    it('calls /discover/<type> with filter params', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.discover({ type: 'movie', with_genres: '28', page: 1 });

      expect(mockAxiosGet).toHaveBeenCalledWith('/discover/movie', {
        params: { with_genres: '28', page: 1 },
      });
    });

    it('excludes undefined filter params', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.discover({ type: 'tv' });

      const call = mockAxiosGet.mock.calls[0];
      expect((call[1] as { params: Record<string, unknown> }).params).not.toHaveProperty(
        'with_genres',
      );
    });
  });

  describe('getNowPlaying', () => {
    it('calls /movie/now_playing with region=BR', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getNowPlaying();

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/now_playing', {
        params: { region: 'BR' },
      });
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(503, 'Service unavailable'));

      await expect(tmdbService.getNowPlaying()).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('getSeasonDetails', () => {
    it('calls /tv/<tvId>/season/<seasonNumber>', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSeasonDetails() });

      await tmdbService.getSeasonDetails(1396, 1);

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/1396/season/1');
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(404, 'Season not found'));

      await expect(tmdbService.getSeasonDetails(1, 99)).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('getTopRated', () => {
    it('calls /<type>/top_rated', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getTopRated('movie');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/top_rated', { params: {} });
    });

    it('passes page param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getTopRated('tv', 2);

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/top_rated', { params: { page: 2 } });
    });
  });

  describe('getUpcoming', () => {
    it('calls /movie/upcoming with region=BR', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getUpcoming();

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/upcoming', {
        params: { region: 'BR' },
      });
    });

    it('passes page param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getUpcoming(3);

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/upcoming', {
        params: { region: 'BR', page: 3 },
      });
    });
  });

  describe('getPopular', () => {
    it('calls /<type>/popular', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getPopular('movie');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/popular', { params: {} });
    });

    it('passes page param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getPopular('tv', 5);

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/popular', { params: { page: 5 } });
    });
  });

  describe('getGenres', () => {
    it('calls /genre/<type>/list', async () => {
      mockAxiosGet.mockResolvedValue({ data: { genres: [] } });

      await tmdbService.getGenres('movie');

      expect(mockAxiosGet).toHaveBeenCalledWith('/genre/movie/list');
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(401, 'Unauthorized'));

      await expect(tmdbService.getGenres('tv')).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('getWatchProviders', () => {
    it('calls /watch/providers/<type>', async () => {
      mockAxiosGet.mockResolvedValue({ data: { results: [] } });

      await tmdbService.getWatchProviders('movie');

      expect(mockAxiosGet).toHaveBeenCalledWith('/watch/providers/movie', { params: {} });
    });

    it('passes watch_region param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: { results: [] } });

      await tmdbService.getWatchProviders('tv', 'BR');

      expect(mockAxiosGet).toHaveBeenCalledWith('/watch/providers/tv', {
        params: { watch_region: 'BR' },
      });
    });

    it('omits watch_region when not provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: { results: [] } });

      await tmdbService.getWatchProviders('movie');

      const call = mockAxiosGet.mock.calls[0];
      expect((call[1] as { params: Record<string, unknown> }).params).not.toHaveProperty(
        'watch_region',
      );
    });
  });
});
