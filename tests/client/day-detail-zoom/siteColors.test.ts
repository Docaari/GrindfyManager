/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint day-detail-consolidation — siteColors hash-based fallback (ADR-213 D8).
 * Spec: Docs/specs/sprint-day-detail-consolidation.md §RF-05 (referencia visual chip color).
 * ADR: Docs/architecture/decisions/213-day-detail-zoom-consolidation.md §D8.
 *
 * Cobre helper `getSiteColors(site)` em client/src/components/grade/siteColors.ts:
 *   - 12 sites conhecidos retornam shape { bg, text, border, dot } valido.
 *   - Site desconhecido: hash determinista (fallback palette mod 5).
 *   - Hash determinista — mesmo input sempre mesmo output.
 *   - Edge: string vazia, null, undefined → fallback default cinza.
 *   - Case-sensitive (KNOWN[site] eh case-sensitive — verificar comportamento).
 *
 * Lessons aplicaveis:
 *   - #14/#38 (await import — sem mix com require).
 *   - #28 (vi.mock path EXATO — nenhum mock necessario aqui, puro helper).
 *
 * Roda em projeto client (jsdom) pois arquivo eh .ts dentro de tests/client/.
 * Vitest config tests/**\/*.test.ts inclui ambos projetos; tests/client/* roda
 * jsdom. siteColors NAO usa DOM mas roda em jsdom sem efeitos.
 */

import { describe, it, expect } from 'vitest';

async function loadHelper() {
  return await import('@/components/grade/siteColors');
}

describe('siteColors.getSiteColors — 12 sites conhecidos', () => {
  const knownSites = [
    'PokerStars',
    'GGNetwork',
    'GGPoker',
    'WPN',
    'ACR',
    'PartyPoker',
    '888poker',
    'Bodog',
    'CoinPoker',
    'Chico',
    'Revolution',
    'iPoker',
  ];

  for (const site of knownSites) {
    it(`retorna shape valido { bg, text, border, dot } para "${site}"`, async () => {
      const { getSiteColors } = await loadHelper();
      const result = getSiteColors(site);
      expect(result).toBeDefined();
      expect(typeof result.bg).toBe('string');
      expect(typeof result.text).toBe('string');
      expect(typeof result.border).toBe('string');
      expect(typeof result.dot).toBe('string');
      expect(result.bg.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.border.length).toBeGreaterThan(0);
      expect(result.dot.length).toBeGreaterThan(0);
    });
  }
});

describe('siteColors.getSiteColors — fallback hash determinista', () => {
  it('site desconhecido "MyCustomSite" retorna paleta do fallback', async () => {
    const { getSiteColors } = await loadHelper();
    const r = getSiteColors('MyCustomSite');
    expect(r).toBeDefined();
    expect(typeof r.bg).toBe('string');
    expect(r.bg.length).toBeGreaterThan(0);
  });

  it('mesmo input "MyCustomSite" gera mesmo output em duas chamadas (determinista)', async () => {
    const { getSiteColors } = await loadHelper();
    const a = getSiteColors('MyCustomSite');
    const b = getSiteColors('MyCustomSite');
    expect(a.bg).toBe(b.bg);
    expect(a.text).toBe(b.text);
    expect(a.border).toBe(b.border);
    expect(a.dot).toBe(b.dot);
  });

  it('inputs diferentes podem cair em paletas distintas (cobertura do hash)', async () => {
    const { getSiteColors } = await loadHelper();
    // Soma de paletas diferentes esperada quando hash diverge.
    const sites = ['SiteA', 'SiteB', 'AnotherSite', 'XYZ', 'Qwerty', 'Zzz'];
    const palettes = new Set<string>();
    for (const s of sites) {
      const r = getSiteColors(s);
      palettes.add(r.bg);
    }
    // Pelo menos 2 paletas distintas dentre 6 entradas (fallback >= 2 cores).
    expect(palettes.size).toBeGreaterThanOrEqual(2);
  });
});

describe('siteColors.getSiteColors — edge cases', () => {
  it('string vazia "" retorna fallback default cinza (null branch)', async () => {
    const { getSiteColors } = await loadHelper();
    const r = getSiteColors('');
    expect(r).toBeDefined();
    expect(typeof r.bg).toBe('string');
    // String vazia eh falsy — cai no `if (!site)` → fallback cinza.
    expect(r.bg).toContain('gray');
  });

  it('null retorna fallback default cinza', async () => {
    const { getSiteColors } = await loadHelper();
    const r = getSiteColors(null as any);
    expect(r).toBeDefined();
    expect(r.bg).toContain('gray');
  });

  it('undefined retorna fallback default cinza', async () => {
    const { getSiteColors } = await loadHelper();
    const r = getSiteColors(undefined as any);
    expect(r).toBeDefined();
    expect(r.bg).toContain('gray');
  });
});
