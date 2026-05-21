import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD (Sprint 2 - Bankroll): regressao do Tournament Selector (Sprint 1)
//
// Fonte: docs/specs/bankroll-management.md (RF-10)
//        docs/architecture/bankroll-index.md (Q-Arch-5)
//
// RF-10: Sprint 1 sempre retornava bankrollConfigured:false. Sprint 2 ativa o filtro:
//   - bankrollConfigured:true quando bankroll_amount != null
//   - bankrollThresholdUSD = softLimit (amount * rulePct, sem tolerancia)
//   - bankrollHardLimitUSD = hardLimit (amount * rulePct * 1.5)
//   - warning "out_of_bankroll_soft" entre soft e hard
//   - warning "out_of_bankroll" acima de hard
//   - bankrollFilter=true filtra APENAS torneios acima de hardLimit
//
// Regressao critica: teste tests/integration/api/tournament-selector.test.ts:337
// "bankroll nao cadastrado" continua passando para usuario SEM banca.
// =============================================================================

import {
  handleTournamentSelector,
  type TournamentSelectorRequest,
} from '../../../server/routes/tournament-selector';

import { playerBundleCache } from '../../../server/services/playerBundle';
import { selectorCache } from '../../../server/services/selectorCache';
import { storage } from '../../../server/storage';
import * as supremaSvc from '../../../server/supremaService';

vi.mock('../../../server/services/playerBundle', () => ({
  playerBundleCache: { getOrLoad: vi.fn(), invalidate: vi.fn() },
}));
vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: { get: vi.fn(), set: vi.fn(), invalidateAllForUser: vi.fn() },
}));
vi.mock('../../../server/supremaService', () => ({
  getSupremaTournaments: vi.fn(),
}));
vi.mock('../../../server/storage', () => ({
  storage: {
    getTournamentLibrary: vi.fn(),
    getTournamentLibraryEntries: vi.fn(),
    getPlannedTournaments: vi.fn(),
    getUserSettings: vi.fn(),
    insertSelectorLog: vi.fn(),
  },
}));

beforeEach(async () => {
  vi.clearAllMocks();
  // Sprint TS-3 fix HIGH-2: shared cache (tournamentSelectorCache) NAO eh mockado
  // neste arquivo legacy; reset explicito para evitar bleed cross-it (lesson #21).
  const { _resetTournamentSelectorCacheForTests } = await import(
    '../../../server/scoring/tournamentSelectorCache'
  );
  _resetTournamentSelectorCacheForTests();
});

function makeBundleStub(totalTournaments: number = 200) {
  return {
    totalTournaments, lookbackTournaments: totalTournaments, lookbackDays: 180, overallRoi: 12,
    bySite: [{ site: 'Suprema', sample: 120, roi: 14, profit: 500 }],
    byBuyIn: [{ range: '$11-21.99', sample: 134, roi: 16.8 }],
    byCategory: [{ category: 'PKO', sample: 87, roi: 18 }],
    bySpeed: [{ speed: 'Turbo', sample: 90, roi: 9 }],
    byDayOfWeek: [{ dayOfWeek: 4, sample: 78, roi: 22 }],
    byTimeOfDay: [{ bucket: 'noite-nobre', sample: 102, roi: 21 }],
    byField: [{ range: 'medio', sample: 188, roi: 11 }],
  };
}

function makeSupremaTournament(overrides: any = {}) {
  return {
    externalId: `suprema-${overrides.externalId ?? 1000}`,
    name: `Mystery KO`,
    site: 'Suprema',
    time: '22:00',
    buyIn: '5.00',
    currency: 'USD',
    guaranteed: '5000.00',
    type: 'PKO',
    speed: 'Turbo',
    dayOfWeek: 4,
    status: 'upcoming',
    prioridade: 2,
    startTime: new Date('2026-04-23T22:00:00Z'),
    lateRegMinutes: 60,
    startingStack: 10000,
    maxPlayers: 280,
    gameType: 'NLH',
    blindLevelMinutes: 8,
    ...overrides,
  };
}

function makeRequest(overrides: Partial<TournamentSelectorRequest> = {}): TournamentSelectorRequest {
  return {
    userId: 'USER-0001',
    date: '2026-04-23',
    sources: 'suprema,library',
    minScore: 0,
    minSample: 0,
    bankrollFilter: false,
    lookbackDays: 180,
    ...overrides,
  };
}

// ===========================================================================
// Regressao Sprint 1 (Q-Arch-5)
// ===========================================================================

describe('RF-10: usuario sem banca (regressao Sprint 1)', () => {
  beforeEach(() => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      makeSupremaTournament({ externalId: 'a', buyIn: '5.00' }),
      makeSupremaTournament({ externalId: 'b', buyIn: '22.00' }),
    ]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (selectorCache.get as any).mockReturnValue(null);
  });

  it('bankrollAmount=null -> bankrollConfigured:false (mantem comportamento Sprint 1)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({ bankrollAmount: null });

    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: true }));
    expect(r.bankrollConfigured).toBe(false);
    // Com banca nao configurada, mesmo com bankrollFilter=true nao filtra
    expect(r.tournaments.length).toBe(2);
  });

  it('bankrollAmount=null -> nenhum warning out_of_bankroll em nenhum torneio', async () => {
    (storage.getUserSettings as any).mockResolvedValue({ bankrollAmount: null });

    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: false }));
    for (const t of r.tournaments) {
      const warnings = (t as any).warnings ?? [];
      expect(warnings).not.toContain('out_of_bankroll');
      expect(warnings).not.toContain('out_of_bankroll_soft');
    }
  });
});

// ===========================================================================
// RF-10: usuario COM banca - novos comportamentos
// ===========================================================================

describe('RF-10: usuario com banca configurada', () => {
  beforeEach(() => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (selectorCache.get as any).mockReturnValue(null);
  });

  it('bankrollConfigured:true quando bankroll_amount != null', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '500', bankrollRule: '1pct',
    });
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      makeSupremaTournament({ externalId: 'a', buyIn: '3.00' }),
    ]);

    const r = await handleTournamentSelector(makeRequest());
    expect(r.bankrollConfigured).toBe(true);
  });

  it('response inclui bankrollThresholdUSD (softLimit) e bankrollHardLimitUSD (hardLimit)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '500', bankrollRule: '1pct',
    });
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      makeSupremaTournament({ externalId: 'a', buyIn: '3.00' }),
    ]);

    const r = await handleTournamentSelector(makeRequest());

    // 500 * 0.01 = 5 (soft); 500 * 0.01 * 1.5 = 7.5 (hard)
    expect(r.bankrollThresholdUSD).toBeCloseTo(5, 5);
    expect(r.bankrollHardLimitUSD).toBeCloseTo(7.5, 5);
  });

  it('RF-10: $500 banca, rule 1pct, torneio $7 -> SEM warning (7 > 5 soft, mas <= 7.5 hard) = warning soft', async () => {
    // Correcao da interpretacao do RF-10:
    // - buyInUSD <= softLimit (<=5) -> sem warning
    // - softLimit < buyInUSD <= hardLimit (5 < x <= 7.5) -> warning soft
    // - buyInUSD > hardLimit (>7.5) -> warning hard
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '500', bankrollRule: '1pct',
    });
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      makeSupremaTournament({ externalId: 'a', buyIn: '7.00' }), // entre soft(5) e hard(7.5) -> soft
    ]);

    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: false }));
    const t = r.tournaments[0];
    const warnings = (t as any).warnings ?? [];
    expect(warnings).toContain('out_of_bankroll_soft');
    expect(warnings).not.toContain('out_of_bankroll');
  });

  it('RF-10: $500 banca, rule 1pct, torneio $20 -> warning hard (20 > 7.5)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '500', bankrollRule: '1pct',
    });
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      makeSupremaTournament({ externalId: 'a', buyIn: '20.00' }),
    ]);

    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: false }));
    const t = r.tournaments[0];
    const warnings = (t as any).warnings ?? [];
    expect(warnings).toContain('out_of_bankroll');
  });

  it('RF-10: $500 banca, rule 1pct, torneio $3 -> SEM warnings (dentro do softLimit)', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '500', bankrollRule: '1pct',
    });
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      makeSupremaTournament({ externalId: 'a', buyIn: '3.00' }),
    ]);

    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: false }));
    const t = r.tournaments[0];
    const warnings = (t as any).warnings ?? [];
    expect(warnings).not.toContain('out_of_bankroll');
    expect(warnings).not.toContain('out_of_bankroll_soft');
  });

  it('bankrollFilter=true filtra torneios acima de hardLimit', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '500', bankrollRule: '1pct',
    });
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      makeSupremaTournament({ externalId: 'ok', buyIn: '3.00' }),
      makeSupremaTournament({ externalId: 'soft', buyIn: '6.50' }), // passa — shot
      makeSupremaTournament({ externalId: 'hard', buyIn: '20.00' }), // removido
    ]);

    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: true }));

    const ids = r.tournaments.map(t => t.id);
    expect(ids).toContain('ok');
    expect(ids).toContain('soft');
    expect(ids).not.toContain('hard');
  });
});
