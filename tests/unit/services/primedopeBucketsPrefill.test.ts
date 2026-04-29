import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint F4 W1 — primedopeBucketsPrefill.ts (RF-02 cascata pre-fill)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-02)
// Diagrama: Docs/architecture/flow-primedope-wizard-prefill.mermaid
//
// Cascata por planned_tournament:
//   priority 1: tournament_templates.avgBuyIn / avgRoi / avgFieldSize (NAO marca estimado)
//   priority 2: tournament backfill 0014 (players_avg, places_paid_avg, rake_pct) +
//               NETWORK_DEFAULTS para ROI -> marca roiPct como 'estimado'
//   priority 3: NETWORK_DEFAULTS (rake_pct, roi_pct, players=1000, places_paid=150)
//               -> marca todos como 'estimado'
//
// Output: { buckets[], fxRatesUsed, defaultsFlags: Set<bucketIdx:fieldName> }
// =============================================================================

const storageMock: any = {
  listPlannedTournamentsForBucketsPrefill: vi.fn(),
  getUserSettings: vi.fn(),
  listWalletsByUser: vi.fn(),
};
vi.mock('../../../server/storage', () => ({
  storage: storageMock,
}));

async function loadService() {
  return await import('../../../server/services/primedopeBucketsPrefill');
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(storageMock).forEach((fn: any) => fn.mockReset && fn.mockReset());
  storageMock.getUserSettings.mockResolvedValue({
    userId: 'USER-PF',
    exchangeRates: { BRL: 5.0 },
  });
  storageMock.listWalletsByUser.mockResolvedValue([]);
});

const baseInput = {
  userId: 'USER-PF',
  profileLetter: 'A' as const,
  dayOfWeek: 2,
  multiplier: 1,
};

describe('buildBucketsPrefill — priority 1 (template)', () => {
  it('usa avgBuyIn, avgRoi, avgFieldSize do template SEM marcar estimado', async () => {
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't1',
        site: 'GGNetwork',
        currency: 'USD',
        count: 2,
        template: {
          avgBuyIn: 10,
          avgRoi: 18,
          avgFieldSize: 1500,
        },
        tournamentSample: null,
      },
    ]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill(baseInput);

    expect(r.buckets[0].buyinUsd).toBeCloseTo(10, 1);
    expect(r.buckets[0].roiPct).toBeCloseTo(18, 1);
    expect(r.buckets[0].playersAvg).toBe(1500);
    expect(r.defaultsFlags.has('0:roiPct')).toBe(false);
    expect(r.defaultsFlags.has('0:playersAvg')).toBe(false);
  });
});

describe('buildBucketsPrefill — priority 2 (tournament backfill 0014)', () => {
  it('usa tournament.players_avg/places_paid_avg/rake_pct + NETWORK_DEFAULTS roi -> roi MARCADO estimado', async () => {
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't1',
        site: 'GGNetwork',
        currency: 'USD',
        count: 2,
        template: null,
        tournamentSample: {
          buyIn: 5,
          players_avg: 800,
          places_paid_avg: 120,
          rake_pct: 10,
        },
      },
    ]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill(baseInput);

    expect(r.buckets[0].buyinUsd).toBeCloseTo(5, 1);
    expect(r.buckets[0].playersAvg).toBe(800);
    expect(r.buckets[0].placesPaid).toBe(120);
    expect(r.buckets[0].rakePct).toBeCloseTo(10, 1);
    expect(r.defaultsFlags.has('0:roiPct')).toBe(true);
  });
});

describe('buildBucketsPrefill — priority 3 (NETWORK_DEFAULTS)', () => {
  it('sem template + sem tournament sample: usa NETWORK_DEFAULTS GG (rake=10) + players=1000', async () => {
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't1',
        site: 'GGNetwork',
        currency: 'USD',
        count: 1,
        buyIn: 5,
        template: null,
        tournamentSample: null,
      },
    ]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill(baseInput);

    expect(r.buckets[0].playersAvg).toBe(1000);
    expect(r.buckets[0].placesPaid).toBe(150); // ROUND(1000 * 0.15)
    expect(r.buckets[0].rakePct).toBeCloseTo(10, 1); // GG default
    expect(r.defaultsFlags.has('0:roiPct')).toBe(true);
    expect(r.defaultsFlags.has('0:playersAvg')).toBe(true);
    expect(r.defaultsFlags.has('0:rakePct')).toBe(true);
  });

  it('NETWORK_DEFAULTS WPN tem rake=8 (different from GG)', async () => {
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't1',
        site: 'WPN',
        currency: 'USD',
        count: 1,
        buyIn: 5,
        template: null,
        tournamentSample: null,
      },
    ]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill(baseInput);

    expect(r.buckets[0].rakePct).toBeCloseTo(8, 1);
  });
});

describe('buildBucketsPrefill — multiplier aplicado a count', () => {
  it('multiplier=4 quadruplica bucket.count', async () => {
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't1',
        site: 'GG',
        currency: 'USD',
        count: 3,
        buyIn: 5,
        template: { avgBuyIn: 5, avgRoi: 15, avgFieldSize: 500 },
      },
    ]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill({ ...baseInput, multiplier: 4 });
    expect(r.buckets[0].count).toBe(12);
  });
});

describe('buildBucketsPrefill — FX conversion + walletMissing flag', () => {
  it('Suprema BRL R$11 + users.exchangeRates {BRL:5} -> buyinUsd=2.20, walletMissing=false', async () => {
    storageMock.getUserSettings.mockResolvedValue({
      exchangeRates: { BRL: 5.0 },
    });
    storageMock.listWalletsByUser.mockResolvedValue([]);
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't1',
        site: 'Suprema',
        currency: 'BRL',
        count: 5,
        buyIn: 11,
        template: { avgBuyIn: 11, avgRoi: 20, avgFieldSize: 200 },
      },
    ]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill(baseInput);

    expect(r.buckets[0].buyinUsd).toBeCloseTo(2.2, 1);
    expect(r.buckets[0].buyinOriginal).toBe(11);
    expect(r.buckets[0].currency).toBe('BRL');
  });

  it('walletMissing=true quando moeda BRL e nao ha wallet BRL nem users.exchangeRates', async () => {
    storageMock.getUserSettings.mockResolvedValue({ exchangeRates: null });
    storageMock.listWalletsByUser.mockResolvedValue([]); // sem wallet BRL
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([
      {
        plannedId: 'p1',
        templateId: 't1',
        site: 'Suprema',
        currency: 'BRL',
        count: 1,
        buyIn: 11,
        template: { avgBuyIn: 11, avgRoi: 20, avgFieldSize: 200 },
      },
    ]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill(baseInput);

    expect(r.buckets[0].walletMissing).toBe(true);
  });
});

describe('buildBucketsPrefill — empty', () => {
  it('0 planned tournaments -> retorna buckets vazio', async () => {
    storageMock.listPlannedTournamentsForBucketsPrefill.mockResolvedValue([]);
    const { buildBucketsPrefill } = await loadService();
    const r = await buildBucketsPrefill(baseInput);
    expect(r.buckets).toEqual([]);
  });
});
