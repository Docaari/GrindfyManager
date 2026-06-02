/**
 * Test-Writer (Modo TDD — Red Phase) — Fase F #12 — softness no payload do selector
 *
 * Spec: Docs/specs/sprint-fase-f-game-selection-2026-06-02.md (RF-03)
 * ADR:  Docs/architecture/decisions/237-fase-f-game-selection-softness.md (D-1/D-6)
 *
 * Sob teste: server/routes/tournament-selector.ts -> handleTournamentSelector
 *   - enriquece cada SelectorTournament com bloco `softness` (Suprema E library)
 *   - eixo SEPARADO: NAO altera score/grade/signals (regressao byte-identica)
 *   - best-effort: erro no detector -> softness null, selector segue 200
 *
 * Convencao do projeto (mesma de tests/integration/api/tournament-selector.test.ts):
 * NAO monta supertest — testa o handler isolado mockando dependencias externas.
 * Shapes REAIS (lesson #3): stub Suprema/library espelha o ja existente nesse arquivo
 * irmao (externalId/name/site/time/buyIn string/guaranteed string/maxPlayers...).
 *
 * Valores REAIS confirmados:
 *   - loop em tournament-selector.ts ~326-417 (Suprema + library)
 *   - guaranteed Suprema = string (s.guaranteed), normalizado p/ USD no enriquecimento
 *   - storage.getTournamentLibraryEntries (NAO getTournamentLibrary) é o usado no loop
 *   - exchangeRates via storage.getUserSettings().exchangeRates (BRL units per USD)
 *
 * RED por: import dos helpers de softness inexistentes (handler ainda nao chama),
 * e pelas asserts de `softness` no payload (campo nao existe ainda).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  handleTournamentSelector,
  type TournamentSelectorRequest,
} from '../../../server/routes/tournament-selector';

import { playerBundleCache } from '../../../server/services/playerBundle';
import { selectorCache } from '../../../server/services/selectorCache';
import { storage } from '../../../server/storage';
import * as supremaSvc from '../../../server/supremaService';

// ---------------------------------------------------------------------------
// Mocks (espelham tournament-selector.test.ts irmao — shapes REAIS, lesson #3)
// ---------------------------------------------------------------------------
vi.mock('../../../server/services/playerBundle', () => ({
  playerBundleCache: { getOrLoad: vi.fn(), invalidate: vi.fn() },
}));
vi.mock('../../../server/services/selectorCache', () => ({
  selectorCache: { get: vi.fn(), set: vi.fn(), invalidateAllForUser: vi.fn() },
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
  const { _resetTournamentSelectorCacheForTests } = await import(
    '../../../server/scoring/tournamentSelectorCache'
  );
  _resetTournamentSelectorCacheForTests();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeBundleStub(totalTournaments = 200) {
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

// Suprema soft: satelite + gtd alto + 22h (noite-nobre) — para softness != duro
function makeSupremaSoftStub() {
  return [
    {
      externalId: 'suprema-2000',
      name: 'Satelite Day 1B',
      site: 'GGNetwork',
      time: '22:00',
      buyIn: '5.00',
      guaranteed: '1000.00',
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
      currency: 'USD',
    },
  ];
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

function wireDefaults(supremaList: any[] = [], libraryList: any[] = []) {
  (playerBundleCache.getOrLoad as any).mockResolvedValue(makeBundleStub(200));
  (supremaSvc.getSupremaTournaments as any).mockResolvedValue(supremaList);
  (storage.getTournamentLibraryEntries as any).mockResolvedValue(libraryList);
  (storage.getTournamentLibrary as any).mockResolvedValue(libraryList);
  (storage.getPlannedTournaments as any).mockResolvedValue([]);
  (storage.getUserSettings as any).mockResolvedValue({ exchangeRates: { BRL: 5.0 } });
  (selectorCache.get as any).mockReturnValue(null);
}

// =============================================================================
// RF-03 — softness presente no payload
// =============================================================================
describe('tournament-selector — softness no payload (RF-03)', () => {
  it('cada torneio Suprema ganha campo `softness` (objeto ou null)', async () => {
    wireDefaults(makeSupremaSoftStub());
    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments.length).toBeGreaterThan(0);
    const t = r.tournaments[0] as any;
    expect('softness' in t).toBe(true);
  });

  it('torneio soft (satelite + gtd alto + 22h GGNetwork) -> softness tier != duro', async () => {
    wireDefaults(makeSupremaSoftStub());
    const r = await handleTournamentSelector(makeRequest());
    const t = r.tournaments[0] as any;
    expect(t.softness).toBeTruthy();
    expect(t.softness.tier).not.toBe('duro');
    expect(t.softness.matchedCount).toBeGreaterThan(0);
  });

  it('bloco softness tem shape { score, tier, matchedCount, overallConfidence, indicators }', async () => {
    wireDefaults(makeSupremaSoftStub());
    const r = await handleTournamentSelector(makeRequest());
    const sft = (r.tournaments[0] as any).softness;
    expect(sft).toHaveProperty('score');
    expect(sft).toHaveProperty('tier');
    expect(sft).toHaveProperty('matchedCount');
    expect(sft).toHaveProperty('overallConfidence');
    expect(Array.isArray(sft.indicators)).toBe(true);
  });
});

// =============================================================================
// RF-03 — regressao: score/grade/signals byte-identicos (eixo separado, D-6)
// =============================================================================
describe('tournament-selector — regressao do scorer (D-6)', () => {
  it('score/grade/signals do torneio sao identicos com o enriquecimento de softness', async () => {
    // O scorer e calibrado: para um torneio fixo, score/grade sao deterministicos.
    // Aqui validamos que a presenca do bloco softness NAO mudou esses valores
    // comparando com o calculo direto do computeTournamentScore (caminho calibrado).
    wireDefaults(makeSupremaSoftStub());
    const r = await handleTournamentSelector(makeRequest());
    const t = r.tournaments[0] as any;

    // recomputa o score pelo caminho calibrado (mesmos inputs do loop)
    const { buildSupremaScoringInput, enrichWithTickets, applyTicketBoost } = await import(
      '../../../server/scoring/buildScoringInput'
    );
    const { computeTournamentScore } = await import('../../../server/scoring/tournamentScorer');
    const built = buildSupremaScoringInput(makeSupremaSoftStub()[0], '2026-04-23', { BRL: 5.0 });
    const enriched = enrichWithTickets(built.sct, [], {
      name: built.sct.name,
      date: '2026-04-23',
      buyInUsd: built.buyInUSD,
    });
    const base = computeTournamentScore(enriched, makeBundleStub(200) as any, { lookbackDays: 180 });
    const boosted = applyTicketBoost({ score: base.score, grade: base.grade }, enriched);

    expect(t.score).toBe(boosted.score);
    expect(t.grade).toBe(boosted.grade);
    expect(t.signals).toEqual(base.signals);
  });
});

// =============================================================================
// RF-03 — best-effort: detector lanca -> softness null, selector segue 200 (lesson #9)
// =============================================================================
describe('tournament-selector — best-effort softness=null em erro (lesson #9)', () => {
  it('quando computeSoftness lanca, o torneio recebe softness null e o selector responde normal', async () => {
    wireDefaults(makeSupremaSoftStub());
    // forca o detector a lancar via spy no modulo real
    const detector = await import('../../../server/scoring/softnessDetector');
    const spy = vi
      .spyOn(detector, 'computeSoftness')
      .mockImplementation(() => {
        throw new Error('boom — input malformado');
      });

    const r = await handleTournamentSelector(makeRequest());
    expect(r.tournaments.length).toBeGreaterThan(0);
    const t = r.tournaments[0] as any;
    // selector nao quebrou: score/grade intactos
    expect(typeof t.score).toBe('number');
    expect(t.grade).toBeDefined();
    // softness virou null (best-effort)
    expect(t.softness).toBeNull();

    spy.mockRestore();
  });

  it('score/grade permanecem intactos mesmo com softness null', async () => {
    wireDefaults(makeSupremaSoftStub());
    const detector = await import('../../../server/scoring/softnessDetector');
    const spy = vi
      .spyOn(detector, 'computeSoftness')
      .mockImplementation(() => {
        throw new Error('boom');
      });

    const r = await handleTournamentSelector(makeRequest());
    const t = r.tournaments[0] as any;
    expect(t.score).toBeGreaterThanOrEqual(0);
    expect(t.score).toBeLessThanOrEqual(100);

    spy.mockRestore();
  });
});
