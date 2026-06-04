import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Sprint torneios-custom-families — Fase 2 (grouping-views) + Fase 4 (admin
// workspaces). Testa os handlers nomeados handle*(req, res, injectedStorage?)
// direto (lesson #34) — parse/validacao/status/forwarding, sem subir Express.
// Lesson #3: o mock de storage segue o shape REAL dos metodos chamados.
// .test.ts roda no projeto "server" (node).
// =============================================================================

vi.mock("drizzle-orm", async () => {
  const actual: any = await vi.importActual("drizzle-orm");
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

import {
  handleListGroupingViews,
  handleCreateGroupingView,
  handleUpdateGroupingView,
  handleDeleteGroupingView,
} from "../../../server/routes/grouping-views";
import {
  handleListWorkspaces,
  handleCreateWorkspace,
  handleAddWorkspaceMember,
  handleRemoveWorkspaceMember,
} from "../../../server/routes/adminWorkspaces";

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}
function makeReq(over: any = {}) {
  return {
    user: { userPlatformId: "USER-0001", email: "p@example.com" },
    query: {},
    params: {},
    body: {},
    ...over,
  };
}
beforeEach(() => vi.clearAllMocks());

// ---------------------------------------------------------------------------
// FASE 2 — Visões de agrupamento
// ---------------------------------------------------------------------------
describe("grouping-views — create (validação + sanitização de dims)", () => {
  it("rejeita name vazio -> 400", async () => {
    const storage = { createGroupingView: vi.fn() };
    const res = makeRes();
    await handleCreateGroupingView(makeReq({ body: { name: "  ", dims: ["site"] } }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.createGroupingView).not.toHaveBeenCalled();
  });

  it("rejeita dims sem dimensão válida -> 400", async () => {
    const storage = { createGroupingView: vi.fn() };
    const res = makeRes();
    await handleCreateGroupingView(makeReq({ body: { name: "X", dims: ["banana", "xyz"] } }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.createGroupingView).not.toHaveBeenCalled();
  });

  it("sanitiza/canonicaliza dims antes de salvar (timeBin,abi,site -> site,abi,timeBin)", async () => {
    const storage = { createGroupingView: vi.fn(async (i: any) => ({ id: "v1", ...i })) };
    const res = makeRes();
    await handleCreateGroupingView(
      makeReq({ body: { name: "Horário+ABI", dims: ["timeBin", "abi", "site", "banana"] } }),
      res,
      storage,
    );
    expect(res.statusCode).toBe(201);
    const arg = storage.createGroupingView.mock.calls[0][0];
    expect(arg.dims).toEqual(["site", "abi", "timeBin"]); // canônico, banana descartada
    expect(arg.userId).toBe("USER-0001");
    expect(arg.name).toBe("Horário+ABI");
  });

  it("conflito de nome (23505) -> 409", async () => {
    const storage = {
      createGroupingView: vi.fn(async () => { const e: any = new Error("dup"); e.code = "23505"; throw e; }),
    };
    const res = makeRes();
    await handleCreateGroupingView(makeReq({ body: { name: "X", dims: ["site"] } }), res, storage);
    expect(res.statusCode).toBe(409);
  });
});

describe("grouping-views — list/update/delete", () => {
  it("list devolve as visões do user", async () => {
    const storage = { listGroupingViews: vi.fn(async () => [{ id: "v1", name: "X" }]) };
    const res = makeRes();
    await handleListGroupingViews(makeReq(), res, storage);
    expect(res.body).toEqual([{ id: "v1", name: "X" }]);
    expect(storage.listGroupingViews).toHaveBeenCalledWith("USER-0001");
  });

  it("update inexistente/alheia -> 404 (ownership no storage devolve null)", async () => {
    const storage = { updateGroupingView: vi.fn(async () => null) };
    const res = makeRes();
    await handleUpdateGroupingView(makeReq({ params: { id: "v9" }, body: { name: "Novo" } }), res, storage);
    expect(res.statusCode).toBe(404);
    expect(storage.updateGroupingView).toHaveBeenCalledWith("USER-0001", "v9", { name: "Novo" });
  });

  it("delete inexistente -> 404", async () => {
    const storage = { deleteGroupingView: vi.fn(async () => false) };
    const res = makeRes();
    await handleDeleteGroupingView(makeReq({ params: { id: "v9" } }), res, storage);
    expect(res.statusCode).toBe(404);
  });

  it("delete ok -> 200 ok:true", async () => {
    const storage = { deleteGroupingView: vi.fn(async () => true) };
    const res = makeRes();
    await handleDeleteGroupingView(makeReq({ params: { id: "v1" } }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// FASE 4 — Admin de workspaces
// ---------------------------------------------------------------------------
describe("admin workspaces — create/list", () => {
  it("create exige name -> 400 sem name", async () => {
    const storage = { createWorkspace: vi.fn() };
    const res = makeRes();
    await handleCreateWorkspace(makeReq({ body: {} }), res, storage);
    expect(res.statusCode).toBe(400);
    expect(storage.createWorkspace).not.toHaveBeenCalled();
  });

  it("create ok -> 201 + createdBy = user", async () => {
    const storage = { createWorkspace: vi.fn(async (i: any) => ({ id: "W1", ...i })) };
    const res = makeRes();
    await handleCreateWorkspace(makeReq({ body: { name: "Minhas contas" } }), res, storage);
    expect(res.statusCode).toBe(201);
    expect(storage.createWorkspace.mock.calls[0][0]).toEqual({ name: "Minhas contas", createdBy: "USER-0001" });
  });

  it("list devolve workspaces", async () => {
    const storage = { listWorkspaces: vi.fn(async () => [{ id: "W1", members: [] }]) };
    const res = makeRes();
    await handleListWorkspaces(makeReq(), res, storage);
    expect(res.body).toEqual([{ id: "W1", members: [] }]);
  });
});

describe("admin workspaces — add/remove member", () => {
  it("addMember exige userId -> 400", async () => {
    const storage = { addWorkspaceMember: vi.fn() };
    const res = makeRes();
    await handleAddWorkspaceMember(makeReq({ params: { id: "W1" }, body: {} }), res, storage);
    expect(res.statusCode).toBe(400);
  });

  it("addMember ok -> 201", async () => {
    const storage = { addWorkspaceMember: vi.fn(async () => ({ ok: true, row: { id: "m1" } })) };
    const res = makeRes();
    await handleAddWorkspaceMember(makeReq({ params: { id: "W1" }, body: { userId: "USER-0002" } }), res, storage);
    expect(res.statusCode).toBe(201);
    expect(storage.addWorkspaceMember.mock.calls[0][0]).toEqual({
      workspaceId: "W1",
      userId: "USER-0002",
      addedBy: "USER-0001",
    });
  });

  it("addMember conflito (já em workspace) -> 409", async () => {
    const storage = { addWorkspaceMember: vi.fn(async () => ({ ok: false, conflict: "already_in_workspace" })) };
    const res = makeRes();
    await handleAddWorkspaceMember(makeReq({ params: { id: "W1" }, body: { userId: "USER-0002" } }), res, storage);
    expect(res.statusCode).toBe(409);
    expect(res.body.conflict).toBe("already_in_workspace");
  });

  it("removeMember inexistente -> 404", async () => {
    const storage = { removeWorkspaceMember: vi.fn(async () => false) };
    const res = makeRes();
    await handleRemoveWorkspaceMember(makeReq({ params: { id: "W1", userId: "USER-9" } }), res, storage);
    expect(res.statusCode).toBe(404);
  });

  it("removeMember ok -> 200", async () => {
    const storage = { removeWorkspaceMember: vi.fn(async () => true) };
    const res = makeRes();
    await handleRemoveWorkspaceMember(makeReq({ params: { id: "W1", userId: "USER-2" } }), res, storage);
    expect(res.statusCode).toBe(200);
  });
});
