import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// EST-6 / ADR-224 — weeklyPlanningOrchestrator (RED phase)
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/coach/planning/weeklyPlanningOrchestrator.ts
//     startPlanning(userId, weekStartDate?, opts?: {source?, injectedStorage?})
//     getPlanningSession(userId, weekStartDate, injectedStorage?)
//     proposeStep(step, weekStartDate, input, ctx)
//     confirmStep(step, weekStartDate, input, ctx)
//     skipStep(step, weekStartDate, ctx)
//
// FATOS confirmados no codigo (NAO mocke idealizado — lesson #3):
//   - getStatsLeaks SEMPRE retorna [] (stub) -> RF-05 degrada como caminho normal.
//   - recommend_lesson tool NAO persiste coach_lesson_recommendations; o
//     orquestrador grava via storage.createCoachRecommendation (chave BRT).
//   - schedule_study_block.fetchPayloadBefore retorna null.
//   - getReportTier vem de server/coach/reportEligibility.
//   - confirmStep passa tx=undefined aos tools (lesson #32 — sem db.transaction).
//
// Convencoes:
//   - mock dos TOOLS por PATH EXATO (lesson #28) via vi.hoisted (lesson #14).
//   - getReportTier mockado por path.
//   - storage injetado por COMPOSICAO (injectedStorage no ctx/opts — lesson #34),
//     SEM vi.mock('../storage').
// =============================================================================

const h = vi.hoisted(() => ({
  bulkProposeFetch: vi.fn(),
  bulkProposeExec: vi.fn(),
  bulkProposeUndo: vi.fn(),
  scheduleStudyExec: vi.fn(),
  scheduleStudyUndo: vi.fn(),
  recommendLessonHandler: vi.fn(),
  markOffDayExec: vi.fn(),
  getReportTier: vi.fn(),
}));

vi.mock('../../../server/coachTools/handlers/bulkProposeGrade', () => ({
  bulkProposeGradeTool: {
    name: 'bulk_propose_grade',
    fetchPayloadBefore: h.bulkProposeFetch,
    executeConfirmed: h.bulkProposeExec,
    undo: h.bulkProposeUndo,
    gateByTier: ['pro', 'premium', 'admin'],
  },
}));

vi.mock('../../../server/coachTools/handlers/scheduleStudyBlock', () => ({
  scheduleStudyBlockTool: {
    name: 'schedule_study_block',
    fetchPayloadBefore: vi.fn(async () => null),
    executeConfirmed: h.scheduleStudyExec,
    undo: h.scheduleStudyUndo,
    gateByTier: ['pro', 'premium', 'admin'],
  },
}));

vi.mock('../../../server/coachTools/recommendLesson', () => ({
  recommendLessonTool: {
    name: 'recommend_lesson',
    handler: h.recommendLessonHandler,
    gateByTier: ['pro', 'premium', 'admin'],
  },
  default: { name: 'recommend_lesson', handler: h.recommendLessonHandler },
}));

vi.mock('../../../server/coachTools/handlers/markOffDay', () => ({
  markOffDayTool: {
    name: 'mark_off_day',
    executeConfirmed: h.markOffDayExec,
    gateByTier: ['pro', 'premium', 'admin'],
  },
}));

vi.mock('../../../server/coach/reportEligibility', () => ({
  getReportTier: h.getReportTier,
}));

async function loadOrchestrator() {
  return await import('../../../server/coach/planning/weeklyPlanningOrchestrator');
}

// -----------------------------------------------------------------------------
// Storage mock por composicao. Modela uma unica row de weekly_planning_sessions
// com UNIQUE (userId, weekStartDate) para provar idempotencia.
// -----------------------------------------------------------------------------
function makeStorage(overrides: Record<string, any> = {}) {
  const sessionsByKey = new Map<string, any>();
  const key = (u: string, w: string) => `${u}::${w}`;

  const base: any = {
    __sessions: sessionsByKey,
    // user lookup p/ getReportTier (o orquestrador resolve o user via storage)
    getUserByPlatformId: vi.fn(async (uid: string) => ({
      id: uid,
      userPlatformId: uid,
      role: null,
      subscriptionPlan: 'trial',
    })),
    // weekly_planning_sessions — UPSERT idempotente por (userId, weekStartDate)
    createWeeklyPlanningSession: vi.fn(async (row: any) => {
      const k = key(row.userId, row.weekStartDate);
      if (sessionsByKey.has(k)) return sessionsByKey.get(k); // UNIQUE -> retorna existente
      const created = { id: `wps_${sessionsByKey.size + 1}`, ...row };
      sessionsByKey.set(k, created);
      return created;
    }),
    getWeeklyPlanningSession: vi.fn(async (uid: string, w: string) => {
      return sessionsByKey.get(key(uid, w)) ?? null;
    }),
    updateWeeklyPlanningSession: vi.fn(async (id: string, patch: any) => {
      for (const [k, v] of sessionsByKey) {
        if (v.id === id) {
          const merged = { ...v, ...patch };
          sessionsByKey.set(k, merged);
          return merged;
        }
      }
      return null;
    }),
    // estudo
    upsertStudyWeeklyPlan: vi.fn(async (input: any) => ({ id: 'swp_1', ...input })),
    // aulas
    createCoachRecommendation: vi.fn(async (p: any) => ({ id: `rec_${p.lessonId}`, ...p })),
    deleteCoachRecommendationsForWeek: vi.fn(async () => undefined),
    // temas (stub real: SEMPRE [])
    getStatsLeaks: vi.fn(async () => []),
    listFocusStats: vi.fn(async () => []),
    // resumo no chat
    getOrCreateReportChatSession: vi.fn(async () => ({ id: 'chat_1' })),
    insertChatMessage: vi.fn(async () => ({ id: 'msg_1' })),
  };
  return { ...base, ...overrides };
}

function ctxFor(storage: any, userId = 'USER-0001') {
  return { userId, injectedStorage: storage };
}

const WSD = '2026-06-08'; // segunda UTC

beforeEach(() => {
  vi.clearAllMocks();
  h.getReportTier.mockResolvedValue('eligible');
  h.bulkProposeFetch.mockResolvedValue({
    preview: { proposed: [{ site: 'GG', name: 'Bounty', time: '20:00' }], conflicts: [], summary: { count: 1, totalBuyIn: 22, estimatedHours: 3 } },
  });
  h.bulkProposeExec.mockResolvedValue({
    payloadAfter: { createdIds: ['pt_1', 'pt_2'] },
    output: { registered: 2, conflicts: [] },
  });
  h.scheduleStudyExec.mockResolvedValue({
    payloadAfter: { id: 'ss_1' },
    output: { sessionId: 'ss_1', status: 'planned' },
  });
  h.recommendLessonHandler.mockResolvedValue({
    __type: 'ToolResult',
    ok: true,
    data: {
      lessons: [
        { id: 'l_1', slug: 's1', courseSlug: 'c1', title: 'Aula 1', url: '/biblioteca/curso/c1/s1' },
      ],
    },
  });
  h.markOffDayExec.mockResolvedValue({ output: { offDay: '2026-06-10' } });
});

// =============================================================================
// RF-01 — startPlanning (idempotencia + gate)
// =============================================================================
describe('EST-6 startPlanning (RF-01)', () => {
  it('cria 1 sessao com os 4 passos pending para tier elegivel', async () => {
    const { startPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    const { session } = await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    expect(session.steps.grind.status).toBe('pending');
    expect(session.steps.study.status).toBe('pending');
    expect(session.steps.lessons.status).toBe('pending');
    expect(session.steps.themes.status).toBe('pending');
    expect(storage.createWeeklyPlanningSession).toHaveBeenCalledTimes(1);
  });

  it('eh idempotente: 2 chamadas na mesma semana retornam a MESMA sessao (UNIQUE)', async () => {
    const { startPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    const a = await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const b = await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    expect(b.session.id).toBe(a.session.id);
    expect(storage.__sessions.size).toBe(1);
  });

  it('idempotencia preserva passos ja confirmados (nao reseta para pending)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep('grind', WSD, { profile: 'A', weekStartDate: WSD }, ctxFor(storage));
    const reopened = await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    expect(reopened.session.steps.grind.status).toBe('confirmed');
  });

  it('grava source est5_ritual quando passado por opts (pluggabilidade EST-5)', async () => {
    const { startPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    const { session } = await startPlanning('USER-0001', WSD, {
      source: 'est5_ritual',
      injectedStorage: storage,
    });
    expect(session.source).toBe('est5_ritual');
  });

  it('default de weekStartDate quando ausente (usa nextMondayUtc — cria 1 row)', async () => {
    const { startPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    const { session } = await startPlanning('USER-0001', undefined, { injectedStorage: storage });
    expect(session.weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(storage.createWeeklyPlanningSession).toHaveBeenCalledTimes(1);
  });

  it('tier free -> lanca/nega SEM criar row (gate de entrada)', async () => {
    h.getReportTier.mockResolvedValue('free');
    const { startPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    await expect(
      startPlanning('USER-FREE', WSD, { injectedStorage: storage }),
    ).rejects.toThrow();
    expect(storage.createWeeklyPlanningSession).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-06 — getPlanningSession (contrato pluggavel pro EST-5)
// =============================================================================
describe('EST-6 getPlanningSession (RF-06)', () => {
  it('retorna a sessao existente', async () => {
    const { startPlanning, getPlanningSession } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const s = await getPlanningSession('USER-0001', WSD, storage);
    expect(s?.weekStartDate).toBe(WSD);
  });

  it('retorna null quando nao existe sessao', async () => {
    const { getPlanningSession } = await loadOrchestrator();
    const storage = makeStorage();
    const s = await getPlanningSession('USER-0001', WSD, storage);
    expect(s).toBeNull();
  });
});

// =============================================================================
// RF-02 — passo grind (propose nao persiste / confirm delega)
// =============================================================================
describe('EST-6 confirmStep/proposeStep grind (RF-02)', () => {
  it('proposeStep(grind) usa fetchPayloadBefore e NAO persiste (nenhum executeConfirmed)', async () => {
    const { startPlanning, proposeStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const res = await proposeStep('grind', WSD, { profile: 'A', weekStartDate: WSD }, ctxFor(storage));
    expect(h.bulkProposeFetch).toHaveBeenCalledTimes(1);
    expect(h.bulkProposeExec).not.toHaveBeenCalled();
    expect(res.status).toBe('proposed');
    expect(res.preview).toBeDefined();
  });

  it('proposeStep passa o ctx {userId, injectedStorage} e tx=undefined ao tool', async () => {
    const { startPlanning, proposeStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await proposeStep('grind', WSD, { profile: 'A', weekStartDate: WSD }, ctxFor(storage));
    const call = h.bulkProposeFetch.mock.calls[0];
    expect(call[1]).toMatchObject({ userId: 'USER-0001', injectedStorage: storage });
    expect(call[2]).toBeUndefined();
  });

  it('confirmStep(grind) delega executeConfirmed, grava createdIds e marca confirmed', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { session } = await confirmStep('grind', WSD, { profile: 'A', weekStartDate: WSD }, ctxFor(storage));
    expect(h.bulkProposeExec).toHaveBeenCalledTimes(1);
    expect(session.steps.grind.status).toBe('confirmed');
    expect(session.steps.grind.createdIds).toEqual(['pt_1', 'pt_2']);
  });

  it('mark_off_day auxiliar do grind chama markOffDayTool.executeConfirmed', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    // input com offDays sinaliza folga antes de re-propor
    await confirmStep(
      'grind',
      WSD,
      { profile: 'A', weekStartDate: WSD, offDays: ['2026-06-10'] },
      ctxFor(storage),
    );
    expect(h.markOffDayExec).toHaveBeenCalled();
  });
});

// =============================================================================
// RF-03 — passo study (loop scheduleStudyBlock + UPSERT study_weekly_plans UTC)
// =============================================================================
describe('EST-6 confirmStep study (RF-03)', () => {
  it('cria 1 bloco por item via scheduleStudyBlockTool.executeConfirmed', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    h.scheduleStudyExec
      .mockResolvedValueOnce({ payloadAfter: { id: 'ss_1' }, output: { sessionId: 'ss_1' } })
      .mockResolvedValueOnce({ payloadAfter: { id: 'ss_2' }, output: { sessionId: 'ss_2' } });
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { session } = await confirmStep(
      'study',
      WSD,
      {
        blocks: [
          { topic: 'ICM', startAt: '2026-06-09T20:00:00Z', durationMinutes: 60 },
          { topic: 'Postflop', startAt: '2026-06-10T20:00:00Z', durationMinutes: 60 },
        ],
      },
      ctxFor(storage),
    );
    expect(h.scheduleStudyExec).toHaveBeenCalledTimes(2);
    expect(session.steps.study.sessionIds).toEqual(['ss_1', 'ss_2']);
    expect(session.steps.study.status).toBe('confirmed');
  });

  it('faz UPSERT em study_weekly_plans com source=coach_manual (1 row, re-confirm nao duplica)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const input = { blocks: [{ topic: 'ICM', startAt: '2026-06-09T20:00:00Z', durationMinutes: 60 }] };
    await confirmStep('study', WSD, input, ctxFor(storage));
    await confirmStep('study', WSD, input, ctxFor(storage)); // re-confirm
    // UPSERT em ambas as confirmacoes; chave UTC dedup naturalmente (1 row logico).
    expect(storage.upsertStudyWeeklyPlan).toHaveBeenCalled();
    for (const call of storage.upsertStudyWeeklyPlan.mock.calls) {
      expect(call[0].source).toBe('coach_manual');
      expect(call[0].weekStartDate).toBeDefined();
    }
  });

  it('bloco com tema de outro user -> erro theme_not_accessible propagado (nenhuma sessao confirmada)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    h.scheduleStudyExec.mockRejectedValueOnce(new Error('theme_not_accessible'));
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await expect(
      confirmStep(
        'study',
        WSD,
        { blocks: [{ topic: 'X', startAt: '2026-06-09T20:00:00Z', durationMinutes: 60, studyThemeId: 'theme_other' }] },
        ctxFor(storage),
      ),
    ).rejects.toThrow('theme_not_accessible');
  });

  it('bloco com aula sem entitlement -> erro lesson_not_accessible propagado', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    h.scheduleStudyExec.mockRejectedValueOnce(new Error('lesson_not_accessible'));
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await expect(
      confirmStep(
        'study',
        WSD,
        { blocks: [{ topic: 'X', startAt: '2026-06-09T20:00:00Z', durationMinutes: 60, lessonId: 'l_locked' }] },
        ctxFor(storage),
      ),
    ).rejects.toThrow('lesson_not_accessible');
  });
});

// =============================================================================
// RF-04 — passo lessons (whitelist do tool -> createCoachRecommendation BRT)
// =============================================================================
describe('EST-6 confirmStep lessons (RF-04)', () => {
  it('grava via storage.createCoachRecommendation (NAO no tool) por aula confirmada', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { session } = await confirmStep(
      'lessons',
      WSD,
      { leakTopic: 'postflop', lessonIds: ['l_1'] },
      ctxFor(storage),
    );
    expect(storage.createCoachRecommendation).toHaveBeenCalled();
    expect(session.steps.lessons.status).toBe('confirmed');
  });

  it('usa a chave BRT (brtMondayYmd) no weekStartDate da rec — distinta da chave UTC do study plan', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep('lessons', WSD, { leakTopic: 'postflop', lessonIds: ['l_1'] }, ctxFor(storage));
    const recCall = storage.createCoachRecommendation.mock.calls[0][0];
    expect(recCall.weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(recCall.source).toBe('coach_manual');
  });

  it('aula fora da whitelist do tool eh rejeitada (so grava lessonId que veio do tool — anti-alucinacao)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    // tool so retorna l_1; jogador tenta confirmar l_hallucinated tambem.
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep(
      'lessons',
      WSD,
      { leakTopic: 'postflop', lessonIds: ['l_1', 'l_hallucinated'] },
      ctxFor(storage),
    );
    const grantedIds = storage.createCoachRecommendation.mock.calls.map((c: any[]) => c[0].lessonId);
    expect(grantedIds).toContain('l_1');
    expect(grantedIds).not.toContain('l_hallucinated');
  });

  it('re-recomendar nao acumula: delete-then-insert das recs da semana BRT', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep('lessons', WSD, { leakTopic: 'postflop', lessonIds: ['l_1'] }, ctxFor(storage));
    await confirmStep('lessons', WSD, { leakTopic: 'postflop', lessonIds: ['l_1'] }, ctxFor(storage));
    expect(storage.deleteCoachRecommendationsForWeek).toHaveBeenCalled();
  });
});

// =============================================================================
// RF-05 — passo themes (degrade gracioso eh o caminho NORMAL — getStatsLeaks=[])
// =============================================================================
describe('EST-6 confirmStep themes (RF-05) — degrade gracioso', () => {
  it('com getStatsLeaks=[] (stub real) cai no fallback sem quebrar; status nao vira error', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage(); // getStatsLeaks -> []
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { session } = await confirmStep('themes', WSD, {}, ctxFor(storage));
    expect(session.steps.themes.status).toBe('confirmed');
    expect(session.steps.themes.status).not.toBe('error');
  });

  it('com leaks disponiveis retorna top-N temas-foco (statId/statName/severity)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage({
      getStatsLeaks: vi.fn(async () => [
        { statId: 'vpip', statName: 'VPIP', severity: 'high' },
        { statId: 'pfr', statName: 'PFR', severity: 'medium' },
      ]),
    });
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { session } = await confirmStep('themes', WSD, {}, ctxFor(storage));
    expect(session.steps.themes.focus?.length).toBeGreaterThanOrEqual(1);
    expect(session.steps.themes.focus?.[0].statId).toBe('vpip');
  });

  it('NAO executa nenhum write novo no passo themes (sem tool de escrita chamado)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep('themes', WSD, {}, ctxFor(storage));
    expect(h.bulkProposeExec).not.toHaveBeenCalled();
    expect(h.scheduleStudyExec).not.toHaveBeenCalled();
    expect(storage.createCoachRecommendation).not.toHaveBeenCalled();
    expect(storage.upsertStudyWeeklyPlan).not.toHaveBeenCalled();
  });
});

// =============================================================================
// skipStep
// =============================================================================
describe('EST-6 skipStep', () => {
  it('marca o passo como skipped sem chamar tool de escrita', async () => {
    const { startPlanning, skipStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { session } = await skipStep('grind', WSD, ctxFor(storage));
    expect(session.steps.grind.status).toBe('skipped');
    expect(h.bulkProposeExec).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-06 — conclusao do flow (status=completed + resumo no chat)
// =============================================================================
describe('EST-6 conclusao do flow (RF-06)', () => {
  it('quando os 4 passos estao confirmed/skipped -> status=completed', async () => {
    const { startPlanning, confirmStep, skipStep, getPlanningSession } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep('grind', WSD, { profile: 'A', weekStartDate: WSD }, ctxFor(storage));
    await confirmStep(
      'study',
      WSD,
      { blocks: [{ topic: 'ICM', startAt: '2026-06-09T20:00:00Z', durationMinutes: 60 }] },
      ctxFor(storage),
    );
    await confirmStep('lessons', WSD, { leakTopic: 'postflop', lessonIds: ['l_1'] }, ctxFor(storage));
    await skipStep('themes', WSD, ctxFor(storage));
    const s = await getPlanningSession('USER-0001', WSD, storage);
    expect(s?.status).toBe('completed');
  });

  it('ao concluir posta o resumo no chat (getOrCreateReportChatSession + insertChatMessage role=assistant)', async () => {
    const { startPlanning, skipStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await skipStep('grind', WSD, ctxFor(storage));
    await skipStep('study', WSD, ctxFor(storage));
    await skipStep('lessons', WSD, ctxFor(storage));
    await skipStep('themes', WSD, ctxFor(storage)); // ultimo -> completa
    expect(storage.getOrCreateReportChatSession).toHaveBeenCalledWith('USER-0001');
    const msgCall = storage.insertChatMessage.mock.calls[0][0];
    expect(msgCall.role).toBe('assistant');
    expect(typeof msgCall.content).toBe('string');
  });

  it('pular TODOS os passos ainda conclui (status=completed mesmo tudo skipped)', async () => {
    const { startPlanning, skipStep, getPlanningSession } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await skipStep('grind', WSD, ctxFor(storage));
    await skipStep('study', WSD, ctxFor(storage));
    await skipStep('lessons', WSD, ctxFor(storage));
    await skipStep('themes', WSD, ctxFor(storage));
    const s = await getPlanningSession('USER-0001', WSD, storage);
    expect(s?.status).toBe('completed');
  });

  it('NAO posta resumo enquanto o flow esta in_progress (apenas 3 de 4 confirmados)', async () => {
    const { startPlanning, confirmStep, skipStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep('grind', WSD, { profile: 'A', weekStartDate: WSD }, ctxFor(storage));
    await skipStep('study', WSD, ctxFor(storage));
    await skipStep('lessons', WSD, ctxFor(storage));
    // themes ainda pending -> in_progress
    expect(storage.insertChatMessage).not.toHaveBeenCalled();
  });

  it('EST-5 (mock) chama startPlanning direto e le status=completed via getPlanningSession', async () => {
    const { startPlanning, skipStep, getPlanningSession } = await loadOrchestrator();
    const storage = makeStorage();
    // Simula o estado planning do EST-5 abrindo o flow com source dedicado.
    await startPlanning('USER-0001', WSD, { source: 'est5_ritual', injectedStorage: storage });
    await skipStep('grind', WSD, ctxFor(storage));
    await skipStep('study', WSD, ctxFor(storage));
    await skipStep('lessons', WSD, ctxFor(storage));
    await skipStep('themes', WSD, ctxFor(storage));
    const s = await getPlanningSession('USER-0001', WSD, storage);
    expect(s?.status).toBe('completed');
    expect(s?.source).toBe('est5_ritual');
  });
});

// =============================================================================
// Validacao de input (step invalido no orquestrador)
// =============================================================================
describe('EST-6 validacao de step', () => {
  it('confirmStep com step invalido lanca', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await expect(
      confirmStep('warmup' as any, WSD, {}, ctxFor(storage)),
    ).rejects.toThrow();
  });
});

// =============================================================================
// FIX 1 (CRITICAL) — confirmLessons NAO viola UNIQUE (user_id, week_start_date).
// coach_lesson_recommendations eh 1-row/semana por design. Confirmar 2+ aulas
// DEVE consolidar numa unica row (lessonId primario + inputSummary.lessonIds).
// =============================================================================
describe('EST-6 confirmLessons consolidacao (FIX 1 — UNIQUE 1-row/semana)', () => {
  // storage que SIMULA a UNIQUE (user_id, week_start_date): 2o insert na mesma
  // chave LANCA (igual ao PG). Prova que nao ha colisao com 2+ aulas.
  function makeStorageWithUniqueRec(overrides: Record<string, any> = {}) {
    const recByWeek = new Map<string, any>(); // key: userId::weekStartDate
    const base = makeStorage({
      // whitelist com 3 aulas para todas serem concedidas
      createCoachRecommendation: vi.fn(async (p: any) => {
        const k = `${p.userId}::${p.weekStartDate}`;
        if (recByWeek.has(k)) {
          throw new Error('duplicate key value violates unique constraint "uq_coach_rec_user_week"');
        }
        const rec = { id: `rec_${p.lessonId}`, ...p };
        recByWeek.set(k, rec);
        return rec;
      }),
      // delete limpa a chave (delete-then-insert idempotente)
      deleteCoachRecommendationsForWeek: vi.fn(async (uid: string, week: string) => {
        recByWeek.delete(`${uid}::${week}`);
      }),
      __recByWeek: recByWeek,
      ...overrides,
    });
    return base;
  }

  it('confirmar 3 aulas insere UMA row (lessonId=l_1 + inputSummary.lessonIds=[l_1,l_2,l_3]) sem violar UNIQUE', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorageWithUniqueRec();
    // tool retorna as 3 aulas -> todas na whitelist
    h.recommendLessonHandler.mockResolvedValue({
      __type: 'ToolResult',
      ok: true,
      data: {
        lessons: [
          { id: 'l_1', slug: 's1', courseSlug: 'c1', title: 'A1', url: '/x' },
          { id: 'l_2', slug: 's2', courseSlug: 'c1', title: 'A2', url: '/x' },
          { id: 'l_3', slug: 's3', courseSlug: 'c1', title: 'A3', url: '/x' },
        ],
      },
    });
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { session, stepResult } = await confirmStep(
      'lessons',
      WSD,
      { leakTopic: 'postflop', lessonIds: ['l_1', 'l_2', 'l_3'] },
      ctxFor(storage),
    );
    // UMA chamada (sem colisao na UNIQUE)
    expect(storage.createCoachRecommendation).toHaveBeenCalledTimes(1);
    const call = storage.createCoachRecommendation.mock.calls[0][0];
    expect(call.lessonId).toBe('l_1');
    expect(call.inputSummary).toMatchObject({ lessonIds: ['l_1', 'l_2', 'l_3'] });
    // stepResult mantem a lista completa + status confirmed
    expect(stepResult.lessonIds).toEqual(['l_1', 'l_2', 'l_3']);
    expect(session.steps.lessons.status).toBe('confirmed');
    // 1 row logico na semana
    expect(storage.__recByWeek.size).toBe(1);
  });

  it('granted vazio (todas alucinadas) -> NAO insere (delete ja limpou)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorageWithUniqueRec();
    h.recommendLessonHandler.mockResolvedValue({
      __type: 'ToolResult', ok: true, data: { lessons: [{ id: 'l_real', slug: 's', courseSlug: 'c', title: 'A', url: '/x' }] },
    });
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    const { stepResult } = await confirmStep(
      'lessons',
      WSD,
      { lessonIds: ['l_hallucinated'] },
      ctxFor(storage),
    );
    expect(storage.createCoachRecommendation).not.toHaveBeenCalled();
    expect(storage.deleteCoachRecommendationsForWeek).toHaveBeenCalled();
    expect(stepResult.lessonIds).toEqual([]);
    expect(stepResult.droppedLessonIds).toContain('l_hallucinated');
  });
});

// =============================================================================
// FIX 2 (HIGH) — tier defense-in-depth no confirmStep. Downgrade pos-start
// NAO pode escrever. confirmStep revalida getReportTier a cada chamada.
// =============================================================================
describe('EST-6 tier defense-in-depth (FIX 2)', () => {
  it('downgrade para free apos startPlanning -> confirmStep lanca e NAO escreve', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    // eligible no start, free no confirm
    h.getReportTier.mockResolvedValueOnce('eligible').mockResolvedValue('free');
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await expect(
      confirmStep('grind', WSD, { profile: 'A' }, ctxFor(storage)),
    ).rejects.toThrow(/tier_not_eligible/);
    // nenhum write delegado ao tool
    expect(h.bulkProposeExec).not.toHaveBeenCalled();
  });

  it('proposeStep tambem revalida tier (downgrade -> lanca)', async () => {
    const { startPlanning, proposeStep } = await loadOrchestrator();
    const storage = makeStorage();
    h.getReportTier.mockResolvedValueOnce('eligible').mockResolvedValue('free');
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await expect(
      proposeStep('grind', WSD, { profile: 'A' }, ctxFor(storage)),
    ).rejects.toThrow(/tier_not_eligible/);
    expect(h.bulkProposeFetch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// FIX 3 (MEDIUM) — grind confirm/propose injeta weekStartDate do path no tool.
// =============================================================================
describe('EST-6 grind weekStartDate do path (FIX 3)', () => {
  it('confirmStep(grind) passa weekStartDate do path ao tool (path vence body divergente)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    // body com weekStartDate divergente -> path WSD deve vencer
    await confirmStep('grind', WSD, { profile: 'A', weekStartDate: '2099-01-04' }, ctxFor(storage));
    const toolInput = h.bulkProposeExec.mock.calls[0][0];
    expect(toolInput.weekStartDate).toBe(WSD);
  });

  it('proposeStep(grind) injeta weekStartDate do path mesmo quando body omite', async () => {
    const { startPlanning, proposeStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await proposeStep('grind', WSD, { profile: 'A' }, ctxFor(storage));
    const toolInput = h.bulkProposeFetch.mock.calls[0][0];
    expect(toolInput.weekStartDate).toBe(WSD);
  });
});

// =============================================================================
// FIX 4 (MEDIUM) — dailyTargetMinutes = media por dia distinto (NAO soma).
// =============================================================================
describe('EST-6 dailyTargetMinutes media por dia (FIX 4)', () => {
  it('2 blocos de 60min em 2 dias distintos -> dailyTargetMinutes=60 (nao 120)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep(
      'study',
      WSD,
      {
        blocks: [
          { topic: 'ICM', startAt: '2026-06-09T20:00:00Z', durationMinutes: 60 },
          { topic: 'Postflop', startAt: '2026-06-10T20:00:00Z', durationMinutes: 60 },
        ],
      },
      ctxFor(storage),
    );
    const upsert = storage.upsertStudyWeeklyPlan.mock.calls[0][0];
    expect(upsert.dailyTargetMinutes).toBe(60);
  });

  it('2 blocos de 60min no MESMO dia -> dailyTargetMinutes=120 (1 dia distinto)', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep(
      'study',
      WSD,
      {
        blocks: [
          { topic: 'ICM', startAt: '2026-06-09T20:00:00Z', durationMinutes: 60 },
          { topic: 'ICM-2', startAt: '2026-06-09T22:00:00Z', durationMinutes: 60 },
        ],
      },
      ctxFor(storage),
    );
    const upsert = storage.upsertStudyWeeklyPlan.mock.calls[0][0];
    expect(upsert.dailyTargetMinutes).toBe(120);
  });

  it('0 blocos -> dailyTargetMinutes default 30', async () => {
    const { startPlanning, confirmStep } = await loadOrchestrator();
    const storage = makeStorage();
    await startPlanning('USER-0001', WSD, { injectedStorage: storage });
    await confirmStep('study', WSD, { blocks: [] }, ctxFor(storage));
    const upsert = storage.upsertStudyWeeklyPlan.mock.calls[0][0];
    expect(upsert.dailyTargetMinutes).toBe(30);
  });
});

// =============================================================================
// FIX 5 (MEDIUM) — null guard em normalizeSession sob race de persistencia.
// =============================================================================
describe('EST-6 null guard persist (FIX 5)', () => {
  it('startPlanning lanca planning_session_persist_failed se createWeeklyPlanningSession vier null', async () => {
    const { startPlanning } = await loadOrchestrator();
    const storage = makeStorage({
      createWeeklyPlanningSession: vi.fn(async () => null),
    });
    await expect(
      startPlanning('USER-0001', WSD, { injectedStorage: storage }),
    ).rejects.toThrow(/planning_session_persist_failed/);
  });
});
