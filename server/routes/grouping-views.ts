/**
 * /api/library/grouping-views — Visões de agrupamento nomeadas (Fase 2).
 *
 * Receitas de agrupamento reutilizáveis, PRIVADAS por usuário. dims é um
 * GroupDim[] (sanitizado/canonicalizado via canonicalizeRecipe — descarta dims
 * desconhecidas, dedup, reordena). filters é um conjunto de filtros opcional.
 *
 * Handlers no padrão handleX(req, res, injectedStorage?) com lazy import em prod
 * (lesson #34). Ownership checado no storage (update/delete só do próprio user).
 * Ordem de registro: estáticas/raiz ANTES de /:id (Express 4 ordem-pura).
 */

import type { Express, Request, Response } from "express";
import type { RequestHandler } from "express";
import { canonicalizeRecipe } from "../services/libraryGrouping";
import type { GroupDim } from "@shared/library-grouping-dims";

async function getStore(injectedStorage?: any): Promise<any> {
  if (injectedStorage) return injectedStorage;
  const mod = await import("../storage");
  return (mod as any).storage;
}

function requireUser(req: any, res: Response): boolean {
  if (!req.user) {
    res.status(401).json({ message: "Usuário não autenticado" });
    return false;
  }
  return true;
}

/** Sanitiza dims do body em GroupDim[] canônico; [] se nada válido. */
function sanitizeDims(raw: unknown): GroupDim[] {
  if (!Array.isArray(raw)) return [];
  return canonicalizeRecipe(raw as GroupDim[]);
}

export async function handleListGroupingViews(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const rows = await store.listGroupingViews(req.user.userPlatformId);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[groupingViews] list failed:", err);
    res.status(500).json({ message: "Erro ao listar visões" });
  }
}

export async function handleCreateGroupingView(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const body = req.body ?? {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const dims = sanitizeDims(body.dims);
  if (!name) {
    res.status(400).json({ message: "name é obrigatório" });
    return;
  }
  if (dims.length === 0) {
    res.status(400).json({ message: "dims deve conter ao menos uma dimensão válida" });
    return;
  }
  const store = await getStore(injectedStorage);
  try {
    const row = await store.createGroupingView({
      userId: req.user.userPlatformId,
      name,
      dims,
      filters: body.filters ?? null,
    });
    res.status(201).json(row);
  } catch (err: any) {
    // UNIQUE(user_id, name) — nome de visão duplicado.
    if (err?.code === "23505") {
      res.status(409).json({ message: "Já existe uma visão com esse nome", conflict: "duplicate_name" });
      return;
    }
    console.error("[groupingViews] create failed:", err);
    res.status(500).json({ message: "Erro ao criar visão" });
  }
}

export async function handleUpdateGroupingView(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const body = req.body ?? {};
  const patch: { name?: string; dims?: GroupDim[]; filters?: any } = {};
  if (typeof body.name === "string") {
    const n = body.name.trim();
    if (!n) {
      res.status(400).json({ message: "name não pode ser vazio" });
      return;
    }
    patch.name = n;
  }
  if (body.dims !== undefined) {
    const dims = sanitizeDims(body.dims);
    if (dims.length === 0) {
      res.status(400).json({ message: "dims deve conter ao menos uma dimensão válida" });
      return;
    }
    patch.dims = dims;
  }
  if (body.filters !== undefined) patch.filters = body.filters;

  const store = await getStore(injectedStorage);
  try {
    const row = await store.updateGroupingView(req.user.userPlatformId, req.params.id, patch);
    if (!row) {
      res.status(404).json({ message: "Visão não encontrada" });
      return;
    }
    res.status(200).json(row);
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({ message: "Já existe uma visão com esse nome", conflict: "duplicate_name" });
      return;
    }
    console.error("[groupingViews] update failed:", err);
    res.status(500).json({ message: "Erro ao atualizar visão" });
  }
}

export async function handleDeleteGroupingView(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const ok = await store.deleteGroupingView(req.user.userPlatformId, req.params.id);
    if (!ok) {
      res.status(404).json({ message: "Visão não encontrada" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[groupingViews] delete failed:", err);
    res.status(500).json({ message: "Erro ao remover visão" });
  }
}

export function registerGroupingViewsRoutes(app: Express, requireAuth: RequestHandler): void {
  app.get("/api/library/grouping-views", requireAuth, (req: Request, res: Response) =>
    handleListGroupingViews(req, res),
  );
  app.post("/api/library/grouping-views", requireAuth, (req: Request, res: Response) =>
    handleCreateGroupingView(req, res),
  );
  app.put("/api/library/grouping-views/:id", requireAuth, (req: Request, res: Response) =>
    handleUpdateGroupingView(req, res),
  );
  app.delete("/api/library/grouping-views/:id", requireAuth, (req: Request, res: Response) =>
    handleDeleteGroupingView(req, res),
  );
}
