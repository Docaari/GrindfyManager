// =============================================================================
// study-misc routes — Sprint Studies-Reform RF-12 + dashboard wiring
//
// GET    /api/study/streak                 -> streak counter + heatmap
// POST   /api/study/streak/bump            -> bump (idempotente por dia)
// GET    /api/dashboard/leaks/active       -> leaks reais (studyLeaksService)
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
// Sprint Estudos-Habito-1 (P0 #3): unifica streak no service novo (incrementa
// freezes + race-safe via SELECT FOR UPDATE).
import { bumpStudyStreak as bumpStudyStreakService } from '../services/studyStreak';
// HIGH-1 (auditoria Estudos): leaks reais (mesma fonte de /api/study/suggestions).
import { gatherUserLeaks, mapLeakToStudyTopic } from '../services/studyLeaksService';

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
    // P0 #3: usa service unificado (incrementa freezes + lazy reset + race-safe).
    // Map para o shape legado {days, last_activity_at, bumped} para nao quebrar
    // clientes existentes do endpoint /api/study/streak/bump.
    const result = await bumpStudyStreakService({ userId: userPlatformId });
    res.status(200).json({
      days: result.streakDays,
      last_activity_at: new Date().toISOString(),
      bumped: result.transition === 'incremented'
        || result.transition === 'freeze_consumed'
        || result.transition === 'reset'
        || result.transition === 'reset_long',
      transition: result.transition,
    });
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
  try {
    // HIGH-1: deteccao real (detectLeaks) em vez do stub []. `id` = tipo do leak
    // (o StatsView so precisa de id + severity p/ habilitar "Sugerir temas").
    const leaks = await gatherUserLeaks(userPlatformId);
    const active = leaks.map((leak) => ({
      id: leak.type,
      severity: leak.severity,
      description: leak.description,
      suggestedTopic: mapLeakToStudyTopic(leak),
    }));
    res.status(200).json(active);
  } catch (err) {
    // Lesson #9: loga antes do fallback — distingue "sem leaks" de "DB explodiu".
    console.error('[study-misc] leaksActive failed', {
      userPlatformId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(200).json([]);
  }
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
