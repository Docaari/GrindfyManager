// =============================================================================
// focusStats service — Sprint home-reform-4 / Item 7.
//
// Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-02
// ADRs : 116 (schema), 117 (study_sessions.theme_id), 118 (zona Estudos)
//
// getFocusStatsForHome(userId, month) -> { items, ... }
//
// Para cada marcacao do user no mes:
//   - hidrata stat metadata via HUD_STAT_CATALOG (fallback label = statId)
//   - calcula currentValue (snapshot mais recente do mes que contem statId)
//   - calcula previousValue (mesma logica para mes anterior)
//   - delta + deltaDirection (improving/degrading/neutral por stat.direction)
//   - resolve theme via getStudyThemeById (theme=null se deletado por race)
//   - studyMinutesMonth via getStudyMinutesByThemeMonth (sempre numero, 0 default)
//
// Tema deletado: theme=null + entry continua aparecendo (placeholder na UI).
// Stat fora do catalog: statLabel = statId, statUnit = null, deltaDirection
// degrada para neutral.
// =============================================================================

import { storage } from "../storage";
import { getStatById } from "@shared/hud-stat-catalog";

export interface FocusStatThemeView {
  id: string;
  name: string;
  color: string | null;
  emoji: string | null;
  progress: number | null;
}

export interface FocusStatItem {
  id: string;
  statId: string;
  statLabel: string;
  statUnit: string | null;
  currentValue: number | null;
  previousValue: number | null;
  delta: number | null;
  deltaDirection: "improving" | "degrading" | "neutral" | null;
  theme: FocusStatThemeView | null;
  studyMinutesMonth: number;
}

export interface FocusStatsForHomeResult {
  items: FocusStatItem[];
}

// =============================================================================
// MEDIUM-8 reviewer: in-memory cache TTL 30s por (userId, month).
// Reduz fan-out de queries DB (1 list + N x (theme + 2 snapshots + minutes))
// quando UI re-renderiza Home varias vezes em janela curta. TTL casa com
// staleTime 30s do useQuery client-side.
// =============================================================================
interface CacheEntry {
  data: FocusStatsForHomeResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 256;
const _cache = new Map<string, CacheEntry>();

function cacheKey(userId: string, month: string): string {
  return `${userId}|${month}`;
}

/**
 * Invalidator publico — chamado por POST/DELETE focus-stats e por test setup.
 * Aceita userId opcional; sem userId limpa todo o cache.
 */
export function invalidateFocusStatsCache(userId?: string): void {
  if (!userId) {
    _cache.clear();
    return;
  }
  for (const key of Array.from(_cache.keys())) {
    if (key.startsWith(`${userId}|`)) {
      _cache.delete(key);
    }
  }
}

/** Test-only: reset completo. */
export function _resetFocusStatsCacheForTests(): void {
  _cache.clear();
}

function monthBounds(month: string): { start: Date; end: Date; previousMonth: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) {
    const fallback = new Date();
    return {
      start: new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), 1)),
      end: new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth() + 1, 1)),
      previousMonth: month,
    };
  }
  const year = Number(m[1]);
  const monthIdx = Number(m[2]) - 1;
  const start = new Date(Date.UTC(year, monthIdx, 1));
  const end = new Date(Date.UTC(year, monthIdx + 1, 1));
  const prevYear = monthIdx === 0 ? year - 1 : year;
  const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1;
  const previousMonth = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, "0")}`;
  return { start, end, previousMonth };
}

function deltaDirectionFor(
  delta: number | null,
  direction: string | null | undefined,
): "improving" | "degrading" | "neutral" | null {
  if (delta === null || delta === undefined) return null;
  if (delta === 0) return "neutral";
  if (direction === "higher_better") return delta > 0 ? "improving" : "degrading";
  if (direction === "lower_better") return delta > 0 ? "degrading" : "improving";
  return "neutral";
}

export async function getFocusStatsForHome(input: {
  userId: string;
  month: string;
}): Promise<FocusStatsForHomeResult> {
  const { userId, month } = input;

  // MEDIUM-8 reviewer: cache check antes do DB.
  const key = cacheKey(userId, month);
  const cached = _cache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const rows = await (storage as any).listUserFocusStats(userId, month);
  if (!Array.isArray(rows) || rows.length === 0) {
    const empty: FocusStatsForHomeResult = { items: [] };
    if (_cache.size >= CACHE_MAX_ENTRIES) _cache.clear();
    _cache.set(key, { data: empty, expiresAt: now + CACHE_TTL_MS });
    return empty;
  }

  const { start: monthStart, end: monthEnd, previousMonth } = monthBounds(month);
  const prevBounds = monthBounds(previousMonth);

  const items: FocusStatItem[] = [];
  for (const row of rows) {
    const statMeta = getStatById(row.statId);
    const statLabel = statMeta?.label ?? row.statId;
    const statUnit = statMeta?.unit ?? null;
    const direction = statMeta?.direction ?? null;

    const [theme, currentSnap, previousSnap, minutes] = await Promise.all([
      (storage as any).getStudyThemeById(row.studyThemeId),
      (storage as any).getStatLatestSnapshotInMonth(
        userId,
        row.statId,
        monthStart,
        monthEnd,
      ),
      (storage as any).getStatLatestSnapshotInMonth(
        userId,
        row.statId,
        prevBounds.start,
        prevBounds.end,
      ),
      (storage as any).getStudyMinutesByThemeMonth(
        userId,
        row.studyThemeId,
        monthStart,
        monthEnd,
      ),
    ]);

    const currentValue =
      currentSnap && currentSnap.value !== undefined && currentSnap.value !== null
        ? Number(currentSnap.value)
        : null;
    const previousValue =
      previousSnap && previousSnap.value !== undefined && previousSnap.value !== null
        ? Number(previousSnap.value)
        : null;
    const delta =
      currentValue !== null && previousValue !== null
        ? Number((currentValue - previousValue).toFixed(4))
        : null;
    const deltaDir = deltaDirectionFor(delta, direction);

    let themeView: FocusStatThemeView | null = null;
    if (theme && theme.id) {
      themeView = {
        id: theme.id,
        name: theme.name,
        color: theme.color ?? null,
        emoji: theme.emoji ?? null,
        progress: theme.progress ?? null,
      };
    }

    items.push({
      id: row.id,
      statId: row.statId,
      statLabel,
      statUnit,
      currentValue,
      previousValue,
      delta,
      deltaDirection: deltaDir,
      theme: themeView,
      studyMinutesMonth: Number(minutes ?? 0),
    });
  }

  const result: FocusStatsForHomeResult = { items };
  if (_cache.size >= CACHE_MAX_ENTRIES) _cache.clear();
  _cache.set(key, { data: result, expiresAt: now + CACHE_TTL_MS });
  return result;
}
