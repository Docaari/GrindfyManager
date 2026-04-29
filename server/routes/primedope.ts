// =============================================================================
// Sprint F4 W0/W1 — server/routes/primedope.ts
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-04..RF-15, RF-23, RF-24)
// ADR-054: rate limit 1/10s/userId, cache hit nao consome rate limit.
// ADR-055: tracker.emit telemetria.
//
// Endpoints:
//   POST   /api/primedope/simulate
//   GET    /api/primedope/chart/:hash
//   GET    /api/primedope/runs
//   POST   /api/primedope/runs/:id/pin
//   DELETE /api/primedope/runs/:id/pin
//   GET    /api/primedope/buckets-prefill
// =============================================================================

import { Router, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { z } from "zod";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import {
  runSimulation,
  getChartFsPath,
} from "../services/primedopeIntegration";
import { buildBucketsPrefill } from "../services/primedopeBucketsPrefill";
import { emit as trackerEmit } from "../utils/tracker";
import {
  ALLOWED_MULTIPLIERS,
  ALLOWED_PROFILE_LETTERS,
  PRIMEDOPE_LIMITS,
} from "../../shared/primedopeDefaults";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * CRITICAL fix (reviewer): Padrao do projeto eh `req.user.userPlatformId`
 * (USER-XXXX), NAO `req.user.id`. FKs em wallets, planned_tournaments,
 * tournaments etc. apontam para `users.user_platform_id`. Outras rotas usam
 * `req.user.userPlatformId` direto (wallets.ts, bankroll.ts).
 */
function userIdFrom(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

// ---------------------------------------------------------------------------
// Rate limit em memoria (1 req / 10s / userId), skip em cache hits.
// State scoped per-Express-app via WeakMap pra evitar leak cross-tests.
// ---------------------------------------------------------------------------

interface RateLimitState {
  lastSimulateAt: Map<string, number>;
}

const rateLimitByApp = new WeakMap<object, RateLimitState>();

function getRateLimitState(req: any): RateLimitState {
  const app = req.app ?? req;
  let s = rateLimitByApp.get(app);
  if (!s) {
    s = { lastSimulateAt: new Map<string, number>() };
    rateLimitByApp.set(app, s);
  }
  return s;
}

function checkRateLimit(
  req: any,
  userId: string,
): { ok: true } | { ok: false; retryAfterMs: number } {
  const s = getRateLimitState(req);
  const last = s.lastSimulateAt.get(userId);
  if (!last) return { ok: true };
  const elapsed = Date.now() - last;
  if (elapsed >= PRIMEDOPE_LIMITS.RATE_LIMIT_PER_USER_MS) {
    return { ok: true };
  }
  return {
    ok: false,
    retryAfterMs: PRIMEDOPE_LIMITS.RATE_LIMIT_PER_USER_MS - elapsed,
  };
}

function noteSimulateCall(req: any, userId: string): void {
  getRateLimitState(req).lastSimulateAt.set(userId, Date.now());
}

function clearSimulateCall(req: any, userId: string): void {
  getRateLimitState(req).lastSimulateAt.delete(userId);
}

// ---------------------------------------------------------------------------
// Schemas Zod
// ---------------------------------------------------------------------------

const bucketSchema = z.object({
  name: z.string().min(1).optional().or(z.string()),
  network: z.string().min(1),
  count: z.number().int().positive(),
  buyinOriginal: z.number().nonnegative(),
  currency: z.string().min(2),
  playersAvg: z.number().int().min(2),
  placesPaid: z.number().int().min(1),
  rakePct: z.number().min(0).max(50),
  roiPct: z.number(),
  walletMissing: z.boolean().optional(),
}).passthrough();

const simulateBodySchema = z.object({
  profileLetter: z.enum(ALLOWED_PROFILE_LETTERS as unknown as [string, ...string[]]),
  dayOfWeek: z.number().int().min(0).max(6),
  multiplier: z
    .number()
    .int()
    .refine((v) => (ALLOWED_MULTIPLIERS as readonly number[]).includes(v), {
      message: "multiplier deve ser 1, 4, 12 ou 52",
    }),
  bankrollUsd: z.number().nonnegative(),
  buckets: z.array(bucketSchema).min(1),
  force: z.boolean().optional(),
});

const runsQuerySchema = z.object({
  profileLetter: z
    .enum(ALLOWED_PROFILE_LETTERS as unknown as [string, ...string[]])
    .optional(),
  dayOfWeek: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(0).max(6))
    .optional(),
  limit: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().int().positive().max(100))
    .optional(),
});

const SHA256_REGEX = /^[a-f0-9]{64}$/;

// ---------------------------------------------------------------------------
// POST /api/primedope/simulate
// ---------------------------------------------------------------------------

router.post("/simulate", requireAuth, async (req: any, res: Response) => {
  const userId = userIdFrom(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let parsed: z.infer<typeof simulateBodySchema>;
  try {
    parsed = simulateBodySchema.parse(req.body);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Payload invalido.", issues: err?.issues ?? [] });
  }

  const rl = checkRateLimit(req, userId);
  if (!("ok" in rl) || !rl.ok) {
    const retryAfterMs = (rl as any).retryAfterMs ?? PRIMEDOPE_LIMITS.RATE_LIMIT_PER_USER_MS;
    return res
      .status(429)
      .json({ message: "Rate limit excedido", retryAfterMs });
  }

  // Marca pre-execucao; se cache hit (source='cache'), revertemos abaixo.
  noteSimulateCall(req, userId);

  try {
    const result = await runSimulation({
      userId,
      profileLetter: parsed.profileLetter as any,
      dayOfWeek: parsed.dayOfWeek,
      multiplier: parsed.multiplier as any,
      bankrollUsd: parsed.bankrollUsd,
      buckets: parsed.buckets as any,
      force: parsed.force ?? false,
    });

    // Cache hit nao consome rate limit
    if (result.source === "cache") {
      clearSimulateCall(req, userId);
    }

    return res.status(200).json(result);
  } catch (err: any) {
    // 4xx upstream -> 502 schema change
    if (
      err?.code === "UPSTREAM_4XX" ||
      err?.errorType === "upstream_4xx_schema_change"
    ) {
      // 4xx upstream nao deve consumir rate limit (erro nao por culpa do user)
      clearSimulateCall(req, userId);
      return res.status(502).json({
        message: err?.message ?? "Upstream schema change",
        errorType: err?.errorType ?? "upstream_4xx_schema_change",
        statusCode: err?.statusCode ?? 502,
        inputHash: err?.inputHash ?? null,
        timestamp: new Date().toISOString(),
      });
    }
    // 5xx unavailable -> 503
    if (
      err?.code === "PRIMEDOPE_UNAVAILABLE" ||
      err?.errorType === "upstream_5xx_no_fallback"
    ) {
      clearSimulateCall(req, userId);
      return res.status(503).json({
        message: err?.message ?? "PrimeDope unavailable",
        errorType: err?.errorType ?? "upstream_5xx_no_fallback",
        inputHash: err?.inputHash ?? null,
        timestamp: new Date().toISOString(),
      });
    }
    // Outros erros
    console.error("[primedope] simulate failed", err);
    clearSimulateCall(req, userId);
    return res.status(500).json({
      message: err?.message ?? "Erro interno",
      errorType: err?.errorType ?? "internal_error",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/primedope/chart/:hash
// ---------------------------------------------------------------------------

// Reviewer fix HIGH #6: chart proxy precisa de auth — hash determinado a
// partir de inputs e o histograma contem dados sensiveis (bankroll axis).
router.get("/chart/:hash", requireAuth, async (req: Request, res: Response) => {
  const hash = req.params.hash ?? "";
  if (!SHA256_REGEX.test(hash)) {
    return res.status(400).json({ message: "Hash invalido." });
  }
  // Path traversal ja e prevenido pelo regex sha256.
  const fsPath = getChartFsPath(hash);
  const absPath = path.isAbsolute(fsPath)
    ? fsPath
    : path.resolve(process.cwd(), fsPath);
  return res.sendFile(absPath, (err: unknown) => {
    if (err) {
      try {
        trackerEmit("primedope_chart_proxy_miss", { hash });
      } catch {
        // ignore tracker errors
      }
      if (!res.headersSent) {
        res.status(404).json({ message: "Chart nao encontrado." });
      }
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/primedope/runs
// ---------------------------------------------------------------------------

router.get("/runs", requireAuth, async (req: any, res: Response) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  let q: z.infer<typeof runsQuerySchema>;
  try {
    q = runsQuerySchema.parse(req.query);
  } catch (err: any) {
    return res.status(400).json({ message: "Query invalida." });
  }

  const limit = q.limit ?? 20;
  try {
    const list = await (storage as any).listPrimedopeRunsForUser({
      userId,
      profileLetter: q.profileLetter,
      dayOfWeek: q.dayOfWeek,
      limit,
    });
    return res.status(200).json(list ?? []);
  } catch (err) {
    console.error("[primedope] listRuns failed", err);
    return res.status(500).json({ message: "Falha ao listar runs." });
  }
});

// ---------------------------------------------------------------------------
// POST /api/primedope/runs/:id/pin
// ---------------------------------------------------------------------------

router.post("/runs/:id/pin", requireAuth, async (req: any, res: Response) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const id = req.params.id;
  try {
    const existing = await (storage as any).getPrimedopeRunById(id);
    if (!existing) {
      return res.status(404).json({ message: "Run nao encontrado." });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Acesso negado." });
    }
    const updated = await (storage as any).setPrimedopeRunPinned({
      id,
      userId,
      pinned: true,
    });
    try {
      trackerEmit("primedope_run_pinned", { runId: id, pinned: true });
    } catch {}
    return res.status(200).json(updated ?? { id, pinned: true });
  } catch (err) {
    console.error("[primedope] pin failed", err);
    return res.status(500).json({ message: "Falha ao fixar run." });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/primedope/runs/:id/pin
// ---------------------------------------------------------------------------

router.delete("/runs/:id/pin", requireAuth, async (req: any, res: Response) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  const id = req.params.id;
  try {
    const existing = await (storage as any).getPrimedopeRunById(id);
    if (!existing) {
      return res.status(404).json({ message: "Run nao encontrado." });
    }
    if (existing.userId !== userId) {
      return res.status(403).json({ message: "Acesso negado." });
    }
    const updated = await (storage as any).setPrimedopeRunPinned({
      id,
      userId,
      pinned: false,
    });
    try {
      trackerEmit("primedope_run_pinned", { runId: id, pinned: false });
    } catch {}
    return res.status(200).json(updated ?? { id, pinned: false });
  } catch (err) {
    console.error("[primedope] unpin failed", err);
    return res.status(500).json({ message: "Falha ao desfixar run." });
  }
});

// ---------------------------------------------------------------------------
// GET /api/primedope/buckets-prefill
// ---------------------------------------------------------------------------

const bucketsPrefillQuerySchema = z.object({
  profileLetter: z.enum(ALLOWED_PROFILE_LETTERS as unknown as [string, ...string[]]),
  dayOfWeek: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(z.number().int().min(0).max(6)),
  multiplier: z
    .union([z.string(), z.number()])
    .transform((v) => Number(v))
    .pipe(
      z
        .number()
        .int()
        .refine(
          (v) => (ALLOWED_MULTIPLIERS as readonly number[]).includes(v),
          { message: "multiplier invalido" },
        ),
    )
    .optional(),
});

router.get("/buckets-prefill", requireAuth, async (req: any, res: Response) => {
  const userId = userIdFrom(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  let q: z.infer<typeof bucketsPrefillQuerySchema>;
  try {
    q = bucketsPrefillQuerySchema.parse(req.query);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Query invalida.", issues: err?.issues ?? [] });
  }

  try {
    const result = await buildBucketsPrefill({
      userId,
      profileLetter: q.profileLetter as any,
      dayOfWeek: q.dayOfWeek,
      multiplier: (q.multiplier ?? 1) as any,
    });
    return res.status(200).json({
      buckets: result.buckets,
      fxRatesUsed: result.fxRatesUsed,
      defaultsFlags: Array.from(result.defaultsFlags ?? []),
    });
  } catch (err) {
    console.error("[primedope] buckets-prefill failed", err);
    return res.status(500).json({ message: "Falha ao gerar pre-fill." });
  }
});

export default router;
