// Back-compat: o hook mudou de casa (components/grade -> components/tournament)
// na unificacao dos dialogs de torneio. Este arquivo permanece como re-export
// para nao quebrar imports antigos.
export {
  useTournamentDialogForm,
  EMPTY_TOURNAMENT_FORM_STATE,
} from "@/components/tournament/useTournamentDialogForm";
export type {
  TournamentFormState,
  UseTournamentDialogFormReturn,
} from "@/components/tournament/useTournamentDialogForm";
