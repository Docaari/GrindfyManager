// =============================================================================
// study-recommendations route — Sprint Studies-Reform RF-06 (ADR-068)
//
// GET /api/study/recommendations?limit=10
//   - 200 -> { items, source_counts, generated_at }
//   - 401 -> sem JWT
//   - 500 -> service error (logged before response)
// =============================================================================

import type { Express, Request, Response } from 'express';
import { requireAuth } from '../auth';
import { getRecommendations } from '../services/studyRecommendationsService';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function handleGetStudyRecommendations(
  req: Request,
  res: Response,
): Promise<void> {
  const userPlatformId = (req as any).user?.userPlatformId;
  if (!userPlatformId) {
    res.status(401).json({ message: 'Nao autenticado' });
    return;
  }

  const rawLimit = req.query?.limit;
  let limit = DEFAULT_LIMIT;
  if (typeof rawLimit === 'string') {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(MAX_LIMIT, parsed);
    }
  }

  try {
    const result = await getRecommendations(userPlatformId, limit);
    res.status(200).json(result);
  } catch (err) {
    console.error('[study-recommendations] service error', {
      userPlatformId,
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ message: 'Erro ao gerar recomendacoes' });
  }
}

export default handleGetStudyRecommendations;

export function registerStudyRecommendationsRoutes(app: Express): void {
  app.get(
    '/api/study/recommendations',
    requireAuth,
    (req: Request, res: Response) => handleGetStudyRecommendations(req, res),
  );
}
