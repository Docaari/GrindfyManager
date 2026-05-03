import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint Flight-1 — RF-06 + RF-08: POST /api/upload (ou /api/upload-history)
//
// Spec : Docs/specs/sprint-flight-1.md (RF-06, RF-08)
// ADRs : 090 (single source of truth — D10 simplificou para in-memory)
//
// Comportamento:
//  - Apos parser, chama detectFlightCandidate(name) por entry.
//  - Tournaments inseridos NORMALMENTE (series_id=NULL — D10).
//  - Response inclui pendingFlightConfirmations[] em memoria (NAO persistido).
//  - RF-08: se Day 1s + Day 2 do mesmo baseName chegam juntos, cria serie auto
//    (sem prompt) e linka via series_id no INSERT. NAO inclui em pendingFlight.
//  - Inclui autoLinkedSeries[] no response.
//
// Mocks: storage methods + parser.
// Intencao: validar shape do response e fluxo, NAO o multer real.
// =============================================================================

vi.mock('../../../server/storage', () => ({
  storage: {
    getUserSettings: vi.fn(),
    insertTournament: vi.fn(),
    createTournament: vi.fn(),
    createSeries: vi.fn(),
    linkTournamentToSeries: vi.fn(),
    getTournamentsByUserId: vi.fn(),
    createUploadHistory: vi.fn(),
  },
}));

vi.mock('../../../server/csvParser', () => ({
  PokerCSVParser: {
    parseCSV: vi.fn(),
    parseBodogXLSX: vi.fn(),
  },
}));

vi.mock('../../../server/flightDetector', () => ({
  detectFlightCandidate: vi.fn(),
}));

import { storage } from '../../../server/storage';
import { PokerCSVParser } from '../../../server/csvParser';
import { detectFlightCandidate } from '../../../server/flightDetector';

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: {} });
});

// Importacao tardia: handlers NAO existem ainda em red phase.
async function importHandler() {
  // Implementer pode criar handlers expostos (ex: handleUploadCsv) em
  // server/routes/upload.ts. Aceita-se ambos: handler nomeado OU
  // o express app montado. Aqui exigimos um handler exportado.
  const mod = await import('../../../server/routes/upload');
  // Implementer escolhe o nome — aceita varios para tolerancia.
  const handler =
    (mod as any).handleUploadCsv ||
    (mod as any).handleCsvUpload ||
    (mod as any).handleUploadHistory;
  if (typeof handler !== 'function') {
    throw new Error(
      'handler de upload nao exportado de server/routes/upload.ts ' +
      '(esperado: handleUploadCsv | handleCsvUpload | handleUploadHistory)',
    );
  }
  return handler;
}

function makeReq(overrides: any = {}) {
  return {
    user: { userPlatformId: 'USER-0001' },
    body: {},
    file: {
      buffer: Buffer.from('csv content'),
      originalname: 'history.csv',
    },
    ...overrides,
  };
}

function makeRes() {
  const res: any = { statusCode: 200, body: null };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (data: any) => { res.body = data; return res; };
  return res;
}

// ---------------------------------------------------------------------------
// RF-06: pendingFlightConfirmations no response (in-memory, NAO persistido)
// ---------------------------------------------------------------------------

describe('POST /api/upload — pendingFlightConfirmations (RF-06, D10)', () => {
  it('retorna pendingFlightConfirmations[] quando ha flight candidates', async () => {
    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-1',
        name: 'Sunday Million Phased Day 1A — $215',
        site: 'PokerStars',
        datePlayed: new Date('2026-04-28T18:00:00Z'),
        buyIn: '215.00',
      },
      {
        tournamentId: 'tid-2',
        name: 'Sunday $5 Bounty Hunter',
        site: 'PokerStars',
        datePlayed: new Date('2026-04-28T19:00:00Z'),
        buyIn: '5.00',
      },
    ]);

    (detectFlightCandidate as any).mockImplementation((name: string) => {
      if (/Day 1A/i.test(name)) {
        return {
          isFlightCandidate: true,
          baseName: 'Sunday Million Phased',
          flightDay: '1A',
        };
      }
      return { isFlightCandidate: false, baseName: name, flightDay: null };
    });

    (storage.insertTournament as any).mockImplementation(async (t: any) => ({
      ...t,
      id: 'persisted-' + t.tournamentId,
      seriesId: null,
    }));
    (storage.createTournament as any).mockImplementation(async (t: any) => ({
      ...t,
      id: 'persisted-' + (t.tournamentId ?? 'x'),
      seriesId: null,
    }));

    const handler = await importHandler();
    const req = makeReq();
    const res = makeRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      pendingFlightConfirmations: expect.any(Array),
    });
    expect(res.body.pendingFlightConfirmations).toHaveLength(1);
    expect(res.body.pendingFlightConfirmations[0]).toMatchObject({
      baseName: 'Sunday Million Phased',
      flightDay: '1A',
    });
  });

  it('tournaments com flight candidate sao inseridos com seriesId=NULL (D10)', async () => {
    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-1',
        name: 'Sunday Million Phased Day 1A',
        site: 'PokerStars',
        datePlayed: new Date(),
        buyIn: '215',
      },
    ]);
    (detectFlightCandidate as any).mockReturnValue({
      isFlightCandidate: true,
      baseName: 'Sunday Million Phased',
      flightDay: '1A',
    });

    let insertedSeriesId: any = 'NOT-SET';
    (storage.insertTournament as any).mockImplementation(async (t: any) => {
      insertedSeriesId = t.seriesId;
      return { ...t, id: 'persisted-1', seriesId: t.seriesId };
    });
    (storage.createTournament as any).mockImplementation(async (t: any) => {
      insertedSeriesId = t.seriesId;
      return { ...t, id: 'persisted-1', seriesId: t.seriesId };
    });

    const handler = await importHandler();
    await handler(makeReq(), makeRes());

    // D10: tournaments visiveis em reports IMEDIATAMENTE com seriesId=null
    expect(insertedSeriesId === null || insertedSeriesId === undefined).toBe(true);
  });

  it('response inclui pendingFlightConfirmations: [] quando nenhum candidate', async () => {
    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-1',
        name: 'Sunday $5 Bounty Hunter',
        site: 'PokerStars',
        datePlayed: new Date(),
        buyIn: '5',
      },
    ]);
    (detectFlightCandidate as any).mockReturnValue({
      isFlightCandidate: false,
      baseName: 'Sunday $5 Bounty Hunter',
      flightDay: null,
    });
    (storage.insertTournament as any).mockResolvedValue({ id: 'p-1' });
    (storage.createTournament as any).mockResolvedValue({ id: 'p-1' });

    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.body.pendingFlightConfirmations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// RF-08: auto-link Day 1 + Day 2 quando ambos chegam juntos
// ---------------------------------------------------------------------------

describe('POST /api/upload — RF-08 auto-link Day 1 + Day 2 do mesmo baseName', () => {
  it('cria serie automaticamente quando 2+ Day 1s + 1 Day 2 mesmo baseName + site + janela 1-7d', async () => {
    const day1Date = new Date('2026-04-28T18:00:00Z');
    const day2Date = new Date('2026-04-29T19:00:00Z'); // dia seguinte (1-7d)

    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-day1a',
        name: 'Sunday Million Phased Day 1A',
        site: 'PokerStars',
        datePlayed: day1Date,
        buyIn: '215',
      },
      {
        tournamentId: 'tid-day1b',
        name: 'Sunday Million Phased Day 1B',
        site: 'PokerStars',
        datePlayed: day1Date,
        buyIn: '215',
      },
      {
        tournamentId: 'tid-day2',
        name: 'Sunday Million Phased Day 2',
        site: 'PokerStars',
        datePlayed: day2Date,
        buyIn: '0',
      },
    ]);

    (detectFlightCandidate as any).mockImplementation((name: string) => {
      if (/Day 1A/i.test(name)) return { isFlightCandidate: true, baseName: 'Sunday Million Phased', flightDay: '1A' };
      if (/Day 1B/i.test(name)) return { isFlightCandidate: true, baseName: 'Sunday Million Phased', flightDay: '1B' };
      if (/Day 2/i.test(name)) return { isFlightCandidate: true, baseName: 'Sunday Million Phased', flightDay: 'Day 2' };
      return { isFlightCandidate: false, baseName: name, flightDay: null };
    });

    (storage.createSeries as any).mockResolvedValue({
      id: 'srs-auto',
      userId: 'USER-0001',
      name: 'Sunday Million Phased',
      network: 'PokerStars',
      totalDay1s: 2,
      day2DateTime: day2Date,
      day2Status: 'completed',
      stackMode: 'combined',
    });

    let linkedTournaments: string[] = [];
    (storage.insertTournament as any).mockImplementation(async (t: any) => {
      if (t.seriesId === 'srs-auto') {
        linkedTournaments.push(t.tournamentId);
      }
      return { ...t, id: 'persisted-' + t.tournamentId };
    });
    (storage.createTournament as any).mockImplementation(async (t: any) => {
      if (t.seriesId === 'srs-auto') {
        linkedTournaments.push(t.tournamentId);
      }
      return { ...t, id: 'persisted-' + t.tournamentId };
    });
    (storage.linkTournamentToSeries as any).mockImplementation(async (_uid: any, tid: string) => {
      linkedTournaments.push(tid);
      return { id: tid, seriesId: 'srs-auto' };
    });

    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      autoLinkedSeries: expect.any(Array),
    });
    expect(res.body.autoLinkedSeries[0]).toMatchObject({
      seriesId: 'srs-auto',
      name: 'Sunday Million Phased',
      entryCount: 3,
    });
    // Auto-linkados NAO aparecem em pendingFlightConfirmations
    expect(res.body.pendingFlightConfirmations).toHaveLength(0);
    // Serie criada com stackMode='combined' (>=2 Day 1s)
    const callArgs = (storage.createSeries as any).mock.calls[0]?.[1] ?? {};
    expect(callArgs.stackMode).toBe('combined');
  });

  it('cria serie com stackMode=single quando ha 1 Day 1 + 1 Day 2', async () => {
    const day1Date = new Date('2026-04-28T18:00:00Z');
    const day2Date = new Date('2026-04-29T19:00:00Z');

    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-day1a',
        name: 'Mini Phased Day 1A',
        site: 'PokerStars',
        datePlayed: day1Date,
        buyIn: '11',
      },
      {
        tournamentId: 'tid-day2',
        name: 'Mini Phased Day 2',
        site: 'PokerStars',
        datePlayed: day2Date,
        buyIn: '0',
      },
    ]);

    (detectFlightCandidate as any).mockImplementation((name: string) => {
      if (/Day 1A/i.test(name)) return { isFlightCandidate: true, baseName: 'Mini Phased', flightDay: '1A' };
      if (/Day 2/i.test(name)) return { isFlightCandidate: true, baseName: 'Mini Phased', flightDay: 'Day 2' };
      return { isFlightCandidate: false, baseName: name, flightDay: null };
    });

    (storage.createSeries as any).mockResolvedValue({
      id: 'srs-auto-single',
      stackMode: 'single',
    });
    (storage.insertTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));
    (storage.createTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));

    const handler = await importHandler();
    await handler(makeReq(), makeRes());

    const callArgs = (storage.createSeries as any).mock.calls[0]?.[1] ?? {};
    expect(callArgs.stackMode).toBe('single');
  });

  it('NAO auto-cria quando 2 Day 1s mas SEM Day 2 (vai pro modal RF-06)', async () => {
    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-a',
        name: 'Phased Day 1A',
        site: 'PokerStars',
        datePlayed: new Date(),
        buyIn: '215',
      },
      {
        tournamentId: 'tid-b',
        name: 'Phased Day 1B',
        site: 'PokerStars',
        datePlayed: new Date(),
        buyIn: '215',
      },
    ]);
    (detectFlightCandidate as any).mockImplementation((name: string) => ({
      isFlightCandidate: true,
      baseName: 'Phased',
      flightDay: name.match(/(1[AB]|Day 2)/i)?.[0] ?? null,
    }));
    (storage.insertTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));
    (storage.createTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));

    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(storage.createSeries).not.toHaveBeenCalled();
    expect(res.body.pendingFlightConfirmations.length).toBeGreaterThan(0);
  });

  it('NAO auto-cria quando 0 Day 1 + 1 Day 2 (sem entries pra linkar)', async () => {
    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-2',
        name: 'Phased Day 2',
        site: 'PokerStars',
        datePlayed: new Date(),
        buyIn: '0',
      },
    ]);
    (detectFlightCandidate as any).mockReturnValue({
      isFlightCandidate: true,
      baseName: 'Phased',
      flightDay: 'Day 2',
    });
    (storage.insertTournament as any).mockResolvedValue({ id: 'p-1' });
    (storage.createTournament as any).mockResolvedValue({ id: 'p-1' });

    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(storage.createSeries).not.toHaveBeenCalled();
    // Day 2 vai pro pending para founder linkar a serie existente via modal
    expect(res.body.pendingFlightConfirmations).toHaveLength(1);
  });

  it('NAO auto-cria quando Day 2 esta fora da janela 1-7 dias do Day 1', async () => {
    const day1Date = new Date('2026-04-01T18:00:00Z');
    const day2Date = new Date('2026-04-30T19:00:00Z'); // ~30 dias depois — fora janela

    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-1',
        name: 'Phased Day 1A',
        site: 'PokerStars',
        datePlayed: day1Date,
        buyIn: '215',
      },
      {
        tournamentId: 'tid-2',
        name: 'Phased Day 2',
        site: 'PokerStars',
        datePlayed: day2Date,
        buyIn: '0',
      },
    ]);
    (detectFlightCandidate as any).mockImplementation((name: string) => ({
      isFlightCandidate: true,
      baseName: 'Phased',
      flightDay: name.match(/(1[AB]|Day 2)/i)?.[0] ?? null,
    }));
    (storage.insertTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));
    (storage.createTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));

    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(storage.createSeries).not.toHaveBeenCalled();
  });

  it('cross-network: Day 1 PokerStars + Day 2 GG NAO sao auto-linkados', async () => {
    const day1Date = new Date('2026-04-28T18:00:00Z');
    const day2Date = new Date('2026-04-29T19:00:00Z');

    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      {
        tournamentId: 'tid-1',
        name: 'Phased Day 1A',
        site: 'PokerStars',
        datePlayed: day1Date,
        buyIn: '215',
      },
      {
        tournamentId: 'tid-2',
        name: 'Phased Day 2',
        site: 'GGNetwork',
        datePlayed: day2Date,
        buyIn: '0',
      },
    ]);
    (detectFlightCandidate as any).mockImplementation((name: string) => ({
      isFlightCandidate: true,
      baseName: 'Phased',
      flightDay: name.match(/(1[AB]|Day 2)/i)?.[0] ?? null,
    }));
    (storage.insertTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));
    (storage.createTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));

    const handler = await importHandler();
    await handler(makeReq(), makeRes());

    expect(storage.createSeries).not.toHaveBeenCalled();
  });

  it('multi-series: 2 series diferentes simultaneas no mesmo upload', async () => {
    const day1 = new Date('2026-04-28T18:00:00Z');
    const day2 = new Date('2026-04-29T19:00:00Z');

    (PokerCSVParser.parseCSV as any).mockResolvedValue([
      { tournamentId: 'a1', name: 'Sunday Million Phased Day 1A', site: 'PokerStars', datePlayed: day1, buyIn: '215' },
      { tournamentId: 'a2', name: 'Sunday Million Phased Day 2', site: 'PokerStars', datePlayed: day2, buyIn: '0' },
      { tournamentId: 'b1', name: 'Bigger Phased Day 1A', site: 'PokerStars', datePlayed: day1, buyIn: '109' },
      { tournamentId: 'b2', name: 'Bigger Phased Day 2', site: 'PokerStars', datePlayed: day2, buyIn: '0' },
    ]);
    (detectFlightCandidate as any).mockImplementation((name: string) => {
      if (/Sunday Million Phased Day 1A/i.test(name)) return { isFlightCandidate: true, baseName: 'Sunday Million Phased', flightDay: '1A' };
      if (/Sunday Million Phased Day 2/i.test(name)) return { isFlightCandidate: true, baseName: 'Sunday Million Phased', flightDay: 'Day 2' };
      if (/Bigger Phased Day 1A/i.test(name)) return { isFlightCandidate: true, baseName: 'Bigger Phased', flightDay: '1A' };
      if (/Bigger Phased Day 2/i.test(name)) return { isFlightCandidate: true, baseName: 'Bigger Phased', flightDay: 'Day 2' };
      return { isFlightCandidate: false, baseName: name, flightDay: null };
    });
    let createCount = 0;
    (storage.createSeries as any).mockImplementation(async () => {
      createCount += 1;
      return { id: 'srs-' + createCount };
    });
    (storage.insertTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));
    (storage.createTournament as any).mockImplementation(async (t: any) => ({ ...t, id: 'p-' + t.tournamentId }));

    const handler = await importHandler();
    const res = makeRes();
    await handler(makeReq(), res);

    expect(createCount).toBe(2);
    expect(res.body.autoLinkedSeries).toHaveLength(2);
  });
});
