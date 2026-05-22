// =============================================================================
// Sprint AI-3.2 / RF-C5 (ADR-203) — Q10 polish
//
// `quarterlyReportGenerator.cgamePersistPromise = Promise.resolve()` + `void`
// no final → substituido por inline `void updateCgameRecent(...).catch(err => log)`
// direto.
//
// Verifica que o pattern `cgamePersistPromise` foi removido + updateCgameRecent
// continua sendo invocado fire-and-forget (NAO bloqueia o return).
//
// Status esperado: FALHA enquanto `cgamePersistPromise` existir como variavel.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import * as path from "path";

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  vi.restoreAllMocks();
});

describe("RF-C5 — quarterly cgamePersistPromise inline await fire-and-forget", () => {
  it("grep: quarterlyReportGenerator.ts NAO contem 'cgamePersistPromise' como variavel local", async () => {
    const filePath = path.resolve(__dirname, "../../../server/services/quarterlyReportGenerator.ts");
    const src = await fs.readFile(filePath, "utf-8");
    // Pos-RF-C5: variavel `cgamePersistPromise` removida.
    expect(src).not.toMatch(/(const|let|var)\s+cgamePersistPromise/);
  });

  it("grep: quarterlyReportGenerator.ts usa `void updateCgameRecent(`", async () => {
    const filePath = path.resolve(__dirname, "../../../server/services/quarterlyReportGenerator.ts");
    const src = await fs.readFile(filePath, "utf-8");
    // Pos-RF-C5: pattern inline `void updateCgameRecent(...).catch(...)`.
    expect(src).toMatch(/void\s+updateCgameRecent\(/);
  });
});

describe("RF-C5 — disparo correto do updateCgameRecent", () => {
  it("quarterly invoca updateCgameRecent fire-and-forget (nao bloqueia return)", async () => {
    const updateCgameRecentMock = vi.fn(async () => {
      // Sleep para garantir que return NAO espera.
      await new Promise((r) => setTimeout(r, 200));
    });
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      updateAiStructuredProfile: vi.fn(async () => ({})),
      updateCgameRecent: updateCgameRecentMock,
      normalizeAiStructuredProfile: (x: any) => x ?? { schemaVersion: 1 },
    }));
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      callReportLlm: vi.fn(async () => ({ content: {}, usage: null, rawText: "", degradedReason: "no_anthropic_key" })),
      WHITELISTED_TONES: ["neutro", "incisivo", "gentil", "gentle", "balanced", "direct"],
      WHITELISTED_LEVELS: ["iniciante", "intermediario", "avancado"],
      getAnthropicClient: vi.fn(async () => null),
    }));

    const storage: any = {
      getGrindSessions: vi.fn(async () => []),
      countGrindSessions: vi.fn(async () => 0),
      getSessionTournaments: vi.fn(async () => []),
      getPerformanceByPeriod: vi.fn(async () => ({ profit: 100 })),
      getUserProfile: vi.fn(async () => ({
        userPlatformId: "USER-C5",
        country: "BR",
        timezone: "America/Sao_Paulo",
        aiStructuredProfile: { schemaVersion: 1 },
      })),
      listWarmupRitualsForRange: vi.fn(async () => []),
      listMentalHandsForRange: vi.fn(async () => []),
      listActiveCareerGoals: vi.fn(async () => []),
      findActiveLeakFocusList: vi.fn(async () => []),
      persistReport: vi.fn(async (p: any) => ({ ...p, id: "rep-c5" })),
    };

    const { generateQuarterlyReport } = await import(
      "../../../server/services/quarterlyReportGenerator"
    );
    const start = Date.now();
    await generateQuarterlyReport({
      userId: "USER-C5",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      injectedStorage: storage,
    } as any).catch(() => undefined);
    const elapsed = Date.now() - start;

    // Fire-and-forget: return NAO aguarda os 200ms do updateCgameRecent.
    // Tolerar ate 180ms (deve ser bem menor).
    expect(elapsed).toBeLessThan(180);
  });
});
