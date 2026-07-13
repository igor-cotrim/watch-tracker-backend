import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from '../../helpers/app.js';

vi.mock('../../../db/index.js', () => ({
  db: {
    select: vi.fn(),
    transaction: vi.fn(),
  },
  isUniqueConstraintError: vi.fn(),
}));

vi.mock('../../../config/supabase.js', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        deleteUser: vi.fn(),
      },
    },
  },
}));

// Mock auth to inject user
vi.mock('../../../middleware/auth.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../middleware/auth.js')>();
  return {
    ...original,
    authMiddleware: vi.fn((req, _res, next) => {
      (req as Record<string, unknown>).user = { id: 'user-uuid', email: 'test@example.com' };
      next();
    }),
  };
});

import { db } from '../../../db/index.js';
import { supabaseAdmin } from '../../../config/supabase.js';

const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>;
const mockDeleteUser = supabaseAdmin.auth.admin.deleteUser as unknown as ReturnType<typeof vi.fn>;

function makeCountResult(value: number) {
  return [{ value: BigInt(value) }];
}

function makeSelectChain(returnValue: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue(returnValue),
  };
}

describe('Profile routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/profile/stats', () => {
    it('returns 200 with all stats fields', async () => {
      mockDb.select
        .mockReturnValueOnce(makeSelectChain(makeCountResult(5))) // movies_watched
        .mockReturnValueOnce(makeSelectChain(makeCountResult(10))) // movies_in_watchlist
        .mockReturnValueOnce(makeSelectChain(makeCountResult(3))) // shows_tracking
        .mockReturnValueOnce(makeSelectChain(makeCountResult(2))) // shows_completed
        .mockReturnValueOnce(makeSelectChain(makeCountResult(42))); // episodes_watched

      const res = await request.get('/api/profile/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        movies_watched: 5,
        movies_in_watchlist: 10,
        shows_tracking: 3,
        shows_completed: 2,
        episodes_watched: 42,
      });
    });

    it('returns zeros when user has no data', async () => {
      mockDb.select
        .mockReturnValueOnce(makeSelectChain(makeCountResult(0)))
        .mockReturnValueOnce(makeSelectChain(makeCountResult(0)))
        .mockReturnValueOnce(makeSelectChain(makeCountResult(0)))
        .mockReturnValueOnce(makeSelectChain(makeCountResult(0)))
        .mockReturnValueOnce(makeSelectChain(makeCountResult(0)));

      const res = await request.get('/api/profile/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        movies_watched: 0,
        movies_in_watchlist: 0,
        shows_tracking: 0,
        shows_completed: 0,
        episodes_watched: 0,
      });
    });

    it('returns zeros when count query returns empty array', async () => {
      mockDb.select
        .mockReturnValueOnce(makeSelectChain([]))
        .mockReturnValueOnce(makeSelectChain([]))
        .mockReturnValueOnce(makeSelectChain([]))
        .mockReturnValueOnce(makeSelectChain([]))
        .mockReturnValueOnce(makeSelectChain([]));

      const res = await request.get('/api/profile/stats');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        movies_watched: 0,
        movies_in_watchlist: 0,
        shows_tracking: 0,
        shows_completed: 0,
        episodes_watched: 0,
      });
    });

    it('returns 500 when db throws an error', async () => {
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockRejectedValue(new Error('DB connection error')),
      });

      const res = await request.get('/api/profile/stats');

      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/profile', () => {
    function mockTransactionSucceeds() {
      const txDelete = vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });
      mockDb.transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({ delete: txDelete }),
      );
      return txDelete;
    }

    it('deletes user data and auth user, returns 200', async () => {
      const txDelete = mockTransactionSucceeds();
      mockDeleteUser.mockResolvedValue({ data: {}, error: null });

      const res = await request.delete('/api/profile');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ message: 'Account deleted' });
      // 4 tables removed inside the transaction (children before profiles)
      expect(txDelete).toHaveBeenCalledTimes(4);
      expect(mockDeleteUser).toHaveBeenCalledWith('user-uuid');
    });

    it('returns 500 when Supabase auth deletion fails', async () => {
      mockTransactionSucceeds();
      mockDeleteUser.mockResolvedValue({ data: null, error: { message: 'auth error' } });

      const res = await request.delete('/api/profile');

      expect(res.status).toBe(500);
    });

    it('returns 500 when the db transaction fails', async () => {
      mockDb.transaction.mockRejectedValue(new Error('DB connection error'));

      const res = await request.delete('/api/profile');

      expect(res.status).toBe(500);
      expect(mockDeleteUser).not.toHaveBeenCalled();
    });
  });
});
