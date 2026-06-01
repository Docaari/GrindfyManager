// =============================================================================
// studyRecommendationsService — Sprint Studies-Reform RF-06 (ADR-068)
//
// Pipeline server-side combinando 3 fontes:
//   1) getStatsLeaks(userId, top 5)        — leaks ativos com severity
//   2) getStaleSpots(userId, days=7)       — spots reviewLater=true sem theme link
//   3) getDormantThemes(userId, dormancy=30, progressMax=30)
//
// Promise.allSettled tolera falha em qualquer fonte (lesson #9).
// Merge + sort by priority_score desc + top N (default 10).
//
// Score formula (V1):
//   leak: severity * 1.5 + (severity >= 7 ? 5 : 0)
//   stale_spot: cap(ageDays, 30) * 0.3 + (type in {tilt,leak,mistake} ? 2 : 0)
//   dormant_theme: cap(dormancyDays, 30) * 0.1 + (progress < 10 ? 1 : 0)
//   normalized = min(100, round(score * 2))
// =============================================================================

import { storage } from '../storage';

export type RecommendationType = 'leak' | 'stale_spot' | 'dormant_theme';

export interface RecommendationItem {
  id: string;
  type: RecommendationType;
  title: string;
  description: string;
  priority_score: number;
  cta_action: 'create_theme' | 'review_spot' | 'open_theme';
  cta_url: string;
  metadata: Record<string, any>;
}

export interface RecommendationsResponse {
  items: RecommendationItem[];
  source_counts: {
    leaks: number;
    stale_spots: number;
    dormant_themes: number;
  };
  generated_at: string;
}

const STALE_SPOT_DAYS = 7;
const DORMANT_THEME_DAYS = 30;
const DORMANT_THEME_MAX_PROGRESS = 30;

// -----------------------------------------------------------------------------
// Score helpers
// -----------------------------------------------------------------------------

function scoreLeak(leak: { severity?: number | null }): number {
  const sev = Number(leak.severity ?? 0);
  const raw = sev * 1.5 + (sev >= 7 ? 5 : 0);
  return Math.min(100, Math.round(raw * 2));
}

function ageInDays(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = date instanceof Date ? date : new Date(date);
  const ms = Date.now() - d.getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

function scoreStaleSpot(spot: {
  type?: string | null;
  createdAt?: Date | string | null;
}): number {
  const ageDays = Math.min(30, ageInDays(spot.createdAt));
  const typeBonus = ['tilt', 'leak', 'mistake'].includes(String(spot.type ?? ''))
    ? 2
    : 0;
  const raw = ageDays * 0.3 + typeBonus;
  return Math.min(100, Math.round(raw * 2));
}

function scoreDormantTheme(theme: {
  progress?: number | null;
  lastVisitedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}): number {
  // lastVisitedAt nao existe ainda no schema studyThemes; usa updatedAt como
  // proxy de "ultima atividade" ate migration adicionar a coluna dedicada.
  const reference = theme.lastVisitedAt ?? theme.updatedAt ?? null;
  const dormancy = Math.min(30, ageInDays(reference));
  const progressBonus = (theme.progress ?? 0) < 10 ? 1 : 0;
  const raw = dormancy * 0.1 + progressBonus;
  return Math.min(100, Math.round(raw * 2));
}

// -----------------------------------------------------------------------------
// Mapping helpers (raw row -> RecommendationItem)
// -----------------------------------------------------------------------------

function mapLeak(leak: any): RecommendationItem {
  const id = String(leak.id ?? '');
  const description = String(leak.description ?? '');
  const sev = Number(leak.severity ?? 0);
  return {
    id: `leak-${id}`,
    type: 'leak',
    title: description ? `Leak: ${description}` : `Leak severidade ${sev}`,
    description,
    priority_score: scoreLeak(leak),
    cta_action: 'create_theme',
    cta_url: '/estudos/temas?fromStats=leaks',
    metadata: {
      leak_id: id,
      leak_severity: sev,
      leak_type: leak.type ?? null,
    },
  };
}

function mapStaleSpot(spot: any): RecommendationItem {
  const id = String(spot.id ?? '');
  const conclusion = String(spot.conclusion ?? '');
  return {
    id: `stale_spot-${id}`,
    type: 'stale_spot',
    title: conclusion
      ? `Spot pendente: ${conclusion.slice(0, 60)}`
      : 'Spot pendente para revisao',
    description: conclusion,
    priority_score: scoreStaleSpot(spot),
    cta_action: 'review_spot',
    cta_url: `/estudos/spots?spot=${id}`,
    metadata: {
      spot_id: id,
      spot_type: spot.type ?? null,
      spot_age_days: ageInDays(spot.createdAt),
    },
  };
}

function mapDormantTheme(theme: any): RecommendationItem {
  const id = String(theme.id ?? '');
  const name = String(theme.name ?? '');
  return {
    id: `dormant_theme-${id}`,
    type: 'dormant_theme',
    title: `Tema dormente: ${name}`,
    description: `Tema com progresso ${theme.progress ?? 0}% sem atividade recente`,
    priority_score: scoreDormantTheme(theme),
    cta_action: 'open_theme',
    cta_url: `/estudos/temas/${id}`,
    metadata: {
      theme_id: id,
      theme_progress: theme.progress ?? 0,
      theme_dormancy_days: ageInDays(theme.lastVisitedAt ?? theme.updatedAt),
    },
  };
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

function unwrapSettled<T>(
  result: PromiseSettledResult<T[] | undefined | null>,
  source: string,
  userId: string,
): T[] {
  if (result.status === 'fulfilled') {
    return result.value ?? [];
  }
  // Lesson #9: log antes do fallback para nao engolir erros silenciosamente.
  console.error(`[studyRecommendationsService] ${source} failed`, {
    userId,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  });
  return [];
}

export async function getRecommendations(
  userId: string,
  limit: number = 10,
): Promise<RecommendationsResponse> {
  const [leaksResult, spotsResult, themesResult] = await Promise.allSettled([
    storage.getStatsLeaks(userId, 5),
    storage.getStaleSpots(userId, STALE_SPOT_DAYS),
    storage.getDormantThemes(userId, DORMANT_THEME_DAYS, DORMANT_THEME_MAX_PROGRESS),
  ]);

  const leaks = unwrapSettled<any>(leaksResult, 'getStatsLeaks', userId);
  const staleSpots = unwrapSettled<any>(spotsResult, 'getStaleSpots', userId);
  const dormantThemes = unwrapSettled<any>(themesResult, 'getDormantThemes', userId);

  const items: RecommendationItem[] = [
    ...leaks.map(mapLeak),
    ...staleSpots.map(mapStaleSpot),
    ...dormantThemes.map(mapDormantTheme),
  ];

  // Sort by priority_score desc
  items.sort((a, b) => b.priority_score - a.priority_score);

  // Cap at limit
  const top = items.slice(0, Math.max(0, limit));

  return {
    items: top,
    source_counts: {
      leaks: leaks.length,
      stale_spots: staleSpots.length,
      dormant_themes: dormantThemes.length,
    },
    generated_at: new Date().toISOString(),
  };
}
