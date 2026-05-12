import { describe, it, expect, vi, afterEach } from "vitest";

// =============================================================================
// Reviewer follow-up — gerador do Weekly Report com storage de assinatura REAL
// (lesson #3). Arquivo SEPARADO de storage-real-shapes.integration.test.ts pra
// evitar que o `vi.doMock('weeklyReportGenerator', ...)` dos testes do processor
// vaze pra ca (vi.doMock persiste entre vi.resetModules).
//
// Reviewer round 3 (MEDIUM-1): getConsolidatedBalance NAO esta no objeto storage
// (eh metodo do walletService); getAiStructuredProfile NAO esta no objeto storage
// (eh funcao livre em storage/aiStructuredProfile.ts). Aqui mockamos os MODULOS
// (vi.mock) — NAO injetamos os metodos no fake `storage` (anti-padrao lesson #3).
// =============================================================================

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe("generateWeeklyReport — storage de assinatura REAL", () => {
  // O objeto `storage` so contem o que de fato esta atachado a ele em prod.
  // getConsolidatedBalance (walletService) e getAiStructuredProfile (storage/
  // aiStructuredProfile) sao mockados via vi.doMock dos modulos, abaixo.
  function realShapeStorage() {
    return {
      // getDashboardStats(userId, period) -> agregado: { count, profit, abi, roi(%), itm(%), finalTables(count), bigHits(count) }.
      getDashboardStats: vi.fn(async (_uid: string, period?: string) =>
        period === "30d"
          ? { count: 180, profit: 4200, abi: 10, roi: 9.5, itm: 18, finalTables: 8, bigHits: 2 }
          : { count: 42, profit: 1234.5, abi: 9, roi: 12.3, itm: 19, finalTables: 2, bigHits: 1 },
      ),
      // getPerformanceByPeriod(userId, period) -> serie diaria [{ date, profit, buyins, count }].
      getPerformanceByPeriod: vi.fn(async () => [
        { date: "2026-05-05", profit: 200, buyins: 50, count: 6 },
        { date: "2026-05-06", profit: -50, buyins: 40, count: 5 },
      ]),
      // getTournaments(userId, limit, offset, period, filters, sortBy) — ja filtra §6.1 internamente.
      getTournaments: vi.fn(async (_uid: string, _limit?: number, _offset?: number, _period?: string) => [
        { id: "t1", prize: "50", buyIn: "5", position: 3, grindSessionId: null },
      ]),
      // getAnalyticsByModifier(userId, { modifier }) -> { byModifier: [{ label, roi(fracao), n }] }.
      getAnalyticsByModifier: vi.fn(async () => ({
        byModifier: [
          { label: "Hyper", roi: -0.08, n: 120 },
          { label: "Regular", roi: 0.2, n: 80 },
        ],
      })),
      // getBankrollSnapshots(userId, { from, to, reason, limit }) -> desc por occurredAt; { newAmount, occurredAt }.
      getBankrollSnapshots: vi.fn(async () => [
        { id: "s2", newAmount: "2950.00", occurredAt: "2026-05-08T12:00:00Z" },
        { id: "s1", newAmount: "2800.00", occurredAt: "2026-05-04T01:00:00Z" }, // inicio da semana
      ]),
      // listWalletTransactionsByUser(userId, { from, to }) -> [{ direction, reason, usdAmount, nativeAmount, transferGroupId }].
      listWalletTransactionsByUser: vi.fn(async () => [
        { id: "tx1", direction: "out", reason: "withdrawal", usdAmount: "100.00", nativeAmount: "100.00" },
        { id: "tx2", direction: "out", reason: "transfer_out", usdAmount: "50.00", nativeAmount: "50.00", transferGroupId: "tg1" },
      ]),
      // getStudySessionsV2(userId, { from, to, limit }) -> [{ durationMinutes, themeId, lessonId }].
      getStudySessionsV2: vi.fn(async () => [
        { id: "ss1", durationMinutes: 60, themeId: "theme-icm" },
        { id: "ss2", durationMinutes: 30, themeId: "theme-icm" },
      ]),
      getStudySessions: vi.fn(async () => []), // v1 fallback vazio
      findActiveLeakFocusList: vi.fn(async () => [{ leakCode: "open-fold-bb", baselineSampleSize: 64, createdAt: "2026-04-01T00:00:00Z" }]),
      // getPlannedTournaments(userId) -> grade da semana.
      getPlannedTournaments: vi.fn(async () => [{ id: "p1", dayOfWeek: 1 }, { id: "p2", dayOfWeek: 2 }]),
      // getGrindSessions(userId, { limit }) -> filtrado por data internamente pelo gerador.
      getGrindSessions: vi.fn(async () => [
        { id: "g1", status: "completed", date: "2026-05-06T18:00:00Z" },
        { id: "g2", status: "planned", date: "2026-05-09T18:00:00Z" },
      ]),
      getActiveProfile: vi.fn(async () => null),
      getLastConsumedLessonIds: vi.fn(async () => []),
      getCatalogLessonsForRecommendation: vi.fn(async () => [{ id: "lesson-1", title: "ICM básico" }]),
      getLibraryLessonById: vi.fn(async () => ({ id: "lesson-1", slug: "icm-basico", title: "ICM básico (real)", courseSlug: "fundamentos" })),
      createCoachRecommendation: vi.fn(async (row: any) => ({ id: "rec-1", ...row })),
      upsertReport: vi.fn(async (row: any) => ({ id: "report-1", ...row })),
      getReportForPeriod: vi.fn(async () => null),
    } as any;
  }

  // Mocks dos MODULOS de walletService / aiStructuredProfile (NAO no objeto storage).
  function mockExternalServices() {
    vi.doMock("../../../server/services/walletService", () => ({
      walletService: {
        getConsolidatedBalance: vi.fn(async () => ({
          totalUSD: "3000.00",
          wallets: [
            { walletId: "w1", nativeCurrency: "USD", balanceNative: "2000.00", balanceUSD: "2000.00" },
            { walletId: "w2", nativeCurrency: "BRL", balanceNative: "5000.00", balanceUSD: "1000.00" },
          ],
          shotPockets: [],
        })),
      },
    }));
    vi.doMock("../../../server/storage/aiStructuredProfile", () => ({
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1, tomPreferido: "direct", nivel: "pro", focoDoMes: "ICM" })),
    }));
    // detectLeaks (coachLeakDetection) — mocka pra evitar require("./storage") real.
    vi.doMock("../../../server/coachLeakDetection", () => ({
      detectLeaks: vi.fn(async () => ([{ code: "open-fold-bb", severity: "medium", evidence: { n: 64 }, description: "open-fold demais BB" }])),
    }));
    // listWarmupRituals — funcao livre exportada em storage.ts; o mock de '../storage'
    // abaixo so exporta { storage }, entao o fallback do gerador (storage.listWarmupRituals?.())
    // entra e retorna { items: [] } (sem warm-up nesta fixture — secao mentalOps ausente).
  }

  function mockDepsRest() {
    vi.doMock("../../../server/coach/recommendLessonForUser", () => ({
      recommendLessonForUser: vi.fn(async () => ({ lessonId: "lesson-1", reason: "Seu leak de ICM sugere essa aula.", source: "coach" })),
    }));
    vi.doMock("../../../server/services/studyWeeklyPlanService", () => ({
      generateWeeklyStudyPlan: vi.fn(async (input: any) => ({ id: "plan-1", ...input })),
      hasCoachAccess: vi.fn(async () => true),
      hasCoachQuotaRemaining: vi.fn(async () => true),
    }));
    vi.doMock("../../../server/coach/prompts/weeklyReport", () => ({ buildWeeklyReportPrompt: vi.fn(() => "PROMPT"), WEEKLY_REPORT_SYSTEM: "SYSTEM" }));
  }

  function mockSdk(parsedJson: any, usage = { input_tokens: 1200, cache_creation_input_tokens: 400, cache_read_input_tokens: 100, output_tokens: 700 }) {
    const messagesCreate = vi.fn(async () => ({
      content: [{ type: "text", text: JSON.stringify(parsedJson) }],
      usage,
    }));
    class FakeAnthropic { messages = { create: messagesCreate }; constructor(_c: any) {} }
    return { FakeAnthropic, messagesCreate };
  }

  const OK_PARSED = {
    header: { title: "Sua semana — 04/mai a 10/mai", summaryLine: "42 torneios, +$1234 (ROI 12.3%).", comparison: "acima da media de 6 semanas" },
    sections: { volumeResults: { narrative: "Volume saudável." }, bankroll: { narrative: "Banca cresceu." }, selection: { narrative: "Rodou hypers demais." }, study: { narrative: "90min de estudo." } },
    insights: [
      { text: "ROI em hypers caiu pra -8% em 90d (n=120) [fonte: getAnalyticsByModifier:roi:90d].", citations: ["fonte: getAnalyticsByModifier:roi:90d"], confidence: "high" },
      { text: "Leak open-fold-bb (n=64) [fonte: detectLeaks].", citations: ["fonte: detectLeaks"], confidence: "medium" },
      { text: "Aderencia parcial a grade [fonte: planned vs grind].", citations: ["fonte: planned vs grind"], confidence: "low" },
    ],
    nextWeekPlan: { gradeSuggestionHref: "/coach", studyFocus: "ICM", recommendedAction: "Bloquear hypers GG." },
  };

  it("dados reais + LLM -> status=ready, secoes preenchidas (bankroll em USD via walletService.getConsolidatedBalance, snapshot do inicio da semana), 3 insights, recommendedLesson com titulo real + ctaHref /biblioteca/curso/...", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = realShapeStorage();
    const { FakeAnthropic } = mockSdk(OK_PARSED);
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));
    vi.doMock("../../../server/storage", () => ({ storage }));
    vi.doMock("../../../server/storage/coachPreferences", () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: "balanced", frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockExternalServices();
    mockDepsRest();

    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });

    expect(res.status).toBe("ready");
    expect(res.content.schemaVersion).toBe(1);
    // tom/nivel vem do perfil estruturado (mock do MODULO aiStructuredProfile, NAO do objeto storage).
    expect(res.content.tone).toBe("direct");
    expect(res.content.level).toBe("pro");
    // volume vindo de getDashboardStats (count/itm%/finalTables/bigHits/roi%).
    expect(res.content.sections.volumeResults.tournaments).toBe(42);
    expect(res.content.sections.volumeResults.finalTables).toBe(2);
    expect(res.content.sections.volumeResults.wins).toBe(1);
    expect(res.content.sections.volumeResults.roiWeek).toBeCloseTo(12.3, 1);
    // bankroll em USD: bankrollNow = totalUSD (walletService); bankrollStart = snapshot mais proximo do inicio (2800).
    expect(res.content.sections.bankroll.bankrollNow).toBe(3000);
    expect(res.content.sections.bankroll.bankrollStart).toBe(2800);
    // profitByCurrency vem dos wallets reais ({ nativeCurrency, balanceNative, balanceUSD }).
    expect(Array.isArray(res.content.sections.bankroll.profitByCurrency)).toBe(true);
    const curs = res.content.sections.bankroll.profitByCurrency.map((p: any) => p.currency).sort();
    expect(curs).toEqual(["BRL", "USD"]);
    for (const p of res.content.sections.bankroll.profitByCurrency) {
      expect(typeof p.usd).toBe("number");
    }
    // withdrawals/transfers das wallet_transactions reais (reason/transferGroupId).
    expect(res.content.sections.bankroll.withdrawals).toBe(100);
    expect(res.content.sections.bankroll.transfers).toBe(50);
    // selection: bottom Hyper com suggestBlock (roi -0.08 < -0.05 e n=120 >= 30).
    const hyperBottom = res.content.sections.selection.bottomCategories.find((c: any) => c.label === "Hyper");
    expect(hyperBottom?.suggestBlock).toBe(true);
    // study: 90 min (60+30 do v2).
    expect(res.content.sections.study.minutesLogged).toBe(90);
    // recommendedLesson: titulo REAL hidratado + ctaHref de curso.
    expect(res.content.sections.study.recommendedLesson?.title).toBe("ICM básico (real)");
    expect(res.content.sections.study.recommendedLesson?.ctaHref).toBe("/biblioteca/curso/fundamentos/icm-basico/play");
    // 3 insights.
    expect(res.content.insights.length).toBe(3);
    // CTAs so pra rotas registradas.
    const FORBIDDEN = ["/grade-planner", "/grade", "/stats"];
    for (const cta of res.content.cta) {
      if (cta.kind === "link") for (const f of FORBIDDEN) expect(cta.href).not.toBe(f);
    }
    // grind sessions completadas filtradas por data: g1 (06/mai) conta, g2 (09/mai planned) nao.
    expect(res.content.sections.volumeResults.sessionsCompleted).toBe(1);
    // back-fills chamados com as fontes reais.
    expect(storage.createCoachRecommendation).toHaveBeenCalled();
    expect(storage.getLibraryLessonById).toHaveBeenCalledWith("lesson-1");
  });

  it("LLM aluc gradeSuggestionHref=/grade-planner -> sanitizado pro default /coach (rota registrada — lesson #19)", async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    const storage = realShapeStorage();
    const { FakeAnthropic } = mockSdk({
      ...OK_PARSED,
      nextWeekPlan: { gradeSuggestionHref: "/grade-planner", studyFocus: "ICM", recommendedAction: "Bloquear hypers GG." },
    });
    vi.doMock("@anthropic-ai/sdk", () => ({ default: FakeAnthropic }));
    vi.doMock("../../../server/storage", () => ({ storage }));
    vi.doMock("../../../server/storage/coachPreferences", () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: "balanced", frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockExternalServices();
    mockDepsRest();

    const { generateWeeklyReport } = await import("../../../server/services/weeklyReportGenerator");
    const res: any = await generateWeeklyReport({ userId: "USER-0042", periodStart: "2026-05-04", periodEnd: "2026-05-10" });

    expect(res.status).toBe("ready");
    // o href alucinado NAO vaza pro content — caiu pro default seguro.
    expect(res.content.nextWeekPlan.gradeSuggestionHref).toBe("/coach");
    expect(res.content.nextWeekPlan.gradeSuggestionHref).not.toBe("/grade-planner");
  });
});
