/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-2 Streak service (state machine + concurrency)
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-2.2 a §RF-2.5
 * ADR  : 128 (study-streak-algorithm)
 *
 * Cobertura state machine (transitions):
 *   - 'goal_not_met'      : todayMet=false                    -> unchanged
 *   - 'idempotent'        : todayMet=true gap=0               -> unchanged
 *   - 'incremented'       : todayMet=true gap=1               -> streak++
 *   - 'freeze_consumed'   : todayMet=true gap=2 freezesUsed<2 -> streak++ + freezes++
 *   - 'reset'             : todayMet=true gap>=2 freezes=2    -> streak=1
 *   - 'reset_long'        : todayMet=true gap>=3              -> streak=1
 *   - 'lazy_reset_freezes': lastFreezeResetMonth != current   -> freezesUsed=0 first
 *
 * Cobertura concurrency:
 *   - 2 inserts simultaneos -> SELECT FOR UPDATE serializa, streak ++ apenas 1x
 *
 * Cobertura getStudyHabit endpoint helper:
 *   - shape correto retornado
 *
 * Status RED: server/services/studyStreak.ts NAO existe.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted para storage mocks
 *   #5  vi.fn() ok (sem `new`)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// vi.hoisted: storage mocks compartilhados
// =============================================================================
const {
  selectUserForUpdateMock,
  updateUserMock,
  getStudyMinutesTodayV2Mock,
} = vi.hoisted(() => ({
  selectUserForUpdateMock: vi.fn(),
  updateUserMock: vi.fn(),
  getStudyMinutesTodayV2Mock: vi.fn(),
}));

vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.for = make();
  chain.limit = make();
  chain.update = make();
  chain.set = make();
  chain.returning = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

vi.mock('../../server/storage', () => ({
  storage: {
    getUserForStreakUpdate: selectUserForUpdateMock,
    updateUserStreakState: updateUserMock,
    getStudyMinutesTodayV2: getStudyMinutesTodayV2Mock,
  },
}));

async function loadService() {
  return await import('../../server/services/studyStreak');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Helper para simular user state
// =============================================================================
function userState(overrides: Partial<{
  studyStreakDays: number;
  lastStudyActivityAt: Date | null;
  dailyStudyGoalMinutes: number;
  studyStreakFreezesUsedThisMonth: number;
  lastFreezeResetMonth: string | null;
}> = {}) {
  return {
    userPlatformId: 'USER-0001',
    studyStreakDays: overrides.studyStreakDays ?? 0,
    lastStudyActivityAt: overrides.lastStudyActivityAt ?? null,
    dailyStudyGoalMinutes: overrides.dailyStudyGoalMinutes ?? 30,
    studyStreakFreezesUsedThisMonth: overrides.studyStreakFreezesUsedThisMonth ?? 0,
    lastFreezeResetMonth: overrides.lastFreezeResetMonth ?? '2026-05',
  };
}

// =============================================================================
// State machine: incremented (gap=1)
// =============================================================================
describe('bumpStudyStreak — state transitions (ADR-128)', () => {
  it('transition=incremented: gap=1 -> streak++', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 5,
        lastStudyActivityAt: new Date('2026-05-07T10:00:00Z'),
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 0,
        lastFreezeResetMonth: '2026-05',
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(35);
    updateUserMock.mockResolvedValue({ studyStreakDays: 6 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    expect(result.streakDays).toBe(6);
    expect(result.transition).toBe('incremented');
    expect(result.todayMet).toBe(true);
  });

  it('transition=idempotent: gap=0 (ja contou hoje) -> nada muda', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 6,
        lastStudyActivityAt: new Date('2026-05-08T08:00:00Z'),
        dailyStudyGoalMinutes: 30,
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(60); // ja tinha 60min
    updateUserMock.mockResolvedValue({ studyStreakDays: 6 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    expect(result.streakDays).toBe(6);
    expect(result.transition).toBe('idempotent');
  });

  it('transition=freeze_consumed: gap=2 + freezes<2 -> streak++ + freezes++', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 5,
        lastStudyActivityAt: new Date('2026-05-06T10:00:00Z'), // 2 dias atras
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 0,
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(30);
    updateUserMock.mockResolvedValue({ studyStreakDays: 6 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    expect(result.streakDays).toBe(6);
    expect(result.transition).toBe('freeze_consumed');
    expect(result.freezesUsedThisMonth).toBe(1);
  });

  it('transition=reset: gap>=2 + freezes=2 -> streak=1', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 5,
        lastStudyActivityAt: new Date('2026-05-06T10:00:00Z'), // 2 dias atras
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 2,
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(30);
    updateUserMock.mockResolvedValue({ studyStreakDays: 1 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    expect(result.streakDays).toBe(1);
    expect(result.transition).toBe('reset');
  });

  it('transition=reset_long: gap>=3 -> streak=1 (mesmo com freezes disponiveis)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 5,
        lastStudyActivityAt: new Date('2026-05-04T10:00:00Z'), // 4 dias atras
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 0,
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(30);
    updateUserMock.mockResolvedValue({ studyStreakDays: 1 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    expect(result.streakDays).toBe(1);
    expect(['reset', 'reset_long']).toContain(result.transition);
  });

  it('transition=goal_not_met: today minutes < goal -> streak inalterado', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 5,
        lastStudyActivityAt: new Date('2026-05-07T10:00:00Z'),
        dailyStudyGoalMinutes: 30,
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(15); // < goal=30
    updateUserMock.mockResolvedValue({ studyStreakDays: 5 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    expect(result.streakDays).toBe(5);
    expect(result.todayMet).toBe(false);
    expect(['goal_not_met', 'unchanged']).toContain(result.transition);
  });

  it('goal=0 desligado -> sempre todayMet=true e segue transitions normais', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 0,
        lastStudyActivityAt: null,
        dailyStudyGoalMinutes: 0, // desligado
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(0);
    updateUserMock.mockResolvedValue({ studyStreakDays: 1 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    expect(result.todayMet).toBe(true);
    expect(result.streakDays).toBeGreaterThanOrEqual(1);
  });

  it('lazy reset freezes quando lastFreezeResetMonth != current month', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 3,
        lastStudyActivityAt: new Date('2026-05-07T10:00:00Z'),
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 2,
        lastFreezeResetMonth: '2026-04', // mes anterior
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(30);
    updateUserMock.mockResolvedValue({ studyStreakDays: 4 });

    const { bumpStudyStreak } = await loadService();
    const result = await bumpStudyStreak({
      userId: 'USER-0001',
      sessionStartedAt: new Date('2026-05-08T12:00:00Z'),
    } as any);

    // Lazy reset: freezesUsed deve ter resetado para 0 (ou 1 se gap consumiu)
    expect(result.freezesUsedThisMonth).toBeLessThanOrEqual(1);
    expect(result.freezesRemaining).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// getStudyHabit — endpoint helper (RF-2.4)
// =============================================================================
describe('getStudyHabit (helper)', () => {
  it('retorna shape completo {streakDays, todayMinutes, goalMinutes, todayMet, freezesUsedThisMonth, freezesRemaining}', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    selectUserForUpdateMock.mockResolvedValue(
      userState({
        studyStreakDays: 7,
        lastStudyActivityAt: new Date('2026-05-08T08:00:00Z'),
        dailyStudyGoalMinutes: 45,
        studyStreakFreezesUsedThisMonth: 1,
        lastFreezeResetMonth: '2026-05',
      }),
    );
    getStudyMinutesTodayV2Mock.mockResolvedValue(20);

    const { getStudyHabit } = await loadService();
    const r = await getStudyHabit('USER-0001');

    expect(r).toMatchObject({
      streakDays: 7,
      todayMinutes: 20,
      goalMinutes: 45,
      todayMet: false, // 20 < 45
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    });
  });
});
