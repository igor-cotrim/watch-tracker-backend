import type { Request } from 'express';
import { z } from 'zod';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

export type MediaType = 'movie' | 'tv';

export type WatchStatus = 'watching' | 'completed' | 'plan_to_watch' | 'dropped';

export const LanguageSchema = z.enum(['en-US', 'pt-BR']);
export type Language = z.infer<typeof LanguageSchema>;
export const DEFAULT_LANGUAGE: Language = 'en-US';

declare module 'express-serve-static-core' {
  interface Request {
    language: Language;
  }
}
