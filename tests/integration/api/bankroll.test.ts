import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): rotas HTTP /api/bankroll
//
// Fonte: docs/specs/bankroll-management.md (RF-01, RF-02, RF-03, RF-04)
//        docs/architecture/flows/bankroll/sequence-configure.md
//        docs/architecture/bankroll-index.md (endpoints + rate limit 10/min)
//
// Convencao do projeto (seguindo tournament-selector.test.ts): testamos handlers
// isoladamente, mockando dependencias. Rate limiting e testado em arquivo
// dedicado se necessario; auth e delegado ao middleware existente (requireAuth).
// =============================================================================

vi.mock('../../../server/services/bankrollService', () => ({
  bankrollService: {
    getBankrollState: vi.fn(),
    updateBankroll: vi.fn(),
    recordSnapshot: vi.fn(),
    getBankrollHistory: vi.fn(),
  },
}));

import {
  handleGetBankroll,
  handlePutBankroll,
  handlePostBankrollSnapshot,
  handleGetBankrollHistory,
} from '../../../server/routes/bankroll';
import { bankrollService } from '../../../server/services/bankrollService';

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
  const res: any = {
    statusCode: 200,
    body: null,
  };
  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data: any) => {
    res.body = data;
    return res;
  };
  return res;
}

// ===========================================================================
// GET /api/bankroll (RF-01)
// ===========================================================================

describe('GET /api/bankroll', () => {
  it('happy path: retorna shape do RF-01 para usuario configurado', async () => {
    (bankrollService.getBankrollState as any).mockResolvedValue({
      configured: true,
      amount: 1000,
      currency: 'USD',
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      maxBuyInUSD: 15,
      maxBuyInDisplay: { USD: 15, BRL: 78 },
      lastUpdatedAt: '2026-04-24T18:00:00-03:00',
      snapshotCount: 37,
    });

    const res = makeRes();
    await handleGetBankroll(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(res.body.maxBuyInUSD).toBe(15);
    expect(res.body.tolerance).toBe(1.5);
  });

  it('usuario nao configurado: configured=false e campos null', async () => {
    (bankrollService.getBankrollState as any).mockResolvedValue({
      configured: false,
      amount: null,
      rule: '1pct',
      maxBuyInUSD: null,
      lastUpdatedAt: null,
      snapshotCount: 0,
    });

    const res = makeRes();
    await handleGetBankroll(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.configured).toBe(false);
    expect(res.body.amount).toBeNull();
    expect(res.body.maxBuyInUSD).toBeNull();
  });

  it('sem auth (req.user ausente) -> 401', async () => {
    const res = makeRes();
    await handleGetBankroll(makeReq({ user: undefined }) as any, res);

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// PUT /api/bankroll (RF-02)
// ===========================================================================

describe('PUT /api/bankroll', () => {
  it('primeira configuracao: amount=1000 rule=1pct reason=initial -> 200', async () => {
    (bankrollService.updateBankroll as any).mockResolvedValue({
      configured: true, amount: 1000, rule: '1pct', rulePct: 1.0, tolerance: 1.5, maxBuyInUSD: 15,
      snapshotCount: 1, lastUpdatedAt: '2026-04-24T18:00:00-03:00',
    });

    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { amount: 1000, rule: '1pct', reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.configured).toBe(true);
    expect(bankrollService.updateBankroll).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ amount: 1000, rule: '1pct', reason: 'initial' })
    );
  });

  it('muda apenas rule (amount nao enviado) -> sem reason necessario', async () => {
    (bankrollService.updateBankroll as any).mockResolvedValue({
      configured: true, amount: 1000, rule: '2pct', rulePct: 2.0, tolerance: 1.5, maxBuyInUSD: 30,
      snapshotCount: 1, lastUpdatedAt: new Date().toISOString(),
    });

    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { rule: '2pct' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
  });

  it('amount negativo -> 400', async () => {
    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { amount: -100, rule: '1pct', reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('rule invalida ("invalid") -> 400', async () => {
    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { amount: 1000, rule: 'invalid', reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('rule "custom:0.05" (abaixo do min) -> 400', async () => {
    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { amount: 1000, rule: 'custom:0.05', reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/0\.1.*20/i);
  });

  it('rule "custom:25" (acima do max) -> 400', async () => {
    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { amount: 1000, rule: 'custom:25', reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('rule "custom:3.55" (2 casas decimais - Q2) -> 400', async () => {
    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { amount: 1000, rule: 'custom:3.55', reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('usuario ja configurado muda amount sem reason -> 400', async () => {
    (bankrollService.updateBankroll as any).mockRejectedValue(
      Object.assign(new Error('reason obrigatorio quando amount muda'), { statusCode: 400 })
    );

    const res = makeRes();
    await handlePutBankroll(makeReq({
      body: { amount: 1500, rule: '1pct' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/reason/i);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePutBankroll(makeReq({
      user: undefined,
      body: { amount: 1000, rule: '1pct', reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// POST /api/bankroll/snapshot (RF-03)
// ===========================================================================

describe('POST /api/bankroll/snapshot', () => {
  it('aporte valido -> 201', async () => {
    (bankrollService.recordSnapshot as any).mockResolvedValue({
      snapshot: {
        id: 'snap-1', delta: 500, previousAmount: 1000, newAmount: 1500,
        reason: 'deposit', note: 'PIX', source: 'manual',
      },
      bankroll: { configured: true, amount: 1500, rule: '1pct', rulePct: 1.0, tolerance: 1.5, maxBuyInUSD: 22.5, snapshotCount: 2 },
    });

    const res = makeRes();
    await handlePostBankrollSnapshot(makeReq({
      body: { delta: 500, reason: 'deposit', note: 'PIX' },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.snapshot).toBeDefined();
    expect(res.body.bankroll.amount).toBe(1500);
  });

  it('delta=0 -> 400', async () => {
    const res = makeRes();
    await handlePostBankrollSnapshot(makeReq({
      body: { delta: 0, reason: 'deposit' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('occurredAt no futuro -> 400', async () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const res = makeRes();
    await handlePostBankrollSnapshot(makeReq({
      body: { delta: 500, reason: 'deposit', occurredAt: futureDate },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('reason="initial" nao e permitido em POST snapshot (apenas em PUT) -> 400', async () => {
    const res = makeRes();
    await handlePostBankrollSnapshot(makeReq({
      body: { delta: 500, reason: 'initial' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('banca nao configurada -> 409', async () => {
    (bankrollService.recordSnapshot as any).mockRejectedValue(
      Object.assign(new Error('Configure a banca antes de registrar movimentos'), { statusCode: 409 })
    );

    const res = makeRes();
    await handlePostBankrollSnapshot(makeReq({
      body: { delta: 500, reason: 'deposit' },
    }) as any, res);

    expect(res.statusCode).toBe(409);
  });

  it('banca vira negativa -> 201 com warning="bankroll_negative"', async () => {
    (bankrollService.recordSnapshot as any).mockResolvedValue({
      snapshot: { id: 'snap', delta: -300, previousAmount: 100, newAmount: -200, reason: 'withdrawal', source: 'manual' },
      bankroll: { configured: true, amount: -200, rule: '1pct', rulePct: 1.0, tolerance: 1.5, maxBuyInUSD: -3, snapshotCount: 5 },
      warning: 'bankroll_negative',
    });

    const res = makeRes();
    await handlePostBankrollSnapshot(makeReq({
      body: { delta: -300, reason: 'withdrawal' },
    }) as any, res);

    expect(res.statusCode).toBe(201);
    expect(res.body.warning).toBe('bankroll_negative');
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handlePostBankrollSnapshot(makeReq({
      user: undefined,
      body: { delta: 500, reason: 'deposit' },
    }) as any, res);

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// GET /api/bankroll/history (RF-04)
// ===========================================================================

describe('GET /api/bankroll/history', () => {
  it('happy path: retorna snapshots + series + summary', async () => {
    (bankrollService.getBankrollHistory as any).mockResolvedValue({
      snapshots: [
        { id: 's1', occurredAt: '2026-04-24', delta: 500, previousAmount: 1000, newAmount: 1500, reason: 'deposit', source: 'manual' },
      ],
      series: [{ bucket: '2026-04-24', balance: 1500, movements: 1, delta: 500 }],
      summary: {
        totalDeposits: 500, totalWithdrawals: 0, totalSessionPnL: 0, totalManualAdjustments: 0,
        netChange: 500, startBalance: 1000, endBalance: 1500,
      },
      pagination: { total: 1, limit: 100, offset: 0 },
    });

    const res = makeRes();
    await handleGetBankrollHistory(makeReq({
      query: { from: '2026-04-01', to: '2026-04-30' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshots.length).toBe(1);
    expect(res.body.series.length).toBe(1);
    expect(res.body.summary.netChange).toBe(500);
  });

  it('from > to -> 400', async () => {
    (bankrollService.getBankrollHistory as any).mockRejectedValue(
      Object.assign(new Error('from nao pode ser maior que to'), { statusCode: 400 })
    );

    const res = makeRes();
    await handleGetBankrollHistory(makeReq({
      query: { from: '2026-04-30', to: '2026-04-01' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('granularity invalida -> 400', async () => {
    const res = makeRes();
    await handleGetBankrollHistory(makeReq({
      query: { granularity: 'yearly' },
    }) as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('limit > 500 -> handler capa em 500 (spec criterio)', async () => {
    (bankrollService.getBankrollHistory as any).mockResolvedValue({
      snapshots: [], series: [], summary: {} as any,
      pagination: { total: 0, limit: 500, offset: 0 },
    });

    const res = makeRes();
    await handleGetBankrollHistory(makeReq({
      query: { limit: '10000' },
    }) as any, res);

    expect(res.statusCode).toBe(200);
    const call = (bankrollService.getBankrollHistory as any).mock.calls[0];
    const filters = call[1];
    expect(filters.limit).toBeLessThanOrEqual(500);
  });

  it('sem banca configurada -> 200 com estrutura vazia (spec criterio)', async () => {
    (bankrollService.getBankrollHistory as any).mockResolvedValue({
      snapshots: [], series: [],
      summary: {
        totalDeposits: 0, totalWithdrawals: 0, totalSessionPnL: 0,
        totalManualAdjustments: 0, netChange: 0, startBalance: 0, endBalance: 0,
      },
      pagination: { total: 0, limit: 100, offset: 0 },
    });

    const res = makeRes();
    await handleGetBankrollHistory(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.snapshots).toEqual([]);
  });

  it('sem auth -> 401', async () => {
    const res = makeRes();
    await handleGetBankrollHistory(makeReq({ user: undefined }) as any, res);

    expect(res.statusCode).toBe(401);
  });
});

// ===========================================================================
// Rate limit (spec Q10: 10/min)
//
// O Implementer deve usar express-rate-limit montando o middleware ANTES do
// handler. O teste abaixo verifica que o bankrollLimiter e configurado para
// 10 req/min per userId.
// ===========================================================================

describe('Rate limit: bankrollLimiter 10/min (Q10)', () => {
  it.todo('POST /api/bankroll/snapshot: 11a chamada em 60s -> 429');
  it.todo('PUT /api/bankroll: 11a chamada em 60s -> 429');
  it.todo('GET endpoints NAO tem rate limit (leitura)');
  it.todo('rate limit usa req.user.userPlatformId como key (nao IP) — evita shared-nat bypass');
});
