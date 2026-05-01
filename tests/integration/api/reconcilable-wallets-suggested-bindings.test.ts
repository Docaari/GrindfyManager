/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Bankroll-3 — RF-3: GET /reconcilable-wallets retorna suggestedBindings
 *
 * Spec: Docs/specs/sprint-bankroll-3.md (RF-3)
 *
 * Cenarios cobertos:
 *   1. missingPlatforms=['Suprema'] -> suggestedBindings tem entry BRL
 *   2. missingPlatforms=[] -> suggestedBindings=[]
 *   3. Multiplas missing platforms -> array com cada uma
 *   4. bankrollManagementEnabled=false -> suggestedBindings=[]
 *   5. Plataforma desconhecida -> confidence=fallback_usd
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/services/walletService', () => ({
  walletService: { recordWalletTransaction: vi.fn(), listWallets: vi.fn() },
}));

vi.mock('../../../server/services/sessionReconciliation', () => ({
  computeAdjustment: vi.fn(),
  runReconciliation: vi.fn(),
  calculateExpectedDeltaPerWallet: vi.fn(() => []),
}));

vi.mock('../../../server/storage', () => ({
  storage: {
    getGrindSession: vi.fn(),
    findReconciliationMarker: vi.fn(),
    listReconcilableWallets: vi.fn(),
    listWalletsByUser: vi.fn(),
    getUserSettings: vi.fn(),
    listSessionTournaments: vi.fn(),
    findSessionWalletSnapshot: vi.fn(),
    listSessionWalletSnapshots: vi.fn(),
    createSessionWalletSnapshot: vi.fn(),
    getPlayedPlatforms: vi.fn(),
  },
}));

import { handleGetReconcilableWallets } from '../../../server/routes/grind-sessions';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getGrindSession as any).mockResolvedValue({ id: 'ses_1', userId: 'USER-0001' });
  (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
  (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
  (storage.getUserSettings as any).mockResolvedValue({ bankrollManagementEnabled: true });
  (storage.listSessionTournaments as any).mockResolvedValue([]);
  (storage.listReconcilableWallets as any).mockResolvedValue([]);
  (storage.listWalletsByUser as any).mockResolvedValue([]);
  (storage.listSessionWalletSnapshots as any).mockResolvedValue([]);
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: { id: 'ses_1' },
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

describe('GET /api/grind-sessions/:id/reconcilable-wallets — RF-3 suggestedBindings', () => {
  it('response inclui campo suggestedBindings (array)', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'Suprema', status: 'finished', totalInvested: '50' },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.suggestedBindings)).toBe(true);
  });

  it('missingPlatforms=[Suprema] sem wallet -> suggestedBindings tem entry BRL', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'Suprema', status: 'finished', totalInvested: '50' },
    ]);
    (storage.listWalletsByUser as any).mockResolvedValue([]); // sem wallets

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    const entry = res.body.suggestedBindings.find((s: any) => s.platform === 'Suprema');
    expect(entry).toBeDefined();
    expect(entry.suggestedCurrency).toBe('BRL');
  });

  it('missingPlatforms=[] -> suggestedBindings=[]', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.body.suggestedBindings).toEqual([]);
  });

  it('multiplas missing platforms -> entry por plataforma', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'Suprema', status: 'finished', totalInvested: '50' },
      { id: 'st_2', site: 'GGNetwork', status: 'finished', totalInvested: '20' },
    ]);
    (storage.listWalletsByUser as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.body.suggestedBindings.length).toBeGreaterThanOrEqual(2);
  });

  it('bankrollManagementEnabled=false -> suggestedBindings=[]', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollManagementEnabled: false,
    });
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'Suprema', status: 'finished', totalInvested: '50' },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.body.suggestedBindings).toEqual([]);
  });

  it('plataforma desconhecida -> confidence=fallback_usd', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'XyzMystery', status: 'finished', totalInvested: '50' },
    ]);
    (storage.listWalletsByUser as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    const entry = res.body.suggestedBindings.find((s: any) => s.platform === 'XyzMystery');
    expect(entry).toBeDefined();
    expect(entry.confidence).toBe('fallback_usd');
    expect(entry.suggestedCurrency).toBe('USD');
  });

  it('cada entry tem shape { platform, suggestedCurrency, confidence }', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'iPoker', status: 'finished', totalInvested: '50' },
    ]);
    (storage.listWalletsByUser as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.body.suggestedBindings.length).toBeGreaterThan(0);
    for (const e of res.body.suggestedBindings) {
      expect(e).toHaveProperty('platform');
      expect(e).toHaveProperty('suggestedCurrency');
      expect(e).toHaveProperty('confidence');
    }
  });
});
