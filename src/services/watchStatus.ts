import { eq, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import { userWatchlist, userEpisodesWatched } from '../db/schema.js';
import { tmdbService } from './tmdb.js';
import { DEFAULT_LANGUAGE, type WatchStatus } from '../types/index.js';

/**
 * Checks if all aired episodes of a TV show have been watched and updates
 * the watchlist status to 'completed' if so. Returns the new status or null
 * if no change was made.
 *
 * Safe to call on any episode mark/unmark — it will short-circuit early if
 * the show is not in the watchlist, is 'dropped', or has unwatched aired episodes.
 */
export async function checkAndUpdateTVStatus(
  userId: string,
  tmdbId: number,
): Promise<WatchStatus | null> {
  try {
    // Fetch the current watchlist entry
    const [entry] = await db
      .select()
      .from(userWatchlist)
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, tmdbId),
          eq(userWatchlist.mediaType, 'tv'),
        ),
      );

    if (!entry) return null;
    if (entry.status === 'dropped') return null;
    // If already completed, no need to recheck completion
    if (entry.status === 'completed') return null;

    // Fetch show details to get number of seasons
    const show = await tmdbService.getMediaDetails(tmdbId, 'tv', DEFAULT_LANGUAGE);
    const numberOfSeasons = show.number_of_seasons ?? 0;

    if (numberOfSeasons === 0) return null;

    // If TMDB signals there are future episodes scheduled, never mark as completed
    if (show.next_episode_to_air) return null;

    const today = new Date();
    today.setHours(23, 59, 59, 999); // end of today

    let totalAiredEpisodes = 0;

    for (let seasonNumber = 1; seasonNumber <= numberOfSeasons; seasonNumber++) {
      const season = await tmdbService.getSeasonDetails(tmdbId, seasonNumber, DEFAULT_LANGUAGE);

      // Filter only episodes that have aired (air_date <= today)
      const airedEpisodes = season.episodes.filter((ep) => {
        if (!ep.air_date) return false;
        const airDate = new Date(ep.air_date);
        return airDate <= today;
      });

      if (airedEpisodes.length === 0) continue;

      totalAiredEpisodes += airedEpisodes.length;
      const airedEpisodeNumbers = new Set(airedEpisodes.map((ep) => ep.episode_number));

      // Fetch watched episodes for this season
      const watched = await db
        .select()
        .from(userEpisodesWatched)
        .where(
          and(
            eq(userEpisodesWatched.userId, userId),
            eq(userEpisodesWatched.tmdbId, tmdbId),
            eq(userEpisodesWatched.seasonNumber, seasonNumber),
          ),
        );

      const watchedSet = new Set(watched.map((e) => e.episodeNumber));

      // Short-circuit: if any aired episode is unwatched, show is not complete
      for (const epNumber of airedEpisodeNumbers) {
        if (!watchedSet.has(epNumber)) return null;
      }
    }

    // No aired episodes exist — don't mark as completed
    if (totalAiredEpisodes === 0) return null;

    // All aired episodes are watched — update status to completed
    await db
      .update(userWatchlist)
      .set({ status: 'completed' })
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, tmdbId),
          eq(userWatchlist.mediaType, 'tv'),
        ),
      );

    return 'completed';
  } catch (error) {
    // Don't fail the episode mutation if status check fails
    console.error('watchStatus: failed to check/update TV status', error);
    return null;
  }
}

/**
 * When a user marks an episode watched, ensure the show is on the watchlist
 * with an active status. Auto-adds the show as 'watching' if missing, and
 * promotes 'plan_to_watch' → 'watching'. Leaves 'watching', 'completed', and
 * 'dropped' untouched. Returns the new status or null if unchanged.
 */
export async function ensureWatchingOnEpisodeMark(
  userId: string,
  tmdbId: number,
): Promise<WatchStatus | null> {
  try {
    const [entry] = await db
      .select()
      .from(userWatchlist)
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, tmdbId),
          eq(userWatchlist.mediaType, 'tv'),
        ),
      );

    if (!entry) {
      await db.insert(userWatchlist).values({
        userId,
        tmdbId,
        mediaType: 'tv',
        status: 'watching',
      });
      return 'watching';
    }

    if (entry.status !== 'plan_to_watch') return null;

    await db
      .update(userWatchlist)
      .set({ status: 'watching' })
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, tmdbId),
          eq(userWatchlist.mediaType, 'tv'),
        ),
      );

    return 'watching';
  } catch (error) {
    console.error('watchStatus: failed to ensure watching status', error);
    return null;
  }
}

/**
 * When a user unmarks an episode from a completed series, revert status to 'watching'.
 * Returns 'watching' if status was changed, null otherwise.
 */
export async function revertCompletedToWatching(
  userId: string,
  tmdbId: number,
): Promise<WatchStatus | null> {
  try {
    const [entry] = await db
      .select()
      .from(userWatchlist)
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, tmdbId),
          eq(userWatchlist.mediaType, 'tv'),
        ),
      );

    if (!entry || entry.status !== 'completed') return null;

    await db
      .update(userWatchlist)
      .set({ status: 'watching' })
      .where(
        and(
          eq(userWatchlist.userId, userId),
          eq(userWatchlist.tmdbId, tmdbId),
          eq(userWatchlist.mediaType, 'tv'),
        ),
      );

    return 'watching';
  } catch (error) {
    console.error('watchStatus: failed to revert completed status', error);
    return null;
  }
}
