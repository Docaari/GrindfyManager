/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Spot-Anki-Reentry-3 — RF-5 SrsStatsCard widget /estudos
 *
 * Spec: Docs/specs/spot-anki-reentry-3.md §RF-5
 *
 * Cobertura RED:
 *   - Renderiza 4 metricas: pendingToday, reviewedLast7Days, accuracy %, streak.
 *   - Click "Ver" navega para /estudos/reentry.
 *   - Loading state: skeleton.
 *   - Empty state pedagogico quando pendingToday=0 e reviewedLast7Days=0.
 *   - ErrorBoundary wrapping (lesson #29) — quando query falha, fallback renderiza null/silencioso.
 *
 * data-testid esperados:
 *   - srs-stats-card (root)
 *   - srs-stats-pending-today
 *   - srs-stats-reviewed-7d
 *   - srs-stats-accuracy
 *   - srs-stats-streak
 *   - srs-stats-card-link
 *   - srs-stats-card-loading
 *   - srs-stats-card-empty
 *
 * Status RED: client/src/components/study/SrsStatsCard.tsx NAO existe.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual: any = await vi.importActual('@tanstack/react-query');
  return {
    ...actual,
    useQuery: useQueryMock,
  };
});

vi.mock('wouter', () => ({
  useLocation: () => ['/estudos', vi.fn()],
  Link: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

beforeEach(() => {
  cleanup();
  useQueryMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadCard() {
  const mod: any = await import('../../client/src/components/study/SrsStatsCard');
  return mod.SrsStatsCard;
}

describe('<SrsStatsCard>', () => {
  it('renderiza root data-testid="srs-stats-card"', async () => {
    useQueryMock.mockReturnValue({
      data: { pendingToday: 5, reviewedLast7Days: 23, accuracyLast7Days: 0.87, streakDays: 4 },
      isLoading: false, isError: false,
    });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('srs-stats-card')).toBeInTheDocument();
  });

  it('renderiza 4 metricas com valores corretos', async () => {
    useQueryMock.mockReturnValue({
      data: { pendingToday: 5, reviewedLast7Days: 23, accuracyLast7Days: 0.87, streakDays: 4 },
      isLoading: false, isError: false,
    });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('srs-stats-pending-today').textContent).toMatch(/5/);
    expect(screen.getByTestId('srs-stats-reviewed-7d').textContent).toMatch(/23/);
    expect(screen.getByTestId('srs-stats-accuracy').textContent).toMatch(/87/);
    expect(screen.getByTestId('srs-stats-streak').textContent).toMatch(/4/);
  });

  it('accuracy renderizada como porcentagem (87%)', async () => {
    useQueryMock.mockReturnValue({
      data: { pendingToday: 0, reviewedLast7Days: 10, accuracyLast7Days: 0.7, streakDays: 1 },
      isLoading: false, isError: false,
    });
    const Card = await loadCard();
    renderWithClient(<Card />);
    expect(screen.getByTestId('srs-stats-accuracy').textContent).toMatch(/70/);
  });

  it('reviewedLast7Days=0 → mostra 0% accuracy (sem NaN)', async () => {
    useQueryMock.mockReturnValue({
      data: { pendingToday: 0, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0 },
      isLoading: false, isError: false,
    });
    const Card = await loadCard();
    renderWithClient(<Card />);
    const acc = screen.getByTestId('srs-stats-accuracy').textContent || '';
    expect(acc).not.toMatch(/NaN/);
    expect(acc).toMatch(/0/);
  });

  it('Link "Ver" navega para /estudos/reentry', async () => {
    useQueryMock.mockReturnValue({
      data: { pendingToday: 5, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0 },
      isLoading: false, isError: false,
    });
    const Card = await loadCard();
    renderWithClient(<Card />);
    const link = screen.getByTestId('srs-stats-card-link');
    expect(link.getAttribute('href')).toBe('/estudos/reentry');
  });

  describe('loading state', () => {
    it('renderiza skeleton quando isLoading=true', async () => {
      useQueryMock.mockReturnValue({
        data: undefined, isLoading: true, isError: false,
      });
      const Card = await loadCard();
      renderWithClient(<Card />);
      expect(screen.getByTestId('srs-stats-card-loading')).toBeInTheDocument();
    });
  });

  describe('empty state pedagogico', () => {
    it('pendingToday=0 e reviewedLast7Days=0 → empty state pedagogico', async () => {
      useQueryMock.mockReturnValue({
        data: { pendingToday: 0, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0 },
        isLoading: false, isError: false,
      });
      const Card = await loadCard();
      renderWithClient(<Card />);
      expect(screen.getByTestId('srs-stats-card-empty')).toBeInTheDocument();
    });

    it('texto pedagogico menciona spots/grind-live ou estudos/spots', async () => {
      useQueryMock.mockReturnValue({
        data: { pendingToday: 0, reviewedLast7Days: 0, accuracyLast7Days: 0, streakDays: 0 },
        isLoading: false, isError: false,
      });
      const Card = await loadCard();
      renderWithClient(<Card />);
      const empty = screen.getByTestId('srs-stats-card-empty');
      expect(empty.textContent || '').toMatch(/spot|grind|insight|estudo/i);
    });
  });

  describe('error tolerance (lesson #29)', () => {
    it('isError=true: renderiza fallback silencioso (nao crasha)', async () => {
      useQueryMock.mockReturnValue({
        data: undefined, isLoading: false, isError: true,
      });
      const Card = await loadCard();
      // Nao deve throw render error
      expect(() => renderWithClient(<Card />)).not.toThrow();
    });
  });
});
