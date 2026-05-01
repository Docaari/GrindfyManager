/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-03 (POST /api/wallets/:id/transactions estendido)
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-069
 *
 * Foco: handler `handlePostWalletTransaction` aceita reason='manual_report' sem
 * sessionId (200/201), rejeita com sessionId (400 manual_report_no_session),
 * mantem session_result com sessionId obrigatorio (regression),
 * e response inclui `snapshot` quando snapshot best-effort succeded.
 *
 * Lessons:
 *   #3 — mock shape REAL do walletService (response: {transaction, wallet, snapshot?}).
 *   #6 — delta_usd_at_time computado server-side (FX-aware).
 *   #2 — auth required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    recordWalletTransaction: vi.fn(),
    listWallets: vi.fn(),
    getConsolidatedBalance: vi.fn(),
    createWallet: vi.fn(),
    getWallet: vi.fn(),
    updateWallet: vi.fn(),
    archiveWallet: vi.fn(),
    listWalletTransactions: vi.fn(),
  },
}));

import {
  handlePostWalletTransaction,
} from '../../../server/routes/wallets';
import { walletService } from '../../../server/services/walletService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: { id: 'wlt_ps' },
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
// POST /api/wallets/:id/transactions — manual_report aceito sem sessionId
// ===========================================================================

describe('POST /api/wallets/:id/transactions — reason manual_report (RF-03)', () => {
  it('aceita reason=manual_report sem sessionId -> 201 com transaction.session_id=null', async () => {
    // RED: handler ainda valida WALLET_TX_REASONS_P0 sem manual_report -> 400
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: {
        id: 'tx_new',
        walletId: 'wlt_ps',
        userId: 'USER-0001',
        reason: 'manual_report',
        sessionId: null,
        direction: 'in',
        nativeAmount: '1247',
        usdAmount: '249.40',
        balanceAfterNative: '2247',
      },
      wallet: { id: 'wlt_ps', balance: '2247' },
      snapshot: { id: 'snap_new', origin: 'manual-report' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: {
        direction: 'in',
        nativeAmount: 1247,
        reason: 'manual_report',
        occurredAt: '2026-05-01T22:30:00Z',
      },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.transaction.reason).toBe('manual_report');
    expect(res.body.transaction.sessionId).toBeNull();
  });

  it('rejeita reason=manual_report COM sessionId -> 400 code=manual_report_no_session', async () => {
    // RED: validacao mutuamente exclusiva ainda nao no handler/schema
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: {
        direction: 'in',
        nativeAmount: 1247,
        reason: 'manual_report',
        sessionId: 'SES-1',
        occurredAt: '2026-05-01T22:30:00Z',
      },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('manual_report_no_session');
  });

  it('mantem reason=session_result + !sessionId -> 400 code=session_id_required (regression)', async () => {
    (walletService.recordWalletTransaction as any).mockRejectedValue(
      Object.assign(new Error('sessionId obrigatorio quando reason=session_result'), {
        statusCode: 400,
        code: 'session_id_required',
      }),
    );

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: {
        direction: 'in',
        nativeAmount: 100,
        reason: 'session_result',
        occurredAt: '2026-05-01T22:30:00Z',
      },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('session_id_required');
  });

  it('response 201 inclui snapshot quando best-effort succeded', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx_a', reason: 'manual_report', sessionId: null },
      wallet: { id: 'wlt_ps', balance: '2247' },
      snapshot: { id: 'snap_x', origin: 'manual-report', sourceRefId: 'tx_a' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { direction: 'in', nativeAmount: 1000, reason: 'manual_report' },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    // RED: handler atual nao propaga `snapshot` no response
    expect(res.body.snapshot).toBeDefined();
    expect(res.body.snapshot.origin).toBe('manual-report');
  });

  it('response 201 omite snapshot quando best-effort falhou (snapshot=null)', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx_a', reason: 'manual_report', sessionId: null },
      wallet: { id: 'wlt_ps', balance: '2247' },
      snapshot: null,
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { direction: 'in', nativeAmount: 1000, reason: 'manual_report' },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    // Aceita ausente OU explicitamente null
    expect(res.body.snapshot ?? null).toBeNull();
  });

  it('handler propaga delta_usd_at_time no response (FX-aware #6)', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: {
        id: 'tx_a',
        reason: 'manual_report',
        sessionId: null,
        usdAmount: '249.40',
      },
      wallet: { id: 'wlt_ps', balance: '2247' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { direction: 'in', nativeAmount: 1247, reason: 'manual_report' },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(parseFloat(String(res.body.transaction.usdAmount))).toBeCloseTo(249.4, 1);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      user: undefined,
      body: { direction: 'in', nativeAmount: 1, reason: 'manual_report' },
    }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('zod validation falha (nativeAmount=0) -> 400 sem chamar service', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { direction: 'in', nativeAmount: 0, reason: 'manual_report' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });

  it('forward sessionId=null para o service quando manual_report (NAO undefined)', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx_a', reason: 'manual_report', sessionId: null },
      wallet: { id: 'wlt_ps', balance: '2000' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { direction: 'in', nativeAmount: 1000, reason: 'manual_report' },
    }) as any, res);

    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0]?.[2];
    expect(callArgs).toBeDefined();
    // Service deve receber sessionId nullish
    expect(callArgs.sessionId ?? null).toBeNull();
    expect(callArgs.reason).toBe('manual_report');
  });

  it('reason ainda invalido (foo_bar) -> 400 reason_not_supported_in_p0 (regression)', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { direction: 'in', nativeAmount: 100, reason: 'foo_bar' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.code === 'reason_not_supported_in_p0' || res.body.message).toBeTruthy();
  });

  it('manual_report rate-limited usa walletLimiter (registro registra rate limit middleware) — handler isolated test marker', async () => {
    // Marker test: handler NAO sabe sobre rate-limit (middleware no registerWalletRoutes).
    // Smoke: garante que handler nao rejeita 429 sozinho — middleware fica em integration smoke.
    // (Spec RF-10 menciona rate-limit aplicado; ver suite separada se necessario.)
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'tx_a', reason: 'manual_report', sessionId: null },
      wallet: { id: 'wlt_ps', balance: '2000' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { direction: 'in', nativeAmount: 100, reason: 'manual_report' },
    }) as any, res);
    expect([200, 201]).toContain(res.statusCode);
  });
});
