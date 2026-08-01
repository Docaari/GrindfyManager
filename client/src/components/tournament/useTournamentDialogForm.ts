// =============================================================================
// Hook DRY do form de torneio (state compartilhado por TODOS os dialogs).
//
// Origem: Sprint day-detail-consolidation (MEDIUM-1), extraido de
// DayCreateTournamentDialog + DayEditTournamentDialog. Sprint
// tournament-dialog-unification: movido de components/grade/ para
// components/tournament/ (o hook agora serve o dialog canonico) e estendido
// com os campos avancados que so o grind-live usava (add-on / re-entry).
//
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
  // Campos avancados (ADR-014) — so aparecem quando o dialog roda com
  // `advanced`. Ficam no state sempre para o payload nao precisar de branch.
  allowsAddOn: boolean;
  addOnCost: string;
  allowsReentry: boolean;
  maxReentries: number | null;
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
  allowsAddOn: false,
  addOnCost: "",
  allowsReentry: false,
  maxReentries: null,
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
