/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Mini Player 2 — RF-NEW.2 (persistencia sleep timer)
 *
 * Estende PUT /api/coach/preferences (handler handlePutCoachPreferences) +
 * Zod schema updateCoachPreferencesSchema para aceitar:
 *
 *   audioSleepTimerMinutes: number().int().nullable()
 *     .refine(v => v === null || [15, 30, 45, 60, 90].includes(v))
 *
 * Migration 0076 adiciona coluna `audio_sleep_timer_minutes integer NULL` em
 * `user_coach_preferences` com CHECK enum [15,30,45,60,90,NULL].
 *
 * Resposta GET /api/coach/preferences passa a incluir `audioSleepTimerMinutes`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  getCoachPreferencesMock,
  upsertCoachPreferencesMock,
  getUserTimezoneMock,
} = vi.hoisted(() => ({
  getCoachPreferencesMock: vi.fn(),
  upsertCoachPreferencesMock: vi.fn(),
  getUserTimezoneMock: vi.fn(),
}));

vi.mock('../../../server/storage/coachPreferences', () => ({
  getCoachPreferences: getCoachPreferencesMock,
  upsertCoachPreferences: upsertCoachPreferencesMock,
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserTimezone: getUserTimezoneMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
  getCoachPreferencesMock.mockResolvedValue({
    userId: 'USER-0001',
    reportWeeklyEnabled: false,
    nudgeBGapcheck: true,
    nudgeBImport: true,
    reportDailyEnabled: false,
    reportMonthlyEnabled: false,
    audioSleepTimerMinutes: null,
    updatedAt: new Date(),
  });
  upsertCoachPreferencesMock.mockImplementation(async (_uid: string, input: any) => ({
    userId: _uid,
    reportWeeklyEnabled: false,
    nudgeBGapcheck: true,
    nudgeBImport: true,
    reportDailyEnabled: false,
    reportMonthlyEnabled: false,
    audioSleepTimerMinutes: input.audioSleepTimerMinutes ?? null,
    updatedAt: new Date(),
  }));
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

async function loadHandlers() {
  return await import('../../../server/routes/coach');
}

describe('PUT /api/coach/preferences — audioSleepTimerMinutes (RF-NEW.2)', () => {
  it('aceita audioSleepTimerMinutes=30 (valor valido)', async () => {
    const { handlePutCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handlePutCoachPreferences(
      makeReq({ body: { audioSleepTimerMinutes: 30 } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.audioSleepTimerMinutes).toBe(30);
    expect(upsertCoachPreferencesMock).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ audioSleepTimerMinutes: 30 }),
    );
  });

  it('aceita audioSleepTimerMinutes=null (desativa)', async () => {
    const { handlePutCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handlePutCoachPreferences(
      makeReq({ body: { audioSleepTimerMinutes: null } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.audioSleepTimerMinutes).toBeNull();
  });

  it.each([15, 30, 45, 60, 90])('aceita preset %i', async (m) => {
    const { handlePutCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handlePutCoachPreferences(
      makeReq({ body: { audioSleepTimerMinutes: m } }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
  });

  it('rejeita audioSleepTimerMinutes=17 (fora dos presets) → 400', async () => {
    const { handlePutCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handlePutCoachPreferences(
      makeReq({ body: { audioSleepTimerMinutes: 17 } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
    expect(upsertCoachPreferencesMock).not.toHaveBeenCalled();
  });

  it('rejeita audioSleepTimerMinutes=-30 → 400', async () => {
    const { handlePutCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handlePutCoachPreferences(
      makeReq({ body: { audioSleepTimerMinutes: -30 } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejeita audioSleepTimerMinutes=string → 400', async () => {
    const { handlePutCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handlePutCoachPreferences(
      makeReq({ body: { audioSleepTimerMinutes: '30' } }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/coach/preferences — exposicao audioSleepTimerMinutes (RF-NEW.2)', () => {
  it('retorna audioSleepTimerMinutes do storage', async () => {
    getCoachPreferencesMock.mockResolvedValue({
      userId: 'USER-0001',
      audioSleepTimerMinutes: 60,
      reportWeeklyEnabled: false,
      nudgeBGapcheck: true,
      nudgeBImport: true,
      reportDailyEnabled: false,
      reportMonthlyEnabled: false,
      updatedAt: new Date(),
    });
    const { handleGetCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handleGetCoachPreferences(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.audioSleepTimerMinutes).toBe(60);
  });

  it('default null quando coluna nunca foi setada', async () => {
    getCoachPreferencesMock.mockResolvedValue({
      userId: 'USER-0001',
      audioSleepTimerMinutes: null,
      reportWeeklyEnabled: false,
      nudgeBGapcheck: true,
      nudgeBImport: true,
      reportDailyEnabled: false,
      reportMonthlyEnabled: false,
      updatedAt: new Date(),
    });
    const { handleGetCoachPreferences } = await loadHandlers();
    const res = makeRes();
    await handleGetCoachPreferences(makeReq() as any, res);
    expect(res.body.audioSleepTimerMinutes).toBeNull();
  });
});
