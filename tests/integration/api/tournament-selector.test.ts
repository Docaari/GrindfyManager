import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Testes TDD: GET /api/tournament-selector
//
// Por convencao do projeto (vide tests/integration/grind-session/addon-rea-endpoints):
// nao montamos servidor supertest — testamos contratos e handler isolado mockando
// dependencias externas. Quando integration full-stack for adicionada (Spec PM
// futura), converter para supertest.
//
// Cobertura:
//   - 401 sem auth, 400 sem date / date invalida
//   - 200 com lista ranqueada (score DESC)
//   - Cold start "pure" / "partial" / null
//   - Filtros: minScore, minSample, bankrollFilter (com e sem bankroll)
//   - lookbackDays altera o resultado
//   - alreadyInGrid via externalId (Suprema) e via libraryTemplateId (Q4)
//   - Cache hit em <30min
//   - Suprema offline -> warning "suprema_unavailable"
//   - Performance <500ms para 200 torneios
// =============================================================================

import {
  handleTournamentSelector,
  type TournamentSelectorRequest,
  type TournamentSelectorResponse,
} from '../../../server/routes/tournament-selector';

import { playerBundleCache } from '../../../server/services/playerBundle';
import { selectorCache } from '../../../server/services/selectorCache';
import { storage } from '../../../server/storage';
import * as supremaSvc from '../../../server/supremaService';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../server/services/playerBundle', () => ({
  playerBundleCache: {
    getOrLoad: vi.fn(),
    invalidate: vi.fn(),
  },
}));

vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: {
    get: vi.fn(),
    set: vi.fn(),
    invalidateAllForUser: vi.fn(),
  },
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBundleStub(totalTournaments: number = 200) {
  return {
    totalTournaments,
    lookbackTournaments: totalTournaments,
    lookbackDays: 180,
    overallRoi: 12,
    bySite: [{ site: 'Suprema', sample: 120, roi: 14, profit: 500 }],
    byBuyIn: [{ range: '$11-21.99', sample: 134, roi: 16.8 }],
    byCategory: [{ category: 'PKO', sample: 87, roi: 18 }],
    bySpeed: [{ speed: 'Turbo', sample: 90, roi: 9 }],
    byDayOfWeek: [{ dayOfWeek: 4, sample: 78, roi: 22 }],
    byTimeOfDay: [{ bucket: 'noite-nobre', sample: 102, roi: 21 }],
    byField: [{ range: 'medio', sample: 188, roi: 11 }],
  };
}

function makeSupremaStub(n: number = 3) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      externalId: `suprema-${1000 + i}`,
      name: `Mystery KO #${i}`,
      site: 'Suprema',
      time: '22:00',
      buyIn: '22.00',
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
    });
  }
  return arr;
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
// Auth & validacao
// ===========================================================================

describe('GET /api/tournament-selector - auth e validacao', () => {
  it('falta de userId (sem auth) deve retornar 401 / lancar Unauthorized', async () => {
    await expect(
      handleTournamentSelector({ ...makeRequest(), userId: '' as any })
    ).rejects.toThrow();
  });

  it('date em formato invalido lanca BadRequest (400)', async () => {
    await expect(
      handleTournamentSelector({ ...makeRequest(), date: '23-04-2026' })
    ).rejects.toThrow();
  });

  it('date ausente usa data de hoje (timezone do servidor)', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    const r = await handleTournamentSelector({ ...makeRequest(), date: undefined as any });
    expect(r.date).toBeDefined();
  });
});

// ===========================================================================
// Happy path
// ===========================================================================

describe('GET /api/tournament-selector - happy path', () => {
  beforeEach(() => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue(makeSupremaStub(3));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: { BRL: 0.2 } });
    (selectorCache.get as any).mockReturnValue(null);
  });

  it('retorna lista ordenada por score DESC', async () => {
    const r = await handleTournamentSelector(makeRequest());
    for (let i = 1; i < r.tournaments.length; i++) {
      expect(r.tournaments[i - 1].score).toBeGreaterThanOrEqual(r.tournaments[i].score);
    }
  });

  it('cada torneio tem id, source, name, site, buyIn, score, grade, confidence, rationale, signals', async () => {
    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments.length).toBeGreaterThan(0);
    const t = r.tournaments[0];
    expect(t).toHaveProperty('id');
    expect(t).toHaveProperty('source');
    expect(t).toHaveProperty('name');
    expect(t).toHaveProperty('site');
    expect(t).toHaveProperty('buyIn');
    expect(t).toHaveProperty('score');
    expect(t).toHaveProperty('grade');
    expect(t).toHaveProperty('confidence');
    expect(t).toHaveProperty('rationale');
    expect(t).toHaveProperty('signals');
  });

  it('response inclui playerProfile com totalTournaments e lookback*', async () => {
    const r = await handleTournamentSelector(makeRequest());
    expect(r.playerProfile).toBeDefined();
    expect(r.playerProfile.totalTournaments).toBe(200);
    expect(r.playerProfile.lookbackDays).toBe(180);
  });

  it('response.cacheHit=false quando cache miss', async () => {
    const r = await handleTournamentSelector(makeRequest());
    expect(r.cacheHit).toBe(false);
  });

  it('response.totalReturned reflete a lista', async () => {
    const r = await handleTournamentSelector(makeRequest());
    expect(r.totalReturned).toBe(r.tournaments.length);
  });
});

// ===========================================================================
// Cold start
// ===========================================================================

describe('GET /api/tournament-selector - cold start granular', () => {
  beforeEach(() => {
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue(makeSupremaStub(3));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);
  });

  it('totalTournaments < 20 -> playerProfile.coldStart === "pure"', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(10));
    const r = await handleTournamentSelector(makeRequest());
    expect(r.playerProfile.coldStart).toBe('pure');
  });

  it('totalTournaments boundary 19 -> "pure"', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(19));
    const r = await handleTournamentSelector(makeRequest());
    expect(r.playerProfile.coldStart).toBe('pure');
  });

  it('totalTournaments 20-49 -> "partial"', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(30));
    const r = await handleTournamentSelector(makeRequest());
    expect(r.playerProfile.coldStart).toBe('partial');
  });

  it('totalTournaments boundary 49 -> "partial"', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(49));
    const r = await handleTournamentSelector(makeRequest());
    expect(r.playerProfile.coldStart).toBe('partial');
  });

  it('totalTournaments boundary 50 -> coldStart === false', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(50));
    const r = await handleTournamentSelector(makeRequest());
    expect(r.playerProfile.coldStart).toBe(false);
  });
});

// ===========================================================================
// Filtros
// ===========================================================================

describe('GET /api/tournament-selector - filtros', () => {
  beforeEach(() => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue(makeSupremaStub(5));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);
  });

  it('minScore=70 oculta torneios com score < 70', async () => {
    const r = await handleTournamentSelector(makeRequest({ minScore: 70 }));
    for (const t of r.tournaments) {
      expect(t.score).toBeGreaterThanOrEqual(70);
    }
  });

  it('minScore=85 retorna apenas grade S (vazio se nenhum atender)', async () => {
    const r = await handleTournamentSelector(makeRequest({ minScore: 85 }));
    for (const t of r.tournaments) {
      expect(t.grade).toBe('S');
    }
  });

  it('minSample=30 oculta torneios com bucket primario sample < 30', async () => {
    // Cenario: bucket bundle byCategory.sample = 20 -> filtro deveria ocultar
    (playerBundleCache.getOrLoad as any).mockResolvedValue({
      ...makeBundleStub(200),
      byCategory: [{ category: 'PKO', sample: 20, roi: 18 }],
    });
    const r = await handleTournamentSelector(makeRequest({ minSample: 30 }));
    for (const t of r.tournaments) {
      // bucket primario considerado: maior peso (~ category/buyIn)
      expect(t.signals.categoryRoi.sample).toBeGreaterThanOrEqual(30);
    }
  });

  it('sources=suprema NAO chama getTournamentLibraryEntries', async () => {
    (storage.getTournamentLibraryEntries as any).mockClear();
    await handleTournamentSelector(makeRequest({ sources: 'suprema' }));
    expect(storage.getTournamentLibraryEntries).not.toHaveBeenCalled();
  });

  it('sources=library NAO chama getSupremaTournaments', async () => {
    (supremaSvc.getSupremaTournaments as any).mockClear();
    await handleTournamentSelector(makeRequest({ sources: 'library' }));
    expect(supremaSvc.getSupremaTournaments).not.toHaveBeenCalled();
  });

  it('sources=suprema,library chama ambas as fontes', async () => {
    await handleTournamentSelector(makeRequest({ sources: 'suprema,library' }));
    expect(supremaSvc.getSupremaTournaments).toHaveBeenCalled();
    expect(storage.getTournamentLibraryEntries).toHaveBeenCalled();
  });
});

// ===========================================================================
// Bankroll filter (Q8)
// ===========================================================================

describe('GET /api/tournament-selector - bankroll filter (Q8)', () => {
  beforeEach(() => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    // HIGH #7: testes assumiam comparacao USD-USD; passamos currency:'USD' explicitamente
    // (o default real para Suprema e BRL — testado em outro bloco abaixo).
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([
      { ...makeSupremaStub(1)[0], buyIn: '22.00', currency: 'USD' },  // 22 USD
      { ...makeSupremaStub(1)[0], externalId: 'suprema-2', buyIn: '5.00', currency: 'USD' },  // 5 USD
    ]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (selectorCache.get as any).mockReturnValue(null);
  });

  it('bankroll nao cadastrado: response.bankrollConfigured=false e filtro nao aplica', async () => {
    (storage.getUserSettings as any).mockResolvedValue({ bankrollAmount: null });
    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: true }));
    expect(r.bankrollConfigured).toBe(false);
    // Mesmo com bankrollFilter=true, todos os torneios passam (filtro desabilitado)
    expect(r.tournaments.length).toBe(2);
  });

  it('bankroll cadastrado=1000 USD com regra "1pct" filtra torneios > 10 USD quando bankrollFilter=true', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000',
      bankrollRule: '1pct',
    });
    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: true }));
    expect(r.bankrollConfigured).toBe(true);
    // Apenas o torneio de 5 USD passa
    for (const t of r.tournaments) {
      expect(t.buyIn).toBeLessThanOrEqual(10 * 1.5); // tolerancia 1.5x conforme spec original
    }
  });

  it('bankroll cadastrado mas bankrollFilter=false: torneios fora do limite recebem flag bankrollOk=false MAS aparecem', async () => {
    (storage.getUserSettings as any).mockResolvedValue({
      bankrollAmount: '1000',
      bankrollRule: '1pct',
    });
    const r = await handleTournamentSelector(makeRequest({ bankrollFilter: false }));
    expect(r.tournaments.length).toBe(2);
    // 22 USD > 10 -> bankrollOk false
    const big = r.tournaments.find((t) => t.buyIn === 22);
    expect(big?.bankrollOk).toBe(false);
  });
});

// ===========================================================================
// alreadyInGrid (Q4)
// ===========================================================================

describe('GET /api/tournament-selector - alreadyInGrid (Q4)', () => {
  beforeEach(() => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);
  });

  it('Suprema com externalId ja em planned_tournaments -> alreadyInGrid=true', async () => {
    const sup = makeSupremaStub(1);
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue(sup);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([
      { externalId: sup[0].externalId, libraryTemplateId: null },
    ]);

    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments[0].alreadyInGrid).toBe(true);
  });

  it('Library com libraryTemplateId ja em planned_tournaments -> alreadyInGrid=true', async () => {
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([
      {
        id: 'lib-tpl-001',
        userId: 'USER-0001',
        name: 'Library Tourney',
        site: 'PokerStars',
        buyIn: '22.00',
        time: '20:00',
        type: 'PKO',
        speed: 'Normal',
        dayOfWeek: 4,
      },
    ]);
    (storage.getPlannedTournaments as any).mockResolvedValue([
      { externalId: null, libraryTemplateId: 'lib-tpl-001' },
    ]);
    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments[0].alreadyInGrid).toBe(true);
  });

  it('Suprema com externalId DIFERENTE dos planejados -> alreadyInGrid=false', async () => {
    const sup = makeSupremaStub(1);
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue(sup);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([
      { externalId: 'suprema-OUTRO', libraryTemplateId: null },
    ]);
    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments[0].alreadyInGrid).toBe(false);
  });

  it('Library template SEM correspondencia em planned -> alreadyInGrid=false', async () => {
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([
      { id: 'lib-tpl-001', userId: 'USER-0001', name: 'Lib', site: 'PS', buyIn: '22', time: '20:00', dayOfWeek: 4 },
    ]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments[0].alreadyInGrid).toBe(false);
  });
});

// ===========================================================================
// Cache (TTL 30min)
// ===========================================================================

describe('GET /api/tournament-selector - cache 30min', () => {
  it('segunda chamada com mesmos params (cache hit) retorna cacheHit=true e nao reconsulta o bundle', async () => {
    const cached: TournamentSelectorResponse = {
      date: '2026-04-23',
      playerProfile: { totalTournaments: 200, lookbackDays: 180, coldStart: false } as any,
      tournaments: [],
      totalAvailable: 0,
      totalReturned: 0,
      generatedAt: '2026-04-23T18:32:01-03:00',
      cacheHit: false,
      bankrollConfigured: false,
      warnings: [],
    };
    (selectorCache.get as any).mockReturnValue(cached);

    const r = await handleTournamentSelector(makeRequest());
    expect(r.cacheHit).toBe(true);
    expect(playerBundleCache.getOrLoad).not.toHaveBeenCalled();
    expect(supremaSvc.getSupremaTournaments).not.toHaveBeenCalled();
  });

  it('cache miss popula entrada (selectorCache.set chamado)', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    await handleTournamentSelector(makeRequest());
    expect(selectorCache.set).toHaveBeenCalled();
  });
});

// ===========================================================================
// Suprema offline
// ===========================================================================

describe('GET /api/tournament-selector - resiliencia Suprema offline', () => {
  it('Suprema lanca -> response.warnings inclui "suprema_unavailable" e lista so com library', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockRejectedValue(new Error('Suprema 502'));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([
      { id: 'lib-1', name: 'Lib1', site: 'PS', buyIn: '11', time: '21:00', type: 'Vanilla', speed: 'Normal', dayOfWeek: 4 },
    ]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    const r = await handleTournamentSelector(makeRequest());
    expect(r.warnings).toContain('suprema_unavailable');
    expect(r.tournaments.every((t) => t.source !== 'suprema')).toBe(true);
  });

  it('Suprema offline + biblioteca vazia -> lista vazia + warning', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockRejectedValue(new Error('Suprema 502'));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments).toEqual([]);
    expect(r.warnings).toContain('suprema_unavailable');
  });
});

// ===========================================================================
// lookbackDays
// ===========================================================================

describe('GET /api/tournament-selector - lookbackDays', () => {
  it('lookbackDays=90 e =180 chamam playerBundleCache.getOrLoad com valores diferentes', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    await handleTournamentSelector(makeRequest({ lookbackDays: 90 }));
    expect(playerBundleCache.getOrLoad).toHaveBeenCalledWith('USER-0001', 90);

    (playerBundleCache.getOrLoad as any).mockClear();
    await handleTournamentSelector(makeRequest({ lookbackDays: 180 }));
    expect(playerBundleCache.getOrLoad).toHaveBeenCalledWith('USER-0001', 180);
  });
});

// ===========================================================================
// Performance
// ===========================================================================

describe('GET /api/tournament-selector - performance', () => {
  it('200 torneios + bundle 5k devem responder em <500ms (p95 alvo)', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(5000));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue(makeSupremaStub(200));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    const start = performance.now();
    await handleTournamentSelector(makeRequest());
    const elapsed = performance.now() - start;
    // O alvo do p95 e 500ms; aceitamos folga do CI (1000ms), o benchmark unitario
    // de scorer.test.ts garante o limite de 2ms por torneio.
    expect(elapsed).toBeLessThan(1000);
  });
});

// ===========================================================================
// RF-07: log "view" disparado async
// ===========================================================================

describe('GET /api/tournament-selector - log RF-07 view', () => {
  it('cache miss insere log eventType="view"', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    await handleTournamentSelector(makeRequest());
    // log async pode demorar 1 tick; aguardamos via microtask
    await Promise.resolve();
    expect(storage.insertSelectorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'USER-0001',
        eventType: 'view',
      })
    );
  });

  it('falha do INSERT do log NAO afeta response do endpoint', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue([]);
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);
    (storage.insertSelectorLog as any).mockRejectedValue(new Error('DB down'));

    await expect(handleTournamentSelector(makeRequest())).resolves.toBeDefined();
  });

  it('view loga metadata MINIMO (so contagem + filtros minimos) - Q9', async () => {
    (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
    (supremaSvc.getSupremaTournaments as any).mockResolvedValue(makeSupremaStub(3));
    (storage.getTournamentLibraryEntries as any).mockResolvedValue([]);
    (storage.getPlannedTournaments as any).mockResolvedValue([]);
    (storage.getUserSettings as any).mockResolvedValue({});
    (selectorCache.get as any).mockReturnValue(null);

    await handleTournamentSelector(makeRequest());
    await Promise.resolve();
    const logArgs = (storage.insertSelectorLog as any).mock.calls[0][0];
    // Nao deve conter snapshot de signals
    expect(logArgs.metadata).not.toHaveProperty('signals');
    // Deve conter contagem
    expect(logArgs.metadata).toHaveProperty('totalReturned');
  });
});
