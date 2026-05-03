import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-03 + RF-04: handlers HTTP /api/tournament-series
//
// Spec : Docs/specs/sprint-flight-1.md (RF-03, RF-04)
// ADRs : 090 (single source of truth), 091 (stack_mode enum)
//
// Endpoints esperados em server/routes/tournament-series.ts:
//   GET    /api/tournament-series                        -> handleGetSeriesList
//   POST   /api/tournament-series                        -> handlePostSeries
//   GET    /api/tournament-series/:id                    -> handleGetSeriesById
//   PATCH  /api/tournament-series/:id                    -> handlePatchSeries
//   DELETE /api/tournament-series/:id                    -> handleDeleteSeries
//   POST   /api/tournament-series/:id/mark-bagged        -> handleMarkBagged
//
// Mocks: storage methods (RF-02). Cada teste valida shape + status code +
// owner check + 4xx/5xx mapping.
// =============================================================================

vi.mock('../../server/storage', () => ({
  storage: {
    createSeries: vi.fn(),
    getSeriesByUserId: vi.fn(),
    getSeriesById: vi.fn(),
    updateSeries: vi.fn(),
    deleteSeries: vi.fn(),
    linkTournamentToSeries: vi.fn(),
    linkPlannedToSeries: vi.fn(),
    getEntriesBySeriesId: vi.fn(),
    getPlannedBySeriesId: vi.fn(),
    markSeriesAsCompleted: vi.fn(),
    getTournamentById: vi.fn(),
    createPlannedTournament: vi.fn(),
    getPlannedTournamentsByUser: vi.fn(),
    getPlannedTournamentBySeriesAndDow: vi.fn(),
    updatePlannedTournament: vi.fn(),
    updateTournament: vi.fn(),
    // Sprint Flight-1 R2 fix B4: handler usa setTournamentBaggedAt (assinatura real),
    // nao updateTournament(userId, tid, patch) que tinha assinatura errada nos mocks.
    setTournamentBaggedAt: vi.fn(),
  },
}));

import {
  handleGetSeriesList,
  handlePostSeries,
  handleGetSeriesById,
  handlePatchSeries,
  handleDeleteSeries,
  handleMarkBagged,
} from '../../server/routes/tournament-series';
import { storage } from '../../server/storage';

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    query: {},
    params: {},
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  res.send = (data?: any) => { res.body = data ?? null; return res; };
  return res;
}

// =============================================================================
// GET /api/tournament-series (RF-03)
// =============================================================================

describe('GET /api/tournament-series (RF-03)', () => {
  it('happy path: retorna lista do user', async () => {
    (storage.getSeriesByUserId as any).mockResolvedValue([
      { id: 'srs-1', userId: 'USER-0001', name: 'A', day2Status: 'pending' },
      { id: 'srs-2', userId: 'USER-0001', name: 'B', day2Status: 'completed' },
    ]);
    const req = makeReq();
    const res = makeRes();
    await handleGetSeriesList(req, res);
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
  });

  it('aceita filter status=pending', async () => {
    (storage.getSeriesByUserId as any).mockResolvedValue([
      { id: 'srs-1', userId: 'USER-0001', day2Status: 'pending' },
    ]);
    const req = makeReq({ query: { status: 'pending' } });
    const res = makeRes();
    await handleGetSeriesList(req, res);
    expect(res.statusCode).toBe(200);
    expect(storage.getSeriesByUserId).toHaveBeenCalledWith(
      'USER-0001',
      expect.objectContaining({ status: 'pending' }),
    );
  });

  it('401 sem auth', async () => {
    const req = makeReq({ user: null });
    const res = makeRes();
    await handleGetSeriesList(req, res);
    expect(res.statusCode).toBe(401);
  });
});

// =============================================================================
// POST /api/tournament-series (RF-03)
// =============================================================================

describe('POST /api/tournament-series (RF-03)', () => {
  const validBody = {
    name: 'Sunday Million Phased',
    network: 'PokerStars',
    totalDay1s: 17,
    day2DateTime: '2026-05-10T19:00:00Z',
    stackMode: 'combined',
  };

  it('201 cria serie com payload valido', async () => {
    (storage.createSeries as any).mockResolvedValue({
      id: 'srs-new',
      userId: 'USER-0001',
      ...validBody,
      day2Status: 'pending',
    });
    const req = makeReq({ body: validBody });
    const res = makeRes();
    await handlePostSeries(req, res);
    expect(res.statusCode).toBe(201);
    expect(res.body).toMatchObject({ id: 'srs-new', name: validBody.name });
  });

  it('400 sem name', async () => {
    const req = makeReq({ body: { ...validBody, name: undefined } });
    const res = makeRes();
    await handlePostSeries(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400 stackMode='best' (fora do enum, ADR-091)", async () => {
    const req = makeReq({ body: { ...validBody, stackMode: 'best' } });
    const res = makeRes();
    await handlePostSeries(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 totalDay1s=-1 (negativo)', async () => {
    const req = makeReq({ body: { ...validBody, totalDay1s: -1 } });
    const res = makeRes();
    await handlePostSeries(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('aceita totalDay1s=0 (D9 — late-reg direto)', async () => {
    (storage.createSeries as any).mockResolvedValue({
      id: 'srs-x', userId: 'USER-0001', ...validBody, totalDay1s: 0,
    });
    const req = makeReq({ body: { ...validBody, totalDay1s: 0 } });
    const res = makeRes();
    await handlePostSeries(req, res);
    expect(res.statusCode).toBe(201);
  });

  it('500 quando storage lanca', async () => {
    (storage.createSeries as any).mockRejectedValue(new Error('db boom'));
    const req = makeReq({ body: validBody });
    const res = makeRes();
    await handlePostSeries(req, res);
    expect(res.statusCode).toBe(500);
  });
});

// =============================================================================
// GET /api/tournament-series/:id (RF-03)
// =============================================================================

describe('GET /api/tournament-series/:id (RF-03)', () => {
  it('200 retorna {series, entries, planneds}', async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001', name: 'A',
    });
    (storage.getEntriesBySeriesId as any).mockResolvedValue([
      { id: 't-1', name: 'Day 1A' },
    ]);
    (storage.getPlannedBySeriesId as any).mockResolvedValue([
      { id: 'p-1', name: 'A — Day 2' },
    ]);

    const req = makeReq({ params: { id: 'srs-1' } });
    const res = makeRes();
    await handleGetSeriesById(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      series: { id: 'srs-1' },
      entries: expect.any(Array),
      planneds: expect.any(Array),
    });
  });

  it('404 quando serie nao existe', async () => {
    (storage.getSeriesById as any).mockResolvedValue(null);
    const req = makeReq({ params: { id: 'no-such-id' } });
    const res = makeRes();
    await handleGetSeriesById(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('404 cross-user (serie de outro user)', async () => {
    (storage.getSeriesById as any).mockResolvedValue(null);
    const req = makeReq({ params: { id: 'srs-of-other' } });
    const res = makeRes();
    await handleGetSeriesById(req, res);
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// PATCH /api/tournament-series/:id (RF-03 + RF-14)
// =============================================================================

describe('PATCH /api/tournament-series/:id (RF-03)', () => {
  it('200 aplica patch parcial', async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001', day2DateTime: new Date(),
    });
    (storage.updateSeries as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001', name: 'Renamed',
    });
    const req = makeReq({ params: { id: 'srs-1' }, body: { name: 'Renamed' } });
    const res = makeRes();
    await handlePatchSeries(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('200 aceita body vazio (idempotente)', async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001',
    });
    (storage.updateSeries as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001',
    });
    const req = makeReq({ params: { id: 'srs-1' }, body: {} });
    const res = makeRes();
    await handlePatchSeries(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('404 quando serie nao existe', async () => {
    (storage.getSeriesById as any).mockResolvedValue(null);
    const req = makeReq({ params: { id: 'srs-x' }, body: { name: 'x' } });
    const res = makeRes();
    await handlePatchSeries(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('side-effect: atualiza planned_tournaments quando day2DateTime muda (RF-14)', async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001',
      day2DateTime: new Date('2026-05-10T19:00:00Z'),
    });
    (storage.updateSeries as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001',
      day2DateTime: new Date('2026-05-11T20:00:00Z'),
    });
    (storage.getPlannedBySeriesId as any).mockResolvedValue([
      { id: 'p-1', seriesId: 'srs-1' },
    ]);
    (storage.updatePlannedTournament as any).mockResolvedValue({
      id: 'p-1', startTime: new Date('2026-05-11T20:00:00Z'),
    });

    const req = makeReq({
      params: { id: 'srs-1' },
      body: { day2DateTime: '2026-05-11T20:00:00Z' },
    });
    const res = makeRes();
    await handlePatchSeries(req, res);
    expect(res.statusCode).toBe(200);
    expect(storage.updatePlannedTournament).toHaveBeenCalled();
  });
});

// =============================================================================
// DELETE /api/tournament-series/:id (RF-03)
// =============================================================================

describe('DELETE /api/tournament-series/:id (RF-03)', () => {
  it('204 hard-delete', async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      id: 'srs-1', userId: 'USER-0001',
    });
    (storage.deleteSeries as any).mockResolvedValue(undefined);
    const req = makeReq({ params: { id: 'srs-1' } });
    const res = makeRes();
    await handleDeleteSeries(req, res);
    expect(res.statusCode).toBe(204);
  });

  it('404 cross-user', async () => {
    (storage.getSeriesById as any).mockResolvedValue(null);
    const req = makeReq({ params: { id: 'srs-other' } });
    const res = makeRes();
    await handleDeleteSeries(req, res);
    expect(res.statusCode).toBe(404);
  });
});

// =============================================================================
// POST /api/tournament-series/:id/mark-bagged (RF-04)
// =============================================================================

describe('POST /api/tournament-series/:id/mark-bagged (RF-04)', () => {
  const series = {
    id: 'srs-1',
    userId: 'USER-0001',
    name: 'Sunday Million Phased',
    network: 'PokerStars',
    day2DateTime: new Date('2026-05-10T19:00:00Z'),
    day2Status: 'pending',
    stackMode: 'combined',
  };
  const tournament = {
    id: 't-day1a',
    userId: 'USER-0001',
    seriesId: 'srs-1',
    baggedAt: null,
  };

  it('200 cria planned Day 2 quando nao existia (idempotencia=insert)', async () => {
    (storage.getSeriesById as any).mockResolvedValue(series);
    (storage.getTournamentById as any).mockResolvedValue(tournament);
    (storage.getPlannedBySeriesId as any).mockResolvedValue([]);
    (storage.createPlannedTournament as any).mockResolvedValue({
      id: 'p-new',
      seriesId: 'srs-1',
      name: 'Sunday Million Phased — Day 2',
      startTime: series.day2DateTime,
      status: 'upcoming',
    });
    (storage.updateTournament as any).mockResolvedValue({
      ...tournament,
      baggedAt: new Date(),
    });
    (storage.updateSeries as any).mockResolvedValue(series);

    const req = makeReq({
      params: { id: 'srs-1' },
      body: { tournamentId: 't-day1a' },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      series: expect.objectContaining({ id: 'srs-1' }),
      plannedDay2: expect.objectContaining({ id: 'p-new' }),
    });
    expect(storage.createPlannedTournament).toHaveBeenCalledTimes(1);
  });

  it('200 idempotente: ja existe planned Day 2 com mesmo dayOfWeek -> NAO duplica', async () => {
    (storage.getSeriesById as any).mockResolvedValue(series);
    (storage.getTournamentById as any).mockResolvedValue(tournament);
    (storage.getPlannedBySeriesId as any).mockResolvedValue([
      {
        id: 'p-existing',
        seriesId: 'srs-1',
        startTime: series.day2DateTime,
      },
    ]);
    (storage.updateTournament as any).mockResolvedValue({
      ...tournament,
      baggedAt: new Date(),
    });
    (storage.updateSeries as any).mockResolvedValue(series);

    const req = makeReq({
      params: { id: 'srs-1' },
      body: { tournamentId: 't-day1a' },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);

    expect(res.statusCode).toBe(200);
    expect(storage.createPlannedTournament).not.toHaveBeenCalled();
  });

  it('200 atualiza datetime do planned existente quando body trouxe novo day2DateTime', async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      ...series,
      day2DateTime: new Date('2026-05-10T19:00:00Z'),
    });
    (storage.getTournamentById as any).mockResolvedValue(tournament);
    (storage.getPlannedBySeriesId as any).mockResolvedValue([
      {
        id: 'p-existing',
        seriesId: 'srs-1',
        startTime: new Date('2026-05-10T19:00:00Z'),
      },
    ]);
    (storage.updatePlannedTournament as any).mockResolvedValue({
      id: 'p-existing',
      startTime: new Date('2026-05-10T20:00:00Z'),
    });
    (storage.updateTournament as any).mockResolvedValue(tournament);
    (storage.updateSeries as any).mockResolvedValue(series);

    const req = makeReq({
      params: { id: 'srs-1' },
      body: {
        tournamentId: 't-day1a',
        day2DateTime: '2026-05-10T20:00:00Z',
      },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);

    expect(res.statusCode).toBe(200);
    expect(storage.updatePlannedTournament).toHaveBeenCalled();
  });

  it("404 quando tournament.seriesId !== :id (entry nao linkada)", async () => {
    (storage.getSeriesById as any).mockResolvedValue(series);
    (storage.getTournamentById as any).mockResolvedValue({
      ...tournament,
      seriesId: 'OUTRA-srs',
    });
    const req = makeReq({
      params: { id: 'srs-1' },
      body: { tournamentId: 't-day1a' },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);
    expect(res.statusCode).toBe(404);
  });

  it("409 quando series.day2Status === 'completed'", async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      ...series,
      day2Status: 'completed',
    });
    (storage.getTournamentById as any).mockResolvedValue(tournament);
    const req = makeReq({
      params: { id: 'srs-1' },
      body: { tournamentId: 't-day1a' },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);
    expect(res.statusCode).toBe(409);
  });

  it('400 quando series.day2DateTime nao definido E body sem day2DateTime', async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      ...series,
      day2DateTime: null as any,
    });
    (storage.getTournamentById as any).mockResolvedValue(tournament);
    const req = makeReq({
      params: { id: 'srs-1' },
      body: { tournamentId: 't-day1a' },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("409 mudar stackMode apos completed (afeta P&L retroativo)", async () => {
    (storage.getSeriesById as any).mockResolvedValue({
      ...series,
      day2Status: 'completed',
    });
    (storage.getTournamentById as any).mockResolvedValue(tournament);
    const req = makeReq({
      params: { id: 'srs-1' },
      body: { tournamentId: 't-day1a', stackMode: 'single' },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);
    expect(res.statusCode).toBe(409);
  });

  it('seta tournament.baggedAt = NOW() (substitui flightAdvanced legado, ADR-090)', async () => {
    (storage.getSeriesById as any).mockResolvedValue(series);
    (storage.getTournamentById as any).mockResolvedValue(tournament);
    (storage.getPlannedBySeriesId as any).mockResolvedValue([]);
    (storage.createPlannedTournament as any).mockResolvedValue({ id: 'p-new' });
    (storage.updateSeries as any).mockResolvedValue(series);
    let baggedAtCaptured: any = null;
    // Sprint Flight-1 R2 fix B4: usa setTournamentBaggedAt(tid, date) — assinatura
    // real do storage. Anteriormente mockou updateTournament(userId, tid, patch)
    // que era assinatura errada (reviewer R1 BLOCKER B4).
    (storage.setTournamentBaggedAt as any).mockImplementation(async (_tid: string, baggedAt: Date) => {
      baggedAtCaptured = baggedAt;
      return { ...tournament, baggedAt };
    });

    const req = makeReq({
      params: { id: 'srs-1' },
      body: { tournamentId: 't-day1a' },
    });
    const res = makeRes();
    await handleMarkBagged(req, res);

    expect(baggedAtCaptured).toBeInstanceOf(Date);
  });
});
