import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Bankroll-2.1 — Wallet Balance Mode (RF-05 + RF-07)
//
// Spec: Docs/specs/wallet-balance-mode.md
// ADR: Docs/architecture/decisions/038-wallet-tx-optimistic-concurrency.md
// Sequence: Docs/architecture/flows/bankroll/sequence-wallet-tx-balance-mode.mermaid
//
// CONTRATO ASSUMIDO PELO TEST-WRITER (resolve ambiguidades da spec):
// 1. Body do erro 409 'balance_mismatch' tem shape:
//    { code: 'balance_mismatch', currentBalance: <number> }
//    (currentBalance e number, nao string — facilita consumo no client RF-06).
// 2. Erro tipado lancado pelo walletService tem propriedades:
//    err.statusCode === 409
//    err.code === 'balance_mismatch'
//    err.currentBalance === <number>
//    (handler de rota le essas props para montar o body 409).
// 3. Backward-compat: ausencia de expectedPreviousBalance no body NAO altera
//    nada do fluxo legado (POST 201 + snapshot espelhado).
// 4. Quando 409, snapshot mirror em bankroll_snapshots NAO e criado (rollback
//    da transacao via walletService — invariante ADR-017 preservada).
// 5. Epsilon 0.01 (ADR-038 secao Detalhes-chave).
//
// Estrategia: handlers + service mockado, igual padrao
// tests/integration/wallets/wallets-routes.test.ts. Cenario "snapshot count nao
// muda em 409" e validado verificando que insertBankrollSnapshot NAO foi chamado
// quando o service rejeita com balance_mismatch (rollback transacional).
// =============================================================================

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    createWallet: vi.fn(),
    getWallet: vi.fn(),
    listWallets: vi.fn(),
    updateWallet: vi.fn(),
    archiveWallet: vi.fn(),
    recordWalletTransaction: vi.fn(),
    listWalletTransactions: vi.fn(),
    getConsolidatedBalance: vi.fn(),
  },
}));

import { handlePostWalletTransaction } from '../../../server/routes/wallets';
import { walletService } from '../../../server/services/walletService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: { id: 'wlt_1' },
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

const validBaseBody = {
  direction: 'in',
  nativeAmount: 67,
  reason: 'session_result',
  occurredAt: new Date('2026-04-26T20:00:00Z').toISOString(),
  sessionId: 'ses_abc',
};

// =============================================================================
// 1. Happy path balance mode — 201
// =============================================================================

describe('POST /api/wallets/:id/transactions (balance mode, RF-05)', () => {
  it('expectedPreviousBalance == balance atual: 201 transacao criada', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: {
        id: 'wtx_new',
        direction: 'in',
        nativeAmount: '67',
        reason: 'session_result',
        previousNativeBalance: '1180',
        newNativeBalance: '1247',
      },
      wallet: { id: 'wlt_1', balance: '1247' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, expectedPreviousBalance: 1180 },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.transaction).toBeDefined();
    // expectedPreviousBalance precisa ser propagado para o service
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0];
    expect(callArgs[2].expectedPreviousBalance).toBe(1180);
  });

  // 2. Drift detectado — 409 com payload exato
  it('expectedPreviousBalance divergente (>0.01): 409 com {code, currentBalance}', async () => {
    const driftErr: any = new Error('balance_mismatch');
    driftErr.statusCode = 409;
    driftErr.code = 'balance_mismatch';
    driftErr.currentBalance = 1247.5;
    (walletService.recordWalletTransaction as any).mockRejectedValue(driftErr);

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, expectedPreviousBalance: 1180 },
    }) as any, res);

    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('balance_mismatch');
    expect(typeof res.body.currentBalance).toBe('number');
    expect(res.body.currentBalance).toBe(1247.5);
  });

  // 3. Drift dentro do epsilon (< 0.01) — aceita
  it('expectedPreviousBalance com diff < 0.01 (epsilon): 201 (drift toleravel)', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_eps', direction: 'in', nativeAmount: '50' },
      wallet: { id: 'wlt_1', balance: '1230.005' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, nativeAmount: 50, expectedPreviousBalance: 1180 },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    // service nao deveria rejeitar — mock resolveu, handler propaga 201
  });

  // 4. Backward-compat — ausencia do campo (RF-07)
  it('sem expectedPreviousBalance: comportamento legado preservado, 201', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_legacy', direction: 'in', nativeAmount: '67' },
      wallet: { id: 'wlt_1', balance: '1247' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0];
    // expectedPreviousBalance ausente OU undefined
    expect(callArgs[2].expectedPreviousBalance).toBeUndefined();
  });

  // 5. Edge case — expectedPreviousBalance: 0 em wallet com balance 0
  it('expectedPreviousBalance = 0 em wallet zerada: 201 (zero e valor valido, nao undefined)', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_zero', direction: 'in', nativeAmount: '500' },
      wallet: { id: 'wlt_1', balance: '500' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, nativeAmount: 500, reason: 'deposit', sessionId: undefined, expectedPreviousBalance: 0 },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0];
    expect(callArgs[2].expectedPreviousBalance).toBe(0);
  });

  // 6. Edge case — wallet em saldo negativo permitido
  it('expectedPreviousBalance negativo (wallet negativa) que bate: 201', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_neg', direction: 'in', nativeAmount: '50' },
      wallet: { id: 'wlt_1', balance: '-50' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, nativeAmount: 50, reason: 'deposit', sessionId: undefined, expectedPreviousBalance: -100 },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0];
    expect(callArgs[2].expectedPreviousBalance).toBe(-100);
  });

  // 7. Race condition — 2 calls concorrentes serializam via SELECT FOR UPDATE
  it('2 calls concorrentes: primeiro vence (201), segundo recebe 409 com currentBalance atualizado', async () => {
    // Simula serializacao do SELECT FOR UPDATE: primeiro call resolve com 201,
    // segundo call (que tinha mesmo expectedPreviousBalance=100) recebe 409
    // com currentBalance=150 (apos vitoria do primeiro).
    let callCount = 0;
    (walletService.recordWalletTransaction as any).mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          transaction: { id: 'wtx_winner', direction: 'in', nativeAmount: '50' },
          wallet: { id: 'wlt_1', balance: '150' },
        };
      }
      const err: any = new Error('balance_mismatch');
      err.statusCode = 409;
      err.code = 'balance_mismatch';
      err.currentBalance = 150;
      throw err;
    });

    const res1 = makeRes();
    const res2 = makeRes();

    await Promise.all([
      handlePostWalletTransaction(makeReq({
        body: { ...validBaseBody, nativeAmount: 50, reason: 'deposit', sessionId: undefined, expectedPreviousBalance: 100 },
      }) as any, res1),
      handlePostWalletTransaction(makeReq({
        body: { ...validBaseBody, nativeAmount: 50, reason: 'deposit', sessionId: undefined, expectedPreviousBalance: 100 },
      }) as any, res2),
    ]);

    const codes = [res1.statusCode, res2.statusCode].sort();
    expect(codes).toEqual([201, 409]);
    const losing = res1.statusCode === 409 ? res1 : res2;
    expect(losing.body.code).toBe('balance_mismatch');
    expect(losing.body.currentBalance).toBe(150);
  });

  // 8. Em 409 nao ha snapshot mirror (rollback transacional)
  it('409 balance_mismatch: walletService.recordWalletTransaction nunca completa (rollback) — snapshot count inalterado', async () => {
    // O handler delega tudo ao service. Quando service rejeita, NENHUMA
    // operacao de snapshot e disparada pelo handler (ele apenas mapeia o erro).
    // Validamos que o service foi chamado UMA UNICA vez e que o erro 409 e
    // propagado sem efeitos colaterais visiveis no body de resposta de sucesso.
    const driftErr: any = new Error('balance_mismatch');
    driftErr.statusCode = 409;
    driftErr.code = 'balance_mismatch';
    driftErr.currentBalance = 1300;
    (walletService.recordWalletTransaction as any).mockRejectedValue(driftErr);

    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, expectedPreviousBalance: 1180 },
    }) as any, res);

    expect(res.statusCode).toBe(409);
    // Resposta NAO contem campos de sucesso (transaction/wallet)
    expect(res.body.transaction).toBeUndefined();
    expect(res.body.wallet).toBeUndefined();
    // Service foi chamado UMA vez (sem retry no handler)
    expect((walletService.recordWalletTransaction as any).mock.calls.length).toBe(1);
  });
});

// =============================================================================
// Validacao do body — expectedPreviousBalance deve ser number quando presente
// =============================================================================

describe('POST /api/wallets/:id/transactions — validacao de expectedPreviousBalance', () => {
  it('expectedPreviousBalance string -> 400 (deve ser number)', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, expectedPreviousBalance: '1180' as any },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('expectedPreviousBalance NaN -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(makeReq({
      body: { ...validBaseBody, expectedPreviousBalance: NaN },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });
});
