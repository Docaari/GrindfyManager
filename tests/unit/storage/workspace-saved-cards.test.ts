import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Sprint torneios-custom-families — Fase 4 storage: listWorkspaceSavedCards.
//
// Propriedade CRITICA (privacidade): retorna o SNAPSHOT congelado dos cards dos
// co-membros (verbatim + tag origin) e NUNCA chama getFamilyDetails nem consulta
// o historico (tournaments) de outra conta.
//
// db mock SEQUENCIADO: cada db.select() consome o proximo resultado da fila
// (ordem das queries em listWorkspaceSavedCards: members -> workspace -> members
// by ws -> saved_highlights).
// .test.ts roda no projeto "server" (node).
// =============================================================================

vi.mock("drizzle-orm", async () => {
  const actual: any = await vi.importActual("drizzle-orm");
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

const dbState = vi.hoisted(() => ({ queue: [] as any[][] }));

vi.mock("../../../server/db", () => {
  function makeChain(result: any[]): any {
    const p = Promise.resolve(result);
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => p,
      limit: () => p,
      then: (resolve: any, reject: any) => p.then(resolve, reject),
    };
    return chain;
  }
  return {
    db: {
      select: () => makeChain(dbState.queue.shift() ?? []),
    },
  };
});

import { DatabaseStorage } from "../../../server/storage";

let storage: DatabaseStorage;
beforeEach(() => {
  vi.clearAllMocks();
  dbState.queue = [];
  storage = new DatabaseStorage();
});

describe("listWorkspaceSavedCards — snapshot congelado dos co-membros", () => {
  it("sem workspace -> [] (sem co-membros)", async () => {
    dbState.queue = [
      [], // getWorkspaceForUser: members -> nenhum (user nao vinculado)
    ];
    const out = await storage.listWorkspaceSavedCards("USER-ME");
    expect(out).toEqual([]);
  });

  it("retorna cards dos co-membros com tag origin + NAO chama getFamilyDetails", async () => {
    const card1 = { id: "h1", userId: "USER-COIN", familyKey: "PokerStars|$20-29|PKO|Normal|medio|12-14", metrics: { volume: 9 } };
    const card2 = { id: "h2", userId: "USER-COIN", familyKey: "GGPoker|$50-99|Vanilla|Turbo|grande|20-22", metrics: { volume: 4 } };
    dbState.queue = [
      [{ workspaceId: "W1", userId: "USER-ME" }], // getWorkspaceForUser: members
      [{ id: "W1", name: "Minhas contas" }],        // getWorkspaceForUser: workspaces
      [{ userId: "USER-ME" }, { userId: "USER-COIN" }], // listWorkspaceCoMemberIds: members by ws
      [card1, card2],                                // saved_highlights dos co-membros
    ];
    const spy = vi.spyOn(storage, "getFamilyDetails");

    const out = await storage.listWorkspaceSavedCards("USER-ME");

    // Snapshot verbatim + origin.
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "h1", metrics: { volume: 9 }, origin: { userId: "USER-COIN" } });
    expect(out[1]).toMatchObject({ id: "h2", origin: { userId: "USER-COIN" } });
    // Isolamento: NUNCA re-deriva no historico do viewer.
    expect(spy).not.toHaveBeenCalled();
  });

  it("workspace só com o próprio user -> [] (sem co-membros, nao consulta saved)", async () => {
    dbState.queue = [
      [{ workspaceId: "W1", userId: "USER-ME" }], // members
      [{ id: "W1", name: "Solo" }],                // workspaces
      [{ userId: "USER-ME" }],                     // members by ws — só eu
    ];
    const spy = vi.spyOn(storage, "getFamilyDetails");
    const out = await storage.listWorkspaceSavedCards("USER-ME");
    expect(out).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});
