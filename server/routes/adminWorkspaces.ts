/**
 * /api/admin/workspaces — Gestão de workspaces de contas (Fase 4).
 *
 * Founder/superadmin vincula contas direto (sem convite/aceite). Contas no mesmo
 * workspace veem os cards salvos umas das outras (snapshot congelado). Escrita +
 * leitura gated por requireGranularPermission('workspace_admin') (superadmin-by-
 * email passa automaticamente — auth.ts).
 *
 * Handlers no padrão handleX(req, res, injectedStorage?) (lesson #34). Ordem de
 * registro: estáticas/sub-paths ANTES de /:id (Express 4 ordem-pura).
 *
 * Endpoints:
 *   GET    /api/admin/workspaces                          listar (+membros)
 *   POST   /api/admin/workspaces                          criar  { name }
 *   POST   /api/admin/workspaces/:id/members              add    { userId }  (409 se já vinculado)
 *   DELETE /api/admin/workspaces/:id/members/:userId      remover
 */

import type { Express, Request, Response } from "express";
import { requireAuth, requireGranularPermission } from "../auth";

const WORKSPACE_ADMIN_PERMISSION = "workspace_admin";

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

export async function handleListWorkspaces(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const rows = await store.listWorkspaces();
    res.status(200).json(rows);
  } catch (err) {
    console.error("[adminWorkspaces] list failed:", err);
    res.status(500).json({ message: "Erro ao listar workspaces" });
  }
}

export async function handleCreateWorkspace(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) {
    res.status(400).json({ message: "name é obrigatório" });
    return;
  }
  const store = await getStore(injectedStorage);
  try {
    const row = await store.createWorkspace({ name, createdBy: req.user.userPlatformId });
    res.status(201).json(row);
  } catch (err) {
    console.error("[adminWorkspaces] create failed:", err);
    res.status(500).json({ message: "Erro ao criar workspace" });
  }
}

export async function handleAddWorkspaceMember(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const userId = typeof req.body?.userId === "string" ? req.body.userId.trim() : "";
  if (!userId) {
    res.status(400).json({ message: "userId é obrigatório" });
    return;
  }
  const store = await getStore(injectedStorage);
  try {
    const result = await store.addWorkspaceMember({
      workspaceId: req.params.id,
      userId,
      addedBy: req.user.userPlatformId,
    });
    if (!result.ok) {
      // ≤1 workspace por user (UNIQUE user_id) — já está em algum workspace.
      res.status(409).json({ message: "Conta já está em um workspace", conflict: result.conflict });
      return;
    }
    res.status(201).json(result.row);
  } catch (err) {
    console.error("[adminWorkspaces] addMember failed:", err);
    res.status(500).json({ message: "Erro ao vincular conta" });
  }
}

export async function handleRemoveWorkspaceMember(
  req: any,
  res: Response,
  injectedStorage?: any,
): Promise<void> {
  if (!requireUser(req, res)) return;
  const store = await getStore(injectedStorage);
  try {
    const ok = await store.removeWorkspaceMember(req.params.id, req.params.userId);
    if (!ok) {
      res.status(404).json({ message: "Vínculo não encontrado" });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[adminWorkspaces] removeMember failed:", err);
    res.status(500).json({ message: "Erro ao desvincular conta" });
  }
}

export function registerAdminWorkspaceRoutes(app: Express): void {
  const guard = requireGranularPermission(WORKSPACE_ADMIN_PERMISSION);

  app.get("/api/admin/workspaces", requireAuth, guard, (req: Request, res: Response) =>
    handleListWorkspaces(req, res),
  );
  app.post("/api/admin/workspaces", requireAuth, guard, (req: Request, res: Response) =>
    handleCreateWorkspace(req, res),
  );
  // Sub-paths /:id/members ANTES de qualquer /:id puro (defensivo).
  app.post("/api/admin/workspaces/:id/members", requireAuth, guard, (req: Request, res: Response) =>
    handleAddWorkspaceMember(req, res),
  );
  app.delete(
    "/api/admin/workspaces/:id/members/:userId",
    requireAuth,
    guard,
    (req: Request, res: Response) => handleRemoveWorkspaceMember(req, res),
  );
}
