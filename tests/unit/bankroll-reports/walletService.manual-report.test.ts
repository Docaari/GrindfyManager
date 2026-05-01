/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-Reports-Detail — RF-01, RF-02, RF-03
 * Spec: Docs/specs/sprint-bankroll-reports-detail.md
 * ADR-069: novo reason `manual_report` mutuamente exclusivo com `session_result`.
 *
 * Foco: validacao server-side de `recordWalletTransaction` + label PT-BR + helper
 * `isStandaloneReason`. Garante que reason 'manual_report' aceita sessionId=null,
 * rejeita sessionId presente, e que reason 'session_result' continua exigindo sessionId.
 *
 * Lessons aplicaveis:
 *   #3 — mock shape REAL do walletService (signature/response).
 *   #6 — delta_usd_at_time via fxResolver (FX-aware).
 *   #8 — checar PRESENCA via .includes(), NAO length absoluta de WALLET_TX_REASONS.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks devem vir antes dos imports do servico — shape REAL espelhado do storage atual
// (selectWalletForUpdate, createWalletTransaction, updateWalletBalance, insertBankrollSnapshot).
vi.mock('../../../server/storage', () => ({
  storage: {
    transaction: vi.fn(async (fn: any) => fn({
      selectWalletForUpdate: vi.fn().mockResolvedValue({
        id: 'wlt_ps',
        userId: 'USER-0001',
        name: 'PokerStars',
        platform: 'PokerStars',
        nativeCurrency: 'BRL',
        balance: '1000',
        status: 'active',
        version: 1,
        isShotPocket: false,
      }),
      getLastWalletTransaction: vi.fn().mockResolvedValue(null),
      getUserSettings: vi.fn().mockResolvedValue({ exchangeRates: { BRL: 5.0 } }),
      createWalletTransaction: vi.fn().mockImplementation(async (input: any) => ({
        id: 'tx_new',
        ...input,
        balanceAfterNative: input.newNativeBalance,
      })),
      updateWalletBalance: vi.fn().mockResolvedValue(undefined),
      insertBankrollSnapshot: vi.fn().mockResolvedValue({ id: 'snap_new' }),
      getActiveWalletsByUser: vi.fn().mockResolvedValue([]),
    })),
    getUserSettings: vi.fn().mockResolvedValue({ exchangeRates: { BRL: 5.0 } }),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: { invalidateAllForUser: vi.fn(), get: vi.fn(), set: vi.fn() },
}));
vi.mock('../../../server/services/bankrollCache', () => ({
  bankrollCache: { invalidateAllForUser: vi.fn() },
}));
vi.mock('../../../server/services/walletCache', () => ({
  walletCache: { invalidateAllForUser: vi.fn() },
}));
vi.mock('../../../server/services/fxResolver', () => ({
  fxResolver: {
    resolveExchangeRates: vi.fn(async () => ({
      rates: { USD: 1, BRL: 5.0 },
      source: 'fallback',
      resolvedAt: new Date(),
    })),
  },
}));

import {
  WALLET_TX_REASONS,
  WALLET_TX_REASONS_P0,
  WalletTxBodyRefinedSchema,
} from '../../../shared/wallet-reasons';
// Helpers e constants novos do sprint — importados ainda nao existem (RED).
// @ts-expect-error — RED: simbolo `isStandaloneReason` ainda nao implementado em wallet-reasons
import { isStandaloneReason, WALLET_TX_REASON_LABELS_PT } from '../../../shared/wallet-reasons';
import { walletService } from '../../../server/services/walletService';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

// ===========================================================================
// RF-01 — enum + helper + label
// ===========================================================================

describe('shared/wallet-reasons — manual_report adicionado (RF-01)', () => {
  it('WALLET_TX_REASONS contem manual_report', () => {
    // RED: enum ainda nao tem manual_report
    expect(WALLET_TX_REASONS).toContain('manual_report');
  });

  it('WALLET_TX_REASONS_P0 contem manual_report (presence check, NAO length absoluta — lesson #8)', () => {
    // RED: P0 ainda nao expandiu
    expect(WALLET_TX_REASONS_P0).toContain('manual_report');
  });

  it('isStandaloneReason("manual_report") retorna true', () => {
    // RED: helper ainda nao existe
    expect(isStandaloneReason('manual_report' as any)).toBe(true);
  });

  it('isStandaloneReason("session_result") retorna false', () => {
    // RED: helper ainda nao existe
    expect(isStandaloneReason('session_result' as any)).toBe(false);
  });

  it('isStandaloneReason("deposit") retorna false', () => {
    // RED: helper ainda nao existe — deposito nao eh standalone (pode estar em sessao ou nao)
    expect(isStandaloneReason('deposit' as any)).toBe(false);
  });

  it('WALLET_TX_REASON_LABELS_PT.manual_report === "Report manual"', () => {
    // RED: mapa de labels PT-BR ainda nao existe
    expect(WALLET_TX_REASON_LABELS_PT?.manual_report).toBe('Report manual');
  });

  it('WALLET_TX_REASON_LABELS_PT cobre todos reasons P0 (presence)', () => {
    // RED: mapa ainda nao existe — checar presenca individual (#8)
    for (const r of WALLET_TX_REASONS_P0) {
      expect(WALLET_TX_REASON_LABELS_PT?.[r]).toBeDefined();
    }
  });

  it('mantem outros reasons existentes (regression: deposit ainda presente)', () => {
    // RED por importacao do helper, mas regression check valido
    expect(WALLET_TX_REASONS).toContain('deposit');
    expect(WALLET_TX_REASONS).toContain('session_result');
  });
});

// ===========================================================================
// RF-01 — Zod superRefine: manual_report rejeita sessionId
// ===========================================================================

describe('WalletTxBodyRefinedSchema — manual_report mutuamente exclusivo (D2)', () => {
  it('aceita manual_report sem sessionId', () => {
    // RED: schema atual nao conhece manual_report (vai cair em reason check de outro lugar)
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita manual_report COM sessionId (D2 mutuamente exclusivo)', () => {
    // RED: schema nao implementa validacao
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
      sessionId: 'SES-1',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = r.error.issues.map((i) => i.message).join(' ');
      expect(msg.toLowerCase()).toContain('manual_report');
    }
  });

  it('mantem session_result exigindo sessionId (regression D2)', () => {
    // RED: validacao de session_result sem sessionId precisa ser ativada via schema
    // (atualmente esta no walletService, vai migrar para superRefine)
    const r = WalletTxBodyRefinedSchema.safeParse({
      direction: 'in',
      nativeAmount: 100,
      reason: 'session_result',
      // sessionId ausente
    });
    expect(r.success).toBe(false);
  });

  it('outros reasons (deposit/withdrawal/manual_adjustment) ignoram sessionId', () => {
    for (const reason of ['deposit', 'withdrawal', 'manual_adjustment']) {
      const r = WalletTxBodyRefinedSchema.safeParse({
        direction: 'in',
        nativeAmount: 100,
        reason,
        sessionId: 'SES-X',
      });
      // Esperado: sucesso (reasons nao standalone aceitam sessionId; eh ignorado)
      expect(r.success).toBe(true);
    }
  });
});

// ===========================================================================
// RF-02 + RF-03 — walletService.recordWalletTransaction com manual_report
// ===========================================================================

describe('walletService.recordWalletTransaction — reason manual_report (RF-02)', () => {
  it('aceita reason=manual_report sem sessionId e cria tx com session_id=NULL', async () => {
    // RED: walletService rejeita reason fora WALLET_TX_REASONS_P0 (manual_report ainda nao em P0)
    const result = await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
      occurredAt: new Date(),
    } as any);

    expect(result.transaction).toBeDefined();
    expect(result.transaction.sessionId ?? null).toBeNull();
    expect(result.transaction.reason).toBe('manual_report');
  });

  it('rejeita reason=manual_report COM sessionId (D2)', async () => {
    // RED: validacao mutuamente exclusiva ainda nao implementada no service
    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
        direction: 'in',
        nativeAmount: 1247,
        reason: 'manual_report',
        sessionId: 'SES-1',
        occurredAt: new Date(),
      } as any),
    ).rejects.toMatchObject({
      // Service deve usar code estavel "manual_report_no_session"
      code: 'manual_report_no_session',
    });
  });

  it('mantem reason=session_result + !sessionId rejeitado (regression session_id_required)', async () => {
    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
        direction: 'in',
        nativeAmount: 100,
        reason: 'session_result',
        occurredAt: new Date(),
      } as any),
    ).rejects.toMatchObject({ code: 'session_id_required' });
  });

  it('reason=deposit + sessionId qualquer NAO quebra (sessionId ignorado)', async () => {
    // Regression: behavior existente preservado
    const result = await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'in',
      nativeAmount: 500,
      reason: 'deposit',
      sessionId: 'SES-X',
      occurredAt: new Date(),
    } as any);
    expect(result.transaction).toBeDefined();
  });

  it('manual_report calcula delta_usd_at_time via fxResolver (#6 FX-aware)', async () => {
    // RED: precisa expor usdAmount/delta_usd_at_time computado a partir de FX rate da wallet (BRL)
    const result = await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
      occurredAt: new Date(),
    } as any);
    // 1247 BRL / 5 BRL/USD = 249.4 USD
    const usdAmount = parseFloat(String(result.transaction.usdAmount ?? '0'));
    expect(usdAmount).toBeCloseTo(249.4, 1);
  });

  it('manual_report dispara createAutoSnapshot com origin=manual-report (RF-03)', async () => {
    // Mock createAutoSnapshot para verificar chamada
    const { bankrollService } = await import('../../../server/services/bankrollService');
    const spy = vi.spyOn(bankrollService, 'createAutoSnapshot').mockResolvedValue({ id: 'snap_new', origin: 'manual-report' } as any);

    const result = await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
      occurredAt: new Date(),
    } as any);

    // RED: walletService ainda nao chama createAutoSnapshot para manual_report
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'USER-0001',
      origin: 'manual-report',
    }));
    spy.mockRestore();
  });

  it('snapshot best-effort: falha de createAutoSnapshot NAO faz rollback da tx (RF-03)', async () => {
    const { bankrollService } = await import('../../../server/services/bankrollService');
    const spy = vi.spyOn(bankrollService, 'createAutoSnapshot').mockResolvedValue(null);

    const result = await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
      occurredAt: new Date(),
    } as any);

    expect(result.transaction).toBeDefined();
    expect(result.transaction.reason).toBe('manual_report');
    spy.mockRestore();
  });

  it('manual_report sourceRefId=tx.id no createAutoSnapshot', async () => {
    const { bankrollService } = await import('../../../server/services/bankrollService');
    const spy = vi.spyOn(bankrollService, 'createAutoSnapshot').mockResolvedValue({ id: 'snap_new' } as any);

    const result = await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
      occurredAt: new Date(),
    } as any);

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      sourceRefId: result.transaction.id,
    }));
    spy.mockRestore();
  });

  it('manual_report respeita optimistic concurrency lockVersion (regression ADR-038)', async () => {
    // expectedPreviousBalance=999.5 vs wallet.balance=1000 -> 0.50 diff > 0.01 cents -> 409
    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
        direction: 'in',
        nativeAmount: 100,
        reason: 'manual_report',
        expectedPreviousBalance: 999.5,
        occurredAt: new Date(),
      } as any),
    ).rejects.toMatchObject({ code: 'balance_mismatch' });
  });

  it('manual_report rejeita wallet archived (regression wallet_archived)', async () => {
    const txMock = (storage.transaction as any).getMockImplementation();
    (storage.transaction as any).mockImplementationOnce(async (fn: any) => fn({
      selectWalletForUpdate: vi.fn().mockResolvedValue({
        id: 'wlt_ps', userId: 'USER-0001', balance: '1000', status: 'archived', nativeCurrency: 'BRL',
      }),
      getLastWalletTransaction: vi.fn().mockResolvedValue(null),
      getUserSettings: vi.fn().mockResolvedValue({ exchangeRates: { BRL: 5 } }),
      createWalletTransaction: vi.fn(),
      updateWalletBalance: vi.fn(),
      insertBankrollSnapshot: vi.fn(),
      getActiveWalletsByUser: vi.fn().mockResolvedValue([]),
    }));

    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
        direction: 'in',
        nativeAmount: 100,
        reason: 'manual_report',
        occurredAt: new Date(),
      } as any),
    ).rejects.toMatchObject({ code: 'wallet_archived' });
  });

  it('manual_report direction=out (saldo reportado abaixo do anterior)', async () => {
    // Founder reporta saldo MENOR — sistema gera tx direction=out com nativeAmount=delta
    const result = await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'out',
      nativeAmount: 200,
      reason: 'manual_report',
      occurredAt: new Date(),
    } as any);
    expect(result.transaction.direction).toBe('out');
  });

  it('manual_report nativeAmount<=0 rejeita 400', async () => {
    await expect(
      walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
        direction: 'in',
        nativeAmount: 0,
        reason: 'manual_report',
        occurredAt: new Date(),
      } as any),
    ).rejects.toThrow(/maior que zero/i);
  });

  it('snapshot insert recebe origin=manual-report e source_ref_id=tx.id (RF-03 storage shape)', async () => {
    // Verifica que insertBankrollSnapshot da tx interna recebe origin correto
    let capturedSnapshot: any = null;
    (storage.transaction as any).mockImplementationOnce(async (fn: any) => fn({
      selectWalletForUpdate: vi.fn().mockResolvedValue({
        id: 'wlt_ps', userId: 'USER-0001', balance: '1000', status: 'active', nativeCurrency: 'BRL', version: 1,
      }),
      getLastWalletTransaction: vi.fn().mockResolvedValue(null),
      getUserSettings: vi.fn().mockResolvedValue({ exchangeRates: { BRL: 5 } }),
      createWalletTransaction: vi.fn().mockResolvedValue({ id: 'tx_new', reason: 'manual_report', sessionId: null }),
      updateWalletBalance: vi.fn(),
      insertBankrollSnapshot: vi.fn().mockImplementation(async (snap: any) => {
        capturedSnapshot = snap;
        return { id: 'snap_new', ...snap };
      }),
      getActiveWalletsByUser: vi.fn().mockResolvedValue([]),
    }));

    await walletService.recordWalletTransaction('USER-0001', 'wlt_ps', {
      direction: 'in',
      nativeAmount: 1247,
      reason: 'manual_report',
      occurredAt: new Date(),
    } as any);

    // RED: snapshot inline nao seta origin='manual-report' ainda
    expect(capturedSnapshot).toBeTruthy();
    expect(capturedSnapshot.origin).toBe('manual-report');
  });
});
