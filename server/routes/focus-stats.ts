// =============================================================================
// focus-stats mutations route — Sprint home-reform-4 / Item 7.
//
// Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-03, §RF-04
// ADRs : 116
//
// POST   /api/focus-stats              — cria marcacao
// DELETE /api/focus-stats/:id          — remove marcacao
//
// Validacoes principais:
//   - Zod body { statId, studyThemeId, month? }
//   - month default = mes corrente UTC
//   - month formato regex YYYY-MM
//   - month != futuro / passado
//   - statId em HUD_STAT_CATALOG
//   - studyThemeId existe + ownership (404 caso contrario, sem 403)
//   - Limite 3 (409 LIMIT_REACHED)
//   - UNIQUE catch (409 STAT_ALREADY_FOCUSED)
// =============================================================================

import type { Express, Response } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { getStatById } from "@shared/hud-stat-catalog";
import { invalidateFocusStatsCache } from "../services/focusStats";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function currentMonthUtc(date: Date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// LOW-14 reviewer: month removido do body. Sempre derivado server-side
// (currentMonthUtc()). Cliente nao pode marcar foco em mes passado/futuro
// porque o servidor ignora qualquer valor que receba.
//
// Sprint Estudos-Habito-1 (RF-3.1): studyThemeId agora aceita null (foco
// sem tema linkado), mas a chave precisa estar presente no body — evita
// regressao em testes legados que esperam 400 quando key ausente.
const createBodySchema = z.object({
  statId: z.string().min(1).max(64),
  studyThemeId: z.string().min(1).max(21).nullable(),
});

export async function handleCreateFocusStat(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const rawBody = req?.body ?? {};
    // Tolerancia legada: se body tinha month, valida formato (compat tests
    // historicos que enviam month invalido/futuro/passado e esperam 400).
    if (rawBody.month !== undefined) {
      if (typeof rawBody.month !== "string" || !MONTH_RE.test(rawBody.month)) {
        res.status(400).json({
          error: "INVALID_MONTH",
          message: "Formato month invalido (use YYYY-MM)",
        });
        return;
      }
      const today = currentMonthUtc();
      if (rawBody.month > today) {
        res.status(400).json({
          error: "INVALID_MONTH_FUTURE",
          message: "Nao eh possivel marcar foco para mes futuro",
        });
        return;
      }
      if (rawBody.month < today) {
        res.status(400).json({
          error: "INVALID_MONTH_PAST",
          message: "Nao eh possivel marcar foco para mes passado",
        });
        return;
      }
    }

    const parsed = createBodySchema.safeParse({
      statId: rawBody.statId,
      studyThemeId: rawBody.studyThemeId,
    });
    if (!parsed.success) {
      res.status(400).json({
        error: "INVALID_BODY",
        message: "Corpo invalido",
        issues: parsed.error.issues,
      });
      return;
    }

    const { statId, studyThemeId: rawThemeId } = parsed.data;
    const studyThemeId = rawThemeId ?? null;
    // Server SEMPRE deriva month — cliente nao pode escolher.
    const month = currentMonthUtc();

    // Stat valida (HUD_STAT_CATALOG). Validar antes de tocar no DB.
    if (!getStatById(statId)) {
      res.status(400).json({
        error: "INVALID_STAT_ID",
        message: "Stat nao encontrada no catalogo HUD",
      });
      return;
    }

    // Ownership do tema (skip quando null — RF-3.1). 404 (nao 403) para nao
    // vazar existencia.
    if (studyThemeId !== null) {
      const theme = await (storage as any).getStudyThemeById(studyThemeId);
      if (!theme || theme.userId !== userId) {
        res.status(404).json({
          error: "THEME_NOT_FOUND",
          message: "Tema nao encontrado",
        });
        return;
      }
    }

    // Pre-check do limite (race protegido pela transacao no storage).
    const count = await (storage as any).countUserFocusStats(userId, month);
    if (typeof count === "number" && count >= 3) {
      res.status(409).json({
        error: "LIMIT_REACHED",
        message: "Voce ja tem 3 stats foco neste mes. Remova uma antes de adicionar outra.",
      });
      return;
    }

    try {
      const created = await (storage as any).createUserFocusStat({
        userId,
        statId,
        studyThemeId,
        month,
      });
      // MEDIUM-8 reviewer: invalidate cache do user.
      invalidateFocusStatsCache(userId);
      res.status(201).json(created);
    } catch (err: any) {
      if (err?.code === "LIMIT_REACHED") {
        res.status(409).json({
          error: "LIMIT_REACHED",
          message: "Voce ja tem 3 stats foco neste mes.",
        });
        return;
      }
      if (err?.code === "STAT_ALREADY_FOCUSED" || err?.code === "23505") {
        res.status(409).json({
          error: "STAT_ALREADY_FOCUSED",
          message: "Esta stat ja esta marcada como foco neste mes.",
        });
        return;
      }
      throw err;
    }
  } catch (err) {
    console.error("[handleCreateFocusStat] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export async function handleDeleteFocusStat(
  req: any,
  res: Response,
): Promise<void> {
  try {
    const userId = req?.user?.userPlatformId;
    if (!userId) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const id = String(req?.params?.id ?? "");
    if (!id) {
      res.status(400).json({ error: "INVALID_ID", message: "id required" });
      return;
    }

    const ok = await (storage as any).deleteUserFocusStat(id, userId);
    if (!ok) {
      res.status(404).json({ error: "NOT_FOUND", message: "Marcacao nao encontrada" });
      return;
    }
    // MEDIUM-8 reviewer: invalidate cache do user.
    invalidateFocusStatsCache(userId);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[handleDeleteFocusStat] error", err);
    res.status(500).json({ message: "Internal error" });
  }
}

export function registerFocusStatsRoutes(app: Express): void {
  app.post("/api/focus-stats", requireAuth, handleCreateFocusStat);
  app.delete("/api/focus-stats/:id", requireAuth, handleDeleteFocusStat);
}
