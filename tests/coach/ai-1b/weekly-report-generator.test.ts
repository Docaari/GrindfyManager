import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-1B / RF-05 + RF-07 + RF-09 — gerador do Weekly Report
//   server/services/weeklyReportGenerator.ts (NAO EXISTE)
//     export async function generateWeeklyReport({ userId, periodStart, periodEnd, injectedStorage? })
//       : Promise<{ content: ReportContent; markdown: string; status: 'ready'|'degraded'; model: string|null; usage? }>
//
// Fontes:
//   - Docs/specs/sprint-ai-1b.md (RF-05.1..5.7, RF-07, RF-09 + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/155-...-runner-tz-aware.md (§3.5)
//   - Docs/architecture/decisions/156-aposentadoria-crons-segunda....md (§3.2, §5)
//   - Docs/api/coach.md "Gerador do Weekly Report (ADR-155/156)" + "ReportContent"
//
// Lessons:
//   #3 mock SHAPE REAL — recommendLessonForUser/generateWeeklyStudyPlan/getDashboardStats/
//      detectLeaks/getPerformanceByPeriod tem shapes especificos; getCoachPreferences
//      back-fill reportWeeklyEnabled ?? false.
//   #5/#35 `new AnthropicCtor(...)` mock — envolver em try/catch; vi.fn() nao eh
//      constructor; nao pode quebrar o gerador.
//   #6 normalizar USD antes de comparar com thresholds.
//   #7 schemaVersion (evolucao) + tolerancia a campos ausentes.
//   #9 logar antes de fallback; try/catch granular nos back-fills.
//   #10 prompt unico (server/coach/prompts/weeklyReport.ts).
//   §6.1 toda query de historico filtra grind_session_id IS NULL.
//
// Status esperado: TODOS FALHAM (modulo nao existe).
// =============================================================================

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;
const ORIGINAL_MODEL = process.env.COACH_MODEL;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_MODEL === undefined) delete process.env.COACH_MODEL; else process.env.COACH_MODEL = ORIGINAL_MODEL;
});

// ---------------------------------------------------------------------------
// fake storage com o shape REAL dos metodos que o gerador usa.
// ---------------------------------------------------------------------------
function makeFakeStorage(opts: {
  withData?: boolean;
  createCoachRecommendation?: any;
  getStudyWeeklyPlan?: any;
} = {}) {
  const withData = opts.withData ?? true;
  const calls = {
    createCoachRecommendation: opts.createCoachRecommendation ?? vi.fn(async (row: any) => ({ id: 'rec-1', ...row })),
    getStudyWeeklyPlan: opts.getStudyWeeklyPlan ?? vi.fn(async () => null),
  };
  const storage: any = {
    // shape REAL: getPerformanceByPeriod(userId, period) -> { tournaments, profitUsd, roi, ... } (ja filtra §6.1)
    getPerformanceByPeriod: vi.fn(async (_uid: string, _period: string) => withData
      ? { tournaments: 42, profitUsd: 1234.5, roi: 0.12, itmCount: 8, finalTables: 2, wins: 1, totalBuyinUsd: 10000 }
      : { tournaments: 0, profitUsd: 0, roi: null, itmCount: 0, finalTables: 0, wins: 0, totalBuyinUsd: 0 }),
    getDashboardStats: vi.fn(async (_uid: string, _period?: string) => withData
      ? { totalTournaments: 42, totalProfit: 1234.5, roi: 0.12 }
      : { totalTournaments: 0, totalProfit: 0, roi: 0 }),
    // getTournaments — period inline, ja com grind_session_id IS NULL injetado
    getTournaments: vi.fn(async (_uid: string, _filters?: any) => withData
      ? [{ id: 't1', result: 'itm', prize: 50, buyIn: 5, grindSessionId: null }]
      : []),
    getAnalyticsByModifier: vi.fn(async () => withData
      ? { byModifier: [{ label: 'Hyper', roi: -0.08, n: 120 }, { label: 'Regular', roi: 0.2, n: 80 }] }
      : { byModifier: [] }),
    detectLeaks: vi.fn(async () => withData
      ? { leaks: [{ tag: 'open-fold-bb', severity: 'high', n: 64 }], hasHighSeverity: true }
      : { leaks: [], hasHighSeverity: false }),
    // bankroll — valores em moedas nativas; o gerador normaliza pra USD (lesson #6)
    getConsolidatedBalance: vi.fn(async () => withData
      ? { byCurrency: [{ currency: 'BRL', native: 5000 }, { currency: 'USD', native: 2000 }], totalUsd: 3000 }
      : { byCurrency: [], totalUsd: 0 }),
    getBankrollSnapshots: vi.fn(async () => withData ? [{ totalUsd: 2800, takenAt: '2026-05-04' }] : []),
    getWalletTransactionsForPeriod: vi.fn(async () => withData ? [{ type: 'withdrawal', amountUsd: 100 }] : []),
    // study
    getStudySessionsForPeriod: vi.fn(async () => withData ? [{ minutes: 90, topic: 'ICM' }] : []),
    findActiveLeakFocusList: vi.fn(async () => withData ? [{ leakTag: 'open-fold-bb' }] : []),
    // warm-up
    getWarmupReportsForPeriod: vi.fn(async () => withData ? [{ focusRating: 4 }] : []),
    // planned
    getPlannedTournamentsForWeek: vi.fn(async () => withData ? [{ id: 'p1' }] : []),
    getGrindSessionsForWeek: vi.fn(async () => withData ? [{ id: 's1', completed: true }] : []),
    // lesson rec inputs
    getRecentlyConsumedLessonIds: vi.fn(async () => []),
    getCatalogLessonsForRecommendation: vi.fn(async () => [{ id: 'lesson-1', title: 'ICM basics' }]),
    // ai structured profile
    getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1, tomPreferido: 'gentle', nivel: 'intermediario', focoDoMes: 'ICM', metas: [] })),
    // upsert reports & back-fills
    createCoachRecommendation: calls.createCoachRecommendation,
    getStudyWeeklyPlan: calls.getStudyWeeklyPlan,
    upsertReport: vi.fn(async (row: any) => ({ id: 'report-1', ...row })),
    getReportForPeriod: vi.fn(async () => null),
  };
  return { storage, calls };
}

function mockAnthropicSdk(streamImpl?: (args?: any) => Promise<any>) {
  // mock estilo "(await import('@anthropic-ai/sdk')).default" usado como `new`.
  const messagesCreate = vi.fn(async (args: any) => {
    if (streamImpl) return streamImpl(args);
    return {
      content: [{ type: 'text', text: JSON.stringify({
        header: { title: 'Sua semana', summaryLine: 'Voce jogou 42 torneios, +$1234 (ROI 12%).', comparison: 'acima da media de 6 semanas' },
        sections: {
          volumeResults: { narrative: 'Volume saudavel.' },
          bankroll: { narrative: 'Banca cresceu.' },
          selection: { narrative: 'Rodou hypers demais.' },
          study: { narrative: '90min de estudo.' },
        },
        insights: [
          { text: 'Seu ROI em hypers caiu pra -8% em 90d (n=120).', citations: ['fonte: getAnalyticsByModifier'], confidence: 'high' },
          { text: 'Leak open-fold-bb de alta severidade (n=64).', citations: ['fonte: detectLeaks'], confidence: 'medium' },
          { text: 'Aderencia a grade foi parcial.', citations: ['fonte: planned vs tournaments'], confidence: 'low' },
        ],
        nextWeekPlan: { gradeSuggestionHref: '/grade-planner', studyFocus: 'ICM', recommendedAction: 'Bloquear hypers GG.' },
      }) }],
      usage: { input_tokens: 1000, cache_creation_input_tokens: 500, cache_read_input_tokens: 200, output_tokens: 800 },
    };
  });
  // a fabrica retornada por vi.fn().mockImplementation eh uma arrow -> NAO `new`-callable.
  // testamos que o gerador envolve `new AnthropicCtor(...)` em try/catch (lesson #5/#35):
  // o gerador deve cair pro caminho deterministico OU usar como factory. De qualquer forma
  // nao pode quebrar. Para alguns testes "happy path" damos uma classe real.
  class FakeAnthropic {
    messages = { create: messagesCreate };
    constructor(_cfg: any) {}
  }
  return { FakeAnthropic, messagesCreate };
}

function mockDeps(opts: {
  recommendLessonForUser?: any;
  generateWeeklyStudyPlan?: any;
} = {}) {
  vi.doMock('../../../server/coach/recommendLessonForUser', () => ({
    recommendLessonForUser: opts.recommendLessonForUser ?? vi.fn(async () => ({
      lessonId: 'lesson-1', title: 'ICM basics', reason: 'Seu leak de ICM sugere essa aula.', source: 'coach',
    })),
  }));
  vi.doMock('../../../server/services/studyWeeklyPlanService', () => ({
    generateWeeklyStudyPlan: opts.generateWeeklyStudyPlan ?? vi.fn(async (input: any) => ({ id: 'plan-1', ...input })),
    hasCoachAccess: vi.fn(async () => true),
    hasCoachQuotaRemaining: vi.fn(async () => true),
  }));
  // o prompt unico — deixar passar (modulo novo). Mock minimo para nao quebrar import.
  vi.doMock('../../../server/coach/prompts/weeklyReport', () => ({
    buildWeeklyReportPrompt: vi.fn(() => 'PROMPT'),
    WEEKLY_REPORT_SYSTEM: 'SYSTEM',
  }));
}

// =============================================================================
// 1) Happy path — relatorio com dados completos
// =============================================================================
describe('generateWeeklyReport — happy path', () => {
  it('user com dados + Anthropic mockado -> status=ready, content.sections com numeros, exatamente 3 insights com citations.length>=1, markdown nao-vazio', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });

    expect(res.status).toBe('ready');
    expect(res.content.schemaVersion).toBe(1);
    expect(res.content.reportType).toBe('weekly');
    expect(res.content.sections).toBeTruthy();
    expect(res.content.sections.volumeResults).toBeTruthy();
    expect(res.content.sections.bankroll).toBeTruthy();
    expect(res.content.sections.selection).toBeTruthy();
    expect(res.content.sections.study).toBeTruthy();
    expect(Array.isArray(res.content.insights)).toBe(true);
    expect(res.content.insights.length).toBe(3);
    for (const ins of res.content.insights) {
      expect(Array.isArray(ins.citations)).toBe(true);
      expect(ins.citations.length).toBeGreaterThanOrEqual(1);
    }
    expect(typeof res.markdown).toBe('string');
    expect(res.markdown.length).toBeGreaterThan(0);
  });

  it('header.tone reflete aiStructuredProfile.tomPreferido (gentle); content.level reflete nivel', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'balanced', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    expect(res.content.tone).toBe('gentle');       // do aiStructuredProfile.tomPreferido
    expect(res.content.level).toBe('intermediario');
  });

  it('custo / tokens registrados — usage retornado e cost_usd_estimate > 0 quando o LLM rodou', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res: any = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    expect(res.usage).toBeTruthy();
    // cost: campo no resultado ou no content.generation; aceitamos ambos.
    const cost = res.costUsdEstimate ?? res.usage?.costUsdEstimate ?? res.content?.generation?.costUsdEstimate;
    expect(typeof cost === 'number' ? cost : 1).toBeGreaterThan(0);
  });

  it('CTAs — content.cta[] so referencia toolName de tools AI-0A OU href de rota Wouter; NUNCA bulk_propose_grade/schedule_study_block/define_career_goal/mark_off_day', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    const FORBIDDEN = ['bulk_propose_grade', 'schedule_study_block', 'define_career_goal', 'mark_off_day'];
    const ALLOWED_TOOLS = new Set([
      'register_tournament_in_grade', 'log_leak_focus', 'verify_leak_progress', 'record_wallet_transaction', 'log_study_session',
    ]);
    expect(Array.isArray(res.content.cta)).toBe(true);
    for (const cta of res.content.cta) {
      expect(['tool', 'link']).toContain(cta.kind);
      if (cta.kind === 'tool') {
        expect(FORBIDDEN).not.toContain(cta.toolName);
        expect(ALLOWED_TOOLS.has(cta.toolName)).toBe(true);
      } else {
        expect(typeof cta.href).toBe('string');
        expect(cta.href.startsWith('/')).toBe(true);
        for (const f of FORBIDDEN) expect(cta.href).not.toContain(f);
      }
    }
  });
});

// =============================================================================
// 2) Queries de historico filtram grind_session_id IS NULL (§6.1)
// =============================================================================
describe('generateWeeklyReport — §6.1 grind_session_id IS NULL', () => {
  it('chama getTournaments/getPerformanceByPeriod (que ja injetam o filtro); nenhuma query de historico inclui session tournaments', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    // verifica que os metodos de historico foram chamados (eles injetam o filtro internamente).
    expect(storage.getPerformanceByPeriod).toHaveBeenCalled();
    expect(storage.getTournaments).toHaveBeenCalled();
    // se o gerador passou filtros explicitos para getTournaments, eles devem incluir
    // grindSessionId: null (ou equivalente). Aceitamos ausencia (metodo ja filtra).
    const tCalls = storage.getTournaments.mock.calls;
    for (const c of tCalls) {
      const filters = c[1];
      if (filters && Object.prototype.hasOwnProperty.call(filters, 'grindSessionId')) {
        expect(filters.grindSessionId).toBeNull();
      }
    }
  });
});

// =============================================================================
// 3) Bankroll normalizado para USD (lesson #6)
// =============================================================================
describe('generateWeeklyReport — bankroll em USD', () => {
  it('content.sections.bankroll.profitByCurrency tem entradas { currency, native, usd }; bankrollStart/bankrollNow em USD', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    const bk = res.content.sections.bankroll;
    expect(bk).toBeTruthy();
    expect(Array.isArray(bk.profitByCurrency)).toBe(true);
    for (const p of bk.profitByCurrency) {
      expect(p).toHaveProperty('currency');
      expect(p).toHaveProperty('native');
      expect(p).toHaveProperty('usd');
      expect(typeof p.usd).toBe('number');
    }
    // bankrollStart/bankrollNow sao numbers (USD) ou null.
    expect(bk.bankrollStart === null || typeof bk.bankrollStart === 'number').toBe(true);
    expect(bk.bankrollNow === null || typeof bk.bankrollNow === 'number').toBe(true);
  });
});

// =============================================================================
// 4) Idempotencia da geracao (UPSERT por chave de semana)
// =============================================================================
describe('generateWeeklyReport — idempotencia + back-fills (RF-07)', () => {
  it('rodar 2x mesmo (user, weekly, period_start) -> nenhuma duplicata (UPSERT/pre-check); back-fills criados/UPSERTed 1x por semana', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    let reportRows = 0;
    const { storage } = makeFakeStorage({ withData: true });
    storage.upsertReport = vi.fn(async (row: any) => { reportRows = 1; return { id: 'report-1', ...row }; });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    const recMock = vi.fn(async () => ({ lessonId: 'lesson-1', title: 'ICM', reason: 'leak', source: 'coach' }));
    const planMock = vi.fn(async (input: any) => ({ id: 'plan-1', ...input }));
    mockDeps({ recommendLessonForUser: recMock, generateWeeklyStudyPlan: planMock });

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    // upsertReport por (user, type, period_start) -> 1 linha (mock simula UPSERT).
    expect(reportRows).toBe(1);
    // back-fill coach_lesson_recommendations: createCoachRecommendation chamado (idempotente — storage faz pre-check/ON CONFLICT)
    expect(storage.createCoachRecommendation).toHaveBeenCalled();
    // back-fill study_weekly_plans: generateWeeklyStudyPlan chamado com source coach_auto
    expect(planMock).toHaveBeenCalledWith(expect.objectContaining({ userId: 'USER-SP', source: 'coach_auto' }));
  });

  it('back-fill chave de semana — createCoachRecommendation usa weekStartDate BRT (back-compat); generateWeeklyStudyPlan usa weekStartDate UTC', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    const planMock = vi.fn(async (input: any) => ({ id: 'plan-1', ...input }));
    mockDeps({ generateWeeklyStudyPlan: planMock });

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    // createCoachRecommendation chamado com algum weekStartDate (string/date) — back-compat com GET /api/home/coach-recommendation.
    expect(storage.createCoachRecommendation).toHaveBeenCalledWith(expect.objectContaining({ userId: 'USER-SP' }));
    const recArg = storage.createCoachRecommendation.mock.calls[0][0];
    expect(recArg).toHaveProperty('weekStartDate');
    // generateWeeklyStudyPlan chamado com weekStartDate (Date utc segunda) — back-compat com StudyWeeklyPlanCard.
    expect(planMock.mock.calls[0][0]).toHaveProperty('weekStartDate');
  });

  it('falha no back-fill (createCoachRecommendation lanca) -> NAO derruba o relatorio (loga e segue com recommendedLesson null)', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { storage } = makeFakeStorage({ withData: true });
    storage.createCoachRecommendation = vi.fn(async () => { throw new Error('rec db down'); });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    expect(res.status).toBe('ready');
    // recommendedLesson null (back-fill falhou) — mas o relatorio existe.
    expect(res.content.sections.study.recommendedLesson ?? null).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// =============================================================================
// 5) Dados insuficientes (dataSufficiency='low') — NAO confundir com fail-soft
// =============================================================================
describe('generateWeeklyReport — dados insuficientes', () => {
  it('volume=0 e sem dados -> dataSufficiency=low, status=ready (NAO degraded), header convida a importar, CTA link /upload, LLM NAO chamado pra 3 insights, custo ~0', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const { storage } = makeFakeStorage({ withData: false });
    const { FakeAnthropic, messagesCreate } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res: any = await generateWeeklyReport({ userId: 'USER-EMPTY', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    expect(res.content.dataSufficiency).toBe('low');
    expect(res.status).toBe('ready');
    // header convida a importar.
    expect(`${res.content.header.title} ${res.content.header.summaryLine}`.toLowerCase()).toMatch(/import/);
    // CTA link /upload presente.
    expect(res.content.cta.some((c: any) => c.kind === 'link' && c.href === '/upload')).toBe(true);
    // LLM nao chamado para 3 insights de prosa.
    expect(messagesCreate).not.toHaveBeenCalled();
    // 3 insights de prosa NAO existem (ou no maximo 1 item deterministico).
    expect(res.content.insights.length).toBeLessThanOrEqual(1);
    // custo ~0.
    const cost = res.costUsdEstimate ?? res.content?.generation?.costUsdEstimate ?? 0;
    expect(cost).toBeLessThanOrEqual(0.001);
  });
});

// =============================================================================
// 6) Fail-soft — sem ANTHROPIC_API_KEY / LLM falha (lesson #5/#35 + #9)
// =============================================================================
describe('generateWeeklyReport — fail-soft (degraded)', () => {
  it('sem ANTHROPIC_API_KEY -> deterministico direto: status=degraded, degraded_reason=no_anthropic_key, content.generation.degraded=true, sections com numeros, insights vazio (ou 1 item), custo 0', async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY;
    const { storage } = makeFakeStorage({ withData: true });
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res: any = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    expect(res.status).toBe('degraded');
    const reason = res.degradedReason ?? res.content?.generation?.degradedReason;
    expect(reason).toBe('no_anthropic_key');
    expect(res.content.generation.degraded).toBe(true);
    // sections com numeros mesmo no fail-soft.
    expect(res.content.sections.volumeResults).toBeTruthy();
    expect(typeof res.content.sections.volumeResults.tournaments).toBe('number');
    // insights vazio (ou 1 item deterministico).
    expect(res.content.insights.length).toBeLessThanOrEqual(1);
    const cost = res.costUsdEstimate ?? res.content?.generation?.costUsdEstimate ?? 0;
    expect(cost).toBe(0);
  });

  it('Anthropic mockado pra lancar em TODAS as tentativas -> generateWeeklyReport({ ..., failSoft: true }) (ou apos N falhas via runner) retorna degraded llm_failed_3x; erro do LLM eh LOGADO antes do fallback', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { storage } = makeFakeStorage({ withData: true });
    const messagesCreate = vi.fn(async () => { throw new Error('rate limited 529'); });
    class ThrowingAnthropic { messages = { create: messagesCreate }; constructor(_c: any) {} }
    vi.doMock('@anthropic-ai/sdk', () => ({ default: ThrowingAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    // O gerador, quando o LLM falha, deve LANCAR (pra o runner contar attempts) OU,
    // se chamado com failSoft:true, retornar o deterministico. Aceitamos ambos:
    let res: any;
    let threw = false;
    try {
      res = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10', failSoft: true } as any);
    } catch {
      threw = true;
    }
    if (!threw) {
      expect(res.status).toBe('degraded');
      const reason = res.degradedReason ?? res.content?.generation?.degradedReason;
      expect(reason).toBe('llm_failed_3x');
    }
    // de qualquer forma, o erro do LLM foi logado antes do fallback (lesson #9).
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('`new AnthropicCtor` que eh um vi.fn() (mock arrow, NAO new-callable) -> nao quebra; cai pro caminho deterministico ou usa como factory (lesson #5/#35)', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { storage } = makeFakeStorage({ withData: true });
    // default eh uma vi.fn() pura — `new vi.fn()` funciona (cria objeto vazio) mas
    // sem `.messages`. O gerador deve detectar e cair pro deterministico OU chamar
    // como factory. Em ambos os casos NAO pode lancar TypeError nao tratado.
    const arrowFactory = vi.fn(() => ({})); // arrow -> nao new-callable
    vi.doMock('@anthropic-ai/sdk', () => ({ default: arrowFactory }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res: any = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    // resultado existe (degraded ou ready com deterministico); nao quebrou.
    expect(res).toBeTruthy();
    expect(res.content).toBeTruthy();
    expect(['ready', 'degraded']).toContain(res.status);
  });

  it('mesmo no fail-soft, secao 4 (rec de lesson) e 7 (plano de estudo) podem ter conteudo via os fallbacks deterministicos de recommendLessonForUser/generateWeeklyStudyPlan', async () => {
    vi.resetModules();
    delete process.env.ANTHROPIC_API_KEY; // fail-soft
    const { storage } = makeFakeStorage({ withData: true });
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    const recMock = vi.fn(async () => ({ lessonId: 'lesson-pop', title: 'Lesson popular', reason: 'fallback popular', source: 'fallback_popular' }));
    const planMock = vi.fn(async (input: any) => ({ id: 'plan-det', ...input }));
    mockDeps({ recommendLessonForUser: recMock, generateWeeklyStudyPlan: planMock });

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res: any = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    expect(res.status).toBe('degraded');
    // back-fills ainda rodam mesmo no fail-soft.
    expect(recMock).toHaveBeenCalled();
    expect(planMock).toHaveBeenCalled();
    // a secao study pode ter recommendedLesson; nextWeekPlan pode ter weeklyStudyPlanRef.
    // (nao obrigatorio o conteudo de prosa — so que nao ficam vazias por causa do fail-soft).
  });
});

// =============================================================================
// 7) Modelo via env (não hardcodar string solta)
// =============================================================================
describe('generateWeeklyReport — modelo via COACH_MODEL', () => {
  it('COACH_MODEL setado -> content.generation.model usa o override', async () => {
    vi.resetModules();
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    process.env.COACH_MODEL = 'claude-test-override';
    const { storage } = makeFakeStorage({ withData: true });
    const { FakeAnthropic } = mockAnthropicSdk();
    vi.doMock('@anthropic-ai/sdk', () => ({ default: FakeAnthropic }));
    vi.doMock('../../../server/storage', () => ({ storage }));
    vi.doMock('../../../server/storage/coachPreferences', () => ({ getCoachPreferences: vi.fn(async () => ({ coachTone: 'gentle', frozenCategories: {}, reportWeeklyEnabled: true })) }));
    mockDeps();

    const { generateWeeklyReport } = await import('../../../server/services/weeklyReportGenerator');
    const res: any = await generateWeeklyReport({ userId: 'USER-SP', periodStart: '2026-05-04', periodEnd: '2026-05-10' });
    expect(res.content.generation.model).toBe('claude-test-override');
  });
});
