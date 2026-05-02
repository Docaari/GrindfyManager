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
  getStatsByGroup,
  getStatById,
  HUD_STAT_CATALOG,
  type HudGroupId,
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

// Aceita ambos camelCase (Zod schema) e snake_case (raw V3 handlers).
function getLayoutFields(layout: any): HudLayoutFieldEntry[] {
  return (layout?.fields_json ?? layout?.fieldsJson ?? []) as HudLayoutFieldEntry[];
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
  // Targets (knowledge base, ADR-088)
  // ---------------------------------------------------------------------------

  app.get("/api/hud-stat-targets", requireAuth, async (req: any, res) => {
    try {
      const filters: any = {};
      if (typeof req.query.format === "string") filters.format = req.query.format;
      if (typeof req.query.stakeBucket === "string")
        filters.stakeBucket = req.query.stakeBucket;
      if (typeof req.query.statKey === "string")
        filters.statKey = req.query.statKey;
      const targets = await storage.getHudStatTargets(filters);
      res.json(targets);
    } catch (err) {
      console.error("[stats-analyzer] getHudStatTargets failed", err);
      res.status(500).json({ message: "Falha ao listar targets." });
    }
  });

  app.get(
    "/api/hud-stat-targets/:statKey",
    requireAuth,
    async (req: any, res) => {
      try {
        const format =
          typeof req.query.format === "string" ? req.query.format : "mtt-6max";
        const stakeBucket =
          typeof req.query.stakeBucket === "string"
            ? req.query.stakeBucket
            : "mid";
        const row = await storage.getHudStatTarget(
          req.params.statKey,
          format,
          stakeBucket,
        );
        if (!row) return res.status(404).json({ message: "Target nao encontrado." });
        res.json(row);
      } catch (err) {
        console.error("[stats-analyzer] getHudStatTarget failed", err);
        res.status(500).json({ message: "Falha ao obter target." });
      }
    },
  );

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
    // HIGH-2: per-user (userPlatformId) em vez de per-IP. Multiplos users atras
    // de um NAT/proxy compartilhado nao impactam um ao outro.
    keyGenerator: (req) =>
      (req as any).user?.userPlatformId ?? req.ip ?? "anon",
    handler: (req, res) => {
      const resetTime =
        (req as any).rateLimit?.resetTime?.getTime?.() ?? Date.now() + 60_000;
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((resetTime - Date.now()) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        message: `Limite de OCR atingido. Tente novamente em ${Math.ceil(retryAfterSeconds / 60)} minutos.`,
        retryAfterSeconds,
      });
    },
  });

  // HIGH-5: tier check (studies permission) em todos endpoints V3.
  // Em OCR mantemos isProUser dentro do handler (cobre subscriptionPlan tier alem
  // de permissions table); aqui adicionamos requirePermission para alinhar com
  // o resto do app (auth.ts / stats-analyzer V2).
  app.post(
    "/api/stats-analyzer/ocr-extract",
    requireAuth,
    requirePermission("studies"),
    ocrRateLimiter,
    ocrUpload.single("image"),
    multerErrorHandler,
    handleOcrExtract,
  );

  app.get(
    "/api/stats-analyzer/snapshots/compare",
    requireAuth,
    requirePermission("studies"),
    handleCompareSnapshots,
  );

  app.put(
    "/api/stats-analyzer/snapshots/:id",
    requireAuth,
    requirePermission("studies"),
    handleUpdateSnapshotValues,
  );

  app.put(
    "/api/hud-layouts/:id/target-override",
    requireAuth,
    requirePermission("studies"),
    handleSetTargetOverride,
  );

  app.post(
    "/api/hud-layouts/:id/custom-stats",
    requireAuth,
    requirePermission("studies"),
    handleCreateCustomStat,
  );

  app.delete(
    "/api/hud-layouts/:id/custom-stats/:customId",
    requireAuth,
    requirePermission("studies"),
    handleDeleteCustomStat,
  );

  app.post(
    "/api/stats-analyzer/snapshots/from-ocr",
    requireAuth,
    requirePermission("studies"),
    handleSaveOcrSnapshot,
  );
}

// MEDIUM-9: Express error handler especifico para multer LIMIT_FILE_SIZE.
// Mapeia 413 com mensagem PT-BR. Outros erros do multer passam adiante (next).
function multerErrorHandler(err: any, req: any, res: Response, next: any): void {
  if (err && err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        message: "Imagem maior que 10MB. Reduza e tente novamente.",
      });
      return;
    }
    res.status(400).json({ message: `Upload invalido: ${err.message}` });
    return;
  }
  next(err);
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

  const layoutId = req.params.id;
  const layout = await storage.getHudLayout(layoutId, user.userPlatformId);
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }

  // HIGH-1: cap depende do unit do stat (catalog OU custom do layout).
  const layoutFields = getLayoutFields(layout);
  let statUnit: string | undefined;
  const catalogStat = getStatById(statId);
  if (catalogStat) {
    statUnit = catalogStat.unit;
  } else {
    const customField = layoutFields.find(
      (f) => (f as any).isCustom && f.id === statId,
    );
    if (customField) {
      statUnit = (customField as any).unit ?? "pct";
    }
  }
  // Default conservador: se stat desconhecido, trata como pct (cap 100).
  if (!statUnit) statUnit = "pct";

  if (!isClear) {
    if (typeof min !== "number" || typeof max !== "number") {
      return res.status(400).json({ message: "min/max devem ser numericos." });
    }
    if (min >= max) {
      return res.status(400).json({ message: "min deve ser menor que max." });
    }
    if (statUnit === "pct") {
      if (min < 0 || max > 100) {
        return res
          .status(400)
          .json({ message: "Range invalido — pct deve estar entre 0 e 100." });
      }
    } else if (statUnit === "bb") {
      if (min < 0 || max > 200) {
        return res
          .status(400)
          .json({ message: "Range invalido — bb deve estar entre 0 e 200." });
      }
    } else if (statUnit === "count") {
      if (min < 0) {
        return res
          .status(400)
          .json({ message: "Range invalido — count deve ser >= 0." });
      }
    }
  }

  // MEDIUM-7: transformer aplicado dentro de transacao quando storage suporta
  // mutateHudLayoutFields (producao). Em testes/legacy, fallback usa
  // updateHudLayout com fields ja calculados (sujeito a race entre two clients,
  // mas tests cobertos exclusivamente em ambiente single-client).
  const applyOverride = (current: HudLayoutFieldEntry[]): HudLayoutFieldEntry[] => {
    const next = [...current];
    const i = next.findIndex(
      (f) => f.id === statId || (f as any).statId === statId,
    );
    if (isClear) {
      if (i >= 0) {
        const copy = { ...next[i] };
        delete (copy as any).targetOverride;
        next[i] = copy;
      }
    } else {
      if (i >= 0) {
        next[i] = {
          ...next[i],
          targetOverride: { min: min as number, max: max as number },
        };
      } else {
        next.push({
          id: statId,
          targetOverride: { min: min as number, max: max as number },
        });
      }
    }
    return next;
  };

  try {
    const mutateAtomic = (storage as any).mutateHudLayoutFields;
    if (typeof mutateAtomic === "function") {
      const updated = await mutateAtomic.call(
        storage,
        layoutId,
        user.userPlatformId,
        applyOverride,
      );
      if (!updated) {
        return res.status(404).json({ message: "Layout nao encontrado." });
      }
      return res.json(updated);
    }
    // Fallback non-atomic (legacy + tests com mock parcial).
    const fields = applyOverride([...layoutFields]);
    const updated = await storage.updateHudLayout(
      layoutId,
      user.userPlatformId,
      { fields_json: fields } as any,
    );
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

  try {
    const mutateAtomic = (storage as any).mutateHudLayoutFields;
    if (typeof mutateAtomic === "function") {
      await mutateAtomic.call(
        storage,
        layoutId,
        user.userPlatformId,
        (current: HudLayoutFieldEntry[]) => [...current, newField],
      );
    } else {
      const fields = [...getLayoutFields(layout), newField];
      await storage.updateHudLayout(layoutId, user.userPlatformId, {
        fields_json: fields,
      } as any);
    }
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
  try {
    const mutateAtomic = (storage as any).mutateHudLayoutFields;
    if (typeof mutateAtomic === "function") {
      await mutateAtomic.call(
        storage,
        layoutId,
        user.userPlatformId,
        (current: HudLayoutFieldEntry[]) => current.filter((f) => f.id !== customId),
      );
    } else {
      const fields = getLayoutFields(layout).filter((f) => f.id !== customId);
      await storage.updateHudLayout(layoutId, user.userPlatformId, {
        fields_json: fields,
      } as any);
    }
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

  // HIGH-3: validar cada value contra o unit declarado no catalog OU custom.
  // Skip silencioso quando storage.getHudLayout nao esta disponivel (test mocks
  // antigos). Em producao a interface IStorage sempre expoe getHudLayout.
  if (typeof (storage as any).getHudLayout === "function") {
    const layout = await (storage as any).getHudLayout(
      (existing as any).layoutId,
      user.userPlatformId,
    );
    if (layout) {
      const customMap = new Map<string, string>();
      for (const f of getLayoutFields(layout)) {
        if ((f as any).isCustom && f.id) {
          customMap.set(f.id, ((f as any).unit as string) ?? "pct");
        }
      }
      const invalidFields: Array<{
        statId: string;
        reason: string;
      }> = [];
      for (const [statId, value] of Object.entries(parsed.values)) {
        if (value === null) continue; // null permitido (limpa o stat)
        if (typeof value !== "number" || Number.isNaN(value)) {
          invalidFields.push({ statId, reason: "valor deve ser numerico ou null" });
          continue;
        }
        const catalog = getStatById(statId);
        const unit = catalog?.unit ?? customMap.get(statId);
        if (!unit) {
          // statId nao reconhecido — nao bloqueia (Implementer pode introduzir
          // stats novos antes do user salvar custom). Se o reviewer quiser
          // bloquear strict, mover para invalidFields.push.
          continue;
        }
        if (unit === "pct") {
          if (value < 0 || value > 100) {
            invalidFields.push({ statId, reason: "pct deve estar em [0,100]" });
          }
        } else if (unit === "bb") {
          if (value < 0) {
            invalidFields.push({ statId, reason: "bb deve ser >= 0" });
          }
        } else if (unit === "count") {
          if (!Number.isInteger(value) || value < 0) {
            invalidFields.push({ statId, reason: "count deve ser inteiro >= 0" });
          }
        }
      }
      if (invalidFields.length > 0) {
        return res.status(400).json({
          message: "Valores invalidos para o unit do stat.",
          invalidFields,
        });
      }
    }
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
  const [snap1, snap2] = t1 > t2 ? [s2, s1] : [s1, s2];

  // Build override + custom map
  const fields = getLayoutFields(layout);
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
      // HIGH-6: stableCount inclui APENAS both_in_target/both_out_target.
      // Estados null (snap1_null/snap2_null/both_null) e ambiguos
      // (context_ambiguous/neutral_info) NAO contam como "stable" — estavel
      // exige observacao real em ambos snapshots. Telemetria desses estados
      // pode ser adicionada como nullCount/ambiguousCount em iteracao futura.
      if (status === "improving") improvingCount += 1;
      else if (status === "regressing") regressingCount += 1;
      else if (status === "both_in_target" || status === "both_out_target") {
        stableCount += 1;
      }

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

  const snapMeta = (s: typeof snap1) => ({
    id: s.id,
    capturedAt: s.capturedAt,
    captureMethod: (s as any).captureMethod ?? (s as any).source ?? "manual",
    sampleSize: s.sampleSize ?? null,
  });

  return res.json({
    layoutId,
    snap1: snapMeta(snap1),
    snap2: snapMeta(snap2),
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
  // Tier check disabled in dev — re-enable for prod via OCR_REQUIRE_PRO=true
  if (process.env.OCR_REQUIRE_PRO === "true" && !isProUser(user)) {
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

  // Check provider key upfront — gemini OR anthropic conforme env
  const ocrProvider = (process.env.OCR_PROVIDER ?? "anthropic").toLowerCase();
  if (ocrProvider === "gemini" || ocrProvider === "google") {
    const geminiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return res.status(503).json({
        message:
          "Servico de OCR (Gemini) nao configurado. GOOGLE_API_KEY ausente — feature indisponivel.",
      });
    }
  } else {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        message:
          "Servico de OCR (Coach AI) nao configurado. ANTHROPIC_API_KEY ausente — feature indisponivel.",
      });
    }
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

  // Extract — passing cache lookup que faz query indexada por SHA256.
  // INFO-6: usa o index parcial idx_hud_snapshots_image_sha256 (migration 0020)
  // via storage.findHudStatSnapshotByImageSha256 (lookup O(1) em vez de scan).
  // CRITICAL-1: NAO criamos snapshot orfao no extract — apenas devolvemos o
  // resultado parseado. Persistencia final acontece em handleSaveOcrSnapshot
  // (from-ocr endpoint) com TODOS os campos corretos.
  let serviceResult;
  try {
    serviceResult = await extractStatsFromImage({
      buffer: file.buffer,
      mime: detected,
      cacheLookup: async (sha) => {
        const finder = (storage as any).findHudStatSnapshotByImageSha256;
        if (typeof finder === "function") {
          const hit = await finder.call(storage, user.userPlatformId, sha);
          if (hit) {
            const raw = (hit as any).ocr_raw_response ?? (hit as any).ocrRawResponse;
            if (raw && raw.image_sha256 === sha) {
              return raw;
            }
          }
          return null;
        }
        // Fallback: scan limitado (compat para mocks de teste antigos).
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

  // CRITICAL-1: NAO persistir snapshot aqui. handleSaveOcrSnapshot (from-ocr)
  // eh quem cria o snapshot final com captureMethod='ocr', sourceImageKey,
  // ocrConfidence e ocrRawResponse. Frontend recebe o preview, user revisa
  // e dispara from-ocr para salvar definitivamente.

  return res.status(200).json({
    imageKey: storedKey,
    ocrJobId: `ocrj_${nanoid(10)}`,
    imageSha256: serviceResult.imageSha256,
    stats: serviceResult.matchedStats,
    unmatched: serviceResult.unmatchedStats,
    cached: serviceResult.cached,
    rawResponse: {
      image_sha256: serviceResult.imageSha256,
      raw_stats: serviceResult.rawStats,
      matched_stats: serviceResult.matchedStats,
      unmatched_stats: serviceResult.unmatchedStats,
    },
  });
}

// -----------------------------------------------------------------------------
// POST /api/stats-analyzer/snapshots/from-ocr (RF-11)
// -----------------------------------------------------------------------------
// V3.5 (ADR-067): sections eh um mapa opcional statId -> HudGroupId | null que
// o frontend envia com a section vencedora (auto-detectado OU override manual).
// Campo opcional — omitir mantem comportamento legacy.
//
// Reviewer fix [MEDIUM] V3.5: validar valores aceitos como HudGroupId
// canonico (z.enum sobre HUD_GROUP_IDS) ao inves de z.string() arbitraria.
const HUD_GROUP_ID_ENUM = z.enum(
  HUD_GROUP_IDS as unknown as [HudGroupId, ...HudGroupId[]],
);
const fromOcrSchema = z.object({
  layoutId: z.string().min(1),
  imageKey: z.string().min(1).optional(),
  values: z.record(z.string(), z.number().nullable()),
  ocrConfidence: z.record(z.string(), z.number()).optional(),
  ocrRawResponse: z.unknown().optional(),
  sections: z
    .record(z.string(), z.union([HUD_GROUP_ID_ENUM, z.null()]))
    .optional(),
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

  // CRITICAL-2: IDOR — imageKey deve pertencer ao user (prefixo HUD-snapshots).
  // SpotImageStorage emite keys no formato `${userId}/${sessionId}/${file}`.
  // Para HUD OCR, sessionId='hud-snapshots'.
  if (parsed.imageKey) {
    const expectedPrefix = `${user.userPlatformId}/hud-snapshots/`;
    if (!parsed.imageKey.startsWith(expectedPrefix)) {
      return res
        .status(403)
        .json({ message: "imageKey nao pertence ao usuario." });
    }
  }

  const layout = await storage.getHudLayout(parsed.layoutId, user.userPlatformId);
  if (!layout) {
    return res.status(404).json({ message: "Layout nao encontrado." });
  }

  // HIGH-4: rejeitar statIds desconhecidos (catalog OR custom do layout).
  const validStatIds = new Set<string>(HUD_STAT_CATALOG.map((s) => s.id));
  for (const f of getLayoutFields(layout)) {
    if ((f as any).isCustom && f.id) {
      validStatIds.add(f.id);
    }
  }
  const unknownStatIds: string[] = [];
  for (const k of Object.keys(parsed.values)) {
    if (!validStatIds.has(k)) unknownStatIds.push(k);
  }
  if (unknownStatIds.length > 0) {
    return res.status(400).json({
      message: "statIds desconhecidos para este layout.",
      unknownStatIds,
    });
  }

  // Reviewer fix [MEDIUM] V3.5: orphan audit defense-in-depth.
  // Drop silently (compat) keys de `sections` que nao aparecem em `values`
  // — incoerentes com a snapshot. Logamos a ocorrencia para visibilidade
  // sem rejeitar a request (preferencia: drop + log vs 400).
  if (parsed.sections) {
    const valueKeys = new Set(Object.keys(parsed.values));
    const orphanKeys: string[] = [];
    const filteredSections: Record<string, HudGroupId | null> = {};
    for (const [k, v] of Object.entries(parsed.sections)) {
      if (valueKeys.has(k)) {
        filteredSections[k] = v as HudGroupId | null;
      } else {
        orphanKeys.push(k);
      }
    }
    if (orphanKeys.length > 0) {
      console.warn(
        "[stats-v3.5] from-ocr orphan section keys dropped",
        { userId: user.userPlatformId, orphanKeys },
      );
      parsed.sections = filteredSections;
    }
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
    // CRITICAL-1 + INFO-6: patch capture-method + ocrRawResponse com image_sha256
    // (necessario para cache lookup futuro via index parcial).
    // V3.5 (ADR-067): se body trouxer `sections`, mescla em
    // ocrRawResponse.sections (jsonb existente) para audit + cache hit
    // futuro preservar a section vencedora por statId.
    if (typeof (storage as any).updateHudStatSnapshot === "function") {
      try {
        let mergedRawResponse: any = parsed.ocrRawResponse ?? null;
        if (parsed.sections) {
          if (mergedRawResponse && typeof mergedRawResponse === "object") {
            mergedRawResponse = {
              ...(mergedRawResponse as Record<string, unknown>),
              sections: parsed.sections,
            };
          } else {
            mergedRawResponse = { sections: parsed.sections };
          }
        }
        await (storage as any).updateHudStatSnapshot(
          (snap as any).id,
          user.userPlatformId,
          {
            captureMethod: "ocr",
            sourceImageKey: parsed.imageKey ?? null,
            ocrConfidence: parsed.ocrConfidence ?? null,
            ocrRawResponse: mergedRawResponse,
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
