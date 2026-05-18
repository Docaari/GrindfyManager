/**
 * Sprint biblioteca-enrich — persistencia localStorage dos filtros da
 * Biblioteca de Torneios. client/src/lib/bibliotecaFilters.ts.
 *
 * `.test.tsx` para rodar no projeto client (jsdom) — `window` presente.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  readBibliotecaFilters,
  writeBibliotecaFilters,
  DEFAULT_BIBLIOTECA_FILTERS,
  type BibliotecaPersistedFilters,
} from '@/lib/bibliotecaFilters';

const KEY = 'grindfy.biblioteca.filters';

beforeEach(() => {
  localStorage.clear();
});

describe('readBibliotecaFilters', () => {
  it('retorna defaults quando nao ha nada salvo', () => {
    expect(readBibliotecaFilters()).toEqual(DEFAULT_BIBLIOTECA_FILTERS);
  });

  it('retorna defaults quando o JSON esta corrompido', () => {
    localStorage.setItem(KEY, '{nao eh json valido');
    expect(readBibliotecaFilters()).toEqual(DEFAULT_BIBLIOTECA_FILTERS);
  });

  it('retorna defaults quando o valor nao e objeto', () => {
    localStorage.setItem(KEY, '"uma string"');
    expect(readBibliotecaFilters()).toEqual(DEFAULT_BIBLIOTECA_FILTERS);
  });

  it('sanitiza campos com tipo errado', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        filterType: 123,
        filterSites: ['PokerStars', 42, null],
        filterMinBuyIn: 'abc',
        sortMode: undefined,
      }),
    );
    const res = readBibliotecaFilters();
    expect(res.filterType).toBe('');
    expect(res.filterSites).toEqual(['PokerStars']);
    expect(res.filterMinBuyIn).toBe('abc'); // string valida — preservada
    expect(res.sortMode).toBe(DEFAULT_BIBLIOTECA_FILTERS.sortMode);
  });
});

describe('writeBibliotecaFilters + readBibliotecaFilters (roundtrip)', () => {
  it('persiste e recupera o estado exato dos filtros', () => {
    const filters: BibliotecaPersistedFilters = {
      filterType: 'PKO',
      filterSpeed: 'Turbo',
      filterSites: ['PokerStars', 'GGPoker'],
      filterCurrency: 'USD',
      filterMinBuyIn: '50',
      filterMaxBuyIn: '200',
      sortMode: 'buyin',
    };
    writeBibliotecaFilters(filters);
    expect(readBibliotecaFilters()).toEqual(filters);
  });

  it('exemplo do pedido: buy-in minimo 50 sobrevive ao reload', () => {
    writeBibliotecaFilters({ ...DEFAULT_BIBLIOTECA_FILTERS, filterMinBuyIn: '50' });
    // Simula reabrir a pagina — nova leitura.
    expect(readBibliotecaFilters().filterMinBuyIn).toBe('50');
  });
});
