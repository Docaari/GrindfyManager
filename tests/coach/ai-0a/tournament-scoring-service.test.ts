import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Sprint AI-0A — ADR-147 §1: tournamentScoringService (extracao DRY)
//
// Spec : Docs/specs/sprint-ai-0a.md (RF-03, RF-04, "Notas de Implementacao")
// ADR  : 147 §1 — extrair server/services/tournamentScoringService.ts (ou
//        server/scoring/tournamentScoringService.ts) com:
//          rankTournamentsForContext(userId, opts) -> RankedSuggestion[]
//          explainScoreForTournament(userId, ref)  -> ScoreBreakdown
//        REUSANDO computeTournamentScore + playerBundleCache. NUNCA duplicar a formula.
//
// TDD red-phase: o service ainda nao existe.
//
// Lessons:
//   - #14/#26: await import (com fallback se modulo nao existir -> teste falha por gap).
//   - DRY: o teste verifica que o service produz EXATAMENTE o mesmo score que
//     computeTournamentScore direto (mesmo input => mesmo output).
// =============================================================================

const getOrLoadMock = vi.fn();

vi.mock('../../../server/services/playerBundle', async () => {
  const actual = await vi.importActual<any>('../../../server/services/playerBundle');
  return {
    ...actual,
    playerBundleCache: {
      getOrLoad: getOrLoadMock,
      invalidate: vi.fn(),
    },
  };
});

const getTournamentLibraryEntriesMock = vi.fn();
const getLibraryTemplateMock = vi.fn();
const getUserSettingsMock = vi.fn();

vi.mock('../../../server/storage', () => ({
  storage: {
    getTournamentLibraryEntries: getTournamentLibraryEntriesMock,
    getLibraryTemplate: getLibraryTemplateMock,
    getTournament: vi.fn(),
    getPlannedTournament: vi.fn(),
    getUserSettings: getUserSettingsMock,
  },
}));

// AI-0A HIGH-1: o service inclui a agenda Suprema do dia (best-effort).
// Mockado para [] por padrao para os testes lib-only.
const getSupremaTournamentsMock = vi.fn();
vi.mock('../../../server/supremaService', () => ({
  getSupremaTournaments: getSupremaTournamentsMock,
  fetchSupremaTournaments: vi.fn(),
}));

// Bundle minimo "cold start pure" (<20 torneios) -> computeTournamentScore retorna
// score deterministico de heuristica fixa. Bom para o teste de DRY (mesmo input
// => mesmo score) sem depender de buckets.
function fakeBundle(totalTournaments = 5) {
  return {
    totalTournaments,
    lookbackDays: 180,
    siteBuckets: [], buyInBuckets: [], categoryBuckets: [], speedBuckets: [],
    dayOfWeekBuckets: [], timeOfDayBuckets: [], fieldBuckets: [],
  };
}

function fakeScoringInputTournament(overrides: any = {}) {
  return {
    id: 'lib-1',
    name: 'Sunday Million',
    site: 'PokerStars',
    buyIn: 215,
    buyInUSD: 215,
    buyInBucket: '$100-$500',
    category: 'Vanilla',
    type: 'Vanilla',
    speed: 'Normal',
    dayOfWeek: 0,
    timeOfDayBucket: 'evening',
    fieldBucket: 'large',
    guaranteed: 1000000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getOrLoadMock.mockResolvedValue(fakeBundle(5));
  getTournamentLibraryEntriesMock.mockResolvedValue([]);
  getLibraryTemplateMock.mockResolvedValue(undefined);
  getUserSettingsMock.mockResolvedValue(undefined);
  getSupremaTournamentsMock.mockResolvedValue([]);
});

async function loadService(): Promise<any> {
  // Tentar ambos os caminhos que o ADR-147 menciona.
  try {
    return await import('../../../server/services/tournamentScoringService');
  } catch {
    return await import('../../../server/scoring/tournamentScoringService');
  }
}

describe('tournamentScoringService · existe e exporta as 2 funcoes (ADR-147 §1)', () => {
  it('exporta rankTournamentsForContext + explainScoreForTournament', async () => {
    const svc = await loadService();
    expect(typeof svc.rankTournamentsForContext).toBe('function');
    expect(typeof svc.explainScoreForTournament).toBe('function');
  });
});

describe('tournamentScoringService.rankTournamentsForContext (ADR-147 §1)', () => {
  it('carrega o bundle via playerBundleCache.getOrLoad e ordena por score desc', async () => {
    getOrLoadMock.mockResolvedValue(fakeBundle(5));
    getTournamentLibraryEntriesMock.mockResolvedValue([
      fakeScoringInputTournament({ id: 'a', name: 'A', buyIn: 22, buyInUSD: 22 }),
      fakeScoringInputTournament({ id: 'b', name: 'B', buyIn: 109, buyInUSD: 109 }),
      fakeScoringInputTournament({ id: 'c', name: 'C', buyIn: 5, buyInUSD: 5 }),
    ]);
    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { limit: 10 });
    expect(getOrLoadMock).toHaveBeenCalled();
    expect(Array.isArray(out)).toBe(true);
    // Ordenado por score desc.
    for (let i = 1; i < out.length; i++) {
      expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    }
  });

  it('aplica filtro maxBuyIn (USD) — exclui torneios com buyInUSD > maxBuyIn', async () => {
    getTournamentLibraryEntriesMock.mockResolvedValue([
      fakeScoringInputTournament({ id: 'cheap', buyIn: 22, buyInUSD: 22 }),
      fakeScoringInputTournament({ id: 'mid', buyIn: 55, buyInUSD: 55 }),
      fakeScoringInputTournament({ id: 'expensive', buyIn: 215, buyInUSD: 215 }),
    ]);
    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { maxBuyIn: 50, limit: 10 });
    const ids = out.map((s: any) => s.id);
    expect(ids).toContain('cheap');
    expect(ids).not.toContain('mid');
    expect(ids).not.toContain('expensive');
  });

  it('DRY: cada suggestion.score === computeTournamentScore(...).score (nao duplica a formula)', async () => {
    const sct = fakeScoringInputTournament({ id: 'x', buyIn: 22, buyInUSD: 22 });
    getTournamentLibraryEntriesMock.mockResolvedValue([sct]);
    const bundle = fakeBundle(5);
    getOrLoadMock.mockResolvedValue(bundle);
    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { limit: 10 });
    expect(out.length).toBe(1);

    const { computeTournamentScore } = await import('../../../server/scoring/tournamentScorer');
    // O service pode normalizar o shape do torneio antes de passar pro scorer;
    // o que importa: dado o mesmo SCT lido da library, o score bate.
    const direct = computeTournamentScore(sct as any, bundle as any, { lookbackDays: 180 });
    expect(out[0].score).toBe(direct.score);
    expect(out[0].grade).toBe(direct.grade);
  });

  it('sem torneios disponiveis => [] (handler decide o note)', async () => {
    getTournamentLibraryEntriesMock.mockResolvedValue([]);
    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { limit: 10 });
    expect(out).toEqual([]);
  });

  // HIGH-1 reviewer: row CRU de tournament_library (SEM buckets pre-computados,
  // currency BRL) + bundle realista (>=50 torneios, shape bySite/byBuyIn/etc.).
  // O score do service DEVE bater com computeTournamentScore aplicado ao SCT
  // CORRETAMENTE montado por buildLibraryScoringInput — nao a um SCT "casca".
  it('DRY com row CRU de library (sem buckets, currency:BRL) + bundle realista', async () => {
    const realisticBundle = {
      totalTournaments: 320,
      lookbackTournaments: 320,
      lookbackDays: 180,
      overallRoi: 6.0,
      bySite: [
        { site: 'PokerStars', sample: 142, roi: 8.2, profit: 320 },
        { site: 'GGPoker', sample: 90, roi: -1.4, profit: -40 },
      ],
      byBuyIn: [
        { range: '$55-109.99', sample: 60, roi: 4.0 },
        { range: '$110-219.99', sample: 80, roi: 7.5 },
      ],
      byCategory: [
        { category: 'PKO', sample: 70, roi: 5.0 },
        { category: 'Vanilla', sample: 90, roi: 6.8 },
      ],
      bySpeed: [
        { speed: 'Normal', sample: 200, roi: 7.0 },
        { speed: 'Turbo', sample: 60, roi: -3.0 },
      ],
      byDayOfWeek: [
        { dayOfWeek: 0, sample: 50, roi: 9.0 },
        { dayOfWeek: 3, sample: 40, roi: 2.0 },
      ],
      byTimeOfDay: [
        { bucket: 'noite-nobre', sample: 110, roi: 7.0 },
        { bucket: 'tarde', sample: 30, roi: 1.0 },
      ],
      byField: [
        { range: 'grande', sample: 40, roi: 3.0 },
        { range: 'medio', sample: 50, roi: 6.0 },
      ],
    };
    getOrLoadMock.mockResolvedValue(realisticBundle);

    // Row CRU como vem de storage.getTournamentLibraryEntries (SELECT *):
    // sem buyInBucket/timeOfDayBucket/fieldBucket; buyIn em moeda nativa (BRL).
    const cruRow = {
      id: 'lib-99',
      userId: 'USER-0001',
      name: 'Big BRL 600',
      site: 'PokerStars',
      buyIn: '600',          // BRL -> 120 USD com DEFAULT_EXCHANGE_RATES (BRL=5)
      currency: 'BRL',
      type: 'PKO',
      speed: 'Normal',
      dayOfWeek: 0,
      time: '21:30',         // -> bucket noite-nobre
      fieldSize: 600,        // -> bucket grande
      deletedAt: null,
    };
    getTournamentLibraryEntriesMock.mockResolvedValue([cruRow]);

    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { dayOfWeek: 0, limit: 10 });
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('lib-99');
    // buyIn nativo preservado; buyInUSD normalizado.
    expect(out[0].buyIn).toBe(600);
    expect(out[0].buyInUSD).toBeCloseTo(120, 5);

    // Reproduz exatamente como o service monta o SCT (modulo compartilhado),
    // depois roda o scorer canonico contra o mesmo bundle.
    const { buildLibraryScoringInput } = await import('../../../server/scoring/buildScoringInput');
    const { computeTournamentScore } = await import('../../../server/scoring/tournamentScorer');
    const built = buildLibraryScoringInput(cruRow, {});
    // O SCT correto carrega os buckets DERIVADOS — nao undefined.
    expect(built.sct.buyInBucket).toBe('$110-219.99');
    expect(built.sct.timeOfDayBucket).toBe('noite-nobre');
    expect(built.sct.fieldBucket).toBe('grande');
    expect(built.sct.category).toBe('PKO');
    const direct = computeTournamentScore(built.sct as any, realisticBundle as any, { lookbackDays: 180 });
    expect(out[0].score).toBe(direct.score);
    expect(out[0].grade).toBe(direct.grade);
    expect(out[0].confidence).toBe(direct.confidence);
  });

  it('aplica filtro dayOfWeek — exclui entries da library cujo dia nao bate', async () => {
    getOrLoadMock.mockResolvedValue(fakeBundle(5));
    getTournamentLibraryEntriesMock.mockResolvedValue([
      { id: 'sun', name: 'Sunday', site: 'PokerStars', buyIn: '22', currency: 'USD', type: 'PKO', speed: 'Normal', dayOfWeek: 0, time: '20:00', deletedAt: null },
      { id: 'wed', name: 'Wednesday', site: 'PokerStars', buyIn: '22', currency: 'USD', type: 'PKO', speed: 'Normal', dayOfWeek: 3, time: '20:00', deletedAt: null },
    ]);
    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { dayOfWeek: 0, limit: 10 });
    const ids = out.map((s: any) => s.id);
    expect(ids).toContain('sun');
    expect(ids).not.toContain('wed');
  });

  it('inclui a agenda Suprema do dia (best-effort) na lista candidata', async () => {
    getOrLoadMock.mockResolvedValue(fakeBundle(5));
    getTournamentLibraryEntriesMock.mockResolvedValue([]);
    getSupremaTournamentsMock.mockResolvedValue([
      { externalId: 'sup-1', name: 'Suprema KO 100', site: 'Suprema', buyIn: 500, currency: 'BRL', type: 'PKO', speed: 'Normal', time: '21:00', maxPlayers: 800, dayOfWeek: 0 },
    ]);
    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { date: '2026-05-17', limit: 10 });
    expect(getSupremaTournamentsMock).toHaveBeenCalledWith('2026-05-17');
    expect(out.map((s: any) => s.id)).toContain('sup-1');
  });

  it('Suprema offline => so a biblioteca (sem throw)', async () => {
    getOrLoadMock.mockResolvedValue(fakeBundle(5));
    getTournamentLibraryEntriesMock.mockResolvedValue([
      { id: 'lib-x', name: 'Lib X', site: 'PokerStars', buyIn: '22', currency: 'USD', type: 'PKO', speed: 'Normal', dayOfWeek: 0, time: '20:00', deletedAt: null },
    ]);
    getSupremaTournamentsMock.mockRejectedValue(new Error('suprema timeout'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const svc = await loadService();
    const out = await svc.rankTournamentsForContext('USER-0001', { dayOfWeek: 0, limit: 10 });
    expect(out.map((s: any) => s.id)).toEqual(['lib-x']);
    errSpy.mockRestore();
  });
});

describe('tournamentScoringService.explainScoreForTournament (ADR-147 §1)', () => {
  it('libraryTemplateId valido (do user ou publico) => breakdown com 5 sinais', async () => {
    getLibraryTemplateMock.mockResolvedValue({
      id: 'lib-1', name: 'Sunday Million', site: 'PokerStars', buyIn: 215,
      type: 'Vanilla', speed: 'Normal', userId: null, guaranteed: 1000000,
    });
    getOrLoadMock.mockResolvedValue(fakeBundle(80)); // sample > cold start pure
    const svc = await loadService();
    const out = await svc.explainScoreForTournament('USER-0001', { libraryTemplateId: 'lib-1' });
    expect(out).toBeDefined();
    expect(typeof out.score).toBe('number');
    expect(Array.isArray(out.breakdown)).toBe(true);
    // Spec RF-04: breakdown por sinal — cada um com weight, value, contribution, sampleSize, confidence.
    expect(out.breakdown.length).toBeGreaterThanOrEqual(5);
    for (const sig of out.breakdown) {
      expect(typeof sig.signalName).toBe('string');
      expect(typeof sig.weight).toBe('number');
      expect(typeof sig.value).toBe('number');
      expect(typeof sig.contribution).toBe('number');
      expect(typeof sig.sampleSize).toBe('number');
      expect(['low', 'medium', 'high']).toContain(sig.confidence);
    }
  });

  it('DRY: explainScoreForTournament.score === computeTournamentScore(...).score', async () => {
    const tmpl = {
      id: 'lib-2', name: 'Big $22', site: 'PokerStars', buyIn: 22, buyInUSD: 22,
      type: 'PKO', speed: 'Normal', userId: null,
    };
    getLibraryTemplateMock.mockResolvedValue(tmpl);
    const bundle = fakeBundle(5); // cold start pure -> score deterministico
    getOrLoadMock.mockResolvedValue(bundle);
    const svc = await loadService();
    const out = await svc.explainScoreForTournament('USER-0001', { libraryTemplateId: 'lib-2' });

    const { computeTournamentScore } = await import('../../../server/scoring/tournamentScorer');
    // Construimos o SCT a partir do template do jeito que o service faria —
    // o teste e tolerante: confirma que o score nao foi reinventado.
    const direct = computeTournamentScore(
      { id: tmpl.id, name: tmpl.name, site: tmpl.site, buyIn: tmpl.buyIn, type: tmpl.type, speed: tmpl.speed } as any,
      bundle as any,
      { lookbackDays: 180 },
    );
    expect(out.score).toBe(direct.score);
  });

  it('id inexistente / de outro usuario => erro de handler tournament_not_found (nao vaza dado)', async () => {
    getLibraryTemplateMock.mockResolvedValue(undefined);
    const svc = await loadService();
    await expect(
      svc.explainScoreForTournament('USER-0001', { libraryTemplateId: 'lib-NOPE' }),
    ).rejects.toThrow(/tournament_not_found|not_found|not_accessible/i);
  });
});
