import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Test the env schema logic directly (not the singleton that calls process.exit)
const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_SECRET_KEY: z.string().min(1),
  TMDB_API_KEY: z.string().min(1),
  TMDB_BASE_URL: z.string().url().default('https://api.themoviedb.org/3'),
});

const validEnv = {
  PORT: '4000',
  NODE_ENV: 'test' as const,
  DATABASE_URL: 'postgresql://user:pass@localhost/db',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'pk-key',
  SUPABASE_SECRET_KEY: 'sk-key',
  TMDB_API_KEY: 'tmdb-key',
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',
};

describe('env schema', () => {
  it('parses valid env successfully', () => {
    const result = envSchema.parse(validEnv);
    expect(result.PORT).toBe(4000);
    expect(result.NODE_ENV).toBe('test');
    expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost/db');
  });

  it('coerces PORT string to number', () => {
    const result = envSchema.parse({ ...validEnv, PORT: '8080' });
    expect(result.PORT).toBe(8080);
    expect(typeof result.PORT).toBe('number');
  });

  it('uses default PORT=3000 when not provided', () => {
    const { PORT: _port, ...withoutPort } = validEnv;
    const result = envSchema.parse(withoutPort);
    expect(result.PORT).toBe(3000);
  });

  it('uses default TMDB_BASE_URL when not provided', () => {
    const { TMDB_BASE_URL: _url, ...withoutUrl } = validEnv;
    const result = envSchema.parse(withoutUrl);
    expect(result.TMDB_BASE_URL).toBe('https://api.themoviedb.org/3');
  });

  it('uses default NODE_ENV=development when not provided', () => {
    const { NODE_ENV: _env, ...withoutEnv } = validEnv;
    const result = envSchema.parse(withoutEnv);
    expect(result.NODE_ENV).toBe('development');
  });

  it('throws when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _db, ...withoutDb } = validEnv;
    expect(() => envSchema.parse(withoutDb)).toThrow();
  });

  it('throws when SUPABASE_URL is not a valid URL', () => {
    expect(() => envSchema.parse({ ...validEnv, SUPABASE_URL: 'not-a-url' })).toThrow();
  });

  it('throws when TMDB_API_KEY is empty string', () => {
    expect(() => envSchema.parse({ ...validEnv, TMDB_API_KEY: '' })).toThrow();
  });

  it('throws when NODE_ENV is an unknown value', () => {
    expect(() => envSchema.parse({ ...validEnv, NODE_ENV: 'staging' })).toThrow();
  });
});
