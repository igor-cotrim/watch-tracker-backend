CREATE INDEX "episodes_user_show_idx" ON "user_episodes_watched" USING btree ("user_id","tmdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_unique_entry" ON "user_episodes_watched" USING btree ("user_id","tmdb_id","season_number","episode_number");--> statement-breakpoint
CREATE INDEX "ratings_user_media_idx" ON "user_ratings" USING btree ("user_id","tmdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_unique_entry" ON "user_ratings" USING btree ("user_id","tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "watchlist_user_id_idx" ON "user_watchlist" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_unique_entry" ON "user_watchlist" USING btree ("user_id","tmdb_id","media_type");