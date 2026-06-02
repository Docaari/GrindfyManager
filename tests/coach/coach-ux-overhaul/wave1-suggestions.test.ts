// =============================================================================
// Wave 1 (#3 + #11) — quick suggestions acionaveis + lens-aware.
//
// Cobre:
//   - coachLensMeta: placeholders por lente + sugestoes distintas por lente.
//   - getFallbackSuggestions: lens-aware no /coach-ai; action-oriented sem lente.
//   - computeSuggestions (server): lens via ctx.lens; /coach-ai action-oriented.
//
// Modulos puros (sem DOM, sem DB quando userId=undefined) -> projeto node.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LENS_PLACEHOLDER,
  LENS_SUGGESTIONS,
  getLensSuggestions,
} from '@/lib/coachLensMeta';
import { getFallbackSuggestions } from '@/lib/quickSuggestionsFallback';
import {
  computeSuggestions,
  _resetSuggestionsCacheForTests,
} from '../../../server/coach/quickSuggestions';

const LENSES = ['mental', 'tournament', 'technical'] as const;

describe('coachLensMeta', () => {
  it('cada lente tem placeholder nao-vazio', () => {
    for (const l of LENSES) {
      expect(typeof LENS_PLACEHOLDER[l]).toBe('string');
      expect(LENS_PLACEHOLDER[l].length).toBeGreaterThan(10);
    }
  });

  it('cada lente tem >=3 sugestoes com ids estaveis e distintos', () => {
    for (const l of LENSES) {
      const set = LENS_SUGGESTIONS[l];
      expect(set.length).toBeGreaterThanOrEqual(3);
      const ids = set.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length); // sem duplicata
    }
  });

  it('conjuntos de lentes sao distintos (lente muda chips — lesson #11)', () => {
    const mental = LENS_SUGGESTIONS.mental.map((s) => s.text).join('|');
    const tech = LENS_SUGGESTIONS.technical.map((s) => s.text).join('|');
    const tour = LENS_SUGGESTIONS.tournament.map((s) => s.text).join('|');
    expect(mental).not.toBe(tech);
    expect(mental).not.toBe(tour);
    expect(tech).not.toBe(tour);
  });

  it('getLensSuggestions(undefined) -> []', () => {
    expect(getLensSuggestions(undefined)).toEqual([]);
    expect(getLensSuggestions(null)).toEqual([]);
  });
});

describe('getFallbackSuggestions (client) — lens-aware', () => {
  it('/coach-ai + lente tournament -> sugestoes da lente (monta grade)', () => {
    const out = getFallbackSuggestions('/coach-ai', 'tournament');
    expect(out.some((s) => /grade/i.test(s.text))).toBe(true);
    expect(out.every((s) => s.sendOnClick === true)).toBe(true);
  });

  it('/coach-ai + lente technical -> sugestoes da lente (leaks)', () => {
    const out = getFallbackSuggestions('/coach-ai', 'technical');
    expect(out.some((s) => /leaks/i.test(s.text))).toBe(true);
  });

  it('/coach-ai sem lente -> set acionavel (#3: grade/leaks/downswing)', () => {
    const out = getFallbackSuggestions('/coach-ai');
    const joined = out.map((s) => s.text).join(' ').toLowerCase();
    expect(joined).toMatch(/grade|leaks|downswing/);
  });

  it('rota nao-coach (/bankroll) ignora lente', () => {
    const out = getFallbackSuggestions('/bankroll', 'mental');
    expect(out.some((s) => /banca/i.test(s.text))).toBe(true);
  });
});

describe('computeSuggestions (server) — lens via ctx', () => {
  beforeEach(() => _resetSuggestionsCacheForTests());

  it('/coach-ai + lens=tournament -> set da lente', async () => {
    const out = await computeSuggestions(undefined, '/coach-ai', { lens: 'tournament' });
    expect(out.some((s) => /grade/i.test(s.text))).toBe(true);
  });

  it('/coach-ai + lens=mental -> set da lente (downswing/foco)', async () => {
    const out = await computeSuggestions(undefined, '/coach-ai', { lens: 'mental' });
    expect(out.some((s) => /downswing|foco/i.test(s.text))).toBe(true);
  });

  it('/coach-ai sem lente -> action-oriented (#3)', async () => {
    const out = await computeSuggestions(undefined, '/coach-ai', {});
    const joined = out.map((s) => s.text).join(' ').toLowerCase();
    expect(joined).toMatch(/grade|leaks|downswing/);
  });

  it('lens invalida -> cai no set padrao da rota (sem crash)', async () => {
    const out = await computeSuggestions(undefined, '/coach-ai', { lens: 'xpto' });
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it('cache separa por lente (technical != mental)', async () => {
    const a = await computeSuggestions(undefined, '/coach-ai', { lens: 'technical' });
    const b = await computeSuggestions(undefined, '/coach-ai', { lens: 'mental' });
    expect(a.map((s) => s.id).join()).not.toBe(b.map((s) => s.id).join());
  });
});
