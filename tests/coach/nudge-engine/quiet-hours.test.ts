import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Coach-0 / RF-03 — Quiet hours (wrap-around + timezones)
//
// Fontes:
//   - Docs/specs/coach-sprint-0.md (RF-03 + edge cases)
//   - ADR-084 (isInQuietHours definicao formal)
//   - ADR-085 (engine consome isInQuietHours)
//
// 4 cenarios obrigatorios:
//   - Janela normal (start < end): start=9, end=21
//   - Janela cruzando meia-noite (start > end): start=21, end=9
//   - start == end: desabilitado (sem janela quiet)
//   - 24h quiet (start=0, end=23): so 23h livre
//
// Plus 2 timezones: America/Sao_Paulo + Asia/Tokyo.
// Plus isCritical=true bypassa quiet (mas NAO bypassa caps nem toggle).
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

const PREFS_NORMAL = {
  nudgeBSnapshot: true, nudgeBLeak: true, nudgeBStudy: true, nudgeBVolume: true,
  nudgeBGrade: true, nudgeBDownswing: true, nudgeBLife: false, nudgeBMental: false,
  quietHoursStart: 21, quietHoursEnd: 9,
  maxNudgesPerDay: 3, maxNudgesPerHour: 1,
  channelInApp: true, channelEmail: true, channelPush: false,
  coachTone: 'balanced' as const,
};

beforeEach(() => {
  getCoachPrefsMock.mockReset();
  getUserTimezoneMock.mockReset();
  countNudgeLogMock.mockReset().mockResolvedValue(0);
  findNudgeLogMock.mockReset().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// 4 cenarios da janela
// ---------------------------------------------------------------------------

describe('Quiet hours — wrap-around (start=21, end=9)', () => {
  it('22h Sao Paulo => DENY quiet_hours', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 22h SP == 1h UTC (proximo dia)
    const now = new Date(Date.UTC(2026, 4, 29, 1, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out).toEqual({ allow: false, reason: 'quiet_hours' });
  });

  it('3h Sao Paulo => DENY (cruzou meia-noite)', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 3h SP == 6h UTC
    const now = new Date(Date.UTC(2026, 4, 28, 6, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('quiet_hours');
  });

  it('14h Sao Paulo => ALLOW (fora da janela)', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out.allow).toBe(true);
  });

  it('9h exato Sao Paulo => ALLOW (boundary: end exclusive)', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 9h SP == 12h UTC
    const now = new Date(Date.UTC(2026, 4, 28, 12, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out.allow).toBe(true);
  });

  it('21h exato Sao Paulo => DENY (boundary: start inclusive)', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 21h SP == 0h UTC (proximo dia)
    const now = new Date(Date.UTC(2026, 4, 29, 0, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('quiet_hours');
  });
});

describe('Quiet hours — janela normal (start=9, end=21)', () => {
  it('10h Sao Paulo => DENY (dentro da janela 9-21)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_NORMAL, quietHoursStart: 9, quietHoursEnd: 21,
    });
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 10h SP == 13h UTC
    const now = new Date(Date.UTC(2026, 4, 28, 13, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('quiet_hours');
  });

  it('22h Sao Paulo => ALLOW (fora da janela)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_NORMAL, quietHoursStart: 9, quietHoursEnd: 21,
    });
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 22h SP == 1h UTC (next day)
    const now = new Date(Date.UTC(2026, 4, 29, 1, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out.allow).toBe(true);
  });
});

describe('Quiet hours — start == end (desabilitado)', () => {
  it('start=21, end=21 => sempre ALLOW (sem janela quiet)', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_NORMAL, quietHoursStart: 21, quietHoursEnd: 21,
    });
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 22h SP == 1h UTC next day. Antes seria DENY; agora allow.
    const now = new Date(Date.UTC(2026, 4, 29, 1, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out.allow).toBe(true);
  });
});

describe('Quiet hours — 0..23 (24h - 1)', () => {
  it('start=0, end=23 => 23h livre, demais DENY', async () => {
    getCoachPrefsMock.mockResolvedValue({
      ...PREFS_NORMAL, quietHoursStart: 0, quietHoursEnd: 23,
    });
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 12h SP == 15h UTC
    const denyAt = new Date(Date.UTC(2026, 4, 28, 15, 0, 0));
    const denyOut = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now: denyAt,
    });
    expect((denyOut as any).reason).toBe('quiet_hours');

    // 23h SP == 2h UTC next day - boundary inclusive de end -> ALLOW
    const allowAt = new Date(Date.UTC(2026, 4, 29, 2, 0, 0));
    const allowOut = await shouldSendNudge('USER-0001', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now: allowAt,
    });
    expect(allowOut.allow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timezones (R5 — Asia/Tokyo + America/Sao_Paulo)
// ---------------------------------------------------------------------------

describe('Quiet hours — timezone Asia/Tokyo', () => {
  it('22h Tokyo => DENY mesmo se for 13h UTC (horario "comercial" UTC)', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('Asia/Tokyo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 22h Tokyo == 13h UTC (UTC+9)
    const now = new Date(Date.UTC(2026, 4, 28, 13, 0, 0));
    const out = await shouldSendNudge('USER-TKY', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('quiet_hours');
  });

  it('3am Tokyo => DENY mesmo se for 18h UTC dia anterior', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('Asia/Tokyo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 3h Tokyo dia 28 == 18h UTC dia 27
    const now = new Date(Date.UTC(2026, 4, 27, 18, 0, 0));
    const out = await shouldSendNudge('USER-TKY', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('quiet_hours');
  });

  it('14h Tokyo => ALLOW (fora janela 21-9)', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('Asia/Tokyo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    // 14h Tokyo == 5h UTC
    const now = new Date(Date.UTC(2026, 4, 28, 5, 0, 0));
    const out = await shouldSendNudge('USER-TKY', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out.allow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timezone fallback
// ---------------------------------------------------------------------------

describe('Quiet hours — timezone null/invalido', () => {
  it('users.timezone null => fallback America/Sao_Paulo', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue(null);
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 29, 1, 0, 0)); // 22h SP
    const out = await shouldSendNudge('USER-NULL-TZ', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect((out as any).reason).toBe('quiet_hours');
  });

  it('users.timezone invalido => fallback America/Sao_Paulo (NAO crasha)', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('Pluto/Mars'); // invalido
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 28, 17, 0, 0)); // 14h SP
    const out = await shouldSendNudge('USER-INVALID-TZ', {
      category: 'B-SNAPSHOT', cycleKey: '2026-05', now,
    });
    expect(out.allow).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isCritical bypass
// ---------------------------------------------------------------------------

describe('isCritical=true bypassa quiet hours', () => {
  it('22h Sao Paulo + isCritical=true => ALLOW', async () => {
    getCoachPrefsMock.mockResolvedValue(PREFS_NORMAL);
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 29, 1, 0, 0)); // 22h SP
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-DOWNSWING', isCritical: true, now,
    });
    expect(out.allow).toBe(true);
  });

  it('isCritical=true NAO bypassa toggle off', async () => {
    getCoachPrefsMock.mockResolvedValue({ ...PREFS_NORMAL, nudgeBLeak: false });
    getUserTimezoneMock.mockResolvedValue('America/Sao_Paulo');
    const { shouldSendNudge } = await import('../../../server/coach/nudgeEngine');
    const now = new Date(Date.UTC(2026, 4, 29, 1, 0, 0));
    const out = await shouldSendNudge('USER-0001', {
      category: 'B-LEAK', isCritical: true, now,
    });
    expect((out as any).reason).toBe('category_disabled');
  });
});
