// =============================================================================
// Sprint AI-3.1 / RF-01 — cgameRecent.confidence passthrough no Quarterly
//
// HIGH-1 do reviewer AI-3: quarterlyReportGenerator.ts:207-209 hoje força
// `confidence: 'low'` quando o sinal do aggregator nao bate o literal
// 'high'|'medium'|'low'. Isso sobrescreve sinal real do aggregator.
//
// Comportamento esperado pos-RF-01:
//   - Confidence ∈ {'high','medium','low'} → passthrough (preserva valor).
//   - Confidence invalido/undefined → omite o persist inteiro
//     (updateCgameRecent NAO eh chamado para esse snapshot; log warn).
//   - Lesson #38: test legado "persiste com confidence='low' fallback" sera
//     re-escrito (responsabilidade do implementer documentar).
//
// Status esperado: TODOS FALHAM (codigo atual coage para 'low').
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function makeStorage(overrides: any = {}): any {
  return {
    getGrindSessions: vi.fn(async () => []),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 1000, tournaments: 30, buyInSum: 500 })),
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
    ...overrides,
  };
}

/**
 * Helper: stub aggregateCgameForPeriod retornando confidence configuravel.
 * O quarterly chama internamente aggregateCgameForPeriod (de cgameAggregator).
 */
function mockCgameAggregator(snapshot: any) {
  vi.doMock("../../../server/services/cgameAggregator", () => ({
    aggregateCgameForPeriod: vi.fn(async () => snapshot),
    getInchwormSeries: vi.fn(async () => []),
    getCgameMovement: vi.fn(async () => null),
  }));
}

describe("RF-01 — cgameRecent confidence passthrough", () => {
  it("persiste confidence='medium' quando aggregator retorna 'medium' (NAO coage para 'low')", async () => {
    const updateCgameRecentSpy = vi.fn(async () => undefined);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: updateCgameRecentSpy,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    mockCgameAggregator({
      aPct: 40,
      bPct: 35,
      cPct: 25,
      sampleSize: 80,
      confidence: "medium",
    });
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

    expect(updateCgameRecentSpy).toHaveBeenCalledTimes(1);
    const snap = updateCgameRecentSpy.mock.calls[0][1];
    expect(snap.confidence).toBe("medium");
  });

  it("persiste confidence='high' quando aggregator retorna 'high'", async () => {
    const updateCgameRecentSpy = vi.fn(async () => undefined);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: updateCgameRecentSpy,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    mockCgameAggregator({
      aPct: 60,
      bPct: 30,
      cPct: 10,
      sampleSize: 200,
      confidence: "high",
    });
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

    expect(updateCgameRecentSpy).toHaveBeenCalledTimes(1);
    const snap = updateCgameRecentSpy.mock.calls[0][1];
    expect(snap.confidence).toBe("high");
  });

  it("NAO persiste (no-op) quando aggregator retorna confidence INVALIDO", async () => {
    const updateCgameRecentSpy = vi.fn(async () => undefined);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: updateCgameRecentSpy,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    mockCgameAggregator({
      aPct: 50,
      bPct: 30,
      cPct: 20,
      sampleSize: 100,
      confidence: "garbage_invalid_value",
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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

    // Comportamento RF-01: snapshot com confidence invalida NAO persiste.
    expect(updateCgameRecentSpy).not.toHaveBeenCalled();
    // Esperado log warn (key contem 'confidence_invalid' ou 'cgame.persist').
    const warnCallStr = JSON.stringify(warnSpy.mock.calls);
    expect(warnCallStr).toMatch(/confidence_invalid|cgame\.persist/i);
  });

  it("NAO persiste quando aggregator retorna confidence=undefined", async () => {
    const updateCgameRecentSpy = vi.fn(async () => undefined);
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      updateCgameRecent: updateCgameRecentSpy,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    mockCgameAggregator({
      aPct: 50,
      bPct: 30,
      cPct: 20,
      sampleSize: 100,
      // confidence undefined
    });
    vi.doMock("@anthropic-ai/sdk", () => ({
      default: function FakeAnthropic() { return null; },
    }));

    vi.spyOn(console, "warn").mockImplementation(() => {});
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

    expect(updateCgameRecentSpy).not.toHaveBeenCalled();
  });
});
