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

// Sprint Bankroll-3 helpers — pending/transfer endpoints share status mapping.
function statusFor(err: any): number {
  return err?.httpStatus ?? err?.statusCode ?? 500;
}

function sendErrorWithCode(res: Response, err: any, fallback: string, logTag: string): void {
  const status = statusFor(err);
  if (status >= 500) console.error(`${logTag}:`, err);
  res.status(status).json({ message: err?.message ?? fallback, code: err?.code });
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
    // Sprint Bankroll-Reports-Detail (RF-02, D2): codes estaveis para
    // session_id_required / manual_report_no_session.
    const sessionIdIssue = parsed.error.issues.find(
      (i) => typeof i.message === "string" && i.message.includes("session_id_required"),
    );
    if (sessionIdIssue) {
      res.status(400).json({
        message: "sessionId obrigatorio quando reason=session_result",
        code: "session_id_required",
        issues: parsed.error.issues,
      });
      return;
    }
    const manualReportIssue = parsed.error.issues.find(
      (i) => typeof i.message === "string" && i.message.includes("manual_report_no_session"),
    );
    if (manualReportIssue) {
      res.status(400).json({
        message: "manual_report nao aceita sessionId — use session_result para deltas vinculados a sessao",
        code: "manual_report_no_session",
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
      occurredAt: parsed.data.occurredAt ?? new Date(),
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

// =============================================================================
// Sprint Bankroll-Reports-Detail (RF-06) — GET /api/wallets/balance-snapshot-pair
// ADR-070
// =============================================================================

export async function handleGetBalanceSnapshotPair(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const q = req.query ?? {};
  const fromRaw = q.from;
  const toRaw = q.to;
  if (!fromRaw || !toRaw) {
    res.status(400).json({ message: "from e to obrigatorios (ISO 8601)" });
    return;
  }
  const from = new Date(String(fromRaw));
  const to = new Date(String(toRaw));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    res.status(400).json({ message: "from/to invalidos (use ISO 8601)" });
    return;
  }
  try {
    const sessionId = q.sessionId ? String(q.sessionId) : undefined;
    const result = await (walletService as any).getBalanceSnapshotPair(userId, {
      from,
      to,
      sessionId,
    });
    res.status(200).json(result);
  } catch (err: any) {
    const status = mapErrorToStatus(err);
    if (status === 500) console.error("GET /api/wallets/balance-snapshot-pair failed:", err);
    res.status(status).json({ message: err?.message ?? "Erro ao buscar snapshot pair" });
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
  // MEDIUM-3 fix (audit 2026-05-05): aumentado de 10 para 20 req/min.
  // Fluxo de reconcile com 8 wallets pode bater 5-7 calls em 30s
  // (pre-fetch + retries + cooldown logId GET + final POST).
  windowMs: 60_000,
  max: 20,
  keyGenerator: (req: any) => req.user?.userPlatformId || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Muitas requisicoes de carteira. Tente novamente em 1 minuto." },
});

// =============================================================================
// Sprint Bankroll-3 RF-4 — Transfers
// =============================================================================

function mapTransferError(err: any): { status: number; body: any } {
  const status = err?.httpStatus ?? err?.statusCode ?? 500;
  const body: any = { message: err?.message ?? "Transfer error" };
  if (err?.code) body.code = err.code;
  if (err?.providedRate != null) body.providedRate = err.providedRate;
  if (err?.marketRate != null) body.marketRate = err.marketRate;
  if (err?.diffPct != null) body.diffPct = err.diffPct;
  return { status, body };
}

export async function handlePostWalletTransfer(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }

  const body = req.body ?? {};
  if (!body.fromWalletId || !body.toWalletId) {
    res.status(400).json({ message: "fromWalletId e toWalletId obrigatorios" });
    return;
  }
  if (body.fromWalletId === body.toWalletId) {
    res.status(400).json({ message: "fromWalletId e toWalletId devem ser diferentes" });
    return;
  }
  const amountFrom = typeof body.amountFrom === "string" ? parseFloat(body.amountFrom) : body.amountFrom;
  if (!Number.isFinite(amountFrom) || amountFrom <= 0) {
    res.status(400).json({ message: "amountFrom deve ser maior que zero" });
    return;
  }
  if (!body.reason) {
    res.status(400).json({ message: "reason obrigatorio" });
    return;
  }

  try {
    const confirmFxDiff = req.query?.confirmFxDiff === "true" || body.confirmFxDiff === true;
    const result = await (walletService as any).createTransfer(userId, {
      ...body,
      confirmFxDiff,
    });
    res.status(201).json(result);
  } catch (err: any) {
    const mapped = mapTransferError(err);
    if (mapped.status >= 500) console.error("POST /api/wallets/transfers failed:", err);
    res.status(mapped.status).json(mapped.body);
  }
}

export async function handleGetWalletTransfers(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  try {
    const walletId = req.query?.walletId as string | undefined;
    const limitRaw = req.query?.limit;
    let limit = 50;
    if (limitRaw != null && limitRaw !== "") {
      const n = parseInt(String(limitRaw), 10);
      if (Number.isFinite(n) && n > 0) limit = Math.min(n, 200);
    }
    const items = await (walletService as any).listTransfers(userId, { walletId, limit });
    res.status(200).json({ items });
  } catch (err: any) {
    console.error("GET /api/wallets/transfers failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao listar transferencias" });
  }
}

export async function handleGetWalletTransfer(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  try {
    const id = req.params?.id;
    if (!id) { res.status(400).json({ message: "id obrigatorio" }); return; }
    const result = await (walletService as any).getTransfer(userId, id);
    if (!result) {
      res.status(404).json({ message: "Transfer nao encontrada" });
      return;
    }
    res.status(200).json(result);
  } catch (err: any) {
    console.error("GET /api/wallets/transfers/:id failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao buscar transferencia" });
  }
}

// =============================================================================
// Sprint Bankroll-3 RF-5 — Pending transactions
// =============================================================================

export async function handlePostWalletPending(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const walletId = req.params?.walletId;
  if (!walletId) {
    res.status(400).json({ message: "walletId obrigatorio" });
    return;
  }
  const body = req.body ?? {};
  const VALID_DIRS = new Set(["deposit_pending", "withdrawal_pending"]);
  if (!body.direction || !VALID_DIRS.has(body.direction)) {
    res.status(400).json({ message: `direction invalida: ${body.direction}` });
    return;
  }
  const amount = typeof body.nativeAmount === "string" ? parseFloat(body.nativeAmount) : body.nativeAmount;
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ message: "nativeAmount deve ser maior que zero" });
    return;
  }
  if (!body.nativeCurrency) {
    res.status(400).json({ message: "nativeCurrency obrigatoria" });
    return;
  }
  if (!body.reason) {
    res.status(400).json({ message: "reason obrigatoria" });
    return;
  }
  try {
    const pending = await (walletService as any).createPending(userId, walletId, body);
    res.status(201).json(pending);
  } catch (err: any) {
    sendErrorWithCode(res, err, "Erro ao criar pending", "POST /api/wallets/:walletId/pending failed");
  }
}

export async function handleGetWalletPending(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  try {
    const walletId = req.params?.walletId;
    const includeAll = req.query?.includeAll === "true";
    const items = await (walletService as any).listPending(userId, walletId, { includeAll });
    res.status(200).json({ items });
  } catch (err: any) {
    console.error("GET /api/wallets/:walletId/pending failed:", err);
    res.status(500).json({ message: err?.message ?? "Erro ao listar pending" });
  }
}

export async function handleDeleteWalletPending(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  try {
    const result = await (walletService as any).cancelPending(userId, id);
    res.status(200).json(result);
  } catch (err: any) {
    sendErrorWithCode(res, err, "Erro ao cancelar pending", "DELETE /api/wallets/pending/:id failed");
  }
}

export async function handlePostWalletPendingSettle(req: any, res: Response): Promise<void> {
  const userId = userIdOf(req);
  if (!userId) { unauthorized(res); return; }
  const id = req.params?.id;
  try {
    const result = await (walletService as any).settlePending(userId, id, req.body ?? {});
    res.status(200).json(result);
  } catch (err: any) {
    sendErrorWithCode(res, err, "Erro ao settle pending", "POST /api/wallets/pending/:id/settle failed");
  }
}

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

  // HIGH-1 fix (round 2): rotas com path estatico devem vir ANTES das rotas com
  // `:id`/`:walletId` para evitar collision de routing. Express aplica primeira
  // match — se `/api/wallets/:id` viesse antes, `/api/wallets/transfers`
  // seria interpretado como id="transfers".

  // Sprint Bankroll-3 RF-4 — Transfers (path-estatico antes do :id)
  app.post("/api/wallets/transfers", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handlePostWalletTransfer(req, res),
  );
  app.get("/api/wallets/transfers", requireAuth, (req: Request, res: Response) =>
    handleGetWalletTransfers(req, res),
  );
  app.get("/api/wallets/transfers/:id", requireAuth, (req: Request, res: Response) =>
    handleGetWalletTransfer(req, res),
  );

  // Sprint Bankroll-3 RF-5 — Pending (path-estatico antes do :id)
  app.delete("/api/wallets/pending/:id", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handleDeleteWalletPending(req, res),
  );
  app.post("/api/wallets/pending/:id/settle", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handlePostWalletPendingSettle(req, res),
  );

  app.get("/api/bankroll/consolidated", requireAuth, (req: Request, res: Response) =>
    handleGetBankrollConsolidated(req, res),
  );

  // Sprint Bankroll-Reports-Detail RF-06 — path estatico antes de :id
  app.get("/api/wallets/balance-snapshot-pair", requireAuth, (req: Request, res: Response) =>
    handleGetBalanceSnapshotPair(req, res),
  );

  // Rotas com :walletId/:id depois das estaticas.
  app.post("/api/wallets/:walletId/pending", requireAuth, walletLimiter, (req: Request, res: Response) =>
    handlePostWalletPending(req, res),
  );
  app.get("/api/wallets/:walletId/pending", requireAuth, (req: Request, res: Response) =>
    handleGetWalletPending(req, res),
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
}
