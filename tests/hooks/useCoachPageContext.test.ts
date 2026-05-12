/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint AI-0B / RF-04 — hook leve useCoachPageContext(route, fields).
 * Spec: Docs/specs/sprint-ai-0b.md §RF-04; ADR-149 §2.2 + §5 (item 10).
 *
 * Contrato:
 *   useCoachPageContext(route: string, fields?: Record<string, any>) ->
 *     - retorna { route, ...fields } quando `route` eh uma rota instrumentada
 *       do pageContextSchema (e fields filtrados — undefined nao aparece).
 *     - retorna undefined quando a rota nao eh instrumentada.
 *
 * Roda no projeto "client" (jsdom) — tests/hooks/  ja esta incluido la
 * (vitest.config.ts: include tests/hooks/  /*.test.ts no projeto client).
 * Lesson #30: hook test com renderHook precisa de jsdom -> config-level OK.
 * Lesson #14/#26: usa await import (nao require) para carregar o hook.
 * Lesson #31: evitar `*` seguido de `/` literal em comentarios com path patterns.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Wouter v3: useLocation. Mockamos para nao precisar de Router provider.
const wouterState = { location: '/coach-ai' };
vi.mock('wouter', async () => {
  const actual = await vi.importActual<any>('wouter');
  return {
    ...actual,
    useLocation: () => [wouterState.location, vi.fn()] as const,
  };
});

async function loadHook() {
  // RED: arquivo ainda nao existe.
  // @ts-expect-error - red phase: hook ainda nao implementado
  const mod: any = await import('@/hooks/useCoachPageContext');
  return mod.useCoachPageContext as (route: string, fields?: Record<string, any>) => any;
}

beforeEach(() => {
  wouterState.location = '/coach-ai';
});

describe('useCoachPageContext — rotas instrumentadas', () => {
  it('bankroll: retorna { route: bankroll, ...fields }', async () => {
    const useCoachPageContext = await loadHook();
    // activeTab 'movements' = key real do WalletActivityPanel (reviewer MEDIUM).
    const { result } = renderHook(() =>
      useCoachPageContext('bankroll', { walletsCount: 3, activeTab: 'movements' }),
    );
    expect(result.current).toEqual({ route: 'bankroll', walletsCount: 3, activeTab: 'movements' });
  });

  it('estudos: retorna { route: estudos, ...fields }', async () => {
    const useCoachPageContext = await loadHook();
    const { result } = renderHook(() =>
      useCoachPageContext('estudos', { spotsDueCount: 12, studyStreakDays: 4 }),
    );
    expect(result.current).toEqual({ route: 'estudos', spotsDueCount: 12, studyStreakDays: 4 });
  });

  it('coach-ai: retorna { route: coach-ai, activeCoachType }', async () => {
    const useCoachPageContext = await loadHook();
    const { result } = renderHook(() => useCoachPageContext('coach-ai', { activeCoachType: 'mental' }));
    expect(result.current).toEqual({ route: 'coach-ai', activeCoachType: 'mental' });
  });

  it('filtra campos undefined (nao manda chaves vazias)', async () => {
    const useCoachPageContext = await loadHook();
    const { result } = renderHook(() =>
      useCoachPageContext('bankroll', { walletsCount: 2, selectedWalletId: undefined, activeTab: undefined }),
    );
    expect(result.current).toEqual({ route: 'bankroll', walletsCount: 2 });
    expect(Object.prototype.hasOwnProperty.call(result.current, 'selectedWalletId')).toBe(false);
  });

  it('sem fields: retorna { route } apenas', async () => {
    const useCoachPageContext = await loadHook();
    const { result } = renderHook(() => useCoachPageContext('upload'));
    expect(result.current).toEqual({ route: 'upload' });
  });
});

describe('useCoachPageContext — rota nao instrumentada', () => {
  it('rota fora do schema -> undefined', async () => {
    const useCoachPageContext = await loadHook();
    const { result } = renderHook(() => useCoachPageContext('calendar' as any, { foo: 'bar' }));
    expect(result.current).toBeUndefined();
  });

  it('rota vazia/null -> undefined', async () => {
    const useCoachPageContext = await loadHook();
    const { result } = renderHook(() => useCoachPageContext('' as any));
    expect(result.current).toBeUndefined();
  });
});
