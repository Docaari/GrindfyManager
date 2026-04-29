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
