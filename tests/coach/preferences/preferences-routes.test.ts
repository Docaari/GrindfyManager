import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-02 — endpoints REST GET/PUT /api/coach/preferences
//
// Fontes:
//   - Docs/specs/coach-sprint-0.md (RF-02)
//   - Docs/architecture/decisions/084-user-coach-preferences.md (Zod strict + superRefine)
//
// Modulos alvo:
//   - server/routes/coach.ts ganha 2 handlers (GET / PUT preferences)
//   - shared/schema.ts exporta updateCoachPreferencesSchema (Zod)
//
// Lessons aplicadas:
//   - Zod .strict() rejeita campos extras (RF-02 edge case).
//   - superRefine valida maxNudgesPerHour <= maxNudgesPerDay.
// =============================================================================

import { COACH_PREFS_RESPONSE_DEFAULT } from '../_fixtures/prefs-fixtures';

const getCoachPrefsMock = vi.fn();
const upsertCoachPrefsMock = vi.fn();
const getUserTimezoneMock = vi.fn();

vi.mock('../../../server/storage/coachPreferences', () => ({
  getCoachPreferences: getCoachPrefsMock,
  upsertCoachPreferences: upsertCoachPrefsMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserTimezone: getUserTimezoneMock,
  },
}));

function createMockReq(overrides: any = {}) {
  return {
    headers: {},
    body: {},
    query: {},
    user: {
      id: 'u-1',
      userPlatformId: 'USER-0001',
      email: 'p@t.com',
      subscriptionPlan: 'pro',
    },
    ...overrides,
  };
}

function createMockRes() {
  const res: any = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((body: any) => { res.body = body; return res; });
  return res;
}

beforeEach(() => {
  getCoachPrefsMock.mockReset();
  upsertCoachPrefsMock.mockReset();
  getUserTimezoneMock.mockReset().mockResolvedValue('America/Sao_Paulo');
});

describe('GET /api/coach/preferences — happy path', () => {
  it('retorna 200 com defaults quando user nao tem row (lazy-create)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
      updatedAt: new Date('2026-05-02T12:00:00Z'),
    });

    const { handleGetCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq();
    const res = createMockRes();

    await handleGetCoachPreferences(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      nudges: { bSnapshot: true, bLeak: true, bLife: false, bMental: false },
      quietHours: { startHour: 21, endHour: 9, timezone: 'America/Sao_Paulo' },
      frequencyCap: { perDay: 3, perHour: 1 },
      channels: { inApp: true, email: true, push: false },
      coachTone: 'balanced',
    });
    expect(res.body.updatedAt).toBeDefined();
  });

  it('respeita timezone do user (Asia/Tokyo) na resposta', async () => {
    getUserTimezoneMock.mockResolvedValue('Asia/Tokyo');
    getCoachPrefsMock.mockResolvedValue({
      ...COACH_PREFS_RESPONSE_DEFAULT,
      quietHoursStart: 21, quietHoursEnd: 9,
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
      updatedAt: new Date(),
    });

    const { handleGetCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq();
    const res = createMockRes();
    await handleGetCoachPreferences(req as any, res as any);
    expect(res.body.quietHours.timezone).toBe('Asia/Tokyo');
  });
});

describe('PUT /api/coach/preferences — happy path', () => {
  it('aceita body parcial e faz UPSERT', async () => {
    upsertCoachPrefsMock.mockResolvedValue({
      nudgeBSnapshot: true, nudgeBLeak: false, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 22, quietHoursEnd: 9, maxNudgesPerDay: 2, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
      updatedAt: new Date(),
    });

    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq({
      body: { nudgeBLeak: false, quietHoursStart: 22, maxNudgesPerDay: 2 },
    });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(upsertCoachPrefsMock).toHaveBeenCalledWith('USER-0001', expect.objectContaining({
      nudgeBLeak: false, quietHoursStart: 22, maxNudgesPerDay: 2,
    }));
    expect(res.body.nudges.bLeak).toBe(false);
  });

  it('body vazio {} eh idempotente — retorna estado atual sem 400', async () => {
    upsertCoachPrefsMock.mockResolvedValue({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
      updatedAt: new Date(),
    });
    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ body: {} });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);
    expect(res.statusCode).toBe(200);
  });
});

describe('PUT /api/coach/preferences — validacao Zod', () => {
  it('quietHoursStart=24 retorna 400 com path apontando o campo', async () => {
    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ body: { quietHoursStart: 24 } });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('validation_failed');
    const details = res.body.details || [];
    const hasPath = details.some((d: any) =>
      Array.isArray(d.path) ? d.path.includes('quietHoursStart') : false);
    expect(hasPath).toBe(true);
  });

  it('quietHoursStart=-1 retorna 400', async () => {
    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ body: { quietHoursStart: -1 } });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('maxNudgesPerHour > maxNudgesPerDay retorna 400 (superRefine)', async () => {
    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq({
      body: { maxNudgesPerHour: 10, maxNudgesPerDay: 3 },
    });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('validation_failed');
  });

  it('campo desconhecido (Zod .strict()) retorna 400', async () => {
    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ body: { randomKey: 'foo' } });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });

  it('coachTone fora do enum retorna 400', async () => {
    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');
    const req = createMockReq({ body: { coachTone: 'aggressive' } });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);
    expect(res.statusCode).toBe(400);
  });
});

describe('Ownership: user A nao pode mexer em prefs do user B', () => {
  it('PUT como USER-0001 nunca chama upsert com USER-0002', async () => {
    upsertCoachPrefsMock.mockResolvedValue({
      nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
      nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
      quietHoursStart: 21, quietHoursEnd: 9, maxNudgesPerDay: 3, maxNudgesPerHour: 1,
      channelInApp: true, channelEmail: true, channelPush: false, coachTone: 'balanced',
      updatedAt: new Date(),
    });
    const { handlePutCoachPreferences } =
      await import('../../../server/routes/coach');

    // Tentativa: body com userId injetado tentando spoof
    const req = createMockReq({
      body: { nudgeBLeak: false, userId: 'USER-0002' },
    });
    const res = createMockRes();
    await handlePutCoachPreferences(req as any, res as any);

    // Deve usar req.user.userPlatformId, NAO body.userId
    if (upsertCoachPrefsMock.mock.calls.length) {
      expect(upsertCoachPrefsMock.mock.calls[0][0]).toBe('USER-0001');
      expect(upsertCoachPrefsMock.mock.calls[0][0]).not.toBe('USER-0002');
    }
  });
});
