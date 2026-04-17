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

      await tmdbService.getMediaDetails(550, 'movie', 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/550', {
        params: { language: 'en-US', append_to_response: 'credits,watch/providers' },
      });
    });

    it('works for tv type', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBMedia({ id: 1396, name: 'Breaking Bad' }) });

      await tmdbService.getMediaDetails(1396, 'tv', 'pt-BR');

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/1396', expect.any(Object));
    });

    it('forwards the language param', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBMedia() });

      await tmdbService.getMediaDetails(550, 'movie', 'pt-BR');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/550', {
        params: { language: 'pt-BR', append_to_response: 'credits,watch/providers' },
      });
    });

    it('returns typed TMDBMediaDetails', async () => {
      const media = makeTMDBMedia({ id: 550 });
      mockAxiosGet.mockResolvedValue({ data: media });

      const result = await tmdbService.getMediaDetails(550, 'movie', 'en-US');

      expect(result.id).toBe(550);
      expect(result.title).toBe('Fight Club');
    });

    it('throws TMDBError on 404', async () => {
      mockAxiosGet.mockRejectedValue(
        makeAxiosError(404, 'The resource you requested could not be found.'),
      );

      await expect(tmdbService.getMediaDetails(99999, 'movie', 'en-US')).rejects.toBeInstanceOf(
        TMDBError,
      );
    });

    it('includes the status code in TMDBError', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(429, 'Request count over limit.'));

      await expect(tmdbService.getMediaDetails(1, 'movie', 'en-US')).rejects.toMatchObject({
        statusCode: 429,
      });
    });
  });

  describe('getTrending', () => {
    it('calls /trending/<type>/<timeWindow> with language', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getTrending('movie', 'week', 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/trending/movie/week', {
        params: { language: 'en-US' },
      });
    });

    it('returns TMDBSearchResult', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult([{ id: 1 } as never]) });

      const result = await tmdbService.getTrending('all', 'day', 'pt-BR');
      expect(result.results).toHaveLength(1);
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(500, 'Internal error'));

      await expect(tmdbService.getTrending('all', 'week', 'en-US')).rejects.toBeInstanceOf(
        TMDBError,
      );
    });
  });

  describe('search', () => {
    it('calls /search/multi when no type provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('batman', 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/multi', expect.any(Object));
    });

    it('calls /search/movie when type=movie', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('batman', 'en-US', 'movie');

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/movie', expect.any(Object));
    });

    it('uses "year" param for movie type', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('batman', 'en-US', 'movie', 2022);

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/movie', {
        params: { query: 'batman', language: 'en-US', year: 2022 },
      });
    });

    it('uses "first_air_date_year" param for tv type', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.search('game of thrones', 'pt-BR', 'tv', 2011);

      expect(mockAxiosGet).toHaveBeenCalledWith('/search/tv', {
        params: { query: 'game of thrones', language: 'pt-BR', first_air_date_year: 2011 },
      });
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(400, 'Invalid query'));

      await expect(tmdbService.search('', 'en-US')).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('discover', () => {
    it('calls /discover/<type> with filter params and language', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.discover({ type: 'movie', with_genres: '28', page: 1 }, 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/discover/movie', {
        params: { language: 'en-US', with_genres: '28', page: 1 },
      });
    });

    it('excludes undefined filter params', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.discover({ type: 'tv' }, 'pt-BR');

      const call = mockAxiosGet.mock.calls[0];
      expect((call[1] as { params: Record<string, unknown> }).params).not.toHaveProperty(
        'with_genres',
      );
    });
  });

  describe('getNowPlaying', () => {
    it('calls /movie/now_playing with region=BR and language', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getNowPlaying('en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/now_playing', {
        params: { language: 'en-US', region: 'BR' },
      });
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(503, 'Service unavailable'));

      await expect(tmdbService.getNowPlaying('en-US')).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('getSeasonDetails', () => {
    it('calls /tv/<tvId>/season/<seasonNumber> with language', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSeasonDetails() });

      await tmdbService.getSeasonDetails(1396, 1, 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/1396/season/1', {
        params: { language: 'en-US' },
      });
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(404, 'Season not found'));

      await expect(tmdbService.getSeasonDetails(1, 99, 'en-US')).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('getTopRated', () => {
    it('calls /<type>/top_rated with language', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getTopRated('movie', 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/top_rated', {
        params: { language: 'en-US' },
      });
    });

    it('passes page param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getTopRated('tv', 'pt-BR', 2);

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/top_rated', {
        params: { language: 'pt-BR', page: 2 },
      });
    });
  });

  describe('getUpcoming', () => {
    it('calls /movie/upcoming with region=BR and language', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getUpcoming('en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/upcoming', {
        params: { language: 'en-US', region: 'BR' },
      });
    });

    it('passes page param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getUpcoming('pt-BR', 3);

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/upcoming', {
        params: { language: 'pt-BR', region: 'BR', page: 3 },
      });
    });
  });

  describe('getPopular', () => {
    it('calls /<type>/popular with language', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getPopular('movie', 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/movie/popular', {
        params: { language: 'en-US' },
      });
    });

    it('passes page param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: makeTMDBSearchResult() });

      await tmdbService.getPopular('tv', 'pt-BR', 5);

      expect(mockAxiosGet).toHaveBeenCalledWith('/tv/popular', {
        params: { language: 'pt-BR', page: 5 },
      });
    });
  });

  describe('getGenres', () => {
    it('calls /genre/<type>/list with language', async () => {
      mockAxiosGet.mockResolvedValue({ data: { genres: [] } });

      await tmdbService.getGenres('movie', 'pt-BR');

      expect(mockAxiosGet).toHaveBeenCalledWith('/genre/movie/list', {
        params: { language: 'pt-BR' },
      });
    });

    it('throws TMDBError on failure', async () => {
      mockAxiosGet.mockRejectedValue(makeAxiosError(401, 'Unauthorized'));

      await expect(tmdbService.getGenres('tv', 'en-US')).rejects.toBeInstanceOf(TMDBError);
    });
  });

  describe('getWatchProviders', () => {
    it('calls /watch/providers/<type> with language', async () => {
      mockAxiosGet.mockResolvedValue({ data: { results: [] } });

      await tmdbService.getWatchProviders('movie', 'en-US');

      expect(mockAxiosGet).toHaveBeenCalledWith('/watch/providers/movie', {
        params: { language: 'en-US' },
      });
    });

    it('passes watch_region param when provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: { results: [] } });

      await tmdbService.getWatchProviders('tv', 'pt-BR', 'BR');

      expect(mockAxiosGet).toHaveBeenCalledWith('/watch/providers/tv', {
        params: { language: 'pt-BR', watch_region: 'BR' },
      });
    });

    it('omits watch_region when not provided', async () => {
      mockAxiosGet.mockResolvedValue({ data: { results: [] } });

      await tmdbService.getWatchProviders('movie', 'en-US');

      const call = mockAxiosGet.mock.calls[0];
      expect((call[1] as { params: Record<string, unknown> }).params).not.toHaveProperty(
        'watch_region',
      );
    });
  });
});
