import axios from 'axios';
import type { MediaType } from '../types/index.js';
import { env } from '../config/env.js';

const tmdbClient = axios.create({
  baseURL: env.TMDB_BASE_URL,
  params: {
    api_key: env.TMDB_API_KEY,
  },
});

export class TMDBError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly tmdbMessage?: string,
  ) {
    super(message);
    this.name = 'TMDBError';
  }
}

function handleTMDBError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status ?? 500;
    const tmdbMessage = (error.response?.data as { status_message?: string })?.status_message;
    const message = tmdbMessage ?? error.message;
    throw new TMDBError(`TMDB API error: ${message}`, status, tmdbMessage);
  }
  throw error;
}

export interface TMDBMediaDetails {
  id: number;
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  genres: Array<{ id: number; name: string }>;
  origin_country?: string[];
  number_of_seasons?: number;
  next_episode_to_air: {
    id: number;
    name: string;
    overview: string;
    air_date: string;
    episode_number: number;
    season_number: number;
    still_path: string | null;
    runtime: number | null;
    vote_average: number;
  } | null;
  last_episode_to_air: {
    id: number;
    name: string;
    overview: string;
    air_date: string;
    episode_number: number;
    season_number: number;
    still_path: string | null;
    runtime: number | null;
    vote_average: number;
  } | null;
  credits?: {
    cast: Array<{
      id: number;
      name: string;
      character: string;
      profile_path: string | null;
    }>;
    crew: Array<{
      id: number;
      name: string;
      job: string;
      profile_path: string | null;
    }>;
  };
  'watch/providers'?: {
    results: Record<string, unknown>;
  };
}

export interface TMDBSearchResult {
  page: number;
  total_pages: number;
  total_results: number;
  results: Array<{
    id: number;
    title?: string;
    name?: string;
    media_type?: string;
    overview: string;
    poster_path: string | null;
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
  }>;
}

export interface TMDBSeasonDetails {
  id: number;
  name: string;
  season_number: number;
  episodes: Array<{
    id: number;
    name: string;
    episode_number: number;
    season_number: number;
    overview: string;
    still_path: string | null;
    air_date: string;
    runtime: number | null;
    vote_average: number;
  }>;
}

export interface DiscoverParams {
  type: MediaType;
  with_watch_providers?: string;
  watch_region?: string;
  with_genres?: string;
  with_origin_country?: string;
  sort_by?: string;
  page?: number;
}

export interface TMDBGenreList {
  genres: Array<{ id: number; name: string }>;
}

export interface TMDBProviderList {
  results: Array<{
    provider_id: number;
    provider_name: string;
    logo_path: string;
    display_priority: number;
  }>;
}

export const tmdbService = {
  async getMediaDetails(id: number, type: MediaType): Promise<TMDBMediaDetails> {
    try {
      const { data } = await tmdbClient.get<TMDBMediaDetails>(`/${type}/${id}`, {
        params: { append_to_response: 'credits,watch/providers' },
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getTrending(
    type: 'movie' | 'tv' | 'all',
    timeWindow: 'day' | 'week',
  ): Promise<TMDBSearchResult> {
    try {
      const { data } = await tmdbClient.get<TMDBSearchResult>(`/trending/${type}/${timeWindow}`);
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async search(query: string, type?: MediaType, year?: number): Promise<TMDBSearchResult> {
    try {
      const searchType = type ?? 'multi';
      const yearParam = type === 'tv' ? 'first_air_date_year' : 'year';
      const { data } = await tmdbClient.get<TMDBSearchResult>(`/search/${searchType}`, {
        params: { query, ...(year && { [yearParam]: year }) },
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async discover(params: DiscoverParams): Promise<TMDBSearchResult> {
    try {
      const { type, ...filters } = params;
      const { data } = await tmdbClient.get<TMDBSearchResult>(`/discover/${type}`, {
        params: filters,
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getNowPlaying(): Promise<TMDBSearchResult> {
    try {
      const { data } = await tmdbClient.get<TMDBSearchResult>('/movie/now_playing', {
        params: { region: 'BR' },
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getSeasonDetails(tvId: number, seasonNumber: number): Promise<TMDBSeasonDetails> {
    try {
      const { data } = await tmdbClient.get<TMDBSeasonDetails>(
        `/tv/${tvId}/season/${seasonNumber}`,
      );
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getTopRated(type: MediaType, page?: number): Promise<TMDBSearchResult> {
    try {
      const { data } = await tmdbClient.get<TMDBSearchResult>(`/${type}/top_rated`, {
        params: { ...(page && { page }) },
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getUpcoming(page?: number): Promise<TMDBSearchResult> {
    try {
      const { data } = await tmdbClient.get<TMDBSearchResult>('/movie/upcoming', {
        params: { region: 'BR', ...(page && { page }) },
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getPopular(type: MediaType, page?: number): Promise<TMDBSearchResult> {
    try {
      const { data } = await tmdbClient.get<TMDBSearchResult>(`/${type}/popular`, {
        params: { ...(page && { page }) },
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getGenres(type: MediaType): Promise<TMDBGenreList> {
    try {
      const { data } = await tmdbClient.get<TMDBGenreList>(`/genre/${type}/list`);
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },

  async getWatchProviders(type: MediaType, region?: string): Promise<TMDBProviderList> {
    try {
      const { data } = await tmdbClient.get<TMDBProviderList>(`/watch/providers/${type}`, {
        params: { ...(region && { watch_region: region }) },
      });
      return data;
    } catch (error) {
      handleTMDBError(error);
    }
  },
};
