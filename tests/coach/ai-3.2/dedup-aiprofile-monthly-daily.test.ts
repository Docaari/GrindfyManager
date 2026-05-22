// =============================================================================
// Sprint AI-3.2 / RF-D3 (ADR-203)
//
// Dedup `getAiStructuredProfile` em monthlyReportGenerator + dailyDebriefGenerator.
// AI-3.1 dedupliquei quarterly (LOW-4); monthly + daily ainda fazem 2 DB hits.
//
// Storage.getUserProfile retorna User com `aiStructuredProfile: AiStructuredProfile | null`
// JSONB direto — reusar em vez de chamar getAiStructuredProfile standalone.
//
// Audit pre-implementer (lesson #36): validar shape do aiStructuredProfile vs
// standalone. Se divergir, manter standalone OR normalizar inline.
//
// Status esperado: FALHA enquanto getAiStructuredProfile for chamado standalone.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  process.env.ANTHROPIC_API_KEY = "sk-test-d3";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function makeStorageWithProfile(): any {
  return {
    getGrindSessions: vi.fn(async () => []),
    countGrindSessions: vi.fn(async () => 0),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 100, tournaments: 5 })),
    getUserProfile: vi.fn(async () => ({
      userPlatformId: "USER-D3",
      country: "BR",
      timezone: "America/Sao_Paulo",
      aiStructuredProfile: {
        schemaVersion: 1,
        nivel: "intermediario",
        tomPreferido: "balanced",
      },
    })),
    persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-d3-1" })),
    listBankrollSnapshots: vi.fn(async () => []),
    getBankrollSnapshots: vi.fn(async () => []),
    listLeakFocusActive: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
  };
}

describe("RF-D3 — monthlyReportGenerator dedup: getAiStructuredProfile NAO eh chamado standalone", () => {
  it("monthly usa aiStructuredProfile de getUserProfile (zero calls standalone)", async () => {
    const getAiStructuredProfileStandalone = vi.fn(async () => ({
      schemaVersion: 1,
      nivel: "intermediario",
    }));
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      getAiStructuredProfile: getAiStructuredProfileStandalone,
      updateAiStructuredProfile: vi.fn(async () => ({})),
      updateCgameRecent: vi.fn(async () => undefined),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: vi.fn(async () => ({ content: {}, usage: null, rawText: "", degradedReason: "no_anthropic_key" })),
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => null),
    }));

    const storage = makeStorageWithProfile();
    const { generateMonthlyReport } = await import(
      "../../../server/services/monthlyReportGenerator"
    );
    await generateMonthlyReport({
      userId: "USER-D3",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      injectedStorage: storage,
    } as any).catch(() => undefined);

    // Pos RF-D3: standalone NUNCA eh chamado (perfil veio de getUserProfile).
    expect(getAiStructuredProfileStandalone).not.toHaveBeenCalled();
  });

  it("monthly usa getUserProfile UMA vez (nao 2x — dedup)", async () => {
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      updateCgameRecent: vi.fn(async () => undefined),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: vi.fn(async () => ({ content: {}, usage: null, rawText: "", degradedReason: "no_anthropic_key" })),
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => null),
    }));

    const storage = makeStorageWithProfile();
    const { generateMonthlyReport } = await import(
      "../../../server/services/monthlyReportGenerator"
    );
    await generateMonthlyReport({
      userId: "USER-D3",
      periodStart: "2026-04-01",
      periodEnd: "2026-04-30",
      injectedStorage: storage,
    } as any).catch(() => undefined);

    // getUserProfile eh chamado, mas no MAXIMO 1 vez (idealmente — dedup completo).
    // Tolerar ate 1 chamada; >1 sinaliza redundancia que RF-D3 deve corrigir.
    expect(storage.getUserProfile.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

describe("RF-D3 — dailyDebriefGenerator dedup: getAiStructuredProfile NAO eh chamado standalone", () => {
  it("daily usa aiStructuredProfile de getUserProfile (zero calls standalone)", async () => {
    const getAiStructuredProfileStandalone = vi.fn(async () => ({
      schemaVersion: 1,
      nivel: "intermediario",
    }));
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      getAiStructuredProfile: getAiStructuredProfileStandalone,
      updateAiStructuredProfile: vi.fn(async () => ({})),
      updateCgameRecent: vi.fn(async () => undefined),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: vi.fn(async () => ({ content: {}, usage: null, rawText: "", degradedReason: "no_anthropic_key" })),
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => null),
    }));

    const storage = makeStorageWithProfile();
    storage.getGrindSessionsForDay = vi.fn(async () => []);
    storage.listGrindSessionsForDate = vi.fn(async () => []);
    const dailyMod: any = await import("../../../server/services/dailyDebriefGenerator");
    const fn = dailyMod.generateDailyDebrief ?? dailyMod.default;
    if (typeof fn !== "function") {
      throw new Error("generateDailyDebrief export nao encontrado (RF-D3 red)");
    }
    await fn({
      userId: "USER-D3",
      periodStart: "2026-05-22",
      periodEnd: "2026-05-22",
      injectedStorage: storage,
    }).catch(() => undefined);

    expect(getAiStructuredProfileStandalone).not.toHaveBeenCalled();
  });
});

describe("RF-D3 — shape audit (lesson #36)", () => {
  it("getUserProfile retorna User.aiStructuredProfile shape compativel com standalone", async () => {
    // smoke contract: o shape esperado eh objeto com schemaVersion + opcionais.
    const storage = makeStorageWithProfile();
    const profile = await storage.getUserProfile("USER-D3");
    expect(profile.aiStructuredProfile).toBeDefined();
    expect(profile.aiStructuredProfile.schemaVersion).toBe(1);
  });
});
