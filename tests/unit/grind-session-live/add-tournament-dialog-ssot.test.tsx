import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import AddTournamentDialog from '../../../client/src/components/grind-session-live/AddTournamentDialog';
import { TOURNAMENT_PRIMARY_TYPES, getTypeLabel } from '../../../shared/tournamentTypes';

// =============================================================================
// Sprint 2 - RF-02 (revisitar): AddTournamentDialog deve renderizar opcoes
// de tipo a partir do SSoT (TOURNAMENT_PRIMARY_TYPES = 4 valores), e nao 3
// hardcoded.
//
// Estado anterior (Sprint 1): 3 <option>s hardcoded (Vanilla/PKO/Mystery).
// Estado esperado (Sprint 2): 4 <option>s (V/P/M/Satellite).
//
// RED PHASE: hoje so existem 3 options no Dialog.
// =============================================================================

const noopProps = {
  open: true,
  onOpenChange: () => {},
  newTournament: {
    site: '',
    type: 'Vanilla',
    speed: 'Normal',
    name: '',
    buyIn: '',
    fieldSize: '',
    scheduledTime: '',
    allowsAddOn: false,
    addOnCost: '',
    allowsReentry: false,
    maxReentries: null,
  } as any,
  setNewTournament: () => {},
  syncWithGrade: false,
  setSyncWithGrade: () => {},
  weeklySuggestions: [] as any[],
  onAddTournament: () => {},
  isPending: false,
  getFilteredSuggestions: () => [],
  resetFilters: () => {},
  hasActiveFilters: () => false,
  getSuggestionStats: () => ({ total: 0, filtered: 0, sites: 0, types: 0 }),
  applySuggestion: () => {},
  applyQuickFilter: () => {},
  getSimilarityScore: () => 0,
};

describe('AddTournamentDialog - Tipos vindos do SSoT (RF-02)', () => {
  it('renderiza opcao para CADA tipo primario do SSoT (4 valores)', () => {
    render(<AddTournamentDialog {...noopProps} />);
    for (const t of TOURNAMENT_PRIMARY_TYPES) {
      // Cada tipo deve estar presente como <option> com value=t.
      const opt = document.querySelector(`option[value="${t}"]`);
      expect(opt, `falta <option value="${t}">`).toBeTruthy();
    }
  });

  it('renderiza opcao Satellite (label PT-BR pode ser "Satélite")', () => {
    render(<AddTournamentDialog {...noopProps} />);
    const opt = document.querySelector('option[value="Satellite"]');
    expect(opt).toBeTruthy();
  });

  it('renderiza exatamente 4 opcoes de tipo (nao mais 3)', () => {
    const { container } = render(<AddTournamentDialog {...noopProps} />);
    // Procura o select cujo value e o tipo do newTournament (Vanilla).
    const selects = container.querySelectorAll('select');
    let typeSelect: HTMLSelectElement | null = null;
    for (const s of Array.from(selects)) {
      const opts = s.querySelectorAll('option');
      const values = Array.from(opts).map((o) => (o as HTMLOptionElement).value);
      // Heuristica: o select de tipo contem Vanilla + PKO.
      if (values.includes('Vanilla') && values.includes('PKO')) {
        typeSelect = s as HTMLSelectElement;
        break;
      }
    }
    expect(typeSelect).toBeTruthy();
    const opts = typeSelect!.querySelectorAll('option');
    // 4 opcoes (sem placeholder, sem tipo "vazio").
    expect(opts.length).toBe(TOURNAMENT_PRIMARY_TYPES.length);
  });

  it('NAO renderiza tipo "Flight" como opcao primaria (Flight virou modificador)', () => {
    render(<AddTournamentDialog {...noopProps} />);
    const flightOpt = document.querySelector('option[value="Flight"]');
    expect(flightOpt).toBeFalsy();
  });
});
