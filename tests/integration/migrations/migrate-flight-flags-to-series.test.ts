import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-17: script de migracao de flags ADR-031 para
// tournament_series.
//
// Spec : Docs/specs/sprint-flight-1.md (RF-17)
// ADR  : 090 (single source of truth)
//
// Script esperado: scripts/migrate-flight-flags-to-series.ts
// Exporta:
//   migrateFlightFlagsToSeries(opts: { dryRun?: boolean })
//     -> { seriesCreated, tournamentsLinked, baggedAtPopulated, warnings }
//
// O script:
//  1. Scaneia tournaments com isFlight=true.
//  2. Agrupa por flightParentId (quando setado) OU por (userId, name, site)
//     quando flightParentId IS NULL — heuristica.
//  3. Para cada grupo: cria tournament_series + popula seriesId nas entries.
//  4. Para entries com flightAdvanced=true, popula baggedAt = createdAt
//     (proxy temporal).
//  5. Idempotente: rodar 2x NAO duplica series.
//  6. Modo dry-run: nao persiste.
//
// Mocks: db Drizzle no nivel do storage.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getTournamentsWithFlightFlags: vi.fn(),
    getSeriesByUserId: vi.fn(),
    createSeries: vi.fn(),
    linkTournamentToSeries: vi.fn(),
    setTournamentBaggedAt: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn({})),
  },
}));

import { storage } from '../../../server/storage';

async function importMigration() {
  // Path canonico — implementer pode ajustar mas teste exige esse arquivo.
  const mod = await import('../../../scripts/migrate-flight-flags-to-series');
  if (typeof (mod as any).migrateFlightFlagsToSeries !== 'function') {
    throw new Error('export migrateFlightFlagsToSeries faltando');
  }
  return (mod as any).migrateFlightFlagsToSeries;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Cenarios
// ---------------------------------------------------------------------------

describe('migrateFlightFlagsToSeries — happy paths (RF-17)', () => {
  it('agrupa por flightParentId quando setado e cria 1 serie por grupo', async () => {
    // 3 tournaments com mesmo flightParentId -> 1 serie
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      {
        id: 't-day1a',
        userId: 'USER-0001',
        name: 'Sunday Million Phased Day 1A',
        site: 'PokerStars',
        isFlight: true,
        flightParentId: 't-parent-id',
        flightDay: '1A',
        flightAdvanced: true,
        createdAt: new Date('2026-04-28T18:00:00Z'),
        datePlayed: new Date('2026-04-28T18:00:00Z'),
      },
      {
        id: 't-day1b',
        userId: 'USER-0001',
        name: 'Sunday Million Phased Day 1B',
        site: 'PokerStars',
        isFlight: true,
        flightParentId: 't-parent-id',
        flightDay: '1B',
        flightAdvanced: false,
        createdAt: new Date('2026-04-28T19:00:00Z'),
        datePlayed: new Date('2026-04-28T19:00:00Z'),
      },
      {
        id: 't-parent-id',
        userId: 'USER-0001',
        name: 'Sunday Million Phased',
        site: 'PokerStars',
        isFlight: true,
        flightParentId: null,
        flightDay: 'Day 2',
        flightAdvanced: null,
        createdAt: new Date('2026-04-29T19:00:00Z'),
        datePlayed: new Date('2026-04-29T19:00:00Z'),
      },
    ]);
    (storage.getSeriesByUserId as any).mockResolvedValue([]);
    (storage.createSeries as any).mockResolvedValue({ id: 'srs-new' });
    (storage.linkTournamentToSeries as any).mockResolvedValue({});
    (storage.setTournamentBaggedAt as any).mockResolvedValue({});

    const migrate = await importMigration();
    const result = await migrate({ dryRun: false });

    expect(result.seriesCreated).toBeGreaterThanOrEqual(1);
    expect(storage.createSeries).toHaveBeenCalledTimes(1);
    // 3 tournaments linkados a serie
    expect(storage.linkTournamentToSeries).toHaveBeenCalledTimes(3);
  });

  it('agrupa por (name, site) quando flightParentId IS NULL — heuristica', async () => {
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      {
        id: 't-1', userId: 'USER-0001',
        name: 'Bigger Phased', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        flightDay: '1A', flightAdvanced: true,
        createdAt: new Date('2026-04-28'), datePlayed: new Date('2026-04-28'),
      },
      {
        id: 't-2', userId: 'USER-0001',
        name: 'Bigger Phased', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        flightDay: '1B', flightAdvanced: false,
        createdAt: new Date('2026-04-28'), datePlayed: new Date('2026-04-28'),
      },
    ]);
    (storage.getSeriesByUserId as any).mockResolvedValue([]);
    (storage.createSeries as any).mockResolvedValue({ id: 'srs-h-1' });
    (storage.linkTournamentToSeries as any).mockResolvedValue({});
    (storage.setTournamentBaggedAt as any).mockResolvedValue({});

    const migrate = await importMigration();
    const result = await migrate({ dryRun: false });

    expect(storage.createSeries).toHaveBeenCalledTimes(1);
    // Heuristica deve gerar pelo menos 1 warning de auditoria
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('flightAdvanced=true -> popula baggedAt = createdAt (proxy)', async () => {
    const created = new Date('2026-04-28T18:00:00Z');
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      {
        id: 't-1', userId: 'USER-0001',
        name: 'Phased', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        flightAdvanced: true,
        createdAt: created, datePlayed: created,
      },
    ]);
    (storage.getSeriesByUserId as any).mockResolvedValue([]);
    (storage.createSeries as any).mockResolvedValue({ id: 'srs-1' });
    (storage.linkTournamentToSeries as any).mockResolvedValue({});
    let baggedAtCaptured: any = null;
    (storage.setTournamentBaggedAt as any).mockImplementation(async (_tid: string, ts: Date) => {
      baggedAtCaptured = ts;
      return {};
    });

    const migrate = await importMigration();
    await migrate({ dryRun: false });

    expect(baggedAtCaptured).toEqual(created);
  });

  it('flightAdvanced=false -> NAO popula baggedAt (entries que perderam Day 1)', async () => {
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      {
        id: 't-1', userId: 'USER-0001',
        name: 'Phased', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        flightAdvanced: false,
        createdAt: new Date(), datePlayed: new Date(),
      },
    ]);
    (storage.getSeriesByUserId as any).mockResolvedValue([]);
    (storage.createSeries as any).mockResolvedValue({ id: 'srs-1' });
    (storage.linkTournamentToSeries as any).mockResolvedValue({});

    const migrate = await importMigration();
    await migrate({ dryRun: false });

    expect(storage.setTournamentBaggedAt).not.toHaveBeenCalled();
  });
});

describe('migrateFlightFlagsToSeries — idempotencia (RF-17)', () => {
  it('rodar 2x NAO duplica series (verifica via getSeriesByUserId pre-existencia)', async () => {
    const tournaments = [
      {
        id: 't-1', userId: 'USER-0001',
        name: 'Phased', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        flightAdvanced: true,
        createdAt: new Date(), datePlayed: new Date(),
      },
    ];
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue(tournaments);

    // 1a run: nenhuma serie ainda
    (storage.getSeriesByUserId as any).mockResolvedValueOnce([]);
    (storage.createSeries as any).mockResolvedValueOnce({
      id: 'srs-1',
      userId: 'USER-0001',
      name: 'Phased',
      network: 'PokerStars',
    });
    (storage.linkTournamentToSeries as any).mockResolvedValue({});
    (storage.setTournamentBaggedAt as any).mockResolvedValue({});

    const migrate = await importMigration();
    await migrate({ dryRun: false });

    // 2a run: serie ja existe (heuristica name+site identifica)
    (storage.getSeriesByUserId as any).mockResolvedValueOnce([
      { id: 'srs-1', userId: 'USER-0001', name: 'Phased', network: 'PokerStars' },
    ]);
    // tournament ja tem seriesId setado (mock simulando state pos run 1)
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      { ...tournaments[0], seriesId: 'srs-1' },
    ]);

    const createCallsBefore = (storage.createSeries as any).mock.calls.length;
    await migrate({ dryRun: false });
    const createCallsAfter = (storage.createSeries as any).mock.calls.length;

    // NAO deve ter criado serie nova na 2a run
    expect(createCallsAfter).toBe(createCallsBefore);
  });
});

describe('migrateFlightFlagsToSeries — dry-run (RF-17)', () => {
  it('dryRun=true NAO persiste (zero chamadas a createSeries)', async () => {
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      {
        id: 't-1', userId: 'USER-0001',
        name: 'Phased', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        flightAdvanced: true,
        createdAt: new Date(), datePlayed: new Date(),
      },
    ]);
    (storage.getSeriesByUserId as any).mockResolvedValue([]);

    const migrate = await importMigration();
    const result = await migrate({ dryRun: true });

    expect(storage.createSeries).not.toHaveBeenCalled();
    expect(storage.linkTournamentToSeries).not.toHaveBeenCalled();
    expect(storage.setTournamentBaggedAt).not.toHaveBeenCalled();
    // Mas deve reportar quantos teria criado
    expect(result.seriesCreated).toBeGreaterThanOrEqual(1);
  });
});

describe('migrateFlightFlagsToSeries — edge cases (RF-17)', () => {
  it('tournament isFlight=true SEM flightParentId E SEM grupo heuristico -> serie individual totalDay1s=1 stackMode=single', async () => {
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      {
        id: 't-orphan',
        userId: 'USER-0001',
        name: 'Lonely Phased',
        site: 'PokerStars',
        isFlight: true,
        flightParentId: null,
        flightAdvanced: false,
        createdAt: new Date(), datePlayed: new Date(),
      },
    ]);
    (storage.getSeriesByUserId as any).mockResolvedValue([]);
    let createPayload: any = null;
    (storage.createSeries as any).mockImplementation(async (_uid: string, payload: any) => {
      createPayload = payload;
      return { id: 'srs-orphan' };
    });
    (storage.linkTournamentToSeries as any).mockResolvedValue({});

    const migrate = await importMigration();
    await migrate({ dryRun: false });

    expect(createPayload).toMatchObject({
      totalDay1s: 1,
      stackMode: 'single',
    });
  });

  it('grupo (name, site) sem critery extra emite warning (heuristica imprecisa)', async () => {
    // 2 torneios "Sunday Million" mesma site mas datas DIFERENTES
    // (ex: founder pagou Day 1 do Sunday Million em duas semanas distintas)
    // — heuristica tende a agrupar mas warning permite founder revisar.
    (storage.getTournamentsWithFlightFlags as any).mockResolvedValue([
      {
        id: 't-week1', userId: 'USER-0001',
        name: 'Sunday Million', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        createdAt: new Date('2026-03-01'), datePlayed: new Date('2026-03-01'),
      },
      {
        id: 't-week3', userId: 'USER-0001',
        name: 'Sunday Million', site: 'PokerStars',
        isFlight: true, flightParentId: null,
        createdAt: new Date('2026-03-22'), datePlayed: new Date('2026-03-22'),
      },
    ]);
    (storage.getSeriesByUserId as any).mockResolvedValue([]);
    (storage.createSeries as any).mockResolvedValue({ id: 'srs-x' });
    (storage.linkTournamentToSeries as any).mockResolvedValue({});

    const migrate = await importMigration();
    const result = await migrate({ dryRun: false });

    // Espera-se warning sobre agrupamento heuristico (founder revisa)
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
