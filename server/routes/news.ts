/**
 * News routes — ADR-100 (estrutura) + ADR-106 (Grok integration + opt-in granular).
 *
 * Endpoints:
 *   GET    /api/news                  — items filtrados por user prefs + categoria
 *   GET    /api/news/preferences      — prefs do user + plataformas detectadas + catalogo
 *   PATCH  /api/news/preferences      — atualiza prefs (Zod validado)
 *   GET    /api/news/sources          — catalogo publico (auth)
 *   POST   /api/admin/news/refresh    — admin: trigger manual do cron
 *
 * Master flag NEWS_FEED_ENABLED desliga tudo se off (incidente / debug).
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { NewsItem, NewsResponse, UserNewsPreferencesResponse } from "@shared/types/news";
import { newsCategorySchema, newsPreferenceUpdateSchema } from "@shared/schema";
import { requireAuth } from "../auth";
import { storage as storageBase } from "../storage";

// Helpers do news vivem como funcoes top-level no storage.ts e foram bindadas
// ao instance via (storage as any). Cast aqui pra TS aceitar.
const storage = storageBase as any;
import { fetchGrokNews } from "../services/grokNewsProvider";
import { rankNewsFeed } from "../services/newsRanking";

// =============================================================================
// In-memory cache /api/news/feed por userId (5 min TTL).
// =============================================================================

interface FeedCacheEntry {
  enabled: boolean;
  items: NewsItem[];
  cachedAt: number;
  nextRefreshAt: number;
  /** hash dos prefs que produziram este cache. */
  prefsHash: string;
}

const FEED_CACHE = new Map<string, FeedCacheEntry>();
const FEED_CACHE_TTL_MS = 5 * 60 * 1000;

function hashPrefs(prefs: Array<{ category: string; enabled: boolean; platformToggles: Record<string, boolean> | null }>): string {
  const parts: string[] = [];
  for (const p of prefs ?? []) {
    if (!p.enabled) continue;
    const allowed = Object.entries(p.platformToggles ?? {})
      .filter(([, on]) => on === true)
      .map(([k]) => k)
      .sort();
    if (allowed.length === 0) continue;
    parts.push(`${p.category}:${allowed.join(',')}`);
  }
  parts.sort();
  return parts.join('|') || 'empty';
}

function nextMondayNoonBrt(now: Date): Date {
  // BRT = UTC-3. Cron roda Mon 12:00 BRT = Mon 15:00 UTC.
  const result = new Date(now.getTime());
  // Move forward to next Monday 15:00 UTC.
  const utcDay = result.getUTCDay(); // 0=Sun..6=Sat
  // Days until next Monday (1). If already Monday and >=15:00 UTC, jump to next week.
  let daysAhead = (1 - utcDay + 7) % 7;
  if (daysAhead === 0) {
    if (
      result.getUTCHours() > 15 ||
      (result.getUTCHours() === 15 && result.getUTCMinutes() > 0)
    ) {
      daysAhead = 7;
    }
  }
  result.setUTCDate(result.getUTCDate() + daysAhead);
  result.setUTCHours(15, 0, 0, 0);
  return result;
}

function isNewsFeedEnabled(): boolean {
  const v = process.env.NEWS_FEED_ENABLED;
  if (!v) return false;
  return v === "true" || v === "1";
}

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

// =============================================================================
// GET /api/news?type=market|gossip|tournament-results&limit=N
// =============================================================================

export async function handleGetNews(req: any, res: Response): Promise<void> {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const enabled = isNewsFeedEnabled();
    const typeParse = newsCategorySchema.safeParse(req.query?.type ?? "market");
    if (!typeParse.success) {
      res.status(400).json({ message: "type invalido" });
      return;
    }
    const category = typeParse.data;
    const limitRaw = req.query?.limit;
    const limit =
      typeof limitRaw === "string" && /^\d+$/.test(limitRaw)
        ? Math.min(20, Math.max(1, parseInt(limitRaw, 10)))
        : 5;

    let items: NewsItem[] = [];
    if (enabled) {
      const pref = await storage.getUserNewsPreference(userId, category);
      if (pref?.enabled) {
        const allowedSourceIds = Object.entries(pref.platformToggles ?? {})
          .filter(([, on]) => on === true)
          .map(([k]) => k);
        if (allowedSourceIds.length > 0) {
          items = await storage.listNewsItems({
            category,
            sourceIds: allowedSourceIds,
            limit,
          });
        }
      }
    }

    const body: NewsResponse = { enabled, items };
    res.setHeader("Cache-Control", "private, max-age=60");
    res.status(200).json(body);
  } catch (err: any) {
    console.error("[news/get] failed", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// GET /api/news/feed — top 10 ranqueado server-side (ADR-110 §2.1, RF-B2)
// =============================================================================

export async function handleGetNewsFeed(req: any, res: Response): Promise<void> {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    res.setHeader("Cache-Control", "private, max-age=60");

    const now = new Date();
    const nowMs = now.getTime();
    const enabled = isNewsFeedEnabled();

    // Flag desligada => sempre enabled:false / items:[]
    if (!enabled) {
      const nextRefreshAt = nextMondayNoonBrt(now);
      res.status(200).json({
        enabled: false,
        items: [],
        cachedAt: now.toISOString(),
        nextRefreshAt: nextRefreshAt.toISOString(),
      });
      return;
    }

    // Carrega prefs do user e descobre categorias habilitadas + sourceIds.
    const prefs = (await storage.listUserNewsPreferences(userId)) as Array<{
      category: string;
      enabled: boolean;
      platformToggles: Record<string, boolean> | null;
    }>;
    const prefsHash = hashPrefs(prefs);

    // Cache check (mesmo prefs hash + dentro do TTL).
    const cached = FEED_CACHE.get(userId);
    if (
      cached &&
      cached.prefsHash === prefsHash &&
      nowMs - cached.cachedAt < FEED_CACHE_TTL_MS
    ) {
      res.status(200).json({
        enabled: cached.enabled,
        items: cached.items,
        cachedAt: new Date(cached.cachedAt).toISOString(),
        nextRefreshAt: new Date(cached.nextRefreshAt).toISOString(),
      });
      return;
    }

    const enabledByCategory = new Map<string, string[]>();
    for (const p of prefs ?? []) {
      if (!p.enabled) continue;
      const allowed = Object.entries(p.platformToggles ?? {})
        .filter(([, on]) => on === true)
        .map(([k]) => k);
      if (allowed.length === 0) continue;
      enabledByCategory.set(p.category, allowed);
    }

    if (enabledByCategory.size === 0) {
      const nextRefreshAt = nextMondayNoonBrt(now);
      const payload = {
        enabled: false,
        items: [] as NewsItem[],
        cachedAt: now.toISOString(),
        nextRefreshAt: nextRefreshAt.toISOString(),
      };
      FEED_CACHE.set(userId, {
        enabled: false,
        items: [],
        cachedAt: nowMs,
        nextRefreshAt: nextRefreshAt.getTime(),
        prefsHash,
      });
      res.status(200).json(payload);
      return;
    }

    // Carrega items de cada categoria habilitada, agrega e ranqueia.
    const collected: NewsItem[] = [];
    for (const [category, sourceIds] of enabledByCategory.entries()) {
      const rows = (await storage.listNewsItems({
        category,
        sourceIds,
        // pegamos um pool maior (20) por categoria pra dar massa ao ranking.
        limit: 20,
      })) as NewsItem[];
      collected.push(...rows);
    }

    const ranked = rankNewsFeed(collected);
    const nextRefreshAt = nextMondayNoonBrt(now);

    FEED_CACHE.set(userId, {
      enabled: true,
      items: ranked,
      cachedAt: nowMs,
      nextRefreshAt: nextRefreshAt.getTime(),
      prefsHash,
    });

    res.status(200).json({
      enabled: true,
      items: ranked,
      cachedAt: now.toISOString(),
      nextRefreshAt: nextRefreshAt.toISOString(),
    });
  } catch (err: any) {
    console.error("[news/feed] failed", err);
    res.status(500).json({ message: "Internal error" });
  }
}

/** Limpa cache feed — exposto para testes / cron. */
export function _clearFeedCache(): void {
  FEED_CACHE.clear();
}

// =============================================================================
// GET /api/news/preferences
// =============================================================================

export async function handleGetNewsPreferences(req: any, res: Response): Promise<void> {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const result = await storage.getUserNewsPreferencesPayload(userId);
    res.status(200).json(result satisfies UserNewsPreferencesResponse);
  } catch (err: any) {
    console.error("[news/preferences/get] failed", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// PATCH /api/news/preferences
// =============================================================================

const patchBodySchema = z.object({
  updates: z.array(newsPreferenceUpdateSchema).min(1).max(10),
});

export async function handlePatchNewsPreferences(req: any, res: Response): Promise<void> {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const parsed = patchBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Body invalido",
      });
      return;
    }
    for (const u of parsed.data.updates) {
      await storage.upsertUserNewsPreference(userId, u);
    }
    const result = await storage.getUserNewsPreferencesPayload(userId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error("[news/preferences/patch] failed", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// GET /api/news/sources?category=X
// =============================================================================

export async function handleGetNewsSources(req: any, res: Response): Promise<void> {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const cat = req.query?.category as string | undefined;
    const filter = cat ? newsCategorySchema.safeParse(cat) : null;
    const items = await storage.listNewsSources(filter?.success ? filter.data : undefined);
    res.status(200).json({ items });
  } catch (err: any) {
    console.error("[news/sources] failed", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// POST /api/admin/news/refresh — manual trigger (admin only)
// =============================================================================

export async function handleAdminRefreshNews(req: any, res: Response): Promise<void> {
  try {
    const userId = userIdOf(req);
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const isAdmin = req?.user?.role === "admin" || req?.user?.isAdmin === true;
    if (!isAdmin) {
      res.status(403).json({ message: "Admin only" });
      return;
    }
    if (!isNewsFeedEnabled()) {
      res.status(409).json({ message: "NEWS_FEED_ENABLED=false" });
      return;
    }
    const cat = req.query?.category as string | undefined;
    const filter = cat ? newsCategorySchema.safeParse(cat) : null;
    const sources = await storage.listNewsSources(
      filter?.success ? filter.data : undefined,
    );
    let inserted = 0;
    let skipped = 0;
    for (const src of sources) {
      if (!src.enabled) continue;
      const hasUser = await storage.hasAnyUserEnabledForSource({
        id: src.id,
        category: src.category,
      });
      if (!hasUser) {
        skipped += 1;
        continue;
      }
      const items = await fetchGrokNews({
        category: src.category as any,
        platform: src.platform,
        promptTemplate: src.queryTemplate ?? "",
        liveSearchHandle: src.liveSearchHandle,
        limit: 5,
      });
      for (const it of items) {
        const ok = await storage.upsertNewsItem({
          ...it,
          sourceId: src.id,
        });
        if (ok) inserted += 1;
      }
    }
    res.status(200).json({ ok: true, inserted, sources: sources.length, skipped });
  } catch (err: any) {
    console.error("[news/admin/refresh] failed", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// =============================================================================
// Backwards-compat exports (ADR-100 contract — Onda 1 testes)
// =============================================================================

/** @deprecated — Onda 3 substituido por fetchGrokNews. Stub mantido pra news-stub.test. */
export async function fetchNewsItems(_source: string, _limit: number): Promise<NewsItem[]> {
  return [];
}

export function getCacheKey(userId: string | null, source: string): string {
  return `news:${userId ?? "anon"}:${source}`;
}

export function sanitizeNewsItem(raw: unknown): NewsItem | null {
  if (!raw || typeof raw !== "object") return null;
  return raw as NewsItem;
}

// =============================================================================
// Rate limit + registration
// =============================================================================

const newsReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisicoes ao news feed." },
});

export function registerNewsRoutes(app: Express): void {
  app.get("/api/news", requireAuth, newsReadLimiter, (req: Request, res: Response) =>
    handleGetNews(req, res),
  );
  app.get(
    "/api/news/feed",
    requireAuth,
    newsReadLimiter,
    (req: Request, res: Response) => handleGetNewsFeed(req, res),
  );
  app.get("/api/news/preferences", requireAuth, (req: Request, res: Response) =>
    handleGetNewsPreferences(req, res),
  );
  app.patch("/api/news/preferences", requireAuth, (req: Request, res: Response) =>
    handlePatchNewsPreferences(req, res),
  );
  app.get("/api/news/sources", requireAuth, (req: Request, res: Response) =>
    handleGetNewsSources(req, res),
  );
  app.post(
    "/api/admin/news/refresh",
    requireAuth,
    (req: Request, res: Response) => handleAdminRefreshNews(req, res),
  );
}

// Legacy export — ADR-100 stub handler. Mantido pra back-compat dos testes Onda 1.
export const handleGetNews_v1Stub = handleGetNews;
