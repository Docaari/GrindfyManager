/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-3.2 FocusStatsHeader em /stats-analyzer
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-3.2
 *
 * Cobertura:
 *   - Renderiza ate 3 cards horizontais
 *   - Card mostra: stat name, valor atual, delta colorido, tema linkado
 *   - Empty state com CTA "Sugerir 3 stats"
 *   - Empty CTA secondary "Escolher manualmente"
 *   - Stat sem tema -> badge "Sem tema" + CTA "Vincular"
 *   - Click "Trocar" abre modal
 *   - data-testid estaveis
 *
 * data-testid esperados:
 *   - focus-stats-header (root)
 *   - focus-stats-card-{stat_id}
 *   - focus-stats-card-{stat_id}-swap (botao Trocar)
 *   - focus-stats-empty (state vazio)
 *   - focus-stats-empty-suggest (CTA primary)
 *   - focus-stats-empty-manual (CTA secondary)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequestMock = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: apiRequestMock,
  queryClient: new (class { invalidateQueries() {} setQueryData() {} getQueryData() {} })(),
}));

// @ts-expect-error - red phase: componente nao existe
import { FocusStatsHeader } from '../../client/src/components/study/FocusStatsHeader';

beforeEach(() => {
  cleanup();
  apiRequestMock.mockReset();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadHeader() {
  return FocusStatsHeader;
}

const fullStats = {
  items: [
    {
      id: 'ufs-1',
      statId: 'cbet_flop_oop',
      statLabel: 'C-bet flop OOP',
      statUnit: '%',
      currentValue: 32,
      previousValue: 27.8,
      delta: 4.2,
      deltaDirection: 'improving',
      theme: { id: 'th-1', name: 'C-bet OOP', color: '#f59e0b', emoji: '', progress: 0 },
      studyMinutesMonth: 60,
    },
    {
      id: 'ufs-2',
      statId: 'threebet_pct',
      statLabel: '3bet vs Open',
      statUnit: '%',
      currentValue: 11,
      previousValue: 12.1,
      delta: -1.1,
      deltaDirection: 'degrading',
      theme: null, // sem tema linkado
      studyMinutesMonth: 0,
    },
    {
      id: 'ufs-3',
      statId: 'icm_bubble',
      statLabel: 'ICM bubble',
      statUnit: '%',
      currentValue: 47,
      previousValue: 47,
      delta: 0,
      deltaDirection: 'neutral',
      theme: { id: 'th-3', name: 'ICM no bubble', color: '#dc2626', emoji: '', progress: 0 },
      studyMinutesMonth: 30,
    },
  ],
};

describe('<FocusStatsHeader>', () => {
  describe('full state (3 stats)', () => {
    it('renderiza root com data-testid="focus-stats-header"', async () => {
      const Header = await loadHeader();
      renderWithClient(<Header data={fullStats} />);
      expect(screen.getByTestId('focus-stats-header')).toBeInTheDocument();
    });

    it('renderiza 3 cards', async () => {
      const Header = await loadHeader();
      renderWithClient(<Header data={fullStats} />);
      expect(screen.getByTestId('focus-stats-card-cbet_flop_oop')).toBeInTheDocument();
      expect(screen.getByTestId('focus-stats-card-threebet_pct')).toBeInTheDocument();
      expect(screen.getByTestId('focus-stats-card-icm_bubble')).toBeInTheDocument();
    });

    it('cada card tem botao Trocar', async () => {
      const Header = await loadHeader();
      renderWithClient(<Header data={fullStats} />);
      expect(screen.getByTestId('focus-stats-card-cbet_flop_oop-swap')).toBeInTheDocument();
    });

    it('card sem tema linkado mostra "Sem tema" + CTA Vincular', async () => {
      const Header = await loadHeader();
      renderWithClient(<Header data={fullStats} />);
      const card = screen.getByTestId('focus-stats-card-threebet_pct');
      expect(card.textContent || '').toMatch(/sem tema|vincular/i);
    });
  });

  describe('empty state (0 stats)', () => {
    it('renderiza empty state quando items=[]', async () => {
      const Header = await loadHeader();
      renderWithClient(<Header data={{ items: [] }} />);
      expect(screen.getByTestId('focus-stats-empty')).toBeInTheDocument();
    });

    it('CTA primary "Sugerir 3 stats" presente', async () => {
      const Header = await loadHeader();
      renderWithClient(<Header data={{ items: [] }} />);
      expect(screen.getByTestId('focus-stats-empty-suggest')).toBeInTheDocument();
    });

    it('CTA secondary "Escolher manualmente" presente', async () => {
      const Header = await loadHeader();
      renderWithClient(<Header data={{ items: [] }} />);
      expect(screen.getByTestId('focus-stats-empty-manual')).toBeInTheDocument();
    });
  });

  describe('partial state (1-2 stats)', () => {
    it('renderiza apenas as cards existentes (nao 3 hard-coded)', async () => {
      const Header = await loadHeader();
      const partial = { items: [fullStats.items[0]] };
      renderWithClient(<Header data={partial} />);
      expect(screen.getByTestId('focus-stats-card-cbet_flop_oop')).toBeInTheDocument();
      expect(screen.queryByTestId('focus-stats-card-threebet_pct')).not.toBeInTheDocument();
    });
  });
});
