/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint B2 — M3: Wallets eligibility por plataformas jogadas
 *
 * Spec: Docs/specs/sprint-b2-summary-inline-reconcile.md (M3)
 * ADR-048: Wallets eligibility platforms played
 *
 * Cenarios cobertos:
 *   1. playedPlatforms=['Suprema','GG'] + wallet ativa so de Suprema
 *      -> response: missingPlatforms=['GGNetwork']
 *   2. Todas plataformas com wallet -> missingPlatforms=[]
 *   3. Sessao sem session_tournaments finalizados -> playedPlatforms=[],
 *      missingPlatforms=[]
 *   4. Wallet com status='archived' NAO conta como cadastrada
 *      -> entra em missingPlatforms
 *
 * Endpoint atualizado: GET /api/grind-sessions/:id/reconcilable-wallets
 *   Response v3 (B2): { sessionId, alreadyReconciled, wallets, orphanContribution,
 *                        playedPlatforms, missingPlatforms, bankrollManagementEnabled }
 *
 * Os campos `playedPlatforms` e `missingPlatforms` SAO NOVOS — implementer
 * deve adiciona-los em handleGetReconcilableWallets.
 *
 * Pattern espelha tests/integration/api/grind-sessions-reconcile-v2.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    recordWalletTransaction: vi.fn(),
    listWallets: vi.fn(),
  },
}));

vi.mock('../../../server/services/sessionReconciliation', () => ({
  computeAdjustment: vi.fn(),
  runReconciliation: vi.fn(),
  calculateExpectedDeltaPerWallet: vi.fn(),
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
    // M3: novos metodos opcionais (implementer cria conforme decisao):
    getPlayedPlatforms: vi.fn(),
  },
}));

import { handleGetReconcilableWallets } from '../../../server/routes/grind-sessions';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  // Defaults razoaveis: sessao do user, sem snapshots, sem marker.
  (storage.getGrindSession as any).mockResolvedValue({
    id: 'ses_1',
    userId: 'USER-0001',
  });
  (storage.findSessionWalletSnapshot as any).mockResolvedValue(null);
  (storage.findReconciliationMarker as any).mockResolvedValue({ count: 0 });
  // Setting bankroll management ON por padrao.
  (storage.getUserSettings as any).mockResolvedValue({
    bankrollManagementEnabled: true,
  });
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

// =============================================================================
// Cenario 1: playedPlatforms=['Suprema','GG'] + wallet so de Suprema
// =============================================================================

describe('GET /reconcilable-wallets B2 (M3) — missingPlatforms quando wallet falta', () => {
  it('200 retorna missingPlatforms=[GGNetwork] quando jogador jogou em Suprema+GG e tem so wallet Suprema', async () => {
    // Sessao com 2 plataformas jogadas
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'Suprema', status: 'finished', outcome: 'finished' },
      { id: 'st_2', site: 'GGNetwork', status: 'finished', outcome: 'finished' },
    ]);
    // listReconcilableWallets retorna so suprema (matched)
    (storage.listReconcilableWallets as any).mockResolvedValue({
      wallets: [
        {
          walletId: 'w_suprema',
          name: 'Suprema Main',
          platform: 'Suprema',
          nativeCurrency: 'BRL',
          openingBalance: 500,
          balance: 500,
          expectedPreviousBalance: 500,
          expectedDelta: -50,
          expectedClosingBalance: 450,
          contributingTournaments: ['st_1'],
          hadActivityInSession: true,
          tieBreakStrategy: 'single',
        },
      ],
      orphanContribution: [],
    });
    // Wallets do usuario — apenas Suprema ativa
    (storage.listWalletsByUser as any).mockResolvedValue([
      {
        id: 'w_suprema',
        platform: 'Suprema',
        nativeCurrency: 'BRL',
        status: 'active',
      },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.missingPlatforms)).toBe(true);
    expect(res.body.missingPlatforms).toContain('GGNetwork');
    expect(res.body.missingPlatforms).not.toContain('Suprema');
  });
});

// =============================================================================
// Cenario 2: todas plataformas com wallet -> missingPlatforms=[]
// =============================================================================

describe('GET /reconcilable-wallets B2 (M3) — missingPlatforms vazio quando todas plataformas tem wallet', () => {
  it('200 retorna missingPlatforms=[] quando ha wallet ativa para cada plataforma jogada', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'Suprema', status: 'finished', outcome: 'finished' },
      { id: 'st_2', site: 'GGNetwork', status: 'finished', outcome: 'finished' },
    ]);
    (storage.listReconcilableWallets as any).mockResolvedValue({
      wallets: [
        {
          walletId: 'w_suprema',
          name: 'Suprema Main',
          platform: 'Suprema',
          nativeCurrency: 'BRL',
          openingBalance: 500,
          balance: 500,
          expectedPreviousBalance: 500,
          expectedDelta: -50,
          expectedClosingBalance: 450,
          contributingTournaments: ['st_1'],
          hadActivityInSession: true,
          tieBreakStrategy: 'single',
        },
        {
          walletId: 'w_gg',
          name: 'GG Main',
          platform: 'GGNetwork',
          nativeCurrency: 'USD',
          openingBalance: 200,
          balance: 200,
          expectedPreviousBalance: 200,
          expectedDelta: 25,
          expectedClosingBalance: 225,
          contributingTournaments: ['st_2'],
          hadActivityInSession: true,
          tieBreakStrategy: 'single',
        },
      ],
      orphanContribution: [],
    });
    (storage.listWalletsByUser as any).mockResolvedValue([
      {
        id: 'w_suprema',
        platform: 'Suprema',
        nativeCurrency: 'BRL',
        status: 'active',
      },
      {
        id: 'w_gg',
        platform: 'GGNetwork',
        nativeCurrency: 'USD',
        status: 'active',
      },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.missingPlatforms)).toBe(true);
    expect(res.body.missingPlatforms).toEqual([]);
  });
});

// =============================================================================
// Cenario 3: sessao sem torneios finalizados -> playedPlatforms=[]
// =============================================================================

describe('GET /reconcilable-wallets B2 (M3) — playedPlatforms vazio sem torneios finalizados', () => {
  it('200 retorna playedPlatforms=[] e missingPlatforms=[] quando ha apenas torneios cancelados/not_played', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      // Status not_played — nao conta para playedPlatforms.
      { id: 'st_1', site: 'Suprema', status: 'cancelled', outcome: 'not_played' },
    ]);
    (storage.listReconcilableWallets as any).mockResolvedValue({
      wallets: [],
      orphanContribution: [],
    });
    (storage.listWalletsByUser as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.playedPlatforms)).toBe(true);
    expect(res.body.playedPlatforms).toEqual([]);
    expect(Array.isArray(res.body.missingPlatforms)).toBe(true);
    expect(res.body.missingPlatforms).toEqual([]);
  });

  it('200 retorna playedPlatforms=[] quando sessao nao tem session_tournaments', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([]);
    (storage.listReconcilableWallets as any).mockResolvedValue({
      wallets: [],
      orphanContribution: [],
    });
    (storage.listWalletsByUser as any).mockResolvedValue([]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.playedPlatforms).toEqual([]);
    expect(res.body.missingPlatforms).toEqual([]);
  });
});

// =============================================================================
// Cenario 4: wallet 'archived' NAO conta como cadastrada
// =============================================================================

describe('GET /reconcilable-wallets B2 (M3) — wallet archived nao satisfaz eligibility', () => {
  it('200 retorna missingPlatforms inclui plataforma cuja unica wallet eh archived', async () => {
    (storage.listSessionTournaments as any).mockResolvedValue([
      { id: 'st_1', site: 'Suprema', status: 'finished', outcome: 'finished' },
      { id: 'st_2', site: 'GGNetwork', status: 'finished', outcome: 'finished' },
    ]);
    (storage.listReconcilableWallets as any).mockResolvedValue({
      wallets: [
        {
          walletId: 'w_suprema',
          name: 'Suprema Main',
          platform: 'Suprema',
          nativeCurrency: 'BRL',
          openingBalance: 500,
          balance: 500,
          expectedPreviousBalance: 500,
          expectedDelta: -50,
          expectedClosingBalance: 450,
          contributingTournaments: ['st_1'],
          hadActivityInSession: true,
          tieBreakStrategy: 'single',
        },
      ],
      orphanContribution: [],
    });
    // Wallet GG existe mas esta archived
    (storage.listWalletsByUser as any).mockResolvedValue([
      {
        id: 'w_suprema',
        platform: 'Suprema',
        nativeCurrency: 'BRL',
        status: 'active',
      },
      {
        id: 'w_gg_old',
        platform: 'GGNetwork',
        nativeCurrency: 'USD',
        status: 'archived',
      },
    ]);

    const res = makeRes();
    await handleGetReconcilableWallets(makeReq() as any, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.missingPlatforms).toContain('GGNetwork');
  });
});
