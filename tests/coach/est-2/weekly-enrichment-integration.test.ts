import { describe, it, expect, vi, afterEach } from "vitest";

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint EST-2 — integracao do gerador enriquecido (generateWeeklyReport).
//   RF-01 gatherBundle FASE 2: coleta sessionIds das grindSessions, chama
//         getBreakFeedbacksBySessionIds em safe(); [] em vazio/erro.
//   RF-05 schemaVersion = 2 quando mentalState || studyWeek != null; senao 1.
//   RF-06 mergeLlm propaga sections.mentalState.narrative + studyWeek.narrative.
//   RF-07 renderMarkdown: blocos "## Estado mental da semana" + "## Estudo da
//         semana" presentes quando os campos existem; OMITIDOS quando ausentes.
//   RF-08 o `bundle` passado ao callReportLlm NAO contem o array cru breakFeedbacks
//         (so a agregacao mentalState).
//
// Lessons: #3 (storage shape real), #9 (degrade), #34 (injectedStorage via storage mock).
// Status esperado: TODOS FALHAM (gerador ainda nao enriquece).
// =============================================================================

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

const UNIQUE_BREAK_NOTE = "RAW_BREAK_NOTE_DO_NOT_LEAK_42";

function bf(sessionId: string, breakTime: string, dims: Record<string, number>, notes: string | null = null) {
  return {
    id: `bf-${sessionId}-${breakTime}`,
    userId: "USER-0042",
    sessionId,
    breakTime,
    foco: dims.foco ?? 5,
    energia: dims.energia ?? 5,
    confianca: dims.confianca ?? 5,
    inteligenciaEmocional: dims.inteligenciaEmocional ?? 5,
    interferencias: dims.interferencias ?? 5,
    notes,
    createdAt: breakTime,
  };
}

// storage com shape REAL (lesson #3). breakFeedbacks/study EST-3 configuraveis.
function realShapeStorage(opts: { breaks?: any[]; studyV2?: any[]; grindExtra?: Record<string, any> } = {}) {
  const breaks = opts.breaks ?? [];
  const studyV2 = opts.studyV2 ?? [];
  const getBreakFeedbacksBySessionIds = vi.fn(async (_uid: string, _ids: string[]) => breaks);
  const storage: any = {
    getDashboardStats: vi.fn(async (_uid: string, period?: string) =>
      period === "30d"
        ? { count: 180, profit: 4200, abi: 10, roi: 9.5, itm: 18, finalTables: 8, bigHits: 2 }
        : { count: 42, profit: 1234.5, abi: 9, roi: 12.3, itm: 19, finalTables: 2, bigHits: 1 }),
    getPerformanceByPeriod: vi.fn(async () => [{ date: "2026-05-05", profit: 200, buyins: 50, count: 6 }]),
    getTournaments: vi.fn(async () => [{ id: "t1", prize: "50", buyIn: "5", position: 3, grindSessionId: null }]),
    getAnalyticsByModifier: vi.fn(async () => ({ byModifier: [{ label: "Hyper", roi: -0.08, n: 120 }] })),
    getBankrollSnapshots: vi.fn(async () => [{ id: "s1", newAmount: "2800.00", occurredAt: "2026-05-04T01:00:00Z" }]),
    listWalletTransactionsByUser: vi.fn(async () => []),
    getStudySessionsV2: vi.fn(async () => studyV2),
    getStudySessions: vi.fn(async () => []),
    findActiveLeakFocusList: vi.fn(async () => []),
    getPlannedTournaments: vi.fn(async () => [{ id: "p1", dayOfWeek: 1 }]),
    getGrindSessions: vi.fn(async () => [
      { id: "g1", status: "completed", date: "2026-05-06T18:00:00Z", ...(opts.grindExtra ?? {}) },
      { id: "g2", status: "planned", date: "2026-05-09T18:00:00Z" },
    ]),
    getBreakFeedbacksBySessionIds,
    getActiveProfile: vi.fn(async () => null),
    getLastConsumedLessonIds: vi.fn(async () => []),
    getCatalogLessonsForRecommendation: vi.fn(async () => [{ id: "lesson-1", title: "ICM" }]),
    getLibraryLessonById: vi.fn(async () => null),
    createCoachRecommendation: vi.fn(async (row: any) => ({ id: "rec-1", ...row })),
    upsertReport: vi.fn(async (row: any) => ({ id: "report-1", ...row })),
    getReportForPeriod: vi.fn(async () => null),
  };
  return { storage, getBreakFeedbacksBySessionIds };
}

function mockSharedDeps(storage: any) {
  vi.doMock("../../../server/storage", () => ({ storage }));
  vi.doMock("../../../server/storage/coachPreferences", () => ({
    getCoachPreferences: vi.fn(async () => ({ coachTone: "balanced", frozenCategories: {}, reportWeeklyEnabled: true })),
  }));
  vi.doMock("../../../server/services/walletService", () => ({
    walletService: { getConsolidatedBalance: vi.fn(async () => ({ totalUSD: "3000.00", wallets: [{ nativeCurrency: "USD", balanceNative: "3000.00", balanceUSD: "3000.00" }] })) },
  }));
  vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
    getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1, tomPreferido: "balanced", nivel: "intermediario" })),
  }));
  vi.doMock("../../../server/coachLeakDetection", () => ({ detectLeaks: vi.fn(async () => []) }));
  vi.doMock("../../../server/coach/recommendLessonForUser", () => ({ recommendLessonForUser: vi.fn(async () => null) }));
  vi.doMock("../../../server/services/studyWeeklyPlanService", () => ({ generateWeeklyStudyPlan: vi.fn(async (i: any) => ({ id: "plan-1", ...i })) }));
}

describe("EST-2 — RF-01 gatherBundle FASE 2 (break_feedbacks por sessionIds)", () => {
  it("chama getBreakFeedbacksBySessionIds com os ids das grind sessions da semana", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY; // caminho deterministico
    const { storage, getBreakFeedbacksBySessionIds } = realShapeStorage({
      breaks: [bf("g1", "2026-05-06T20:00:00Z", { foco: 8 }), bf("g1", "2026-05-06T22:00:00Z", { foco: 4 })],
    });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });
    expect(getBreakFeedbacksBySessionIds).toHaveBeenCalled();
    const idsArg = getBreakFeedbacksBySessionIds.mock.calls[0][1];
    expect(idsArg).toEqual(expect.arrayContaining(["g1", "g2"]));
  });

  it("storage.getBreakFeedbacksBySessionIds lanca -> bundle degrada [], relatorio nao quebra", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { storage } = realShapeStorage();
    storage.getBreakFeedbacksBySessionIds = vi.fn(async () => { throw new Error("db down"); });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });
    expect(res.status).toBeDefined(); // gerou (degraded por no-key, mas nao crashou)
  });
});

describe("EST-2 — RF-05 schemaVersion + populacao das secoes", () => {
  it("com breaks + estudo EST-3 -> schemaVersion 2 + mentalState + studyWeek presentes", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY; // deterministico ainda deve popular as secoes
    const { storage } = realShapeStorage({
      breaks: [
        bf("g1", "2026-05-06T20:00:00Z", { foco: 8, energia: 8 }),
        bf("g1", "2026-05-06T22:00:00Z", { foco: 4, energia: 4 }),
      ],
      studyV2: [{ id: "ss1", mode: "stat_analysis", durationMinutes: 60, themeId: "theme-icm", handsSolvedCount: 12, filtersAnalyzedCount: 3, statAnalysisEntries: [{}, {}], lessonInsights: "aprendi X" }],
      grindExtra: { finalNotes: "joguei cansado no fim", objectiveCompleted: true },
    });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });
    expect(res.content.schemaVersion).toBe(2);
    expect(res.content.mentalState).toBeDefined();
    expect(res.content.mentalState.breakCount).toBe(2);
    expect(res.content.studyWeek).toBeDefined();
    expect(res.content.studyWeek.handsSolvedTotal).toBe(12);
    expect(res.content.studyWeek.statAnalysisEntriesTotal).toBe(2);
  });

  it("sem breaks, sem estudo, sem notas -> schemaVersion 1 + sem mentalState/studyWeek", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { storage } = realShapeStorage({ breaks: [], studyV2: [] });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });
    expect(res.content.schemaVersion).toBe(1);
    expect(res.content.mentalState).toBeUndefined();
    expect(res.content.studyWeek).toBeUndefined();
  });
});

describe("EST-2 — RF-07 renderMarkdown blocos novos", () => {
  it("markdown inclui '## Estado mental da semana' + '## Estudo da semana' quando presentes", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { storage } = realShapeStorage({
      breaks: [bf("g1", "2026-05-06T20:00:00Z", { foco: 8 }), bf("g1", "2026-05-06T22:00:00Z", { foco: 4 })],
      studyV2: [{ id: "ss1", mode: "drill_gto", durationMinutes: 60, themeId: "theme-icm", handsSolvedCount: 20 }],
    });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });
    expect(res.markdown).toContain("## Estado mental da semana");
    expect(res.markdown).toContain("## Estudo da semana");
  });

  it("markdown OMITE os blocos novos quando mentalState/studyWeek ausentes (back-compat)", async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { storage } = realShapeStorage({ breaks: [], studyV2: [] });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });
    expect(res.markdown).not.toContain("## Estado mental da semana");
    expect(res.markdown).not.toContain("## Estudo da semana");
  });
});

describe("EST-2 — RF-06 + RF-08 caminho LLM (callReportLlm)", () => {
  it("RF-08: o bundle passado ao callReportLlm NAO contem o array cru breakFeedbacks (so a agregacao)", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const captured: any[] = [];
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      WHITELISTED_TONES: ["balanced"],
      WHITELISTED_LEVELS: ["intermediario"],
      callReportLlm: vi.fn(async (input: any) => {
        captured.push(input.bundle);
        return {
          content: {
            header: { title: "Sua semana", summaryLine: "ok" },
            sections: { mentalState: { narrative: "Seu foco caiu no fim — fadiga." }, studyWeek: { narrative: "Bom volume de estudo." } },
            insights: [
              { text: "a", citations: ["fonte: x"] },
              { text: "b", citations: ["fonte: y"] },
              { text: "c", citations: ["fonte: z"] },
            ],
            nextWeekPlan: { gradeSuggestionHref: "/coach", studyFocus: "ICM", recommendedAction: "..." },
          },
          usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          rawText: "{}",
        };
      }),
    }));
    const { storage } = realShapeStorage({
      breaks: [bf("g1", "2026-05-06T20:00:00Z", { foco: 8 }, UNIQUE_BREAK_NOTE), bf("g1", "2026-05-06T22:00:00Z", { foco: 4 })],
      studyV2: [{ id: "ss1", mode: "drill_gto", durationMinutes: 60, themeId: "theme-icm", handsSolvedCount: 5 }],
    });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });

    expect(captured.length).toBe(1);
    const serialized = JSON.stringify(captured[0]);
    // a nota crua de break NAO pode vazar pro prompt do LLM.
    expect(serialized).not.toContain(UNIQUE_BREAK_NOTE);
    // mas a agregacao deterministica (fatigueSignal/mentalState) DEVE estar la.
    expect(serialized).toContain("fatigueSignal");
  });

  it("RF-06: mergeLlm propaga narrative de mentalState + studyWeek pro content", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    vi.doMock("../../../server/coach/anthropicClient", () => ({
      WHITELISTED_TONES: ["balanced"],
      WHITELISTED_LEVELS: ["intermediario"],
      callReportLlm: vi.fn(async () => ({
        content: {
          header: { title: "Sua semana", summaryLine: "ok" },
          sections: { mentalState: { narrative: "Seu foco caiu no fim — fadiga." }, studyWeek: { narrative: "Bom volume de estudo." } },
          insights: [
            { text: "a", citations: ["fonte: x"] },
            { text: "b", citations: ["fonte: y"] },
            { text: "c", citations: ["fonte: z"] },
          ],
          nextWeekPlan: { gradeSuggestionHref: "/coach", studyFocus: "ICM", recommendedAction: "..." },
        },
        usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
        rawText: "{}",
      })),
    }));
    const { storage } = realShapeStorage({
      breaks: [bf("g1", "2026-05-06T20:00:00Z", { foco: 8 }), bf("g1", "2026-05-06T22:00:00Z", { foco: 4 })],
      studyV2: [{ id: "ss1", mode: "drill_gto", durationMinutes: 60, themeId: "theme-icm", handsSolvedCount: 5 }],
    });
    mockSharedDeps(storage);
    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });
    expect(res.content.mentalState.narrative).toBe("Seu foco caiu no fim — fadiga.");
    expect(res.content.studyWeek.narrative).toBe("Bom volume de estudo.");
  });
});
