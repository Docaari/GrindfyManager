/**
 * Wallets Routes — Sprint Bankroll-2 (RF-09 + RF-10 + RF-11)
 *
 * Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md
 * API docs: Docs/api/wallets.md
 *
 * Endpoints:
 *   GET    /api/wallets
 *   POST   /api/wallets
 *   GET    /api/wallets/:id
 *   PUT    /api/wallets/:id
 *   PATCH  /api/wallets/:id/archive
 *   DELETE /api/wallets/:id            -> 405 Method Not Allowed
 *   GET    /api/wallets/:id/transactions
 *   POST   /api/wallets/:id/transactions
 *   GET    /api/bankroll/consolidated
 *
 * Mutacoes: rate limit 10/min por userPlatformId.
 * Reads: cache em memoria (walletCache 30s).
 */

import type { Express, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../auth";
import { walletService } from "../services/walletService";
import { WALLET_PLATFORMS, WALLET_NATIVE_CURRENCIES } from "../../shared/wallet-platforms";
import {
  WALLET_TX_DIRECTIONS,
  WALLET_TX_REASONS_P0,
  WalletTxBodyRefinedSchema,
} from "../../shared/wallet-reasons";

// =============================================================================
// Zod schemas dos handlers
// =============================================================================

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const BANKROLL_RULE_REGEX = /^(1pct|2pct|5pct|custom:\d+(\.\d+)?)$/;

const createWalletBody = z.object({
  name: z.string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1 && s.length <= 80, {
      message: "Nome deve ter entre 1 e 80 caracteres",
    }),
  platform: z.enum(WALLET_PLATFORMS),
  nativeCurrency: z.enum(WALLET_NATIVE_CURRENCIES),
  bankrollRule: z.string().regex(BANKROLL_RULE_REGEX).nullable().optional(),
  color: z.string().regex(HEX_COLOR_REGEX).nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isShotPocket: z.boolean().optional(),
  initialDeposit: z.object({
    amount: z.number().positive("Valor deve ser maior que zero"),
    note: z.string().max(500).optional(),
  }).optional(),
});

const updateWalletBody = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  color: z.string().regex(HEX_COLOR_REGEX).nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  bankrollRule: z.string().regex(BANKROLL_RULE_REGEX).nullable().optional(),
  isShotPocket: z.boolean().optional(),
}).strict().passthrough();
// Nota: passthrough() permite que campos imutaveis (nativeCurrency, platform,
// balance, status) cheguem ao handler para resposta 400 explicita.

// Validacao de occurredAt: nao pode ser no futuro (24h grace para skew).
const occurredAtSchema = z.union([z.string(), z.date()]).refine((v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return false;
  // Permite ate 24h grace para skew de timezone client/server.
  return d.getTime() < Date.now() + 24 * 60 * 60 * 1000;
}, { message: "occurredAt nao pode ser no futuro" });

// Sprint Bankroll-3 (RF-01, RF-02): usa WalletTxBodyRefinedSchema do shared
// para regra cross-field (rakeback => direction=in). Wrapper aqui apenas
// valida o future-date de occurredAt.
const txBody = WalletTxBodyRefinedSchema.superRefine((data, ctx) => {
  if (data.occurredAt != null) {
    const r = occurredAtSchema.safeParse(data.occurredAt);
    if (!r.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["occurredAt"],
        message: r.error.issues[0]?.message ?? "occurredAt invalido",
      });
    }
  }
});

// =============================================================================
// Helpers
// =============================================================================

function userIdOf(req: any): string | null {
  return req?.user?.userPlatformId ?? null;
}

function unauthorized(res: Response) {
  return res.status(401).json({ message: "Unauthorized" });
}

function mapErrorToStatus(err: any): number {
  if (err?.statusCode && typeof err.statusCode === "number") return err.statusCode;
  return 500;
}

// =============================================================================
// Handlers
// =============================================================================

export async function handleGetWallets(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  try {
    const includeArchivedRaw = req.query?.includeArchived;
    const includeArchived =
      includeArchivedRaw === true || includeArchivedRaw === "true" || includeArchivedRaw === 1 || includeArchivedRaw === "1";
    const wallets = await walletService.listWallets(userId, { includeArchived });
    const consolidated = await walletService.getConsolidatedBalance(userId);
    const warnings: string[] = [];
    const activeCount = wallets.filter((w: any) => w.status === "active").length;
    if (activeCount >= 20) warnings.push("approaching_wallet_limit");
    res.status(200).json({ wallets, consolidated, warnings });
  } catch (err: any) {
    console.error("GET /api/wallets failed:", err);
    res.status(mapErrorToStatus(err)).json({ message: err?.message ?? "Erro ao listar carteiras" });
  }
}

export async function handlePostWallet(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const parsed = createWalletBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }
  try {
    const result = await walletService.createWallet(userId, parsed.data as any);
    res.status(201).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    console.error("POST /api/wallets failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao criar carteira" });
  }
}

export async function handleGetWallet(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }
  try {
    const result = await walletService.getWallet(userId, id);
    if (!result) {
      res.status(404).json({ message: "Carteira nao encontrada" });
      return;
    }
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("GET /api/wallets/:id failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao buscar carteira" });
  }
}

export async function handlePutWallet(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }

  const body = req.body ?? {};
  // Imutaveis: detectar antes de validar shape.
  for (const k of ["nativeCurrency", "platform", "balance", "status"]) {
    if (k in body) {
      res.status(400).json({
        message: `Campo ${k} e imutavel apos criacao da carteira (campo nao permitido)`,
      });
      return;
    }
  }

  const parsed = updateWalletBody.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }
  try {
    const result = await walletService.updateWallet(userId, id, parsed.data as any);
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("PUT /api/wallets/:id failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao atualizar carteira" });
  }
}

export async function handlePatchArchiveWallet(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }
  try {
    const result = await walletService.archiveWallet(userId, id);
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("PATCH /api/wallets/:id/archive failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao arquivar carteira" });
  }
}

export async function handleDeleteWallet(_req: any, res: Response): Promise<void> {
  res.status(405).json({
    message: "Carteiras nao podem ser deletadas. Use PATCH /api/wallets/:id/archive para preservar historico.",
  });
}

export async function handleGetWalletTransactions(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }
  try {
    const q = req.query ?? {};
    let limit: number | undefined;
    if (q.limit != null && q.limit !== "") {
      const n = parseInt(String(q.limit), 10);
      if (!Number.isNaN(n)) limit = Math.min(Math.max(n, 1), 200);
    }
    let offset: number | undefined;
    if (q.offset != null && q.offset !== "") {
      const n = parseInt(String(q.offset), 10);
      if (!Number.isNaN(n)) offset = Math.max(n, 0);
    }
    const result = await walletService.listWalletTransactions(userId, id, {
      from: q.from,
      to: q.to,
      reason: q.reason,
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("GET /api/wallets/:id/transactions failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao listar movimentos" });
  }
}

export async function handlePostWalletTransaction(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }

  const parsed = txBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Sprint Bankroll-3 (RF-02): se issue contem 'invalid_rakeback_direction',
    // retorna code estavel para client.
    const rakebackIssue = parsed.error.issues.find(
      (i) => typeof i.message === "string" && i.message.includes("invalid_rakeback_direction"),
    );
    if (rakebackIssue) {
      res.status(400).json({
        message: "Rakeback so aceita credito (entrada)",
        code: "invalid_rakeback_direction",
        issues: parsed.error.issues,
      });
      return;
    }
    res.status(400).json({
      message: parsed.error.issues[0]?.message ?? "Body invalido",
      issues: parsed.error.issues,
    });
    return;
  }
  if (!WALLET_TX_REASONS_P0.includes(parsed.data.reason as any)) {
    res.status(400).json({
      message: "reason nao suportado em P0 (use deposit, withdrawal, session_result, manual_adjustment)",
      code: "reason_not_supported_in_p0",
    });
    return;
  }

  try {
    const result = await walletService.recordWalletTransaction(userId, id, {
      direction: parsed.data.direction,
      nativeAmount: parsed.data.nativeAmount,
      reason: parsed.data.reason,
      occurredAt: parsed.data.occurredAt,
      note: parsed.data.note ?? undefined,
      sessionId: parsed.data.sessionId ?? undefined,
      expectedPreviousBalance: parsed.data.expectedPreviousBalance,
    });
    res.status(201).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("POST /api/wallets/:id/transactions failed:", err);
    if (status === 409 && err?.code === "balance_mismatch") {
      res.status(409).json({
        message: err?.message ?? "Saldo divergente",
        code: "balance_mismatch",
        currentBalance: err.currentBalance,
      });
      return;
    }
    const payload: any = { message: err?.message ?? "Erro ao registrar movimento" };
    if (err?.code) payload.code = err.code;
    res.status(status).json(payload);
  }
}

export async function handleGetBankrollConsolidated(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  try {
    const result = await walletService.getConsolidatedBalance(userId);
    res.status(200).json(result);
  } catch (err: any) {
    console.error("GET /api/bankroll/consolidated failed:", err);
    res.status(mapErrorToStatus(err)).json({ message: err?.message ?? "Erro ao consolidar banca" });
  }
}

// =============================================================================
// Rate limit
// =============================================================================

export const walletLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisicoes de carteira. Tente novamente em 1 minuto." },
});

// =============================================================================
// Express registration
// =============================================================================

export function registerWalletRoutes(app: Express): void {
  app.get("/api/wallets", requireAuth, (req: Request, res: Response) =>
    handleGetWallets(req, res),
  );
  app.post("/api/wallets", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handlePostWallet(req, res),
  );
  app.get("/api/wallets/:id", requireAuth, (req: Request, res: Response) =>
    handleGetWallet(req, res),
  );
  app.put("/api/wallets/:id", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handlePutWallet(req, res),
  );
  app.patch("/api/wallets/:id/archive", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handlePatchArchiveWallet(req, res),
  );
  app.delete("/api/wallets/:id", requireAuth, (req: Request, res: Response) =>
    handleDeleteWallet(req, res),
  );
  app.get("/api/wallets/:id/transactions", requireAuth, (req: Request, res: Response) =>
    handleGetWalletTransactions(req, res),
  );
  app.post("/api/wallets/:id/transactions", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handlePostWalletTransaction(req, res),
  );
  app.get("/api/bankroll/consolidated", requireAuth, (req: Request, res: Response) =>
    handleGetBankrollConsolidated(req, res),
  );
}
