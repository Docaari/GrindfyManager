import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-07: POST /api/upload/confirm-flights
//
// Spec : Docs/specs/sprint-flight-1.md (RF-07, D11)
// ADR  : 090 (single source of truth)
//
// Body shape:
//   {
//     confirmations: [
//       { tournamentId, isFlight: true, seriesId: null, newSeries: {...} },
//       { tournamentId, isFlight: true, seriesId: 'existing-id' },
//       { tournamentId, isFlight: false }                 // no-op (D10)
//     ]
//   }
//
// Cap: 50 confirmacoes/request (D11). Atomico: rollback completo se erro.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    createSeries: vi.fn(),
    getSeriesById: vi.fn(),
    linkTournamentToSeries: vi.fn(),
    getTournamentById: vi.fn(),
    transaction: vi.fn(async (fn: any) => fn({})),
  },
}));

import { storage } from '../../../server/storage';

async function importHandler() {
  const mod = await import('../../../server/routes/upload');
  const handler =
    (mod as any).handleConfirmFlights ||
    (mod as any).handlePostConfirmFlights;
  if (typeof handler !== 'function') {
    throw new Error(
      'handler de confirm-flights nao exportado de server/routes/upload.ts ' +
      '(esperado: handleConfirmFlights | handlePostConfirmFlights)',
    );
  }
  return handler;
}

beforeEach(() => {
  vi.clearAllMocks();
});

function makeReq(body: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body,
    params: {},
    query: {},
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
}

// ---------------------------------------------------------------------------
// Happy paths
// ---------------------------------------------------------------------------

describe('POST /api/upload/confirm-flights — happy paths (RF-07)', () => {
  it('cria serie nova e linka tournament', async () => {
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001',
    });
    (storage.createSeries as any).mockResolvedValue({
      id: 'srs-new', userId: 'USER-0001',
    });
    (storage.linkTournamentToSeries as any).mockResolvedValue({
      id: 't-1', seriesId: 'srs-new',
    });

    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        {
          tournamentId: 't-1',
          isFlight: true,
          seriesId: null,
          newSeries: {
            name: 'Sunday Million Phased',
            totalDay1s: 17,
            day2DateTime: '2026-05-10T19:00:00Z',
            stackMode: 'combined',
          },
        },
      ],
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      processed: 1,
      createdSeries: 1,
      linkedToExisting: 0,
      markedNotFlight: 0,
    });
  });

  it('linka tournament a serie existente', async () => {
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001',
    });
    (storage.getSeriesById as any).mockResolvedValue({
      id: 'srs-existing', userId: 'USER-0001',
    });
    (storage.linkTournamentToSeries as any).mockResolvedValue({
      id: 't-1', seriesId: 'srs-existing',
    });

    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        {
          tournamentId: 't-1',
          isFlight: true,
          seriesId: 'srs-existing',
        },
      ],
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      processed: 1,
      linkedToExisting: 1,
    });
  });

  it("isFlight=false eh no-op (markedNotFlight) — entry ja esta com seriesId=NULL (D10)", async () => {
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001', seriesId: null,
    });
    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        { tournamentId: 't-1', isFlight: false },
      ],
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      processed: 1,
      markedNotFlight: 1,
    });
    expect(storage.createSeries).not.toHaveBeenCalled();
    expect(storage.linkTournamentToSeries).not.toHaveBeenCalled();
  });

  it('mix: criar nova + linkar existente + no-op em uma mesma request', async () => {
    (storage.getTournamentById as any).mockImplementation(async (_uid: string, tid: string) => ({
      id: tid, userId: 'USER-0001', seriesId: null,
    }));
    (storage.getSeriesById as any).mockResolvedValue({
      id: 'srs-existing', userId: 'USER-0001',
    });
    (storage.createSeries as any).mockResolvedValue({ id: 'srs-new' });
    (storage.linkTournamentToSeries as any).mockResolvedValue({ id: 't-x' });

    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        {
          tournamentId: 't-1',
          isFlight: true,
          seriesId: null,
          newSeries: {
            name: 'A', totalDay1s: 1,
            day2DateTime: '2026-05-10T19:00:00Z',
            stackMode: 'single',
          },
        },
        { tournamentId: 't-2', isFlight: true, seriesId: 'srs-existing' },
        { tournamentId: 't-3', isFlight: false },
      ],
    });
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      processed: 3,
      createdSeries: 1,
      linkedToExisting: 1,
      markedNotFlight: 1,
    });
  });
});

// ---------------------------------------------------------------------------
// Validacao + Cap 50 (D11)
// ---------------------------------------------------------------------------

describe('POST /api/upload/confirm-flights — validacao (RF-07, D11)', () => {
  it('400 quando body excede 50 confirmacoes (cap D11)', async () => {
    const oversized = Array.from({ length: 51 }, (_, i) => ({
      tournamentId: 't-' + i,
      isFlight: false,
    }));
    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq({ confirmations: oversized }), res);
    expect(res.statusCode).toBe(400);
  });

  it('aceita exatamente 50 confirmacoes', async () => {
    (storage.getTournamentById as any).mockImplementation(async (_uid: string, tid: string) => ({
      id: tid, userId: 'USER-0001', seriesId: null,
    }));
    const exact50 = Array.from({ length: 50 }, (_, i) => ({
      tournamentId: 't-' + i,
      isFlight: false,
    }));
    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq({ confirmations: exact50 }), res);
    expect(res.statusCode).toBe(200);
  });

  it('400 quando tournamentIds duplicados no array', async () => {
    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        { tournamentId: 't-dup', isFlight: false },
        { tournamentId: 't-dup', isFlight: false },
      ],
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('400 quando isFlight=true sem seriesId nem newSeries', async () => {
    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        { tournamentId: 't-1', isFlight: true },
      ],
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it("400 quando newSeries.stackMode='best' (ADR-091)", async () => {
    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        {
          tournamentId: 't-1',
          isFlight: true,
          seriesId: null,
          newSeries: {
            name: 'X',
            totalDay1s: 1,
            day2DateTime: '2026-05-10T19:00:00Z',
            stackMode: 'best',
          },
        },
      ],
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('200 com confirmations=[] retorna processed=0 (idempotente)', async () => {
    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq({ confirmations: [] }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.processed).toBe(0);
  });

  it('404 quando seriesId referencia serie de outro user', async () => {
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001',
    });
    (storage.getSeriesById as any).mockResolvedValue(null);
    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        { tournamentId: 't-1', isFlight: true, seriesId: 'srs-other' },
      ],
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(404);
  });

  it('atomicidade: erro em 1 confirmation -> rollback completo (transaction)', async () => {
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001',
    });
    (storage.getSeriesById as any)
      .mockResolvedValueOnce({ id: 'srs-1', userId: 'USER-0001' })
      .mockResolvedValueOnce(null); // 2a chamada falha
    (storage.linkTournamentToSeries as any).mockResolvedValue({ id: 't-1' });

    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        { tournamentId: 't-1', isFlight: true, seriesId: 'srs-1' },
        { tournamentId: 't-2', isFlight: true, seriesId: 'srs-bad' },
      ],
    });
    const res = makeRes();
    await handler(req, res);
    // Erro parcial NAO eh permitido — atomico
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Defesa: isFlight=false em tournament que TEM seriesId — backend faz unlink
// ---------------------------------------------------------------------------

describe('POST /api/upload/confirm-flights — defesa unlink (RF-07)', () => {
  it("isFlight=false em tournament com seriesId !== null -> faz unlink (set null)", async () => {
    (storage.getTournamentById as any).mockResolvedValue({
      id: 't-1', userId: 'USER-0001', seriesId: 'srs-x',
    });
    (storage.linkTournamentToSeries as any).mockResolvedValue({
      id: 't-1', seriesId: null,
    });

    const handler = await importHandler();
    const req = makeReq({
      confirmations: [
        { tournamentId: 't-1', isFlight: false },
      ],
    });
    const res = makeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(storage.linkTournamentToSeries).toHaveBeenCalledWith(
      'USER-0001',
      't-1',
      null,
    );
  });
});
