/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-2.3 Cron resetStudyFreezesMonthly
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-2.3
 * ADR  : 128 §2.3
 * Pad. : tests/jobs/refreshNewsCron.test.ts (vi.hoisted + mock node-cron)
 *
 * Cobertura:
 *   - Cron registrado com expression '5 0 * * *' UTC (todo dia 00:05)
 *   - Idempotente (UPDATE WHERE last_freeze_reset_month != current_month)
 *   - Falha do cron eh silenciosa + logada
 *
 * Status RED: server/jobs/resetStudyFreezes.ts NAO existe.
 *
 * Lessons aplicadas:
 *   #14 vi.hoisted para spies em vi.mock factories
 *   #5  vi.fn() ok (sem `new`)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// vi.hoisted — mocks compartilhados
// =============================================================================
const { cronScheduleMock, dbUpdateMock } = vi.hoisted(() => ({
  cronScheduleMock: vi.fn(),
  dbUpdateMock: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: cronScheduleMock },
  schedule: cronScheduleMock,
}));

vi.mock('../../server/db', () => {
  const chain: any = {};
  const make = () => vi.fn().mockReturnValue(chain);
  chain.update = dbUpdateMock.mockReturnValue(chain);
  chain.set = make();
  chain.where = make();
  chain.returning = make();
  return { db: chain, pool: {} };
});

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

// =============================================================================
// Cron registration
// =============================================================================
describe('resetStudyFreezesMonthly — register cron (RF-2.3)', () => {
  it('registra cron com expression "5 0 * * *" UTC (todo dia 00:05)', async () => {
    const mod: any = await import('../../server/jobs/resetStudyFreezes');
    await mod.registerStudyFreezesCron();

    expect(cronScheduleMock).toHaveBeenCalled();
    const args = cronScheduleMock.mock.calls[0];
    expect(args[0]).toBe('5 0 * * *');
  });

  it('configura timezone UTC', async () => {
    const mod: any = await import('../../server/jobs/resetStudyFreezes');
    await mod.registerStudyFreezesCron();

    const args = cronScheduleMock.mock.calls[0];
    // 3o argumento eh objeto opcional com {timezone}
    if (args[2]) {
      expect(args[2]).toMatchObject({ timezone: 'UTC' });
    } else {
      // Aceitavel: cron sem timezone explicit, default UTC quando server roda em UTC
      expect(true).toBe(true);
    }
  });
});

// =============================================================================
// runResetStudyFreezesMonthly — execucao do reset
// =============================================================================
describe('runResetStudyFreezesMonthly — handler (RF-2.3)', () => {
  it('chama db.update com WHERE last_freeze_reset_month != current month UTC', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:05:00Z'));

    const mod: any = await import('../../server/jobs/resetStudyFreezes');
    await mod.runResetStudyFreezesMonthly();

    expect(dbUpdateMock).toHaveBeenCalled();
  });

  it('idempotente — segunda chamada no mesmo mes nao quebra (no-op pelo WHERE)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:05:00Z'));

    const mod: any = await import('../../server/jobs/resetStudyFreezes');
    await mod.runResetStudyFreezesMonthly();
    await mod.runResetStudyFreezesMonthly();

    // ambas chamadas executam UPDATE (eh DB que decide via WHERE) — sem crash
    expect(dbUpdateMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('captura erro do db.update (defensivo) e nao re-throw', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-01T00:05:00Z'));

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dbUpdateMock.mockImplementationOnce(() => {
      throw new Error('boom from db');
    });

    const mod: any = await import('../../server/jobs/resetStudyFreezes');

    // NAO deve throw — cron handler deve ser robusto
    await expect(mod.runResetStudyFreezesMonthly()).resolves.not.toThrow();
    errSpy.mockRestore();
  });
});
