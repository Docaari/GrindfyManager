// =============================================================================
// study-theme-spot-links route — Sprint Studies-Reform RF-05 (ADR-067)
//
// POST   /api/study/theme-spot-links            -> handleCreateThemeSpotLink
// GET    /api/study-themes/:id/linked-spots     -> handleGetLinkedSpots
// DELETE /api/study/theme-spot-links/:linkId    -> handleDeleteThemeSpotLink
//
// Cross-user isolation: ambos theme e spot devem pertencer ao usuario do JWT.
// Idempotencia: storage.linkSpotToTheme retorna { alreadyLinked: true } no
// caso de UNIQUE constraint hit; rota responde 200 vs 201 conforme.
// =============================================================================

import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../auth';
import { storage } from '../storage';

const studyLinksMutationLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  message: { message: 'Muitas requisicoes. Tente novamente em 1 minuto.' },
});

const createLinkSchema = z.object({
  themeId: z.string().min(1),
  spotId: z.string().min(1),
  reasoningText: z.string().max(2000).optional(),
  suggested: z.boolean().optional(),
});

export async function handleCreateThemeSpotLink(
  req: Request,
  res: Response,
): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  let body: z.infer<typeof createLinkSchema>;
  try {
    body = createLinkSchema.parse(req.body ?? {});
  } catch (err) {
    res.status(400).json({ message: 'Body invalido', error: String(err) });
    return;
  }

  try {
    const theme = await storage.getStudyTheme(body.themeId);
    if (!theme) {
      res.status(404).json({ message: 'Tema nao encontrado' });
      return;
    }
    if (theme.userId !== userPlatformId) {
      res.status(403).json({ message: 'Acesso negado: tema de outro usuario' });
      return;
    }

    const spot = await storage.getStarredHand(body.spotId, userPlatformId);
    if (!spot) {
      res.status(404).json({ message: 'Spot nao encontrado' });
      return;
    }
    if (spot.userId !== userPlatformId) {
      res.status(403).json({ message: 'Acesso negado: spot de outro usuario' });
      return;
    }

    const link = await storage.linkSpotToTheme({
      themeId: body.themeId,
      spotId: body.spotId,
      userId: userPlatformId,
      reasoningText: body.reasoningText ?? null,
    });

    // Telemetria estruturada (lesson #3: shape consistente)
    console.log('[telemetry] spot.linked_to_theme', {
      userPlatformId,
      themeId: body.themeId,
      spotId: body.spotId,
      suggested: body.suggested ?? false,
      alreadyLinked: Boolean(link.alreadyLinked),
    });

    const status = link.alreadyLinked ? 200 : 201;
    res.status(status).json(link);
  } catch (err) {
    console.error('[study-theme-spot-links] create failed', {
      userPlatformId,
      themeId: body.themeId,
      spotId: body.spotId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: 'Erro ao vincular spot ao tema' });
  }
}

export async function handleGetLinkedSpots(
  req: Request,
  res: Response,
): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const themeId = String(req.params?.id ?? '');
  if (!themeId) {
    res.status(400).json({ message: 'theme id obrigatorio' });
    return;
  }

  try {
    const theme = await storage.getStudyTheme(themeId);
    if (!theme) {
      res.status(404).json({ message: 'Tema nao encontrado' });
      return;
    }
    if (theme.userId !== userPlatformId) {
      res.status(403).json({ message: 'Acesso negado: tema de outro usuario' });
      return;
    }

    const spots = await storage.getLinkedSpots(themeId);
    res.status(200).json(spots ?? []);
  } catch (err) {
    console.error('[study-theme-spot-links] list failed', {
      userPlatformId,
      themeId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: 'Erro ao listar spots vinculados' });
  }
}

// Alias for tests that probe both names (handleListLinkedSpots / handleGetLinkedSpots)
export const handleListLinkedSpots = handleGetLinkedSpots;

export async function handleDeleteThemeSpotLink(
  req: Request,
  res: Response,
): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const linkId = String(req.params?.linkId ?? '');
  if (!linkId) {
    res.status(400).json({ message: 'link id obrigatorio' });
    return;
  }

  try {
    const removed = await storage.unlinkSpotFromTheme(linkId, userPlatformId);
    if (!removed) {
      res.status(404).json({ message: 'Link nao encontrado' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error('[study-theme-spot-links] delete failed', {
      userPlatformId,
      linkId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: 'Erro ao desvincular spot' });
  }
}

export default handleCreateThemeSpotLink;

export function registerStudyThemeSpotLinkRoutes(app: Express): void {
  app.post(
    '/api/study/theme-spot-links',
    requireAuth,
    studyLinksMutationLimit,
    (req: Request, res: Response) => handleCreateThemeSpotLink(req, res),
  );
  app.get(
    '/api/study-themes/:id/linked-spots',
    requireAuth,
    (req: Request, res: Response) => handleGetLinkedSpots(req, res),
  );
  app.delete(
    '/api/study/theme-spot-links/:linkId',
    requireAuth,
    studyLinksMutationLimit,
    (req: Request, res: Response) => handleDeleteThemeSpotLink(req, res),
  );
}
