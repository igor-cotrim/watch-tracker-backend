import type { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

export type MediaType = 'movie' | 'tv';

export type WatchStatus = 'watching' | 'completed' | 'plan_to_watch' | 'dropped';
