import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint F4 W1 — dayDetailService.ts (drill-down agregados)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-01)
// Diagrama: Docs/architecture/flow-day-detail-drawer.mermaid
//
// getDayDetail({userId, profileLetter, dayOfWeek}):
//   - JOIN planned_tournaments + tournaments LEFT JOIN tournament_templates
//   - aggregations on-the-fly:
//     - totalTournaments = COUNT(*)
//     - abiUsd = SUM(buyIn USD-norm) / count
//     - investmentUsd = SUM(buyIn USD-norm * pt.count)
//     - bankrollNeeded = MAX(buyIn USD-norm) * 100
//     - format split: pctPKO, pctTurbo, pctVanilla
//     - volume per site
//     - bankroll per site (com coverage % via getConsolidatedBalance)
//     - list[] detalhada
//   - FX normalization via currencyNormalizer (cascata)
// =============================================================================

const storageMock: any = {
  listPlannedTournamentsForDayDetail: vi.fn(),
  getUserSettings: vi.fn(),
  listWalletsByUser: vi.fn(),
};
vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

const walletServiceMock = {
  getConsolidatedBalance: vi.fn(),
};
vi.mock('../../../server/services/walletService', () => ({
  walletService: walletServiceMock,
}));

async function loadService() {
  return await import('../../../server/services/dayDetailService');
}

beforeEach(() => {
  vi.clearAllMocks();
  storageMock.listPlannedTournamentsForDayDetail.mockReset();
  storageMock.getUserSettings.mockReset();
  storageMock.listWalletsByUser.mockReset();
  walletServiceMock.getConsolidatedBalance.mockReset();

  storageMock.getUserSettings.mockResolvedValue({
    userId: 'USER-DD',
    exchangeRates: { BRL: 5.0 },
  });
  storageMock.listWalletsByUser.mockResolvedValue([]);
  walletServiceMock.getConsolidatedBalance.mockResolvedValue({
    totalUsd: 5000,
    wallets: [
      { id: 'w1', platform: 'GGNetwork', balanceUsd: 800 },
      { id: 'w2', platform: 'Suprema', balanceUsd: 200 },
    ],
  });
});

const baseInput = { userId: 'USER-DD', profileLetter: 'A' as const, dayOfWeek: 2 };

describe('getDayDetail — empty (dia OFF)', () => {
  it('retorna cards zerados e list vazio quando 0 torneios planejados', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([]);

    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    expect(r.list).toEqual([]);
    expect(r.cards.totalTournaments).toBe(0);
    expect(r.cards.investmentUsd).toBe(0);
    expect(r.cards.abiUsd).toBe(0);
  });
});

describe('getDayDetail — agregados basicos', () => {
  it('totalTournaments = SUM(pt.count)', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't-gg',
        site: 'GGNetwork',
        type: 'PKO',
        speed: 'Turbo',
        buyIn: 4.78,
        currency: 'USD',
        count: 5,
        time: '20:00',
        name: 'GG MTT',
      },
      {
        plannedId: 'p2',
        templateId: 't-suprema',
        site: 'Suprema',
        type: 'Vanilla',
        speed: 'Regular',
        buyIn: 11,
        currency: 'BRL',
        count: 3,
        time: '21:00',
        name: 'Suprema R$11',
      },
    ]);

    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    expect(r.cards.totalTournaments).toBe(8);
  });

  it('investmentUsd = SUM(buyIn USD-norm * count) com FX cascata', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      {
        plannedId: 'p1',
        site: 'GG',
        type: 'PKO',
        speed: 'Regular',
        buyIn: 5,
        currency: 'USD',
        count: 4,
      },
      {
        plannedId: 'p2',
        site: 'Suprema',
        type: 'Vanilla',
        speed: 'Regular',
        buyIn: 11,
        currency: 'BRL',
        count: 3,
      },
    ]);

    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    // GG: 5 USD * 4 = 20 USD
    // Suprema: 11 BRL / 5.0 = 2.2 USD * 3 = 6.6 USD
    // total: 26.6 USD
    expect(r.cards.investmentUsd).toBeCloseTo(26.6, 1);
  });

  it('abiUsd = SUM / COUNT (average buyin)', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GG', buyIn: 10, currency: 'USD', count: 2, type: 'PKO', speed: 'Regular' },
      { plannedId: 'p2', site: 'GG', buyIn: 20, currency: 'USD', count: 2, type: 'Vanilla', speed: 'Regular' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    // Avg: (10*2 + 20*2) / (2+2) = 60 / 4 = 15
    expect(r.cards.abiUsd).toBeCloseTo(15, 1);
  });
});

describe('getDayDetail — distribuicao Format (Pie)', () => {
  it('pctPKO = % de torneios com type=PKO', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GG', buyIn: 5, currency: 'USD', count: 3, type: 'PKO', speed: 'Regular' },
      { plannedId: 'p2', site: 'GG', buyIn: 5, currency: 'USD', count: 1, type: 'Vanilla', speed: 'Regular' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    // 3 PKO / 4 total = 75%
    expect(r.format.pctPKO).toBeCloseTo(75, 1);
  });

  it('pctTurbo = % de torneios com speed in (Turbo, Hyper)', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GG', buyIn: 5, currency: 'USD', count: 1, type: 'PKO', speed: 'Turbo' },
      { plannedId: 'p2', site: 'GG', buyIn: 5, currency: 'USD', count: 1, type: 'PKO', speed: 'Hyper' },
      { plannedId: 'p3', site: 'GG', buyIn: 5, currency: 'USD', count: 2, type: 'Vanilla', speed: 'Regular' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    // 2 turbo+hyper / 4 total = 50%
    expect(r.format.pctTurbo).toBeCloseTo(50, 1);
  });

  it('soma pctPKO + pctVanilla + (Mystery + Satellite) = 100%', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GG', buyIn: 5, currency: 'USD', count: 1, type: 'PKO', speed: 'Regular' },
      { plannedId: 'p2', site: 'GG', buyIn: 5, currency: 'USD', count: 1, type: 'Vanilla', speed: 'Regular' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    const sum = r.format.pctPKO + r.format.pctVanilla + (r.format.pctMystery ?? 0) + (r.format.pctSatellite ?? 0);
    expect(sum).toBeCloseTo(100, 0);
  });
});

describe('getDayDetail — volume e bankroll por plataforma', () => {
  it('volume agrupa por site COUNT(*)', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GG', buyIn: 5, currency: 'USD', count: 5, type: 'PKO', speed: 'Regular' },
      { plannedId: 'p2', site: 'Suprema', buyIn: 11, currency: 'BRL', count: 3, type: 'Vanilla', speed: 'Regular' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    expect(r.volume).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ site: 'GG', count: 5 }),
        expect.objectContaining({ site: 'Suprema', count: 3 }),
      ])
    );
  });

  it('bankroll por plataforma calcula coveragePct = balance / dayInvestment * 100', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GGNetwork', buyIn: 5, currency: 'USD', count: 4, type: 'PKO', speed: 'Regular' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    // GG balance = 800 / dayInvestment = 5*4=20 -> coverage = 4000%
    const gg = r.bankroll.find((b: any) => b.site === 'GGNetwork' || b.site === 'GG');
    expect(gg).toBeTruthy();
    expect(gg.coveragePct).toBeGreaterThan(100);
  });
});

describe('getDayDetail — list ordenada por time ASC', () => {
  it('list inclui name, site, type+speed, buyinUsd, count, time', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p2', site: 'GG', name: 'Late', buyIn: 5, currency: 'USD', count: 1, type: 'PKO', speed: 'Turbo', time: '23:00' },
      { plannedId: 'p1', site: 'GG', name: 'Early', buyIn: 10, currency: 'USD', count: 2, type: 'Vanilla', speed: 'Regular', time: '19:00' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    expect(r.list[0].name).toBe('Early');
    expect(r.list[1].name).toBe('Late');
    expect(r.list[0]).toEqual(
      expect.objectContaining({
        site: 'GG',
        buyinUsd: 10,
        count: 2,
        time: '19:00',
      })
    );
  });
});

// ===========================================================================
// RF-01 — breakdown por plataforma (card expansivel "Plataformas")
// ===========================================================================
describe('getDayDetail — platforms (RF-01)', () => {
  it('agrega por site: count, investedUsd e abiUsd = investedUsd/count', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GGNetwork', buyIn: 10, currency: 'USD', count: 2, type: 'PKO', speed: 'Regular' },
      { plannedId: 'p2', site: 'GGNetwork', buyIn: 50, currency: 'USD', count: 1, type: 'Vanilla', speed: 'Regular' },
      { plannedId: 'p3', site: 'WPN', buyIn: 33, currency: 'USD', count: 3, type: 'PKO', speed: 'Turbo' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);

    const gg = r.platforms.find((p: any) => p.site === 'GGNetwork');
    const wpn = r.platforms.find((p: any) => p.site === 'WPN');
    // GG: invested = 10*2 + 50*1 = 70; count = 3; abi = 70/3 = 23.33
    expect(gg).toBeTruthy();
    expect(gg.count).toBe(3);
    expect(gg.investedUsd).toBeCloseTo(70, 2);
    expect(gg.abiUsd).toBeCloseTo(23.33, 1);
    // WPN: invested = 33*3 = 99; count = 3; abi = 33
    expect(wpn.investedUsd).toBeCloseTo(99, 2);
    expect(wpn.abiUsd).toBeCloseTo(33, 2);
  });

  it('platforms ordenado por investedUsd desc', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'Small', buyIn: 5, currency: 'USD', count: 1, type: 'PKO', speed: 'Regular' },
      { plannedId: 'p2', site: 'Big', buyIn: 100, currency: 'USD', count: 2, type: 'PKO', speed: 'Regular' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    expect(r.platforms[0].site).toBe('Big');
    expect(r.platforms[1].site).toBe('Small');
  });

  it('dia OFF (0 torneios) → platforms = []', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    expect(r.platforms).toEqual([]);
  });
});

// ===========================================================================
// RF-02 / RF-03 — garantido + mediana field (regressao do badge GTD + card)
// ===========================================================================
describe('getDayDetail — garantido + medianFieldSize', () => {
  it('guaranteedUsd > 0 e estimatedField = round(gtd/buyin) p/ torneio com garantido', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'GGNetwork', buyIn: 150, guaranteed: 1000000, currency: 'USD', count: 1, type: 'PKO', speed: 'Regular', time: '20:00' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    expect(r.list[0].guaranteedUsd).toBeCloseTo(1000000, 2);
    expect(r.list[0].estimatedField).toBe(Math.round(1000000 / 150));
  });

  it('medianFieldSize = mediana dos estimatedField (>0)', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'A', buyIn: 100, guaranteed: 100000, currency: 'USD', count: 1, type: 'PKO', speed: 'Regular', time: '19:00' }, // 1000
      { plannedId: 'p2', site: 'A', buyIn: 100, guaranteed: 200000, currency: 'USD', count: 1, type: 'PKO', speed: 'Regular', time: '20:00' }, // 2000
      { plannedId: 'p3', site: 'A', buyIn: 100, guaranteed: 300000, currency: 'USD', count: 1, type: 'PKO', speed: 'Regular', time: '21:00' }, // 3000
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    expect(r.cards.medianFieldSize).toBe(2000);
  });

  it('torneio sem garantido (gtd=0) → guaranteedUsd=0 e nao entra na mediana', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'A', buyIn: 100, guaranteed: 0, currency: 'USD', count: 1, type: 'PKO', speed: 'Regular', time: '19:00' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    expect(r.list[0].guaranteedUsd).toBe(0);
    expect(r.list[0].estimatedField).toBe(0);
    expect(r.cards.medianFieldSize).toBe(0);
  });

  it('FX fallback: moeda sem cotacao NAO zera o garantido (defensivo)', async () => {
    storageMock.listPlannedTournamentsForDayDetail.mockResolvedValue([
      { plannedId: 'p1', site: 'A', buyIn: 100, guaranteed: 50000, currency: 'XXX', count: 1, type: 'PKO', speed: 'Regular', time: '19:00' },
    ]);
    const { getDayDetail } = await loadService();
    const r = await getDayDetail(baseInput);
    // sem rate p/ XXX: fallback trata nativo como USD → garantido visivel (>0)
    expect(r.list[0].guaranteedUsd).toBeGreaterThan(0);
    expect(r.list[0].buyinUsd).toBeGreaterThan(0);
  });
});
