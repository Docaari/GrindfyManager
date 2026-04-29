import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// =============================================================================
// Sprint F4 W1 — DayDetailDrawer (RF-01 drill-down)
//
// Spec: Docs/specs/sprint-f4-primedope-grade-detail.md (RF-01, RF-22)
// Diagrama: Docs/architecture/flow-day-detail-drawer.mermaid
//
// Behavior:
//   - Sheet Radix slide-from-right
//   - useDayDetail hook -> GET /api/grade/day-detail/:profile/:dayOfWeek
//   - 4 cards superior: totalTournaments, abiUsd, investmentUsd, bankrollNeeded
//   - Pie chart format (PKO/Vanilla/Turbo)
//   - Bar chart volume por plataforma
//   - Tabela banca por plataforma com coverage %
//   - Lista detalhada read-only ORDER BY time ASC
//   - Empty state (CalendarOff icon + CTA "Adicionar torneios")
//   - Esc fecha
//   - Header sticky + scroll independente
//   - tracker.emit('day_detail_drawer_open', payload)
//
// data-testid:
//   - day-detail-drawer
//   - day-detail-card-total
//   - day-detail-card-abi
//   - day-detail-card-investment
//   - day-detail-card-bankroll
//   - day-detail-format-pie
//   - day-detail-volume-bar
//   - day-detail-bankroll-table
//   - day-detail-list
//   - day-detail-empty
//   - day-detail-cta-edit
// =============================================================================

import { DayDetailDrawer } from '../../client/src/components/grade/DayDetailDrawer';

const trackerEmit = vi.fn();
vi.mock('@/lib/tracker', () => ({
  emit: (e: string, p: any) => trackerEmit(e, p),
}));

const fetchSpy = vi.spyOn(global, 'fetch');

beforeEach(() => {
  cleanup();
  trackerEmit.mockClear();
  fetchSpy.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const mockApiResponse = (payload: any) => {
  fetchSpy.mockImplementation(async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
};

describe('<DayDetailDrawer>', () => {
  describe('renderizacao com dados', () => {
    it('renderiza 4 cards superior com agregados', async () => {
      mockApiResponse({
        cards: { totalTournaments: 8, abiUsd: 12.5, investmentUsd: 100, bankrollNeeded: 1250 },
        format: { pctPKO: 50, pctTurbo: 25, pctVanilla: 25 },
        volume: [{ site: 'GG', count: 5 }, { site: 'Suprema', count: 3 }],
        bankroll: [],
        list: [
          { id: 't1', name: 'GG MTT', site: 'GG', buyinUsd: 4.78, count: 5, time: '20:00' },
        ],
      });

      renderWithClient(
        <DayDetailDrawer open onOpenChange={() => {}} profileLetter="A" dayOfWeek={2} />
      );

      await waitFor(() => {
        expect(screen.getByTestId('day-detail-drawer')).toBeInTheDocument();
      });
      expect(screen.getByTestId('day-detail-card-total')).toBeInTheDocument();
      expect(screen.getByTestId('day-detail-card-abi')).toBeInTheDocument();
      expect(screen.getByTestId('day-detail-card-investment')).toBeInTheDocument();
      expect(screen.getByTestId('day-detail-card-bankroll')).toBeInTheDocument();
    });

    it('renderiza pie chart format e bar chart volume', async () => {
      mockApiResponse({
        cards: { totalTournaments: 4, abiUsd: 5, investmentUsd: 20, bankrollNeeded: 500 },
        format: { pctPKO: 50, pctTurbo: 25, pctVanilla: 50 },
        volume: [{ site: 'GG', count: 4 }],
        bankroll: [],
        list: [],
      });

      renderWithClient(
        <DayDetailDrawer open onOpenChange={() => {}} profileLetter="A" dayOfWeek={2} />
      );
      await waitFor(() => {
        expect(screen.getByTestId('day-detail-format-pie')).toBeInTheDocument();
        expect(screen.getByTestId('day-detail-volume-bar')).toBeInTheDocument();
      });
    });

    it('lista detalhada renderiza com nome, site, type+speed, buyin, count, time', async () => {
      mockApiResponse({
        cards: { totalTournaments: 1, abiUsd: 5, investmentUsd: 5, bankrollNeeded: 500 },
        format: { pctPKO: 100, pctTurbo: 0, pctVanilla: 0 },
        volume: [],
        bankroll: [],
        list: [
          {
            id: 't1',
            name: 'Suprema 11',
            site: 'Suprema',
            type: 'Vanilla',
            speed: 'Regular',
            buyinUsd: 2.2,
            count: 1,
            time: '21:00',
          },
        ],
      });

      renderWithClient(
        <DayDetailDrawer open onOpenChange={() => {}} profileLetter="A" dayOfWeek={2} />
      );
      await waitFor(() => {
        expect(screen.getByTestId('day-detail-list')).toBeInTheDocument();
      });
      expect(screen.getByText(/Suprema 11/)).toBeInTheDocument();
    });
  });

  describe('empty state (RF-22)', () => {
    it('zero torneios -> renderiza empty state com CTA', async () => {
      mockApiResponse({
        cards: { totalTournaments: 0, abiUsd: 0, investmentUsd: 0, bankrollNeeded: 0 },
        format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
        volume: [],
        bankroll: [],
        list: [],
      });

      renderWithClient(
        <DayDetailDrawer open onOpenChange={() => {}} profileLetter="A" dayOfWeek={3} />
      );
      await waitFor(() => {
        expect(screen.getByTestId('day-detail-empty')).toBeInTheDocument();
      });
    });
  });

  describe('telemetria', () => {
    it('emite tracker day_detail_drawer_open ao abrir', async () => {
      mockApiResponse({
        cards: { totalTournaments: 2, abiUsd: 5, investmentUsd: 10, bankrollNeeded: 500 },
        format: { pctPKO: 100, pctTurbo: 0, pctVanilla: 0 },
        volume: [],
        bankroll: [],
        list: [],
      });

      renderWithClient(
        <DayDetailDrawer open onOpenChange={() => {}} profileLetter="A" dayOfWeek={2} />
      );

      await waitFor(() => {
        expect(trackerEmit).toHaveBeenCalledWith(
          'day_detail_drawer_open',
          expect.objectContaining({ profileLetter: 'A', dayOfWeek: 2 })
        );
      });
    });
  });

  describe('close behavior', () => {
    it('Esc dispara onOpenChange(false)', async () => {
      mockApiResponse({
        cards: { totalTournaments: 0, abiUsd: 0, investmentUsd: 0, bankrollNeeded: 0 },
        format: { pctPKO: 0, pctTurbo: 0, pctVanilla: 0 },
        volume: [],
        bankroll: [],
        list: [],
      });

      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderWithClient(
        <DayDetailDrawer open onOpenChange={onOpenChange} profileLetter="A" dayOfWeek={2} />
      );
      await waitFor(() => screen.getByTestId('day-detail-drawer'));
      await user.keyboard('{Escape}');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('CTA "Editar grade do dia" fecha drawer', async () => {
      mockApiResponse({
        cards: { totalTournaments: 1, abiUsd: 5, investmentUsd: 5, bankrollNeeded: 500 },
        format: { pctPKO: 100, pctTurbo: 0, pctVanilla: 0 },
        volume: [],
        bankroll: [],
        list: [{ id: 't1', name: 'X', site: 'GG', buyinUsd: 5, count: 1, time: '20:00' }],
      });

      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderWithClient(
        <DayDetailDrawer open onOpenChange={onOpenChange} profileLetter="A" dayOfWeek={2} />
      );
      await waitFor(() => screen.getByTestId('day-detail-cta-edit'));
      await user.click(screen.getByTestId('day-detail-cta-edit'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
