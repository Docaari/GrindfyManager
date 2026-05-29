// =============================================================================
// Sprint VR-1 — server/routes/primedope.ts (RF-02)
//
// Spec  : Docs/specs/sprint-variance-reform.md (RF-02)
// ADR   : 211 (variance native monte carlo engine)
//
// Endpoints:
//   POST   /api/primedope/simulate  — backward-compat alias
//   POST   /api/variance/simulate   — canonical (same handler, mounted twice)
//   GET    /api/primedope/runs
//   POST   /api/primedope/runs/:id/pin
//   DELETE /api/primedope/runs/:id/pin
//   GET    /api/primedope/buckets-prefill
//
// Removed (RF-05): chart proxy route, rate limiting, external fetch.
// =============================================================================

import { Router, type Response } from "express";
import { z } from "zod";
import { nanoid } from "nanoid";
import { requireAuth } from "../auth";
import { storage } from "../storage";
import { runMonteCarloSimulation } from "../services/varianceEngine";
import {
  computeInputHash,
  buildHashableInput,
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

function userIdFrom(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

// ---------------------------------------------------------------------------
// Schemas Zod — new native format (VarianceSimulationInput)
// ---------------------------------------------------------------------------

// ADR-215 D6/D7: placesPaidPct + rakePct opcionais por grupo
const groupSchema = z.object({
  name: z.string().min(1),
  buyIn: z.number().positive(),
  field: z.number().int().min(2).max(100000),
  roi: z.number(),
  count: z.number().int().positive().max(50000),
  isPKO: z.boolean(),
  placesPaidPct: z.number().min(0.05).max(0.5).optional(),
  rakePct: z.number().min(0).max(0.5).optional(),
  // ADR-217: estrutura de payout + re-entry (bullets médios por torneio)
  payoutStructure: z
    .enum(["standard", "flat", "topheavy", "satellite"])
    .optional(),
  avgEntries: z.number().min(1).max(10).optional(),
});

const varianceSimulateBodySchema = z.object({
  groups: z.array(groupSchema).min(1).max(20),
  weeks: z.number().int().refine((v) => [1, 4, 12, 52].includes(v), {
    message: "weeks deve ser 1, 4, 12 ou 52",
  }),
  simulations: z.number().int().optional(),
  seed: z.number().optional(),
  bankrollUsd: z.number().positive().optional(), // ADR-215 D2: habilita RoR
});

// ---------------------------------------------------------------------------
// POST /simulate — native Monte Carlo engine (RF-02)
// ---------------------------------------------------------------------------

router.post("/simulate", requireAuth, async (req: any, res: Response) => {
  const userId = userIdFrom(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let parsed: z.infer<typeof varianceSimulateBodySchema>;
  try {
    parsed = varianceSimulateBodySchema.parse(req.body);
  } catch (err: any) {
    return res
      .status(400)
      .json({ message: "Payload invalido.", issues: err?.issues ?? [] });
  }

  // Build hashable input and compute hash
  const hashableInput = buildHashableInput(
    { userId } as any,
    parsed as any,
    {},
  );
  const inputHash = computeInputHash(hashableInput);

  // Cache lookup (5min TTL)
  try {
    const cached = await (storage as any).findRecentPrimedopeRunByHash(
      inputHash,
      PRIMEDOPE_LIMITS.CACHE_TTL_MS / 60_000,
    );
    if (cached) {
      const resultJson = cached.resultJson ?? cached.result_json ?? {};
      return res.status(200).json({
        ...resultJson,
        source: "cache",
        inputHash,
        runId: cached.id,
        latencyMs: cached.latencyMs ?? 0,
        pinned: cached.pinned ?? false,
      });
    }
  } catch {
    // Cache lookup failed — proceed to engine
  }

  // Run native engine
  try {
    const result = runMonteCarloSimulation(parsed);

    // Persist to primedope_runs
    const expiresAt = new Date(Date.now() + 90 * 86400_000);
    const insertRow = {
      id: `pdr_${nanoid(16)}`,
      userId,
      inputHash,
      inputJson: hashableInput,
      resultJson: result,
      latencyMs: result.elapsedMs,
      source: "native" as const,
      pinned: false,
      expiresAt,
    };

    let inserted: any;
    try {
      inserted = await (storage as any).insertPrimedopeRun(insertRow);
    } catch (insertErr) {
      console.error("[variance] insertPrimedopeRun failed", insertErr);
      inserted = insertRow;
    }

    try {
      trackerEmit("variance_simulation_run", {
        userId,
        source: "native",
        inputHash,
        latencyMs: result.elapsedMs,
        simulationsRun: result.simulationsRun,
      });
    } catch {}

    return res.status(200).json({
      ...result,
      source: "native",
      inputHash,
      runId: inserted?.id ?? insertRow.id,
      pinned: false,
    });
  } catch (err: any) {
    console.error("[variance] simulate failed", err);
    return res.status(500).json({
      message: err?.message ?? "Erro interno na simulacao",
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/primedope/runs
// ---------------------------------------------------------------------------

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
