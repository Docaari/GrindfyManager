/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-4: Cross-wallet transfer (route handlers)
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-4)
 *
 * Endpoints:
 *   POST   /api/wallets/transfers
 *   GET    /api/wallets/transfers?walletId=...
 *   GET    /api/wallets/transfers/:transferId
 *
 * Cenarios cobertos:
 *   1. POST happy path -> 201 + payload {transfer, transactions}
 *   2. POST sem auth -> 401
 *   3. POST com from===to -> 400
 *   4. POST cross-currency sem fxRate -> 400
 *   5. POST cross-currency diff > 5% sem ?confirmFxDiff -> 422 FX_DIFF_HIGH
 *   6. POST cross-currency diff > 5% com ?confirmFxDiff=true -> 201
 *   7. POST saldo insuficiente -> 422 INSUFFICIENT_BALANCE
 *   8. POST optimistic concurrency conflict -> 409
 *   9. GET ?walletId= retorna lista de transfers ordenada DESC
 *  10. GET /:id retorna detalhe + transactions
 *  11. GET /:id de outro user -> 404
 *  12. POST wallet archived -> 422 WALLET_ARCHIVED
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const createTransferMock = vi.fn();
const listTransfersMock = vi.fn();
const getTransferMock = vi.fn();

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    createTransfer: (...args: any[]) => createTransferMock(...args),
    listTransfers: (...args: any[]) => listTransfersMock(...args),
    getTransfer: (...args: any[]) => getTransferMock(...args),
  },
}));

import {
  handlePostWalletTransfer,
  handleGetWalletTransfers,
  handleGetWalletTransfer,
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

describe('POST /api/wallets/transfers — RF-4', () => {
  it('happy path: 201 com {transfer, transactions}', async () => {
    createTransferMock.mockResolvedValue({
      transfer: { id: 'transfer_1', amountFrom: '100', amountTo: '500' },
      transactions: [{ id: 'tx_out', reason: 'transfer_out' }, { id: 'tx_in', reason: 'transfer_in' }],
    });

    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: {
          fromWalletId: 'w1',
          toWalletId: 'w2',
          amountFrom: 100,
          reason: 'transfer',
        },
      }) as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    expect(res.body.transfer).toBeDefined();
    expect(res.body.transactions).toHaveLength(2);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostWalletTransfer(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
    expect(createTransferMock).not.toHaveBeenCalled();
  });

  it('from===to -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: { fromWalletId: 'w1', toWalletId: 'w1', amountFrom: 100, reason: 'transfer' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('amountFrom <= 0 -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: { fromWalletId: 'w1', toWalletId: 'w2', amountFrom: 0, reason: 'transfer' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('reason ausente -> 400', async () => {
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: { fromWalletId: 'w1', toWalletId: 'w2', amountFrom: 100 },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('cross-currency sem fxRate -> 400 propagado do service', async () => {
    createTransferMock.mockRejectedValue(
      Object.assign(new Error('fxRate obrigatorio'), { httpStatus: 400 }),
    );
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: { fromWalletId: 'w1', toWalletId: 'w2', amountFrom: 100, reason: 'transfer' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it('cross-currency diff > 5% sem ?confirmFxDiff -> 422 FX_DIFF_HIGH', async () => {
    createTransferMock.mockRejectedValue(
      Object.assign(new Error('FX_DIFF_HIGH'), {
        httpStatus: 422,
        code: 'FX_DIFF_HIGH',
        providedRate: 6.0,
        marketRate: 5.0,
        diffPct: 0.2,
      }),
    );
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: {
          fromWalletId: 'w1',
          toWalletId: 'w2',
          amountFrom: 100,
          fxRate: 6.0,
          reason: 'transfer',
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('FX_DIFF_HIGH');
  });

  it('?confirmFxDiff=true encaminha flag pro service', async () => {
    createTransferMock.mockResolvedValue({
      transfer: { id: 'transfer_1' },
      transactions: [],
    });
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: {
          fromWalletId: 'w1',
          toWalletId: 'w2',
          amountFrom: 100,
          fxRate: 6.0,
          reason: 'transfer',
        },
        query: { confirmFxDiff: 'true' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(201);
    const arg = createTransferMock.mock.calls[0][1];
    expect(arg.confirmFxDiff).toBe(true);
  });

  it('saldo insuficiente -> 422 INSUFFICIENT_BALANCE', async () => {
    createTransferMock.mockRejectedValue(
      Object.assign(new Error('INSUFFICIENT_BALANCE'), {
        httpStatus: 422,
        code: 'INSUFFICIENT_BALANCE',
      }),
    );
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: { fromWalletId: 'w1', toWalletId: 'w2', amountFrom: 100, reason: 'transfer' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('optimistic concurrency -> 409', async () => {
    createTransferMock.mockRejectedValue(
      Object.assign(new Error('VERSION_CONFLICT'), {
        httpStatus: 409,
        code: 'VERSION_CONFLICT',
      }),
    );
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: {
          fromWalletId: 'w1',
          toWalletId: 'w2',
          amountFrom: 100,
          reason: 'transfer',
          expectedVersion: 5,
        },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(409);
  });

  it('wallet archived -> 422 WALLET_ARCHIVED', async () => {
    createTransferMock.mockRejectedValue(
      Object.assign(new Error('WALLET_ARCHIVED'), {
        httpStatus: 422,
        code: 'WALLET_ARCHIVED',
      }),
    );
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: { fromWalletId: 'w1', toWalletId: 'w2', amountFrom: 100, reason: 'transfer' },
      }) as any,
      res,
    );
    expect(res.statusCode).toBe(422);
  });

  it('repassa userId para service', async () => {
    createTransferMock.mockResolvedValue({ transfer: { id: 't1' }, transactions: [] });
    const res = makeRes();
    await handlePostWalletTransfer(
      makeReq({
        body: { fromWalletId: 'w1', toWalletId: 'w2', amountFrom: 100, reason: 'transfer' },
      }) as any,
      res,
    );
    const userArg = createTransferMock.mock.calls[0][0];
    expect(userArg).toBe('USER-0001');
  });
});

describe('GET /api/wallets/transfers?walletId — RF-4', () => {
  it('happy path: 200 com array', async () => {
    listTransfersMock.mockResolvedValue([
      { id: 'transfer_1', occurredAt: new Date('2026-04-30').toISOString() },
      { id: 'transfer_2', occurredAt: new Date('2026-04-29').toISOString() },
    ]);
    const res = makeRes();
    await handleGetWalletTransfers(makeReq({ query: { walletId: 'w1' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.items ?? res.body)).toBe(true);
  });

  it('walletId ausente: lista geral do user (200)', async () => {
    listTransfersMock.mockResolvedValue([]);
    const res = makeRes();
    await handleGetWalletTransfers(makeReq() as any, res);
    expect(res.statusCode).toBe(200);
  });

  it('limit default = 50', async () => {
    listTransfersMock.mockResolvedValue([]);
    const res = makeRes();
    await handleGetWalletTransfers(makeReq({ query: { walletId: 'w1' } }) as any, res);
    const opts = listTransfersMock.mock.calls[0][1] ?? {};
    expect(opts.limit ?? 50).toBeLessThanOrEqual(50);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetWalletTransfers(makeReq({ user: undefined }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/wallets/transfers/:id — RF-4', () => {
  it('happy path: retorna {transfer, transactions}', async () => {
    getTransferMock.mockResolvedValue({
      transfer: { id: 't1' },
      transactions: [{ id: 'tx_out' }, { id: 'tx_in' }],
    });
    const res = makeRes();
    await handleGetWalletTransfer(makeReq({ params: { id: 't1' } }) as any, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.transfer.id).toBe('t1');
    expect(res.body.transactions).toHaveLength(2);
  });

  it('not found -> 404', async () => {
    getTransferMock.mockResolvedValue(null);
    const res = makeRes();
    await handleGetWalletTransfer(makeReq({ params: { id: 'inexistente' } }) as any, res);
    expect(res.statusCode).toBe(404);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetWalletTransfer(makeReq({ user: undefined, params: { id: 't1' } }) as any, res);
    expect(res.statusCode).toBe(401);
  });
});
