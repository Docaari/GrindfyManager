import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-1A / RF-02 + RF-09 — GET/PUT /api/coach/preferences estendidos
//   - GET response ganha `frozenCategories`
//   - PUT ganha campo opcional `unfreezeCategory?` (enum B-*); NAO aceita
//     `frozenCategories: {...}` no body (Zod .strict() -> 400)
//   - PUT com `coachTone` -> espelha pro ai_structured_profile.tomPreferido (RF-09)
//
// Fontes:
//   - Docs/specs/sprint-ai-1a.md (RF-02, RF-09)
//   - Docs/architecture/decisions/152-anti-fadiga-snooze-telemetry-autofreeze-killswitch.md (§2, §3)
//   - Docs/architecture/decisions/151-ai-structured-profile-jsonb.md (§sincronizacao)
//
// handleGetCoachPreferences / handlePutCoachPreferences ja existem em
// server/routes/coach.ts (sem injectedStorage hoje — testes via mock de modulos).
// O sprint pode adicionar injectedStorage; aceitamos ambas as formas.
// =============================================================================

const getCoachPrefsMock = vi.fn();
const upsertCoachPrefsMock = vi.fn();
const getUserTimezoneMock = vi.fn();
const updateAiStructuredProfileMock = vi.fn();

vi.mock('../../../server/storage/coachPreferences', () => ({
  getCoachPreferences: getCoachPrefsMock,
  upsertCoachPreferences: upsertCoachPrefsMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserTimezone: getUserTimezoneMock,
  },
}));

vi.mock('../../../server/storage/aiStructuredProfile', () => ({
  updateAiStructuredProfile: updateAiStructuredProfileMock,
  getAiStructuredProfile: vi.fn(async () => ({ schemaVersion: 1 })),
  isStructuredProfileEmpty: vi.fn(() => true),
}));

const PREFS_BASE = {
  nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
  nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
  quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced' as const,
  frozenCategories: {} as Record<string, any>,
  updatedAt: new Date('2026-05-12T00:00:00Z'),
};

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

beforeEach(() => {
  getCoachPrefsMock.mockReset().mockResolvedValue({ ...PREFS_BASE });
  upsertCoachPrefsMock.mockReset().mockImplementation(async (_uid: string, delta: any) => ({ ...PREFS_BASE, ...delta }));
  getUserTimezoneMock.mockReset().mockResolvedValue('America/Sao_Paulo');
  updateAiStructuredProfileMock.mockReset().mockResolvedValue({ schemaVersion: 1 });
});

describe('GET /api/coach/preferences — estendido com frozenCategories', () => {
  it('response inclui frozenCategories (vazio {})', async () => {
    const { handleGetCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq();
    const res = makeRes();
    await handleGetCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty('frozenCategories');
    expect(res.body.frozenCategories).toEqual({});
  });

  it('response reflete frozenCategories com entradas', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_BASE,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-01T00:00:00Z', reason: 'auto_dismiss_rate', dismissRate: 0.8, windowDays: 7 } },
    });
    const { handleGetCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq();
    const res = makeRes();
    await handleGetCoachPreferences(req, res);
    expect(res.body.frozenCategories['B-STUDY']).toEqual(expect.objectContaining({ reason: 'auto_dismiss_rate' }));
  });
});

describe('PUT /api/coach/preferences — unfreezeCategory + espelhamento de coachTone', () => {
  it('unfreezeCategory: "B-STUDY" -> remove a entrada de frozenCategories', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_BASE,
      frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-01T00:00:00Z', reason: 'admin' } },
    });
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { unfreezeCategory: 'B-STUDY' } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(upsertCoachPrefsMock).toHaveBeenCalled();
  });

  it('coachTone: "gentle" -> espelha pro ai_structured_profile.tomPreferido (RF-09)', async () => {
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { coachTone: 'gentle' } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(upsertCoachPrefsMock).toHaveBeenCalledWith('USER-0001', expect.objectContaining({ coachTone: 'gentle' }));
    expect(updateAiStructuredProfileMock).toHaveBeenCalledWith('USER-0001', expect.objectContaining({ tomPreferido: 'gentle' }));
  });

  it('400 — body com frozenCategories: {...} (tentar injetar congelamento via PUT — .strict() rejeita)', async () => {
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { frozenCategories: { 'B-STUDY': { frozenAt: '2026-05-12T00:00:00Z', reason: 'manual' } } } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(400);
    // nenhum congelamento foi setado
    expect(upsertCoachPrefsMock).not.toHaveBeenCalled();
  });

  it('400 — unfreezeCategory fora do enum B-*', async () => {
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { unfreezeCategory: 'B-XYZ' } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('PUT sem coachTone -> NAO chama updateAiStructuredProfile (so espelha quando coachTone presente)', async () => {
    const { handlePutCoachPreferences } = await import('../../../server/routes/coach');
    const req = makeReq({ body: { nudgeBLeak: false } });
    const res = makeRes();
    await handlePutCoachPreferences(req, res);
    expect(res.statusCode).toBe(200);
    expect(updateAiStructuredProfileMock).not.toHaveBeenCalled();
  });
});
