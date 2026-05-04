// =============================================================================
// home-focus-stats route — Sprint home-reform-4 / Item 7.
//
// Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-02
// ADRs : 116, 117, 118
//
// GET /api/home/focus-stats?month=YYYY-MM
//   - Auth obrigatorio.
//   - Default month = mes corrente UTC.
//   - Validacao formato + nao-futuro (servico interno aceita; aqui so formato).
//   - Retorna { month, previousMonth, items, meta: { limitReached, generatedAt } }.
// =============================================================================

import type { Express, Response } from "express";
import { requireAuth } from "../auth";
import { getFocusStatsForHome } from "../services/focusStats";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthUtc(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function previousMonthOf(month: string): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  const year = Number(month.slice(0, 4));
  const idx = Number(month.slice(5, 7)) - 1;
  const prevYear = idx === 0 ? year - 1 : year;
  const prevIdx = idx === 0 ? 11 : idx - 1;
  return `${prevYear}-${String(prevIdx + 1).padStart(2, "0")}`;
}

export async function handleGetFocusStats(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const queryMonth = typeof req?.query?.month === "string" ? req.query.month : undefined;
    const month = queryMonth ?? currentMonthUtc();
    if (!MONTH_RE.test(month)) {
      res.status(400).json({ error: "INVALID_MONTH", message: "Formato deve ser YYYY-MM" });
      return;
    }

    const result = await getFocusStatsForHome({ userId, month });
    const items = Array.isArray(result?.items) ? result.items : [];

    res.status(200).json({
      month,
      previousMonth: previousMonthOf(month),
      items,
      meta: {
        limitReached: items.length >= 3,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[handleGetFocusStats] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export function registerHomeFocusStatsRoutes(app: Express): void {
  app.get("/api/home/focus-stats", requireAuth, handleGetFocusStats);
}
