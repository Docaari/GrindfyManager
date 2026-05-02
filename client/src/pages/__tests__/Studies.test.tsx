/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Studies-Reform — RF-01: Studies wrapper reformado
 *
 * Spec:    Docs/specs/sprint-studies-reform.md (RF-01)
 * ADR-067: sidebar collapsivel + URL routing sub-paths Wouter
 *
 * Lessons aplicadas:
 *   #1  hooks first (useQuery / useMutation antes de qualquer return)
 *   #2  data-testid estavel: studies-nav-sidebar, studies-bottom-nav,
 *       studies-nav-item-{view}, studies-layout-main, studies-view-{view}
 *   #3  shape REAL — themes/snapshots/spots minimos do storage
 *  #11 default minimo no shell — sem actions decorativas
 *  #12 cache TanStack continuity (StudiesLayout permanece montado)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// =============================================================================
// Mocks (modulos NAO existem ainda em red phase — imports vao falhar)
// =============================================================================

const navigateMock = vi.fn();
const locationStateMock = vi.hoisted(() => ({ path: '/estudos' }));

vi.mock('wouter', () => ({
  useLocation: () => [locationStateMock.path, navigateMock],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
  Switch: ({ children }: any) => <>{children}</>,
  Route: ({ children }: any) => <>{typeof children === 'function' ? children({}) : children}</>,
  Redirect: ({ to }: any) => <div data-testid="redirect" data-to={to} />,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => true,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { userPlatformId: 'USER-0001' } }),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(async () => ({})),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
  getCsrfToken: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn(), dismiss: vi.fn() }),
  toast: vi.fn(),
}));

// matchMedia helper para alternar breakpoints entre testes
function setMatchMedia(predicate: (query: string) => boolean) {
  (window as any).matchMedia = (query: string) => ({
    matches: predicate(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}

// Componente de pagina — NAO existe ainda no formato reformado (red phase)
import Studies from '@/pages/Studies';

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  navigateMock.mockReset();
  locationStateMock.path = '/estudos';
  // Default desktop
  setMatchMedia((q) => q.includes('1024'));
  localStorage.clear();
});

describe('RF-01 Studies wrapper reformado', () => {
  it('renders sidebar em desktop (>=1024px)', async () => {
    setMatchMedia((q) => q.includes('1024')); // matches desktop
    render(withClient(<Studies />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-nav-sidebar')).toBeInTheDocument();
    });
  });

  it('renders bottom-nav em mobile (<768px)', async () => {
    setMatchMedia((q) => q.includes('max-width: 767') || q === '(max-width: 767px)');
    render(withClient(<Studies />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-bottom-nav')).toBeInTheDocument();
    });
  });

  it('renders sidebar collapsed em tablet (768-1023px)', async () => {
    setMatchMedia((q) => q.includes('min-width: 768') && !q.includes('1024'));
    render(withClient(<Studies />));
    await waitFor(() => {
      const sidebar = screen.getByTestId('studies-nav-sidebar');
      expect(sidebar).toHaveAttribute('data-collapsed', 'true');
    });
  });

  it('click em sidebar item navega via Wouter', async () => {
    setMatchMedia((q) => q.includes('1024'));
    render(withClient(<Studies />));
    const item = await screen.findByTestId('studies-nav-item-temas');
    await userEvent.click(item);
    expect(navigateMock).toHaveBeenCalledWith('/estudos/temas');
  });

  it('URL /estudos/temas carrega ThemesView', async () => {
    locationStateMock.path = '/estudos/temas';
    render(withClient(<Studies />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-view-temas')).toBeInTheDocument();
    });
  });

  it('URL /estudos/stats carrega StatsView wrapper', async () => {
    locationStateMock.path = '/estudos/stats';
    render(withClient(<Studies />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-view-stats')).toBeInTheDocument();
    });
  });

  it('URL /estudos/spots carrega SpotsView', async () => {
    locationStateMock.path = '/estudos/spots';
    render(withClient(<Studies />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-view-spots')).toBeInTheDocument();
    });
  });

  it('URL /estudos/recomendacoes carrega RecommendationsView', async () => {
    locationStateMock.path = '/estudos/recomendacoes';
    render(withClient(<Studies />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-view-recomendacoes')).toBeInTheDocument();
    });
  });

  it('URL /estudos (D2) renderiza dashboard como default', async () => {
    locationStateMock.path = '/estudos';
    render(withClient(<Studies />));
    await waitFor(() => {
      expect(screen.getByTestId('studies-view-dashboard')).toBeInTheDocument();
    });
  });

  it('URL desconhecida /estudos/foo redireciona para dashboard', async () => {
    locationStateMock.path = '/estudos/foo';
    render(withClient(<Studies />));
    await waitFor(() => {
      // redirect ou render do dashboard
      const redirect = screen.queryByTestId('redirect');
      const dash = screen.queryByTestId('studies-view-dashboard');
      expect(redirect || dash).toBeTruthy();
      if (redirect) expect(redirect.getAttribute('data-to')).toBe('/estudos/dashboard');
    });
  });

  it('active item e destacado (aria-current page)', async () => {
    setMatchMedia((q) => q.includes('1024'));
    locationStateMock.path = '/estudos/temas';
    render(withClient(<Studies />));
    const item = await screen.findByTestId('studies-nav-item-temas');
    expect(item.getAttribute('aria-current')).toBe('page');
  });

  it('sidebar collapse persiste localStorage', async () => {
    setMatchMedia((q) => q.includes('1024'));
    render(withClient(<Studies />));
    const toggle = await screen.findByTestId('studies-sidebar-toggle');
    await userEvent.click(toggle);
    expect(localStorage.getItem('grindfy:studies:sidebar_collapsed')).toBe('true');
  });

  it('Cmd+K dentro de /estudos abre quick search palette', async () => {
    locationStateMock.path = '/estudos/dashboard';
    render(withClient(<Studies />));
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });
    await waitFor(() => {
      expect(screen.getByTestId('quick-search-palette')).toBeInTheDocument();
    });
  });
});
