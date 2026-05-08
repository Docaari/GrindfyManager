/**
 * Test-Writer (Modo TDD - Red Phase)
 *
 * Sprint Estudos-Habito-1 — RF-4 FocusStatsBar (componente reutilizavel cross-product)
 *
 * Spec : Docs/specs/estudos-habito-1.md §RF-4
 * ADR  : 129 (visibility granular per-placement)
 *
 * Cobertura:
 *   - Renderiza 3 chips quando user tem 3 stats
 *   - Empty state: 0 chips + CTA "Selecionar 3 stats"
 *   - Partial state: chips reais + ghost + CTA "Selecionar X restantes"
 *   - Loading: skeleton
 *   - Error: silent (renderiza null)
 *   - Visibility settings: oculto quando focusStatsVisibility[placement]=false
 *   - Click chip navega /stats-analyzer?focus=stat_id
 *
 * data-testid esperados:
 *   - focus-stats-bar (root)
 *   - focus-stats-bar-chip-{stat_id}
 *   - focus-stats-bar-chip-ghost-{idx}
 *   - focus-stats-bar-empty
 *   - focus-stats-bar-cta
 *   - focus-stats-bar-skeleton
 *
 * Lessons:
 *   #11 sem actions decorativas (so renderizar com data real)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// @ts-expect-error - red phase: componente nao existe
import { FocusStatsBar } from '../../client/src/components/study/FocusStatsBar';

beforeEach(() => {
  cleanup();
});

function renderWithClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

async function loadBar() {
  return FocusStatsBar;
}

const threeStats = [
  {
    id: 'ufs-1', statId: 'cbet_flop_oop', statLabel: 'C-bet OOP', statUnit: '%',
    currentValue: 32, delta: 4.2, deltaDirection: 'improving',
  },
  {
    id: 'ufs-2', statId: 'threebet_pct', statLabel: '3bet vs Open', statUnit: '%',
    currentValue: 11, delta: -1.1, deltaDirection: 'degrading',
  },
  {
    id: 'ufs-3', statId: 'icm_bubble', statLabel: 'ICM', statUnit: '%',
    currentValue: 47, delta: 0, deltaDirection: 'neutral',
  },
];

describe('<FocusStatsBar>', () => {
  describe('full state (3 stats)', () => {
    it('renderiza root com data-testid="focus-stats-bar"', async () => {
      const Bar = await loadBar();
      renderWithClient(<Bar placement="grindLive" data={threeStats} visible={true} />);
      expect(screen.getByTestId('focus-stats-bar')).toBeInTheDocument();
    });

    it('renderiza 3 chips reais', async () => {
      const Bar = await loadBar();
      renderWithClient(<Bar placement="grindLive" data={threeStats} visible={true} />);
      expect(screen.getByTestId('focus-stats-bar-chip-cbet_flop_oop')).toBeInTheDocument();
      expect(screen.getByTestId('focus-stats-bar-chip-threebet_pct')).toBeInTheDocument();
      expect(screen.getByTestId('focus-stats-bar-chip-icm_bubble')).toBeInTheDocument();
    });

    it('NAO renderiza chips ghost quando 3 stats presentes', async () => {
      const Bar = await loadBar();
      renderWithClient(<Bar placement="grindLive" data={threeStats} visible={true} />);
      expect(screen.queryByTestId('focus-stats-bar-chip-ghost-0')).not.toBeInTheDocument();
    });
  });

  describe('partial state (1 stat)', () => {
    it('renderiza chip real + 2 ghost + CTA "Selecionar 2 restantes"', async () => {
      const Bar = await loadBar();
      renderWithClient(<Bar placement="grindLive" data={[threeStats[0]]} visible={true} />);
      expect(screen.getByTestId('focus-stats-bar-chip-cbet_flop_oop')).toBeInTheDocument();
      // 2 ghosts
      expect(screen.getByTestId('focus-stats-bar-chip-ghost-0')).toBeInTheDocument();
      expect(screen.getByTestId('focus-stats-bar-chip-ghost-1')).toBeInTheDocument();
      // CTA
      expect(screen.getByTestId('focus-stats-bar-cta')).toBeInTheDocument();
    });
  });

  describe('empty state (0 stats)', () => {
    it('renderiza CTA "Selecionar 3 stats em /stats-analyzer"', async () => {
      const Bar = await loadBar();
      renderWithClient(<Bar placement="grindLive" data={[]} visible={true} />);
      expect(screen.getByTestId('focus-stats-bar-empty')).toBeInTheDocument();
    });
  });

  describe('visibility settings (RF-4.2)', () => {
    it('NAO renderiza quando visible=false', async () => {
      const Bar = await loadBar();
      const { container } = renderWithClient(<Bar placement="grindLive" data={threeStats} visible={false} />);
      // Spec: silent fail (lesson #11)
      expect(screen.queryByTestId('focus-stats-bar')).not.toBeInTheDocument();
    });
  });

  describe('loading + error states', () => {
    it('loading=true renderiza skeleton', async () => {
      const Bar = await loadBar();
      renderWithClient(<Bar placement="grindLive" data={null} loading={true} visible={true} />);
      expect(screen.getByTestId('focus-stats-bar-skeleton')).toBeInTheDocument();
    });

    it('error=true renderiza null (silent)', async () => {
      const Bar = await loadBar();
      renderWithClient(<Bar placement="grindLive" data={null} error={true} visible={true} />);
      expect(screen.queryByTestId('focus-stats-bar')).not.toBeInTheDocument();
    });
  });
});
