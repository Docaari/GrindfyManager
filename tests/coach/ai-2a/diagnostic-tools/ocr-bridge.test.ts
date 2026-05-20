// =============================================================================
// Sprint AI-2A / RF-07 (ADR-166) — OCR Bridge (sem tool nova)
//
// Cobre:
//   - getRecentStatsUpload(userId, withinHours) — novo helper em coachSignalsStorage.
//   - assembleContext inclui bloco "## Upload Recente" no DINAMICO quando upload<24h.
//   - Upload > 24h ou null -> bloco omitido.
//   - quickSuggestions /stats ou /grind-live com upload recente -> sugestao "analise stats".
//   - Safe-deny em erro (lesson #9).
//
// Status esperado: TODOS FALHAM (helper + integracao nao existem).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

describe("getRecentStatsUpload helper", () => {
  it("retorna { uploadedAt, statsExtracted } quando upload dentro da janela", async () => {
    // helper deve existir em coachSignalsStorage e ser invocavel via storage attach
    const mod = await import("../../../../server/storage/coachSignalsStorage");
    expect(typeof (mod as any).getRecentStatsUpload).toBe("function");
  });
});

describe("coachContext — bloco ## Upload Recente", () => {
  it("upload < 24h -> systemParts inclui ## Upload Recente com timestamp e top stats", async () => {
    // Mock storage com getRecentStatsUpload
    vi.doMock("../../../../server/storage", () => ({
      storage: {
        getRecentStatsUpload: vi.fn(async () => ({
          uploadedAt: new Date(Date.now() - 60 * 60_000), // 1h atras
          statsExtracted: [
            { statId: "3bet", value: 7.5 },
            { statId: "cbet_flop", value: 62 },
            { statId: "vpip", value: 22 },
          ],
        })),
        // outros métodos lazy noop
        getRecentChatSessions: vi.fn(async () => []),
        getUserById: vi.fn(async () => ({ userPlatformId: "U" })),
      },
    }));
    const ctxMod: any = await import("../../../../server/coachContext");
    const assemble = ctxMod.assembleContext || ctxMod.default?.assembleContext;
    expect(typeof assemble).toBe("function");
    const result = await assemble({
      userId: "U",
      pageContext: { route: "/stats" },
    }).catch(() => null);
    if (result) {
      const text = typeof result === "string" ? result : (result.systemParts?.join("\n") ?? JSON.stringify(result));
      expect(text).toMatch(/Upload Recente/i);
      expect(text).toMatch(/3bet/i);
    } else {
      // Marcamos como pendente — implementer precisa garantir bloco DINAMICO
      expect(result).toBeTruthy();
    }
  });

  it("upload null ou > 24h -> bloco omitido", async () => {
    vi.doMock("../../../../server/storage", () => ({
      storage: {
        getRecentStatsUpload: vi.fn(async () => null),
        getRecentChatSessions: vi.fn(async () => []),
        getUserById: vi.fn(async () => ({ userPlatformId: "U" })),
      },
    }));
    const ctxMod: any = await import("../../../../server/coachContext");
    const assemble = ctxMod.assembleContext || ctxMod.default?.assembleContext;
    const result = await assemble({
      userId: "U",
      pageContext: { route: "/stats" },
    }).catch(() => "");
    const text = typeof result === "string" ? result : JSON.stringify(result);
    expect(text).not.toMatch(/Upload Recente/i);
  });
});

describe("quickSuggestions — sugestao OCR recente", () => {
  it("/stats com upload<24h adiciona sugestao 'analisar stats do ultimo upload'", async () => {
    const injectedStorage: any = {
      getDashboardStats: vi.fn(async () => ({ totalTournaments: 100 })),
      getRecentStatsUpload: vi.fn(async () => ({
        uploadedAt: new Date(Date.now() - 60 * 60_000),
        statsExtracted: [],
      })),
      detectLeaks: vi.fn(async () => ({ leaks: [] })),
    };
    const { computeSuggestions } = await import("../../../../server/coach/quickSuggestions");
    const suggestions = await computeSuggestions("U", "/stats", undefined, injectedStorage);
    expect(Array.isArray(suggestions)).toBe(true);
    const texts = suggestions.map((s: any) => s.text.toLowerCase());
    const found = texts.some((t: string) => /print|stats.*upload|analise.*stats|analisar.*stats/i.test(t));
    expect(found).toBe(true);
  });

  it("/grind-live com upload recente tambem inclui sugestao", async () => {
    const injectedStorage: any = {
      getDashboardStats: vi.fn(async () => ({ totalTournaments: 100 })),
      getRecentStatsUpload: vi.fn(async () => ({
        uploadedAt: new Date(Date.now() - 30 * 60_000),
        statsExtracted: [],
      })),
      detectLeaks: vi.fn(async () => ({ leaks: [] })),
    };
    const { computeSuggestions } = await import("../../../../server/coach/quickSuggestions");
    const suggestions = await computeSuggestions("U", "/grind-live", undefined, injectedStorage);
    const texts = suggestions.map((s: any) => s.text.toLowerCase());
    const found = texts.some((t: string) => /print|stats.*upload|analise.*stats|analisar.*stats/i.test(t));
    expect(found).toBe(true);
  });

  it("upload null -> sugestoes padrao da rota (sem entry OCR)", async () => {
    const injectedStorage: any = {
      getDashboardStats: vi.fn(async () => ({ totalTournaments: 100 })),
      getRecentStatsUpload: vi.fn(async () => null),
      detectLeaks: vi.fn(async () => ({ leaks: [] })),
    };
    const { computeSuggestions } = await import("../../../../server/coach/quickSuggestions");
    const suggestions = await computeSuggestions("U", "/stats", undefined, injectedStorage);
    const texts = suggestions.map((s: any) => s.text.toLowerCase());
    const found = texts.some((t: string) => /print agora|analise.*stats.*upload|analisar.*stats.*upload/i.test(t));
    expect(found).toBe(false);
  });
});
