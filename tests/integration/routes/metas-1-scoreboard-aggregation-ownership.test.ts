import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// METAS-1 fatia-1 (ADR-229) — FIX-WAVE (pos-reviewer CHANGES-REQUESTED)
//
// Cobre 2 bugs que a green phase MASCAROU com mocks idealizados (lesson #3):
//
//   CRITICAL-2 — scoreboard `current` nunca agrega de verdade:
//     handleScoreboard chama aggregateCurrentValue(userId, sourceMetric, {weekStartDate})
//     SEM o 4o arg `deps`. aggregateCurrentValue entao usa deps={} -> todos os
//     deps.getX?.() sao undefined -> value sempre null/0. O placar fica vazio em
//     PROD. O teste anterior PASSAVA porque MOCKAVA aggregateCurrentValue p/ {value:50}.
//     Aqui NAO mockamos aggregateCurrentValue: injetamos um storage com fetchers
//     reais (com as assinaturas REAIS do storage, que DIVERGEM de AggregateDeps:
//       getGrindSessions(userId,{limit})        — sem janela
//       getStudySessionsV2(userId,{mode,from,to,limit})
//       listWalletsByUser(userId,{includeArchived})   (NAO getWallets)
//       getPerformanceByPeriod(userId, period:string) — period e STRING, nao window
//     ) e asserimos que scoreboard.measures[].current reflete a agregacao. Isso
//     FORCA o handler a construir `deps` reais (adaptadores das assinaturas).
//
//   MEDIUM-1 — link-measure sem validacao de ownership:
//     POST /api/goals/:id/link-measure deve recusar (404/403) quando a WIG :id OU
//     a measureId pertencem a OUTRO user. Hoje linkMeasure nao valida ownership.
//
// SUPOSICOES documentadas:
//   - handleScoreboard/handleLinkMeasure exportados aceitam injectedStorage como
//     3o arg (lesson #34) — chamo o handler DIRETO com req/res fakes + storage
//     injetado (sem montar Express; o roteamento ja e coberto pelo route-collision
//     test). aggregateCurrentValue NAO e mockado (testa o deps-building real).
//   - "agregacao reflete o dado": para sourceMetric 'study_minutes_week' (kind
//     'study', somatorio de durationMinutes) injeto 2 study sessions de 150min cada
//     -> current === 300. Para 'sessions_per_week' (kind volume, count completed)
//     injeto 3 grind_sessions completed -> current === 3.
//   - ownership: o storage injetado retorna null/[]/throw para recursos de outro
//     dono; o handler deve responder 404 (recurso nao encontrado p/ este user) OU
//     403. Asserto status >=400 e <500 + NUNCA 200/201 + linkMeasure NAO chamado
//     (ou chamado e retornou null -> handler 404). Aceito 403 ou 404 (ambos negam).
//
// .test.ts roda no projeto "server" (node).
// =============================================================================

vi.mock('../../../server/coach/reportEligibility', () => ({
  getReportTier: vi.fn(async () => 'eligible'),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// -----------------------------------------------------------------------------
// CRITICAL-2 — scoreboard.current agrega DE VERDADE (deps construido do storage).
// -----------------------------------------------------------------------------
describe('METAS-1 scoreboard — current AGREGA do dado real (CRITICAL-2, deps build)', () => {
  it('study_minutes_week: 2 study sessions x150min -> measures[0].current === 300', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');

    const storage: any = {
      listGoals: vi.fn(async () => [
        {
          id: 'g_study',
          userId: 'USER-1',
          goalKind: 'measure',
          status: 'active',
          sourceMetric: 'study_minutes_week',
          targetValue: '600',
          baselineValue: '0',
          horizon: 'quarter',
          direction: 'up',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          targetDeadline: '2026-12-01',
        },
      ]),
      listActiveWigs: vi.fn(async () => []),
      upsertGoalSnapshot: vi.fn(async (v: any) => ({ id: 'snap_1', ...v })),
      // assinaturas REAIS do storage (divergem de AggregateDeps) — o handler deve adaptar:
      getGrindSessions: vi.fn(async (_uid: string, _opts?: any) => []),
      getStudySessionsV2: vi.fn(async (_uid: string, _filter?: any) => [
        { id: 's1', durationMinutes: 150, deletedAt: null },
        { id: 's2', durationMinutes: 150, deletedAt: null },
      ]),
      listWalletsByUser: vi.fn(async () => []),
      getPerformanceByPeriod: vi.fn(async () => ({})),
    };

    const req = makeReq();
    const res = makeRes();
    await handleScoreboard(req, res, storage);

    expect(res.statusCode).toBe(200);
    const measures = res.body?.measures ?? [];
    expect(measures.length).toBeGreaterThan(0);
    expect(
      measures[0].current,
      'current deve refletir a agregacao real (2x150 = 300), nao null/0 — o handler precisa montar deps',
    ).toBe(300);
    // prova que o handler de fato construiu o adaptador a partir do storage.
    expect(storage.getStudySessionsV2).toHaveBeenCalled();
  });

  it('sessions_per_week: 3 grind_sessions completed -> measures[0].current === 3', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');

    const storage: any = {
      listGoals: vi.fn(async () => [
        {
          id: 'g_vol',
          userId: 'USER-1',
          goalKind: 'measure',
          status: 'active',
          sourceMetric: 'sessions_per_week',
          targetValue: '5',
          baselineValue: '0',
          horizon: 'quarter',
          direction: 'up',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          targetDeadline: '2026-12-01',
        },
      ]),
      listActiveWigs: vi.fn(async () => []),
      upsertGoalSnapshot: vi.fn(async (v: any) => ({ id: 'snap_1', ...v })),
      getGrindSessions: vi.fn(async (_uid: string, _opts?: any) => [
        { id: 'gs1', status: 'completed' },
        { id: 'gs2', status: 'completed' },
        { id: 'gs3', status: 'completed' },
        { id: 'gs4', status: 'planned' }, // nao conta
      ]),
      getStudySessionsV2: vi.fn(async () => []),
      listWalletsByUser: vi.fn(async () => []),
      getPerformanceByPeriod: vi.fn(async () => ({})),
    };

    const req = makeReq();
    const res = makeRes();
    await handleScoreboard(req, res, storage);

    expect(res.statusCode).toBe(200);
    const measures = res.body?.measures ?? [];
    expect(measures.length).toBeGreaterThan(0);
    expect(
      measures[0].current,
      'current deve contar 3 grind_sessions completed (volume), nao null/0',
    ).toBe(3);
    expect(storage.getGrindSessions).toHaveBeenCalled();
  });

  it('o snapshot UPSERT recebe currentValue agregado (nao null) — proxy do mesmo bug', async () => {
    const { handleScoreboard } = await import('../../../server/routes/goals');
    const storage: any = {
      listGoals: vi.fn(async () => [
        {
          id: 'g_study',
          userId: 'USER-1',
          goalKind: 'measure',
          status: 'active',
          sourceMetric: 'study_minutes_week',
          targetValue: '600',
          baselineValue: '0',
          horizon: 'quarter',
          direction: 'up',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          targetDeadline: '2026-12-01',
        },
      ]),
      listActiveWigs: vi.fn(async () => []),
      upsertGoalSnapshot: vi.fn(async (v: any) => ({ id: 'snap_1', ...v })),
      getGrindSessions: vi.fn(async () => []),
      getStudySessionsV2: vi.fn(async () => [
        { id: 's1', durationMinutes: 200, deletedAt: null },
        { id: 's2', durationMinutes: 100, deletedAt: null },
      ]),
      listWalletsByUser: vi.fn(async () => []),
      getPerformanceByPeriod: vi.fn(async () => ({})),
    };
    const req = makeReq();
    const res = makeRes();
    await handleScoreboard(req, res, storage);

    expect(storage.upsertGoalSnapshot).toHaveBeenCalled();
    const snapArg = storage.upsertGoalSnapshot.mock.calls[0]?.[0];
    expect(snapArg?.currentValue, 'snapshot deve gravar o currentValue agregado (300), nao null').toBe(300);
  });
});

// -----------------------------------------------------------------------------
// MEDIUM-1 — link-measure valida ownership da WIG e da medida (cross-user).
// -----------------------------------------------------------------------------
describe('METAS-1 link-measure — ownership cross-user (MEDIUM-1)', () => {
  it('WIG :id de OUTRO user -> nega (404/403), NAO vincula', async () => {
    const { handleLinkMeasure } = await import('../../../server/routes/goals');

    const linkMeasure = vi.fn(async () => ({ id: 'lnk_1' }));
    const storage: any = {
      getUserByPlatformId: vi.fn(async () => ({ id: 'USER-1', userPlatformId: 'USER-1', subscriptionPlan: 'trial' })),
      // a WIG cg_outro pertence a OUTRO user -> getWig retorna null para USER-1.
      getWig: vi.fn(async (_uid: string, _id: string) => null),
      getGoal: vi.fn(async (uid: string, id: string) => ({ id, userId: uid, goalKind: 'measure' })),
      linkMeasure,
    };

    const req = makeReq({ params: { id: 'cg_outro' }, body: { measureId: 'g_meu' } });
    const res = makeRes();
    await handleLinkMeasure(req, res, storage);

    expect(res.statusCode, 'WIG de outro dono deve negar (404/403)').toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect([403, 404]).toContain(res.statusCode);
    expect(linkMeasure, 'NAO pode vincular medida a WIG de outro dono').not.toHaveBeenCalled();
  });

  it('measureId de OUTRO user -> nega (404/403), NAO vincula', async () => {
    const { handleLinkMeasure } = await import('../../../server/routes/goals');

    const linkMeasure = vi.fn(async () => ({ id: 'lnk_1' }));
    const storage: any = {
      getUserByPlatformId: vi.fn(async () => ({ id: 'USER-1', userPlatformId: 'USER-1', subscriptionPlan: 'trial' })),
      // a WIG e do USER-1, mas a medida g_outro pertence a outro dono -> getGoal null.
      getWig: vi.fn(async (uid: string, id: string) => ({ careerGoalId: id, userId: uid, status: 'active' })),
      getGoal: vi.fn(async (_uid: string, _id: string) => null),
      linkMeasure,
    };

    const req = makeReq({ params: { id: 'cg_meu' }, body: { measureId: 'g_outro' } });
    const res = makeRes();
    await handleLinkMeasure(req, res, storage);

    expect(res.statusCode, 'medida de outro dono deve negar (404/403)').toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    expect([403, 404]).toContain(res.statusCode);
    expect(linkMeasure, 'NAO pode vincular medida de outro dono').not.toHaveBeenCalled();
  });

  it('WIG + medida do MESMO dono -> vincula (200) — caminho feliz preservado', async () => {
    const { handleLinkMeasure } = await import('../../../server/routes/goals');

    const linkMeasure = vi.fn(async () => ({ id: 'lnk_1', wigCareerGoalId: 'cg_meu', measureId: 'g_meu' }));
    const storage: any = {
      getUserByPlatformId: vi.fn(async () => ({ id: 'USER-1', userPlatformId: 'USER-1', subscriptionPlan: 'trial' })),
      getWig: vi.fn(async (uid: string, id: string) => ({ careerGoalId: id, userId: uid, status: 'active' })),
      getGoal: vi.fn(async (uid: string, id: string) => ({ id, userId: uid, goalKind: 'measure' })),
      linkMeasure,
    };

    const req = makeReq({ params: { id: 'cg_meu' }, body: { measureId: 'g_meu' } });
    const res = makeRes();
    await handleLinkMeasure(req, res, storage);

    expect(res.statusCode).toBe(200);
    expect(linkMeasure).toHaveBeenCalledWith('USER-1', 'cg_meu', 'g_meu');
  });
});
