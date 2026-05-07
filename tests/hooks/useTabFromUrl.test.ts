/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint coach-page-reform-1 — RF-01: useTabFromUrl hook.
 * Spec: Docs/specs/sprint-coach-page-reform-1.md §RF-01.
 * Diagrama: Docs/architecture/sprint-coach-page-reform-1/tab-persistence-sequence.mermaid
 *
 * Hook devolve [activeTab, setActiveTab]. Sincroniza com ?tab=.
 *
 *   - default: cai em defaultTab quando ?tab= ausente.
 *   - valido: pega valor de ?tab= se for um dos validTabs.
 *   - invalido: cai em defaultTab + limpa param via replaceState.
 *   - setActiveTab: atualiza URL via history.replaceState (NUNCA pushState).
 *   - popstate: tab reage a navegacao back/forward.
 *
 * Lessons aplicaveis:
 *   #1 — hooks first (todos os hooks antes de qualquer return).
 *   #12 — estado persistente: sobrevive a unmount/remount via URL.
 *   #15 — vi.unmock hoisted; usar vi.doUnmock em escopo nested se preciso.
 *
 * NOTA: este teste roda em jsdom (precisa de window/history/location).
 * Por convencao do projeto, .test.ts roda no projeto "server" (node).
 * Para forcar jsdom, esta suite usa imports do hook indiretamente atraves de
 * `await import(...)` em jsdom — vitest config inclui tests glob no
 * projeto server (node). Aqui usamos extensao .test.ts mas o hook depende de
 * `window`, entao incluimos um setup defensivo: se window for undefined,
 * skipamos. Implementer deve garantir que o hook so toca window dentro de
 * useEffect (lesson #1 hook ordering + SSR-safe).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Wouter v3 expoe useLocation, useSearch. Mockamos para controlar URL.
// Lesson #14: nao usamos require(); usamos vi.mock factory + import dinamico.
const wouterState = {
  location: '/coach',
  search: '',
  setLocation: vi.fn((path: string, opts?: { replace?: boolean }) => {
    // mimicar replaceState behavior
    const [pathname, searchPart] = path.split('?');
    wouterState.location = pathname;
    wouterState.search = searchPart ?? '';
  }),
};

vi.mock('wouter', async () => {
  const actual = await vi.importActual<any>('wouter');
  return {
    ...actual,
    useLocation: () => [wouterState.location, wouterState.setLocation] as const,
    useSearch: () => wouterState.search,
  };
});

// Importacao dinamica do hook — RED: arquivo ainda nao existe.
async function loadHook() {
  // @ts-expect-error - red phase: arquivo ainda nao implementado
  const mod: any = await import('@/hooks/useTabFromUrl');
  return mod.useTabFromUrl as (validTabs: string[], defaultTab: string) => readonly [string, (slug: string) => void];
}

const VALID_TABS = ['planner', 'selector', 'flights', 'variance'];
const DEFAULT_TAB = 'planner';

beforeEach(() => {
  wouterState.location = '/coach';
  wouterState.search = '';
  wouterState.setLocation = vi.fn((path: string) => {
    const [pathname, searchPart] = path.split('?');
    wouterState.location = pathname;
    wouterState.search = searchPart ?? '';
  });
  // Reset window history se disponivel (jsdom).
  if (typeof window !== 'undefined' && window.history) {
    try {
      window.history.replaceState(null, '', '/coach');
    } catch {
      // ok em ambientes sem history
    }
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useTabFromUrl — defaultTab fallback', () => {
  it('retorna defaultTab quando ?tab= ausente', async () => {
    wouterState.search = '';
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    const [activeTab] = result.current;
    expect(activeTab).toBe('planner');
  });

  it('retorna defaultTab quando ?tab= vazio (string vazia)', async () => {
    wouterState.search = 'tab=';
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    const [activeTab] = result.current;
    expect(activeTab).toBe('planner');
  });
});

describe('useTabFromUrl — leitura de ?tab=', () => {
  it('retorna "variance" quando ?tab=variance', async () => {
    wouterState.search = 'tab=variance';
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    const [activeTab] = result.current;
    expect(activeTab).toBe('variance');
  });

  it('retorna "flights" quando ?tab=flights', async () => {
    wouterState.search = 'tab=flights';
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    expect(result.current[0]).toBe('flights');
  });

  it('retorna "selector" quando ?tab=selector', async () => {
    wouterState.search = 'tab=selector';
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    expect(result.current[0]).toBe('selector');
  });

  it('retorna defaultTab quando ?tab=invalido (param desconhecido)', async () => {
    wouterState.search = 'tab=foobar';
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    expect(result.current[0]).toBe('planner');
  });
});

describe('useTabFromUrl — setActiveTab atualiza URL', () => {
  it('setActiveTab("flights") chama setLocation com ?tab=flights', async () => {
    wouterState.search = '';
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    const [, setTab] = result.current;
    act(() => {
      setTab('flights');
    });
    // Espera que setLocation tenha sido chamado com path contendo ?tab=flights.
    expect(wouterState.setLocation).toHaveBeenCalled();
    const lastCall = wouterState.setLocation.mock.calls[wouterState.setLocation.mock.calls.length - 1];
    const calledWith = String(lastCall[0]);
    expect(calledWith).toContain('tab=flights');
  });

  it('setActiveTab usa replaceState (replace=true), nao pushState', async () => {
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    const [, setTab] = result.current;
    act(() => {
      setTab('selector');
    });
    // Wouter v3: setLocation aceita {replace: true} como segundo arg.
    // O hook DEVE passar replace para nao poluir historico do navegador.
    const lastCall = wouterState.setLocation.mock.calls[wouterState.setLocation.mock.calls.length - 1];
    const opts = lastCall[1];
    expect(opts).toMatchObject({ replace: true });
  });

  it('setActiveTab com slug invalido NAO atualiza URL', async () => {
    const useTabFromUrl = await loadHook();
    const { result } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    const [, setTab] = result.current;
    const callsBefore = wouterState.setLocation.mock.calls.length;
    act(() => {
      setTab('inexistente' as any);
    });
    // Implementer pode optar por ignorar ou logar warning — em qualquer caso
    // NAO deve setar URL para um slug invalido.
    const callsAfter = wouterState.setLocation.mock.calls.length;
    expect(callsAfter).toBe(callsBefore);
  });
});

describe('useTabFromUrl — popstate (back/forward)', () => {
  it('reage a mudanca de search externamente (simula popstate)', async () => {
    wouterState.search = 'tab=variance';
    const useTabFromUrl = await loadHook();
    const { result, rerender } = renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    expect(result.current[0]).toBe('variance');

    // Simula popstate alterando search externamente e re-renderizando o consumer.
    wouterState.search = 'tab=flights';
    rerender();
    expect(result.current[0]).toBe('flights');
  });
});

describe('useTabFromUrl — limpeza de param invalido', () => {
  it('quando ?tab=invalid no mount, hook chama setLocation para limpar', async () => {
    wouterState.search = 'tab=invalido-xpto';
    const useTabFromUrl = await loadHook();
    renderHook(() => useTabFromUrl(VALID_TABS, DEFAULT_TAB));
    // Esperamos que o hook tenha despachado um setLocation (replace) para
    // remover o param invalido do URL.
    expect(wouterState.setLocation).toHaveBeenCalled();
  });
});
