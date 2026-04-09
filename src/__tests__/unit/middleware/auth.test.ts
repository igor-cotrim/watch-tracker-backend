import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const { mockGetUser, mockSupabase } = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockSupabase = { auth: { getUser: mockGetUser } };
  return { mockGetUser, mockSupabase };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue(mockSupabase),
}));

vi.mock('../../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
  isUniqueConstraintError: vi.fn(),
}));

import { authMiddleware, getAuthUser } from '../../../middleware/auth.js';
import { db } from '../../../db/index.js';
import { makeSupabaseUser } from '../../helpers/mockFactory.js';

const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;

function makeReqResNext() {
  const req = { headers: {} } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

function setAuthHeader(req: Request, value: string) {
  (req as Request & { headers: Record<string, string> }).headers = {
    authorization: value,
  };
}

describe('authMiddleware', () => {
  beforeEach(() => {
    mockGetUser.mockReset();
    (mockDb.select as ReturnType<typeof vi.fn>).mockReset();
    (mockDb.insert as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('missing authorization header', () => {
    it('returns 401 with "Missing or invalid authorization header"', async () => {
      const { req, res, next } = makeReqResNext();

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Missing or invalid authorization header',
      });
    });

    it('does not call next()', async () => {
      const { req, res, next } = makeReqResNext();
      await authMiddleware(req, res, next);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('malformed authorization header', () => {
    it('returns 401 when header does not start with Bearer', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Basic sometoken');

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('invalid or expired token', () => {
    it('returns 401 when Supabase returns an error', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer invalid-token');

      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'JWT expired' },
      });

      await authMiddleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('valid token, existing user', () => {
    it('does not call db.insert when profile already exists', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer valid-token');

      const user = makeSupabaseUser();
      mockGetUser.mockResolvedValue({ data: { user }, error: null });

      const existingProfile = { id: user.id, name: 'Test User' };
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([existingProfile]),
      });

      await authMiddleware(req, res, next);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it('attaches req.user with id and email', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer valid-token');

      const user = makeSupabaseUser({ id: 'abc-123', email: 'hello@test.com' });
      mockGetUser.mockResolvedValue({ data: { user }, error: null });

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ id: user.id }]),
      });

      await authMiddleware(req, res, next);

      expect(getAuthUser(req)).toEqual({ id: 'abc-123', email: 'hello@test.com' });
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('valid token, new user', () => {
    function setupNewUser(userOverrides: Record<string, unknown> = {}) {
      const user = makeSupabaseUser(userOverrides);
      mockGetUser.mockResolvedValue({ data: { user }, error: null });

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]), // no existing profile
      });

      const mockInsertValues = vi.fn().mockResolvedValue([]);
      mockDb.insert.mockReturnValue({ values: mockInsertValues });

      return { user, mockInsertValues };
    }

    it('calls db.insert when no profile exists', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer valid-token');

      setupNewUser();

      await authMiddleware(req, res, next);

      expect(mockDb.insert).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });

    it('uses user_metadata.name as the profile name when present', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer valid-token');

      const { mockInsertValues } = setupNewUser({
        id: 'new-user-id',
        email: 'new@example.com',
        user_metadata: { name: 'John Doe' },
      });

      await authMiddleware(req, res, next);

      expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ name: 'John Doe' }));
    });

    it('falls back to email prefix when no name in metadata', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer valid-token');

      const { mockInsertValues } = setupNewUser({
        id: 'new-user-id',
        email: 'jane@example.com',
        user_metadata: {},
      });

      await authMiddleware(req, res, next);

      expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({ name: 'jane' }));
    });

    it('calls next() after creating profile', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer valid-token');

      setupNewUser();

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('DB error during profile creation', () => {
    it('calls next(error) instead of returning 401', async () => {
      const { req, res, next } = makeReqResNext();
      setAuthHeader(req, 'Bearer valid-token');

      const user = makeSupabaseUser();
      mockGetUser.mockResolvedValue({ data: { user }, error: null });

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([]),
      });

      const dbError = new Error('connection refused');
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(dbError),
      });

      await authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
