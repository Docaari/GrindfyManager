/**
 * /api/library/premium — Biblioteca Premium curada (ADR-240).
 *
 * Spec : Docs/specs/premium-library.md (RF-01..RF-07)
 * ADR  : Docs/architecture/decisions/240-premium-library-curated.md
 *
 * Vitrine GLOBAL de familias de torneios promovidas por curadores (permissao
 * premium_library_curate). Leitura aberta a qualquer autenticado; escrita +
 * painel cross-user gated por requireGranularPermission (fail-closed).
 *
 * Endpoints (ordem de registro: sub-paths estaticos / 2-seg ANTES de /:id):
 *   GET    /api/library/premium                       listar (requireAuth)
 *   GET    /api/library/premium/curator/highlights    cross-user (curador)
 *   POST   /api/library/premium/import                importar (curador)
 *   POST   /api/library/premium                        promover (curador)
 *   GET    /api/library/premium/:id/details            drill-down (requireAuth)
 *   DELETE /api/library/premium/:id                    remover (curador)
 *
 * Handlers no padrao handleX(req, res, injectedStorage?) com lazy import em prod
 * (lesson #34). O guard de permissao e middleware (requireGranularPermission);
 * os handlers exigem req.user (401 sem auth) mas NAO re-checam a permissao.
 */

import type { Express, Request, Response } from "express";
import { requireAuth, requireGranularPermission } from "../auth";

const CURATE_PERMISSION = "premium_library_curate";

async function getStore(injectedStorage?: any): Promise<any> {
  if (injectedStorage) return injectedStorage;
  const mod = await import("../storage");
  return (mod as any).storage;
}

function toInt(value: any, fallback: number): number {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

// Guard comum: exige req.user (401 sem auth). Os handlers NAO re-checam a
// permissao — o middleware requireGranularPermission e a SSoT. Retorna false +
// ja responde 401 quando nao autenticado.
function requireUser(req: any, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ message: "Usuário não autenticado" });
    return false;
  }
  return true;
}

// Resposta comum da promocao (RF-01/RF-07): 409 no conflito UNIQUE, 201 no sucesso.
function respondPromotion(
  res: Response,
  result: { ok: true; row: any } | { ok: false; conflict: string },
): void {
  if (!result.ok) {
    res.status(409).json({ message: "Família já está na Biblioteca Premium", conflict: result.conflict });
    return;
  }
  res.status(201).json(result.row);
}

// =============================================================================
// GET /api/library/premium (RF-02) — listar (todos os autenticados)
// =============================================================================
export async function handleListPremium(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const site = typeof req.query?.site === "string" ? req.query.site : undefined;
    const rows = await store.listPremiumHighlights(site);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[premiumLibrary] handleListPremium failed:", err);
    res.status(500).json({ message: "Erro ao listar a Biblioteca Premium" });
  }
}

// =============================================================================
// GET /api/library/premium/:id/details (RF-03) — drill-down do viewer
// =============================================================================
export async function handlePremiumDetails(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const id = req.params?.id;
    const row = await store.getPremiumHighlight(id);
    if (!row) {
      res.status(404).json({ message: "Item Premium não encontrado" });
      return;
    }
    const viewerUserId = req.user.userPlatformId;
    const details = await store.getFamilyDetails(viewerUserId, row.familyKey);
    res.status(200).json({ ...details, highlight: row });
  } catch (err) {
    console.error("[premiumLibrary] handlePremiumDetails failed:", err);
    res.status(500).json({ message: "Erro ao abrir o detalhe Premium" });
  }
}

// =============================================================================
// POST /api/library/premium (RF-01) — promover (curador)
// =============================================================================
export async function handlePromotePremium(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const body = req.body ?? {};
  if (!body.site || !body.familyKey) {
    res.status(400).json({ message: "site e familyKey são obrigatórios" });
    return;
  }
  const store = await getStore(injectedStorage);
  try {
    const result = await store.promotePremiumHighlight({
      site: body.site,
      familyKey: body.familyKey,
      groupName: body.groupName ?? null,
      buyInTier: body.buyInTier ?? null,
      type: body.type ?? null,
      metrics: body.metrics ?? null,
      reasons: body.reasons ?? null,
      source: "library",
      curatedBy: req.user.userPlatformId,
    });
    respondPromotion(res, result);
  } catch (err) {
    console.error("[premiumLibrary] handlePromotePremium failed:", err);
    res.status(500).json({ message: "Erro ao promover à Premium" });
  }
}

// =============================================================================
// DELETE /api/library/premium/:id (RF-04) — remover (curador)
// =============================================================================
export async function handleRemovePremium(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const id = req.params?.id;
    const removed = await store.removePremiumHighlight(id);
    if (!removed) {
      res.status(404).json({ message: "Item Premium não encontrado" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[premiumLibrary] handleRemovePremium failed:", err);
    res.status(500).json({ message: "Erro ao remover da Premium" });
  }
}

// =============================================================================
// GET /api/library/premium/curator/highlights (RF-06) — painel cross-user
// =============================================================================
export async function handleCuratorHighlights(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const q = req.query ?? {};
    const params = {
      site: typeof q.site === "string" ? q.site : undefined,
      userId: typeof q.userId === "string" ? q.userId : undefined,
      limit: q.limit !== undefined ? toInt(q.limit, 50) : 50,
      offset: q.offset !== undefined ? toInt(q.offset, 0) : 0,
    };
    const result = await store.listAllUserHighlights(params);
    res.status(200).json(result);
  } catch (err) {
    console.error("[premiumLibrary] handleCuratorHighlights failed:", err);
    res.status(500).json({ message: "Erro ao listar destaques para curadoria" });
  }
}

// =============================================================================
// POST /api/library/premium/import (RF-07) — importar highlight de outra conta
// =============================================================================
export async function handleImportPremium(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const sourceHighlightId = req.body?.sourceHighlightId;
  if (!sourceHighlightId) {
    res.status(400).json({ message: "sourceHighlightId é obrigatório" });
    return;
  }
  const store = await getStore(injectedStorage);
  try {
    const source = await store.getSavedHighlightByIdAnyUser(sourceHighlightId);
    if (!source) {
      res.status(404).json({ message: "Destaque de origem não encontrado" });
      return;
    }
    const result = await store.promotePremiumHighlight({
      site: source.site,
      familyKey: source.familyKey,
      groupName: source.groupName ?? null,
      buyInTier: source.buyInTier ?? null,
      type: source.type ?? null,
      metrics: source.metrics ?? null,
      reasons: source.reasons ?? null,
      source: "import",
      curatedBy: req.user.userPlatformId,
      sourceUserId: source.userId,
      sourceHighlightId,
    });
    respondPromotion(res, result);
  } catch (err) {
    console.error("[premiumLibrary] handleImportPremium failed:", err);
    res.status(500).json({ message: "Erro ao importar para a Premium" });
  }
}

// =============================================================================
// Registro — ordem anti-colisao (Express 4 ordem-pura).
// =============================================================================
export function registerPremiumLibraryRoutes(app: Express): void {
  const curate = requireGranularPermission(CURATE_PERMISSION);

  // 1) raiz estatica.
  app.get(
    "/api/library/premium",
    requireAuth,
    (req: Request, res: Response) => handleListPremium(req, res),
  );
  // 2) sub-path estatico (ANTES de :id).
  app.get(
    "/api/library/premium/curator/highlights",
    requireAuth,
    curate,
    (req: Request, res: Response) => handleCuratorHighlights(req, res),
  );
  // 3) sub-path estatico (ANTES de :id).
  app.post(
    "/api/library/premium/import",
    requireAuth,
    curate,
    (req: Request, res: Response) => handleImportPremium(req, res),
  );
  // 4) raiz estatica (POST).
  app.post(
    "/api/library/premium",
    requireAuth,
    curate,
    (req: Request, res: Response) => handlePromotePremium(req, res),
  );
  // 5) 2 segmentos (ANTES de :id puro).
  app.get(
    "/api/library/premium/:id/details",
    requireAuth,
    (req: Request, res: Response) => handlePremiumDetails(req, res),
  );
  // 6) :id puro (por ultimo).
  app.delete(
    "/api/library/premium/:id",
    requireAuth,
    curate,
    (req: Request, res: Response) => handleRemovePremium(req, res),
  );
}
