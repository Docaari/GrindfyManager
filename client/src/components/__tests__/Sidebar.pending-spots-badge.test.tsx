/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint F2 — W4: Sidebar badge de Spots Pendentes (RF-10 AC: "Badge sidebar
 * /studies com count de pending").
 *
 * Spec : Docs/specs/sprint-f2-spot-screenshots.md (RF-10 — Badge sidebar)
 *
 * Lessons aplicadas:
 *   #1  hooks first
 *   #2  data-testid estavel — `sidebar-pending-spots-badge`
 *   #3  shape REAL — query response { items, total }
 *   #4  vitest 4 + jsdom + projects
 *   #11 default minimo — badge so aparece quando count > 0
 *   #12 estado persistente via TanStack Query
 *
 * NOTA W4 RED: green W3 (Sidebar.tsx atual) NAO consome /api/starred-hands/pending
 * nem renderiza badge. Implementacao W4 acrescenta:
 *   - useQuery(['/api/starred-hands/pending', { reviewLater: 'all' }]) para
 *     obter count.
 *   - Renderiza <span data-testid="sidebar-pending-spots-badge"> proximo ao
 *     item /estudos quando count > 0.
 *   - Numero limita a "99+" se count > 99.
 *
 * Decisao: como Sidebar nao tem testid no item /estudos atualmente, o teste
 * checa pela presenca do badge no DOM (via testid) sem verificar parentesco
 * exato com o link /estudos — Implementer deve posicionar visualmente proximo
 * ao item Estudos. Assertion fraca para nao acoplar a estrutura DOM (lesson #4).
 *
 * Wiring esperado (a Implementer):
 *   import { useQuery } from '@tanstack/react-query';
 *   const { data } = useQuery({
 *     queryKey: ['/api/starred-hands/pending', { reviewLater: 'all' }],
 *     queryFn: () => apiRequest('GET', '/api/starred-hands/pending?reviewLater=all'),
 *     staleTime: 30_000,
 *     enabled: isAuthenticated,
 *   });
 *
 * REQUISITO PRE-W4 (BLOCKER): vitest.config.ts NAO mapeia `@assets`. Sidebar
 * importa `@assets/grindfy-logo-mark.png`. Sem o alias, vite:import-analysis
 * falha em transform-time ANTES de qualquer vi.mock kick in. Implementer (W4)
 * deve resolver via UMA das opcoes:
 *   (a) adicionar alias `@assets` -> `attached_assets` em vitest.config.ts
 *       (raiz + cada project), OU
 *   (b) extrair badge para hook dedicado (e.g., `useSidebarPendingSpotsCount`)
 *       em arquivo separado que possa ser testado sem importar Sidebar.tsx.
 * Ate la, este teste FALHA com "Failed to resolve import @assets/..." — esse
 * eh o sinal red esperado para sinalizar o requisito de wiring de config.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks
// =============================================================================

const mocks = vi.hoisted(() => ({
  apiRequestMock: ((..._args: any[]) => undefined) as any,
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mocks.apiRequestMock(...args),
  queryClient: {
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  },
  getCsrfToken: () => null,
}));

const apiRequestMock = vi.fn();
mocks.apiRequestMock = apiRequestMock;

const mockUseAuth = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: any) => children,
}));

const mockUseLocation = vi.fn(() => ['/dashboard', vi.fn()] as any);
vi.mock('wouter', () => ({
  useLocation: () => mockUseLocation(),
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

// Asset import — Vite resolve `@assets/*.webp` em prod; em vitest o alias
// `@assets` NAO esta configurado em vitest.config.ts (nao podemos alterar
// config sem permission do founder). Workaround: mock como virtual module
// que captura o specifier exato usado por Sidebar.tsx.
// Lesson #4: nao ha "transform error em cascata" porque vi.mock eh hoisted
// e injeta um stub antes do import-analysis tentar resolver o path real.
vi.mock('@assets/grindfy-logo-mark.png', () => ({ default: 'grindfy-logo-mark.png' }), {
  virtual: true,
} as any);

// Modais sao abertos por triggers — stub para evitar Radix em teste isolado.
vi.mock('@/components/BugReportModal', () => ({
  default: ({ trigger }: any) => <>{trigger}</>,
}));
vi.mock('@/components/ImprovementSuggestionModal', () => ({
  default: ({ trigger }: any) => <>{trigger}</>,
}));

import Sidebar from '../Sidebar';

// =============================================================================
// Helpers
// =============================================================================

function freshClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function wrap(ui: React.ReactNode) {
  return <QueryClientProvider client={freshClient()}>{ui}</QueryClientProvider>;
}

function setAuth(isAuthenticated: boolean = true) {
  mockUseAuth.mockReturnValue({
    user: isAuthenticated
      ? {
          userPlatformId: 'USER-0001',
          email: 'a@b.com',
          name: 'Test',
          trialEndsAt: null,
          subscriptionStatus: 'active',
        }
      : null,
    isAuthenticated,
    isAdmin: false,
    hasAccess: isAuthenticated,
    logout: vi.fn(),
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
  mockUseAuth.mockReset();
  mockUseLocation.mockReset();
  mockUseLocation.mockReturnValue(['/dashboard', vi.fn()]);
  setAuth(true);
});

// =============================================================================
// Cenario S1: Badge aparece com count quando ha prints pendentes
// Cobre RF-10 AC: "Badge sidebar /studies com count de pending"
// =============================================================================

describe('Sidebar — pending spots badge (W4)', () => {
  it('renderiza data-testid="sidebar-pending-spots-badge" com count quando total > 0', async () => {
    // Cobre RF-10: badge aparece com count quando ha pendentes.
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({ items: [], total: 7, limit: 50, offset: 0 });
      }
      return Promise.resolve({});
    });

    render(wrap(<Sidebar />));

    await waitFor(() => {
      const badge = screen.queryByTestId('sidebar-pending-spots-badge');
      expect(badge).toBeInTheDocument();
    });

    const badge = screen.getByTestId('sidebar-pending-spots-badge');
    expect(badge.textContent).toContain('7');
  });

  it('query usa endpoint /api/starred-hands/pending?reviewLater=all', async () => {
    // Cobre RF-10: count vem de reviewLater=all (union pending + reviewLater).
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({ items: [], total: 3, limit: 50, offset: 0 });
      }
      return Promise.resolve({});
    });

    render(wrap(<Sidebar />));

    await waitFor(() => {
      const calls = apiRequestMock.mock.calls;
      const found = calls.find(
        (c) =>
          /^GET$/i.test(String(c[0])) &&
          /\/api\/starred-hands\/pending/.test(String(c[1])) &&
          /reviewLater=all/.test(String(c[1])),
      );
      expect(found).toBeDefined();
    });
  });
});

// =============================================================================
// Cenario S2: Badge NAO aparece quando count=0
// Cobre RF-11 default minimo — sem badge sem motivo.
// =============================================================================

describe('Sidebar — badge oculto quando vazio', () => {
  it('NAO renderiza badge quando total=0', async () => {
    // Cobre regra de UI: nao poluir sidebar com "0".
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({ items: [], total: 0, limit: 50, offset: 0 });
      }
      return Promise.resolve({});
    });

    render(wrap(<Sidebar />));

    // Aguarda algum momento para query completar.
    await new Promise((r) => setTimeout(r, 100));

    const badge = screen.queryByTestId('sidebar-pending-spots-badge');
    expect(badge).not.toBeInTheDocument();
  });
});

// =============================================================================
// Cenario S3: Badge NAO aparece durante loading
// Cobre garantia: nao mostrar "0" ou skeleton no sidebar (UX limpa).
// =============================================================================

describe('Sidebar — badge oculto durante loading', () => {
  it('NAO renderiza badge enquanto query esta em flight', async () => {
    // Cobre garantia: queries pendentes nao geram badge (evita flicker).
    let resolveFn: (v: any) => void = () => {};
    apiRequestMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );

    render(wrap(<Sidebar />));

    // Sem await — badge nao deve estar visivel imediatamente.
    const badge = screen.queryByTestId('sidebar-pending-spots-badge');
    expect(badge).not.toBeInTheDocument();

    // Resolve para evitar leak.
    resolveFn({ items: [], total: 0, limit: 50, offset: 0 });
  });
});

// =============================================================================
// Cenario S4: Badge limita a "99+" para count > 99
// Cobre RF-10 AC: "Numero limita a 99+ se >99"
// =============================================================================

describe('Sidebar — badge formatado (99+)', () => {
  it('quando total > 99, badge mostra "99+"', async () => {
    // Cobre RF-10: limite visual para nao quebrar layout do sidebar.
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({ items: [], total: 142, limit: 50, offset: 0 });
      }
      return Promise.resolve({});
    });

    render(wrap(<Sidebar />));

    await waitFor(() => {
      expect(
        screen.queryByTestId('sidebar-pending-spots-badge'),
      ).toBeInTheDocument();
    });

    const badge = screen.getByTestId('sidebar-pending-spots-badge');
    expect(badge.textContent).toContain('99+');
    // NAO deve mostrar o numero raw
    expect(badge.textContent).not.toContain('142');
  });

  it('exatamente 99 mostra "99" (nao "99+")', async () => {
    // Cobre boundary: 99 cabe no UI; 100+ vira "99+".
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({ items: [], total: 99, limit: 50, offset: 0 });
      }
      return Promise.resolve({});
    });

    render(wrap(<Sidebar />));

    await waitFor(() => {
      expect(
        screen.queryByTestId('sidebar-pending-spots-badge'),
      ).toBeInTheDocument();
    });

    const badge = screen.getByTestId('sidebar-pending-spots-badge');
    expect(badge.textContent).toContain('99');
    expect(badge.textContent).not.toContain('99+');
  });
});

// =============================================================================
// Cenario S5: Badge nao aparece quando user nao autenticado
// Cobre garantia: query so dispara quando ha user (evita 401 em route publica).
// =============================================================================

describe('Sidebar — badge respeita auth', () => {
  it('NAO faz request /api/starred-hands/pending quando user=null', async () => {
    // Cobre garantia: query nao dispara em logout.
    setAuth(false);

    render(wrap(<Sidebar />));

    await new Promise((r) => setTimeout(r, 50));

    const calls = apiRequestMock.mock.calls;
    const pendingCall = calls.find(
      (c) =>
        /^GET$/i.test(String(c[0])) &&
        /\/api\/starred-hands\/pending/.test(String(c[1])),
    );
    expect(pendingCall).toBeUndefined();
  });
});
