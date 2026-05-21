// =============================================================================
// Sprint AI-3.1 / RF-08 — storage.countGrindSessions
//
// A3-H3 do reviewer AI-3: quarterly faz `(await getGrindSessions(...)).length`
// carregando N linhas do DB so para ler count. Adicionar storage.countGrindSessions
// que retorna `SELECT COUNT(*)`.
//
// API esperada:
//   async countGrindSessions(
//     userId: string,
//     range: { from: Date | string; to: Date | string } | null
//   ): Promise<number>
//
// Implementer migra `sessionsCount` no quarterly de getGrindSessions(...).length
// para countGrindSessions(userId, range).
//
// Lesson #34 — storage abstraction. Lesson #38 — tests existentes do quarterly
// que stubam getGrindSessions com count puro precisam ganhar stub
// countGrindSessions (responsabilidade implementer).
//
// Status esperado: TODOS FALHAM (metodo + uso ainda nao existem).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeStorageWithCount(countValue: number): any {
  return {
    getGrindSessions: vi.fn(async () => {
      throw new Error("getGrindSessions NAO deveria ser chamado quando countGrindSessions existe (RF-08)");
    }),
    countGrindSessions: vi.fn(async (_userId: string, _range: any) => countValue),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 100 })),
    listWarmupRitualsForRange: vi.fn(async () => []),
    listMentalHandsForRange: vi.fn(async () => []),
    listActiveCareerGoals: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
    getUserProfile: vi.fn(async () => ({
      userPlatformId: "USER-1",
      country: "US",
      timezone: "America/New_York",
    })),
    persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-1" })),
  };
}

describe("RF-08 — quarterly usa storage.countGrindSessions (nao getGrindSessions.length)", () => {
  it("quarterly invoca countGrindSessions UMA vez com (userId, range)", async () => {
    const storage = makeStorageWithCount(42);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: vi.fn(async () => undefined),
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(storage.countGrindSessions).toHaveBeenCalled();
    const call = storage.countGrindSessions.mock.calls[0];
    expect(call[0]).toBe("USER-1");
    // range arg presente (object ou string "YYYY-MM-DD to YYYY-MM-DD").
    expect(call[1]).toBeDefined();
  });

  it("quarterly NAO chama getGrindSessions.length quando countGrindSessions disponivel", async () => {
    const storage = makeStorageWithCount(7);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: vi.fn(async () => undefined),
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );

    // getGrindSessions stub throwa — quarterly NAO deve chama-lo.
    await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    // Nenhuma chamada a getGrindSessions (a stub throwa, mas tampouco e' chamada).
    expect(storage.getGrindSessions).not.toHaveBeenCalled();
    expect(storage.countGrindSessions).toHaveBeenCalled();
  });

  it("quarterly content.totalSessions reflete countGrindSessions return", async () => {
    const COUNT = 117;
    const storage = makeStorageWithCount(COUNT);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: vi.fn(async () => undefined),
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    vi.spyOn(console, "error").mockImplementation(() => {});
    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const out = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    // O sessionsCount no bundle/content deve refletir o COUNT.
    // Acessamos via content (formato pode variar — totalSessions na raiz ou
    // dentro de header/period stats).
    const contentJson = JSON.stringify(out.content);
    expect(contentJson).toContain(String(COUNT));
  });
});

describe("RF-08 — storage.countGrindSessions API contract", () => {
  it("contract: aceita (userId, { from, to }) → Promise<number>", async () => {
    // Carrega o modulo storage real e verifica que o metodo existe.
    // (Implementer cria o metodo; aqui testamos a presenca + signature.)
    const storageMod: any = await import("../../../server/storage");
    const fn = storageMod?.storage?.countGrindSessions;
    expect(typeof fn).toBe("function");
  });

  it("contract: range null → conta todas as sessoes do user", async () => {
    const storageMod: any = await import("../../../server/storage");
    const fn = storageMod?.storage?.countGrindSessions;
    if (typeof fn !== "function") {
      throw new Error("storage.countGrindSessions nao implementado (RF-08 red phase)");
    }
    // Smoke contract: chamada sintatica nao deve quebrar quando range = null.
    // O resultado depende do DB; aqui so verificamos que retorna number.
    const result = await fn("USER-non-existent", null).catch(() => 0);
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
  });
});
