/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-05 (GET /api/grind-sessions/history estendido)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-069 + ADR-070
 *
 * Foco: history endpoint retorna union { type: 'session' | 'manual_report', ... }
 * com cluster D5 (5min) para manual_reports + detailsAvailable computado server-side.
 *
 * Lessons:
 *   #3 — mock shape REAL de getGrindSessions/listWalletTransactionsByUser/getBankrollSnapshots.
 *   #6 — profitUsd via fxResolver.
 *   #11 — detailsAvailable controla habilitar botao no frontend (RF-11/RF-12).
 *
 * IMPORTANT: este sprint expoe um helper interno `getGrindSessionHistory(userId, options?)`
 * em `server/services/dashboardService.ts` (ou `server/routes/grind-sessions.ts` exportando
 * o builder) que monta o array unificado. Tests validam shape do helper.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSessions: vi.fn(),
    getSessionTournaments: vi.fn().mockResolvedValue([]),
    getPlannedTournamentsBySession: vi.fn().mockResolvedValue([]),
    getBreakFeedbacks: vi.fn().mockResolvedValue([]),
    listWalletTransactionsByUser: vi.fn(),
    getBankrollSnapshots: vi.fn(),
    getActiveWalletsByUser: vi.fn(),
    getCooldownLogBySessionId: vi.fn(),
  },
}));

import { storage } from '../../../server/storage';
// Helper a ser implementado em sprint atual — RED por importacao.
// @ts-expect-error — RED: helper getGrindSessionHistory ainda nao existe
import { getGrindSessionHistory } from '../../../server/services/grindSessionHistory';

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults seguros
  (storage.getGrindSessions as any).mockResolvedValue([]);
  (storage.listWalletTransactionsByUser as any).mockResolvedValue([]);
  (storage.getBankrollSnapshots as any).mockResolvedValue([]);
  (storage.getActiveWalletsByUser as any).mockResolvedValue([]);
});

// Shape REAL espelhando schema atual:
// grind_sessions: { id, userId, status, startTime, endTime, completedAt, profit, volume, ... }
// wallet_transactions: { id, walletId, userId, sessionId|null, reason, occurredAt, direction,
//                       nativeAmount, usdAmount, balanceAfterNative, ... }
// bankroll_snapshots: { id, userId, occurredAt, origin, sourceRefId, walletsBalances jsonb, ... }
// wallets: { id, platform, name, nativeCurrency }

const completedSession = {
  id: 'SES-1',
  userId: 'USER-0001',
  status: 'completed',
  startTime: '2026-05-01T19:00:00Z',
  endTime: '2026-05-01T22:00:00Z',
  completedAt: '2026-05-01T22:30:00Z',
  cooldownLogId: 'cl-1',
  profit: '-30',
  volume: 5,
  abiMed: '50',
  roi: '-1.5',
  fts: 0,
  cravadas: 0,
  energiaMedia: '7',
  focoMedio: '7',
  confiancaMedia: '7',
  inteligenciaEmocionalMedia: '7',
  interferenciasMedia: '2',
};

describe('getGrindSessionHistory — union session + manual_report (RF-05)', () => {
  it('retorna entries com discriminator type', async () => {
    // RED: helper nao existe
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([]);

    const entries = await getGrindSessionHistory('USER-0001');

    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      expect(['session', 'manual_report']).toContain(e.type);
    }
  });

  it('sessao registrada existente continua aparecendo com type=session (back-compat)', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([]);

    const entries = await getGrindSessionHistory('USER-0001');
    const sessionEntry = entries.find((e: any) => e.id === 'SES-1');
    expect(sessionEntry).toBeDefined();
    expect(sessionEntry.type).toBe('session');
  });

  it('manual_report standalone aparece com type=manual_report', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      {
        id: 'tx_mr_1',
        userId: 'USER-0001',
        walletId: 'wlt_ps',
        sessionId: null,
        reason: 'manual_report',
        direction: 'in',
        nativeAmount: '1247',
        usdAmount: '249.40',
        occurredAt: '2026-05-01T14:30:00Z',
      },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS Main', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const mrEntry = entries.find((e: any) => e.type === 'manual_report');
    expect(mrEntry).toBeDefined();
    expect(mrEntry.transactionIds).toContain('tx_mr_1');
  });

  it('cluster D5: 3 manual_reports em wallets distintas dentro de 4min = 1 entry', async () => {
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
      { id: 'tx_b', userId: 'USER-0001', walletId: 'wlt_gg', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '832', usdAmount: '166.40', occurredAt: '2026-05-01T14:32:00Z' },
      { id: 'tx_c', userId: 'USER-0001', walletId: 'wlt_acr', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '410', usdAmount: '82.00', occurredAt: '2026-05-01T14:33:30Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
      { id: 'wlt_gg', platform: 'GGNetwork', name: 'GG', nativeCurrency: 'USD' },
      { id: 'wlt_acr', platform: 'ACR', name: 'ACR', nativeCurrency: 'USD' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const mrEntries = entries.filter((e: any) => e.type === 'manual_report');
    expect(mrEntries.length).toBe(1);
    expect(mrEntries[0].transactionIds.sort()).toEqual(['tx_a', 'tx_b', 'tx_c'].sort());
  });

  it('cluster D5: 2 manual_reports com 6min de gap = 2 entries', async () => {
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
      { id: 'tx_b', userId: 'USER-0001', walletId: 'wlt_gg', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '832', usdAmount: '166.40', occurredAt: '2026-05-01T14:36:30Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
      { id: 'wlt_gg', platform: 'GGNetwork', name: 'GG', nativeCurrency: 'USD' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const mrEntries = entries.filter((e: any) => e.type === 'manual_report');
    expect(mrEntries.length).toBe(2);
  });

  it('cluster D5: 2 manual_reports MESMA wallet com 2min de gap = 2 entries (regra wallet repetida)', async () => {
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
      { id: 'tx_b', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'out', nativeAmount: '50', usdAmount: '10', occurredAt: '2026-05-01T14:32:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const mrEntries = entries.filter((e: any) => e.type === 'manual_report');
    expect(mrEntries.length).toBe(2);
  });

  it('platformsAffected resolve via wallet.platform/site para cada cluster', async () => {
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
      { id: 'tx_b', userId: 'USER-0001', walletId: 'wlt_gg', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '832', usdAmount: '166.40', occurredAt: '2026-05-01T14:32:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
      { id: 'wlt_gg', platform: 'GGNetwork', name: 'GG', nativeCurrency: 'USD' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const mr = entries.find((e: any) => e.type === 'manual_report');
    expect(mr.platformsAffected).toEqual(expect.arrayContaining(['PokerStars', 'GGNetwork']));
  });

  it('detailsAvailable=true para manual_report sempre (D8 derivacao garantida)', async () => {
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', balanceAfterNative: '2247', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const mr = entries.find((e: any) => e.type === 'manual_report');
    expect(mr.detailsAvailable).toBe(true);
  });

  it('detailsAvailable=true para session COM auto-cooldown snapshot (D7)', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.getBankrollSnapshots as any).mockResolvedValue([
      { id: 'snap_after', userId: 'USER-0001', occurredAt: '2026-05-01T22:30:30Z', origin: 'auto-cooldown', sourceRefId: 'cl-1' },
      { id: 'snap_before', userId: 'USER-0001', occurredAt: '2026-05-01T18:00:00Z', origin: 'manual', sourceRefId: null },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const ses = entries.find((e: any) => e.id === 'SES-1');
    expect(ses.detailsAvailable).toBe(true);
  });

  it('detailsAvailable=false para session legacy SEM snapshot adjacente', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.getBankrollSnapshots as any).mockResolvedValue([]);

    const entries = await getGrindSessionHistory('USER-0001');
    const ses = entries.find((e: any) => e.id === 'SES-1');
    expect(ses.detailsAvailable).toBe(false);
  });

  it('order DESC por occurredAt (mais recente primeiro)', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '100', usdAmount: '20', occurredAt: '2026-05-02T10:00:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    expect(entries.length).toBeGreaterThanOrEqual(2);
    // most recent first (manual_report 2026-05-02 > session 2026-05-01)
    const tsFirst = new Date(entries[0].occurredAt).getTime();
    const tsLast = new Date(entries[entries.length - 1].occurredAt).getTime();
    expect(tsFirst).toBeGreaterThanOrEqual(tsLast);
  });

  it('profitUsd correto por entry (manual_report = soma cluster delta_usd_at_time)', async () => {
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
      { id: 'tx_b', userId: 'USER-0001', walletId: 'wlt_gg', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '500', usdAmount: '100', occurredAt: '2026-05-01T14:32:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
      { id: 'wlt_gg', platform: 'GGNetwork', name: 'GG', nativeCurrency: 'USD' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001');
    const mr = entries.find((e: any) => e.type === 'manual_report');
    expect(mr.profitUsd).toBeCloseTo(349.4, 1);
  });

  it('paginacao limit 50 (default)', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      id: `tx_${i}`, userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null,
      reason: 'manual_report', direction: 'in', nativeAmount: '1', usdAmount: '0.20',
      occurredAt: new Date(Date.now() - i * 10 * 60 * 1000).toISOString(),
    }));
    (storage.listWalletTransactionsByUser as any).mockResolvedValue(many);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001', { limit: 50 });
    expect(entries.length).toBeLessThanOrEqual(50);
  });

  it('filtro server-side ?filter=sessions oculta manual_reports', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001', { filter: 'sessions' });
    expect(entries.every((e: any) => e.type === 'session')).toBe(true);
  });

  it('filtro server-side ?filter=reports oculta sessions', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001', { filter: 'reports' });
    expect(entries.every((e: any) => e.type === 'manual_report')).toBe(true);
  });

  it('filtro server-side ?filter=all retorna ambos (default)', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([completedSession]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([
      { id: 'tx_a', userId: 'USER-0001', walletId: 'wlt_ps', sessionId: null, reason: 'manual_report', direction: 'in', nativeAmount: '1247', usdAmount: '249.40', occurredAt: '2026-05-01T14:30:00Z' },
    ]);
    (storage.getActiveWalletsByUser as any).mockResolvedValue([
      { id: 'wlt_ps', platform: 'PokerStars', name: 'PS', nativeCurrency: 'BRL' },
    ]);

    const entries = await getGrindSessionHistory('USER-0001', { filter: 'all' });
    const types = new Set(entries.map((e: any) => e.type));
    expect(types.has('session')).toBe(true);
    expect(types.has('manual_report')).toBe(true);
  });

  it('empty state retorna []', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([]);
    (storage.listWalletTransactionsByUser as any).mockResolvedValue([]);
    const entries = await getGrindSessionHistory('USER-0001');
    expect(entries).toEqual([]);
  });
});

/**
 * profitUsd da sessao = lucro reconciliado da banca (founder A, 2026-05-18).
 * Precedencia: wallet_profit_usd persistido > delta de session_wallet_snapshots
 * reconciliadas > fallback P&L de torneios (session.profit).
 */
describe('getGrindSessionHistory — profitUsd via lucro da banca', () => {
  it('wallet_profit_usd persistido vence o profit de torneios', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([
      { ...completedSession, profit: '-857.75', walletProfitUsd: '-1009' },
    ]);
    const entries = await getGrindSessionHistory('USER-0001');
    const s = entries.find((e: any) => e.id === 'SES-1');
    expect(s.profitUsd).toBe(-1009);
  });

  it('sem wallet_profit_usd: backfill soma delta closing-opening das snapshots', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([
      { ...completedSession, profit: '-857.75', walletProfitUsd: null },
    ]);
    (storage as any).listSessionWalletSnapshotsByUser = vi.fn().mockResolvedValue([
      // -200 USD + -150 USD = -350 USD reconciliado.
      { sessionId: 'SES-1', walletId: 'w1', nativeCurrency: 'USD', openingBalance: 1000, closingBalance: 800 },
      { sessionId: 'SES-1', walletId: 'w2', nativeCurrency: 'USD', openingBalance: 500, closingBalance: 350 },
    ]);
    const entries = await getGrindSessionHistory('USER-0001');
    const s = entries.find((e: any) => e.id === 'SES-1');
    expect(s.profitUsd).toBeCloseTo(-350, 5);
  });

  it('snapshot sem closing_balance (skip reconciliation) nao conta — cai no fallback', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([
      { ...completedSession, profit: '-857.75', walletProfitUsd: null },
    ]);
    (storage as any).listSessionWalletSnapshotsByUser = vi.fn().mockResolvedValue([
      { sessionId: 'SES-1', walletId: 'w1', nativeCurrency: 'USD', openingBalance: 1000, closingBalance: null },
    ]);
    const entries = await getGrindSessionHistory('USER-0001');
    const s = entries.find((e: any) => e.id === 'SES-1');
    expect(s.profitUsd).toBeCloseTo(-857.75, 5);
  });

  it('sem persistido e sem snapshots: fallback para profit de torneios', async () => {
    (storage.getGrindSessions as any).mockResolvedValue([
      { ...completedSession, profit: '-857.75', walletProfitUsd: null },
    ]);
    (storage as any).listSessionWalletSnapshotsByUser = vi.fn().mockResolvedValue([]);
    const entries = await getGrindSessionHistory('USER-0001');
    const s = entries.find((e: any) => e.id === 'SES-1');
    expect(s.profitUsd).toBeCloseTo(-857.75, 5);
  });
});
