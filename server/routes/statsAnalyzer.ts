// =============================================================================
// Sprint F3 — Stats Analyzer routes
//
// Spec: Docs/specs/sprint-f3-stats-analyzer.md
// ADRs: 051 (layout schema), 052 (Coach tool integration)
// =============================================================================

import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth, requirePermission } from "../auth";
import { storage } from "../storage";
import {
  insertHudLayoutSchema,
  updateHudLayoutSchema,
  insertHudStatSnapshotSchema,
} from "@shared/schema";
import { buildSnapshotDiff } from "../services/hudStatsCompare";
import { handlePostPasteImportPreview } from "./statsAnalyzerImport";

const compareInputSchema = z.object({
  ids: z.array(z.string().min(1)).length(2),
});

export function registerStatsAnalyzerRoutes(app: Express): void {
  // ---------------------------------------------------------------------------
  // Layouts
  // ---------------------------------------------------------------------------

  app.get("/api/hud-layouts", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const layouts = await storage.getHudLayouts(userId);
      res.json(layouts);
    } catch (err) {
      console.error("[stats-analyzer] getHudLayouts failed", err);
      res.status(500).json({ message: "Falha ao listar layouts." });
    }
  });

  app.post("/api/hud-layouts", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const parsed = insertHudLayoutSchema.parse({ ...req.body, userId });
      const layout = await storage.createHudLayout(parsed);
      res.status(201).json(layout);
    } catch (err: any) {
      if (err?.issues) {
        return res.status(400).json({ message: "Layout invalido.", issues: err.issues });
      }
      console.error("[stats-analyzer] createHudLayout failed", err);
      res.status(500).json({ message: "Falha ao criar layout." });
    }
  });

  app.put("/api/hud-layouts/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const patch = updateHudLayoutSchema.parse(req.body);
      const updated = await storage.updateHudLayout(req.params.id, userId, patch);
      if (!updated) return res.status(404).json({ message: "Layout nao encontrado." });
      res.json(updated);
    } catch (err: any) {
      if (err?.issues) {
        return res.status(400).json({ message: "Patch invalido.", issues: err.issues });
      }
      console.error("[stats-analyzer] updateHudLayout failed", err);
      res.status(500).json({ message: "Falha ao atualizar layout." });
    }
  });

  app.delete("/api/hud-layouts/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const ok = await storage.deleteHudLayout(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: "Layout nao encontrado." });
      res.status(204).send();
    } catch (err) {
      console.error("[stats-analyzer] deleteHudLayout failed", err);
      res.status(500).json({ message: "Falha ao remover layout." });
    }
  });

  // ---------------------------------------------------------------------------
  // Snapshots
  // ---------------------------------------------------------------------------

  app.get("/api/hud-stat-snapshots", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const layoutId =
        typeof req.query.layoutId === "string" ? req.query.layoutId : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const rows = await storage.getHudStatSnapshots(userId, { layoutId, limit });
      res.json(rows);
    } catch (err) {
      console.error("[stats-analyzer] getHudStatSnapshots failed", err);
      res.status(500).json({ message: "Falha ao listar snapshots." });
    }
  });

  // -------------------------------------------------------------------------
  // Sprint Stats-V2 — Paste import preview (RF-05)
  //
  // POST /api/hud-stat-snapshots/preview
  // Rate limited 30 req/min/IP (paste eh barato, mas evita abuso CPU).
  // Registrado ANTES de /:id para nao colidir com catch-all.
  // -------------------------------------------------------------------------
  const previewRateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Muitas requisicoes de preview. Aguarde um minuto." },
  });

  app.post(
    "/api/hud-stat-snapshots/preview",
    requireAuth,
    requirePermission("studies"),
    previewRateLimiter,
    handlePostPasteImportPreview,
  );

  app.get("/api/hud-stat-snapshots/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const row = await storage.getHudStatSnapshot(req.params.id, userId);
      if (!row) return res.status(404).json({ message: "Snapshot nao encontrado." });
      res.json(row);
    } catch (err) {
      console.error("[stats-analyzer] getHudStatSnapshot failed", err);
      res.status(500).json({ message: "Falha ao obter snapshot." });
    }
  });

  app.post("/api/hud-stat-snapshots", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const parsed = insertHudStatSnapshotSchema.parse({ ...req.body, userId });
      const layout = await storage.getHudLayout(parsed.layoutId, userId);
      if (!layout) {
        return res.status(404).json({ message: "Layout informado nao existe." });
      }
      const snapshot = await storage.createHudStatSnapshot(parsed);
      res.status(201).json(snapshot);
    } catch (err: any) {
      if (err?.issues) {
        return res.status(400).json({ message: "Snapshot invalido.", issues: err.issues });
      }
      console.error("[stats-analyzer] createHudStatSnapshot failed", err);
      res.status(500).json({ message: "Falha ao salvar snapshot." });
    }
  });

  app.delete("/api/hud-stat-snapshots/:id", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.userPlatformId;
      const ok = await storage.deleteHudStatSnapshot(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: "Snapshot nao encontrado." });
      res.status(204).send();
    } catch (err) {
      console.error("[stats-analyzer] deleteHudStatSnapshot failed", err);
      res.status(500).json({ message: "Falha ao remover snapshot." });
    }
  });

  // ---------------------------------------------------------------------------
  // Compare
  // ---------------------------------------------------------------------------

  app.post(
    "/api/hud-stat-snapshots/compare",
    requireAuth,
    async (req: any, res) => {
      try {
        const userId = req.user.userPlatformId;
        const { ids } = compareInputSchema.parse(req.body);
        const [a, b] = await Promise.all([
          storage.getHudStatSnapshot(ids[0], userId),
          storage.getHudStatSnapshot(ids[1], userId),
        ]);
        if (!a || !b) {
          return res.status(404).json({ message: "Snapshot nao encontrado." });
        }
        if (a.layoutId !== b.layoutId) {
          return res
            .status(400)
            .json({ message: "Snapshots devem usar o mesmo layout." });
        }
        const layout = await storage.getHudLayout(a.layoutId, userId);
        if (!layout) {
          return res.status(404).json({ message: "Layout nao encontrado." });
        }
        res.json(buildSnapshotDiff(layout, a, b));
      } catch (err: any) {
        if (err?.issues) {
          return res
            .status(400)
            .json({ message: "Body invalido.", issues: err.issues });
        }
        console.error("[stats-analyzer] compare failed", err);
        res.status(500).json({ message: "Falha ao comparar snapshots." });
      }
    },
  );
}
