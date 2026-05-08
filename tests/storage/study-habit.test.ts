/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-2 Storage layer (study habit + streak)
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-2.1 a §RF-2.5
 * ADRs : 128 (streak algorithm)
 *
 * Cobertura storage methods (RED):
 *   - getStudyHabit(userId) -> { streakDays, todayMinutes, goalMinutes,
 *     freezesUsedThisMonth, freezesRemaining, lastActivityAt, todayMet }
 *   - updateDailyGoal(userId, minutes) -> 0/15/30/45/60/90/120 enum
 *   - updateUserHabitState(userId, patch) -> direct update (test helper)
 *   - resetMonthlyFreezesForUser(userId, currentMonth)
 *
 * Lessons aplicadas:
 *   #3 shape REAL (mock chain Drizzle)
 *
 * Status RED: metodos nao existem ainda em server/storage.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mock db Drizzle chain — shape REAL
// =============================================================================
vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.limit = make();
  chain.update = make();
  chain.set = make();
  chain.returning = make();
  chain.transaction = vi.fn(async (cb: any) => cb(chain));
  return { db: chain, pool: {} };
});

import { storage } from '../../server/storage';
import { db } from '../../server/db';

beforeEach(() => {
  vi.clearAllMocks();
  // Reset chain methods (test isolation: previous tests may have replaced
  // db.X with a one-shot mockResolvedValue, breaking subsequent canonical
  // chains).
  const make = () => vi.fn().mockReturnValue(db as any);
  (db as any).select = make();
  (db as any).from = make();
  (db as any).where = make();
  (db as any).limit = make();
  (db as any).update = make();
  (db as any).set = make();
  (db as any).returning = make();
});

// =============================================================================
// getStudyHabit — RF-2.4 header data
// =============================================================================
describe('storage.getStudyHabit(userId) (RF-2)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).getStudyHabit).toBe('function');
  });

  it('retorna shape completo {streakDays, todayMinutes, goalMinutes, freezesUsedThisMonth, freezesRemaining, todayMet}', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        userPlatformId: 'USER-0001',
        studyStreakDays: 5,
        lastStudyActivityAt: new Date('2026-05-07T10:00:00Z'),
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 1,
        lastFreezeResetMonth: '2026-05',
      },
    ]);
    (db as any).where = vi.fn().mockResolvedValue([{ total: 18 }]);

    const r = await (storage as any).getStudyHabit('USER-0001');
    expect(r).toMatchObject({
      streakDays: 5,
      todayMinutes: expect.any(Number),
      goalMinutes: 30,
      freezesUsedThisMonth: 1,
      freezesRemaining: 1,
    });
    expect(typeof r.todayMet).toBe('boolean');
  });

  it('todayMet=true quando goal=0 (desligado) independente de minutos', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        userPlatformId: 'USER-0001',
        studyStreakDays: 0,
        lastStudyActivityAt: null,
        dailyStudyGoalMinutes: 0,
        studyStreakFreezesUsedThisMonth: 0,
        lastFreezeResetMonth: null,
      },
    ]);
    (db as any).where = vi.fn().mockResolvedValue([{ total: 0 }]);

    const r = await (storage as any).getStudyHabit('USER-0001');
    expect(r.goalMinutes).toBe(0);
    expect(r.todayMet).toBe(true);
  });

  it('todayMet=false quando goal>0 e todayMinutes < goal', async () => {
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        userPlatformId: 'USER-0001',
        studyStreakDays: 3,
        lastStudyActivityAt: new Date(),
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 0,
        lastFreezeResetMonth: '2026-05',
      },
    ]);
    (db as any).where = vi.fn().mockResolvedValue([{ total: 15 }]);

    const r = await (storage as any).getStudyHabit('USER-0001');
    expect(r.todayMet).toBe(false);
  });

  it('lazy reset freezes quando lastFreezeResetMonth != mes atual (ADR-128 §2.4)', async () => {
    // mes atual UTC = 2026-05; row tem 2026-04 => freezes deve aparecer 0 NA RESPOSTA
    (db as any).limit = vi.fn().mockResolvedValue([
      {
        userPlatformId: 'USER-0001',
        studyStreakDays: 3,
        lastStudyActivityAt: new Date(),
        dailyStudyGoalMinutes: 30,
        studyStreakFreezesUsedThisMonth: 2,
        lastFreezeResetMonth: '2026-04',
      },
    ]);
    (db as any).where = vi.fn().mockResolvedValue([{ total: 30 }]);

    // Mock data: hoje eh 2026-05-08
    const realDate = global.Date;
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));

    const r = await (storage as any).getStudyHabit('USER-0001');
    // Lazy reset: storage retorna freezes=0 porque mes virou
    expect(r.freezesUsedThisMonth).toBe(0);
    expect(r.freezesRemaining).toBe(2);

    vi.useRealTimers();
  });
});

// =============================================================================
// updateDailyGoal — RF-2.1 setting
// =============================================================================
describe('storage.updateDailyGoal(userId, minutes) (RF-2.1)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).updateDailyGoal).toBe('function');
  });

  it('aceita 0 (desligado) e atualiza users.daily_study_goal_minutes', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { userPlatformId: 'USER-0001', dailyStudyGoalMinutes: 0 },
    ]);
    const r = await (storage as any).updateDailyGoal('USER-0001', 0);
    expect(r.dailyStudyGoalMinutes).toBe(0);
  });

  it('aceita 30 (default founder)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { userPlatformId: 'USER-0001', dailyStudyGoalMinutes: 30 },
    ]);
    const r = await (storage as any).updateDailyGoal('USER-0001', 30);
    expect(r.dailyStudyGoalMinutes).toBe(30);
  });

  it('aceita 120 (custom max)', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      { userPlatformId: 'USER-0001', dailyStudyGoalMinutes: 120 },
    ]);
    const r = await (storage as any).updateDailyGoal('USER-0001', 120);
    expect(r.dailyStudyGoalMinutes).toBe(120);
  });

  it('REJEITA valor fora do enum (ex: 25 — INVALID_GOAL_VALUE)', async () => {
    await expect(
      (storage as any).updateDailyGoal('USER-0001', 25),
    ).rejects.toMatchObject({ code: 'INVALID_GOAL_VALUE' });
  });

  it('REJEITA valor negativo', async () => {
    await expect(
      (storage as any).updateDailyGoal('USER-0001', -5),
    ).rejects.toMatchObject({ code: 'INVALID_GOAL_VALUE' });
  });
});

// =============================================================================
// resetMonthlyFreezesForUser — used by cron + lazy reset
// =============================================================================
describe('storage.resetMonthlyFreezesForUser (RF-2.3)', () => {
  it('existe como method', () => {
    expect(typeof (storage as any).resetMonthlyFreezesForUser).toBe('function');
  });

  it('reseta para 0 + atualiza last_freeze_reset_month', async () => {
    (db as any).returning = vi.fn().mockResolvedValue([
      {
        userPlatformId: 'USER-0001',
        studyStreakFreezesUsedThisMonth: 0,
        lastFreezeResetMonth: '2026-05',
      },
    ]);
    const r = await (storage as any).resetMonthlyFreezesForUser('USER-0001', '2026-05');
    expect(r?.studyStreakFreezesUsedThisMonth).toBe(0);
    expect(r?.lastFreezeResetMonth).toBe('2026-05');
  });

  it('idempotente: chamada 2x consecutiva nao quebra (segunda nao retorna row)', async () => {
    (db as any).returning = vi
      .fn()
      .mockResolvedValueOnce([
        {
          userPlatformId: 'USER-0001',
          studyStreakFreezesUsedThisMonth: 0,
          lastFreezeResetMonth: '2026-05',
        },
      ])
      .mockResolvedValueOnce([]); // segunda call: nada para resetar (WHERE != current_month falso)

    const r1 = await (storage as any).resetMonthlyFreezesForUser('USER-0001', '2026-05');
    const r2 = await (storage as any).resetMonthlyFreezesForUser('USER-0001', '2026-05');
    expect(r1).toBeTruthy();
    expect(r2 === null || r2 === undefined).toBe(true);
  });
});
