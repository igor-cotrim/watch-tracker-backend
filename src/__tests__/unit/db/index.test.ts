import { describe, it, expect } from 'vitest';

// isUniqueConstraintError is a pure helper — test it directly without mocking db
// Import from the source, but db singleton itself is mocked globally
vi.mock('../../../db/index.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../db/index.js')>();
  return {
    ...original,
    db: {} as never, // avoid real DB connection
  };
});

import { isUniqueConstraintError } from '../../../db/index.js';

describe('isUniqueConstraintError', () => {
  it('returns true for Postgres unique violation error (code 23505)', () => {
    expect(isUniqueConstraintError({ code: '23505' })).toBe(true);
  });

  it('returns false for other Postgres error codes', () => {
    expect(isUniqueConstraintError({ code: '23503' })).toBe(false);
  });

  it('returns false for a plain Error object', () => {
    expect(isUniqueConstraintError(new Error('some error'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isUniqueConstraintError(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isUniqueConstraintError(undefined)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isUniqueConstraintError('23505')).toBe(false);
  });
});
