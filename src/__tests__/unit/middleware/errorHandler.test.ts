import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { errorHandler } from '../../../middleware/errorHandler.js';
import { TMDBError } from '../../../services/tmdb.js';

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

const req = {} as Request;
const next = vi.fn() as unknown as NextFunction;

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  describe('generic errors in non-production', () => {
    it('returns status 500', () => {
      const res = makeRes();
      errorHandler(new Error('boom'), req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('includes error message in response body when NODE_ENV=test', () => {
      const res = makeRes();
      errorHandler(new Error('detailed error'), req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'detailed error' }));
    });

    it('logs to console.error', () => {
      const res = makeRes();
      const err = new Error('test error');
      errorHandler(err, req, res, next);
      expect(console.error).toHaveBeenCalledWith('Unhandled error:', err);
    });
  });

  describe('generic errors in production', () => {
    const originalEnv = process.env.NODE_ENV;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('returns status 500', () => {
      const res = makeRes();
      errorHandler(new Error('secret details'), req, res, next);
      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('hides error message in production', () => {
      const res = makeRes();
      errorHandler(new Error('secret details'), req, res, next);
      const call = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call).not.toHaveProperty('message');
      expect(call.error).toBe('Internal server error');
    });
  });

  describe('TMDBError handling', () => {
    it('returns the TMDB status code for 4xx errors', () => {
      const res = makeRes();
      errorHandler(new TMDBError('Not found', 404), req, res, next);
      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 502 for TMDB 5xx errors', () => {
      const res = makeRes();
      errorHandler(new TMDBError('TMDB server error', 500), req, res, next);
      expect(res.status).toHaveBeenCalledWith(502);
    });

    it('includes the TMDB error message', () => {
      const res = makeRes();
      errorHandler(new TMDBError('TMDB API error: Not Found', 404), req, res, next);
      expect(res.json).toHaveBeenCalledWith({ error: 'TMDB API error: Not Found' });
    });
  });
});
