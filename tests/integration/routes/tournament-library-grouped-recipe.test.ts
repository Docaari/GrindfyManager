import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint torneios-custom-families — Fase 1 (route layer)
//
// GET /api/tournament-library-grouped ganha 2 query params novos:
//   - groupBy   : csv ex "timeBin,abi,site" -> validado contra CANONICAL_DIM_ORDER
//                 (dims desconhecidas descartadas) -> reordenado canonicamente ->
//                 repassado como `recipe` (4o arg de getTournamentLibrary).
//                 ausente/vazio/tudo-invalido -> DEFAULT_RECIPE.
//   - daysOfWeek: csv ex "ter,qui" -> filters.daysOfWeek (array de DAY_KEYS).
//
// O handler e extraido como funcao nomeada testavel
//   handleTournamentLibraryGrouped(req, res, injectedStorage?)   (lesson #34)
// O registro (app.get) chama o handler; aqui testamos a LOGICA de parse +
// forwarding diretamente (handler-direct), sem subir Express.
//
// Lesson #3: o mock de storage segue o shape REAL — getTournamentLibrary(
//   userId, period, filters, recipe) -> any[] (lista de familias).
//
// RED PHASE: handleTournamentLibraryGrouped ainda nao existe em
// server/routes/tournaments.ts (hoje a rota e um closure inline sem groupBy/
// daysOfWeek).
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

// O modulo de rotas importa storage/auth no topo; handlers usam injectedStorage.
vi.mock("../../../server/storage", () => ({ storage: {} }));

// @ts-expect-error - handler ainda nao existe (red phase)
import { handleTournamentLibraryGrouped } from "../../../server/routes/tournaments";
// @ts-expect-error - modulo novo (red phase)
import { DEFAULT_RECIPE } from "../../../shared/library-grouping-dims";

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

function makeReq(query: any = {}) {
  return {
    user: { userPlatformId: "USER-0001", email: "p@example.com" },
    query,
    params: {},
    body: {},
  };
}

function makeStorage() {
  return {
    getTournamentLibrary: vi.fn(async () => [{ id: "fam-1", volume: 3 }]),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/tournament-library-grouped — groupBy -> recipe", () => {
  it("groupBy ausente -> DEFAULT_RECIPE", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({}), makeRes(), storage);
    const [, , , recipe] = storage.getTournamentLibrary.mock.calls[0];
    expect(recipe).toEqual(DEFAULT_RECIPE);
  });

  it("groupBy csv valido -> recipe reordenada canonicamente", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({ groupBy: "timeBin,abi,site" }), makeRes(), storage);
    const [, , , recipe] = storage.getTournamentLibrary.mock.calls[0];
    // {timeBin,abi,site} reordenado por CANONICAL_DIM_ORDER -> site, abi, timeBin.
    expect(recipe).toEqual(["site", "abi", "timeBin"]);
  });

  it("groupBy com dims desconhecidas -> descarta as invalidas, mantem validas", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(
      makeReq({ groupBy: "site,banana,dayOfWeek,xyz" }),
      makeRes(),
      storage,
    );
    const [, , , recipe] = storage.getTournamentLibrary.mock.calls[0];
    expect(recipe).toEqual(["site", "dayOfWeek"]);
  });

  it("groupBy TODO invalido -> fallback DEFAULT_RECIPE", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({ groupBy: "banana,xyz" }), makeRes(), storage);
    const [, , , recipe] = storage.getTournamentLibrary.mock.calls[0];
    expect(recipe).toEqual(DEFAULT_RECIPE);
  });

  it("groupBy vazio -> fallback DEFAULT_RECIPE", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({ groupBy: "" }), makeRes(), storage);
    const [, , , recipe] = storage.getTournamentLibrary.mock.calls[0];
    expect(recipe).toEqual(DEFAULT_RECIPE);
  });

  it("groupBy nao duplica dims repetidas", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({ groupBy: "site,site,abi" }), makeRes(), storage);
    const [, , , recipe] = storage.getTournamentLibrary.mock.calls[0];
    expect(recipe).toEqual(["site", "abi"]);
  });
});

describe("GET /api/tournament-library-grouped — daysOfWeek -> filters", () => {
  it("daysOfWeek csv -> filters.daysOfWeek array", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({ daysOfWeek: "ter,qui" }), makeRes(), storage);
    const [, , filters] = storage.getTournamentLibrary.mock.calls[0];
    expect(filters.daysOfWeek).toEqual(["ter", "qui"]);
  });

  it("daysOfWeek ausente -> filters sem daysOfWeek (ou undefined/vazio)", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({}), makeRes(), storage);
    const [, , filters] = storage.getTournamentLibrary.mock.calls[0];
    const dow = filters?.daysOfWeek;
    expect(dow === undefined || (Array.isArray(dow) && dow.length === 0)).toBe(true);
  });

  it("daysOfWeek com chave invalida -> descarta a invalida", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(
      makeReq({ daysOfWeek: "ter,domingo,qui" }),
      makeRes(),
      storage,
    );
    const [, , filters] = storage.getTournamentLibrary.mock.calls[0];
    // "domingo" nao e uma DAY_KEY valida ("dom" sim) -> descartada.
    expect(filters.daysOfWeek).toEqual(["ter", "qui"]);
  });

  it("retorna a lista de familias do storage como JSON", async () => {
    const storage = makeStorage();
    const res = makeRes();
    await handleTournamentLibraryGrouped(makeReq({ period: "30d" }), res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual([{ id: "fam-1", volume: 3 }]);
  });

  it("repassa userId e period corretamente", async () => {
    const storage = makeStorage();
    await handleTournamentLibraryGrouped(makeReq({ period: "90d" }), makeRes(), storage);
    const [userId, period] = storage.getTournamentLibrary.mock.calls[0];
    expect(userId).toBe("USER-0001");
    expect(period).toBe("90d");
  });
});
