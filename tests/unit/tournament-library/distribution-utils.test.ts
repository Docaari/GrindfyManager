import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Funcao utilitaria de distribuicao percentual
//
// O modulo shared/distribution-utils.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// calculateDistribution recebe um array de strings e retorna um Record
// com a distribuicao percentual (valores arredondados com Math.round).
//
// Modo: TDD — todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Import que AINDA NAO EXISTE — sera criado pelo Implementer
// ---------------------------------------------------------------------------
import { calculateDistribution } from '../../../shared/distribution-utils';

// =============================================================================
// Grupo 4: calculateDistribution
// =============================================================================

describe('calculateDistribution', () => {

  // -------------------------------------------------------------------------
  // Array vazio retorna objeto vazio
  // -------------------------------------------------------------------------

  it('deve retornar objeto vazio para array vazio', () => {
    const result = calculateDistribution([]);

    expect(result).toEqual({});
  });

  // -------------------------------------------------------------------------
  // Um unico item retorna 100%
  // -------------------------------------------------------------------------

  it('deve retornar 100% para um unico item', () => {
    const result = calculateDistribution(['Normal']);

    expect(result).toEqual({ Normal: 100 });
  });

  // -------------------------------------------------------------------------
  // Dois itens iguais retornam 100%
  // -------------------------------------------------------------------------

  it('deve retornar 100% quando todos os itens sao iguais', () => {
    const result = calculateDistribution(['PKO', 'PKO', 'PKO']);

    expect(result).toEqual({ PKO: 100 });
  });

  // -------------------------------------------------------------------------
  // Distribuicao proporcional com arredondamento
  // -------------------------------------------------------------------------

  it('deve calcular distribuicao proporcional com arredondamento', () => {
    // 2 PKO + 1 Vanilla = 67% + 33%
    const result = calculateDistribution(['PKO', 'PKO', 'Vanilla']);

    expect(result).toEqual({ PKO: 67, Vanilla: 33 });
  });

  // -------------------------------------------------------------------------
  // Distribuicao com 3 valores distintos
  // -------------------------------------------------------------------------

  it('deve calcular distribuicao com 3 valores distintos', () => {
    // 3 Normal + 2 Turbo + 1 Hyper = 50% + 33% + 17%
    const result = calculateDistribution([
      'Normal', 'Normal', 'Normal',
      'Turbo', 'Turbo',
      'Hyper',
    ]);

    expect(result).toEqual({ Normal: 50, Turbo: 33, Hyper: 17 });
  });

  // -------------------------------------------------------------------------
  // Soma pode ser 99 ou 101 por arredondamento (aceitavel)
  // -------------------------------------------------------------------------

  it('deve aceitar soma de 99 ou 101 por arredondamento', () => {
    // 1/3 cada = 33.33... arredondado para 33 cada = soma 99
    const result = calculateDistribution(['A', 'B', 'C']);

    expect(result.A).toBe(33);
    expect(result.B).toBe(33);
    expect(result.C).toBe(33);
    // soma = 99, aceitavel
    const soma = Object.values(result).reduce((a, b) => a + b, 0);
    expect(soma).toBeGreaterThanOrEqual(99);
    expect(soma).toBeLessThanOrEqual(101);
  });

  // -------------------------------------------------------------------------
  // Distribuicao 50/50
  // -------------------------------------------------------------------------

  it('deve calcular 50/50 para dois valores com mesma frequencia', () => {
    const result = calculateDistribution(['PKO', 'Vanilla', 'PKO', 'Vanilla']);

    expect(result).toEqual({ PKO: 50, Vanilla: 50 });
  });

  // -------------------------------------------------------------------------
  // Muitos valores distintos
  // -------------------------------------------------------------------------

  it('deve calcular distribuicao com muitos valores distintos', () => {
    // 5 PokerStars + 3 GGNetwork + 2 WPN = 50% + 30% + 20%
    const result = calculateDistribution([
      'PokerStars', 'PokerStars', 'PokerStars', 'PokerStars', 'PokerStars',
      'GGNetwork', 'GGNetwork', 'GGNetwork',
      'WPN', 'WPN',
    ]);

    expect(result).toEqual({ PokerStars: 50, GGNetwork: 30, WPN: 20 });
  });
});
