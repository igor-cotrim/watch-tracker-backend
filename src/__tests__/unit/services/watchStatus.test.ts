import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../../../services/tmdb.js', () => ({
  tmdbService: {
    getMediaDetails: vi.fn(),
    getSeasonDetails: vi.fn(),
  },
}));

import { db } from '../../../db/index.js';
import { tmdbService } from '../../../services/tmdb.js';
import { detectNewSeasonForCompleted } from '../../../services/watchStatus.js';
import {
  makeTMDBMedia,
  makeTMDBSeasonDetails,
  makeWatchlistItem,
} from '../../helpers/mockFactory.js';

const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockTmdb = tmdbService as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makeSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

const USER = 'user-uuid';
const TMDB_ID = 94997;

describe('detectNewSeasonForCompleted', () => {
  beforeEach(() => {
    for (const fn of Object.values(mockDb)) fn.mockReset();
    for (const fn of Object.values(mockTmdb)) fn.mockReset();
  });

  it('returns the new season number and flips status when a newer season has aired', async () => {
    const completedEntry = makeWatchlistItem({
      tmdbId: TMDB_ID,
      mediaType: 'tv',
      status: 'completed',
    });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([completedEntry])) // watchlist entry
      .mockReturnValueOnce(makeSelectChain([{ seasonNumber: 1, episodeNumber: 1 }])); // watched

    const updateWhere = vi.fn().mockResolvedValue([]);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    mockDb.update.mockReturnValue({ set: updateSet });

    mockTmdb.getMediaDetails.mockResolvedValue(
      makeTMDBMedia({ id: TMDB_ID, number_of_seasons: 2 }),
    );
    mockTmdb.getSeasonDetails.mockResolvedValue(
      makeTMDBSeasonDetails({
        season_number: 2,
        episodes: [
          {
            id: 201,
            name: 'S2E1',
            episode_number: 1,
            season_number: 2,
            overview: '',
            still_path: null,
            air_date: '2024-06-16',
            runtime: 60,
            vote_average: 8,
          },
        ],
      }),
    );

    const result = await detectNewSeasonForCompleted(USER, TMDB_ID);

    expect(result).toBe(2);
    expect(updateSet).toHaveBeenCalledWith({ status: 'watching' });
    expect(mockTmdb.getSeasonDetails).toHaveBeenCalledWith(TMDB_ID, 2, expect.anything());
  });

  it('returns null when the only newer season has not aired yet', async () => {
    const completedEntry = makeWatchlistItem({
      tmdbId: TMDB_ID,
      mediaType: 'tv',
      status: 'completed',
    });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([completedEntry]))
      .mockReturnValueOnce(makeSelectChain([{ seasonNumber: 1, episodeNumber: 1 }]));

    mockTmdb.getMediaDetails.mockResolvedValue(
      makeTMDBMedia({ id: TMDB_ID, number_of_seasons: 2 }),
    );
    mockTmdb.getSeasonDetails.mockResolvedValue(
      makeTMDBSeasonDetails({
        season_number: 2,
        episodes: [
          {
            id: 201,
            name: 'Future',
            episode_number: 1,
            season_number: 2,
            overview: '',
            still_path: null,
            air_date: '2099-01-01',
            runtime: 60,
            vote_average: 0,
          },
        ],
      }),
    );

    const result = await detectNewSeasonForCompleted(USER, TMDB_ID);

    expect(result).toBeNull();
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it('returns null when the show has no watched episodes (no baseline)', async () => {
    const completedEntry = makeWatchlistItem({
      tmdbId: TMDB_ID,
      mediaType: 'tv',
      status: 'completed',
    });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([completedEntry]))
      .mockReturnValueOnce(makeSelectChain([])); // no watched episodes

    const result = await detectNewSeasonForCompleted(USER, TMDB_ID);

    expect(result).toBeNull();
    expect(mockTmdb.getMediaDetails).not.toHaveBeenCalled();
  });

  it('returns null without fetching seasons when no season beyond watched exists', async () => {
    const completedEntry = makeWatchlistItem({
      tmdbId: TMDB_ID,
      mediaType: 'tv',
      status: 'completed',
    });
    mockDb.select
      .mockReturnValueOnce(makeSelectChain([completedEntry]))
      .mockReturnValueOnce(makeSelectChain([{ seasonNumber: 2, episodeNumber: 1 }]));

    mockTmdb.getMediaDetails.mockResolvedValue(
      makeTMDBMedia({ id: TMDB_ID, number_of_seasons: 2 }),
    );

    const result = await detectNewSeasonForCompleted(USER, TMDB_ID);

    expect(result).toBeNull();
    expect(mockTmdb.getSeasonDetails).not.toHaveBeenCalled();
  });

  it('returns null when the entry is not completed', async () => {
    const watchingEntry = makeWatchlistItem({
      tmdbId: TMDB_ID,
      mediaType: 'tv',
      status: 'watching',
    });
    mockDb.select.mockReturnValueOnce(makeSelectChain([watchingEntry]));

    const result = await detectNewSeasonForCompleted(USER, TMDB_ID);

    expect(result).toBeNull();
  });
});
