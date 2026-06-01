import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// EST-5 / ADR-226 — weeklyReviewOrchestrator (RED phase)
//
// Modulo alvo (AINDA NAO EXISTE):
//   server/coach/weeklyReview/weeklyReviewOrchestrator.ts
//     createWeeklyReview(userId, weekStartDate?, opts?: {injectedStorage?})
//        -> { review }  (idempotente: cria recap_sent, monta+persiste recap,
//                        posta no chat, avanca p/ awaiting_upload)
//     getWeeklyReview(userId, weekStartDate, injectedStorage?)
//        -> WeeklyReview | null  (null se nao existe, NAO lanca)
//     advanceWeeklyReview(userId, weekStartDate, fromStatus, toStatus, injectedStorage?)
//        -> WeeklyReview  (rejeita invalida com invalid_weekly_review_transition)
//     confirmUpload(userId, weekStartDate, ctx?: {injectedStorage?})
//        -> { review, uploadDetected, source }
//     runDeepAnalysis(userId, weekStartDate, ctx?) -> WeeklyReview
//     handoffToPlanning(userId, weekStartDate, ctx?) -> WeeklyReview
//
// Erros nomeados (err.code): invalid_weekly_review_transition,
//   weekly_review_not_found, tier_not_eligible, weekly_review_persist_failed.
//
// Mocks por PATH EXATO (lesson #28) via vi.hoisted (lesson #14):
//   - getReportTier de server/coach/reportEligibility (gate de tier).
//   - startPlanning de server/coach/planning/weeklyPlanningOrchestrator (handoff RF-07).
//   - callReportLlm de server/coach/anthropicClient (DEC-1 — assert NUNCA invocado).
//   - gatherBundle/buildMentalState/buildStudyWeek de weeklyReportGenerator (RF-04/06).
//
// Storage injetado por COMPOSICAO (injectedStorage — lesson #34), SEM vi.mock('../storage').
// Shapes REAIS (lesson #3):
//   - getLastUploadAt -> Date | null
//   - getOrCreateReportChatSession -> { id }
//   - insertChatMessage({ chatSessionId, role, content }) -> { id }
//   - createWeeklyReview idempotencia via Map UNIQUE(userId, weekStartDate) (espelha EST-6).
// =============================================================================

const h = vi.hoisted(() => ({
  getReportTier: vi.fn(),
  startPlanning: vi.fn(),
  callReportLlm: vi.fn(),
  gatherBundle: vi.fn(),
  buildMentalState: vi.fn(),
  buildStudyWeek: vi.fn(),
}));

vi.mock('../../../server/coach/reportEligibility', () => ({
  getReportTier: h.getReportTier,
  LIST_USERS_FOR_REPORTS_FILTER: "subscription_plan IN ('trial','active','admin')",
}));

vi.mock('../../../server/coach/planning/weeklyPlanningOrchestrator', () => ({
  startPlanning: h.startPlanning,
}));

// DEC-1: a deep analysis é DETERMINISTICA. O cliente Anthropic NUNCA é invocado.
// Mockamos callReportLlm para PROVAR que nenhum teste o chama (assert .not.toHaveBeenCalled).
vi.mock('../../../server/coach/anthropicClient', () => ({
  callReportLlm: h.callReportLlm,
  getAnthropicClient: vi.fn(() => {
    throw new Error('anthropic_must_not_be_constructed_in_est5');
  }),
}));

// gatherBundle precisa virar exportado (ADR-226 §Consequencias). buildMentalState/
// buildStudyWeek ja sao exportados. Mockamos os 3 por path para isolar o orquestrador.
vi.mock('../../../server/services/weeklyReportGenerator', () => ({
  gatherBundle: h.gatherBundle,
  buildMentalState: h.buildMentalState,
  buildStudyWeek: h.buildStudyWeek,
}));

async function loadOrchestrator() {
  return await import('../../../server/coach/weeklyReview/weeklyReviewOrchestrator');
}

// -----------------------------------------------------------------------------
// Storage mock por composicao. Modela 1 row de weekly_reviews com UNIQUE
// (userId, weekStartDate) para provar idempotencia (espelha EST-6 makeStorage).
// -----------------------------------------------------------------------------
function makeStorage(overrides: Record<string, any> = {}) {
  const reviewsByKey = new Map<string, any>();
  const key = (u: string, w: string) => `${u}::${w}`;

  const base: any = {
    __reviews: reviewsByKey,
    getUserByPlatformId: vi.fn(async (uid: string) => ({
      id: uid,
      userPlatformId: uid,
      role: null,
      subscriptionPlan: 'trial',
      timezone: 'America/Sao_Paulo',
    })),
    // weekly_reviews — onConflictDoNothing + re-leitura (idempotente por UNIQUE)
    createWeeklyReview: vi.fn(async (row: any) => {
      const k = key(row.userId, row.weekStartDate);
      if (reviewsByKey.has(k)) return reviewsByKey.get(k); // UNIQUE -> retorna existente
      const created = { id: `wr_${reviewsByKey.size + 1}`, ...row };
      reviewsByKey.set(k, created);
      return created;
    }),
    getWeeklyReview: vi.fn(async (uid: string, w: string) => {
      return reviewsByKey.get(key(uid, w)) ?? null;
    }),
    updateWeeklyReview: vi.fn(async (id: string, patch: any) => {
      for (const [k, v] of reviewsByKey) {
        if (v.id === id) {
          const merged = { ...v, ...patch };
          reviewsByKey.set(k, merged);
          return merged;
        }
      }
      return null;
    }),
    // sinal de upload (RF-05) — shape REAL: Date | null
    getLastUploadAt: vi.fn(async () => null),
    // chat do mentor (RF-03) — shapes REAIS
    getOrCreateReportChatSession: vi.fn(async () => ({ id: 'chat_1' })),
    insertChatMessage: vi.fn(async () => ({ id: 'msg_1' })),
  };
  return { ...base, ...overrides };
}

function ctxFor(storage: any) {
  return { injectedStorage: storage };
}

const WSD = '2026-06-08'; // segunda UTC (chave da review = semana corrente)

beforeEach(() => {
  vi.clearAllMocks();
  h.getReportTier.mockResolvedValue('eligible');
  h.startPlanning.mockResolvedValue({ session: { id: 'wps_1', weekStartDate: WSD, source: 'est5_ritual' } });
  h.gatherBundle.mockResolvedValue({
    dashStats7d: { count: 40, profit: 120, roi: 8 },
    grindSessions: [],
    breakFeedbacks: [],
    studySessions: [],
    weekStart: new Date('2026-06-01T00:00:00Z'),
    weekEnd: new Date('2026-06-07T23:59:59Z'),
  });
  h.buildMentalState.mockReturnValue(null);
  h.buildStudyWeek.mockReturnValue(null);
});

// =============================================================================
// RF-01 — createWeeklyReview (idempotencia + estado inicial + recap no chat)
// =============================================================================
describe('EST-5 createWeeklyReview (RF-01)', () => {
  it('cria 1 review e avanca para awaiting_upload (recap postado no mesmo ato)', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    const { review } = await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    expect(storage.createWeeklyReview).toHaveBeenCalledTimes(1);
    expect(review.status).toBe('awaiting_upload');
  });

  it('é idempotente: 2 chamadas na mesma semana retornam a MESMA review (1 row, mesmo id)', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    const a = await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const b = await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    expect(b.review.id).toBe(a.review.id);
    expect(storage.__reviews.size).toBe(1);
  });

  it('default de weekStartDate quando ausente (usa nextMondayUtc — cria 1 row YMD)', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    const { review } = await createWeeklyReview('USER-0001', undefined, { injectedStorage: storage });
    expect(review.weekStartDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(storage.createWeeklyReview).toHaveBeenCalledTimes(1);
  });

  it('posta o recap no chat de relatorios (getOrCreateReportChatSession + insertChatMessage role=assistant)', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    expect(storage.getOrCreateReportChatSession).toHaveBeenCalledWith('USER-0001');
    const msgCall = storage.insertChatMessage.mock.calls[0][0];
    expect(msgCall.role).toBe('assistant');
    expect(typeof msgCall.content).toBe('string');
  });

  it('persiste recap_content (snapshot da semana anterior) na review', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    const { review } = await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    expect(review.recapContent ?? review.recap_content).toBeDefined();
  });

  // HIGH do review EST-5: gate de tier REAL (nao mock idealizado, lesson #3).
  // Free/expired -> tier_not_eligible; NENHUMA review criada.
  it('user Free -> lanca tier_not_eligible e NAO cria review', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    h.getReportTier.mockResolvedValueOnce('free');
    await expect(
      createWeeklyReview('USER-FREE', WSD, { injectedStorage: storage }),
    ).rejects.toMatchObject({ code: 'tier_not_eligible' });
    expect(storage.createWeeklyReview).not.toHaveBeenCalled();
    expect(storage.__reviews.size).toBe(0);
  });

  it('NAO chama o cliente Anthropic ao montar o recap (DEC-1 — determinismo)', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    expect(h.callReportLlm).not.toHaveBeenCalled();
  });

  it('falha de insertChatMessage NAO derruba a criacao da review (lesson #9)', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage({
      insertChatMessage: vi.fn(async () => { throw new Error('chat down'); }),
    });
    const { review } = await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    // review existe mesmo com chat falho (R-2 — a tab lê recap_content da review).
    expect(review).toBeDefined();
    expect(storage.__reviews.size).toBe(1);
  });

  it('createWeeklyReview vindo null sob race -> weekly_review_persist_failed', async () => {
    const { createWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage({ createWeeklyReview: vi.fn(async () => null) });
    await expect(
      createWeeklyReview('USER-0001', WSD, { injectedStorage: storage }),
    ).rejects.toThrow(/weekly_review_persist_failed/);
  });
});

// =============================================================================
// RF-01 — getWeeklyReview (null sem lancar)
// =============================================================================
describe('EST-5 getWeeklyReview (RF-01)', () => {
  it('retorna a review existente', async () => {
    const { createWeeklyReview, getWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const r = await getWeeklyReview('USER-0001', WSD, storage);
    expect(r?.weekStartDate).toBe(WSD);
  });

  it('retorna null quando nao existe (NAO lanca)', async () => {
    const { getWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    const r = await getWeeklyReview('USER-0001', WSD, storage);
    expect(r).toBeNull();
  });
});

// =============================================================================
// RF-01 — advanceWeeklyReview (transicoes guardadas + nunca regride)
// =============================================================================
describe('EST-5 advanceWeeklyReview (RF-01)', () => {
  it('rejeita transicao invalida (recap_sent -> planning) com invalid_weekly_review_transition', async () => {
    const { createWeeklyReview, advanceWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    await expect(
      advanceWeeklyReview('USER-0001', WSD, 'recap_sent', 'planning', storage),
    ).rejects.toThrow(/invalid_weekly_review_transition/);
  });

  it('o erro de transicao invalida carrega err.code = invalid_weekly_review_transition', async () => {
    const { createWeeklyReview, advanceWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    let caught: any;
    try {
      await advanceWeeklyReview('USER-0001', WSD, 'awaiting_upload', 'recap_sent', storage);
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe('invalid_weekly_review_transition');
  });

  it('rejeita retroceder (upload_confirmed -> awaiting_upload é invalido)', async () => {
    const { createWeeklyReview, advanceWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    await expect(
      advanceWeeklyReview('USER-0001', WSD, 'upload_confirmed', 'awaiting_upload', storage),
    ).rejects.toThrow(/invalid_weekly_review_transition/);
  });

  it('advance em review inexistente -> weekly_review_not_found', async () => {
    const { advanceWeeklyReview } = await loadOrchestrator();
    const storage = makeStorage();
    await expect(
      advanceWeeklyReview('USER-0001', WSD, 'awaiting_upload', 'upload_confirmed', storage),
    ).rejects.toThrow(/weekly_review_not_found/);
  });
});

// =============================================================================
// RF-05 — confirmUpload (sinal explicito vence + heuristico recent_import)
// =============================================================================
describe('EST-5 confirmUpload (RF-05)', () => {
  it('em awaiting_upload sem import recente -> confirma com uploadDetected:false source:explicit', async () => {
    const { createWeeklyReview, confirmUpload } = await loadOrchestrator();
    const storage = makeStorage({ getLastUploadAt: vi.fn(async () => null) });
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const out = await confirmUpload('USER-0001', WSD, ctxFor(storage));
    expect(out.uploadDetected).toBe(false);
    expect(out.source).toBe('explicit');
  });

  it('import < 24h -> uploadDetected:true source:recent_import', async () => {
    const { createWeeklyReview, confirmUpload } = await loadOrchestrator();
    const recent = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h atras
    const storage = makeStorage({ getLastUploadAt: vi.fn(async () => recent) });
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const out = await confirmUpload('USER-0001', WSD, ctxFor(storage));
    expect(out.uploadDetected).toBe(true);
    expect(out.source).toBe('recent_import');
  });

  it('import ANTIGO (>24h) -> ainda confirma (botao), uploadDetected:false source:explicit', async () => {
    const { createWeeklyReview, confirmUpload } = await loadOrchestrator();
    const old = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 dias atras
    const storage = makeStorage({ getLastUploadAt: vi.fn(async () => old) });
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const out = await confirmUpload('USER-0001', WSD, ctxFor(storage));
    expect(out.uploadDetected).toBe(false);
    expect(out.source).toBe('explicit');
  });

  it('confirmar review inexistente -> weekly_review_not_found', async () => {
    const { confirmUpload } = await loadOrchestrator();
    const storage = makeStorage();
    await expect(
      confirmUpload('USER-0001', WSD, ctxFor(storage)),
    ).rejects.toThrow(/weekly_review_not_found/);
  });

  it('caminho feliz: confirma -> roda deep analysis -> handoff -> review em planning', async () => {
    const { createWeeklyReview, confirmUpload } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const out = await confirmUpload('USER-0001', WSD, ctxFor(storage));
    // chega ao estado final do ritual
    expect(['deep_analysis_done', 'planning']).toContain(out.review.status);
    expect(h.startPlanning).toHaveBeenCalled();
  });

  it('confirmar 2x: a segunda é no-op (sem segunda deep analysis nem segundo handoff)', async () => {
    const { createWeeklyReview, confirmUpload } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    await confirmUpload('USER-0001', WSD, ctxFor(storage));
    h.startPlanning.mockClear();
    h.gatherBundle.mockClear();
    const out2 = await confirmUpload('USER-0001', WSD, ctxFor(storage));
    // estado terminal -> no-op
    expect(h.startPlanning).not.toHaveBeenCalled();
    expect(out2.review.status).toMatch(/planning|deep_analysis_done/);
  });

  it('deep analysis falha -> review fica em upload_confirmed (re-confirmar reprocessa)', async () => {
    const { createWeeklyReview, confirmUpload } = await loadOrchestrator();
    const storage = makeStorage();
    // gatherBundle explode na deep analysis -> nao avanca para deep_analysis_done
    h.gatherBundle.mockRejectedValueOnce(new Error('gather exploded'));
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const out = await confirmUpload('USER-0001', WSD, ctxFor(storage));
    expect(out.review.status).toBe('upload_confirmed');
  });

  it('NUNCA chama o cliente Anthropic na confirmacao (DEC-1)', async () => {
    const { createWeeklyReview, confirmUpload } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    await confirmUpload('USER-0001', WSD, ctxFor(storage));
    expect(h.callReportLlm).not.toHaveBeenCalled();
  });
});

// =============================================================================
// RF-06 — runDeepAnalysis (deterministica, historico grind_session_id IS NULL, sem LLM)
// =============================================================================
describe('EST-5 runDeepAnalysis (RF-06)', () => {
  it('combina as 3 fontes via gatherBundle + buildMentalState + buildStudyWeek', async () => {
    const { createWeeklyReview, runDeepAnalysis } = await loadOrchestrator();
    const storage = makeStorage();
    h.buildMentalState.mockReturnValue({ breakCount: 12, fatigueSignal: true } as any);
    h.buildStudyWeek.mockReturnValue({ minutesLogged: 240, handsSolvedTotal: 100 } as any);
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    // leva a review até upload_confirmed antes de rodar a analise.
    await runDeepAnalysis('USER-0001', WSD, ctxFor(storage));
    expect(h.gatherBundle).toHaveBeenCalled();
    expect(h.buildMentalState).toHaveBeenCalled();
    expect(h.buildStudyWeek).toHaveBeenCalled();
  });

  it('posta a analise no chat (insertChatMessage role=assistant) e persiste analysis_content', async () => {
    const { createWeeklyReview, runDeepAnalysis } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    storage.insertChatMessage.mockClear();
    const review = await runDeepAnalysis('USER-0001', WSD, ctxFor(storage));
    const msgCall = storage.insertChatMessage.mock.calls[0][0];
    expect(msgCall.role).toBe('assistant');
    expect(review.analysisContent ?? review.analysis_content).toBeDefined();
  });

  it('NENHUMA chamada Anthropic é feita na deep analysis (assert callReportLlm nao invocado)', async () => {
    const { createWeeklyReview, runDeepAnalysis } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    h.callReportLlm.mockClear();
    await runDeepAnalysis('USER-0001', WSD, ctxFor(storage));
    expect(h.callReportLlm).not.toHaveBeenCalled();
  });

  it('gather parcial (uma fonte vazia) -> analise ainda é postada', async () => {
    const { createWeeklyReview, runDeepAnalysis } = await loadOrchestrator();
    const storage = makeStorage();
    // studyWeek null (sem estudo) mas mental presente -> ainda monta + posta.
    h.buildMentalState.mockReturnValue({ breakCount: 8, fatigueSignal: false } as any);
    h.buildStudyWeek.mockReturnValue(null);
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    storage.insertChatMessage.mockClear();
    await runDeepAnalysis('USER-0001', WSD, ctxFor(storage));
    expect(storage.insertChatMessage).toHaveBeenCalled();
  });
});

// =============================================================================
// RF-07 — handoffToPlanning (startPlanning com chave UTC + source est5_ritual)
// =============================================================================
describe('EST-5 handoffToPlanning (RF-07)', () => {
  it('chama startPlanning(userId, weekStartDate, { source: est5_ritual }) com a chave UTC da review', async () => {
    const { createWeeklyReview, handoffToPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    await handoffToPlanning('USER-0001', WSD, ctxFor(storage));
    const call = h.startPlanning.mock.calls[0];
    expect(call[0]).toBe('USER-0001');
    expect(call[1]).toBe(WSD);
    expect(call[2]).toMatchObject({ source: 'est5_ritual' });
  });

  it('transiciona a review para planning apos o handoff', async () => {
    const { createWeeklyReview, handoffToPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const review = await handoffToPlanning('USER-0001', WSD, ctxFor(storage));
    expect(review.status).toBe('planning');
  });

  it('re-handoff NAO duplica planning session (startPlanning idempotente — UNIQUE)', async () => {
    const { createWeeklyReview, handoffToPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    await handoffToPlanning('USER-0001', WSD, ctxFor(storage));
    // ja em planning -> segundo handoff é no-op (startPlanning nao re-chamado).
    h.startPlanning.mockClear();
    const review2 = await handoffToPlanning('USER-0001', WSD, ctxFor(storage));
    expect(h.startPlanning).not.toHaveBeenCalled();
    expect(review2.status).toBe('planning');
  });

  it('startPlanning lanca tier_not_eligible -> review fica em deep_analysis_done (nao avanca), sem crash', async () => {
    const { createWeeklyReview, handoffToPlanning } = await loadOrchestrator();
    const storage = makeStorage();
    const err: any = new Error('tier_not_eligible');
    err.code = 'tier_not_eligible';
    h.startPlanning.mockRejectedValueOnce(err);
    await createWeeklyReview('USER-0001', WSD, { injectedStorage: storage });
    const review = await handoffToPlanning('USER-0001', WSD, ctxFor(storage));
    expect(review.status).toBe('deep_analysis_done');
  });
});
