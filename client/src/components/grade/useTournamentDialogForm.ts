// =============================================================================
// Sprint day-detail-consolidation (MEDIUM-1) — Hook DRY para form de torneio.
//
// Extrai os 8 useState compartilhados entre DayCreateTournamentDialog e
// DayEditTournamentDialog (name/site/buyIn/time/maxLate/guaranteed/type/speed).
// API:
//   - state: snapshot atual.
//   - patch(partial): merge parcial (preserva campos nao mencionados).
//   - reset(next?): reseta para EMPTY merged com next.
//
// NAO inclui submitting/error/openedRef — esses sao especificos do dialog e
// permanecem como useState locais.
// =============================================================================

import * as React from "react";

export interface TournamentFormState {
  name: string;
  site: string;
  buyIn: string;
  time: string;
  maxLate: string;
  guaranteed: string;
  type: string;
  speed: string;
}

export const EMPTY_TOURNAMENT_FORM_STATE: TournamentFormState = {
  name: "",
  site: "",
  buyIn: "",
  time: "",
  maxLate: "",
  guaranteed: "",
  type: "Vanilla",
  speed: "Normal",
};

export interface UseTournamentDialogFormReturn {
  state: TournamentFormState;
  patch: (diff: Partial<TournamentFormState>) => void;
  reset: (next?: Partial<TournamentFormState>) => void;
}

export function useTournamentDialogForm(
  initial?: Partial<TournamentFormState>,
): UseTournamentDialogFormReturn {
  const [state, setState] = React.useState<TournamentFormState>({
    ...EMPTY_TOURNAMENT_FORM_STATE,
    ...initial,
  });

  const patch = React.useCallback((diff: Partial<TournamentFormState>) => {
    setState((prev) => ({ ...prev, ...diff }));
  }, []);

  const reset = React.useCallback((next?: Partial<TournamentFormState>) => {
    setState({ ...EMPTY_TOURNAMENT_FORM_STATE, ...next });
  }, []);

  return { state, patch, reset };
}
