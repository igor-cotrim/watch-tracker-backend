import type { TMDBMediaDetails, TMDBSearchResult, TMDBSeasonDetails } from '../../services/tmdb.js';

export function makeTMDBMedia(overrides: Partial<TMDBMediaDetails> = {}): TMDBMediaDetails {
  return {
    id: 550,
    title: 'Fight Club',
    overview: 'A ticking-time-bomb insomniac...',
    poster_path: '/abc.jpg',
    backdrop_path: null,
    vote_average: 8.4,
    genres: [],
    next_episode_to_air: null,
    last_episode_to_air: null,
    ...overrides,
  };
}

export function makeNextEpisode(
  overrides: Partial<NonNullable<TMDBMediaDetails['next_episode_to_air']>> = {},
): NonNullable<TMDBMediaDetails['next_episode_to_air']> {
  return {
    id: 999,
    name: 'Upcoming Episode',
    overview: '',
    air_date: '2099-01-01',
    episode_number: 5,
    season_number: 2,
    still_path: null,
    runtime: 45,
    vote_average: 0,
    ...overrides,
  };
}

export function makeTMDBSearchResult(results: TMDBSearchResult['results'] = []): TMDBSearchResult {
  return {
    page: 1,
    total_pages: 1,
    total_results: results.length,
    results,
  };
}

export function makeTMDBSeasonDetails(
  overrides: Partial<TMDBSeasonDetails> = {},
): TMDBSeasonDetails {
  return {
    id: 1,
    name: 'Season 1',
    season_number: 1,
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
      {
        id: 102,
        name: 'Episode 2',
        episode_number: 2,
        season_number: 1,
        overview: '',
        still_path: null,
        air_date: '2024-01-08',
        runtime: 45,
        vote_average: 7.8,
      },
    ],
    ...overrides,
  };
}

export function makeWatchlistItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 'user-uuid',
    tmdbId: 550,
    mediaType: 'movie',
    status: 'watching',
    addedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

export function makeSupabaseUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid',
    email: 'test@example.com',
    user_metadata: {},
    ...overrides,
  };
}
