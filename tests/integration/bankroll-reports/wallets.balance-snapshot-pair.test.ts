/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-06 (GET /api/wallets/balance-snapshot-pair)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-070
 *
 * Foco: novo endpoint retorna { before, after, delta, empty, emptyReason } com
 * precedence D7 (sessao) ou D8 (manual_report).
 *
 * Lessons:
 *   #3 — mock shape REAL de bankroll_snapshots.walletsBalances (jsonb), wallets, etc.
 *   #6 — delta normalizado USD via fxResolver.
 *   #11 — empty state honesto sem fallback hacky.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    // Novo metodo a implementar
    getBalanceSnapshotPair: vi.fn(),
    listWallets: vi.fn(),
    getConsolidatedBalance: vi.fn(),
  },
}));

import { walletService } from '../../../server/services/walletService';
// Handler a ser implementado e exportado em routes/wallets.ts — RED: nao existe ainda.
// @ts-expect-error — RED: handleGetBalanceSnapshotPair ainda nao existe
import { handleGetBalanceSnapshotPair } from '../../../server/routes/wallets';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

// ===========================================================================
// GET /api/wallets/balance-snapshot-pair
// ===========================================================================

describe('GET /api/wallets/balance-snapshot-pair (RF-06)', () => {
  it('happy path: from + to + sessionId presentes -> 200 com before/after/delta', async () => {
    // RED: handler nao existe -> import falha no oxc transform; quando criado
    // este test exige que metodo getBalanceSnapshotPair seja chamado e response seja repassada.
    (walletService.getBalanceSnapshotPair as any).mockResolvedValue({
      before: [
        { walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 5000, balanceUsd: 1000, snapshotId: 'snap_b', snapshotOrigin: 'manual' },
      ],
      after: [
        { walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 4250, balanceUsd: 850, snapshotId: 'snap_a', snapshotOrigin: 'auto-cooldown' },
      ],
      delta: [
        { walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', deltaNative: -750, deltaUsd: -150 },
      ],
      empty: false,
    });

    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      query: { from: '2026-05-01T19:00:00Z', to: '2026-05-01T22:00:00Z', sessionId: 'SES-1' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.before).toBeDefined();
    expect(res.body.after).toBeDefined();
    expect(res.body.delta).toBeDefined();
    expect(res.body.empty).toBe(false);
  });

  it('precedence D7: snapshot session-bound auto-cooldown wins (sessao registrada)', async () => {
    (walletService.getBalanceSnapshotPair as any).mockResolvedValue({
      before: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 5000, balanceUsd: 1000, snapshotId: 'snap_b', snapshotOrigin: 'manual' }],
      after: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 4250, balanceUsd: 850, snapshotId: 'snap_a', snapshotOrigin: 'auto-cooldown' }],
      delta: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', deltaNative: -750, deltaUsd: -150 }],
      empty: false,
    });

    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      query: { from: '2026-05-01T19:00:00Z', to: '2026-05-01T22:00:00Z', sessionId: 'SES-1' },
    }) as any, res);

    expect(res.body.after[0].snapshotOrigin).toBe('auto-cooldown');
  });

  it('fallback temporal: snapshot mais proximo ANTES de from + DEPOIS de to (D7 fallback 2)', async () => {
    (walletService.getBalanceSnapshotPair as any).mockResolvedValue({
      before: [{ walletId: 'w1', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', balanceNative: 1000, balanceUsd: 1000, snapshotId: 'snap_b_legacy', snapshotOrigin: 'manual' }],
      after: [{ walletId: 'w1', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', balanceNative: 1100, balanceUsd: 1100, snapshotId: 'snap_a_legacy', snapshotOrigin: 'manual' }],
      delta: [{ walletId: 'w1', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', deltaNative: 100, deltaUsd: 100 }],
      empty: false,
    });

    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      query: { from: '2026-04-15T19:00:00Z', to: '2026-04-15T22:00:00Z', sessionId: 'SES-LEGACY' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.before[0].snapshotOrigin).toBe('manual');
  });

  it('empty state retorna empty=true + emptyReason="no_snapshot_before" (D6)', async () => {
    (walletService.getBalanceSnapshotPair as any).mockResolvedValue({
      before: [], after: [], delta: [],
      empty: true,
      emptyReason: 'no_snapshot_before',
    });

    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      query: { from: '2025-01-01T00:00:00Z', to: '2025-01-01T01:00:00Z' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.empty).toBe(true);
    expect(res.body.emptyReason).toBe('no_snapshot_before');
  });

  it('manual_report: precedence D8 retorna delta computado por aritmetica (snapshot ausente)', async () => {
    // Quando manual_report nao tem snapshot dedicado, server deriva por aritmetica
    (walletService.getBalanceSnapshotPair as any).mockResolvedValue({
      before: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 0, balanceUsd: 0, snapshotId: null, snapshotOrigin: null }],
      after: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 1247, balanceUsd: 249.4, snapshotId: null, snapshotOrigin: null }],
      delta: [{ walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', deltaNative: 1247, deltaUsd: 249.4 }],
      empty: false,
    });

    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      query: { from: '2026-05-01T14:29:59Z', to: '2026-05-01T14:30:01Z' },
    }) as any, res);

    expect(res.body.before[0].snapshotId).toBeNull();
    expect(res.body.delta[0].deltaUsd).toBeCloseTo(249.4, 1);
  });

  it('delta[i].deltaUsd === after[i].balanceUsd - before[i].balanceUsd (math correto)', async () => {
    (walletService.getBalanceSnapshotPair as any).mockResolvedValue({
      before: [{ walletId: 'w1', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', balanceNative: 800, balanceUsd: 800, snapshotId: 'b', snapshotOrigin: 'manual' }],
      after: [{ walletId: 'w1', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', balanceNative: 920, balanceUsd: 920, snapshotId: 'a', snapshotOrigin: 'auto-cooldown' }],
      delta: [{ walletId: 'w1', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', deltaNative: 120, deltaUsd: 120 }],
      empty: false,
    });

    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      query: { from: '2026-05-01T19:00:00Z', to: '2026-05-01T22:00:00Z', sessionId: 'SES-1' },
    }) as any, res);

    const b = res.body.before[0].balanceUsd;
    const a = res.body.after[0].balanceUsd;
    const d = res.body.delta[0].deltaUsd;
    expect(d).toBe(a - b);
  });

  it('wallets sem mudanca aparecem com delta=0 (NAO filtrar)', async () => {
    (walletService.getBalanceSnapshotPair as any).mockResolvedValue({
      before: [
        { walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 1000, balanceUsd: 200, snapshotId: 'b', snapshotOrigin: 'manual' },
        { walletId: 'w2', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', balanceNative: 200, balanceUsd: 200, snapshotId: 'b', snapshotOrigin: 'manual' },
      ],
      after: [
        { walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', balanceNative: 850, balanceUsd: 170, snapshotId: 'a', snapshotOrigin: 'auto-cooldown' },
        { walletId: 'w2', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', balanceNative: 200, balanceUsd: 200, snapshotId: 'a', snapshotOrigin: 'auto-cooldown' },
      ],
      delta: [
        { walletId: 'w1', walletName: 'PS', platform: 'PokerStars', currency: 'BRL', deltaNative: -150, deltaUsd: -30 },
        { walletId: 'w2', walletName: 'GG', platform: 'GGNetwork', currency: 'USD', deltaNative: 0, deltaUsd: 0 },
      ],
      empty: false,
    });

    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      query: { from: '2026-05-01T19:00:00Z', to: '2026-05-01T22:00:00Z' },
    }) as any, res);

    const w2 = res.body.delta.find((d: any) => d.walletId === 'w2');
    expect(w2).toBeDefined();
    expect(w2.deltaUsd).toBe(0);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetBalanceSnapshotPair(makeReq({
      user: undefined,
      query: { from: '2026-05-01T19:00:00Z', to: '2026-05-01T22:00:00Z' },
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});
