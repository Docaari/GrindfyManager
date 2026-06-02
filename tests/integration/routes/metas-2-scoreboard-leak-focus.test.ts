import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// METAS-2 fatia-2 (ADR-234) — scoreboard enriquecido (motor + leak_focus) +
// createMeasure aceita leak_focus. RED phase — comportamento fatia-2 NAO EXISTE.
//
// Alvos (server/routes/goals.ts — handlers ja exportados aceitam injectedStorage):
//   handleScoreboard(req, res, injectedStorage?) — DEVE, para metas via motor,
//     chamar getPlannedVsActual + enriquecer { compliancePct, dataSufficiency,
//     adherence }; para leak_focus, usar evaluateLeakFocusProgress; para diretas,
//     manter fatia-1; isolar falha por entry (200 sempre); snapshot grava
//     compliancePct + dataSufficiency REAIS (nao mais 'ok' hardcoded).
//   handleCreateGoal -> createMeasureHandler — DEVE aceitar
//     sourceMetric='leak_focus_progress:<statId>' valido (201) e recusar statId
//     invalido (lead_no_data_source). Tier free -> 403 (write); /scoreboard read-only.
//
// Estrategia (lesson #34): chamo os handlers DIRETO com req/res fakes + storage
// injetado (3o arg). O motor (getPlannedVsActual) e o helper de leak
// (evaluateLeakFocusProgress) sao MOCKADOS POR PATH — o handler os importa.
//   * getStatsLeaks e findActiveLeakFocusList vivem NO storage injetado.
//
// SHAPES REAIS mockados (lesson #3 — 3 CRITICAL passaram por mock idealizado):
//   PlannedVsActual: server/coach/adherence/types.ts:61 —
//     { sourceMetric, period, planned:number|null, actual:number,
//       compliancePct:number|null, dataSufficiency:'ok'|'low',
//       breakdown:{ skipped:boolean, shortfall:number|null, overachieved:boolean, note } }
//   StatLeak: server/coach/leaks/types.ts:10 —
//     { statId, statName, value:null, benchmark:number|null, delta:null, severity:number>0 }
//   CoachLeakFocus (findActiveLeakFocusList): shared/schema.ts:4928 —
//     { id,userId,leakCode,description,targetMonth,baselineStatKey,baselineValue,
//       baselineSampleSize,status('active'|'resolved'|...),resolvedAt }
//   LeakFocusProgress: server/coach/goals/leakFocusProgress.ts (fatia-2) —
//     { status, compliancePct:number|null, dataSufficiency:'ok'|'low', note }
//
// AMBIGUIDADE documentada (lesson #25): o nome/caminho exato do mock do motor e
// do helper de leak depende de como o implementer importa. Mocko os caminhos
// canonicos do ADR (`../../../server/coach/adherence` index + `.../goals/leakFocusProgress`).
// Se o implementer importar de outro path, o mock nao intercepta e o teste falha
// (sinal correto — green phase ajusta o import OU re-aponta o mock).
//
// .test.ts -> projeto "server" (node).
// =============================================================================

const h = vi.hoisted(() => ({
  getReportTier: vi.fn(async () => 'eligible'),
  getPlannedVsActual: vi.fn(),
  evaluateLeakFocusProgress: vi.fn(),
  resolvesViaAdherence: vi.fn(),
  bridgedSourceMetric: vi.fn(),
  isLeakFocusMetric: vi.fn(),
  parseLeakFocusStatId: vi.fn(),
}));

vi.mock('../../../server/coach/reportEligibility', () => ({
  getReportTier: h.getReportTier,
}));

// Motor de aderencia (ADR-227) — mockado por path (index do motor).
vi.mock('../../../server/coach/adherence', () => ({
  getPlannedVsActual: (...a: any[]) => h.getPlannedVsActual(...a),
}));

// Helper de progresso de leak (fatia-2) — mockado por path.
vi.mock('../../../server/coach/goals/leakFocusProgress', () => ({
  evaluateLeakFocusProgress: (...a: any[]) => h.evaluateLeakFocusProgress(...a),
}));

// Ponte de vocabulario (fatia-2) — mockada para forcar o roteamento motor-vs-direto
// independente da implementacao real (que e coberta no adherenceBridge.test.ts).
vi.mock('../../../server/coach/goals/adherenceBridge', () => ({
  GOAL_METRIC_TO_ADHERENCE: {
    sessions_per_week: 'grind_sessions_count',
    grind_days: 'grind_days',
    study_minutes_week: 'study_minutes',
    study_sessions_count: 'study_sessions_count',
  },
  resolvesViaAdherence: (...a: any[]) => h.resolvesViaAdherence(...a),
  bridgedSourceMetric: (...a: any[]) => h.bridgedSourceMetric(...a),
  LEAK_FOCUS_PREFIX: 'leak_focus_progress',
  isLeakFocusMetric: (...a: any[]) => h.isLeakFocusMetric(...a),
  parseLeakFocusStatId: (...a: any[]) => h.parseLeakFocusStatId(...a),
  // fn pura (strip prefixo "leak:") — impl real no mock (lesson #28: mock por path
  // intercepta o módulo inteiro; export novo precisa estar aqui).
  normalizeStatIdForLeakMatch: (s: string) =>
    typeof s === 'string' && s.startsWith('leak:') ? s.slice('leak:'.length) : s,
}));

function makeRes() {
  const res: any = {
    statusCode: 0,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function makeReq(extra: any = {}) {
  return {
    user: { userPlatformId: 'USER-1', subscriptionPlan: 'trial' },
    params: {},
    body: {},
    ...extra,
  };
}

// PlannedVsActual no shape REAL do motor (types.ts:61).
function plannedVsActual(over: Partial<any> = {}) {
  return {
    sourceMetric: over.sourceMetric ?? 'grind_sessions_count',
    period: over.period ?? { kind: 'week', weekStartDate: '2026-06-01' },
    planned: over.planned === undefined ? 4 : over.planned,
    actual: over.actual === undefined ? 2 : over.actual,
    compliancePct: over.compliancePct === undefined ? 50 : over.compliancePct,
    dataSufficiency: over.dataSufficiency ?? 'ok',
    breakdown: {
      skipped: over.skipped ?? false,
      shortfall: over.shortfall === undefined ? 2 : over.shortfall,
      overachieved: over.overachieved ?? false,
      note: over.note ?? null,
    },
  };
}

// StatLeak no shape REAL (value/delta sempre null).
function statLeak(over: Partial<any> = {}) {
  return {
    statId: over.statId ?? 'vpip',
    statName: over.statName ?? 'VPIP',
    value: null,
    benchmark: over.benchmark ?? 22.5,
    delta: null,
    severity: over.severity ?? 10,
  };
}

// CoachLeakFocus no shape REAL (schema:4928).
function coachLeakFocus(over: Partial<any> = {}) {
  return {
    id: over.id ?? 'clf-1',
    userId: over.userId ?? 'USER-1',
    leakCode: over.leakCode ?? 'leak_vpip',
    description: over.description ?? 'VPIP alto',
    targetMonth: over.targetMonth ?? '2026-06',
    baselineStatKey: over.baselineStatKey ?? 'vpip',
    baselineValue: over.baselineValue ?? '28.5',
    baselineSampleSize: over.baselineSampleSize ?? 1200,
    status: over.status ?? 'active',
    resolvedAt: over.resolvedAt ?? null,
  };
}

// goal (medida) row no shape REAL (listGoals da fatia-1).
function measureRow(over: Partial<any> = {}) {
  return {
    id: over.id ?? 'g_1',
    userId: 'USER-1',
    goalKind: 'measure',
    status: 'active',
    sourceMetric: over.sourceMetric ?? 'sessions_per_week',
    targetValue: over.targetValue ?? '5',
    baselineValue: over.baselineValue ?? '0',
    horizon: over.horizon ?? 'quarter',
    direction: over.direction ?? 'up',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    targetDeadline: '2026-12-01',
  };
}

function baseStorage(over: Record<string, any> = {}) {
  return {
    listGoals: vi.fn(async () => []),
    listActiveWigs: vi.fn(async () => []),
    upsertGoalSnapshot: vi.fn(async (v: any) => ({ id: 'snap_1', ...v })),
    // deps de agregacao direta (fatia-1) — fallback / metas diretas
    getGrindSessions: vi.fn(async () => []),
    getStudySessionsV2: vi.fn(async () => []),
    listWalletsByUser: vi.fn(async () => []),
    getPerformanceByPeriod: vi.fn(async () => ({})),
    // leak_focus
    getStatsLeaks: vi.fn(async () => []),
    findLeakFocusList: vi.fn(async () => []),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.getReportTier.mockResolvedValue('eligible');
  // ponte: por padrao roteia as 4 de volume/estudo via motor; resto direto.
  h.resolvesViaAdherence.mockImplementation((sm: string) =>
    ['sessions_per_week', 'grind_days', 'study_minutes_week', 'study_sessions_count'].includes(sm),
  );
  h.bridgedSourceMetric.mockImplementation((sm: string) => {
    const map: Record<string, string> = {
      sessions_per_week: 'grind_sessions_count',
      grind_days: 'grind_days',
      study_minutes_week: 'study_minutes',
      study_sessions_count: 'study_sessions_count',
    };
    return map[sm] ?? null;
  });
  h.isLeakFocusMetric.mockImplementation((sm: string) => String(sm ?? '').startsWith('leak_focus_progress'));
  h.parseLeakFocusStatId.mockImplementation((sm: string) => {
    if (!String(sm ?? '').startsWith('leak_focus_progress:')) return null;
    const id = String(sm).split(':')[1] ?? '';
    return id || null;
  });
});

// =============================================================================
// RF-03 — compliancePct rigoroso via motor (DEC-2/3)
// =============================================================================
describe('METAS-2 scoreboard — meta de processo via motor (RF-03)', () => {
  it('sessions_per_week: plano 4, 2 feitas -> compliancePct=50, current=2, adherence.shortfall=2, dataSufficiency=ok', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getPlannedVsActual.mockResolvedValue(
      plannedVsActual({ planned: 4, actual: 2, compliancePct: 50, shortfall: 2 }),
    );
    const storage = baseStorage({ listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'sessions_per_week' })]) });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode).toBe(200);
    const m = (res.body?.measures ?? [])[0];
    expect(m, 'medida via motor presente').toBeDefined();
    expect(m.compliancePct).toBe(50);
    expect(m.current, 'current = adherence.actual (DEC-3)').toBe(2);
    expect(m.dataSufficiency).toBe('ok');
    expect(m.adherence).toBeDefined();
    expect(m.adherence.shortfall).toBe(2);
    expect(m.adherence.skipped).toBe(false);
    // o motor foi chamado com kind:'week' (DEF-1) + chave UTC.
    const callArgs = h.getPlannedVsActual.mock.calls[0];
    expect(callArgs[1], 'bridged SourceMetric').toBe('grind_sessions_count');
    expect(callArgs[2], 'periodo kind=week').toMatchObject({ kind: 'week' });
    expect(callArgs[2].weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('skipped=true -> compliancePct=null, adherence.skipped=true, status NEUTRO (nao at_risk) — DEC-6', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getPlannedVsActual.mockResolvedValue(
      plannedVsActual({ planned: 4, actual: 0, compliancePct: null, skipped: true, shortfall: null }),
    );
    const storage = baseStorage({ listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'grind_days' })]) });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode).toBe(200);
    const m = (res.body?.measures ?? [])[0];
    expect(m.compliancePct).toBeNull();
    expect(m.adherence?.skipped).toBe(true);
    expect(m.status, 'skipped NAO vira at_risk (A4 — cobra comportamento, nao culpa)').not.toBe('at_risk');
    // status deve ser enum valido (nao inventa enum novo — lesson #7/#8)
    expect(['ahead', 'on_track', 'behind', 'at_risk', 'achieved']).toContain(m.status);
  });

  it('overachieved (3 de 2) -> compliancePct clampa 100, adherence.overachieved=true', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getPlannedVsActual.mockResolvedValue(
      plannedVsActual({ planned: 2, actual: 3, compliancePct: 100, overachieved: true, shortfall: null }),
    );
    const storage = baseStorage({ listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'sessions_per_week', targetValue: '2' })]) });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const m = (res.body?.measures ?? [])[0];
    expect(m.compliancePct).toBe(100);
    expect(m.adherence?.overachieved).toBe(true);
    expect(m.current).toBe(3);
  });

  it('motor no_plan (planned=null, low) -> compliancePct=null, dataSufficiency=low, current via fallback agregacao direta, 200', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getPlannedVsActual.mockResolvedValue(
      plannedVsActual({ planned: null, actual: 0, compliancePct: null, dataSufficiency: 'low', shortfall: null, note: 'no_plan' }),
    );
    // fallback: agregacao direta conta 3 grind sessions completed na janela.
    const storage = baseStorage({
      listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'sessions_per_week' })]),
      getGrindSessions: vi.fn(async () => [
        { id: 'gs1', status: 'completed', date: new Date('2026-06-02T12:00:00Z') },
        { id: 'gs2', status: 'completed', date: new Date('2026-06-03T12:00:00Z') },
        { id: 'gs3', status: 'completed', date: new Date('2026-06-04T12:00:00Z') },
      ]),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode, 'no_plan NUNCA quebra o scoreboard').toBe(200);
    const m = (res.body?.measures ?? [])[0];
    expect(m.compliancePct).toBeNull();
    expect(m.dataSufficiency).toBe('low');
    // current cai no fallback de agregacao direta (DEC-A5) — nao fica null cego.
    expect(m.current, 'current via fallback agregacao direta quando motor degrada').toBe(3);
  });

  it('motor LANCA em UMA meta -> essa meta degrada, scoreboard 200, OUTRAS metas intactas (isolamento por entry)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    // 1a meta (sessions_per_week) faz o motor lancar; 2a (study_minutes_week) ok.
    h.getPlannedVsActual.mockImplementation(async (_uid: string, bridged: string) => {
      if (bridged === 'grind_sessions_count') throw new Error('boom motor');
      return plannedVsActual({ sourceMetric: 'study_minutes', planned: 300, actual: 200, compliancePct: 67, shortfall: 100 });
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [
        measureRow({ id: 'g_grind', sourceMetric: 'sessions_per_week' }),
        measureRow({ id: 'g_study', sourceMetric: 'study_minutes_week' }),
      ]),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode, 'uma meta degradada NUNCA derruba o scoreboard').toBe(200);
    const measures = res.body?.measures ?? [];
    const grind = measures.find((x: any) => x.id === 'g_grind');
    const study = measures.find((x: any) => x.id === 'g_study');
    // a meta que estourou degrada
    expect(grind).toBeDefined();
    expect(grind.compliancePct).toBeNull();
    expect(grind.dataSufficiency).toBe('low');
    // a outra continua intacta
    expect(study).toBeDefined();
    expect(study.compliancePct).toBe(67);
    expect(study.current).toBe(200);
  });

  it('motor LANCA -> loga ANTES do fallback (lesson #9)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.getPlannedVsActual.mockRejectedValue(new Error('boom motor'));
    const storage = baseStorage({ listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'sessions_per_week' })]) });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode).toBe(200);
    expect(errSpy, 'log antes do fallback').toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

// =============================================================================
// RF-03 — meta DIRETA (performance/financeira) mantem caminho fatia-1
// =============================================================================
describe('METAS-2 scoreboard — meta direta NAO chama motor (RF-03, §6.1)', () => {
  it('roi_pct: compliancePct=null, motor NAO chamado, current via getPerformanceByPeriod', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    const getPerformanceByPeriod = vi.fn(async () => ({ roi: 18.5, totalTournaments: 120 }));
    const storage = baseStorage({
      listGoals: vi.fn(async () => [measureRow({ id: 'g_roi', sourceMetric: 'roi_pct', targetValue: '20' })]),
      getPerformanceByPeriod,
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode).toBe(200);
    const m = (res.body?.measures ?? [])[0];
    expect(m.compliancePct, 'meta direta nao tem % de cumprimento de plano').toBeNull();
    expect(h.getPlannedVsActual, 'motor NUNCA chamado para meta direta').not.toHaveBeenCalled();
    expect(getPerformanceByPeriod, 'usa agregacao direta (getPerformanceByPeriod)').toHaveBeenCalled();
    // current via agregacao direta de performance.
    expect(m.current).toBe(18.5);
  });

  it('bankroll_usd: dataSufficiency real da agregacao (nao mais hardcoded ok)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    // sem wallets -> agregacao direta retorna dataSufficiency='low'.
    const storage = baseStorage({
      listGoals: vi.fn(async () => [measureRow({ id: 'g_br', sourceMetric: 'bankroll_usd', targetValue: '20000', horizon: 'quarter' })]),
      listWalletsByUser: vi.fn(async () => []),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const m = (res.body?.measures ?? [])[0];
    expect(h.getPlannedVsActual).not.toHaveBeenCalled();
    expect(m.dataSufficiency, 'dataSufficiency real (low: sem wallets), nunca hardcoded ok').toBe('low');
  });
});

// =============================================================================
// RF-02 — leak_focus no scoreboard (via evaluateLeakFocusProgress)
// =============================================================================
describe('METAS-2 scoreboard — leak_focus (RF-02 / DEC-4)', () => {
  function leakMeasure(over: Partial<any> = {}) {
    return measureRow({
      id: over.id ?? 'g_leak',
      sourceMetric: over.sourceMetric ?? 'leak_focus_progress:vpip',
      targetValue: over.targetValue ?? '5',
      ...over,
    });
  }

  it('coach_leak_focus resolved -> status=achieved, compliancePct=100', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.evaluateLeakFocusProgress.mockReturnValue({
      status: 'achieved',
      compliancePct: 100,
      dataSufficiency: 'ok',
      note: 'resolved',
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [leakMeasure()]),
      getStatsLeaks: vi.fn(async () => [statLeak({ statId: 'vpip' })]),
      findLeakFocusList: vi.fn(async () => [coachLeakFocus({ baselineStatKey: 'vpip', status: 'resolved', resolvedAt: new Date() })]),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode).toBe(200);
    const m = (res.body?.measures ?? [])[0];
    expect(m.status).toBe('achieved');
    expect(m.compliancePct).toBe(100);
    // motor de aderencia NAO e o caminho de leak_focus.
    expect(h.getPlannedVsActual).not.toHaveBeenCalled();
    // HIGH-1: o wiring DEVE entregar leakFocusStatus='resolved' ao helper. Antes
    // lia findActiveLeakFocusList (filtra active+mes) e o resolved nunca chegava —
    // mock idealizado escondia (lesson #3). Agora le findLeakFocusList status-agnostico.
    expect(h.evaluateLeakFocusProgress).toHaveBeenCalledWith(
      expect.objectContaining({ leakFocusStatus: 'resolved' }),
    );
  });

  it('statId saiu do top-N -> status in {ahead, on_track}, dataSufficiency=ok', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.evaluateLeakFocusProgress.mockReturnValue({
      status: 'ahead',
      compliancePct: 60,
      dataSufficiency: 'ok',
      note: 'left_radar',
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [leakMeasure()]),
      getStatsLeaks: vi.fn(async () => [statLeak({ statId: 'pfr' })]), // vpip ausente
      findLeakFocusList: vi.fn(async () => []),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const m = (res.body?.measures ?? [])[0];
    expect(['ahead', 'on_track']).toContain(m.status);
    expect(m.dataSufficiency).toBe('ok');
  });

  it('statId no top-N + esforco -> status=behind', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.evaluateLeakFocusProgress.mockReturnValue({
      status: 'behind',
      compliancePct: 40,
      dataSufficiency: 'ok',
      note: 'attacking',
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [leakMeasure()]),
      getStatsLeaks: vi.fn(async () => [statLeak({ statId: 'vpip' })]),
      findLeakFocusList: vi.fn(async () => []),
      getStudySessionsV2: vi.fn(async () => [
        { id: 's1', mode: 'stat_analysis', statId: 'vpip', deletedAt: null },
        { id: 's2', mode: 'stat_analysis', statId: 'vpip', deletedAt: null },
      ]),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const m = (res.body?.measures ?? [])[0];
    expect(m.status).toBe('behind');
  });

  it('statId no top-N + sem ataque -> status=at_risk', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.evaluateLeakFocusProgress.mockReturnValue({
      status: 'at_risk',
      compliancePct: null,
      dataSufficiency: 'ok',
      note: 'no_attack',
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [leakMeasure()]),
      getStatsLeaks: vi.fn(async () => [statLeak({ statId: 'vpip' })]),
      findLeakFocusList: vi.fn(async () => []),
      getStudySessionsV2: vi.fn(async () => []),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const m = (res.body?.measures ?? [])[0];
    expect(m.status).toBe('at_risk');
    expect(m.compliancePct).toBeNull();
  });

  it('getStatsLeaks [] -> dataSufficiency=low, note source_stub, log antes, scoreboard 200, sem fabricar', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.evaluateLeakFocusProgress.mockReturnValue({
      status: 'at_risk',
      compliancePct: null,
      dataSufficiency: 'low',
      note: 'source_stub',
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [leakMeasure()]),
      getStatsLeaks: vi.fn(async () => []),
      findLeakFocusList: vi.fn(async () => []),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode).toBe(200);
    const m = (res.body?.measures ?? [])[0];
    expect(m.dataSufficiency).toBe('low');
    expect(m.compliancePct, 'nunca fabrica (lesson #11)').toBeNull();
    errSpy.mockRestore();
  });

  it('getStatsLeaks LANCA -> degrade, log antes, scoreboard 200 (isolamento)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // o helper recebe leaksErrored=true e degrada.
    h.evaluateLeakFocusProgress.mockReturnValue({
      status: 'at_risk',
      compliancePct: null,
      dataSufficiency: 'low',
      note: 'source_error',
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [leakMeasure()]),
      getStatsLeaks: vi.fn(async () => {
        throw new Error('boom getStatsLeaks');
      }),
      findLeakFocusList: vi.fn(async () => []),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode, 'getStatsLeaks lançar NUNCA quebra o scoreboard').toBe(200);
    expect(errSpy, 'log antes do fallback (lesson #9)').toHaveBeenCalled();
    const m = (res.body?.measures ?? [])[0];
    expect(m.dataSufficiency).toBe('low');
    errSpy.mockRestore();
  });

  it('leak_focus: adherence ausente/null (so metas via motor tem adherence)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.evaluateLeakFocusProgress.mockReturnValue({
      status: 'behind',
      compliancePct: 40,
      dataSufficiency: 'ok',
      note: 'attacking',
    });
    const storage = baseStorage({
      listGoals: vi.fn(async () => [leakMeasure()]),
      getStatsLeaks: vi.fn(async () => [statLeak({ statId: 'vpip' })]),
      findLeakFocusList: vi.fn(async () => []),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const m = (res.body?.measures ?? [])[0];
    // adherence so existe para metas via motor (DEC-2). leak_focus -> null/ausente.
    expect(m.adherence ?? null).toBeNull();
  });
});

// =============================================================================
// RF-04 — snapshot grava compliancePct + dataSufficiency REAIS (nao hardcoded)
// =============================================================================
describe('METAS-2 snapshot — grava valores REAIS (RF-04 / DEC-5)', () => {
  it('via motor: upsertGoalSnapshot recebe compliancePct + dataSufficiency reais', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getPlannedVsActual.mockResolvedValue(
      plannedVsActual({ planned: 4, actual: 2, compliancePct: 50, dataSufficiency: 'ok', shortfall: 2 }),
    );
    const upsertGoalSnapshot = vi.fn(async (v: any) => ({ id: 'snap_1', ...v }));
    const storage = baseStorage({
      listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'sessions_per_week' })]),
      upsertGoalSnapshot,
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(upsertGoalSnapshot).toHaveBeenCalled();
    const arg = upsertGoalSnapshot.mock.calls[0]?.[0];
    expect(arg.compliancePct, 'compliancePct REAL no snapshot (antes nunca escrito)').toBe(50);
    expect(arg.dataSufficiency).toBe('ok');
  });

  it('dataSufficiency=low chega ao snapshot (NAO mascarado com ok hardcoded)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getPlannedVsActual.mockResolvedValue(
      plannedVsActual({ planned: null, actual: 0, compliancePct: null, dataSufficiency: 'low', shortfall: null, note: 'no_plan' }),
    );
    const upsertGoalSnapshot = vi.fn(async (v: any) => ({ id: 'snap_1', ...v }));
    const storage = baseStorage({
      listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'grind_days' })]),
      upsertGoalSnapshot,
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const arg = upsertGoalSnapshot.mock.calls[0]?.[0];
    expect(arg.dataSufficiency, 'low REAL no snapshot, nunca hardcoded ok').toBe('low');
  });
});

// =============================================================================
// Back-compat (lesson #7) — CRITICO
// =============================================================================
describe('METAS-2 scoreboard — back-compat fatia-1 (lesson #7)', () => {
  it('contrato mantem wigs/measures/snapshotsWeek + current/target/expectedNow/status', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getPlannedVsActual.mockResolvedValue(plannedVsActual());
    const storage = baseStorage({ listGoals: vi.fn(async () => [measureRow({ sourceMetric: 'sessions_per_week' })]) });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.body).toHaveProperty('wigs');
    expect(res.body).toHaveProperty('measures');
    expect(res.body).toHaveProperty('snapshotsWeek');
    const m = (res.body?.measures ?? [])[0];
    expect(m).toHaveProperty('current');
    expect(m).toHaveProperty('target');
    expect(m).toHaveProperty('expectedNow');
    expect(m).toHaveProperty('status');
  });

  it('WIG no scoreboard: SEM mudanca (NAO passa pelo motor)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    const storage = baseStorage({
      listGoals: vi.fn(async () => []),
      listActiveWigs: vi.fn(async () => [
        {
          careerGoalId: 'cg_1',
          title: 'De $5k para $20k',
          sourceMetric: 'bankroll_usd',
          baselineValue: '5000',
          targetValue: '20000',
          horizon: 'quarter',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          targetDeadline: '2026-12-01',
        },
      ]),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode).toBe(200);
    const wigs = res.body?.wigs ?? [];
    expect(wigs.length).toBe(1);
    expect(h.getPlannedVsActual, 'WIG nunca passa pelo motor (lag, sem plano)').not.toHaveBeenCalled();
    // WIG mantem o shape da fatia-1.
    expect(wigs[0]).toHaveProperty('careerGoalId');
    expect(wigs[0]).toHaveProperty('current');
    expect(wigs[0]).toHaveProperty('status');
  });

  it('meta direta criada na fatia-1 (roi_pct) renderiza com campos novos ausentes/null (nao quebra)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    const storage = baseStorage({
      listGoals: vi.fn(async () => [measureRow({ id: 'g_roi', sourceMetric: 'roi_pct', targetValue: '20' })]),
      getPerformanceByPeriod: vi.fn(async () => ({ roi: 18.5, totalTournaments: 120 })),
    });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    const m = (res.body?.measures ?? [])[0];
    // campos novos: compliancePct null + adherence null/ausente (nao quebra a UI legada).
    expect(m.compliancePct ?? null).toBeNull();
    expect(m.adherence ?? null).toBeNull();
  });
});

// =============================================================================
// RF-02 — createMeasure aceita leak_focus
// =============================================================================
describe('METAS-2 createMeasure — leak_focus (RF-02)', () => {
  const LEAK_MEASURE = {
    goalType: 'process',
    category: 'leak_focus',
    title: 'Atacar VPIP alto',
    sourceMetric: 'leak_focus_progress:vpip',
    targetValue: 5,
    unit: 'sessions',
    cadence: 'weekly',
    horizon: 'quarter',
    kind: 'measure',
  };

  it('POST leak_focus com statId valido -> 201 (NAO mais lead_no_data_source)', async () => {
    const { handleCreateGoal } = await import('../../../server/routes/goals');
    const createGoal = vi.fn(async (input: any) => ({ id: 'g_leak', status: 'active', goalKind: 'measure', ...input }));
    const storage = baseStorage({
      getUserByPlatformId: vi.fn(async () => ({ id: 'USER-1', userPlatformId: 'USER-1', subscriptionPlan: 'trial' })),
      countActiveMeasures: vi.fn(async () => 0),
      createGoal,
    });

    const res = makeRes();
    await handleCreateGoal(makeReq({ body: { ...LEAK_MEASURE } }), res, storage);

    expect(res.statusCode, 'leak_focus valido cria a meta (201)').toBe(201);
    expect(createGoal).toHaveBeenCalled();
  });

  it('POST leak_focus com statId INVALIDO -> recusa (lead_no_data_source), NAO persiste', async () => {
    const { handleCreateGoal } = await import('../../../server/routes/goals');
    const createGoal = vi.fn(async (input: any) => ({ id: 'g_leak', ...input }));
    const storage = baseStorage({
      getUserByPlatformId: vi.fn(async () => ({ id: 'USER-1', userPlatformId: 'USER-1', subscriptionPlan: 'trial' })),
      countActiveMeasures: vi.fn(async () => 0),
      createGoal,
    });

    const res = makeRes();
    await handleCreateGoal(
      makeReq({ body: { ...LEAK_MEASURE, sourceMetric: 'leak_focus_progress:nao_existe_xyz' } }),
      res,
      storage,
    );

    expect(res.statusCode, 'statId invalido recusado (4xx)').toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    const code = res.body?.code ?? res.body?.message ?? '';
    expect(String(code)).toContain('lead_no_data_source');
    expect(createGoal, 'NAO persiste meta com statId invalido').not.toHaveBeenCalled();
  });

  it('tier free -> 403 em POST leak_focus (write gated); read-only nao gateia', async () => {
    const { handleCreateGoal } = await import('../../../server/routes/goals');
    h.getReportTier.mockResolvedValue('free');
    const createGoal = vi.fn(async (input: any) => ({ id: 'g_leak', ...input }));
    const storage = baseStorage({
      getUserByPlatformId: vi.fn(async () => ({ id: 'USER-1', userPlatformId: 'USER-1', subscriptionPlan: 'free' })),
      countActiveMeasures: vi.fn(async () => 0),
      createGoal,
    });

    const res = makeRes();
    await handleCreateGoal(makeReq({ body: { ...LEAK_MEASURE } }), res, storage);

    expect(res.statusCode).toBe(403);
    expect(createGoal).not.toHaveBeenCalled();
  });

  it('tier free -> GET /scoreboard read-only continua 200 (com campos enriquecidos)', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    h.getReportTier.mockResolvedValue('free');
    const storage = baseStorage({ listGoals: vi.fn(async () => []) });

    const res = makeRes();
    await handleScoreboard(makeReq(), res, storage);

    expect(res.statusCode, 'scoreboard e read-only para todos os tiers (DEC-7)').toBe(200);
  });
});
