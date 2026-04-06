import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  serial,
  integer,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userWatchlist = pgTable('user_watchlist', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: varchar('media_type', { length: 10 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  addedAt: timestamp('added_at').defaultNow().notNull(),
});

export const userEpisodesWatched = pgTable('user_episodes_watched', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  tmdbId: integer('tmdb_id').notNull(),
  seasonNumber: integer('season_number').notNull(),
  episodeNumber: integer('episode_number').notNull(),
  watchedAt: timestamp('watched_at').defaultNow().notNull(),
});

export const userRatings = pgTable('user_ratings', {
  id: serial('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => profiles.id),
  tmdbId: integer('tmdb_id').notNull(),
  mediaType: varchar('media_type', { length: 10 }).notNull(),
  rating: integer('rating').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Relations
export const profilesRelations = relations(profiles, ({ many }) => ({
  watchlist: many(userWatchlist),
  episodesWatched: many(userEpisodesWatched),
  ratings: many(userRatings),
}));

export const userWatchlistRelations = relations(userWatchlist, ({ one }) => ({
  user: one(profiles, {
    fields: [userWatchlist.userId],
    references: [profiles.id],
  }),
}));

export const userEpisodesWatchedRelations = relations(
  userEpisodesWatched,
  ({ one }) => ({
    user: one(profiles, {
      fields: [userEpisodesWatched.userId],
      references: [profiles.id],
    }),
  }),
);

export const userRatingsRelations = relations(userRatings, ({ one }) => ({
  user: one(profiles, {
    fields: [userRatings.userId],
    references: [profiles.id],
  }),
}));
