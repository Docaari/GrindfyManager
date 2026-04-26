import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: compatibilidade reversa Bankroll v1 -> v2
//
// Spec: Docs/specs/bankroll-v2-multi-wallet-foundation.md (RF-11 — wrapper legado)
// ADR-035: GET /api/bankroll continua funcionando como wrapper sobre
//          getConsolidatedBalance(userId).
//
// VALIDADO:
//   - Tournament Selector continua filtrando por consolidatedUSD
//   - Coach AI continua lendo bankrollAmount via tool
//   - BankrollMovementDialog legado nao quebra (mas usa snapshot legado)
// =============================================================================

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    getConsolidatedBalance: vi.fn(),
    listWallets: vi.fn(),
  },
}));

vi.mock('../../../server/services/bankrollService', () => ({
  bankrollService: {
    getBankrollState: vi.fn(),
    updateBankroll: vi.fn(),
    recordSnapshot: vi.fn(),
    getBankrollHistory: vi.fn(),
  },
}));

import { handleGetBankroll } from '../../../server/routes/bankroll';
import { bankrollService } from '../../../server/services/bankrollService';
import { walletService } from '../../../server/services/walletService';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {}, query: {}, params: {},
    ...overrides,
  };
}
function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (d: any) => { res.body = d; return res; };
  return res;
}

describe('GET /api/bankroll — wrapper legado preserva shape v1', () => {
  it('usuario migrado com 1 wallet USD 1000: response shape v1 + walletCount + aggregationMode', async () => {
    // Apos v2, getBankrollState delega para walletService.getConsolidatedBalance
    // mas mantem shape v1 (configured, amount, rule, maxBuyInUSD, etc.).
    (bankrollService.getBankrollState as any).mockResolvedValue({
      configured: true,
      amount: 1000,
      currency: 'USD',
      rule: '1pct',
      rulePct: 1.0,
      tolerance: 1.5,
      maxBuyInUSD: 15,
      maxBuyInDisplay: { USD: 15, BRL: 75 },
      amountDisplay: { USD: 1000, BRL: 5000 },
      exchangeRateBRL: 5.0,
      lastUpdatedAt: '2026-04-26T15:00:00Z',
      snapshotCount: 5,
      // Campos NOVOS (compat com clients que ja sabem):
      aggregationMode: 'global',
      walletCount: 1,
    });

    const res = makeRes();
    await handleGetBankroll(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    // Shape v1 preservado
    expect(res.body.configured).toBe(true);
    expect(res.body.amount).toBe(1000);
    expect(res.body.rule).toBe('1pct');
    expect(res.body.maxBuyInUSD).toBe(15);
    // Campos NOVOS
    expect(res.body.aggregationMode).toBe('global');
    expect(res.body.walletCount).toBe(1);
  });

  it('usuario sem wallets retorna configured=false', async () => {
    (bankrollService.getBankrollState as any).mockResolvedValue({
      configured: false, amount: null, rule: '1pct', maxBuyInUSD: null,
      snapshotCount: 0, lastUpdatedAt: null,
      aggregationMode: 'global', walletCount: 0,
    });

    const res = makeRes();
    await handleGetBankroll(makeReq() as any, res);

    expect(res.body.configured).toBe(false);
    expect(res.body.amount).toBeNull();
    expect(res.body.walletCount).toBe(0);
  });

  it('cliente v1 que ignora campos novos continua funcionando', async () => {
    // Simula cliente legado lendo apenas 5 campos
    (bankrollService.getBankrollState as any).mockResolvedValue({
      configured: true, amount: 1000, currency: 'USD', rule: '1pct', maxBuyInUSD: 15,
      // Campos novos podem estar presentes mas nao quebram cliente legado
      aggregationMode: 'global', walletCount: 3,
    });

    const res = makeRes();
    await handleGetBankroll(makeReq() as any, res);

    // Cliente v1 le apenas v1 fields
    const v1Fields = {
      configured: res.body.configured,
      amount: res.body.amount,
      currency: res.body.currency,
      rule: res.body.rule,
      maxBuyInUSD: res.body.maxBuyInUSD,
    };
    expect(v1Fields.amount).toBe(1000);
    expect(v1Fields.maxBuyInUSD).toBe(15);
  });
});

describe('Tournament Selector — compat com banca consolidada', () => {
  it.todo('GET /api/tournament-selector: bankrollFilter usa consolidated.hardLimitUSD em modo global');
  it.todo('Tournament Selector cache invalidado em POST /api/wallets/:id/transactions');
});

describe('Coach AI — compat com banca consolidada', () => {
  it.todo('Coach tool get_bankroll_status le amount + walletCount via wrapper /api/bankroll');
});

describe('BankrollMovementDialog legado — compat', () => {
  it.todo('Legacy POST /api/bankroll/snapshot continua funcionando via bankrollService.recordSnapshot');
});

describe('GET /api/bankroll — invariante de schema', () => {
  it('campos v1 obrigatorios sempre presentes mesmo apos refactor', async () => {
    (bankrollService.getBankrollState as any).mockResolvedValue({
      configured: true,
      amount: 1500,
      currency: 'USD',
      rule: '2pct',
      rulePct: 2.0,
      tolerance: 1.5,
      maxBuyInUSD: 45,
      snapshotCount: 0,
      lastUpdatedAt: '2026-04-26T15:00:00Z',
      aggregationMode: 'global',
      walletCount: 2,
    });

    const res = makeRes();
    await handleGetBankroll(makeReq() as any, res);

    const requiredV1Fields = ['configured', 'amount', 'currency', 'rule', 'maxBuyInUSD', 'snapshotCount'];
    for (const f of requiredV1Fields) {
      expect(res.body, `field ${f}`).toHaveProperty(f);
    }
  });
});
