import type { Request, Response, NextFunction } from 'express';
import { LanguageSchema, DEFAULT_LANGUAGE } from '../types/index.js';

export function languageMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.query.language;

  if (raw === undefined) {
    req.language = DEFAULT_LANGUAGE;
    next();
    return;
  }

  const parsed = LanguageSchema.safeParse(raw);
  if (!parsed.success) {
    res.status(400).json({ error: 'language must be "en-US" or "pt-BR"' });
    return;
  }

  req.language = parsed.data;
  next();
}
