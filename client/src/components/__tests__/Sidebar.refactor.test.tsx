/**
 * Sidebar Reform 2026-05-03 (Opcao A — workflow conservador).
 *
 * 5 grupos: VISAO / JOGAR / ESTUDAR / UTILIDADES / ADMIN.
 * URLs preservadas. Coach IA migra pra Estudar. Banca sobe pra Visao.
 * Torneios migra pra Estudar. Import migra pra Utilidades.
 * Footer: Ajuda submenu colapsavel agrupa Bug + Sugestao.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

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

const mockUseLocation = vi.fn(() => ['/', vi.fn()] as any);
vi.mock('wouter', () => ({
  useLocation: () => mockUseLocation(),
  Link: ({ href, children }: any) => <a href={href}>{children}</a>,
}));

vi.mock('@assets/grindfy-logo-mark.png', () => ({ default: 'grindfy-logo-mark.png' }), {
  virtual: true,
} as any);
vi.mock('@assets/grindfy-logo-full.png', () => ({ default: 'grindfy-logo-full.png' }), {
  virtual: true,
} as any);

vi.mock('@/components/BugReportModal', () => ({
  default: ({ trigger }: any) => <>{trigger}</>,
}));
vi.mock('@/components/ImprovementSuggestionModal', () => ({
  default: ({ trigger }: any) => <>{trigger}</>,
}));

import Sidebar from '../Sidebar';

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

function setAuth(isAuthenticated: boolean = true, isAdmin = false) {
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
    isAdmin,
    hasAccess: isAuthenticated,
    logout: vi.fn(),
  });
}

beforeEach(() => {
  apiRequestMock.mockReset();
  apiRequestMock.mockResolvedValue({ items: [], total: 0 });
  mockUseAuth.mockReset();
  mockUseLocation.mockReset();
  mockUseLocation.mockReturnValue(['/', vi.fn()]);
  setAuth(true);
});

// =============================================================================
// 5 grupos na ordem correta
// =============================================================================

describe('Sidebar reform — 5 grupos na ordem (Opcao A)', () => {
  it('renderiza grupos VISAO / JOGAR / ESTUDAR / UTILIDADES na ordem (admin oculto)', async () => {
    setAuth(true, false);
    render(wrap(<Sidebar />));

    const sections = await screen.findAllByTestId(/^sidebar-section-/);
    const titles = sections.map((s) => s.getAttribute('data-testid'));
    expect(titles).toEqual(
      expect.arrayContaining([
        'sidebar-section-visao',
        'sidebar-section-jogar',
        'sidebar-section-estudar',
        'sidebar-section-utilidades',
      ]),
    );
    const idxVisao = titles.indexOf('sidebar-section-visao');
    const idxJogar = titles.indexOf('sidebar-section-jogar');
    const idxEstudar = titles.indexOf('sidebar-section-estudar');
    const idxUtil = titles.indexOf('sidebar-section-utilidades');
    expect(idxVisao).toBeLessThan(idxJogar);
    expect(idxJogar).toBeLessThan(idxEstudar);
    expect(idxEstudar).toBeLessThan(idxUtil);
  });

  it('admin ve grupo ADMIN apos UTILIDADES', async () => {
    setAuth(true, true);
    render(wrap(<Sidebar />));
    const sections = await screen.findAllByTestId(/^sidebar-section-/);
    const titles = sections.map((s) => s.getAttribute('data-testid'));
    expect(titles).toContain('sidebar-section-admin');
    const idxUtil = titles.indexOf('sidebar-section-utilidades');
    const idxAdmin = titles.indexOf('sidebar-section-admin');
    expect(idxAdmin).toBeGreaterThan(idxUtil);
  });
});

// =============================================================================
// VISAO — Hoje + Dashboard + Banca
// =============================================================================

describe('Sidebar reform — VISAO grupo', () => {
  it('VISAO contem Inicio (/), Dashboard, Banca', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-visao');
    const links = within(sec).getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/', '/dashboard', '/bankroll']));
  });

  it('item raiz tem label "Inicio" (home-reform-5 audit fix #3)', async () => {
    render(wrap(<Sidebar />));
    const link = await screen.findByRole('link', { name: /inicio/i });
    expect(link.getAttribute('href')).toBe('/');
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^hoje$/i })).not.toBeInTheDocument();
  });
});

// =============================================================================
// JOGAR — Grade -> Warm Up -> Grind -> Flight
// =============================================================================

describe('Sidebar reform — JOGAR ordem', () => {
  it('items JOGAR na ordem Grade / Warm Up / Grind / Flight', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-jogar');
    const links = within(sec).getAllByRole('link');
    const labels = links.map((l) => l.textContent?.toLowerCase().trim() || '');
    const idxGrade = labels.findIndex((t) => t.includes('grade'));
    const idxWarm = labels.findIndex((t) => t.includes('warm'));
    const idxGrind = labels.findIndex((t) => t === 'grind' || /^grind\s/.test(t));
    const idxFlight = labels.findIndex((t) => t.includes('flight'));
    expect(idxGrade).toBeGreaterThanOrEqual(0);
    expect(idxWarm).toBeGreaterThan(idxGrade);
    expect(idxGrind).toBeGreaterThan(idxWarm);
    expect(idxFlight).toBeGreaterThan(idxGrind);
  });

  it('JOGAR NAO contem Coach IA (migrou pra Estudar)', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-jogar');
    const hrefs = within(sec).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).not.toContain('/coach-ai');
  });
});

// =============================================================================
// ESTUDAR — Estudos + Coach IA + Biblioteca + Torneios
// =============================================================================

describe('Sidebar reform — ESTUDAR grupo', () => {
  it('ESTUDAR contem Estudos + Coach IA + Biblioteca + Torneios', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-estudar');
    const hrefs = within(sec).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/estudos', '/coach-ai', '/biblioteca', '/library']),
    );
  });
});

// =============================================================================
// UTILIDADES — Import + Calculadoras
// =============================================================================

describe('Sidebar reform — UTILIDADES grupo', () => {
  it('UTILIDADES contem APENAS Import + Calculadoras', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-utilidades');
    const hrefs = within(sec).getAllByRole('link').map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/upload', '/calculadoras']));
    expect(hrefs).not.toContain('/bankroll');
    expect(hrefs).not.toContain('/biblioteca');
    expect(hrefs).not.toContain('/library');
  });
});

// =============================================================================
// Badges preservados (zero regressao)
// =============================================================================

describe('Sidebar reform — badges preservados', () => {
  it('badge pendingSpots em /estudos preservado', async () => {
    apiRequestMock.mockImplementation((method: string, path: string) => {
      if (method === 'GET' && /\/api\/starred-hands\/pending/.test(path)) {
        return Promise.resolve({ items: [], total: 5 });
      }
      return Promise.resolve({});
    });
    render(wrap(<Sidebar />));
    await waitFor(() => {
      expect(screen.queryByTestId('sidebar-pending-spots-badge')).toBeInTheDocument();
    });
  });

  it('badge "Novo" em Biblioteca preservado', async () => {
    render(wrap(<Sidebar />));
    const badge = screen.queryByTestId('sidebar-biblioteca-new-badge');
    expect(badge).toBeInTheDocument();
  });
});

// =============================================================================
// Footer — Settings + Logout + Ajuda colapsavel
// =============================================================================

describe('Sidebar reform — footer', () => {
  it('Settings + Logout continuam no footer', async () => {
    render(wrap(<Sidebar />));
    expect(await screen.findByTestId('sidebar-footer-settings')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-footer-logout')).toBeInTheDocument();
  });

  it('Ajuda submenu inicia colapsado (Bug+Sugestao escondidos)', async () => {
    render(wrap(<Sidebar />));
    expect(await screen.findByTestId('sidebar-footer-help-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-footer-help-menu')).not.toBeInTheDocument();
  });

  it('clicar Ajuda expande submenu com Bug + Sugestao', async () => {
    render(wrap(<Sidebar />));
    const toggle = await screen.findByTestId('sidebar-footer-help-toggle');
    fireEvent.click(toggle);
    const menu = await screen.findByTestId('sidebar-footer-help-menu');
    expect(within(menu).getByText(/reportar bug/i)).toBeInTheDocument();
    expect(within(menu).getByText(/sugerir melhoria/i)).toBeInTheDocument();
  });
});

// =============================================================================
// HeaderLogo
// =============================================================================

describe('Sidebar reform — HeaderLogo integrado', () => {
  it('header da sidebar contem <HeaderLogo />', async () => {
    render(wrap(<Sidebar />));
    const logo = await screen.findByTestId('header-logo');
    expect(logo).toBeInTheDocument();
  });
});
