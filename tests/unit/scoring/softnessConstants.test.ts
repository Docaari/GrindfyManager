/**
 * Test-Writer (Modo TDD — Red Phase) — Fase F #12 — softness constants
 *
 * Spec: Docs/specs/sprint-fase-f-game-selection-2026-06-02.md (§Constantes)
 * ADR:  Docs/architecture/decisions/237-fase-f-game-selection-softness.md (D-2/D-3)
 *
 * Sob teste (NAO existe ainda — red por import): server/scoring/softnessConstants.ts
 *   - SOFTNESS_OVERLAY_RATIO_THRESHOLD = 100
 *   - SOFTNESS_SPORTSBOOK_SITES (allowlist)
 *   - Pesos por indicador (overlay 30 / prime-nobre 25 / prime-cedo 10 /
 *     sportsbook 15 / satelite 15 / multiday 10 / regional 5)
 *
 * Lessons aplicadas:
 *   - #8 validar presenca INDIVIDUAL dos sites/pesos, nunca length absoluta.
 *
 * Tolerante a forma de export: os testes inspecionam por NOME individual e nao
 * fixam o shape exato do objeto de pesos (deixam o implementer escolher entre
 * record por key ou consts soltas), validando apenas os valores numericos do ADR.
 */

import { describe, it, expect } from 'vitest';

async function load() {
  return await import('../../../server/scoring/softnessConstants');
}

describe('softnessConstants — threshold de overlay', () => {
  it('SOFTNESS_OVERLAY_RATIO_THRESHOLD = 100 (calibracao v1)', async () => {
    const c: any = await load();
    expect(c.SOFTNESS_OVERLAY_RATIO_THRESHOLD).toBe(100);
  });
});

describe('softnessConstants — allowlist de sportsbook (lesson #8 presenca individual)', () => {
  it('inclui GGNetwork', async () => {
    const c: any = await load();
    expect(c.SOFTNESS_SPORTSBOOK_SITES).toContain('GGNetwork');
  });
  it('inclui PokerStars', async () => {
    const c: any = await load();
    expect(c.SOFTNESS_SPORTSBOOK_SITES).toContain('PokerStars');
  });
  it('inclui 888', async () => {
    const c: any = await load();
    expect(c.SOFTNESS_SPORTSBOOK_SITES).toContain('888');
  });
  it('inclui PartyPoker', async () => {
    const c: any = await load();
    expect(c.SOFTNESS_SPORTSBOOK_SITES).toContain('PartyPoker');
  });
  it('NAO inclui Suprema (decisao v1 — rede BR de poker puro)', async () => {
    const c: any = await load();
    expect(c.SOFTNESS_SPORTSBOOK_SITES).not.toContain('Suprema');
  });
  it('NAO inclui CoinPoker', async () => {
    const c: any = await load();
    expect(c.SOFTNESS_SPORTSBOOK_SITES).not.toContain('CoinPoker');
  });
});

// =============================================================================
// Pesos — validados via computeSoftness (a fonte de verdade dos pesos e o
// score somado). Aqui validamos a soma maxima teorica = 100 (D-2: sem
// renormalizacao), garantindo que o conjunto de pesos fecha em 100.
// =============================================================================
describe('softnessConstants — soma maxima de pesos = 100 (D-2)', () => {
  it('input com TODOS os indicadores (prime-nobre) somando -> score 100', async () => {
    const { computeSoftness } = await import('../../../server/scoring/softnessDetector');
    const r = computeSoftness({
      name: 'Satelite Brasil Day 1B',
      site: 'GGNetwork',
      buyInUSD: 5,
      guaranteedUSD: 1000,
      timeOfDayBucket: 'noite-nobre',
    });
    expect(r.score).toBe(100);
  });

  it('prime-time noite-cedo pesa MENOS que noite-nobre (10 vs 25)', async () => {
    const { computeSoftness } = await import('../../../server/scoring/softnessDetector');
    const cedo = computeSoftness({
      name: 'NLH Regular',
      site: 'CoinPoker',
      buyInUSD: 10,
      guaranteedUSD: 0,
      timeOfDayBucket: 'noite-cedo',
    });
    const nobre = computeSoftness({
      name: 'NLH Regular',
      site: 'CoinPoker',
      buyInUSD: 10,
      guaranteedUSD: 0,
      timeOfDayBucket: 'noite-nobre',
    });
    expect(cedo.score).toBe(10);
    expect(nobre.score).toBe(25);
    expect(cedo.score).toBeLessThan(nobre.score);
  });
});
