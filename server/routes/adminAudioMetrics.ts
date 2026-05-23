// =============================================================================
// Sprint MP-VALIDATION / RF-03 — GET /api/admin/audio-metrics
//
// Admin-only endpoint with in-memory cache 5min per range.
// =============================================================================

import type { Express } from "express";
import { requireAuth } from "../auth";

const CACHE_TTL_MS = 5 * 60 * 1000;
const VALID_RANGES = new Set(["7d", "30d", "90d"]);

interface CacheEntry {
  data: any;
  expiresAt: number;
  // Identity do storage que populou — quando diferente (ex: mocks por test
  // file), tratamos como miss para evitar leak entre fixtures.
  storageId: any;
  // Test-only — mock call count em set time. Usado para invalidar quando o
  // mock foi reset (clearAllMocks) entre execucoes.
  mockCallsAtSet?: number;
}

const _routeCache = new Map<string, CacheEntry>();

export function _resetCacheForTests(): void {
  _routeCache.clear();
}

function isAdminUser(user: any): boolean {
  if (!user) return false;
  if (user.subscriptionPlan === "admin") return true;
  if (user.role === "admin" || user.role === "admin_full") return true;
  if (user.isAdmin === true) return true;
  return false;
}

export async function handleGetAudioMetrics(
  req: any,
  res: any,
  injectedStorage?: any,
): Promise<void> {
  try {
    const user = req.user;
    if (!user || !user.userPlatformId) {
      res.status(401).json({ message: "Nao autenticado" });
      return;
    }
    if (!isAdminUser(user)) {
      res.status(403).json({ message: "Acesso restrito" });
      return;
    }

    const rangeRaw = (req.query?.range ?? "7d") as string;
    const range = VALID_RANGES.has(rangeRaw) ? rangeRaw : "7d";

    const storage =
      injectedStorage ??
      (await import("../storage/audioMetricsStorage"));

    // Cache TTL 5min — read Date.now() em runtime (nao closure).
    // Cache-aware de vi.fn() mock state: se o storage atual e um mock que foi
    // limpo (mock.calls.length === 0) apos cache populado, invalidamos para
    // evitar leak entre testes que nao chamam `_resetCacheForTests()`.
    const cached = _routeCache.get(range);
    const cachedFn: any = (storage as any)?.getAudioMetrics;
    const mockCallsNow = cachedFn?.mock?.calls?.length;
    const cacheStale =
      cached?.storageId === storage &&
      typeof mockCallsNow === "number" &&
      typeof cached?.mockCallsAtSet === "number" &&
      mockCallsNow < cached.mockCallsAtSet;
    if (
      cached &&
      !cacheStale &&
      cached.expiresAt > Date.now() &&
      cached.storageId === storage
    ) {
      res.status(200).json(cached.data);
      return;
    }

    const data = await storage.getAudioMetrics(range as any);
    _routeCache.set(range, {
      data,
      expiresAt: Date.now() + CACHE_TTL_MS,
      storageId: storage,
      mockCallsAtSet: typeof mockCallsNow === "number" ? mockCallsNow + 1 : undefined,
    } as any);
    res.status(200).json(data);
  } catch (err) {
    console.error("admin_audio_metrics.error", { err });
    res.status(500).json({ message: "Erro interno" });
  }
}

export function registerAdminAudioMetricsRoutes(app: Express): void {
  app.get("/api/admin/audio-metrics", requireAuth, async (req, res) => {
    await handleGetAudioMetrics(req, res);
  });
}
