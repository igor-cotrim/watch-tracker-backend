import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { profiles } from '../db/schema.js';
import { env } from '../config/env.js';
import type { AuthenticatedRequest } from '../types/index.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.substring(7);
  let userId: string;
  let userEmail: string;

  // Block 1: Supabase token verification — 401 on failure
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    userId = user.id;
    userEmail = user.email!;

    // Block 2: Profile auto-creation — propagate DB errors as 500
    try {
      const [existing] = await db.select().from(profiles).where(eq(profiles.id, userId));

      if (!existing) {
        await db.insert(profiles).values({
          id: userId,
          name: user.user_metadata?.name ?? user.email?.split('@')[0] ?? 'User',
        });
      }
    } catch (dbError) {
      next(dbError);
      return;
    }
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
    return;
  }

  (req as AuthenticatedRequest).user = { id: userId, email: userEmail };
  next();
}

export function getAuthUser(req: Request): { id: string; email: string } {
  return (req as AuthenticatedRequest).user;
}
