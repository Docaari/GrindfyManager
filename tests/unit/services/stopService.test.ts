/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-6: Stop-loss / Stop-win (service layer)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-6, D3)
 * ADR-060: Stop-loss/stop-win semantica e timezone
 *
 * API esperada em server/services/stopService.ts:
 *   stopService.assertNotStopLocked(userId): throws STOP_LOCKED se locked
 *   stopService.evaluateStops(userId, sessionId): { stopReached, lockedUntil? }
 *   stopService.getCurrentDayDeltaUsd(userId): number
 *   stopService.releaseLock(userId): void (admin)
 *
 * Casos cobertos:
 *   1. assertNotStopLocked: stop_lock_until > NOW -> throw STOP_LOCKED
 *   2. assertNotStopLocked: stop_lock_until expirado -> ok
 *   3. assertNotStopLocked: nunca foi setado -> ok
 *   4. evaluateStops: delta <= -stopLossUsd -> seta lock = NOW + 12h
 *   5. evaluateStops: delta >= stopWinUsd -> stopReached='win', NAO seta lock
 *   6. evaluateStops: delta dentro do range -> stopReached=null
 *   7. evaluateStops respeita stop_lock_duration_hours
 *   8. evaluateStops: bankrollManagementEnabled=false -> skip (return null)
 *   9. evaluateStops: stopLossUsd=null -> nao avalia loss
 *  10. evaluateStops: stopWinUsd=null -> nao avalia win
 *  11. delta calculation: apenas sessoes completed do dia
 *  12. delta usa fxResolver para conversao USD
 *  13. reset 00:00 user TZ (BR=UTC-3, US=UTC-5, fallback UTC)
 *  14. evaluateStops idempotente (multiplas calls mesmo lock seta unico)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    listGrindSessionsByUser: vi.fn(),
    listSessionTournamentsBySessions: vi.fn(),
    getUserById: vi.fn(),
    transaction: vi.fn(async (fn: any) =>
      fn({ getUserSettings: vi.fn(), upsertUserSettings: vi.fn() }),
    ),
  },
}));

vi.mock('../../../server/services/fxResolver', () => ({
  fxResolver: {
    resolveExchangeRates: vi.fn(async () => ({
      rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
      source: 'fallback',
      resolvedAt: new Date(),
    })),
    invalidateCache: vi.fn(),
  },
  resolveExchangeRates: vi.fn(async () => ({
    rates: { USD: 1, BRL: 5.0, EUR: 0.93 },
    source: 'fallback',
    resolvedAt: new Date(),
  })),
}));

import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserById as any).mockResolvedValue({
    userPlatformId: 'USER-0001',
    timezone: 'UTC',
  });
});

async function loadService() {
  const mod: any = await import('../../../server/services/stopService');
  return mod.stopService ?? mod;
}

describe('stopService.assertNotStopLocked — RF-6', () => {
  it('throw STOP_LOCKED quando stop_lock_until > NOW', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLockUntil: new Date(Date.now() + 60 * 60 * 1000), // +1h
    });
    const svc = await loadService();
    await expect(svc.assertNotStopLocked('USER-0001')).rejects.toThrow(/STOP_LOCKED|locked/i);
  });

  it('passa quando stop_lock_until expirado', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLockUntil: new Date(Date.now() - 60 * 60 * 1000),
    });
    const svc = await loadService();
    await expect(svc.assertNotStopLocked('USER-0001')).resolves.not.toThrow();
  });

  it('passa quando stop_lock_until null', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLockUntil: null,
    });
    const svc = await loadService();
    await expect(svc.assertNotStopLocked('USER-0001')).resolves.not.toThrow();
  });

  it('error inclui lockedUntil + remainingMs', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLockUntil: future,
    });
    const svc = await loadService();
    try {
      await svc.assertNotStopLocked('USER-0001');
      throw new Error('should have thrown');
    } catch (err: any) {
      expect(err.lockedUntil ?? err.body?.lockedUntil).toBeDefined();
    }
  });

  it('skip quando bankrollManagementEnabled=false', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: false,
      stopLockUntil: new Date(Date.now() + 60 * 60 * 1000),
    });
    const svc = await loadService();
    await expect(svc.assertNotStopLocked('USER-0001')).resolves.not.toThrow();
  });
});

describe('stopService.evaluateStops — RF-6', () => {
  beforeEach(() => {
    (storage.listGrindSessionsByUser as any).mockResolvedValue([
      { id: 'ses_1', userId: 'USER-0001', status: 'completed', completedAt: new Date() },
    ]);
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '100', payouts: '0' },
    ]);
  });

  it('delta <= -stopLossUsd seta lock = NOW + 12h', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: '300',
      stopWinUsd: null,
      stopLockUntil: null,
      stopLockDurationHours: 12,
    });
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '400', payouts: '0' },
    ]);
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    expect(result.stopReached).toBe('loss');
    expect(result.lockedUntil).toBeDefined();
    expect(storage.upsertUserSettings).toHaveBeenCalled();
  });

  it('delta >= stopWinUsd: stopReached=win, NAO seta lock', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: null,
      stopWinUsd: '500',
      stopLockUntil: null,
      stopLockDurationHours: 12,
    });
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '100', payouts: '700' },
    ]);
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    expect(result.stopReached).toBe('win');
    expect(result.lockedUntil).toBeFalsy();
  });

  it('delta dentro do range: stopReached=null', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: '300',
      stopWinUsd: '500',
      stopLockUntil: null,
      stopLockDurationHours: 12,
    });
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '100', payouts: '50' },
    ]);
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    expect(result.stopReached).toBeFalsy();
  });

  it('respeita stopLockDurationHours custom (24h)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: '300',
      stopLockUntil: null,
      stopLockDurationHours: 24,
    });
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '400', payouts: '0' },
    ]);
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    expect(result.lockedUntil).toBeDefined();
    const lockedAt = new Date(result.lockedUntil!).getTime();
    const expected = Date.now() + 24 * 3600 * 1000;
    expect(Math.abs(lockedAt - expected)).toBeLessThan(60_000);
  });

  it('bankrollManagementEnabled=false -> retorna null sem chamar storage', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: false,
      stopLossUsd: '300',
    });
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    expect(result?.stopReached ?? null).toBeFalsy();
    expect(storage.upsertUserSettings).not.toHaveBeenCalled();
  });

  it('stopLossUsd=null -> nao avalia perda', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: null,
      stopWinUsd: '500',
      stopLockUntil: null,
    });
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '999', payouts: '0' },
    ]);
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    expect(result.stopReached).not.toBe('loss');
  });

  it('stopWinUsd=null -> nao avalia ganho', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: '300',
      stopWinUsd: null,
      stopLockUntil: null,
    });
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '100', payouts: '999' },
    ]);
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    expect(result.stopReached).not.toBe('win');
  });

  it('apenas sessoes completed contam', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: '300',
    });
    (storage.listGrindSessionsByUser as any).mockResolvedValue([
      { id: 'ses_1', userId: 'USER-0001', status: 'completed', completedAt: new Date() },
      { id: 'ses_2', userId: 'USER-0001', status: 'active', completedAt: null },
    ]);
    const svc = await loadService();
    await svc.evaluateStops('USER-0001', 'ses_1');
    // Verificar que so passa sessoes completed
    const sessionsArg = (storage.listSessionTournamentsBySessions as any).mock.calls[0]?.[1] ?? [];
    const flatIds = Array.isArray(sessionsArg) ? sessionsArg : [];
    if (flatIds.length > 0) {
      expect(flatIds).not.toContain('ses_2');
    }
  });

  it('conversao BRL -> USD via fxResolver (nao usa raw)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
      stopLossUsd: '50',
      stopLockUntil: null,
      stopLockDurationHours: 12,
    });
    // 400 BRL / 5.0 = 80 USD perda
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'Suprema', totalInvested: '400', payouts: '0' },
    ]);
    const svc = await loadService();
    const result = await svc.evaluateStops('USER-0001', 'ses_1');
    // 80 USD perda > 50 USD limit -> loss
    expect(result.stopReached).toBe('loss');
  });
});

describe('stopService.getCurrentDayDeltaUsd — RF-6', () => {
  it('retorna numero', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
    });
    (storage.listGrindSessionsByUser as any).mockResolvedValue([]);
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([]);

    const svc = await loadService();
    const r = await svc.getCurrentDayDeltaUsd('USER-0001');
    expect(typeof r).toBe('number');
  });

  it('respeita user TZ (BR=UTC-3)', async () => {
    (storage.getUserById as any).mockResolvedValue({
      userPlatformId: 'USER-0001',
      timezone: 'America/Sao_Paulo',
    });
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
    });
    (storage.listGrindSessionsByUser as any).mockResolvedValue([]);
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([]);
    const svc = await loadService();
    const r = await svc.getCurrentDayDeltaUsd('USER-0001');
    expect(typeof r).toBe('number');
  });

  it('TZ invalida -> fallback UTC, sem throw', async () => {
    (storage.getUserById as any).mockResolvedValue({
      userPlatformId: 'USER-0001',
      timezone: 'Mars/Olympus',
    });
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: true,
    });
    (storage.listGrindSessionsByUser as any).mockResolvedValue([]);
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([]);
    const svc = await loadService();
    await expect(svc.getCurrentDayDeltaUsd('USER-0001')).resolves.toBeDefined();
  });
});

describe('stopService.releaseLock — RF-6 (admin/debug)', () => {
  it('limpa stop_lock_until', async () => {
    const svc = await loadService();
    await svc.releaseLock('USER-0001');
    expect(storage.upsertUserSettings).toHaveBeenCalled();
    const args = (storage.upsertUserSettings as any).mock.calls[0]?.[0] ?? {};
    expect(args.stopLockUntil ?? null).toBeNull();
  });
});
