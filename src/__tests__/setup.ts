// Set required env vars BEFORE any module is imported.
// This prevents module-level throws in env.ts, db/index.ts, tmdb.ts, auth.ts.
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.SUPABASE_SECRET_KEY = 'test-secret-key';
process.env.TMDB_API_KEY = 'test-tmdb-key';
process.env.TMDB_BASE_URL = 'https://api.themoviedb.org/3';
process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
