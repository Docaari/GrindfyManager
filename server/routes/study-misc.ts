// =============================================================================
// study-misc routes — Sprint Studies-Reform RF-12 + dashboard wiring
//
// GET    /api/study/streak                 -> streak counter + heatmap
// POST   /api/study/streak/bump            -> bump (idempotente por dia)
// GET    /api/dashboard/leaks/active       -> [] (TODO backend leak detection)
// GET    /api/dashboard/leaks/delta        -> {} (TODO backend leak delta)
// GET    /api/dashboard/insights/week      -> { themes, spots, hours }
// GET    /api/study-snapshots              -> [] (TODO snapshots table)
//
// Todas exigem auth. Ownership via req.user.userPlatformId.
// =============================================================================

import type { Express, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth';
import { storage } from '../storage';

const bumpLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

export async function handleGetStreak(req: Request, res: Response): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  try {
    const streak = await storage.getStudyStreak(userPlatformId);
    res.status(200).json(streak);
  } catch (err) {
    console.error('[study-misc] getStreak failed', {
      userPlatformId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: 'Erro ao carregar streak' });
  }
}

export async function handleBumpStreak(req: Request, res: Response): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  try {
    const result = await storage.bumpStudyStreak(userPlatformId);
    res.status(200).json(result);
  } catch (err) {
    console.error('[study-misc] bumpStreak failed', {
      userPlatformId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: 'Erro ao atualizar streak' });
  }
}

export async function handleLeaksActive(req: Request, res: Response): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  // TODO Sprint Studies-Reform-Backend: ler de hud_stats_snapshots / stats_analyzer.
  res.status(200).json([]);
}

export async function handleLeaksDelta(req: Request, res: Response): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  // TODO Sprint Studies-Reform-Backend: delta de severidade por tema.
  res.status(200).json({});
}

export async function handleInsightsWeek(req: Request, res: Response): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  try {
    const insights = await storage.getDashboardInsightsWeek(userPlatformId);
    res.status(200).json(insights);
  } catch (err) {
    console.error('[study-misc] insightsWeek failed', {
      userPlatformId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: 'Erro ao carregar insights' });
  }
}

export async function handleStudySnapshots(req: Request, res: Response): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }
  // TODO Sprint Studies-Reform-Backend: ler de hud_stats_snapshots por user.
  res.status(200).json([]);
}

export function registerStudyMiscRoutes(app: Express): void {
  app.get('/api/study/streak', requireAuth, (req, res) => handleGetStreak(req, res));
  app.post(
    '/api/study/streak/bump',
    requireAuth,
    bumpLimit,
    (req, res) => handleBumpStreak(req, res),
  );
  app.get('/api/dashboard/leaks/active', requireAuth, (req, res) => handleLeaksActive(req, res));
  app.get('/api/dashboard/leaks/delta', requireAuth, (req, res) => handleLeaksDelta(req, res));
  app.get('/api/dashboard/insights/week', requireAuth, (req, res) => handleInsightsWeek(req, res));
  app.get('/api/study-snapshots', requireAuth, (req, res) => handleStudySnapshots(req, res));
}
