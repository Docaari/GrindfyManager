// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint EST-1 / RF-05 + RF-04 — 3 métodos storage NOVOS no DatabaseStorage:
//   - markReportDelivered(reportId, channel: 'inApp'|'chat'|'email', tx?): Promise<boolean>
//       UPDATE condicional WHERE id=$1 AND NOT (delivered_channels ? channel) RETURNING id.
//       true sse ESTA chamada marcou agora (claim atômico); false se já estava marcado.
//   - unmarkReportDelivered(reportId, channel, tx?): Promise<void>
//       delivered_channels - channel (compensação no caminho de erro).
//   - getOrCreateReportChatSession(userId, tx?): Promise<{ id }>
//       reusa chatSession coachType='technical' status='active' mais recente;
//       senão cria via createChatSession({ userId, coachType:'technical', title:'Relatórios' }).
//
// Fontes:
//   - Docs/specs/.../EST-1-coach-weekly-delivery.md (RF-05, RF-04)
//   - Docs/architecture/decisions/222-...md (Decisão 3 — lesson #33; Decisão 4 — get-or-create)
//
// Estratégia: mock `../db` com:
//   - `db.execute(sql)` → retorna { rows, rowCount } configurável (mark/unmark usam execute).
//     O código real lê `rows.rowCount > 0` (driver pg). Mockamos rowCount.
//   - `db.select()....limit()` chainable → __selectResult (getOrCreate busca a sessão).
//   - `db.insert()....values()` → no-op (createChatSession).
//
// Status esperado: RED — markReportDelivered / unmarkReportDelivered /
//   getOrCreateReportChatSession ainda NÃO existem em storage → "is not a function".
//
// Lessons: #3 (mock shape real do retorno do db.execute — { rows, rowCount }), #33
//   (claim atômico jsonb), #34 (métodos no storage real, sem reimplementar).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

let __executeResult: any = { rows: [], rowCount: 0 };
let __selectResult: any[] = [];
const insertValuesSpy = vi.fn();

function makeSelectChain() {
  const chain: any = {};
  for (const m of ["select", "from", "where", "orderBy", "limit"]) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve: any, reject?: any) =>
    Promise.resolve(__selectResult).then(resolve, reject);
  chain.catch = (reject: any) => chain.then(undefined, reject);
  return chain;
}

const selectChain = makeSelectChain();

const dbMock: any = {
  execute: vi.fn(async () => __executeResult),
  select: selectChain.select,
  from: selectChain.from,
  where: selectChain.where,
  orderBy: selectChain.orderBy,
  limit: selectChain.limit,
  insert: vi.fn(() => ({ values: insertValuesSpy.mockReturnValue(Promise.resolve()) })),
};

vi.mock("../../../server/db", () => ({
  db: dbMock,
  pool: {},
}));

beforeEach(() => {
  __executeResult = { rows: [], rowCount: 0 };
  __selectResult = [];
  insertValuesSpy.mockReset();
  insertValuesSpy.mockReturnValue(Promise.resolve());
  dbMock.execute.mockClear();
});

async function getStorage() {
  const mod: any = await import("../../../server/storage");
  return mod.storage;
}

// ---------------------------------------------------------------------------
// markReportDelivered — claim atômico
// ---------------------------------------------------------------------------
describe("EST-1 RF-05 — markReportDelivered (claim atômico)", () => {
  it("retorna true quando o UPDATE afeta a linha (RETURNING tem row / rowCount>0)", async () => {
    __executeResult = { rows: [{ id: "rep-1" }], rowCount: 1 };
    const storage = await getStorage();
    const claimed = await storage.markReportDelivered("rep-1", "inApp");
    expect(claimed).toBe(true);
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });

  it("retorna false quando o canal já estava marcado (UPDATE não afeta linha — rowCount 0)", async () => {
    __executeResult = { rows: [], rowCount: 0 };
    const storage = await getStorage();
    const claimed = await storage.markReportDelivered("rep-1", "inApp");
    expect(claimed).toBe(false);
  });

  it("aceita channel 'chat'", async () => {
    __executeResult = { rows: [{ id: "rep-2" }], rowCount: 1 };
    const storage = await getStorage();
    const claimed = await storage.markReportDelivered("rep-2", "chat");
    expect(claimed).toBe(true);
  });

  it("aceita channel 'email'", async () => {
    __executeResult = { rows: [{ id: "rep-3" }], rowCount: 1 };
    const storage = await getStorage();
    const claimed = await storage.markReportDelivered("rep-3", "email");
    expect(claimed).toBe(true);
  });

  it("usa o tx injetado em vez de db quando fornecido", async () => {
    const txExecute = vi.fn(async () => ({ rows: [{ id: "rep-4" }], rowCount: 1 }));
    const tx = { execute: txExecute };
    const storage = await getStorage();
    const claimed = await storage.markReportDelivered("rep-4", "inApp", tx);
    expect(claimed).toBe(true);
    expect(txExecute).toHaveBeenCalledTimes(1);
    expect(dbMock.execute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// unmarkReportDelivered — compensação
// ---------------------------------------------------------------------------
describe("EST-1 RF-05 — unmarkReportDelivered (rollback do claim em erro)", () => {
  it("executa um UPDATE (delivered_channels - channel) e resolve void", async () => {
    __executeResult = { rows: [], rowCount: 1 };
    const storage = await getStorage();
    const ret = await storage.unmarkReportDelivered("rep-1", "chat");
    expect(ret).toBeUndefined();
    expect(dbMock.execute).toHaveBeenCalledTimes(1);
  });

  it("usa o tx injetado quando fornecido", async () => {
    const txExecute = vi.fn(async () => ({ rows: [], rowCount: 1 }));
    const tx = { execute: txExecute };
    const storage = await getStorage();
    await storage.unmarkReportDelivered("rep-1", "inApp", tx);
    expect(txExecute).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getOrCreateReportChatSession — reusa technical mais recente ou cria
// ---------------------------------------------------------------------------
describe("EST-1 RF-04 — getOrCreateReportChatSession", () => {
  it("retorna o id da sessão technical existente SEM criar nova", async () => {
    __selectResult = [{ id: "sess-existing", userId: "USER-0001", coachType: "technical", status: "active" }];
    const storage = await getStorage();
    const result = await storage.getOrCreateReportChatSession("USER-0001");
    expect(result).toEqual({ id: "sess-existing" });
    // createChatSession (db.insert) NÃO chamado quando já existe sessão.
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("cria uma sessão technical 'Relatórios' quando o user não tem nenhuma", async () => {
    __selectResult = []; // nenhuma sessão prévia
    const storage = await getStorage();
    const result = await storage.getOrCreateReportChatSession("USER-0002");
    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("string");
    // createChatSession faz db.insert(...).values(...) — deve ter sido chamado.
    expect(dbMock.insert).toHaveBeenCalled();
    const inserted = insertValuesSpy.mock.calls[0]?.[0];
    expect(inserted).toMatchObject({ userId: "USER-0002", coachType: "technical" });
  });
});
