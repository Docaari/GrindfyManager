/**
 * Sprint Flight-1 — Tournament Series Routes (RF-03 + RF-04)
 *
 * Spec: docs/specs/sprint-flight-1.md
 * ADRs: 090 (single source of truth), 091 (stack_mode enum)
 *
 * Endpoints:
 *   GET    /api/tournament-series                       -> list user series
 *   POST   /api/tournament-series                       -> create new series
 *   GET    /api/tournament-series/:id                   -> series + entries + planneds
 *   PATCH  /api/tournament-series/:id                   -> partial update (RF-14 side-effect)
 *   DELETE /api/tournament-series/:id                   -> hard delete
 *   POST   /api/tournament-series/:id/mark-bagged       -> RF-04 (cria/update planned Day 2)
 *
 * Auth: requireAuth em todos.
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  insertTournamentSeriesSchema,
  updateTournamentSeriesSchema,
} from "@shared/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function unauthorized(res: any): any {
  return res.status(401).json({ message: "Unauthorized" });
}

// ---------------------------------------------------------------------------
// GET /api/tournament-series
// ---------------------------------------------------------------------------

export async function handleGetSeriesList(req: any, res: any): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const status = req.query?.status as string | undefined;
    const limit = req.query?.limit ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query?.offset ? parseInt(String(req.query.offset), 10) : undefined;
    const opts: any = {};
    if (status) opts.status = status;
    if (limit) opts.limit = limit;
    if (offset) opts.offset = offset;
    const list = await (storage as any).getSeriesByUserId(userId, opts);
    res.status(200).json(list);
  } catch (err: any) {
    console.error("[handleGetSeriesList] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/tournament-series
// ---------------------------------------------------------------------------

export async function handlePostSeries(req: any, res: any): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    // userId nao vem do body — vem do JWT.
    const parsed = insertTournamentSeriesSchema.safeParse({
      ...req.body,
      userId,
    });
    if (!parsed.success) {
      res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten?.() ?? parsed.error,
      });
      return;
    }
    const created = await (storage as any).createSeries(userId, parsed.data);
    res.status(201).json(created);
  } catch (err: any) {
    console.error("[handlePostSeries] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// GET /api/tournament-series/:id
// ---------------------------------------------------------------------------

export async function handleGetSeriesById(req: any, res: any): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const id = req.params?.id;
    const series = await (storage as any).getSeriesById(userId, id);
    if (!series) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const [entries, planneds] = await Promise.all([
      (storage as any).getEntriesBySeriesId(userId, id),
      (storage as any).getPlannedBySeriesId(userId, id),
    ]);
    res.status(200).json({ series, entries, planneds });
  } catch (err: any) {
    console.error("[handleGetSeriesById] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/tournament-series/:id (RF-14 side-effect)
// ---------------------------------------------------------------------------

export async function handlePatchSeries(req: any, res: any): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const id = req.params?.id;
    const parsed = updateTournamentSeriesSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        message: "Validation error",
        errors: parsed.error.flatten?.() ?? parsed.error,
      });
      return;
    }

    const existing = await (storage as any).getSeriesById(userId, id);
    if (!existing) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const oldDateTime = existing.day2DateTime ? new Date(existing.day2DateTime).getTime() : null;
    const updated = await (storage as any).updateSeries(userId, id, parsed.data);

    // RF-14 side-effect: se day2DateTime mudou, atualizar planned Day 2 linkado.
    const newDateTime = parsed.data.day2DateTime
      ? new Date(parsed.data.day2DateTime).getTime()
      : null;
    if (newDateTime != null && newDateTime !== oldDateTime) {
      try {
        const planneds = await (storage as any).getPlannedBySeriesId(userId, id);
        for (const planned of planneds ?? []) {
          await (storage as any).updatePlannedTournament(planned.id, {
            startTime: new Date(newDateTime),
          });
        }
      } catch (sideErr) {
        // Side-effect failure nao bloqueia resposta principal — apenas log.
        console.error("[handlePatchSeries] side-effect planned update failed:", sideErr);
      }
    }

    res.status(200).json(updated);
  } catch (err: any) {
    console.error("[handlePatchSeries] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/tournament-series/:id
// ---------------------------------------------------------------------------

export async function handleDeleteSeries(req: any, res: any): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const id = req.params?.id;
    const existing = await (storage as any).getSeriesById(userId, id);
    if (!existing) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    await (storage as any).deleteSeries(userId, id);
    res.status(204).send();
  } catch (err: any) {
    console.error("[handleDeleteSeries] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// POST /api/tournament-series/:id/mark-bagged (RF-04)
// ---------------------------------------------------------------------------

export async function handleMarkBagged(req: any, res: any): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  try {
    const seriesId = req.params?.id;
    const { tournamentId, day2DateTime: bodyDateTime, stackMode: bodyStackMode } = req.body ?? {};

    if (!tournamentId) {
      res.status(400).json({ message: "tournamentId required" });
      return;
    }

    const series = await (storage as any).getSeriesById(userId, seriesId);
    if (!series) {
      res.status(404).json({ message: "Not found" });
      return;
    }
    const tournament = await (storage as any).getTournamentById(tournamentId, userId);
    if (!tournament) {
      res.status(404).json({ message: "Tournament not found" });
      return;
    }
    if (tournament.seriesId !== seriesId) {
      res.status(404).json({ message: "Tournament not linked to this series" });
      return;
    }

    // Day 2 ja completed: nao pode re-bagged nem mudar stackMode.
    if (series.day2Status === "completed") {
      res.status(409).json({ message: "Day 2 already completed" });
      return;
    }

    // Resolve datetime efetiva (body sobrescreve series).
    const effectiveDateTime = bodyDateTime
      ? new Date(bodyDateTime)
      : series.day2DateTime
        ? new Date(series.day2DateTime)
        : null;

    if (!effectiveDateTime || Number.isNaN(effectiveDateTime.getTime())) {
      res.status(400).json({ message: "day2DateTime required" });
      return;
    }

    // RF-04: idempotencia — busca planned Day 2 existente para a serie.
    const existingPlanneds = await (storage as any).getPlannedBySeriesId(userId, seriesId);
    let plannedDay2: any = null;

    if (existingPlanneds && existingPlanneds.length > 0) {
      // Atualiza datetime do existente se body trouxe novo (RF-04 idempotencia).
      const target = existingPlanneds[0];
      if (bodyDateTime) {
        plannedDay2 = await (storage as any).updatePlannedTournament(target.id, {
          startTime: effectiveDateTime,
        });
      } else {
        plannedDay2 = target;
      }
    } else {
      // Cria planned Day 2 novo (D5).
      const dayOfWeek = effectiveDateTime.getUTCDay();
      const hh = String(effectiveDateTime.getUTCHours()).padStart(2, "0");
      const mm = String(effectiveDateTime.getUTCMinutes()).padStart(2, "0");
      plannedDay2 = await (storage as any).createPlannedTournament({
        userId,
        dayOfWeek,
        time: `${hh}:${mm}`,
        site: series.network ?? "Unknown",
        type: "Vanilla",
        speed: "Normal",
        name: `${series.name} — Day 2`,
        buyIn: "0",
        status: "upcoming",
        startTime: effectiveDateTime,
        seriesId,
      });
    }

    // Marca tournament.baggedAt = NOW() (substitui flightAdvanced).
    await (storage as any).setTournamentBaggedAt(tournamentId, new Date());

    // Atualiza series.day2DateTime se body trouxe valor diferente.
    let updatedSeries = series;
    if (bodyDateTime) {
      const newTs = effectiveDateTime.getTime();
      const oldTs = series.day2DateTime ? new Date(series.day2DateTime).getTime() : null;
      if (newTs !== oldTs) {
        updatedSeries = await (storage as any).updateSeries(userId, seriesId, {
          day2DateTime: effectiveDateTime,
        });
      }
    }

    res.status(200).json({ series: updatedSeries, plannedDay2 });
  } catch (err: any) {
    console.error("[handleMarkBagged] failed:", err);
    res.status(500).json({ message: "Internal error" });
  }
}

// ---------------------------------------------------------------------------
// Express registration
// ---------------------------------------------------------------------------

const seriesRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests" },
});

export function registerTournamentSeriesRoutes(app: Express): void {
  app.get("/api/tournament-series", requireAuth, seriesRateLimit, handleGetSeriesList);
  app.post("/api/tournament-series", requireAuth, seriesRateLimit, handlePostSeries);
  app.get("/api/tournament-series/:id", requireAuth, seriesRateLimit, handleGetSeriesById);
  app.patch("/api/tournament-series/:id", requireAuth, seriesRateLimit, handlePatchSeries);
  app.delete("/api/tournament-series/:id", requireAuth, seriesRateLimit, handleDeleteSeries);
  app.post(
    "/api/tournament-series/:id/mark-bagged",
    requireAuth,
    seriesRateLimit,
    handleMarkBagged,
  );
}
