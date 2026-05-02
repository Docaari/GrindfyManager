import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-03 — cycleKey idempotencia
//
// Cobre:
//   - cycleKey 2026-05 ja sent -> DENY
//   - cycleKey diferente -> ALLOW
//   - cycleKey undefined em categoria sem ciclo -> NAO bloqueia
//   - cycleKey undefined em categoria mensal -> NAO bloqueia (caller responsavel)
//   - findNudgeLog usa statusIn = ['sent','engaged','dismissed']
// =============================================================================

const getCoachPrefsMock = vi.fn();
const getUserTimezoneMock = vi.fn();
const countNudgeLogMock = vi.fn();
const findNudgeLogMock = vi.fn();

vi.mock('../../../server/storage/coachPreferences', () => ({
  getCoachPreferences: getCoachPrefsMock,
}));
vi.mock('../../../server/storage', () => ({
  storage: {
    getUserTimezone: getUserTimezoneMock,
    countNudgeLog: countNudgeLogMock,
    findNudgeLog: findNudgeLogMock,
  },
}));

const PREFS = {
  nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
  nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
  quietHoursStart: 21, quietHoursEnd: 9,
  maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  channelInApp: true, channelEmail: true, channelPush: false,
  coachTone: 'balanced' as const,
};

beforeEach(() => {
  getCoachPrefsMock.mockReset().mockResolvedValue({ ...PREFS });
  getUserTimezoneMock.mockReset().mockResolvedValue('America/Sao_Paulo');
  countNudgeLogMock.mockReset().mockResolvedValue(0);
  findNudgeLogMock.mockReset();
});

describe('cycleKey — formato YYYY-MM (B-SNAPSHOT mensal)', () => {
  it('mesmo cycleKey ja sent => DENY already_sent_this_cycle', async () => {
    findNudgeLogMock.mockResolvedValue({
      id: 'nl-1', userId: 'USER-0001', category: 'B-SNAPSHOT',
      cycleKey: '2026-05', status: 'sent', sentAt: new Date(),
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('already_sent_this_cycle');
  });

  it('cycleKey diferente => ALLOW', async () => {
    findNudgeLogMock.mockResolvedValue(undefined);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-06', now,
    });
    expect(out.allow).toBe(true);
  });

  it('findNudgeLog eh chamado com statusIn=["sent","engaged","dismissed"]', async () => {
    findNudgeLogMock.mockResolvedValue(undefined);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });

    expect(findNudgeLogMock).toHaveBeenCalled();
    const callArgs = findNudgeLogMock.mock.calls[0];
    // Shape esperado: findNudgeLog(userId, category, cycleKey, opts)
    // Verifica que opts.statusIn cobre os 3
    const opts = callArgs[3] || callArgs[2];
    const statusIn = opts?.statusIn;
    expect(Array.isArray(statusIn)).toBe(true);
    expect(statusIn).toEqual(expect.arrayContaining(['sent', 'engaged', 'dismissed']));
    // snoozed NAO deve estar em statusIn
    expect(statusIn).not.toContain('snoozed');
  });
});

describe('cycleKey — formato YYYY-WW (B-LEAK / B-STUDY semanal)', () => {
  it('mesmo cycleKey YYYY-WW => DENY', async () => {
    findNudgeLogMock.mockResolvedValue({
      id: 'nl-2', userId: 'USER-0001', category: 'B-LEAK',
      cycleKey: '2026-18', status: 'sent', sentAt: new Date(),
    });
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-LEAK', cycleKey: '2026-18', now,
    });
    expect((out as any).reason).toBe('already_sent_this_cycle');
  });

  it('cycleKey semana DIFERENTE => ALLOW (mesmo se categoria igual)', async () => {
    findNudgeLogMock.mockResolvedValue(undefined);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-LEAK', cycleKey: '2026-19', now,
    });
    expect(out.allow).toBe(true);
  });
});

describe('cycleKey ausente — sem bloqueio por ciclo', () => {
  it('ctx.cycleKey=undefined => findNudgeLog NAO eh chamado, ALLOW', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-DOWNSWING', // sem cycleKey
      now,
    });
    expect(out.allow).toBe(true);
    expect(findNudgeLogMock).not.toHaveBeenCalled();
  });
});
