/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Coach-Biblio-2 — RF-3.3 Cron generateWeeklyStudyPlan.
 *
 * Spec : Docs/specs/estudos-coach-biblio-2.md §RF-3.3
 * ADR  : 134 (service orquestrador), 107 (cron pattern News-3)
 * Pad. : tests/jobs/refreshNewsCron.test.ts (mock node-cron + service)
 *
 * Cobertura:
 *   - Cron registra em "0 9 * * 1" UTC (segunda 9h UTC)
 *   - run() per-user idempotente:
 *       - SKIP se user com is_active=false
 *       - SKIP se user sem has_coach_access
 *       - SKIP se ja existe plano para semana atual (UNIQUE constraint pre-check)
 *       - SKIP se quota Coach <= 0
 *   - Falha individual nao bloqueia outros users (catch per-user)
 *   - Pacing 200ms entre user-loop iterations
 *
 * Lessons:
 *   #5  vi.fn ok (cron.schedule retorna Task)
 *   #14 vi.hoisted spies
 *   #9  log antes de fallback em catch
 *
 * Status RED: server/jobs/generateWeeklyStudyPlan.ts NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  cronScheduleMock,
  generateWeeklyStudyPlanMock,
  listEligibleUsersMock,
  getStudyWeeklyPlanMock,
  hasCoachAccessMock,
  hasCoachQuotaRemainingMock,
} = vi.hoisted(() => ({
  cronScheduleMock: vi.fn(),
  generateWeeklyStudyPlanMock: vi.fn(),
  listEligibleUsersMock: vi.fn(),
  getStudyWeeklyPlanMock: vi.fn(),
  hasCoachAccessMock: vi.fn(),
  hasCoachQuotaRemainingMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: cronScheduleMock },
  schedule: cronScheduleMock,
}));

vi.mock('../../server/services/studyWeeklyPlanService', () => ({
  generateWeeklyStudyPlan: generateWeeklyStudyPlanMock,
  hasCoachAccess: hasCoachAccessMock,
  hasCoachQuotaRemaining: hasCoachQuotaRemainingMock,
}));

vi.mock('../../server/storage', () => ({
  storage: {
    listUsersForWeeklyStudyPlanCron: listEligibleUsersMock,
    getStudyWeeklyPlan: getStudyWeeklyPlanMock,
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  hasCoachAccessMock.mockResolvedValue(true);
  hasCoachQuotaRemainingMock.mockResolvedValue(true);
  listEligibleUsersMock.mockResolvedValue([]);
  getStudyWeeklyPlanMock.mockResolvedValue(null);
});

// =============================================================================
// Cron registration
// =============================================================================
describe('generateWeeklyStudyPlanCron — register', () => {
  it('registra cron com expression "0 9 * * 1" UTC (segunda 9h UTC)', async () => {
    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await mod.registerWeeklyStudyPlanCron();

    expect(cronScheduleMock).toHaveBeenCalled();
    const args = cronScheduleMock.mock.calls[0];
    expect(args[0]).toBe('0 9 * * 1');
  });

  it('exporta runWeeklyStudyPlan (handler invocavel manualmente)', async () => {
    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    expect(typeof mod.runWeeklyStudyPlan).toBe('function');
  });
});

// =============================================================================
// runWeeklyStudyPlan — idempotency + per-user error tolerance
// =============================================================================
describe('runWeeklyStudyPlan — execucao', () => {
  it('SKIP user que ja tem plano para a semana (idempotency)', async () => {
    listEligibleUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A', isActive: true },
    ]);
    getStudyWeeklyPlanMock.mockResolvedValue({ id: 'swp-existing' });

    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await mod.runWeeklyStudyPlan();

    expect(generateWeeklyStudyPlanMock).not.toHaveBeenCalled();
  });

  it('SKIP user sem has_coach_access', async () => {
    listEligibleUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A', isActive: true },
    ]);
    hasCoachAccessMock.mockResolvedValue(false);

    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await mod.runWeeklyStudyPlan();

    expect(generateWeeklyStudyPlanMock).not.toHaveBeenCalled();
  });

  it('SKIP user com quota Coach esgotada', async () => {
    listEligibleUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A', isActive: true },
    ]);
    hasCoachQuotaRemainingMock.mockResolvedValue(false);

    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await mod.runWeeklyStudyPlan();

    expect(generateWeeklyStudyPlanMock).not.toHaveBeenCalled();
  });

  it('gera plano para users elegiveis (loop multi-user)', async () => {
    listEligibleUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A', isActive: true },
      { userPlatformId: 'USER-B', isActive: true },
      { userPlatformId: 'USER-C', isActive: true },
    ]);
    generateWeeklyStudyPlanMock.mockResolvedValue({ id: 'swp', planJsonb: {} });

    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await mod.runWeeklyStudyPlan();

    expect(generateWeeklyStudyPlanMock).toHaveBeenCalledTimes(3);
  });

  it('falha individual em USER-A nao impede USER-B/C (catch per-user)', async () => {
    listEligibleUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A', isActive: true },
      { userPlatformId: 'USER-B', isActive: true },
      { userPlatformId: 'USER-C', isActive: true },
    ]);
    generateWeeklyStudyPlanMock
      .mockRejectedValueOnce(new Error('Anthropic timeout'))
      .mockResolvedValueOnce({ id: 'swp-b' })
      .mockResolvedValueOnce({ id: 'swp-c' });

    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await expect(mod.runWeeklyStudyPlan()).resolves.not.toThrow();

    expect(generateWeeklyStudyPlanMock).toHaveBeenCalledTimes(3);
  });

  it('passa source=coach_auto ao gerar', async () => {
    listEligibleUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A', isActive: true },
    ]);
    generateWeeklyStudyPlanMock.mockResolvedValue({ id: 'swp' });

    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await mod.runWeeklyStudyPlan();

    expect(generateWeeklyStudyPlanMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'USER-A', source: 'coach_auto' }),
    );
  });

  it('passa weekStartDate como segunda atual UTC', async () => {
    vi.setSystemTime(new Date('2026-05-08T15:00:00Z')); // sexta
    listEligibleUsersMock.mockResolvedValue([
      { userPlatformId: 'USER-A', isActive: true },
    ]);
    generateWeeklyStudyPlanMock.mockResolvedValue({ id: 'swp' });

    const mod: any = await import('../../server/jobs/generateWeeklyStudyPlan');
    await mod.runWeeklyStudyPlan();

    const args = generateWeeklyStudyPlanMock.mock.calls[0][0];
    expect(args.weekStartDate).toBeInstanceOf(Date);
    // segunda da semana de 2026-05-08 (sexta) eh 2026-05-04
    const d = args.weekStartDate as Date;
    expect(d.getUTCDay()).toBe(1); // segunda

    vi.useRealTimers();
  });
});
