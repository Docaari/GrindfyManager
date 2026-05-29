import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Test-Writer (Modo TDD - Red Phase)
// Sprint day-detail-consolidation — dayDetailService consolidation (RF-08 + RF-09)
//
// Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-08/RF-09
// ADR : Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D1/D2
//
// Cobre:
//   - medianFieldSize: mediana de estimatedField (par avg, impar middle, filtra 0).
//   - maxLate passthrough do pt.registrationTime para list[].maxLate.
//   - guaranteedUsd FX normalization (BRL/USD).
//   - estimatedField rounding (Math.max(1, round(guaranteedUsd / buyinUsd))).
//   - prioridade default 2 quando null/undefined/invalid.
//
// Pattern lessons #3 + #34 + #36:
//   - Mock storage retorna shape exato de planned_tournaments JOIN tournaments.
//   - Mock walletService.getConsolidatedBalance retorna shape vazio (foco fields).
//   - Sem db real — chama getDayDetail direto.
// =============================================================================

// Mock dependencies BEFORE import.
vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    listWalletsByUser: vi.fn(),
    listPlannedTournamentsForDayDetail: vi.fn(),
  },
}));

vi.mock('../../../server/services/walletService', () => ({
  walletService: {
    getConsolidatedBalance: vi.fn(async () => ({ wallets: [] })),
  },
}));

import { getDayDetail } from '../../../server/services/dayDetailService';
import { storage } from '../../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: rates USD only (FX_FALLBACK_CONSTANTS provê BRL via prod).
  (storage.getUserSettings as any).mockResolvedValue({
    exchangeRates: { BRL: 5.0, EUR: 0.9 },
  });
  (storage.listWalletsByUser as any).mockResolvedValue([]);
});

function makePlanned(overrides: Partial<any> = {}): any {
  return {
    id: overrides.id ?? 'pt-1',
    plannedId: overrides.plannedId ?? 'pt-1',
    templateId: overrides.templateId ?? null,
    name: overrides.name ?? 'Sunday Million',
    site: overrides.site ?? 'PokerStars',
    type: overrides.type ?? 'Vanilla',
    speed: overrides.speed ?? 'Normal',
    buyIn: overrides.buyIn ?? '10',
    time: overrides.time ?? '20:00',
    dayOfWeek: overrides.dayOfWeek ?? 0,
    profile: overrides.profile ?? 'A',
    prioridade: overrides.prioridade,
    registrationTime:
      overrides.registrationTime !== undefined
        ? overrides.registrationTime
        : null,
    guaranteed: overrides.guaranteed ?? 0,
    currency: overrides.currency ?? 'USD',
    count: overrides.count ?? 1,
    ...overrides,
  };
}

describe('dayDetailService.medianFieldSize — mediana de estimatedField', () => {
  it('mediana impar — [estimatedField] = [50, 100, 200] → 100', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      // buyIn 10, guaranteed 500 → estimatedField round(500/10) = 50
      makePlanned({ id: 'a', buyIn: '10', guaranteed: 500 }),
      // buyIn 10, guaranteed 1000 → 100
      makePlanned({ id: 'b', buyIn: '10', guaranteed: 1000 }),
      // buyIn 10, guaranteed 2000 → 200
      makePlanned({ id: 'c', buyIn: '10', guaranteed: 2000 }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.cards.medianFieldSize).toBe(100);
  });

  it('mediana par — [50, 100, 200, 400] → round((100+200)/2) = 150', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'a', buyIn: '10', guaranteed: 500 }),
      makePlanned({ id: 'b', buyIn: '10', guaranteed: 1000 }),
      makePlanned({ id: 'c', buyIn: '10', guaranteed: 2000 }),
      makePlanned({ id: 'd', buyIn: '10', guaranteed: 4000 }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.cards.medianFieldSize).toBe(150);
  });

  it('lista vazia → medianFieldSize = 0', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.cards.medianFieldSize).toBe(0);
  });

  it('filtra estimatedField=0 — torneios sem guaranteed nao contam', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      // estimatedField=0 (sem guaranteed)
      makePlanned({ id: 'a', buyIn: '10', guaranteed: 0 }),
      // estimatedField=100
      makePlanned({ id: 'b', buyIn: '10', guaranteed: 1000 }),
      // estimatedField=200
      makePlanned({ id: 'c', buyIn: '10', guaranteed: 2000 }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    // Apenas 100 e 200 entram → mediana par = 150
    expect(r.cards.medianFieldSize).toBe(150);
  });
});

describe('dayDetailService.list[].maxLate — passthrough registrationTime', () => {
  it('registrationTime="14:30" → list[].maxLate="14:30"', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-mx', registrationTime: '14:30' }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].maxLate).toBe('14:30');
  });

  it('registrationTime=null → list[].maxLate=null', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-noml', registrationTime: null }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].maxLate).toBeNull();
  });
});

describe('dayDetailService.list[].guaranteedUsd — FX normalization', () => {
  it('currency=BRL guaranteed=500 rates.BRL=5 → guaranteedUsd=100', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-brl', currency: 'BRL', guaranteed: 500, buyIn: '50' }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].guaranteedUsd).toBe(100);
  });

  it('currency=USD guaranteed=100 → guaranteedUsd=100 (passthrough)', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-usd', currency: 'USD', guaranteed: 100, buyIn: '10' }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].guaranteedUsd).toBe(100);
  });
});

describe('dayDetailService.list[].estimatedField — round(guaranteedUsd / buyinUsd)', () => {
  it('guaranteedUsd=1000 buyinUsd=15 → round(1000/15)=67', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-est', currency: 'USD', guaranteed: 1000, buyIn: '15' }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].estimatedField).toBe(67);
  });
});

describe('dayDetailService.list[].prioridade — default 2 quando null/invalid', () => {
  it('prioridade=null → list[].prioridade=2', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-no-pri', prioridade: null }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].prioridade).toBe(2);
  });

  it('prioridade=undefined → list[].prioridade=2', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-undef-pri', prioridade: undefined }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].prioridade).toBe(2);
  });

  it('prioridade=1 → preservado (Alta)', async () => {
    (storage.listPlannedTournamentsForDayDetail as any).mockResolvedValue([
      makePlanned({ id: 'pt-alta', prioridade: 1 }),
    ]);
    const r = await getDayDetail({
      userId: 'USER-0001',
      profileLetter: 'A',
      dayOfWeek: 0,
    });
    expect(r.list[0].prioridade).toBe(1);
  });
});
