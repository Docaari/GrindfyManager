/**
 * Sprint FX-1 RF-07: GET /api/fx/current (user-level, autenticado).
 *
 * Retorna rates resolvidos pela cascata user > system > wallets > fallback.
 * Frontend FxRatesPanel consome este endpoint.
 */

import type { Request, Response, Express } from "express";
import { resolveExchangeRates } from "../services/fxResolver";
import { requireAuth } from "../auth";

export async function handleGetFxCurrent(
  req: Request,
  res: Response,
): Promise<void> {
  const user = (req as any).user;
  if (!user) {
    res.status(401).json({ message: "Usuario nao autenticado" });
    return;
  }

  try {
    const result = await resolveExchangeRates(String(user.userPlatformId));
    res.status(200).json({
      rates: result.rates,
      source: result.source,
      fetchedAt: result.resolvedAt instanceof Date
        ? result.resolvedAt.toISOString()
        : new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[fx/current] handleGetFxCurrent failed:", err?.message);
    res
      .status(500)
      .json({ message: "Falha ao resolver FX rates", error: err?.message });
  }
}

export function registerFxRoutes(app: Express): void {
  app.get("/api/fx/current", requireAuth, handleGetFxCurrent);
}
