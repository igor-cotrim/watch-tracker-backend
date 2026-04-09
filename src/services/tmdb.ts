import axios from "axios";
import type { MediaType } from "../types/index.js";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL =
  process.env.TMDB_BASE_URL || "https://api.themoviedb.org/3";

if (!TMDB_API_KEY) {
  throw new Error("TMDB_API_KEY environment variable is not set");
}

const tmdbClient = axios.create({
  baseURL: TMDB_BASE_URL,
  params: {
    api_key: TMDB_API_KEY,
  },
});

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
  "watch/providers"?: {
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
  async getMediaDetails(
    id: number,
    type: MediaType,
  ): Promise<TMDBMediaDetails> {
    const { data } = await tmdbClient.get<TMDBMediaDetails>(`/${type}/${id}`, {
      params: {
        append_to_response: "credits,watch/providers",
      },
    });
    return data;
  },

  async getTrending(
    type: "movie" | "tv" | "all",
    timeWindow: "day" | "week",
  ): Promise<TMDBSearchResult> {
    const { data } = await tmdbClient.get<TMDBSearchResult>(
      `/trending/${type}/${timeWindow}`,
    );
    return data;
  },

  async search(
    query: string,
    type?: MediaType,
    year?: number,
  ): Promise<TMDBSearchResult> {
    const searchType = type || "multi";
    const yearParam = type === "tv" ? "first_air_date_year" : "year";
    const { data } = await tmdbClient.get<TMDBSearchResult>(
      `/search/${searchType}`,
      {
        params: { query, ...(year && { [yearParam]: year }) },
      },
    );
    return data;
  },

  async discover(params: DiscoverParams): Promise<TMDBSearchResult> {
    const { type, ...filters } = params;
    const { data } = await tmdbClient.get<TMDBSearchResult>(
      `/discover/${type}`,
      {
        params: filters,
      },
    );
    return data;
  },

  async getNowPlaying(): Promise<TMDBSearchResult> {
    const { data } = await tmdbClient.get<TMDBSearchResult>(
      "/movie/now_playing",
      {
        params: { region: "BR" },
      },
    );
    return data;
  },

  async getSeasonDetails(
    tvId: number,
    seasonNumber: number,
  ): Promise<TMDBSeasonDetails> {
    const { data } = await tmdbClient.get<TMDBSeasonDetails>(
      `/tv/${tvId}/season/${seasonNumber}`,
    );
    return data;
  },

  async getTopRated(type: MediaType, page?: number): Promise<TMDBSearchResult> {
    const { data } = await tmdbClient.get<TMDBSearchResult>(
      `/${type}/top_rated`,
      { params: { ...(page && { page }) } },
    );
    return data;
  },

  async getUpcoming(page?: number): Promise<TMDBSearchResult> {
    const { data } = await tmdbClient.get<TMDBSearchResult>("/movie/upcoming", {
      params: { region: "BR", ...(page && { page }) },
    });
    return data;
  },

  async getPopular(type: MediaType, page?: number): Promise<TMDBSearchResult> {
    const { data } = await tmdbClient.get<TMDBSearchResult>(
      `/${type}/popular`,
      { params: { ...(page && { page }) } },
    );
    return data;
  },

  async getGenres(type: MediaType): Promise<TMDBGenreList> {
    const { data } = await tmdbClient.get<TMDBGenreList>(`/genre/${type}/list`);
    return data;
  },

  async getWatchProviders(
    type: MediaType,
    region?: string,
  ): Promise<TMDBProviderList> {
    const { data } = await tmdbClient.get<TMDBProviderList>(
      `/watch/providers/${type}`,
      { params: { ...(region && { watch_region: region }) } },
    );
    return data;
  },
};
