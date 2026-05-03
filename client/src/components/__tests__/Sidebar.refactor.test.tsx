/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1 — RF-07 (Refactor Sidebar.tsx aplicando D19).
 *
 * Spec : Docs/specs/home-reform-1.md §RF-07, §3 D19, §5.11 F10
 * ADR  : Docs/architecture/decisions/101-home-sidebar-information-architecture.md
 *
 * Mudancas validadas:
 *   - 5 grupos: HOJE / GRIND / ESTUDOS / FERRAMENTAS / ADMIN
 *   - Item path '/' label "Hoje" (era "Home")
 *   - GRIND ordem: Grade -> Grind -> Warm Up -> Coach IA -> Flight
 *   - ESTUDOS contem Estudos + Biblioteca
 *   - FERRAMENTAS contem Calculadoras + Banca apenas
 *   - Badges (pendingSpots, "Novo" Biblioteca) preservados
 *   - Footer (trial badge, Settings, Logout) inalterado
 *   - Header consome <HeaderLogo variant='mark'>
 *
 * Status RED: Sidebar.tsx atual tem 4 grupos com VISAO GERAL/Home/etc —
 * implementer aplicara D19.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
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

// Asset stubs (Vite alias @assets nao configurado em vitest)
vi.mock('@assets/grindfy-logo-mark.png', () => ({ default: 'grindfy-logo-mark.png' }), {
  virtual: true,
} as any);
vi.mock('@assets/grindfy-logo-full.png', () => ({ default: 'grindfy-logo-full.png' }), {
  virtual: true,
} as any);

// Modal stubs
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
// 5 grupos na ordem correta (D19)
// =============================================================================

describe('Sidebar refactor — 5 grupos na ordem (D19)', () => {
  it('renderiza grupos HOJE / GRIND / ESTUDOS / FERRAMENTAS na ordem (admin oculto)', async () => {
    setAuth(true, false);
    render(wrap(<Sidebar />));

    const sections = await screen.findAllByTestId(/^sidebar-section-/);
    const titles = sections.map((s) => s.getAttribute('data-testid'));
    // Esperamos pelo menos os 4 visiveis
    expect(titles).toEqual(
      expect.arrayContaining([
        'sidebar-section-hoje',
        'sidebar-section-grind',
        'sidebar-section-estudos',
        'sidebar-section-ferramentas',
      ]),
    );
    // Ordem correta
    const idxHoje = titles.indexOf('sidebar-section-hoje');
    const idxGrind = titles.indexOf('sidebar-section-grind');
    const idxEstudos = titles.indexOf('sidebar-section-estudos');
    const idxFerr = titles.indexOf('sidebar-section-ferramentas');
    expect(idxHoje).toBeLessThan(idxGrind);
    expect(idxGrind).toBeLessThan(idxEstudos);
    expect(idxEstudos).toBeLessThan(idxFerr);
  });

  it('admin ve grupo ADMIN apos FERRAMENTAS', async () => {
    setAuth(true, true);
    render(wrap(<Sidebar />));
    const sections = await screen.findAllByTestId(/^sidebar-section-/);
    const titles = sections.map((s) => s.getAttribute('data-testid'));
    expect(titles).toContain('sidebar-section-admin');
    const idxFerr = titles.indexOf('sidebar-section-ferramentas');
    const idxAdmin = titles.indexOf('sidebar-section-admin');
    expect(idxAdmin).toBeGreaterThan(idxFerr);
  });
});

// =============================================================================
// Item path '/' label "Hoje" (NAO "Home")
// =============================================================================

describe('Sidebar refactor — label "Hoje" no item raiz', () => {
  it('item com path / tem label "Hoje", NAO "Home"', async () => {
    render(wrap(<Sidebar />));
    const link = await screen.findByRole('link', { name: /hoje/i });
    expect(link.getAttribute('href')).toBe('/');
    // Garante que NAO ha link "Home" (label antigo)
    expect(screen.queryByRole('link', { name: /^home$/i })).not.toBeInTheDocument();
  });
});

// =============================================================================
// GRIND ordem: Grade -> Grind -> Warm Up -> Coach IA -> Flight
// =============================================================================

describe('Sidebar refactor — GRIND ordem (D19)', () => {
  it('items GRIND na ordem Grade / Grind / Warm Up / Coach IA / Flight', async () => {
    render(wrap(<Sidebar />));
    const grindSection = await screen.findByTestId('sidebar-section-grind');
    const links = within(grindSection).getAllByRole('link');
    const labels = links.map((l) => l.textContent?.toLowerCase().trim() || '');
    const idxGrade = labels.findIndex((t) => t.includes('grade'));
    const idxGrind = labels.findIndex((t) => /^grind$|^\sgrind\s/.test(t) || t === 'grind');
    const idxWarm = labels.findIndex((t) => t.includes('warm'));
    const idxCoach = labels.findIndex((t) => t.includes('coach'));
    const idxFlight = labels.findIndex((t) => t.includes('flight'));
    expect(idxGrade).toBeGreaterThanOrEqual(0);
    expect(idxGrind).toBeGreaterThan(idxGrade);
    expect(idxWarm).toBeGreaterThan(idxGrind);
    expect(idxCoach).toBeGreaterThan(idxWarm);
    expect(idxFlight).toBeGreaterThan(idxCoach);
  });
});

// =============================================================================
// ESTUDOS contem Estudos + Biblioteca
// =============================================================================

describe('Sidebar refactor — ESTUDOS grupo proprio', () => {
  it('ESTUDOS contem item Estudos (path /estudos)', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-estudos');
    const link = within(sec).getByRole('link', { name: /estudos/i });
    expect(link.getAttribute('href')).toBe('/estudos');
  });

  it('ESTUDOS contem item Biblioteca (path /biblioteca)', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-estudos');
    const link = within(sec).getByRole('link', { name: /biblioteca/i });
    expect(link.getAttribute('href')).toBe('/biblioteca');
  });
});

// =============================================================================
// FERRAMENTAS reduzido
// =============================================================================

describe('Sidebar refactor — FERRAMENTAS reduzido (D19)', () => {
  it('FERRAMENTAS contem APENAS Calculadoras + Banca', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-ferramentas');
    const links = within(sec).getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/calculadoras', '/bankroll']));
    // NAO contem rotas de outros grupos
    expect(hrefs).not.toContain('/estudos');
    expect(hrefs).not.toContain('/biblioteca');
    expect(hrefs).not.toContain('/flight');
  });
});

// =============================================================================
// HOJE (era VISAO GERAL) — items
// =============================================================================

describe('Sidebar refactor — HOJE grupo', () => {
  it('HOJE contem Hoje / Dashboard / Import / Torneios', async () => {
    render(wrap(<Sidebar />));
    const sec = await screen.findByTestId('sidebar-section-hoje');
    const links = within(sec).getAllByRole('link');
    const hrefs = links.map((l) => l.getAttribute('href'));
    expect(hrefs).toEqual(
      expect.arrayContaining(['/', '/dashboard', '/upload', '/library']),
    );
  });
});

// =============================================================================
// Badges preservados (RNF-07 zero regressao)
// =============================================================================

describe('Sidebar refactor — badges preservados', () => {
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

  it('badge "Novo" em Biblioteca preservado (data-testid="sidebar-biblioteca-new-badge")', async () => {
    render(wrap(<Sidebar />));
    // Sidebar-biblioteca-new-badge ja existe na implementacao atual
    const badge = screen.queryByTestId('sidebar-biblioteca-new-badge');
    expect(badge).toBeInTheDocument();
  });
});

// =============================================================================
// Footer inalterado
// =============================================================================

describe('Sidebar refactor — footer inalterado', () => {
  it('Settings + Logout continuam no footer', async () => {
    render(wrap(<Sidebar />));
    expect(await screen.findByTestId('sidebar-footer-settings')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-footer-logout')).toBeInTheDocument();
  });
});

// =============================================================================
// HeaderLogo consumido (RF-06)
// =============================================================================

describe('Sidebar refactor — HeaderLogo integrado', () => {
  it('header da sidebar contem <HeaderLogo /> (data-testid="header-logo")', async () => {
    render(wrap(<Sidebar />));
    const logo = await screen.findByTestId('header-logo');
    expect(logo).toBeInTheDocument();
  });
});
