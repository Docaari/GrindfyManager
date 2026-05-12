import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-07 + RF-09 — Endpoints de onboarding
//   GET   /api/coach/onboarding           -> handleGetOnboarding
//   PATCH /api/coach/onboarding           -> handlePatchOnboarding
//   POST  /api/coach/onboarding/complete  -> handleCompleteOnboarding
//
// Handlers em server/routes/coach.ts (NAO existem ainda); padrao lesson #34:
//   export async function handleX(req, res, injectedStorage?)
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-07, RF-09, "Cenarios de Teste Derivados")
//   - Docs/architecture/decisions/153-onboarding-conversacional-wizard-guiado.md (§5)
//   - Docs/architecture/decisions/151-ai-structured-profile-jsonb.md (§sincronizacao tomPreferido)
//
// O `injectedStorage` aqui agrega: getAiStructuredProfile, updateAiStructuredProfile,
//   isStructuredProfileEmpty, upsertCoachPreferences, getCoachPreferences,
//   estimatePlayerLevel-dependent loaders (getDashboardStats, getAnalyticsBySite,
//   getUser), getUploadHistory/countTournaments (hasImport).
// =============================================================================

function makeReq(overrides: any = {}) {
  return {
    user: { id: 'u-1', userPlatformId: 'USER-0001', email: 'p@t.com', role: 'user', subscriptionPlan: 'pro' },
    params: {},
    body: {},
    query: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = vi.fn((c: number) => { res.statusCode = c; return res; });
  res.json = vi.fn((d: any) => { res.body = d; return res; });
  return res;
}

function makeStorage(overrides: any = {}) {
  return {
    getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
    updateAiStructuredProfile: vi.fn(async (_uid: string, delta: any) => ({ schemaVersion: 1, ...delta, updatedAt: new Date().toISOString() })),
    isStructuredProfileEmpty: vi.fn((p: any) => !p?.onboardingCompletedAt && !p?.tomPreferido && !p?.focoDoMes && !(p?.metas?.length) && !(p?.nivelConfirmado)),
    getCoachPreferences: vi.fn(async () => ({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced', frozenCategories: {},
    })),
    upsertCoachPreferences: vi.fn(async (_uid: string, delta: any) => ({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced', frozenCategories: {}, ...delta,
    })),
    // loaders para hasImport + levelEstimate
    getUploadHistory: vi.fn(async () => []),
    getDashboardStats: vi.fn(async () => ({ count: 0, totalBuyins: 0, totalProfit: 0 })),
    getAnalyticsBySite: vi.fn(async () => []),
    getUser: vi.fn(async () => ({ id: 'u-1', userPlatformId: 'USER-0001', createdAt: new Date('2024-01-01'), subscriptionPlan: 'pro' })),
    ...overrides,
  };
}

beforeEach(() => { vi.clearAllMocks(); });

// ---------------------------------------------------------------------------
// GET /api/coach/onboarding
// ---------------------------------------------------------------------------
describe('GET /api/coach/onboarding', () => {
  it('200 com { completed, mode, draft, structuredProfile, levelEstimate, hasImport }', async () => {
    const { handleGetOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq();
    const res = makeRes();
    await handleGetOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(expect.objectContaining({
      completed: expect.any(Boolean),
      structuredProfile: expect.objectContaining({ schemaVersion: 1 }),
      hasImport: expect.any(Boolean),
    }));
    expect(res.body).toHaveProperty('mode');
    expect(res.body).toHaveProperty('draft');
    expect(res.body).toHaveProperty('levelEstimate');
  });

  it('completed reflete onboardingCompletedAt != null', async () => {
    const { handleGetOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage({
      getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1, onboardingCompletedAt: '2026-05-12T00:00:00Z', onboardingVersion: 1 })),
      isStructuredProfileEmpty: vi.fn(() => false),
    });
    const req = makeReq();
    const res = makeRes();
    await handleGetOnboarding(req, res, storage);
    expect(res.body.completed).toBe(true);
    expect(res.body.mode).toBeNull();
  });

  it('hasImport true quando ha torneios', async () => {
    const { handleGetOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage({
      getDashboardStats: vi.fn(async () => ({ count: 1500, totalBuyins: 30000, totalProfit: 2000 })),
      getUploadHistory: vi.fn(async () => [{ id: 'imp-1', network: 'GGNetwork', tournamentsCount: 1500 }]),
    });
    const req = makeReq();
    const res = makeRes();
    await handleGetOnboarding(req, res, storage);
    expect(res.body.hasImport).toBe(true);
  });

  it('401 sem auth', async () => {
    const { handleGetOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined });
    const res = makeRes();
    await handleGetOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/coach/onboarding
// ---------------------------------------------------------------------------
describe('PATCH /api/coach/onboarding', () => {
  it('persiste o sub-schema do step: { tomPreferido: "direct", step: 6 } -> updateAiStructuredProfile + onboardingDraft.step', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { tomPreferido: 'direct', step: 6, mode: 'full' } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    expect(storage.updateAiStructuredProfile).toHaveBeenCalled();
    const allCalls = storage.updateAiStructuredProfile.mock.calls.map((c: any) => c[1]);
    // tomPreferido gravado em algum dos updates
    expect(allCalls.some((d: any) => d.tomPreferido === 'direct')).toBe(true);
    // onboardingDraft.step gravado (no mesmo ou em call separada)
    expect(allCalls.some((d: any) => d.onboardingDraft && d.onboardingDraft.step === 6)).toBe(true);
  });

  it('{ skip: true } -> seta onboardingSkippedAt, NAO altera onboardingCompletedAt', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { skip: true } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    const allCalls = storage.updateAiStructuredProfile.mock.calls.map((c: any) => c[1]);
    expect(allCalls.some((d: any) => d.onboardingSkippedAt)).toBe(true);
    expect(allCalls.every((d: any) => d.onboardingCompletedAt === undefined)).toBe(true);
  });

  it('persiste nivel + nivelConfirmado (step 3 do wizard full)', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { nivel: 'mid_consistente', nivelConfirmado: true, step: 3 } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    const allCalls = storage.updateAiStructuredProfile.mock.calls.map((c: any) => c[1]);
    expect(allCalls.some((d: any) => d.nivel === 'mid_consistente' && d.nivelConfirmado === true)).toBe(true);
  });

  it('400 — tomPreferido fora do enum', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { tomPreferido: 'aggressive', step: 6 } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — meta > 200 chars', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { metas: [{ texto: 'x'.repeat(250) }], step: 4 } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — step fora de range (99)', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { step: 99 } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — nivel fora do enum', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { nivel: 'super_high', step: 3 } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('"outra rede" > 50 chars -> CLAMPADA (nao 400) — persiste truncada', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: { redesPrincipais: ['GGPoker', 'r'.repeat(100)], step: 1 } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    const allCalls = storage.updateAiStructuredProfile.mock.calls.map((c: any) => c[1]);
    const redesCall = allCalls.find((d: any) => Array.isArray(d.redesPrincipais));
    expect(redesCall).toBeDefined();
    expect(redesCall.redesPrincipais.every((r: string) => r.length <= 50)).toBe(true);
  });

  it('metas/foco puláveis — body sem esses campos (so step) -> 200, nao 400', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { step: 5 } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(200);
  });

  it('401 sem auth', async () => {
    const { handlePatchOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined, body: { tomPreferido: 'direct' } });
    const res = makeRes();
    await handlePatchOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/coach/onboarding/complete
// ---------------------------------------------------------------------------
describe('POST /api/coach/onboarding/complete', () => {
  const fullPayload = () => ({
    tomPreferido: 'direct',
    metas: [{ texto: 'sair do breakeven', prazo: 'trimestre' }],
    focoDoMes: 'defesa de 3bet',
    nudges: { bSnapshot: true, bLeak: true, bStudy: true, bVolume: true, bGrade: true, bDownswing: true, bLife: false, bMental: false },
    quietHours: { startHour: 22, endHour: 8 },
  });

  it('200 — seta onboardingCompletedAt + onboardingVersion: 1, limpa onboardingDraft', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: fullPayload() });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    const allCalls = storage.updateAiStructuredProfile.mock.calls.map((c: any) => c[1]);
    expect(allCalls.some((d: any) => d.onboardingCompletedAt)).toBe(true);
    expect(allCalls.some((d: any) => d.onboardingVersion === 1)).toBe(true);
    // limpa o draft (null ou undefined explicitamente)
    expect(allCalls.some((d: any) => d.onboardingDraft === null)).toBe(true);
  });

  it('RF-09 — grava tomPreferido nos DOIS: ai_structured_profile.tomPreferido E userCoachPreferences.coachTone', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: fullPayload() });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, storage);
    expect(res.statusCode).toBe(200);
    // updateAiStructuredProfile com tomPreferido
    const profCalls = storage.updateAiStructuredProfile.mock.calls.map((c: any) => c[1]);
    expect(profCalls.some((d: any) => d.tomPreferido === 'direct')).toBe(true);
    // upsertCoachPreferences com coachTone
    expect(storage.upsertCoachPreferences).toHaveBeenCalled();
    const prefsCalls = storage.upsertCoachPreferences.mock.calls.map((c: any) => c[1]);
    expect(prefsCalls.some((d: any) => d.coachTone === 'direct')).toBe(true);
  });

  it('RF-09 — grava os toggles nudgeB* + quietHoursStart/End via upsertCoachPreferences conforme o payload', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: fullPayload() });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, storage);
    const prefsCalls = storage.upsertCoachPreferences.mock.calls.map((c: any) => c[1]);
    const merged = Object.assign({}, ...prefsCalls);
    expect(merged.nudgeBLife).toBe(false);
    expect(merged.quietHoursStart).toBe(22);
    expect(merged.quietHoursEnd).toBe(8);
  });

  it('response 200 com { structuredProfile, preferences }', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const storage = makeStorage();
    const req = makeReq({ body: fullPayload() });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, storage);
    expect(res.body).toHaveProperty('structuredProfile');
    expect(res.body).toHaveProperty('preferences');
  });

  it('400 — tomPreferido ausente (obrigatorio no agregado)', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const body: any = fullPayload(); delete body.tomPreferido;
    const req = makeReq({ body });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — tomPreferido fora do enum', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { ...fullPayload(), tomPreferido: 'mean' } });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('400 — meta > 200 chars', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { ...fullPayload(), metas: [{ texto: 'x'.repeat(250) }] } });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(400);
  });

  it('401 sem auth', async () => {
    const { handleCompleteOnboarding } = await import('../../../server/routes/coach');
    const req = makeReq({ user: undefined, body: fullPayload() });
    const res = makeRes();
    await handleCompleteOnboarding(req, res, makeStorage());
    expect(res.statusCode).toBe(401);
  });
});
