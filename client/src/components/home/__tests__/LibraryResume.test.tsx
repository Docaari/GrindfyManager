/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint home-reform-1-5 — RF-23 (B2 Continue Assistindo componente).
 *
 * Spec : Docs/specs/home-reform-1-5.md §RF-23, §5.2 B2, §RNF-1.5-6
 *
 * Componente recebe data via TanStack Query (apiRequest -> JSON parseado direto).
 * Lessons aplicadas:
 *   #13 apiRequest retorna JSON parseado diretamente — mocks retornam JSON
 *   #14 await import(...) em vez de require — ESM compat
 *   #15 vi.mock no top-level
 *
 * Status RED: componente NAO existe em
 * `client/src/components/home/LibraryResume.tsx`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mock wouter Link
// ---------------------------------------------------------------------------
const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  Link: ({ href, children, onClick, ...rest }: any) => (
    <a
      href={href}
      onClick={(e: any) => {
        mockNavigate(href);
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  ),
  useLocation: () => ['/', vi.fn()],
}));

// ---------------------------------------------------------------------------
// Mock tracker
// ---------------------------------------------------------------------------
const mockEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (...args: any[]) => mockEmit(...args),
}));

// ---------------------------------------------------------------------------
// Mock apiRequest — retorna JSON parseado direto (lesson #13)
// ---------------------------------------------------------------------------
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', async () => {
  const actual = await vi.importActual<any>('@/lib/queryClient');
  return {
    ...actual,
    apiRequest: (...args: any[]) => mockApiRequest(...args),
  };
});

beforeEach(() => {
  mockNavigate.mockReset();
  mockEmit.mockReset();
  mockApiRequest.mockReset();
});

// ---------------------------------------------------------------------------
// Helper: render com QueryClient isolado
// ---------------------------------------------------------------------------
function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const lessonInProgress = {
  lessonId: 'L1',
  lessonTitle: 'GTO Wizard MTT — modulo 3',
  courseTitle: 'GTO Wizard MTT',
  moduleTitle: 'Modulo 3 — Push/Fold',
  coverImageUrl: 'https://example.com/cover.jpg',
  format: 'video' as const,
  lastPositionSeconds: 600,
  totalDurationSeconds: 1000,
  progressPct: 60,
  remainingSeconds: 400,
  updatedAt: '2026-05-02T10:00:00Z',
};

// =============================================================================
// Render base — RF-23
// =============================================================================

describe('<LibraryResume /> — render base com lessons em progresso', () => {
  it('renderiza container com data-testid="home-library-resume" e cards quando hasAccess=true', async () => {
    mockApiRequest.mockResolvedValue({ items: [lessonInProgress], hasAccess: true });
    const { default: LibraryResume } = await import('../LibraryResume');
    renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(screen.getByTestId('home-library-resume')).toBeInTheDocument();
    });
    expect(screen.getByTestId('home-library-resume-card-L1')).toBeInTheDocument();
  });

  it('cada card mostra lessonTitle + progresso (% ou barra)', async () => {
    mockApiRequest.mockResolvedValue({ items: [lessonInProgress], hasAccess: true });
    const { default: LibraryResume } = await import('../LibraryResume');
    renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(screen.getByText(/GTO Wizard MTT — modulo 3/i)).toBeInTheDocument();
    });
  });

  it('renderiza ate `limit` cards (default 3)', async () => {
    const items = [
      lessonInProgress,
      { ...lessonInProgress, lessonId: 'L2', lessonTitle: 'Lesson 2' },
      { ...lessonInProgress, lessonId: 'L3', lessonTitle: 'Lesson 3' },
    ];
    mockApiRequest.mockResolvedValue({ items, hasAccess: true });
    const { default: LibraryResume } = await import('../LibraryResume');
    renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(screen.getAllByTestId(/^home-library-resume-card-/).length).toBe(3);
    });
  });
});

// =============================================================================
// Empty state — hasAccess=true, items=[]
// =============================================================================

describe('<LibraryResume /> — empty state com acesso', () => {
  it('items=[] AND hasAccess=true => CTA "Comece sua primeira lesson" para /biblioteca', async () => {
    mockApiRequest.mockResolvedValue({ items: [], hasAccess: true });
    const { default: LibraryResume } = await import('../LibraryResume');
    renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(screen.getByTestId('home-library-resume')).toBeInTheDocument();
    });
    // CTA empty state aponta para /biblioteca
    const links = screen.getAllByRole('link');
    expect(links.some((a) => (a as HTMLAnchorElement).href.includes('/biblioteca'))).toBe(true);
  });
});

// =============================================================================
// Sem entitlement — bloco oculto
// =============================================================================

describe('<LibraryResume /> — sem acesso => null silencioso', () => {
  it('hasAccess=false => bloco NAO eh renderizado (return null)', async () => {
    mockApiRequest.mockResolvedValue({ items: [], hasAccess: false });
    const { default: LibraryResume } = await import('../LibraryResume');
    const { container } = renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(mockApiRequest).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('home-library-resume')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Tracker
// =============================================================================

describe('<LibraryResume /> — tracker', () => {
  it('emit("home_library_resume_view") 1x no mount com >=1 lesson', async () => {
    mockApiRequest.mockResolvedValue({ items: [lessonInProgress], hasAccess: true });
    const { default: LibraryResume } = await import('../LibraryResume');
    renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(mockEmit.mock.calls.filter((c) => c[0] === 'home_library_resume_view').length).toBe(1);
    });
  });

  it('emit("home_library_resume_click") quando card eh clicado', async () => {
    mockApiRequest.mockResolvedValue({ items: [lessonInProgress], hasAccess: true });
    const { default: LibraryResume } = await import('../LibraryResume');
    renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(screen.getByTestId('home-library-resume-card-L1')).toBeInTheDocument();
    });
    const card = screen.getByTestId('home-library-resume-card-L1');
    fireEvent.click(card);
    expect(mockEmit.mock.calls.filter((c) => c[0] === 'home_library_resume_click').length).toBe(1);
  });
});

// =============================================================================
// Deep link com seek
// =============================================================================

describe('<LibraryResume /> — deep link', () => {
  it('card link contem lessonId + format + t=lastPositionSeconds', async () => {
    mockApiRequest.mockResolvedValue({ items: [lessonInProgress], hasAccess: true });
    const { default: LibraryResume } = await import('../LibraryResume');
    renderWithQuery(<LibraryResume />);
    await waitFor(() => {
      expect(screen.getByTestId('home-library-resume-card-L1')).toBeInTheDocument();
    });
    const card = screen.getByTestId('home-library-resume-card-L1');
    const href = card.getAttribute('href') || '';
    expect(href).toContain('L1');
    expect(href).toContain('600');
  });
});
