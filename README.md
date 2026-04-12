# WatchTracker Backend

Express 5 + TypeScript REST API for the WatchTracker app. Users authenticate via Supabase, manage watchlists, and track movies and TV episodes. Media metadata is sourced from TMDB.

## Stack

- **Runtime**: Node.js (ESM)
- **Framework**: Express 5
- **Language**: TypeScript (strict mode)
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (via Supabase)
- **Auth**: Supabase JWT (service role verification)
- **External API**: TMDB
- **Validation**: Zod
- **Testing**: Vitest + Supertest

## Getting Started

### Prerequisites

- Node.js 20+
- A Supabase project (PostgreSQL + Auth)
- A TMDB API key

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file in the project root:

```env
PORT=3000
DATABASE_URL=postgresql://...
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key
TMDB_API_KEY=your-tmdb-key
TMDB_BASE_URL=https://api.themoviedb.org/3
```

### Database setup

```bash
npm run db:generate   # Generate migrations from schema
npm run db:migrate    # Apply migrations to the database
```

### Development

```bash
npm run dev           # Start with auto-reload (tsx watch, port 3000)
```

### Production

```bash
npm run build         # Compile TypeScript to dist/
npm start             # Run compiled output
```

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with auto-reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output |
| `npm run db:generate` | Generate Drizzle migrations from schema changes |
| `npm run db:migrate` | Apply pending migrations |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint source files |
| `npm run format` | Format source files with Prettier |

## API Reference

All endpoints are prefixed with `/api`. Protected endpoints require a `Authorization: Bearer <supabase_token>` header.

### Health

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | No | Health check |

### Watchlist

All watchlist routes require authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/watchlist` | Get user's watchlist. Filter by `?status=` and `?media_type=` |
| `POST` | `/api/watchlist` | Add item to watchlist |
| `DELETE` | `/api/watchlist/:id` | Remove item from watchlist |
| `GET` | `/api/watchlist/continue-watching` | TV shows in progress with next unwatched episode |
| `GET` | `/api/watchlist/upcoming` | Watchlisted TV shows with upcoming episodes |

**Watchlist status values**: `watching`, `completed`, `plan_to_watch`, `dropped`

**POST `/api/watchlist` body**:
```json
{
  "tmdb_id": 1396,
  "media_type": "tv",
  "status": "watching"
}
```

### Media

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/media/:type/:id` | No | Get movie or TV show details from TMDB |
| `GET` | `/api/media/tv/:id/season/:seasonNumber` | No | Get season details from TMDB |
| `POST` | `/api/media/:type/:id/rate` | Yes | Rate a movie or TV show (1–10) |
| `GET` | `/api/media/tv/:id/seasons/:seasonNumber/watched` | Yes | Get watched episode numbers for a season |
| `POST` | `/api/media/tv/:id/seasons/:seasonNumber/watch` | Yes | Mark entire season as watched |
| `DELETE` | `/api/media/tv/:id/seasons/:seasonNumber/watch` | Yes | Unmark entire season |
| `POST` | `/api/media/tv/:id/episodes/:seasonNumber/:episodeNumber/watch` | Yes | Mark single episode as watched |
| `DELETE` | `/api/media/tv/:id/episodes/:seasonNumber/:episodeNumber/watch` | Yes | Unmark single episode |

### Discover

All discover routes are public.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/discover` | Filtered discovery (`type`, `with_genres`, `with_watch_providers`, `sort_by`, `page`) |
| `GET` | `/api/discover/trending` | Trending media (`type=movie\|tv\|all`, `time_window=day\|week`) |
| `GET` | `/api/discover/top-rated` | Top rated movies or TV (`type`, `page`) |
| `GET` | `/api/discover/popular` | Popular movies or TV (`type`, `page`) |
| `GET` | `/api/discover/upcoming` | Upcoming movies in Brazil (`page`) |
| `GET` | `/api/discover/now-playing` | Now playing in Brazilian cinemas |
| `GET` | `/api/discover/search` | Search by `query`, optionally `type` and `year` |
| `GET` | `/api/discover/genres` | Genre list for a media type (`type`) |
| `GET` | `/api/discover/providers` | Streaming providers available in Brazil (`type`) |

### Profile

All profile routes require authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/profile/stats` | Aggregated stats (movies watched, shows tracking, episodes watched) |

## Database Schema

| Table | Description |
|---|---|
| `profiles` | User profiles, synced from Supabase Auth |
| `user_watchlist` | Watchlist entries (movie or TV) with status |
| `user_episodes_watched` | Individual episode watch history |
| `user_ratings` | User ratings (1–10) per media item |

## Architecture

```
Client
  └── Express middleware (CORS, Helmet, compression, rate limiting, Morgan)
        └── Auth middleware (Supabase JWT → req.user)
              └── Route handler (Zod validation → DB / TMDB service)
                    └── Global error handler
```

- Routes live in `src/routes/` and are mounted under `/api/`
- The TMDB service (`src/services/tmdb.ts`) wraps all TMDB API calls with typed interfaces
- The Drizzle `db` singleton is exported from `src/db/index.ts`
- Auth middleware is opt-in per route — applied globally on `/watchlist` and `/profile`, selectively on `/media`
- Unique constraint violations on insert return `409 Conflict`

## Testing

```bash
npm test                  # Run all tests
npm run test:coverage     # With V8 coverage report
```

Tests are organised under `src/__tests__/`:
- `integration/routes/` — Supertest route integration tests
- `unit/` — Unit tests for services, middleware, and config
