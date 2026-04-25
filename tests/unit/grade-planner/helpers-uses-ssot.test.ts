import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint 2 - RF-02 (revisitar): helpers.ts getCategoryColor deve delegar
// para o SSoT (shared/tournamentTypes).
//
// Estado anterior (Sprint 1): switch hardcoded com cores antigas
//   ('Vanilla': bg-blue-600, 'PKO': bg-red-600, 'Mystery': bg-purple-600).
//
// Estado esperado (Sprint 2): usar getTypeColor(type) do SSoT, que retorna
//   { bg, text, ring, hex }. O helper getCategoryColor pode retornar a
//   string de classes Tailwind concatenando bg+text+ring (ou apenas bg)
//   mas o resultado deve EQUIVALER ao SSoT.
//
// Testes RED PHASE - falham hoje porque helpers.ts ainda usa cores fixas
// antigas que NAO batem com TYPE_COLORS do SSoT (Vanilla=zinc, PKO=violet,
// Mystery=fuchsia, Satellite=amber).
// =============================================================================

import { getCategoryColor } from '../../../client/src/components/grind-session-live/helpers';
import { getTypeColor, TOURNAMENT_PRIMARY_TYPES } from '../../../shared/tournamentTypes';

describe('grind-session-live/helpers.ts getCategoryColor (RF-02 - SSoT)', () => {
  it('retorna string nao-vazia para cada tipo primario do SSoT', () => {
    for (const t of TOURNAMENT_PRIMARY_TYPES) {
      const result = getCategoryColor(t);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('retorna a classe `bg` do SSoT para Vanilla (zinc, NAO blue antigo)', () => {
    const ssotColor = getTypeColor('Vanilla');
    const result = getCategoryColor('Vanilla');
    // bg deve aparecer no resultado (helper pode concatenar text+ring tambem)
    expect(result).toContain(ssotColor.bg.split(' ')[0]); // ex: "bg-zinc-100"
  });

  it('retorna a classe `bg` do SSoT para PKO (violet, NAO red antigo)', () => {
    const ssotColor = getTypeColor('PKO');
    const result = getCategoryColor('PKO');
    expect(result).toContain(ssotColor.bg.split(' ')[0]);
  });

  it('retorna a classe `bg` do SSoT para Mystery (fuchsia, NAO purple antigo)', () => {
    const ssotColor = getTypeColor('Mystery');
    const result = getCategoryColor('Mystery');
    expect(result).toContain(ssotColor.bg.split(' ')[0]);
  });

  it('retorna a classe `bg` do SSoT para Satellite (amber - NOVO, antes nao existia)', () => {
    const ssotColor = getTypeColor('Satellite');
    const result = getCategoryColor('Satellite');
    expect(result).toContain(ssotColor.bg.split(' ')[0]);
  });

  it('retorna fallback (nao quebra) para tipo desconhecido', () => {
    const result = getCategoryColor('Unknown');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('NAO usa mais "bg-blue-600" (cor antiga de Vanilla) - smoke', () => {
    // Cor antiga era bg-blue-600. SSoT migrou para zinc.
    const result = getCategoryColor('Vanilla');
    expect(result).not.toMatch(/bg-blue-600/);
  });

  it('NAO usa mais "bg-red-600" como cor de PKO (SSoT migrou para violet)', () => {
    const result = getCategoryColor('PKO');
    expect(result).not.toMatch(/bg-red-600\b/);
  });

  it('NAO usa mais "bg-purple-600" para Mystery (SSoT migrou para fuchsia)', () => {
    const result = getCategoryColor('Mystery');
    expect(result).not.toMatch(/bg-purple-600/);
  });
});
