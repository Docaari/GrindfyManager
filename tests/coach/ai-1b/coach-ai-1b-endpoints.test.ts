import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD — Red Phase)
//
// Sprint AI-1B / RF-04 + RF-08 + RF-12 — endpoints HTTP novos/estendidos
//   GET  /api/coach/timeline           — handleGetCoachTimeline (NAO EXISTE)
//   GET  /api/coach/reports/:id        — handleGetCoachReport (NAO EXISTE)
//   POST /api/coach/reports/:id/dismiss — handlePostCoachReportDismiss (NAO EXISTE)
//   GET  /api/coach/suggestions        — handleGetCoachSuggestions (NAO EXISTE)
//   GET  /api/coach/preferences        — handleGetCoachPreferences (EXISTE — estendido)
//   PUT  /api/coach/preferences        — handlePutCoachPreferences (EXISTE — estendido)
//
// Handlers novos com `injectedStorage?` como 3o arg (lesson #34); aceitamos
// tambem que sejam testaveis via vi.mock de modulos. Local provavel:
// server/routes/coachAi1b.ts ou server/routes/coach.ts.
//
// Fontes:
//   - Docs/specs/sprint-ai-1b.md (RF-04/08/12 + "Endpoints Previstos" + "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/157-...-bgapcheck-bimport.md (§3.1, §3.2, §5)
//   - Docs/architecture/decisions/158-quick-suggestions-anti-blank-page.md (§3, §5)
//   - Docs/api/coach.md "Sprint AI-1B"
//
// Lessons: #3 (mock shape REAL — reports/coach_nudge_log/getDashboardStats/
//   detectLeaks/getLastUploadAt), #9 (safe), #21 (cache server-side 30s +
//   _resetSuggestionsCacheForTests), #34 (storage injetavel).
//
// Status esperado: handlers novos FALHAM (nao existem); o de preferences FALHA
// porque a resposta ainda nao inclui os 3 campos novos.
// =============================================================================

function makeReq(overrides: any = {}) {
  return {
    user: { id: 'u-1', userPlatformId: 'USER-0001', email: 'p@t.com', role: 'user', subscriptionPlan: 'pro' },
    params: {}, body: {}, query: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  return res;
}

// =============================================================================
// GET /api/coach/timeline
// =============================================================================
describe('GET /api/coach/timeline', () => {
  function makeStorage(opts: { reports?: any[]; nudges?: any[] } = {}) {
    return {
      // shape REAL — listReportsForUser({ userId, limit, before? }) -> [{ id, reportType, periodStart, periodEnd, status, content, generatedAt, readAt, dismissedAt }]
      listReportsForUser: vi.fn(async () => opts.reports ?? []),
      // shape REAL — listNudgeLogForUser({ userId, limit, before? }) -> [{ id, category, status, title, bodyPreview, sentAt, engagedAt, dismissedAt, snoozeUntil, chatSessionId, triggeredByEvent }]
      listNudgeLogForUser: vi.fn(async () => opts.nudges ?? []),
    } as any;
  }

  it('retorna { items, nextCursor? } — items union report|nudge ordenados por timestamp desc', async () => {
    const storage = makeStorage({
      reports: [
        { id: 'r1', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'ready', content: { header: { summaryLine: 'Sua semana: +$1234' } }, generatedAt: '2026-05-11T10:00:00Z', readAt: null, dismissedAt: null },
      ],
      nudges: [
        { id: 'n1', category: 'B-IMPORT', status: 'sent', title: 'Importe seu historico', bodyPreview: 'Voce registrou sessoes...', sentAt: '2026-05-09T12:00:00Z', engagedAt: null, dismissedAt: null, snoozeUntil: null, chatSessionId: null, triggeredByEvent: 'b_import_check' },
      ],
    });
    const { handleGetCoachTimeline } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ query: {} });
    const res = makeRes();
    await handleGetCoachTimeline(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    // 2 itens; ordenado desc -> report (2026-05-11) antes do nudge (2026-05-09).
    expect(res.body.items[0].kind).toBe('report');
    expect(res.body.items[0].summaryLine).toBe('Sua semana: +$1234');
    expect(res.body.items[1].kind).toBe('nudge');
    expect(res.body.items[1].category).toBe('B-IMPORT');
  });

  it('?limit=999 -> clampa para 100 (nao 400)', async () => {
    const storage = makeStorage({ reports: [], nudges: [] });
    const { handleGetCoachTimeline } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ query: { limit: '999' } });
    const res = makeRes();
    await handleGetCoachTimeline(req, res, storage);
    expect(res.statusCode).toBe(200);
    // limit propagado <= 100 para o storage.
    const repArg = storage.listReportsForUser.mock.calls[0][0];
    expect(repArg.limit).toBeLessThanOrEqual(100);
  });

  it('so itens do user logado — passa userId do req.user para o storage', async () => {
    const storage = makeStorage({ reports: [], nudges: [] });
    const { handleGetCoachTimeline } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ user: { id: 'u', userPlatformId: 'USER-XYZ', email: 'x', role: 'user', subscriptionPlan: 'pro' } });
    const res = makeRes();
    await handleGetCoachTimeline(req, res, storage);
    expect(storage.listReportsForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'USER-XYZ' }));
    expect(storage.listNudgeLogForUser).toHaveBeenCalledWith(expect.objectContaining({ userId: 'USER-XYZ' }));
  });

  it('timeline so com nudges (nenhum relatorio) -> items so com kind=nudge', async () => {
    const storage = makeStorage({
      reports: [],
      nudges: [{ id: 'n1', category: 'B-GAPCHECK', status: 'sent', title: 'Faltam dados', bodyPreview: '...', sentAt: '2026-05-09T12:00:00Z', triggeredByEvent: 'gap_check_d3' }],
    });
    const { handleGetCoachTimeline } = await import('../../../server/routes/coachAi1b');
    const req = makeReq();
    const res = makeRes();
    await handleGetCoachTimeline(req, res, storage);
    expect(res.body.items.every((i: any) => i.kind === 'nudge')).toBe(true);
  });
});

// =============================================================================
// GET /api/coach/reports/:id
// =============================================================================
describe('GET /api/coach/reports/:id', () => {
  function makeStorage(opts: { report?: any | null } = {}) {
    return {
      getReportById: vi.fn(async (_id: string) => opts.report ?? null),
      markReportRead: vi.fn(async () => {}),
    } as any;
  }

  it('retorna o relatorio (content + markdown + generatedAt + costUsdEstimate?); marca read_at na 1a leitura', async () => {
    const storage = makeStorage({
      report: { id: 'r1', userId: 'USER-0001', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'ready', content: { schemaVersion: 1, header: { summaryLine: 'x' } }, markdown: '# Rel', generatedAt: '2026-05-11T10:00:00Z', costUsdEstimate: 0.045, readAt: null },
    });
    const { handleGetCoachReport } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ params: { id: 'r1' } });
    const res = makeRes();
    await handleGetCoachReport(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('r1');
    expect(res.body.content).toBeTruthy();
    expect(res.body.markdown).toBe('# Rel');
    expect(storage.markReportRead).toHaveBeenCalledWith('r1', expect.anything());
  });

  it('marcar read_at eh idempotente — se readAt ja setado, NAO chama markReportRead de novo', async () => {
    const storage = makeStorage({
      report: { id: 'r1', userId: 'USER-0001', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'ready', content: {}, markdown: '#', generatedAt: '2026-05-11T10:00:00Z', readAt: '2026-05-11T11:00:00Z' },
    });
    const { handleGetCoachReport } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ params: { id: 'r1' } });
    const res = makeRes();
    await handleGetCoachReport(req, res, storage);
    expect(storage.markReportRead).not.toHaveBeenCalled();
  });

  it('404 — id inexistente', async () => {
    const storage = makeStorage({ report: null });
    const { handleGetCoachReport } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ params: { id: 'nope' } });
    const res = makeRes();
    await handleGetCoachReport(req, res, storage);
    expect(res.statusCode).toBe(404);
  });

  it('403 — relatorio de outro user', async () => {
    const storage = makeStorage({
      report: { id: 'r1', userId: 'USER-OTHER', reportType: 'weekly', periodStart: '2026-05-04', periodEnd: '2026-05-10', status: 'ready', content: {}, markdown: '#', generatedAt: '2026-05-11T10:00:00Z', readAt: null },
    });
    const { handleGetCoachReport } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ params: { id: 'r1' } });
    const res = makeRes();
    await handleGetCoachReport(req, res, storage);
    expect(res.statusCode).toBe(403);
    expect(storage.markReportRead).not.toHaveBeenCalled();
  });
});

// =============================================================================
// POST /api/coach/reports/:id/dismiss
// =============================================================================
describe('POST /api/coach/reports/:id/dismiss', () => {
  it('seta dismissed_at; 200; 403 se de outro user; 404 se inexistente', async () => {
    const storage: any = {
      getReportById: vi.fn(async (id: string) => (id === 'r1'
        ? { id: 'r1', userId: 'USER-0001', dismissedAt: null }
        : id === 'rother' ? { id: 'rother', userId: 'USER-OTHER', dismissedAt: null } : null)),
      markReportDismissed: vi.fn(async () => {}),
    };
    const { handlePostCoachReportDismiss } = await import('../../../server/routes/coachAi1b');

    // ok
    let req = makeReq({ params: { id: 'r1' } });
    let res = makeRes();
    await handlePostCoachReportDismiss(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.markReportDismissed).toHaveBeenCalledWith('r1', expect.anything());

    // 403 outro user
    req = makeReq({ params: { id: 'rother' } });
    res = makeRes();
    await handlePostCoachReportDismiss(req, res, storage);
    expect(res.statusCode).toBe(403);

    // 404 inexistente
    req = makeReq({ params: { id: 'nope' } });
    res = makeRes();
    await handlePostCoachReportDismiss(req, res, storage);
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// GET /api/coach/suggestions
// =============================================================================
describe('GET /api/coach/suggestions', () => {
  function makeStorage(opts: { roiWeek?: number; hasData?: boolean; highLeaks?: boolean } = {}) {
    const hasData = opts.hasData ?? true;
    return {
      getDashboardStats: vi.fn(async (_uid: string, _p?: string) => hasData
        ? { totalTournaments: 30, totalProfit: opts.roiWeek != null && opts.roiWeek < 0 ? -300 : 300, roi: opts.roiWeek ?? 0.1 }
        : { totalTournaments: 0, totalProfit: 0, roi: 0 }),
      detectLeaks: vi.fn(async () => ({ leaks: opts.highLeaks ? [{ tag: 'x', severity: 'high' }] : [], hasHighSeverity: !!opts.highLeaks })),
      getLastUploadAt: vi.fn(async () => hasData ? new Date('2026-05-09T00:00:00Z') : null),
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1, focoDoMes: 'ICM' })),
    } as any;
  }

  beforeEach(async () => {
    // lesson #21 — resetar o cache server-side entre testes.
    try {
      const mod = await import('../../../server/coach/quickSuggestions');
      (mod as any)._resetSuggestionsCacheForTests?.();
    } catch { /* modulo ainda nao existe — red phase */ }
  });

  it('?route=dashboard -> { suggestions: [...] } com 2-4 itens, cada { id, text, sendOnClick }', async () => {
    const storage = makeStorage({ hasData: true, roiWeek: 0.1 });
    const { handleGetCoachSuggestions } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ query: { route: '/dashboard' } });
    const res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.suggestions)).toBe(true);
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(res.body.suggestions.length).toBeLessThanOrEqual(4);
    for (const s of res.body.suggestions) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.text).toBe('string');
      expect(s.sendOnClick).toBe(true);
    }
  });

  it('?route=dashboard user COM downswing (ROI negativo na semana) -> sugestoes incluem variante de "por que estou perdendo / variancia"', async () => {
    const storage = makeStorage({ hasData: true, roiWeek: -0.15, highLeaks: true });
    const { handleGetCoachSuggestions } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ query: { route: '/dashboard' } });
    const res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    const texts = res.body.suggestions.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(texts).toMatch(/perdendo|vari[âa]ncia/);
  });

  it('user SEM dados (qualquer rota) -> sugestoes de import/onboarding', async () => {
    const storage = makeStorage({ hasData: false });
    const { handleGetCoachSuggestions } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ query: { route: '/stats' } });
    const res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    const texts = res.body.suggestions.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(texts).toMatch(/import|come[çc]o|por onde/);
  });

  it('?route=bankroll -> sugestoes de banca/saque/simular', async () => {
    const storage = makeStorage({ hasData: true });
    const { handleGetCoachSuggestions } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ query: { route: '/bankroll' } });
    const res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    const texts = res.body.suggestions.map((s: any) => s.text.toLowerCase()).join(' | ');
    expect(texts).toMatch(/banca|sacar|simular/);
  });

  it('rota desconhecida ou ?route= vazio -> set generico, 200 (NAO 400)', async () => {
    const storage = makeStorage({ hasData: true });
    const { handleGetCoachSuggestions } = await import('../../../server/routes/coachAi1b');
    let req = makeReq({ query: { route: '/rota-inexistente-xyz' } });
    let res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(2);

    req = makeReq({ query: { route: '' } });
    res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    expect(res.statusCode).toBe(200);
  });

  it('cache TTL ~30s por user — 2a chamada na mesma janela nao re-consulta o storage (mesmo resultado)', async () => {
    const storage = makeStorage({ hasData: true, roiWeek: 0.1 });
    const { handleGetCoachSuggestions } = await import('../../../server/routes/coachAi1b');
    let req = makeReq({ query: { route: '/dashboard' } });
    let res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    const firstCallCount = storage.getDashboardStats.mock.calls.length;
    req = makeReq({ query: { route: '/dashboard' } });
    res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    // cache TTL 30s -> nao chamou de novo getDashboardStats.
    expect(storage.getDashboardStats.mock.calls.length).toBe(firstCallCount);
  });

  it('erro em alguma query de estado -> cai pras genericas por rota (safe; nao quebra)', async () => {
    const storage: any = {
      getDashboardStats: vi.fn(async () => { throw new Error('db down'); }),
      detectLeaks: vi.fn(async () => { throw new Error('db down'); }),
      getLastUploadAt: vi.fn(async () => { throw new Error('db down'); }),
      getAiStructuredProfile: vi.fn(async () => { throw new Error('db down'); }),
    };
    const { handleGetCoachSuggestions } = await import('../../../server/routes/coachAi1b');
    const req = makeReq({ query: { route: '/dashboard' } });
    const res = makeRes();
    await handleGetCoachSuggestions(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// GET/PUT /api/coach/preferences — estendidos (RF-04 + RF-10/11)
// =============================================================================
describe('GET/PUT /api/coach/preferences — estendidos AI-1B', () => {
  const getCoachPrefsMock = vi.fn();
  const upsertCoachPrefsMock = vi.fn();
  const getUserTimezoneMock = vi.fn();
  const updateAiStructuredProfileMock = vi.fn();

  const PREFS_BASE = {
    nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
    nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
    quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
    channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced' as const,
    frozenCategories: {} as Record<string, any>,
    // colunas novas AI-1B — back-fill (lesson #3 + #7): reportWeeklyEnabled ?? false,
    // nudgeBGapcheck ?? true, nudgeBImport ?? true.
    reportWeeklyEnabled: false, nudgeBGapcheck: true, nudgeBImport: true,
    updatedAt: new Date('2026-05-12T00:00:00Z'),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.doMock('../../../server/storage/coachPreferences', () => ({
      getCoachPreferences: getCoachPrefsMock,
      upsertCoachPreferences: upsertCoachPrefsMock,
    }));
    vi.doMock('../../../server/storage', () => ({ storage: { getUserTimezone: getUserTimezoneMock } }));
    vi.doMock('../../../server/storage/aiStructuredProfile', () => ({
      updateAiStructuredProfile: updateAiStructuredProfileMock,
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
      isStructuredProfileEmpty: vi.fn(() => true),
    }));
    getCoachPrefsMock.mockReset().mockResolvedValue({ ...PREFS_BASE });
    upsertCoachPrefsMock.mockReset().mockImplementation(async (_uid: string, delta: any) => ({ ...PREFS_BASE, ...delta }));
    getUserTimezoneMock.mockReset().mockResolvedValue('America/Sao_Paulo');
    updateAiStructuredProfileMock.mockReset().mockResolvedValue({ schemaVersion: 1 });
  });

  it('GET /api/coach/preferences inclui reportWeeklyEnabled / nudgeBGapcheck / nudgeBImport no payload', async () => {
    const { handleGetCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq();
    const res = makeRes();
    await handleGetCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('reportWeeklyEnabled');
    expect(res.body).toHaveProperty('nudgeBGapcheck');
    expect(res.body).toHaveProperty('nudgeBImport');
    expect(res.body.reportWeeklyEnabled).toBe(false);
    expect(res.body.nudgeBGapcheck).toBe(true);
    expect(res.body.nudgeBImport).toBe(true);
  });

  it('PUT { reportWeeklyEnabled: true, nudgeBGapcheck: false, nudgeBImport: false } -> aceito (zod .strict()), persiste; GET reflete', async () => {
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { reportWeeklyEnabled: true, nudgeBGapcheck: false, nudgeBImport: false } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(upsertCoachPrefsMock).toHaveBeenCalledWith('USER-0001', expect.objectContaining({
      reportWeeklyEnabled: true, nudgeBGapcheck: false, nudgeBImport: false,
    }));
  });

  it('PUT { unfreezeCategory: "B-GAPCHECK" } -> aceito (enum estendido)', async () => {
    getCoachPrefsMock.mockResolvedValue({ ...PREFS_BASE, frozenCategories: { 'B-GAPCHECK': { frozenAt: '2026-05-01T00:00:00Z', reason: 'auto_dismiss_rate' } } });
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { unfreezeCategory: 'B-GAPCHECK' } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(upsertCoachPrefsMock).toHaveBeenCalled();
  });

  it('PUT { unfreezeCategory: "B-IMPORT" } -> aceito (enum estendido)', async () => {
    getCoachPrefsMock.mockResolvedValue({ ...PREFS_BASE, frozenCategories: { 'B-IMPORT': { frozenAt: '2026-05-01T00:00:00Z', reason: 'auto_dismiss_rate' } } });
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { unfreezeCategory: 'B-IMPORT' } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(upsertCoachPrefsMock).toHaveBeenCalled();
  });

  it('PUT { frozenCategories: {...} } -> 400 (zod .strict() ainda rejeita campo cru de congelamento — comportamento AI-1A mantido)', async () => {
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { frozenCategories: { 'B-GAPCHECK': { frozenAt: '2026-05-12T00:00:00Z', reason: 'manual' } } } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(400);
    expect(upsertCoachPrefsMock).not.toHaveBeenCalled();
  });
});
