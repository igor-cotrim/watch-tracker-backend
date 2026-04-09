import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request } from '../../helpers/app.js';

vi.mock('../../../db/index.js', () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
  },
  isUniqueConstraintError: vi.fn(),
}));

import { db } from '../../../db/index.js';

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200', async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request.get('/api/health');
    expect(res.status).toBe(200);
  });

  it('returns status ok', async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request.get('/api/health');
    expect(res.body.status).toBe('ok');
  });

  it('returns db: ok when DB is reachable', async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request.get('/api/health');
    expect(res.body.db).toBe('ok');
  });

  it('returns an ISO timestamp', async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request.get('/api/health');
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });

  it('returns 503 and status degraded when DB fails', async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('connection refused'));

    const res = await request.get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.db).toBe('error');
  });
});
