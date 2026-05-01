// =============================================================================
// Sprint F3 — Stats Analyzer routes
// Sprint Stats-V3 — extensoes RF-05..16 (OCR + 3-way compare + inline edit)
//
// Spec: Docs/specs/sprint-f3-stats-analyzer.md, docs/specs/sprint-stats-v3.md
// ADRs: 051 (layout schema), 052 (Coach tool integration), 064/065/066 (V3)
// =============================================================================

import type { Express, Request, Response } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth, requirePermission } from "../auth";
import { storage } from "../storage";
import {
  insertHudLayoutSchema,
  updateHudLayoutSchema,
  insertHudStatSnapshotSchema,
  type HudLayoutFieldEntry,
} from "@shared/schema";
import { buildSnapshotDiff } from "../services/hudStatsCompare";
import { handlePostPasteImportPreview } from "./statsAnalyzerImport";
import {
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  HUD_STAT_CATALOG,
  getStatById,
  getStatsByGroup,
  type HudGroupId,
  type StatField,
} from "../../shared/hud-stat-catalog";
import { getTrendIndicator } from "../../shared/hud-trend-indicator";
import { extractStatsFromImage } from "../services/hudOcrService";
import {
  detectMimeFromBuffer,
  extFromMime,
} from "../services/spotImageStorage/mime";

const PRO_PLANS = new Set(["pro", "premium", "trial", "lifetime", "admin"]);
const OCR_MAX_BYTES = Number(process.env.OCR_IMAGE_MAX_BYTES ?? 10 * 1024 * 1024);

function isProUser(user: any): boolean {
  if (!user) return false;
  const plan = (user.subscriptionPlan ?? user.plan ?? "free").toLowerCase();
  return PRO_PLANS.has(plan);
}

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

  // ---------------------------------------------------------------------------
  // Sprint Stats-V3 — wiring dos novos handlers (RF-05..16)
  // ---------------------------------------------------------------------------

  const ocrUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: OCR_MAX_BYTES },
  });

  const ocrRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: Number(process.env.OCR_RATE_LIMIT_PER_HOUR ?? 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Limite de OCR atingido. Tente novamente em alguns minutos." },
  });

  app.post(
    "/api/stats-analyzer/ocr-extract",
    requireAuth,
    ocrRateLimiter,
    ocrUpload.single("image"),
    handleOcrExtract,
  );

  app.get(
    "/api/stats-analyzer/snapshots/compare",
    requireAuth,
    handleCompareSnapshots,
  );

  app.put(
    "/api/stats-analyzer/snapshots/:id",
    requireAuth,
    handleUpdateSnapshotValues,
  );

  app.put(
    "/api/hud-layouts/:id/target-override",
    requireAuth,
    handleSetTargetOverride,
  );

  app.post(
    "/api/hud-layouts/:id/custom-stats",
    requireAuth,
    handleCreateCustomStat,
  );

  app.delete(
    "/api/hud-layouts/:id/custom-stats/:customId",
    requireAuth,
    handleDeleteCustomStat,
  );

  app.post(
    "/api/stats-analyzer/snapshots/from-ocr",
    requireAuth,
    handleSaveOcrSnapshot,
  );
}

// =============================================================================
// Stats-V3 handlers (exportados para teste direto — convencao do projeto)
// =============================================================================

const targetOverrideSchema = z.object({
  statId: z.string().min(1),
  min: z.number().nullable(),
  max: z.number().nullable(),
});

const customStatSchema = z.object({
  groupId: z.string().min(1),
  label: z.string().min(3).max(60),
  targetMin: z.number(),
  targetMax: z.number(),
  direction: z
    .enum(["higher_better", "lower_better", "context", "neutral"])
    .default("context"),
  unit: z.enum(["pct", "bb", "count"]).default("pct"),
});

const updateSnapshotValuesSchema = z.object({
  values: z.record(z.string().min(1), z.number().nullable()),
});

// -----------------------------------------------------------------------------
// PUT /api/hud-layouts/:id/target-override (RF-05)
// -----------------------------------------------------------------------------
export async function handleSetTargetOverride(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  if (!user?.userPlatformId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  let parsed: z.infer<typeof targetOverrideSchema>;
  try {
    parsed = targetOverrideSchema.parse(req.body);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Body invalido.", issues: err?.issues });
  }
  const { statId, min, max } = parsed;
  // null/null = remove override
  const isClear = min === null || max === null;
  if (!isClear) {
    if (typeof min !== "number" || typeof max !== "number") {
      return res.status(400).json({ message: "min/max devem ser numericos." });
    }
    if (min >= max) {
      return res.status(400).json({ message: "min deve ser menor que max." });
    }
    if (min < 0 || max > 100) {
      return res
        .status(400)
        .json({ message: "Range invalido — pct deve estar entre 0 e 100." });
    }
  }

  const layoutId = req.params.id;
  const layout = await storage.getHudLayout(layoutId, user.userPlatformId);
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }

  const fields = [...(((layout as any).fields_json ?? (layout as any).fieldsJson ?? []) as HudLayoutFieldEntry[])];
  const idx = fields.findIndex(
    (f) => f.id === statId || (f as any).statId === statId,
  );
  if (isClear) {
    if (idx >= 0) {
      const next = { ...fields[idx] };
      delete (next as any).targetOverride;
      fields[idx] = next;
    }
  } else {
    if (idx >= 0) {
      fields[idx] = {
        ...fields[idx],
        targetOverride: { min: min as number, max: max as number },
      };
    } else {
      fields.push({
        id: statId,
        targetOverride: { min: min as number, max: max as number },
      });
    }
  }

  try {
    const updated = await storage.updateHudLayout(layoutId, user.userPlatformId, {
      fields_json: fields,
    } as any);
    if (!updated) {
      return res.status(404).json({ message: "Layout nao encontrado." });
    }
    return res.json(updated);
  } catch (err) {
    console.error("[stats-v3] handleSetTargetOverride failed", err);
    return res.status(500).json({ message: "Falha ao salvar target override." });
  }
}

// -----------------------------------------------------------------------------
// POST /api/hud-layouts/:id/custom-stats (RF-07)
// -----------------------------------------------------------------------------
export async function handleCreateCustomStat(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  if (!user?.userPlatformId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  let parsed: z.infer<typeof customStatSchema>;
  try {
    parsed = customStatSchema.parse(req.body);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Body invalido.", issues: err?.issues });
  }

  const layoutId = req.params.id;
  const layout = await storage.getHudLayout(layoutId, user.userPlatformId);
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }

  // nanoid alphabet padrao: A-Za-z0-9_-. Custom stat id requer [a-z0-9]{8}.
  const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
  const { customAlphabet } = await import("nanoid");
  const customId = `custom_${customAlphabet(ALPHABET, 8)()}`;

  const newField: HudLayoutFieldEntry = {
    id: customId,
    isCustom: true,
    label: parsed.label,
    group: parsed.groupId,
    unit: parsed.unit,
    direction: parsed.direction,
    targetMin: parsed.targetMin,
    targetMax: parsed.targetMax,
  };

  const existing = (((layout as any).fields_json ?? (layout as any).fieldsJson ?? []) as HudLayoutFieldEntry[]);
  const fields = [...existing, newField];

  try {
    await storage.updateHudLayout(layoutId, user.userPlatformId, {
      fields_json: fields,
    } as any);
    return res.status(201).json(newField);
  } catch (err) {
    console.error("[stats-v3] handleCreateCustomStat failed", err);
    return res.status(500).json({ message: "Falha ao criar stat custom." });
  }
}

// -----------------------------------------------------------------------------
// DELETE /api/hud-layouts/:id/custom-stats/:customId (RF-07)
// -----------------------------------------------------------------------------
export async function handleDeleteCustomStat(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  if (!user?.userPlatformId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  const layoutId = req.params.id;
  const customId = req.params.customId;
  const layout = await storage.getHudLayout(layoutId, user.userPlatformId);
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }
  const existing = (((layout as any).fields_json ?? (layout as any).fieldsJson ?? []) as HudLayoutFieldEntry[]);
  const fields = existing.filter((f) => f.id !== customId);
  try {
    await storage.updateHudLayout(layoutId, user.userPlatformId, {
      fields_json: fields,
    } as any);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[stats-v3] handleDeleteCustomStat failed", err);
    return res.status(500).json({ message: "Falha ao remover stat custom." });
  }
}

// -----------------------------------------------------------------------------
// PUT /api/stats-analyzer/snapshots/:id (RF-06 inline edit hero value)
// -----------------------------------------------------------------------------
export async function handleUpdateSnapshotValues(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  if (!user?.userPlatformId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  let parsed: z.infer<typeof updateSnapshotValuesSchema>;
  try {
    parsed = updateSnapshotValuesSchema.parse(req.body);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Body invalido.", issues: err?.issues });
  }
  const id = req.params.id;
  const existing = await storage.getHudStatSnapshot(id, user.userPlatformId);
  if (!existing) {
    return res.status(404).json({ message: "Snapshot nao encontrado." });
  }

  // PATCH parcial: passa apenas os statIds enviados (storage faz merge).
  // Mas tests assertam Object.keys(patch.values).length === 1 quando enviamos 1
  // — entao NAO mergeamos antes de enviar; deixamos o merge para o storage.
  try {
    const updated = await storage.updateHudStatSnapshot(
      id,
      user.userPlatformId,
      { values: parsed.values },
    );
    if (!updated) {
      return res.status(404).json({ message: "Snapshot nao encontrado." });
    }
    return res.json(updated);
  } catch (err) {
    console.error("[stats-v3] handleUpdateSnapshotValues failed", err);
    return res.status(500).json({ message: "Falha ao atualizar snapshot." });
  }
}

// -----------------------------------------------------------------------------
// GET /api/stats-analyzer/snapshots/compare (RF-16)
// -----------------------------------------------------------------------------

interface CompareStat {
  id: string;
  label: string;
  target: { min: number; max: number };
  snap1Value: number | null;
  snap2Value: number | null;
  delta: number | null;
  direction: string;
  unit: string;
  status: string;
  trend: string;
  trendIcon: string | null;
}

interface CompareGroup {
  id: string;
  name: string;
  stats: CompareStat[];
}

function isOnTarget(
  value: number,
  min: number,
  max: number,
  direction: string,
): boolean {
  if (direction === "higher_better") return value >= min;
  if (direction === "lower_better") return value <= max;
  return value >= min && value <= max;
}

function classifyStatus(
  snap1Value: number | null,
  snap2Value: number | null,
  min: number,
  max: number,
  direction: string,
): string {
  if (snap1Value === null && snap2Value === null) return "both_null";
  if (snap1Value === null) return "snap1_null";
  if (snap2Value === null) return "snap2_null";
  if (direction === "context") return "context_ambiguous";
  if (direction === "neutral") return "neutral_info";
  const in1 = isOnTarget(snap1Value, min, max, direction);
  const in2 = isOnTarget(snap2Value, min, max, direction);
  if (in1 && in2) return "both_in_target";
  if (!in1 && in2) return "improving";
  if (in1 && !in2) return "regressing";
  return "both_out_target";
}

export async function handleCompareSnapshots(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  if (!user?.userPlatformId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  const userId = user.userPlatformId;
  const q = req.query as Record<string, string>;
  const snap1Id = q.snap1;
  const snap2Id = q.snap2;
  const layoutId = q.layoutId;
  if (!snap1Id || !snap2Id || !layoutId) {
    return res
      .status(400)
      .json({ message: "snap1, snap2 e layoutId sao obrigatorios." });
  }

  const [s1, s2, layout] = await Promise.all([
    storage.getHudStatSnapshot(snap1Id, userId),
    storage.getHudStatSnapshot(snap2Id, userId),
    storage.getHudLayout(layoutId, userId),
  ]);
  if (!s1 || !s2) {
    return res.status(404).json({ message: "Snapshot nao encontrado." });
  }
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }
  if (s1.layoutId !== layoutId || s2.layoutId !== layoutId) {
    return res
      .status(400)
      .json({ message: "Snapshots nao pertencem ao layout informado." });
  }

  // Auto-reorder por captured_at: snap1 sempre mais antigo
  const t1 = new Date(s1.capturedAt).getTime();
  const t2 = new Date(s2.capturedAt).getTime();
  let snap1 = s1;
  let snap2 = s2;
  if (t1 > t2) {
    snap1 = s2;
    snap2 = s1;
  }

  // Build override + custom map
  const fields = (((layout as any).fields_json ??
    (layout as any).fieldsJson ??
    []) as HudLayoutFieldEntry[]);
  const overrideMap = new Map<string, { min: number; max: number }>();
  const customStats: HudLayoutFieldEntry[] = [];
  for (const f of fields) {
    if (f.isCustom) {
      customStats.push(f);
    } else if (f.targetOverride && typeof f.targetOverride === "object") {
      overrideMap.set(f.id, {
        min: f.targetOverride.min,
        max: f.targetOverride.max,
      });
    }
  }

  const groups: CompareGroup[] = [];
  let snap1OffTarget = 0;
  let snap2OffTarget = 0;
  let improvingCount = 0;
  let regressingCount = 0;
  let stableCount = 0;

  for (const groupId of HUD_GROUP_IDS) {
    const stats: CompareStat[] = [];
    const catalogStats = getStatsByGroup(groupId);
    const groupCustoms = customStats.filter((c) => c.group === groupId);
    const allFields: Array<{
      id: string;
      label: string;
      min: number;
      max: number;
      direction: string;
      unit: string;
    }> = [];
    for (const stat of catalogStats) {
      const ov = overrideMap.get(stat.id);
      allFields.push({
        id: stat.id,
        label: stat.label,
        min: ov?.min ?? stat.targetMin,
        max: ov?.max ?? stat.targetMax,
        direction: stat.direction,
        unit: stat.unit,
      });
    }
    for (const c of groupCustoms) {
      allFields.push({
        id: c.id,
        label: c.label ?? c.id,
        min: c.targetMin ?? 0,
        max: c.targetMax ?? 100,
        direction: c.direction ?? "context",
        unit: c.unit ?? "pct",
      });
    }

    for (const f of allFields) {
      const v1 = (snap1.values as any)?.[f.id];
      const v2 = (snap2.values as any)?.[f.id];
      const snap1Value = typeof v1 === "number" ? v1 : null;
      const snap2Value = typeof v2 === "number" ? v2 : null;
      const delta =
        snap1Value !== null && snap2Value !== null
          ? +(snap2Value - snap1Value).toFixed(4)
          : null;
      const status = classifyStatus(
        snap1Value,
        snap2Value,
        f.min,
        f.max,
        f.direction,
      );
      const trend = getTrendIndicator(
        f.direction as any,
        snap1Value,
        snap2Value,
        f.unit as any,
      );
      const trendIcon = trend ? trend.icon : null;
      const trendKind = trend ? trend.kind : "n_a";

      // Off-target counters
      if (snap1Value !== null && !isOnTarget(snap1Value, f.min, f.max, f.direction)) {
        snap1OffTarget += 1;
      }
      if (snap2Value !== null && !isOnTarget(snap2Value, f.min, f.max, f.direction)) {
        snap2OffTarget += 1;
      }
      if (status === "improving") improvingCount += 1;
      else if (status === "regressing") regressingCount += 1;
      else stableCount += 1;

      stats.push({
        id: f.id,
        label: f.label,
        target: { min: f.min, max: f.max },
        snap1Value,
        snap2Value,
        delta,
        direction: f.direction,
        unit: f.unit,
        status,
        trend: trendKind,
        trendIcon,
      });
    }

    groups.push({
      id: groupId,
      name: HUD_GROUP_LABELS[groupId],
      stats,
    });
  }

  return res.json({
    layoutId,
    snap1: {
      id: snap1.id,
      capturedAt: snap1.capturedAt,
      captureMethod:
        (snap1 as any).captureMethod ?? (snap1 as any).source ?? "manual",
      sampleSize: snap1.sampleSize ?? null,
    },
    snap2: {
      id: snap2.id,
      capturedAt: snap2.capturedAt,
      captureMethod:
        (snap2 as any).captureMethod ?? (snap2 as any).source ?? "manual",
      sampleSize: snap2.sampleSize ?? null,
    },
    groups,
    summary: {
      snap1OffTarget,
      snap2OffTarget,
      improvingCount,
      regressingCount,
      stableCount,
    },
  });
}

// -----------------------------------------------------------------------------
// POST /api/stats-analyzer/ocr-extract (RF-08, RF-09)
// -----------------------------------------------------------------------------
export async function handleOcrExtract(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  if (!user?.userPlatformId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  if (!isProUser(user)) {
    return res.status(403).json({
      message:
        "Recurso disponivel apenas para usuarios Pro. Faca upgrade para extrair OCR.",
    });
  }

  const file = (req as any).file as
    | { buffer: Buffer; size: number; mimetype?: string; originalname?: string }
    | undefined;
  if (!file || !file.buffer) {
    return res.status(400).json({ message: "Arquivo de imagem ausente." });
  }
  if (file.size > OCR_MAX_BYTES) {
    return res
      .status(413)
      .json({ message: "Imagem maior que 10MB. Reduza e tente novamente." });
  }

  // Magic bytes detection (Content-Type ignorado — lesson F2).
  // detectMimeFromBuffer/extFromMime importados do submodulo 'mime' que NAO eh
  // mockado pelos testes (apenas o index com spotImageStorage eh).
  const detected = detectMimeFromBuffer(file.buffer);
  if (!detected) {
    return res.status(422).json({
      message: "Imagem invalida ou corrompida. Use PNG, JPEG ou WEBP.",
    });
  }

  // Check ANTHROPIC_API_KEY upfront
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({
      message:
        "Servico de OCR (Coach AI) nao configurado. ANTHROPIC_API_KEY ausente — feature indisponivel.",
    });
  }

  // Validate layout ownership
  const layoutId = (req.body as any)?.layoutId;
  if (!layoutId) {
    return res
      .status(400)
      .json({ message: "Selecione um layout antes de extrair OCR." });
  }
  const layout = await storage.getHudLayout(layoutId, user.userPlatformId);
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }

  // Persist image — lazy import do storage para nao quebrar mock factory dos testes.
  const ext = extFromMime(detected);
  const spotImageStorageMod = await import("../services/spotImageStorage");
  let storedKey: string;
  try {
    const result = await spotImageStorageMod.spotImageStorage.put({
      userId: user.userPlatformId,
      sessionId: "hud-snapshots",
      ext,
      buffer: file.buffer,
      mime: detected,
    });
    storedKey = result.key;
  } catch (err) {
    console.error("[stats-v3] hud-ocr-storage-failed", err);
    return res
      .status(500)
      .json({ message: "Falha ao salvar imagem para OCR." });
  }

  // Extract — passing cache lookup that scans existing snapshots for SHA match
  let serviceResult;
  try {
    serviceResult = await extractStatsFromImage({
      buffer: file.buffer,
      mime: detected,
      cacheLookup: async (sha) => {
        const snaps = await storage.getHudStatSnapshots(user.userPlatformId, {
          layoutId,
          limit: 100,
        });
        for (const s of snaps) {
          const raw = (s as any).ocr_raw_response ?? (s as any).ocrRawResponse;
          if (raw && raw.image_sha256 === sha) {
            return raw;
          }
        }
        return null;
      },
    });
  } catch (err: any) {
    console.error("[stats-v3] hud-ocr-failed", {
      userId: user.userPlatformId,
      imageKey: storedKey,
      err: err?.message ?? String(err),
    });
    return res.status(503).json({
      message: "OCR temporariamente indisponivel. Tente novamente em instantes.",
    });
  }

  // Persist audit on success (cache-or-not)
  try {
    if (typeof (storage as any).insertHudOcrAudit === "function") {
      await (storage as any).insertHudOcrAudit(user.userPlatformId);
    }
  } catch (err) {
    // audit nao bloqueia response
    console.error("[stats-v3] hud-ocr-audit-failed", err);
  }

  // Persist raw response so future cache hits work (apenas em cache miss)
  if (!serviceResult.cached) {
    try {
      await storage.createHudStatSnapshot({
        userId: user.userPlatformId,
        layoutId,
        source: "ocr-v2",
        values: Object.fromEntries(
          serviceResult.matchedStats.map((m) => [m.id, m.value]),
        ) as any,
        sampleSize: null,
        sessionId: null,
        notes: null,
      } as any);
    } catch (err) {
      console.error("[stats-v3] hud-ocr-cache-persist-failed", err);
      // nao bloqueia response
    }
  }

  return res.status(200).json({
    imageKey: storedKey,
    ocrJobId: `ocrj_${nanoid(10)}`,
    stats: serviceResult.matchedStats,
    unmatched: serviceResult.unmatchedStats,
    cached: serviceResult.cached,
  });
}

// -----------------------------------------------------------------------------
// POST /api/stats-analyzer/snapshots/from-ocr (RF-11)
// -----------------------------------------------------------------------------
const fromOcrSchema = z.object({
  layoutId: z.string().min(1),
  imageKey: z.string().min(1).optional(),
  values: z.record(z.string(), z.number().nullable()),
  ocrConfidence: z.record(z.string(), z.number()).optional(),
  ocrRawResponse: z.unknown().optional(),
  capturedAt: z.union([z.string(), z.date()]).optional(),
});

export async function handleSaveOcrSnapshot(
  req: Request,
  res: Response,
): Promise<any> {
  const user = (req as any).user;
  if (!user?.userPlatformId) {
    return res.status(401).json({ message: "Nao autorizado." });
  }
  let parsed: z.infer<typeof fromOcrSchema>;
  try {
    parsed = fromOcrSchema.parse(req.body);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Body invalido.", issues: err?.issues });
  }
  const layout = await storage.getHudLayout(parsed.layoutId, user.userPlatformId);
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }
  try {
    const snap = await storage.createHudStatSnapshot({
      userId: user.userPlatformId,
      layoutId: parsed.layoutId,
      source: "ocr-v2",
      values: parsed.values as any,
      sampleSize: null,
      sessionId: null,
      notes: null,
      capturedAt: parsed.capturedAt
        ? new Date(parsed.capturedAt as any)
        : undefined,
    } as any);
    // Patch capture-method via update (storage createHudStatSnapshot nao seta)
    if (typeof (storage as any).updateHudStatSnapshot === "function") {
      try {
        await (storage as any).updateHudStatSnapshot(
          (snap as any).id,
          user.userPlatformId,
          {
            captureMethod: "ocr",
            sourceImageKey: parsed.imageKey ?? null,
            ocrConfidence: parsed.ocrConfidence ?? null,
            ocrRawResponse: parsed.ocrRawResponse ?? null,
          },
        );
      } catch (err) {
        console.error("[stats-v3] from-ocr patch failed", err);
      }
    }
    return res.status(201).json({ ...snap, captureMethod: "ocr" });
  } catch (err) {
    console.error("[stats-v3] handleSaveOcrSnapshot failed", err);
    return res.status(500).json({ message: "Falha ao salvar snapshot OCR." });
  }
}
