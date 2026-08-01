import { describe, it, expect } from 'vitest';

// =============================================================================
// Logica de Incluir/Excluir dos filtros do dashboard.
//
// Replica das funcoes puras que vivem dentro de DashboardFilters (o componente
// nao e montavel aqui sem QueryClientProvider — licao #29). O que importa travar
// e o CONTRATO: nenhuma opcao pode ficar nos dois conjuntos, e o "x" da etiqueta
// tem que LIMPAR, nunca inverter.
//
// Regressao real (2026-08-01): o "x" de uma opcao excluida fazia
// `setMode('exclude')` e chamava o toggle na sequencia. Como `setMode` so vale
// no proximo render, o toggle rodava com o modo ANTIGO e movia a opcao de
// excluida para INCLUIDA — o filtro invertia em vez de sumir.
// =============================================================================

type Sets = { included: string[]; excluded: string[] };

function toggle(state: Sets, value: string, mode: 'include' | 'exclude'): Sets {
  const included = new Set(state.included);
  const excluded = new Set(state.excluded);
  const target = mode === 'include' ? included : excluded;
  const other = mode === 'include' ? excluded : included;
  if (target.has(value)) {
    target.delete(value);
  } else {
    target.add(value);
    other.delete(value);
  }
  return { included: Array.from(included), excluded: Array.from(excluded) };
}

function remove(state: Sets, value: string): Sets {
  return {
    included: state.included.filter((v) => v !== value),
    excluded: state.excluded.filter((v) => v !== value),
  };
}

const empty: Sets = { included: [], excluded: [] };

describe('toggle incluir/excluir', () => {
  it('inclui no modo incluir', () => {
    expect(toggle(empty, 'GG', 'include')).toEqual({ included: ['GG'], excluded: [] });
  });

  it('exclui no modo excluir', () => {
    expect(toggle(empty, 'GG', 'exclude')).toEqual({ included: [], excluded: ['GG'] });
  });

  it('clicar de novo no mesmo modo solta a opcao', () => {
    const once = toggle(empty, 'GG', 'include');
    expect(toggle(once, 'GG', 'include')).toEqual(empty);
  });

  it('nunca deixa a mesma opcao incluida E excluida', () => {
    const included = toggle(empty, 'GG', 'include');
    const flipped = toggle(included, 'GG', 'exclude');
    expect(flipped.included).not.toContain('GG');
    expect(flipped.excluded).toContain('GG');
  });

  it('acumula varias opcoes no mesmo modo', () => {
    let state = toggle(empty, 'PKO', 'exclude');
    state = toggle(state, 'Vanilla', 'exclude');
    expect(state.excluded).toEqual(['PKO', 'Vanilla']);
    expect(state.included).toEqual([]);
  });
});

describe('x da etiqueta (remove)', () => {
  it('limpa opcao INCLUIDA', () => {
    const state = toggle(empty, 'GG', 'include');
    expect(remove(state, 'GG')).toEqual(empty);
  });

  // O caso que quebrou em producao.
  it('limpa opcao EXCLUIDA sem transformar em incluida', () => {
    const state = toggle(empty, 'GG', 'exclude');
    const after = remove(state, 'GG');
    expect(after.excluded).not.toContain('GG');
    expect(after.included).not.toContain('GG'); // o bug punha GG aqui
    expect(after).toEqual(empty);
  });

  it('nao depende do modo em que o painel esta', () => {
    const state = toggle(empty, 'GG', 'exclude');
    // Independente do modo atual, remover e remover.
    expect(remove(state, 'GG')).toEqual(remove(state, 'GG'));
    expect(remove(state, 'GG').excluded).toHaveLength(0);
  });

  it('nao mexe nas outras opcoes', () => {
    let state = toggle(empty, 'PKO', 'exclude');
    state = toggle(state, 'Vanilla', 'exclude');
    state = toggle(state, 'ACR', 'include');
    const after = remove(state, 'PKO');
    expect(after.excluded).toEqual(['Vanilla']);
    expect(after.included).toEqual(['ACR']);
  });

  it('remover algo que nao esta ligado nao quebra nada', () => {
    expect(remove(empty, 'inexistente')).toEqual(empty);
  });
});
