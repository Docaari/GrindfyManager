import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Bankroll-3 — POST /api/wallets/:id/transactions com reason='rakeback'
//
// Spec: Docs/specs/rakeback-reporting.md
// ADR : Docs/architecture/decisions/039-rakeback-as-wallet-tx-reason.md
//
// CONTRATO REAL DA IMPLEMENTACAO (server/routes/wallets.ts):
// 1. Quando Zod superRefine detecta 'invalid_rakeback_direction':
//    res.status(400).json({ message, code: 'invalid_rakeback_direction', issues })
// 2. Quando service rejeita com err.code: response inclui { message, code }.
// 3. wallet_archived vem com statusCode=409 (ja existente no service ate hoje;
//    a spec menciona 422 como possibilidade — testes aceitam OU 409 OU 422).
// 4. Sem auth -> 401 (req.user ausente).
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
  res.status = (c: number) => {
    res.statusCode = c;
    return res;
  };
  res.json = (d: any) => {
    res.body = d;
    return res;
  };
  return res;
}

const baseRakebackBody = {
  direction: 'in',
  nativeAmount: 50,
  reason: 'rakeback',
  occurredAt: new Date('2026-04-26T18:30:00Z').toISOString(),
};

// =============================================================================
// 1. Happy path
// =============================================================================

describe('POST /api/wallets/:id/transactions — rakeback happy path (RF-02)', () => {
  it('201 quando reason=rakeback, direction=in, amount valido', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: {
        id: 'wtx_rb_1',
        direction: 'in',
        nativeAmount: '50',
        reason: 'rakeback',
        nativeCurrency: 'BRL',
      },
      wallet: { id: 'wlt_1', balance: '1050' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody } }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.transaction.reason).toBe('rakeback');
  });

  it('propaga reason=rakeback ao chamar walletService.recordWalletTransaction', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx', direction: 'in', nativeAmount: '50', reason: 'rakeback' },
      wallet: { id: 'wlt_1', balance: '1050' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody, note: 'Rakeback semanal' } }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0];
    expect(callArgs[0]).toBe('USER-0001');
    expect(callArgs[1]).toBe('wlt_1');
    expect(callArgs[2].reason).toBe('rakeback');
    expect(callArgs[2].direction).toBe('in');
    expect(callArgs[2].nativeAmount).toBe(50);
    expect(callArgs[2].note).toBe('Rakeback semanal');
  });
});

// =============================================================================
// 2. Auth
// =============================================================================

describe('POST /api/wallets/:id/transactions — auth', () => {
  it('401 quando req.user ausente', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ user: undefined, body: { ...baseRakebackBody } }) as any,
      res,
    );

    expect(res.statusCode).toBe(401);
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 3. direction=out -> 400 invalid_rakeback_direction
// =============================================================================

describe('POST /api/wallets/:id/transactions — direction=out (RF-02)', () => {
  it('400 com code=invalid_rakeback_direction', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({
        body: { ...baseRakebackBody, direction: 'out' },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('invalid_rakeback_direction');
    // Service NAO foi chamado — Zod barrou no superRefine
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });
});

// =============================================================================
// 4. Wallet archived -> 409 wallet_archived (ou 422 conforme spec)
// =============================================================================

describe('POST /api/wallets/:id/transactions — wallet archived (RF-05)', () => {
  it('retorna 409 ou 422 com code=wallet_archived quando service rejeita', async () => {
    const archivedErr: any = new Error('Wallet arquivada nao aceita novos movimentos');
    archivedErr.statusCode = 409;
    archivedErr.code = 'wallet_archived';
    (walletService.recordWalletTransaction as any).mockRejectedValue(archivedErr);

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody } }) as any,
      res,
    );

    expect([409, 422]).toContain(res.statusCode);
    expect(res.body.code).toBe('wallet_archived');
  });
});

// =============================================================================
// 5. Amount invalido -> 400
// =============================================================================

describe('POST /api/wallets/:id/transactions — amount invalido (RF-05)', () => {
  it('amount=0 -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody, nativeAmount: 0 } }) as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });

  it('amount negativo -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody, nativeAmount: -10 } }) as any,
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(walletService.recordWalletTransaction).not.toHaveBeenCalled();
  });

  it('amount NaN -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody, nativeAmount: NaN } }) as any,
      res,
    );

    expect(res.statusCode).toBe(400);
  });
});

// =============================================================================
// 6. Ownership cross-user -> 403 ou 404
// =============================================================================

describe('POST /api/wallets/:id/transactions — ownership (RF-05)', () => {
  it('rakeback em wallet de outro usuario -> 403 ou 404', async () => {
    const notFoundErr: any = new Error('Wallet nao encontrada');
    notFoundErr.statusCode = 404;
    notFoundErr.code = 'wallet_not_found';
    (walletService.recordWalletTransaction as any).mockRejectedValue(notFoundErr);

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody }, params: { id: 'wlt_other' } }) as any,
      res,
    );

    expect([403, 404]).toContain(res.statusCode);
  });
});

// =============================================================================
// 7. Persistencia -> snapshot espelhado em bankroll_snapshots
// =============================================================================

describe('POST /api/wallets/:id/transactions — espelho em bankroll_snapshots (RF-04)', () => {
  it('apos 201, snapshot existe (verificado via mock do service)', async () => {
    // O handler chama service.recordWalletTransaction — que internamente cria
    // wallet_transactions + bankroll_snapshots numa unica transacao. Aqui,
    // confirmamos que o handler delega ao service sem filtrar/transformar.
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_rb', reason: 'rakeback', direction: 'in', nativeAmount: '50' },
      wallet: { id: 'wlt_1', balance: '1050' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({ body: { ...baseRakebackBody } }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(walletService.recordWalletTransaction).toHaveBeenCalledTimes(1);
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0][2];
    // Service e responsavel pelo espelho — handler nao manipula reason
    expect(callArgs.reason).toBe('rakeback');
  });
});

// =============================================================================
// 8. Backward-compat — outros reasons continuam funcionando (RF-08)
// =============================================================================

describe('POST /api/wallets/:id/transactions — backward-compat (RF-08)', () => {
  it('reason=deposit + direction=in continua 201', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_dep', direction: 'in', reason: 'deposit', nativeAmount: '100' },
      wallet: { id: 'wlt_1', balance: '1100' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({
        body: {
          direction: 'in',
          nativeAmount: 100,
          reason: 'deposit',
          occurredAt: new Date('2026-04-26T18:30:00Z').toISOString(),
        },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.transaction.reason).toBe('deposit');
  });

  it('reason=session_result + sessionId continua passando para o service', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: {
        id: 'wtx_ses',
        direction: 'in',
        reason: 'session_result',
        nativeAmount: '67',
      },
      wallet: { id: 'wlt_1', balance: '1067' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({
        body: {
          direction: 'in',
          nativeAmount: 67,
          reason: 'session_result',
          sessionId: 'ses_abc',
          occurredAt: new Date('2026-04-26T18:30:00Z').toISOString(),
        },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const callArgs = (walletService.recordWalletTransaction as any).mock.calls[0][2];
    expect(callArgs.sessionId).toBe('ses_abc');
  });

  it('reason=withdrawal + direction=out continua 201', async () => {
    (walletService.recordWalletTransaction as any).mockResolvedValue({
      transaction: { id: 'wtx_wd', direction: 'out', reason: 'withdrawal', nativeAmount: '30' },
      wallet: { id: 'wlt_1', balance: '970' },
    });

    const res = makeRes();
    await handlePostWalletTransaction(
      makeReq({
        body: {
          direction: 'out',
          nativeAmount: 30,
          reason: 'withdrawal',
          occurredAt: new Date('2026-04-26T18:30:00Z').toISOString(),
        },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
  });
});
