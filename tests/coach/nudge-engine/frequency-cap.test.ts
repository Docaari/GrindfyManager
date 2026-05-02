import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-03 — Frequency cap (daily + hourly + snoozed exclusion)
//
// 25 cenarios criticos / engine block:
//   - daily cap: 4o nudge no mesmo dia, max=3 -> DENY 'daily_cap_reached'
//   - hourly cap: 2o nudge na mesma hora, max=1 -> DENY 'hourly_cap_reached'
//   - snoozed nao consome cap (excludeStatus = ['snoozed'])
//
// Lessons:
//   - #3 mocks com SHAPE REAL: countNudgeLog retorna number (count).
//   - #9 logs estruturados.
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
  countNudgeLogMock.mockReset();
  findNudgeLogMock.mockReset().mockResolvedValue(undefined);
});

describe('Daily cap (max=3)', () => {
  it('1o, 2o, 3o nudge => ALLOW. 4o => DENY daily_cap_reached', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));

    // 1o => count=0
    countNudgeLogMock.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    expect((await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', now })).allow).toBe(true);
    // 2o => count=1
    countNudgeLogMock.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect((await shouldSendNudge('USER-0001', { category: 'B-LEAK', now })).allow).toBe(true);
    // 3o => count=2
    countNudgeLogMock.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
    expect((await shouldSendNudge('USER-0001', { category: 'B-STUDY', now })).allow).toBe(true);
    // 4o => count=3 -> DENY
    countNudgeLogMock.mockResolvedValueOnce(3).mockResolvedValueOnce(0);
    const out4 = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', now });
    expect((out4 as any).reason).toBe('daily_cap_reached');
  });

  it('maxNudgesPerDay=0 (user desabilitou tudo) => sempre DENY daily_cap_reached', async () => {
    getCoachPrefsMock.mockResolvedValue({ ...PREFS, maxNudgesPerDay: 0 });
    countNudgeLogMock.mockResolvedValue(0);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', now });
    expect((out as any).reason).toBe('daily_cap_reached');
  });
});

describe('Hourly cap (max=1)', () => {
  it('1o nudge ALLOW; 2o na mesma hora DENY hourly_cap_reached', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));

    // 1o: daily=0, hourly=0
    countNudgeLogMock.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    expect((await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', now })).allow).toBe(true);
    // 2o: daily=1, hourly=1 -> hourly cap reached
    countNudgeLogMock.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const out2 = await shouldSendNudge('USER-0001', { category: 'B-LEAK', now });
    expect((out2 as any).reason).toBe('hourly_cap_reached');
  });

  it('apos 1h, hourly cap reseta', async () => {
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const t1 = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const t2 = new Date(Date.UTC(2026, 4, 28, 18, 5, 0));

    // t1: daily=1, hourly=1 -> DENY
    countNudgeLogMock.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    const o1 = await shouldSendNudge('USER-0001', { category: 'B-LEAK', now: t1 });
    expect((o1 as any).reason).toBe('hourly_cap_reached');

    // t2: daily=1 (last 24h), hourly=0 -> ALLOW
    countNudgeLogMock.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    expect((await shouldSendNudge('USER-0001', { category: 'B-LEAK', now: t2 })).allow).toBe(true);
  });
});

describe('Snoozed nao consome cap', () => {
  it('countNudgeLog eh chamado com excludeStatus=["snoozed"]', async () => {
    countNudgeLogMock.mockResolvedValue(0);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    await shouldSendNudge('USER-0001', { category: 'B-SNAPSHOT', cycleKey: '2026-05', now });

    // Pelo menos 1 chamada deve ter excludeStatus contendo 'snoozed'
    const calls = countNudgeLogMock.mock.calls;
    const hasExclusion = calls.some((args: any[]) => {
      const opts = args[1] || args[0]?.opts || args[0];
      const exclude = opts?.excludeStatus;
      return Array.isArray(exclude) && exclude.includes('snoozed');
    });
    expect(hasExclusion).toBe(true);
  });
});

describe('Ordem dos checks: daily ANTES de hourly ANTES de cycle', () => {
  it('daily cap atinge primeiro -> retorna daily_cap_reached, NAO toca cycle', async () => {
    countNudgeLogMock.mockResolvedValueOnce(3).mockResolvedValueOnce(1); // daily=3 ja blocked
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('daily_cap_reached');
    // findNudgeLog NAO deveria ser chamado (cycle check skipado)
    expect(findNudgeLogMock).not.toHaveBeenCalled();
  });
});
