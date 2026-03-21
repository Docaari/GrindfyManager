import { describe, it, expect } from 'vitest';

// =============================================================================
// Testes TDD: Cell Overflow — logica de exibicao de celulas com muitos torneios
//
// O modulo shared/grade-cell-overflow.ts AINDA NAO EXISTE.
// O Implementer vai cria-lo.
//
// Todos os testes devem FALHAR (red phase).
// =============================================================================

// ---------------------------------------------------------------------------
// Imports que AINDA NAO EXISTEM — serao criados pelo Implementer
// ---------------------------------------------------------------------------
import { getCellDisplayInfo } from '../../../shared/grade-cell-overflow';

// ---------------------------------------------------------------------------
// Helpers de teste
// ---------------------------------------------------------------------------

function makeTournaments(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `pt-${i + 1}`,
    name: `Tournament ${i + 1}`,
    site: 'PokerStars',
    buyIn: `${(i + 1) * 11}`,
    time: '19:00',
  }));
}

// =============================================================================
// Grupo 3: getCellDisplayInfo
// =============================================================================

describe('getCellDisplayInfo', () => {

  it('deve retornar vazio quando nao ha torneios', () => {
    const result = getCellDisplayInfo([], 3);

    expect(result.visible).toEqual([]);
    expect(result.overflow).toBe(0);
    expect(result.hasOverflow).toBe(false);
  });

  it('deve mostrar todos quando quantidade <= maxVisible', () => {
    const tournaments = makeTournaments(2);
    const result = getCellDisplayInfo(tournaments, 3);

    expect(result.visible).toHaveLength(2);
    expect(result.overflow).toBe(0);
    expect(result.hasOverflow).toBe(false);
  });

  it('deve mostrar exatamente maxVisible quando quantidade == maxVisible', () => {
    const tournaments = makeTournaments(3);
    const result = getCellDisplayInfo(tournaments, 3);

    expect(result.visible).toHaveLength(3);
    expect(result.overflow).toBe(0);
    expect(result.hasOverflow).toBe(false);
  });

  it('deve truncar e indicar overflow quando quantidade > maxVisible', () => {
    const tournaments = makeTournaments(5);
    const result = getCellDisplayInfo(tournaments, 3);

    expect(result.visible).toHaveLength(3);
    expect(result.overflow).toBe(2);
    expect(result.hasOverflow).toBe(true);
  });

  it('deve calcular overflow correto com muitos torneios', () => {
    const tournaments = makeTournaments(10);
    const result = getCellDisplayInfo(tournaments, 3);

    expect(result.visible).toHaveLength(3);
    expect(result.overflow).toBe(7);
    expect(result.hasOverflow).toBe(true);
  });

  it('deve tratar maxVisible=0 como nenhum visivel e todos em overflow', () => {
    const tournaments = makeTournaments(5);
    const result = getCellDisplayInfo(tournaments, 0);

    expect(result.visible).toEqual([]);
    expect(result.overflow).toBe(5);
    expect(result.hasOverflow).toBe(true);
  });

  it('deve retornar hasOverflow=false quando maxVisible=0 e nao ha torneios', () => {
    const result = getCellDisplayInfo([], 0);

    expect(result.visible).toEqual([]);
    expect(result.overflow).toBe(0);
    expect(result.hasOverflow).toBe(false);
  });
});
