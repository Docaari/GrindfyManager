/**
 * Test-Writer (Modo TDD — Red Phase) — Fase F #12 — Game Selection Score (softness)
 *
 * Spec: Docs/specs/sprint-fase-f-game-selection-2026-06-02.md (RF-01 + RF-02)
 * ADR:  Docs/architecture/decisions/237-fase-f-game-selection-softness.md (D-1..D-6)
 *
 * Helpers PUROS sob teste (NAO existem ainda — red phase por import):
 *   server/scoring/softnessDetector.ts
 *     - detectSoftnessIndicators(input: SoftnessInput): SoftnessIndicator[]
 *     - computeSoftness(input: SoftnessInput): SoftnessResult
 *   server/scoring/softnessConstants.ts (pesos/thresholds/regex/allowlist)
 *
 * SoftnessInput (ADR §D-4 — valores JA em USD, lesson #6):
 *   { name, site, buyInUSD, guaranteedUSD, timeOfDayBucket: TimeOfDayBucket | null }
 *
 * Lessons aplicadas:
 *   - #6  FX -> USD: o detector RECEBE valores ja em USD; nao faz conversao.
 *   - #8  presenca INDIVIDUAL dos indicadores (nunca testar por length absoluta).
 *   - #11 proxy de nome marca confidence='weak' (nao inventa certeza).
 *   - #3  shape REAL do contrato (SoftnessInput) — sem campos inventados.
 *
 * Arquivo .test.ts => roda no projeto `server` (node). Helpers puros => zero mock,
 * apenas await import (codigo nao existe => red).
 *
 * Valores REAIS confirmados no worktree:
 *   TimeOfDayBucket = "madrugada" | "manha" | "tarde" | "noite-cedo" | "noite-nobre"
 *   (shared/scoring.ts:15) — o ADR assume 'noite-nobre'/'noite-cedo': CONFEREM.
 *   Sites allowlist (ADR): GGNetwork/GGPoker/PokerStars/888poker/888/PartyPoker —
 *   WALLET_PLATFORMS usa "GGNetwork","PokerStars","888","PartyPoker" (variantes
 *   GGPoker/888poker tambem na allowlist do ADR p/ cobrir `site` cru por fonte).
 */

import { describe, it, expect } from 'vitest';
import type { TimeOfDayBucket } from '../../../shared/scoring';

// ---------------------------------------------------------------------------
// Contrato local do SoftnessInput (type-only; o tipo real vive em shared/scoring.ts
// e e re-checado pelo tsc. Aqui usamos um shape literal para nao acoplar o teste
// a export que ainda nao existe). NAO inventa campos — exatamente os 5 do ADR §D-4.
// ---------------------------------------------------------------------------
interface SoftnessInputLike {
  name: string;
  site: string;
  buyInUSD: number;
  guaranteedUSD: number;
  timeOfDayBucket: TimeOfDayBucket | null;
}

function baseInput(overrides: Partial<SoftnessInputLike> = {}): SoftnessInputLike {
  // Default: torneio "duro" — nada bate (nome neutro, site fora da allowlist,
  // sem gtd, fora de prime-time).
  return {
    name: 'NLH Regular',
    site: 'CoinPoker',
    buyInUSD: 10,
    guaranteedUSD: 0,
    timeOfDayBucket: 'tarde',
    ...overrides,
  };
}

async function load() {
  const mod = await import('../../../server/scoring/softnessDetector');
  return mod;
}

// helper: encontra um indicador por key no array retornado
function find(indicators: any[], key: string) {
  return indicators.find((i) => i.key === key);
}

// =============================================================================
// RF-01 — detectSoftnessIndicators: deteccao INDIVIDUAL dos 6 (lesson #8)
// =============================================================================
describe('detectSoftnessIndicators — deteccao individual (lesson #8)', () => {
  it('so satelite no nome -> indicator `satellite` presente, confidence weak', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ name: '$5 Satelite Sunday' }));
    const ind = find(out, 'satellite');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('weak');
    // nenhum outro deve bater neste input
    expect(find(out, 'overlay')).toBeUndefined();
    expect(find(out, 'sportsbook')).toBeUndefined();
  });

  it('so overlay (gtd/buyIn >= 100) -> indicator `overlay` presente, confidence strong', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ buyInUSD: 5, guaranteedUSD: 1000 }));
    const ind = find(out, 'overlay');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('strong');
  });

  it('so site GGNetwork -> indicator `sportsbook` presente, confidence weak', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ site: 'GGNetwork' }));
    const ind = find(out, 'sportsbook');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('weak');
  });

  it('so "Day 1A" no nome -> indicator `multiday` presente, confidence weak', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ name: 'Main Event Day 1A' }));
    const ind = find(out, 'multiday');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('weak');
  });

  it('so timeOfDayBucket noite-nobre -> indicator `primetime` presente, confidence strong', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ timeOfDayBucket: 'noite-nobre' }));
    const ind = find(out, 'primetime');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('strong');
  });

  it('so "Brasil" no nome -> indicator `regional` presente, confidence weak', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ name: 'Campeonato Brasil de Poker' }));
    const ind = find(out, 'regional');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('weak');
  });

  it('cada indicador carrega {key, confidence, weight}', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ timeOfDayBucket: 'noite-nobre' }));
    const ind = find(out, 'primetime');
    expect(ind).toHaveProperty('key', 'primetime');
    expect(ind).toHaveProperty('confidence');
    expect(typeof ind.weight).toBe('number');
  });
});

// =============================================================================
// RF-01 — overlay boundary / div-zero / sem gtd
// =============================================================================
describe('detectSoftnessIndicators — overlay (boundary + guards)', () => {
  it('ratio == 100 (boundary) DISPARA overlay (>= threshold)', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ buyInUSD: 10, guaranteedUSD: 1000 }));
    expect(find(out, 'overlay')).toBeTruthy();
  });

  it('ratio < 100 (99) NAO dispara overlay', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ buyInUSD: 10, guaranteedUSD: 990 }));
    expect(find(out, 'overlay')).toBeUndefined();
  });

  it('guaranteedUSD = 0 (ausente) NAO dispara overlay e nao penaliza', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ buyInUSD: 5, guaranteedUSD: 0 }));
    expect(find(out, 'overlay')).toBeUndefined();
  });

  it('buyInUSD = 0 NAO dispara overlay nem lanca (sem divisao por zero)', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(() =>
      detectSoftnessIndicators(baseInput({ buyInUSD: 0, guaranteedUSD: 1000 })),
    ).not.toThrow();
    const out = detectSoftnessIndicators(baseInput({ buyInUSD: 0, guaranteedUSD: 1000 }));
    expect(find(out, 'overlay')).toBeUndefined();
  });
});

// =============================================================================
// RF-01 — prime-time (noite-nobre strong vs noite-cedo weak vs outro nao)
// =============================================================================
describe('detectSoftnessIndicators — prime-time', () => {
  it('noite-nobre -> primetime strong', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ timeOfDayBucket: 'noite-nobre' }));
    expect(find(out, 'primetime').confidence).toBe('strong');
  });

  it('noite-cedo -> primetime weak (D-5)', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ timeOfDayBucket: 'noite-cedo' }));
    const ind = find(out, 'primetime');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('weak');
  });

  it('tarde -> primetime NAO dispara', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ timeOfDayBucket: 'tarde' }));
    expect(find(out, 'primetime')).toBeUndefined();
  });

  it('manha -> primetime NAO dispara', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ timeOfDayBucket: 'manha' }));
    expect(find(out, 'primetime')).toBeUndefined();
  });

  it('timeOfDayBucket null -> primetime NAO dispara, sem crash', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(() =>
      detectSoftnessIndicators(baseInput({ timeOfDayBucket: null })),
    ).not.toThrow();
    const out = detectSoftnessIndicators(baseInput({ timeOfDayBucket: null }));
    expect(find(out, 'primetime')).toBeUndefined();
  });
});

// =============================================================================
// RF-01 — sportsbook allowlist (na/fora, variantes)
// =============================================================================
describe('detectSoftnessIndicators — sportsbook allowlist', () => {
  it('PokerStars (na allowlist) -> sportsbook dispara', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ site: 'PokerStars' }));
    expect(find(out, 'sportsbook')).toBeTruthy();
  });

  it('888 (variante na allowlist) -> sportsbook dispara', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ site: '888' }));
    expect(find(out, 'sportsbook')).toBeTruthy();
  });

  it('PartyPoker (na allowlist) -> sportsbook dispara', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ site: 'PartyPoker' }));
    expect(find(out, 'sportsbook')).toBeTruthy();
  });

  it('Suprema (FORA da allowlist v1) -> sportsbook NAO dispara', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ site: 'Suprema' }));
    expect(find(out, 'sportsbook')).toBeUndefined();
  });

  it('CoinPoker (fora da allowlist) -> sportsbook NAO dispara', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ site: 'CoinPoker' }));
    expect(find(out, 'sportsbook')).toBeUndefined();
  });

  it('site vazio -> sportsbook NAO dispara, sem erro', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(() => detectSoftnessIndicators(baseInput({ site: '' }))).not.toThrow();
    const out = detectSoftnessIndicators(baseInput({ site: '' }));
    expect(find(out, 'sportsbook')).toBeUndefined();
  });
});

// =============================================================================
// RF-01 — regex de nome: acento/case + hits/misses (satelite, multiday, regional)
// =============================================================================
describe('detectSoftnessIndicators — regex de nome (acento + case insensitive)', () => {
  it('"SATELITE" (uppercase) bate satellite', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'SATELITE MILLION' })), 'satellite')).toBeTruthy();
  });

  it('"Satelite" (sem acento, mixed case) bate satellite', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Satelite Step' })), 'satellite')).toBeTruthy();
  });

  it('"Satelite" com acento (NFD normalize) bate satellite', async () => {
    const { detectSoftnessIndicators } = await load();
    // contem caractere acentuado e (é)
    const out = detectSoftnessIndicators(baseInput({ name: 'Satélite Domingo' }));
    expect(find(out, 'satellite')).toBeTruthy();
  });

  it('"qualifier"/"step"/"ticket" batem satellite', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Daily Qualifier' })), 'satellite')).toBeTruthy();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Mega Step 2' })), 'satellite')).toBeTruthy();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Ticket Frenzy' })), 'satellite')).toBeTruthy();
  });

  it('nome neutro "$10 NLH Regular" NAO bate satellite/multiday/regional', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ name: '$10 NLH Regular' }));
    expect(find(out, 'satellite')).toBeUndefined();
    expect(find(out, 'multiday')).toBeUndefined();
    expect(find(out, 'regional')).toBeUndefined();
  });

  it('"flight" e "multi-day" batem multiday', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Opening Flight' })), 'multiday')).toBeTruthy();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Multi-Day Championship' })), 'multiday')).toBeTruthy();
  });

  it('"LATAM"/"Brazil"/"nacional" batem regional', async () => {
    const { detectSoftnessIndicators } = await load();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'LATAM Series' })), 'regional')).toBeTruthy();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Brazil Open' })), 'regional')).toBeTruthy();
    expect(find(detectSoftnessIndicators(baseInput({ name: 'Torneio Nacional' })), 'regional')).toBeTruthy();
  });
});

// =============================================================================
// RF-01 — falso-positivo conhecido aceito (proxy weak marca confianca, lesson #11)
// =============================================================================
describe('detectSoftnessIndicators — falso-positivo aceito (lesson #11)', () => {
  it('"Bradesco BR Series" -> regional bate por \\bbr\\b (falso positivo aceito), confidence weak', async () => {
    const { detectSoftnessIndicators } = await load();
    const out = detectSoftnessIndicators(baseInput({ name: 'Bradesco BR Series' }));
    const ind = find(out, 'regional');
    expect(ind).toBeTruthy();
    expect(ind.confidence).toBe('weak');
  });
});

// =============================================================================
// RF-02 — computeSoftness: score / tier / matchedCount / overallConfidence
// =============================================================================
describe('computeSoftness — score, tier e confidence', () => {
  it('todos os 6 falsos -> score 0, tier duro, matchedCount 0, indicators []', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness(baseInput());
    expect(r.score).toBe(0);
    expect(r.tier).toBe('duro');
    expect(r.matchedCount).toBe(0);
    expect(r.indicators).toEqual([]);
  });

  it('so overlay (30) -> score 30, tier medio (>=25)', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness(baseInput({ buyInUSD: 5, guaranteedUSD: 1000 }));
    expect(r.score).toBe(30);
    expect(r.tier).toBe('medio');
    expect(r.matchedCount).toBe(1);
  });

  it('overlay + prime-nobre + sportsbook (30+25+15) -> 70, tier mole (>=50)', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness(
      baseInput({
        buyInUSD: 5,
        guaranteedUSD: 1000,
        timeOfDayBucket: 'noite-nobre',
        site: 'GGNetwork',
      }),
    );
    expect(r.score).toBe(70);
    expect(r.tier).toBe('mole');
    expect(r.matchedCount).toBe(3);
  });

  it('todos os 6 bateriam -> soma 100, clamp NAO excede 100', async () => {
    const { computeSoftness } = await load();
    // satelite(15) + multiday(10) + regional(5) via nome; overlay(30); prime-nobre(25); sportsbook(15) = 100
    const r = computeSoftness(
      baseInput({
        name: 'Satelite Brasil Day 1B',
        site: 'GGNetwork',
        buyInUSD: 5,
        guaranteedUSD: 1000,
        timeOfDayBucket: 'noite-nobre',
      }),
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBe(100);
    expect(r.tier).toBe('mole');
  });

  it('score sempre >= 0', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness(baseInput());
    expect(r.score).toBeGreaterThanOrEqual(0);
  });

  it('overallConfidence weak quando SO indicadores weak bateram', async () => {
    const { computeSoftness } = await load();
    // so satelite (weak)
    const r = computeSoftness(baseInput({ name: 'Satelite Domingo' }));
    expect(r.overallConfidence).toBe('weak');
  });

  it('overallConfidence strong quando ALGUM indicador strong bateu (overlay)', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness(
      baseInput({ name: 'Satelite Domingo', buyInUSD: 5, guaranteedUSD: 1000 }),
    );
    expect(r.overallConfidence).toBe('strong');
  });

  it('overallConfidence strong quando prime-time noite-nobre bate (strong)', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness(baseInput({ timeOfDayBucket: 'noite-nobre' }));
    expect(r.overallConfidence).toBe('strong');
  });

  it('tier boundary: score exatamente 50 -> mole', async () => {
    const { computeSoftness } = await load();
    // prime-nobre(25) + sportsbook(15) + multiday(10) = 50
    const r = computeSoftness(
      baseInput({
        name: 'Championship Day 1',
        site: 'GGNetwork',
        timeOfDayBucket: 'noite-nobre',
      }),
    );
    expect(r.score).toBe(50);
    expect(r.tier).toBe('mole');
  });

  it('tier boundary: score exatamente 25 -> medio', async () => {
    const { computeSoftness } = await load();
    // prime-nobre(25) sozinho = 25
    const r = computeSoftness(baseInput({ timeOfDayBucket: 'noite-nobre' }));
    expect(r.score).toBe(25);
    expect(r.tier).toBe('medio');
  });

  it('tier boundary: score 24 (< 25) -> duro', async () => {
    const { computeSoftness } = await load();
    // sportsbook(15) + multiday(10) = 25 ... preciso de 24: sportsbook(15)+regional(5) = 20 < 25 -> duro
    const r = computeSoftness(baseInput({ name: 'Brasil Open', site: 'GGNetwork' }));
    // 15 + 5 = 20 -> duro
    expect(r.score).toBe(20);
    expect(r.tier).toBe('duro');
  });

  it('indicators retornados sao APENAS os que bateram (matchedCount == indicators.length)', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness(
      baseInput({ buyInUSD: 5, guaranteedUSD: 1000, timeOfDayBucket: 'noite-nobre' }),
    );
    expect(r.indicators.length).toBe(r.matchedCount);
    expect(r.matchedCount).toBe(2); // overlay + primetime
  });

  it('purity: chamar 2x com mesmo input retorna mesmo score (determinismo)', async () => {
    const { computeSoftness } = await load();
    const input = baseInput({ buyInUSD: 5, guaranteedUSD: 1000, timeOfDayBucket: 'noite-nobre' });
    const a = computeSoftness(input);
    const b = computeSoftness(input);
    expect(a.score).toBe(b.score);
    expect(a.tier).toBe(b.tier);
  });
});

// =============================================================================
// RF-02 — happy path completo (spec §Happy Path)
// =============================================================================
describe('computeSoftness — happy path completo', () => {
  it('"$5 Satelite Day 1B" 22h GGNetwork gtd $1000 -> tier mole, breakdown lista 5', async () => {
    const { computeSoftness } = await load();
    const r = computeSoftness({
      name: '$5 Satelite Day 1B',
      site: 'GGNetwork',
      buyInUSD: 5,
      guaranteedUSD: 1000,
      timeOfDayBucket: 'noite-nobre',
    });
    // satelite(15)+multiday(10)+primetime-nobre(25)+sportsbook(15)+overlay(30) = 95
    expect(r.tier).toBe('mole');
    expect(r.matchedCount).toBe(5);
    const keys = r.indicators.map((i: any) => i.key).sort();
    expect(keys).toEqual(['multiday', 'overlay', 'primetime', 'satellite', 'sportsbook'].sort());
    expect(r.overallConfidence).toBe('strong');
  });
});
