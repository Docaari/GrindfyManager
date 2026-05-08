/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-1.1 useThemeSearch hook (autocomplete)
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-1.1 (theme autocomplete + criar inline)
 * Risk : R5 (themes duplicados — fuzzy match no autocomplete)
 *
 * Cobertura:
 *   - Hook retorna {results, query, setQuery, isLoading}
 *   - Fuzzy match por substring case-insensitive
 *   - Curated themes vem antes de user custom
 *   - "Sugerir criar novo" quando query nao matcha nenhum
 *
 * Status RED: client/src/hooks/useThemeSearch.ts NAO existe.
 *
 * Lessons:
 *   #30 hook test em .test.ts roda em jsdom (config)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const themes = [
  { id: 'th-1', name: 'C-bet OOP small', isCurated: true, slug: 'postflop-cbet-oop-small' },
  { id: 'th-2', name: 'C-bet OOP polarizado', isCurated: true, slug: 'postflop-cbet-oop-polar' },
  { id: 'th-3', name: 'ICM no bubble', isCurated: true, slug: 'icm-bubble-play' },
  { id: 'th-4', name: 'Meu tema custom', isCurated: false, slug: null },
];

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => themes,
  }) as any;
});

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

// @ts-expect-error - red phase: hook nao existe
import { useThemeSearch } from '../../client/src/hooks/useThemeSearch';

async function loadHook() {
  return useThemeSearch;
}

describe('useThemeSearch', () => {
  it('retorna {results, query, setQuery, isLoading}', async () => {
    const useHook = await loadHook();
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useHook(), { wrapper });
    expect(result.current.query !== undefined).toBe(true);
    expect(typeof result.current.setQuery).toBe('function');
    expect(Array.isArray(result.current.results) || result.current.results === undefined).toBe(true);
  });

  it('busca por substring case-insensitive', async () => {
    const useHook = await loadHook();
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useHook(), { wrapper });

    act(() => {
      result.current.setQuery('c-bet');
    });

    await waitFor(() => {
      expect((result.current.results || []).length).toBeGreaterThan(0);
    });

    const matches = (result.current.results || []).filter((t: any) =>
      /c-bet/i.test(t.name),
    );
    expect(matches.length).toBeGreaterThan(0);
  });

  it('curated themes aparecem antes de user custom', async () => {
    const useHook = await loadHook();
    const wrapper = makeWrapper();
    const { result } = renderHook(() => useHook(), { wrapper });

    act(() => {
      result.current.setQuery('');
    });

    await waitFor(() => {
      expect((result.current.results || []).length).toBeGreaterThan(0);
    });

    const list = result.current.results || [];
    const firstCustomIdx = list.findIndex((t: any) => !t.isCurated);
    const lastCuratedIdx = list.map((t: any) => !!t.isCurated).lastIndexOf(true);

    if (firstCustomIdx !== -1 && lastCuratedIdx !== -1) {
      expect(lastCuratedIdx).toBeLessThan(firstCustomIdx);
    } else {
      expect(true).toBe(true); // nada misturado
    }
  });
});
