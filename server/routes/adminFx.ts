/**
 * Sprint FX-1 RF-06: endpoints admin /api/admin/fx/*.
 *
 * Handlers exportados para test direto. Permission gating inline (super-admin
 * por email OU subscriptionPlan='admin'), sem dependencia em requirePermission
 * middleware (tests passam handlers via makeReq/makeRes).
 *
 * Endpoints:
 *   POST /api/admin/fx/refresh   — force run cron
 *   GET  /api/admin/fx/latest    — latest rate por currency
 *   GET  /api/admin/fx/history   — paginated history
 */

import type { Request, Response, Express } from "express";
import { runFxRatesRefresh } from "../jobs/refreshFxRates";
import {
  getLatestSystemRates,
  getRateHistory,
} from "../services/fx/fxRatesPersistence";
import { isSuperAdmin } from "@shared/permissions";
import { requireAuth } from "../auth";
import { bankrollLimiter } from "./bankroll";

const SUPPORTED_CURRENCIES = new Set(["USD", "BRL", "EUR"]);

function isAdminUser(user: any): boolean {
  if (!user) return false;
  if (typeof user.email === "string" && isSuperAdmin(user.email)) return true;
  if (user.subscriptionPlan === "admin") return true;
  return false;
}

function gateAdmin(req: Request, res: Response): boolean {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ message: "Usuario nao autenticado" });
    return false;
  }
  if (!isAdminUser(user)) {
    res
      .status(403)
      .json({ message: "Acesso restrito a administradores", requiredPermission: "admin:fx" });
    return false;
  }
  return true;
}

export async function handlePostFxRefresh(
  req: Request,
  res: Response,
): Promise<void> {
  if (!gateAdmin(req, res)) return;
  try {
    const result = await runFxRatesRefresh();
    res.status(200).json({
      runId: result.runId,
      status: result.status,
      inserted: result.inserted,
      skipped: result.skipped,
      currencies_fetched: result.currencies_fetched,
      currencies_updated: result.currencies_fetched,
      currencies_failed: result.currencies_failed,
      duration_ms: result.duration_ms,
    });
  } catch (err: any) {
    console.error("[admin/fx] handlePostFxRefresh failed:", err?.message);
    res
      .status(500)
      .json({ message: "Falha ao executar refresh", error: err?.message });
  }
}

export async function handleGetFxLatest(
  req: Request,
  res: Response,
): Promise<void> {
  if (!gateAdmin(req, res)) return;
  try {
    const rates = await getLatestSystemRates();
    res.status(200).json(rates);
  } catch (err: any) {
    console.error("[admin/fx] handleGetFxLatest failed:", err?.message);
    res
      .status(500)
      .json({ message: "Falha ao buscar latest rates", error: err?.message });
  }
}

export async function handleGetFxHistory(
  req: Request,
  res: Response,
): Promise<void> {
  if (!gateAdmin(req, res)) return;

  const { currency, days, offset } = (req.query ?? {}) as Record<
    string,
    string | undefined
  >;

  if (!currency || !SUPPORTED_CURRENCIES.has(String(currency).toUpperCase())) {
    res.status(400).json({
      message: "currency obrigatorio (USD, BRL, EUR)",
      received: currency ?? null,
    });
    return;
  }
  const ccy = String(currency).toUpperCase();

  const daysNum = Number(days ?? 30);
  if (!Number.isFinite(daysNum) || daysNum <= 0) {
    res.status(400).json({ message: "days invalido" });
    return;
  }
  if (daysNum > 365) {
    res.status(400).json({ message: "days max 365" });
    return;
  }
  const offsetNum = Math.max(0, Number(offset ?? 0));

  try {
    const rows = await getRateHistory(ccy, daysNum, offsetNum);
    res.status(200).json({
      currency: ccy,
      rows,
      total: rows.length,
      offset: offsetNum,
      limit: daysNum,
    });
  } catch (err: any) {
    console.error("[admin/fx] handleGetFxHistory failed:", err?.message);
    res
      .status(500)
      .json({ message: "Falha ao buscar history", error: err?.message });
  }
}

export function registerAdminFxRoutes(app: Express): void {
  app.post("/api/admin/fx/refresh", requireAuth, bankrollLimiter, handlePostFxRefresh);
  app.get("/api/admin/fx/latest", requireAuth, bankrollLimiter, handleGetFxLatest);
  app.get("/api/admin/fx/history", requireAuth, bankrollLimiter, handleGetFxHistory);
}
