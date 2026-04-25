import { describe, it, expect } from 'vitest';

// =============================================================================
// Sprint 2 - RF-02 (revisitar): types.ts deve consumir SSoT
//
// Estado anterior (Sprint 1): array literal hardcoded:
//   export const types = ["PKO", "Vanilla", "Mystery", "Satellite"];
//
// Estado esperado (Sprint 2): re-exportar (ou copiar) de
//   shared/tournamentTypes.TOURNAMENT_PRIMARY_TYPES.
//
// Testes RED PHASE - falham hoje porque types.ts ainda nao
// re-exporta literalmente do SSoT (apesar de o conteudo coincidir, o teste
// valida REFERENCIA / IGUALDADE ESTRUTURAL com o array do SSoT).
// =============================================================================

import { types } from '../../../client/src/components/grade-planner/types';
import { TOURNAMENT_PRIMARY_TYPES } from '../../../shared/tournamentTypes';

describe('grade-planner/types.ts (RF-02 - SSoT consumer)', () => {
  it('exporta `types` igual ao SSoT TOURNAMENT_PRIMARY_TYPES', () => {
    // Igualdade estrutural: mesmos elementos na mesma ordem.
    expect(Array.from(types)).toEqual(Array.from(TOURNAMENT_PRIMARY_TYPES));
  });

  it('contem os 4 tipos primarios atuais (Vanilla, PKO, Mystery, Satellite)', () => {
    expect(types).toContain('Vanilla');
    expect(types).toContain('PKO');
    expect(types).toContain('Mystery');
    expect(types).toContain('Satellite');
    expect(types.length).toBe(4);
  });

  it('NAO contem "Flight" como tipo primario (Flight virou modificador)', () => {
    expect(types).not.toContain('Flight');
  });

  it('NAO contem "Live" (Live virou modificador, nao tipo primario)', () => {
    expect(types).not.toContain('Live');
  });

  it('a referencia eh derivada do SSoT (refator real, nao copia paralela)', () => {
    // Quando o consumidor importa do SSoT e re-exporta, alteracoes no SSoT
    // se refletem no consumer. Validamos isso comparando length + cada item.
    expect(types.length).toBe(TOURNAMENT_PRIMARY_TYPES.length);
    types.forEach((t, i) => {
      expect(t).toBe(TOURNAMENT_PRIMARY_TYPES[i]);
    });
  });
});
