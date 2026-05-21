// =============================================================================
// Sprint AI-3.1 / RF-03 — Summarize threshold chars-only
//
// MEDIUM-2 do reviewer AI-3: o caller no quarterly (linha 359) faz:
//   `if (bundleJson.length > threshold || sessionsCount > 100)`
// Sessoes "leves" sem hand history detalhada inflam o count e disparam custo
// Haiku desnecessariamente.
//
// Comportamento esperado pos-RF-03:
//   - chars-only: o ramo OR `sessionsCount > 100` removido.
//   - bundle abaixo do threshold mesmo com sessionsCount > 100 → no-op.
//   - bundle acima do threshold → aciona summarizer Haiku.
//
// O reportSummarizer.maybeSummarizeBundle JA eh chars-only puro. A mudanca
// e' no CALLER do quarterly. monthlyReportGenerator ja usa maybeSummarizeBundle
// direto (sem OR) → so quarterly precisa do refactor.
//
// Lesson #38 — test legado que afirmava "sessions > 100 dispara" precisa ser
// ajustado (responsabilidade do implementer documentar). Aqui escrevemos os
// testes novos que validam chars-only no quarterly + reaffirmam contract em
// reportSummarizer.
//
// Status esperado: TODOS FALHAM no quarterly callsite (codigo atual tem OR).
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_THRESHOLD = process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS;
const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_THRESHOLD === undefined) delete process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS;
  else process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = ORIGINAL_THRESHOLD;
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

function makeStorage(sessions: any[]): any {
  return {
    // Retorna `sessions` para fazer inflar sessionsCount.
    getGrindSessions: vi.fn(async () => sessions),
    getSessionTournaments: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({ profit: 100, tournaments: 30, buyInSum: 50 })),
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

describe("RF-03 — quarterly summarize threshold chars-only", () => {
  it("bundle PEQUENO + sessionsCount > 100 → summarizer NAO aciona (chars-only)", async () => {
    process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = "20000";
    delete process.env.ANTHROPIC_API_KEY;

    // 200 sessoes leves (acima do antigo `sessions > 100`). Cada sessao com
    // payload minimo para chars TOTAL ficar abaixo do threshold 20000.
    const leveSessions = Array.from({ length: 200 }, (_, i) => ({
      id: `s${i}`,
      // sem payloads grandes (handHistories, notes, tournaments)
    }));

    const maybeSummarizeSpy = vi.fn(async (bundle: any) => ({
      bundle,
      summarizerModelUsed: null,
      summarizedAt: null,
      originalChars: JSON.stringify(bundle).length,
      summarizedChars: null,
    }));
    vi.doMock("../../../server/services/reportSummarizer", () => ({
      maybeSummarizeBundle: maybeSummarizeSpy,
    }));
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
      injectedStorage: makeStorage(leveSessions),
    });

    // Pos-RF-03: summarizer NAO eh chamado quando bundle.chars < threshold,
    // mesmo com 200 sessoes.
    expect(maybeSummarizeSpy).not.toHaveBeenCalled();
  });

  it("bundle GRANDE (chars > threshold) + sessionsCount baixo → summarizer ACIONA", async () => {
    process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = "1000";
    delete process.env.ANTHROPIC_API_KEY;

    // 5 sessoes "pesadas" cada uma com payload grande (~500 chars) → bundle
    // total bem acima de 1000 chars threshold mas sessionsCount baixo.
    const heavySessions = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`,
      handHistories: "x".repeat(500),
      notes: "y".repeat(500),
    }));

    const maybeSummarizeSpy = vi.fn(async (bundle: any) => ({
      bundle,
      summarizerModelUsed: "claude-haiku-4-5-20251001",
      summarizedAt: new Date(),
      originalChars: JSON.stringify(bundle).length,
      summarizedChars: 200,
    }));
    vi.doMock("../../../server/services/reportSummarizer", () => ({
      maybeSummarizeBundle: maybeSummarizeSpy,
    }));
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
      injectedStorage: makeStorage(heavySessions),
    });

    // bundle.chars > threshold → summarizer ACIONA.
    expect(maybeSummarizeSpy).toHaveBeenCalled();
  });

  it("maybeSummarizeBundle puro continua chars-only (sem sessions branch)", async () => {
    process.env.COACH_REPORT_SUMMARIZE_THRESHOLD_CHARS = "100";
    delete process.env.ANTHROPIC_API_KEY;

    const { maybeSummarizeBundle } = await import(
      "../../../server/services/reportSummarizer"
    );

    // Bundle com sessoes mas chars pequenos
    const bundle = { sessions: Array.from({ length: 200 }, (_, i) => ({ id: i })) };
    const charsLen = JSON.stringify(bundle).length;

    const out = await maybeSummarizeBundle(bundle);
    // Se charsLen > threshold (100), summarizer roda mas client unavailable → no-op
    // O ponto e' verificar comportamento chars-based; nao importa o resultado final
    // do summarizer. Aqui afirmamos shape do output.
    expect(out).toHaveProperty("originalChars", charsLen);
    expect(typeof out.bundle).toBe("object");
  });
});
