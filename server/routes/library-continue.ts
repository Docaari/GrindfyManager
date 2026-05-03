/**
 * Sprint home-reform-1-5 — RF-28 GET /api/library/continue.
 *
 * Spec: Docs/specs/home-reform-1-5.md RF-28, RNF-1.5-8, D1.5-12
 *
 * Retorna ate N lessons em progresso pelo user logado.
 * - Auth obrigatorio (requireAuth).
 * - Query param ?limit=N (default 3, max 10).
 * - Entitlement check via storage.hasLibraryAccess.
 * - Cache-Control: private, max-age=60.
 *
 * Lessons aplicadas:
 *   #3   shape REAL — handler delega para storage.getContinueWatching
 *   #9   try/catch generico engole — logue antes de fallback
 */

import type { Express, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../auth';
import { storage } from '../storage';

const querySchema = z.object({
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
      if (v === undefined || v === null || v === '') return 3;
      const n = typeof v === 'number' ? v : parseInt(v, 10);
      if (Number.isNaN(n) || n <= 0) return 3;
      return Math.min(Math.max(1, n), 10);
    }),
});

export async function handleLibraryContinue(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const parsed = querySchema.safeParse(req?.query ?? {});
    const limit = parsed.success ? parsed.data.limit : 3;

    // Entitlement check (RNF-1.5-8 / R3 mitigation).
    const hasAccess = await storage.hasLibraryAccess(userId);
    if (!hasAccess) {
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.status(200).json({ items: [], hasAccess: false });
      return;
    }

    const items = await storage.getContinueWatching(userId, limit);

    res.setHeader('Cache-Control', 'private, max-age=60');
    res.status(200).json({
      items: Array.isArray(items) ? items : [],
      hasAccess: true,
    });
  } catch (err) {
    const userId = req?.user?.userPlatformId ?? 'anon';
    console.error(`[library-continue] userId=${userId} failed:`, err);
    res.status(500).json({ message: 'Internal error' });
  }
}

export function registerLibraryContinueRoutes(app: Express): void {
  app.get('/api/library/continue', requireAuth, handleLibraryContinue);
}
