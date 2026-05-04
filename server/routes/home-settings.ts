/**
 * /api/home/settings — Sprint home-reform-5 item 11.
 *
 * Spec: Docs/specs/home-reform-5.md item 11 (engrenagem) + item 8 (flag).
 *
 * GET    /api/home/settings   -> retorna HomeLayoutSettings (defaults + merge).
 * PATCH  /api/home/settings   -> valida via Zod (strict), merge + persiste,
 *                                invalida cache /api/home/overview.
 */

import type { Express, Request, Response } from 'express';
import { ZodError } from 'zod';
import { requireAuth } from '../auth';
import { storage } from '../storage';
import {
  parseHomeLayoutSettingsPatch,
  mergeHomeLayoutSettings,
  resolveHomeLayoutSettings,
} from '../services/homeSettings';
import { clearHomeOverviewCache } from './home';

function getUserId(req: Request): string | null {
  const u: any = (req as any).user;
  return u?.userPlatformId ?? null;
}

export async function handleGetHomeSettings(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  try {
    const stored = await storage.getHomeLayoutSettings(userId);
    const settings = resolveHomeLayoutSettings(stored);
    res.setHeader('Cache-Control', 'private, max-age=10');
    res.status(200).json(settings);
  } catch (err) {
    console.error('[home/settings GET] failure:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}

export async function handlePatchHomeSettings(req: Request, res: Response): Promise<void> {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  let patch;
  try {
    patch = parseHomeLayoutSettingsPatch(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ message: 'Invalid body', issues: err.issues });
      return;
    }
    res.status(400).json({ message: 'Invalid body' });
    return;
  }
  try {
    const current = await storage.getHomeLayoutSettings(userId);
    const merged = mergeHomeLayoutSettings(current, patch);
    await storage.setHomeLayoutSettings(userId, merged);
    clearHomeOverviewCache(userId);
    res.status(200).json(merged);
  } catch (err) {
    console.error('[home/settings PATCH] failure:', err);
    res.status(500).json({ message: 'Internal error' });
  }
}

export function registerHomeSettingsRoutes(app: Express): void {
  app.get('/api/home/settings', requireAuth, handleGetHomeSettings);
  app.patch('/api/home/settings', requireAuth, handlePatchHomeSettings);
}
