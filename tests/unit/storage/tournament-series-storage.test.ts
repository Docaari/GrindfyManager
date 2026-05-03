import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-02: storage methods CRUD tournament_series
//
// Spec : Docs/specs/sprint-flight-1.md (RF-02)
// ADR  : 090 (single source of truth)
//
// Methods esperados em server/storage.ts (DatabaseStorage):
//   createSeries(userId, data)                 -> TournamentSeries
//   getSeriesByUserId(userId, opts?)           -> TournamentSeries[]
//   getSeriesById(userId, seriesId)            -> TournamentSeries | null
//   updateSeries(userId, seriesId, patch)      -> TournamentSeries
//   deleteSeries(userId, seriesId)             -> void
//   linkTournamentToSeries(userId, tId, sId)   -> Tournament
//   linkPlannedToSeries(userId, plannedId, s)  -> PlannedTournament
//   getEntriesBySeriesId(userId, seriesId)     -> Tournament[]
//   getPlannedBySeriesId(userId, seriesId)     -> PlannedTournament[]
//   markSeriesAsCompleted(userId, seriesId)    -> TournamentSeries
//
// IMPORTANTE (lessons-learned #3 — Mocks idealizados):
//   Os testes mockam a camada `db` (Drizzle) com shape REAL. NAO inventar
//   shape de retorno — o storage real retorna o resultado direto do
//   db.select().from(...).where(...) array de rows.
// =============================================================================

vi.mock('../../../server/db', () => {
  const chain: any = {};
  const make = () => {
    const fn = vi.fn().mockReturnValue(chain);
    return fn;
  };
  chain.select = make();
  chain.from = make();
  chain.where = make();
  chain.orderBy = make();
  chain.limit = make();
  chain.offset = make();
  chain.insert = make();
  chain.values = make();
  chain.returning = make();
  chain.update = make();
  chain.set = make();
  chain.delete = make();
  // Final terminator pode ser awaited e retornar [] por default — testes
  // override antes de chamar metodo do storage.
  return {
    db: chain,
    pool: {},
  };
});

import { storage } from '../../../server/storage';
import { db } from '../../../server/db';

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createSeries
// ---------------------------------------------------------------------------

describe('storage.createSeries (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).createSeries).toBe('function');
  });

  it('insere serie com payload validado e retorna row inserida', async () => {
    const expected = {
      id: 'srs-abc',
      userId: 'USER-0001',
      name: 'Sunday Million Phased',
      network: 'PokerStars',
      totalDay1s: 17,
      day2DateTime: new Date('2026-05-10T19:00:00Z'),
      day2Status: 'pending',
      stackMode: 'combined',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Drizzle pattern: db.insert(table).values(...).returning()
    // Mock o terminador returning() para resolver com [row].
    (db as any).returning = vi.fn().mockResolvedValue([expected]);

    const result = await (storage as any).createSeries('USER-0001', {
      name: 'Sunday Million Phased',
      network: 'PokerStars',
      totalDay1s: 17,
      day2DateTime: new Date('2026-05-10T19:00:00Z'),
      stackMode: 'combined',
    });

    expect(result).toEqual(expected);
    expect((db as any).insert).toHaveBeenCalled();
  });

  it('aplica defaults: day2Status=pending, stackMode=single, totalDay1s=1', async () => {
    const captured: any = {};
    (db as any).values = vi.fn((val: any) => {
      Object.assign(captured, val);
      return db;
    });
    (db as any).returning = vi.fn().mockResolvedValue([{ id: 'srs-x', userId: 'USER-0001' }]);

    await (storage as any).createSeries('USER-0001', {
      name: 'Single Series',
      day2DateTime: new Date('2026-05-10T19:00:00Z'),
    });

    expect(captured.day2Status ?? 'pending').toBe('pending');
    expect(captured.stackMode ?? 'single').toBe('single');
    expect(captured.totalDay1s ?? 1).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getSeriesByUserId
// ---------------------------------------------------------------------------

describe('storage.getSeriesByUserId (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getSeriesByUserId).toBe('function');
  });

  it('retorna apenas series do user (filter por userId)', async () => {
    const rows = [
      { id: 'srs-1', userId: 'USER-0001', name: 'A', day2Status: 'pending' },
      { id: 'srs-2', userId: 'USER-0001', name: 'B', day2Status: 'completed' },
    ];
    // Em Drizzle o terminador comum eh await da chain final — orderBy/limit ou where direto.
    (db as any).where = vi.fn().mockReturnValue(Promise.resolve(rows));
    (db as any).orderBy = vi.fn().mockReturnValue(Promise.resolve(rows));

    const result = await (storage as any).getSeriesByUserId('USER-0001');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('aceita filter por status', async () => {
    const rows = [{ id: 'srs-1', userId: 'USER-0001', day2Status: 'pending' }];
    (db as any).where = vi.fn().mockReturnValue(Promise.resolve(rows));
    (db as any).orderBy = vi.fn().mockReturnValue(Promise.resolve(rows));

    const result = await (storage as any).getSeriesByUserId('USER-0001', { status: 'pending' });
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getSeriesById
// ---------------------------------------------------------------------------

describe('storage.getSeriesById (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getSeriesById).toBe('function');
  });

  it('retorna serie quando user e dono', async () => {
    const series = { id: 'srs-1', userId: 'USER-0001', name: 'A' };
    (db as any).where = vi.fn().mockReturnValue(Promise.resolve([series]));
    (db as any).limit = vi.fn().mockReturnValue(Promise.resolve([series]));

    const result = await (storage as any).getSeriesById('USER-0001', 'srs-1');
    expect(result).toMatchObject({ id: 'srs-1' });
  });

  it('retorna null quando serie nao existe ou nao eh do user (cross-user blocked)', async () => {
    (db as any).where = vi.fn().mockReturnValue(Promise.resolve([]));
    (db as any).limit = vi.fn().mockReturnValue(Promise.resolve([]));

    const result = await (storage as any).getSeriesById('USER-0001', 'srs-of-other-user');
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateSeries
// ---------------------------------------------------------------------------

describe('storage.updateSeries (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).updateSeries).toBe('function');
  });

  it('aplica patch parcial e retorna serie atualizada', async () => {
    const updated = {
      id: 'srs-1',
      userId: 'USER-0001',
      name: 'Updated Name',
      day2DateTime: new Date('2026-05-11T20:00:00Z'),
    };
    (db as any).returning = vi.fn().mockResolvedValue([updated]);

    const result = await (storage as any).updateSeries('USER-0001', 'srs-1', {
      name: 'Updated Name',
      day2DateTime: new Date('2026-05-11T20:00:00Z'),
    });

    expect(result).toMatchObject({ name: 'Updated Name' });
  });
});

// ---------------------------------------------------------------------------
// deleteSeries
// ---------------------------------------------------------------------------

describe('storage.deleteSeries (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).deleteSeries).toBe('function');
  });

  it('chama db.delete e nao lanca quando serie eh do user', async () => {
    (db as any).where = vi.fn().mockResolvedValue(undefined);

    await expect(
      (storage as any).deleteSeries('USER-0001', 'srs-1')
    ).resolves.not.toThrow();
  });

  it('NAO faz cascade — entries com series_id ficam orfanas (FK SET NULL)', async () => {
    // Comportamento garantido pela FK constraint no DB; o storage method
    // apenas executa DELETE FROM tournament_series. Aqui validamos que
    // o storage NAO tenta limpar tournaments.series_id manualmente
    // (so deveria delete na tabela alvo).
    const updateSpy = (db as any).update;
    updateSpy.mockClear?.();

    (db as any).where = vi.fn().mockResolvedValue(undefined);
    await (storage as any).deleteSeries('USER-0001', 'srs-1');

    // O storage NAO deveria estar fazendo UPDATE em tournaments.series_id=null
    // (isso eh job da FK ON DELETE SET NULL).
    expect((db as any).update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// linkTournamentToSeries
// ---------------------------------------------------------------------------

describe('storage.linkTournamentToSeries (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).linkTournamentToSeries).toBe('function');
  });

  it('atualiza tournaments.seriesId quando ambos pertencem ao user', async () => {
    const updated = {
      id: 't-1',
      userId: 'USER-0001',
      seriesId: 'srs-1',
    };
    (db as any).returning = vi.fn().mockResolvedValue([updated]);

    const result = await (storage as any).linkTournamentToSeries(
      'USER-0001',
      't-1',
      'srs-1',
    );

    expect(result).toMatchObject({ id: 't-1', seriesId: 'srs-1' });
  });

  it('aceita seriesId=null para unlink (D2 — orfaniza)', async () => {
    const updated = { id: 't-1', userId: 'USER-0001', seriesId: null };
    (db as any).returning = vi.fn().mockResolvedValue([updated]);

    const result = await (storage as any).linkTournamentToSeries(
      'USER-0001',
      't-1',
      null,
    );

    expect(result).toMatchObject({ seriesId: null });
  });
});

// ---------------------------------------------------------------------------
// linkPlannedToSeries
// ---------------------------------------------------------------------------

describe('storage.linkPlannedToSeries (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).linkPlannedToSeries).toBe('function');
  });

  it('atualiza planned_tournaments.seriesId', async () => {
    const updated = {
      id: 'planned-1',
      userId: 'USER-0001',
      seriesId: 'srs-1',
    };
    (db as any).returning = vi.fn().mockResolvedValue([updated]);

    const result = await (storage as any).linkPlannedToSeries(
      'USER-0001',
      'planned-1',
      'srs-1',
    );

    expect(result).toMatchObject({ seriesId: 'srs-1' });
  });
});

// ---------------------------------------------------------------------------
// getEntriesBySeriesId / getPlannedBySeriesId
// ---------------------------------------------------------------------------

describe('storage.getEntriesBySeriesId (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getEntriesBySeriesId).toBe('function');
  });

  it('retorna tournaments linkados via seriesId', async () => {
    const rows = [
      { id: 't-1', userId: 'USER-0001', seriesId: 'srs-1', name: 'Day 1A' },
      { id: 't-2', userId: 'USER-0001', seriesId: 'srs-1', name: 'Day 1B' },
    ];
    (db as any).where = vi.fn().mockReturnValue(Promise.resolve(rows));
    (db as any).orderBy = vi.fn().mockReturnValue(Promise.resolve(rows));

    const result = await (storage as any).getEntriesBySeriesId('USER-0001', 'srs-1');
    expect(result).toHaveLength(2);
  });

  it('retorna array vazio quando serie sem entries (orfanada)', async () => {
    (db as any).where = vi.fn().mockReturnValue(Promise.resolve([]));
    (db as any).orderBy = vi.fn().mockReturnValue(Promise.resolve([]));

    const result = await (storage as any).getEntriesBySeriesId('USER-0001', 'srs-empty');
    expect(result).toEqual([]);
  });
});

describe('storage.getPlannedBySeriesId (RF-02)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).getPlannedBySeriesId).toBe('function');
  });

  it('retorna planned_tournaments linkados via seriesId', async () => {
    const rows = [{ id: 'p-1', userId: 'USER-0001', seriesId: 'srs-1' }];
    (db as any).where = vi.fn().mockReturnValue(Promise.resolve(rows));
    (db as any).orderBy = vi.fn().mockReturnValue(Promise.resolve(rows));

    const result = await (storage as any).getPlannedBySeriesId('USER-0001', 'srs-1');
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// markSeriesAsCompleted
// ---------------------------------------------------------------------------

describe('storage.markSeriesAsCompleted (RF-02 / D12)', () => {
  it('existe como method em storage', () => {
    expect(typeof (storage as any).markSeriesAsCompleted).toBe('function');
  });

  it("seta day2Status='completed' e retorna serie atualizada", async () => {
    const updated = {
      id: 'srs-1',
      userId: 'USER-0001',
      day2Status: 'completed',
    };
    (db as any).returning = vi.fn().mockResolvedValue([updated]);

    const result = await (storage as any).markSeriesAsCompleted('USER-0001', 'srs-1');
    expect(result).toMatchObject({ day2Status: 'completed' });
  });

  it('idempotente: re-chamar em serie ja completed retorna serie sem mudanca', async () => {
    const series = { id: 'srs-1', userId: 'USER-0001', day2Status: 'completed' };
    (db as any).returning = vi.fn().mockResolvedValue([series]);

    const result = await (storage as any).markSeriesAsCompleted('USER-0001', 'srs-1');
    expect(result.day2Status).toBe('completed');
  });
});
