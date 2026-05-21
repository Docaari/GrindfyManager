// =============================================================================
// Sprint AI-3.1 / RF-05 — Dedup getAiStructuredProfile no quarterly
//
// LOW-4 do reviewer AI-3: quarterlyReportGenerator chama tanto
// `storage.getUserProfile(userId)` quanto `getAiStructuredProfile(userId)`
// — ambos hitam tabela users. Eliminar a chamada separada se shape bate.
//
// Audit prévio (grep getAiStructuredProfile|getUserProfile no quarterly):
//   - linha 24: import { updateCgameRecent, getAiStructuredProfile } from ".../aiStructuredProfile"
//   - linha 138: storage.getUserProfile(userId) — gather Wave 1
//   - linha 336: const profile = await getAiStructuredProfile(userId) — segunda chamada
//
// DECISAO RF-05: PROSSEGUIR (não defer) — ambos hitam tabela `users`, shape
// `users.aiStructuredProfile` JSONB. `storage.getUserProfile` retorna row
// inteira do users (snake_case → driver mapeia para camelCase). Quarterly
// pode ler `userProfile.aiStructuredProfile` direto (normalizar via
// `normalizeAiStructuredProfile` se nao for nulo).
//
// Status esperado: TODOS FALHAM (quarterly chama getAiStructuredProfile
// extra — apos RF-05, so a chamada inicial `getUserProfile` ocorre).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeStorage(profileOverride: any = null): any {
  return {
    getGrindSessions: vi.fn(async () => []),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 1000, tournaments: 30, buyInSum: 500 })),
    listWarmupRitualsForRange: vi.fn(async () => []),
    listMentalHandsForRange: vi.fn(async () => []),
    listActiveCareerGoals: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
    getUserProfile: vi.fn(async () => profileOverride ?? {
      userPlatformId: "USER-1",
      country: "US",
      timezone: "America/New_York",
      // Pos-RF-05: getUserProfile traz aiStructuredProfile JSONB direto.
      aiStructuredProfile: {
        schemaVersion: 1,
        nivel: "mid_consistente",
        nivelConfirmado: true,
        cgameRecent: null,
      },
    }),
    persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-1" })),
  };
}

describe("RF-05 — quarterly nao chama getAiStructuredProfile separado", () => {
  it("apos RF-05: getAiStructuredProfile NAO eh invocado pelo quarterly", async () => {
    const getAiStructuredProfileSpy = vi.fn(async () => ({
      schemaVersion: 1,
      nivel: "mid_consistente",
    }));
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: vi.fn(async () => undefined),
      getAiStructuredProfile: getAiStructuredProfileSpy,
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
      injectedStorage: makeStorage(),
    });

    // Pos-RF-05: zero chamadas a getAiStructuredProfile (consumida via
    // userProfile.aiStructuredProfile do getUserProfile da Wave 1).
    expect(getAiStructuredProfileSpy).not.toHaveBeenCalled();
  });

  it("usa profile.aiStructuredProfile do getUserProfile (1x DB hit)", async () => {
    const storage = makeStorage({
      userPlatformId: "USER-1",
      country: "US",
      timezone: "America/New_York",
      aiStructuredProfile: {
        schemaVersion: 1,
        nivel: "high_stakes",
        nivelConfirmado: true,
        focoDoMes: "controlar tilt pos-bad-beat",
      },
    });

    const getAiStructuredProfileSpy = vi.fn(async () => {
      throw new Error("RF-05: deveria NUNCA ser chamado");
    });
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: vi.fn(async () => undefined),
      getAiStructuredProfile: getAiStructuredProfileSpy,
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

    // Deve completar sem invocar getAiStructuredProfile.
    const result = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(result).toBeDefined();
    expect(storage.getUserProfile).toHaveBeenCalled();
    expect(getAiStructuredProfileSpy).not.toHaveBeenCalled();
  });

  it("getUserProfile retorna aiStructuredProfile=null → quarterly nao quebra", async () => {
    const storage = makeStorage({
      userPlatformId: "USER-1",
      country: "US",
      timezone: "America/New_York",
      aiStructuredProfile: null,
    });

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
    const result = await generateQuarterlyReport({
      userId: "USER-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    });

    expect(result).toBeDefined();
    expect(result.status).toMatch(/ready|degraded/);
  });
});
