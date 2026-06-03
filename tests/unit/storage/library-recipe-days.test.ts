import { describe, it, expect, vi, beforeEach } from "vitest";

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
//
// Sprint torneios-custom-families — Fase 1 (storage layer)
//
// Cobre:
//   (a) getTournamentLibrary(userId, period?, filters?, recipe?) — 4o arg opcional
//       recipe (default DEFAULT_RECIPE); filters.daysOfWeek reduz o conjunto agrupado.
//   (b) recipe muda as familyKeys resultantes (prefixo g1:).
//   (c) getFamilyDetails resolve uma chave LEGADA (found:true, como antes) e uma
//       chave g1: (re-deriva pela receita embutida via parseFamilyKey).
//
// Estrategia (lesson #3): mockamos APENAS ./db (chain thenable que devolve as
// rows canned) + ./services/fxResolver (normalizeTournamentsToUsd usa-o) +
// drizzle-orm parcial (lesson #36: precisa relations). NAO mockamos
// libraryGrouping — queremos o agrupamento REAL (mesmo modulo testado em
// libraryGrouping.recipe.test.ts) para validar o passthrough da receita.
//
// GAP DOCUMENTADO: o filtro WHERE de periodo/dashboard e a query SQL em si NAO
// sao exercitados aqui (o db mock ignora os predicates). Cobrimos a logica
// POS-query: filtro daysOfWeek aplicado em-memoria + receita repassada ao
// groupTournaments + re-derivacao em getFamilyDetails. A integracao SQL completa
// (period gte, buildFilters) e gap p/ teste de integracao com DB real.
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

vi.mock("drizzle-orm", async () => {
  const actual: any = await vi.importActual("drizzle-orm");
  return { ...actual, relations: actual.relations ?? vi.fn(() => ({})) };
});

// FX resolver — normalizeTournamentsToUsd consome resolveExchangeRates/convertToUSD.
vi.mock("../../../server/services/fxResolver", () => ({
  FALLBACK_FX_RATES: { USD: 1, BRL: 5, EUR: 0.9 },
  convertToUSD: (amount: number, currency: string, rates: Record<string, number>) => {
    if (currency === "USD") return amount;
    const rate = rates?.[currency];
    if (typeof rate !== "number" || rate === 0) return amount;
    return amount / rate;
  },
  resolveExchangeRates: vi.fn(async () => ({ rates: { USD: 1, BRL: 5, EUR: 0.9 } })),
}));

// db mock: qualquer cadeia select().from().where().orderBy() resolve para dbState.rows.
const dbState = vi.hoisted(() => ({ rows: [] as any[] }));

vi.mock("../../../server/db", () => {
  function makeChain(): any {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      orderBy: () => Promise.resolve(dbState.rows),
      // alguns caminhos chamam .limit() — mantemos thenable defensivamente
      limit: () => Promise.resolve(dbState.rows),
      then: (resolve: any) => Promise.resolve(dbState.rows).then(resolve),
    };
    return chain;
  }
  return {
    db: {
      select: () => makeChain(),
    },
  };
});

import { DatabaseStorage } from "../../../server/storage";
// @ts-expect-error - DEFAULT_RECIPE modulo novo (red phase)
import { DEFAULT_RECIPE } from "../../../shared/library-grouping-dims";

// Datas conhecidas (UTC): 2026-06-02 terca, 2026-06-04 quinta.
const TUE = new Date("2026-06-02T13:00:00Z");
const THU = new Date("2026-06-04T13:00:00Z");

function t(over: Partial<any> = {}): any {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    userId: "USER-0001",
    grindSessionId: null,
    site: "PokerStars",
    buyIn: "22",
    type: "PKO",
    category: "PKO",
    speed: "Normal",
    format: "MTT",
    name: "Bounty Builder",
    prize: "0",
    reentries: 0,
    currency: "USD",
    convertedToUSD: true,
    fieldSize: 300,
    ...over,
  };
}

let storage: DatabaseStorage;
beforeEach(() => {
  vi.clearAllMocks();
  dbState.rows = [];
  storage = new DatabaseStorage();
});

describe("getTournamentLibrary — filtro daysOfWeek (RF Fase 1)", () => {
  it("(a) filters.daysOfWeek reduz o conjunto agrupado (so terca)", async () => {
    dbState.rows = [
      t({ id: "tue1", datePlayed: TUE }),
      t({ id: "tue2", datePlayed: TUE }),
      t({ id: "thu1", datePlayed: THU }),
    ];
    const all = await storage.getTournamentLibrary("USER-0001", "all", {});
    const onlyTue = await storage.getTournamentLibrary("USER-0001", "all", { daysOfWeek: ["ter"] });

    const volAll = all.reduce((s: number, f: any) => s + f.volume, 0);
    const volTue = onlyTue.reduce((s: number, f: any) => s + f.volume, 0);
    expect(volAll).toBe(3);
    expect(volTue).toBe(2); // exclui o de quinta
  });

  it("daysOfWeek vazio/ausente NAO filtra (todos os dias)", async () => {
    dbState.rows = [t({ datePlayed: TUE }), t({ datePlayed: THU })];
    const r = await storage.getTournamentLibrary("USER-0001", "all", { daysOfWeek: [] });
    const vol = r.reduce((s: number, f: any) => s + f.volume, 0);
    expect(vol).toBe(2);
  });
});

describe("getTournamentLibrary — receita (4o arg)", () => {
  it("(b) recipe customizada muda as familyKeys (prefixo g1:)", async () => {
    dbState.rows = [t({ datePlayed: TUE }), t({ datePlayed: THU })];
    const def = await storage.getTournamentLibrary("USER-0001", "all", {}, DEFAULT_RECIPE);
    const custom = await storage.getTournamentLibrary("USER-0001", "all", {}, ["site", "abi", "dayOfWeek"]);

    // default: chaves legadas (sem prefixo).
    for (const f of def) expect(String(f.id).startsWith("g1:")).toBe(false);
    // custom com dayOfWeek: chaves g1: + separa terca/quinta em familias distintas.
    for (const f of custom) expect(String(f.id).startsWith("g1:site,abi,dayOfWeek|")).toBe(true);
    expect(custom.length).toBeGreaterThanOrEqual(2);
  });

  it("sem 4o arg usa DEFAULT_RECIPE (chaves legadas)", async () => {
    dbState.rows = [t({ datePlayed: TUE })];
    const r = await storage.getTournamentLibrary("USER-0001", "all", {});
    expect(String(r[0].id).startsWith("g1:")).toBe(false);
  });
});

describe("getFamilyDetails — re-deriva pela receita embutida", () => {
  it("(c) chave LEGADA resolve found:true como antes", async () => {
    // A familyKey legada para este torneio (vide golden em libraryGrouping.recipe.test):
    // PokerStars|$20-29|PKO|Normal|medio|12-14
    dbState.rows = [
      t({ id: "x1", datePlayed: TUE, fieldSize: 300, buyIn: "22", category: "PKO" }),
    ];
    const res = await storage.getFamilyDetails(
      "USER-0001",
      "PokerStars|$20-29|PKO|Normal|medio|12-14",
    );
    expect(res.found).toBe(true);
    expect(res.metrics?.volume).toBe(1);
  });

  it("(c) chave g1: (com dayOfWeek) resolve found:true re-derivando a receita", async () => {
    dbState.rows = [
      t({ id: "g1", datePlayed: TUE, buyIn: "22" }),
      t({ id: "g2", datePlayed: THU, buyIn: "22" }), // quinta — fora da familia da terca
    ];
    // Chave g1: para {site,abi,dayOfWeek} com site=PokerStars, abi=$20-29, dia=ter.
    const res = await storage.getFamilyDetails(
      "USER-0001",
      "g1:site,abi,dayOfWeek|PokerStars|$20-29|ter",
    );
    expect(res.found).toBe(true);
    // So o torneio de terca cai nessa familia.
    expect(res.metrics?.volume).toBe(1);
  });
});
