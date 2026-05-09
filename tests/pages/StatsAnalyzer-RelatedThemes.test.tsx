/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint stats-themes-linking-1 — RF-06: Stats Analyzer drawer "Temas relacionados"
 *
 * Spec : Docs/specs/stats-themes-linking-1.md §RF-06
 *
 * Cobertura:
 *   - Drawer abre para stat com 0 themes -> empty state
 *   - Drawer abre para stat com 3 themes -> 3 chips
 *   - Click em chip navega `/estudos/:slug`
 *   - Loading state aparece com skeleton
 *   - Erro 500 mostra texto inline sem crash
 *   - Cada chip exibe label + badge category
 *
 * Lessons aplicadas:
 *   #14 await import(...).
 *   #29 sub-arvore com useQuery sem QueryClientProvider — usar ErrorBoundary
 *      ou wrapping com QueryClient explicito.
 *
 * Status RED: section <RelatedThemesSection> nao existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { useQueryMock, navigateMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return { ...actual, useQuery: useQueryMock };
});

vi.mock('wouter', () => ({
  useLocation: () => ['/stats', navigateMock],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: vi.fn(),
  queryClient: { invalidateQueries: vi.fn(), setQueryData: vi.fn(), getQueryData: vi.fn() },
}));

beforeEach(() => {
  cleanup();
  useQueryMock.mockReset();
  navigateMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadSection() {
  const mod: any = await import('@/components/stats/RelatedThemesSection');
  return mod.RelatedThemesSection ?? mod.default;
}

const themeFixtures = [
  { themeId: 'th_a', name: 'Aliados Multiway', slug: 'aliados-multiway', category: 'multiway' },
  { themeId: 'th_b', name: 'BB Defense', slug: 'bb-def', category: 'preflop' },
  { themeId: 'th_c', name: 'C-bet OOP', slug: 'cbet-oop', category: 'postflop' },
];

// =============================================================================
// Empty state
// =============================================================================
describe('<RelatedThemesSection> — empty state', () => {
  it('exibe empty state quando array vazio', async () => {
    useQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
    const Section = await loadSection();
    renderWithClient(<Section statId="vpip" />);
    expect(screen.getByTestId('related-themes-empty')).toBeInTheDocument();
    // Texto "nenhum tema linka esta stat" (case-insensitive)
    expect(screen.getByText(/nenhum tema linka/i)).toBeInTheDocument();
  });
});

// =============================================================================
// Loading state
// =============================================================================
describe('<RelatedThemesSection> — loading', () => {
  it('exibe skeleton placeholder enquanto carrega', async () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });
    const Section = await loadSection();
    renderWithClient(<Section statId="vpip" />);
    expect(screen.getByTestId('related-themes-loading')).toBeInTheDocument();
  });
});

// =============================================================================
// 3 chips
// =============================================================================
describe('<RelatedThemesSection> — 3 chips', () => {
  it('renderiza 3 chips quando 3 themes linkam', async () => {
    useQueryMock.mockReturnValue({
      data: themeFixtures,
      isLoading: false,
      error: null,
    });
    const Section = await loadSection();
    renderWithClient(<Section statId="vpip" />);
    const chips = screen.getAllByTestId(/^related-theme-chip-/);
    expect(chips).toHaveLength(3);
  });

  it('chip exibe label do tema', async () => {
    useQueryMock.mockReturnValue({
      data: [themeFixtures[2]],
      isLoading: false,
      error: null,
    });
    const Section = await loadSection();
    renderWithClient(<Section statId="vpip" />);
    expect(screen.getByText('C-bet OOP')).toBeInTheDocument();
  });
});

// =============================================================================
// Click navigate
// =============================================================================
describe('<RelatedThemesSection> — click chip', () => {
  it('click chip navega /estudos/:slug', async () => {
    useQueryMock.mockReturnValue({
      data: [themeFixtures[2]],
      isLoading: false,
      error: null,
    });
    const Section = await loadSection();
    renderWithClient(<Section statId="vpip" />);
    const chip = screen.getByTestId('related-theme-chip-th_c');
    fireEvent.click(chip);

    // Aceita navigate via setLocation OU click em href Wouter
    const calls = navigateMock.mock.calls.flat().join(' ');
    if (calls) {
      expect(calls).toMatch(/\/estudos\/cbet-oop/);
    } else {
      const href = chip.getAttribute('href');
      expect(href).toMatch(/\/estudos\/cbet-oop/);
    }
  });
});

// =============================================================================
// Erro
// =============================================================================
describe('<RelatedThemesSection> — erro', () => {
  it('exibe texto inline em caso de erro 500', async () => {
    useQueryMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Internal Server Error'),
    });
    const Section = await loadSection();
    renderWithClient(<Section statId="vpip" />);
    expect(screen.getByTestId('related-themes-error')).toBeInTheDocument();
  });
});
