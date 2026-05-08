/**
 * /api/stats/focus/auto-suggest — Sprint Estudos-Habito-1 (RF-3.3).
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-3.3
 * ADRs : 116 (focus_stats) + 127 (curated themes hybrid)
 *
 * POST /api/stats/focus/auto-suggest?month=YYYY-MM
 *   - 200: { created: UserFocusStat[], warnings: string[] }
 *   - 409: user ja tem 3 focus stats no mes (idempotent)
 *   - 400: month invalido / futuro
 *   - 401: sem auth
 */

import type { Express, Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth";
import { storage } from "../storage";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// HIGH-3 fix: rate limit 10/min por user (operacao custosa: leak detection +
// theme lookups + insert).
const autoSuggestLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
});

function currentMonthUtc(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export async function handleAutoSuggestFocusStats(req: any, res: Response): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    const monthRaw = typeof req?.query?.month === "string" ? req.query.month : currentMonthUtc();
    if (!MONTH_RE.test(monthRaw)) {
      res.status(400).json({ error: "INVALID_MONTH", message: "Formato deve ser YYYY-MM" });
      return;
    }
    if (monthRaw > currentMonthUtc()) {
      res.status(400).json({ error: "INVALID_MONTH_FUTURE", message: "Mes futuro nao permitido" });
      return;
    }

    // HIGH-2 fix: garantir curated themes seeded antes de tentar resolver
    // theme links via findCuratedThemeByLinkedStat. Idempotente.
    try {
      await (storage as any).ensureCuratedThemesForUser(userId);
    } catch (err) {
      console.error("[handleAutoSuggestFocusStats] ensureCuratedThemesForUser failed", err);
      // Nao falha a request — auto-suggest pode prosseguir com themeId=null.
    }

    // Idempotency: se user ja tem 3 focus stats no mes, 409.
    const count = await (storage as any).countUserFocusStats(userId, monthRaw);
    if (typeof count === "number" && count >= 3) {
      res.status(409).json({
        error: "LIMIT_REACHED",
        message: "Voce ja tem 3 stats foco neste mes",
      });
      return;
    }

    // Fetch top 3 leaks.
    const leaks = await (storage as any).getStatsLeaks(userId, 3);
    const leaksArr: Array<{ statId: string; severity?: number }> = Array.isArray(leaks) ? leaks : [];
    const top3 = leaksArr.slice(0, 3);

    const created: any[] = [];
    const warnings: string[] = [];
    const remainingSlots = Math.max(0, 3 - (typeof count === "number" ? count : 0));

    // P1 #12: paralleliza lookup de curated themes para os top3 leaks.
    // Reduz N round-trips DB para 1.
    const themeLookups = await Promise.all(
      top3.map((leak) =>
        (storage as any)
          .findCuratedThemeByLinkedStat(userId, leak.statId)
          .catch(() => null),
      ),
    );

    let createdCount = 0;
    for (let i = 0; i < top3.length; i++) {
      if (createdCount >= remainingSlots) break;
      const leak = top3[i];
      const theme = themeLookups[i];
      const themeId: string | null = theme?.id ?? null;
      try {
        const row = await (storage as any).createUserFocusStat({
          userId,
          statId: leak.statId,
          studyThemeId: themeId,
          month: monthRaw,
        });
        created.push(row);
        createdCount += 1;
        if (!themeId) {
          warnings.push(`Stat ${leak.statId} sem tema linkado curated.`);
        }
      } catch (err: any) {
        if (err?.code === "STAT_ALREADY_FOCUSED" || err?.code === "23505") {
          warnings.push(`Stat ${leak.statId} ja foi marcada (idempotent).`);
        } else {
          warnings.push(`Stat ${leak.statId}: erro ao criar (${err?.message ?? "unknown"}).`);
        }
      }
    }

    if (top3.length === 0) {
      warnings.push("Nenhum leak detectado — registre mais sessoes para sugestoes melhores.");
    } else if (top3.length < 3) {
      warnings.push("Pouco historico — registre mais sessoes para sugestoes melhores.");
    }

    res.status(200).json({ created, warnings });
  } catch (err) {
    console.error("[handleAutoSuggestFocusStats] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export function registerFocusStatsAutoSuggestRoutes(app: Express): void {
  app.post("/api/stats/focus/auto-suggest", requireAuth, autoSuggestLimit, handleAutoSuggestFocusStats);
}
