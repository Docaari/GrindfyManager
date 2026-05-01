/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-5: Pending transactions (route handlers)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-5)
 *
 * Endpoints:
 *   POST   /api/wallets/:walletId/pending
 *   GET    /api/wallets/:walletId/pending
 *   DELETE /api/wallets/pending/:id
 *   POST   /api/wallets/pending/:id/settle
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createPendingMock = vi.fn();
const listPendingMock = vi.fn();
const cancelPendingMock = vi.fn();
const settlePendingMock = vi.fn();

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    createPending: (...args: any[]) => createPendingMock(...args),
    listPending: (...args: any[]) => listPendingMock(...args),
    cancelPending: (...args: any[]) => cancelPendingMock(...args),
    settlePending: (...args: any[]) => settlePendingMock(...args),
  },
}));

import {
  handlePostWalletPending,
  handleGetWalletPending,
  handleDeleteWalletPending,
  handlePostWalletPendingSettle,
} from '../../../server/routes/wallets';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
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

describe('POST /api/wallets/:walletId/pending', () => {
  it('happy path: 201 com pending criado', async () => {
    createPendingMock.mockResolvedValue({
      id: 'p1',
      walletId: 'w1',
      status: 'pending',
      direction: 'deposit_pending',
    });
    const res = makeRes();
    await handlePostWalletPending(
      makeReq({
        params: { walletId: 'w1' },
        body: {
          direction: 'deposit_pending',
          nativeAmount: 100,
          nativeCurrency: 'USD',
          reason: 'deposit',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe('p1');
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostWalletPending(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });

  it('direction invalida -> 400', async () => {
    const res = makeRes();
    await handlePostWalletPending(
      makeReq({
        params: { walletId: 'w1' },
        body: { direction: 'lixo', nativeAmount: 100, nativeCurrency: 'USD', reason: 'deposit' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('cap 10 atingido -> 422', async () => {
    createPendingMock.mockRejectedValue(
      Object.assign(new Error('PENDING_CAP_REACHED'), {
        httpStatus: 422,
        code: 'PENDING_CAP_REACHED',
      }),
    );
    const res = makeRes();
    await handlePostWalletPending(
      makeReq({
        params: { walletId: 'w1' },
        body: {
          direction: 'deposit_pending',
          nativeAmount: 100,
          nativeCurrency: 'USD',
          reason: 'deposit',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
  });
});

describe('GET /api/wallets/:walletId/pending', () => {
  it('default lista status=pending', async () => {
    listPendingMock.mockResolvedValue([{ id: 'p1', status: 'pending' }]);
    const res = makeRes();
    await handleGetWalletPending(makeReq({ params: { walletId: 'w1' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items ?? res.body)).toBe(true);
  });

  it('?includeAll=true passa para service', async () => {
    listPendingMock.mockResolvedValue([]);
    const res = makeRes();
    await handleGetWalletPending(
      makeReq({ params: { walletId: 'w1' }, query: { includeAll: 'true' } }) as any,
      res,
    );
    const opts = listPendingMock.mock.calls[0][2] ?? listPendingMock.mock.calls[0][1];
    expect(opts.includeAll).toBe(true);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetWalletPending(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE /api/wallets/pending/:id', () => {
  it('happy path: 200 com status=cancelled', async () => {
    cancelPendingMock.mockResolvedValue({ id: 'p1', status: 'cancelled' });
    const res = makeRes();
    await handleDeleteWalletPending(makeReq({ params: { id: 'p1' } }) as any, res);
    expect(res.statusCode).toBe(200);
  });

  it('not found -> 404', async () => {
    cancelPendingMock.mockRejectedValue(
      Object.assign(new Error('not found'), { httpStatus: 404 }),
    );
    const res = makeRes();
    await handleDeleteWalletPending(makeReq({ params: { id: 'inexist' } }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleDeleteWalletPending(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/wallets/pending/:id/settle', () => {
  it('happy path: 200 com {transaction, pending}', async () => {
    settlePendingMock.mockResolvedValue({
      transaction: { id: 'tx_new', reason: 'deposit' },
      pending: { id: 'p1', status: 'cleared' },
    });
    const res = makeRes();
    await handlePostWalletPendingSettle(
      makeReq({ params: { id: 'p1' }, body: {} }) as any,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.transaction).toBeDefined();
    expect(res.body.pending.status).toBe('cleared');
  });

  it('settle de pending ja cleared -> 409', async () => {
    settlePendingMock.mockRejectedValue(
      Object.assign(new Error('PENDING_ALREADY_CLEARED'), { httpStatus: 409 }),
    );
    const res = makeRes();
    await handlePostWalletPendingSettle(
      makeReq({ params: { id: 'p1' }, body: {} }) as any,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('not found -> 404', async () => {
    settlePendingMock.mockRejectedValue(
      Object.assign(new Error('not found'), { httpStatus: 404 }),
    );
    const res = makeRes();
    await handlePostWalletPendingSettle(
      makeReq({ params: { id: 'inexist' }, body: {} }) as any,
      res,
    );
    expect(res.statusCode).toBe(404);
  });

  it('saldo insuficiente -> 422', async () => {
    settlePendingMock.mockRejectedValue(
      Object.assign(new Error('INSUFFICIENT_BALANCE'), {
        httpStatus: 422,
        code: 'INSUFFICIENT_BALANCE',
      }),
    );
    const res = makeRes();
    await handlePostWalletPendingSettle(
      makeReq({ params: { id: 'p1' }, body: {} }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostWalletPendingSettle(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('Validacao Zod insertWalletPendingSchema', () => {
  it('aceita payload minimo', async () => {
    const mod: any = await import('../../../shared/schema');
    const result = mod.insertWalletPendingSchema.safeParse({
      walletId: 'w1',
      direction: 'deposit_pending',
      nativeAmount: 100,
      nativeCurrency: 'USD',
      reason: 'deposit',
    });
    expect(result.success).toBe(true);
  });

  it('PENDING_DIRECTIONS exporta os 2 valores', async () => {
    const mod: any = await import('../../../shared/schema');
    const directions = mod.PENDING_DIRECTIONS as readonly string[];
    expect(directions).toContain('deposit_pending');
    expect(directions).toContain('withdrawal_pending');
  });

  it('rejeita direction fora do enum', async () => {
    const mod: any = await import('../../../shared/schema');
    const result = mod.insertWalletPendingSchema.safeParse({
      walletId: 'w1',
      direction: 'lixo',
      nativeAmount: 100,
      nativeCurrency: 'USD',
      reason: 'deposit',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita nativeAmount <= 0', async () => {
    const mod: any = await import('../../../shared/schema');
    const result = mod.insertWalletPendingSchema.safeParse({
      walletId: 'w1',
      direction: 'deposit_pending',
      nativeAmount: 0,
      nativeCurrency: 'USD',
      reason: 'deposit',
    });
    expect(result.success).toBe(false);
  });
});
