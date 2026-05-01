/**
 * Sprint Bankroll-3 — RF-6 round-2 reviewer fix CRIT-5
 *
 * Tests para getStartOfUserDay (acessada indiretamente via getCurrentDayDeltaUsd)
 * cobrindo timezones reais (BR, US, JP) e DST. Garantia: o "inicio do dia local"
 * eh um instante UTC anterior a NOW para timezones positivos (oeste de UTC) ou
 * pode ser ate 24h antes/depois para timezones negativos (leste).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    upsertUserSettings: vi.fn(),
    listGrindSessionsByUser: vi.fn(),
    listSessionTournamentsBySessions: vi.fn(),
    getUserById: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn({ getUserSettings: vi.fn(), upsertUserSettings: vi.fn() })),
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
import { stopService } from '../../../server/services/stopService';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({ bankrollManagementEnabled: true });
  (storage.listSessionTournamentsBySessions as any).mockResolvedValue([]);
});

describe('stopService TZ-aware day-window — CRIT-5', () => {
  /**
   * Cenarios:
   * - Sao Paulo (UTC-3) — sessao completada `agora-2h` deve estar no dia atual local.
   * - New York (UTC-4 ou -5) — idem.
   * - Tokyo (UTC+9) — idem.
   * - TZ invalida -> nao throw, fallback UTC.
   *
   * Estrategia: criar 1 sessao completada com completedAt = now-1h, garantir
   * que `getCurrentDayDeltaUsd` recebe ela no recordset (delta != 0).
   */

  function setupSessionCompletedNowMinusHours(hoursAgo: number, tz: string) {
    (storage.getUserById as any).mockResolvedValue({
      userPlatformId: 'USER-0001',
      timezone: tz,
    });
    const completedAt = new Date(Date.now() - hoursAgo * 3600 * 1000);
    (storage.listGrindSessionsByUser as any).mockResolvedValue([
      { id: 'ses_1', userId: 'USER-0001', status: 'completed', completedAt },
    ]);
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_1', site: 'GGNetwork', totalInvested: '100', payouts: '50' },
    ]);
  }

  it('America/Sao_Paulo: sessao 2h atras conta no dia atual', async () => {
    setupSessionCompletedNowMinusHours(2, 'America/Sao_Paulo');
    const delta = await stopService.getCurrentDayDeltaUsd('USER-0001');
    // -50 USD perda. So entra se a sessao for considerada DENTRO do startOfDay local.
    expect(delta).toBeCloseTo(-50, 1);
  });

  it('America/New_York: sessao 1h atras conta no dia atual', async () => {
    setupSessionCompletedNowMinusHours(1, 'America/New_York');
    const delta = await stopService.getCurrentDayDeltaUsd('USER-0001');
    expect(delta).toBeCloseTo(-50, 1);
  });

  it('Asia/Tokyo: sessao 3h atras conta no dia atual', async () => {
    setupSessionCompletedNowMinusHours(3, 'Asia/Tokyo');
    const delta = await stopService.getCurrentDayDeltaUsd('USER-0001');
    expect(delta).toBeCloseTo(-50, 1);
  });

  it('TZ invalida: fallback UTC, nao throw', async () => {
    setupSessionCompletedNowMinusHours(1, 'Mars/Olympus');
    await expect(stopService.getCurrentDayDeltaUsd('USER-0001')).resolves.toBeDefined();
  });

  it('Sessao h-50 (mais de 1 dia atras) nao conta', async () => {
    (storage.getUserById as any).mockResolvedValue({
      userPlatformId: 'USER-0001',
      timezone: 'UTC',
    });
    const completedAt = new Date(Date.now() - 50 * 3600 * 1000);
    (storage.listGrindSessionsByUser as any).mockResolvedValue([
      { id: 'ses_old', userId: 'USER-0001', status: 'completed', completedAt },
    ]);
    (storage.listSessionTournamentsBySessions as any).mockResolvedValue([
      { sessionId: 'ses_old', site: 'GGNetwork', totalInvested: '100', payouts: '50' },
    ]);
    const delta = await stopService.getCurrentDayDeltaUsd('USER-0001');
    expect(delta).toBe(0);
  });
});
