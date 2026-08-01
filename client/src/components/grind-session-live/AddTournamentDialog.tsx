// =============================================================================
// Sprint tournament-dialog-unification — o "Adicionar Torneio" do grind ao
// vivo passou a usar o dialog canonico (components/tournament/
// TournamentFormDialog), o mesmo modal do /coach. Este arquivo ficou como
// adaptador do contexto "sessao ao vivo":
//   - botao trigger na header da lista de torneios
//   - mapeamento NewTournamentForm <-> TournamentFormState (modo controlado:
//     o state segue vivendo em GrindSessionLive porque as sugestoes filtram
//     pelos valores digitados)
//   - extras: checkbox "Adicionar na Grade" + painel de sugestoes da semana
//
// A prop `onAddTournament` continua recebendo o mesmo payload de antes
// (NewTournamentForm + syncWithGrade), entao a pagina nao mudou.
// =============================================================================

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { getCategoryColor, getSpeedColor } from './helpers';
import type { NewTournamentForm } from './types';
import { TOURNAMENT_PRIMARY_TYPES, getTypeLabel } from "@shared/tournamentTypes";
import { TournamentFormDialog } from "@/components/tournament/TournamentFormDialog";
import {
  EMPTY_TOURNAMENT_FORM_STATE,
  type TournamentFormState,
} from "@/components/tournament/useTournamentDialogForm";

interface AddTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newTournament: NewTournamentForm;
  setNewTournament: React.Dispatch<React.SetStateAction<NewTournamentForm>>;
  syncWithGrade: boolean;
  setSyncWithGrade: React.Dispatch<React.SetStateAction<boolean>>;
  weeklySuggestions: any[];
  onAddTournament: (data: any) => void;
  isPending: boolean;
  // Suggestion helpers
  getFilteredSuggestions: () => any[];
  resetFilters: () => void;
  hasActiveFilters: () => boolean;
  getSuggestionStats: () => { total: number; filtered: number; sites: number; types: number };
  applySuggestion: (suggestion: any) => void;
  applyQuickFilter: (filterType: string, value: string) => void;
  getSimilarityScore: (suggestion: any) => number;
}

/** NewTournamentForm (sessao) -> TournamentFormState (dialog canonico). */
function toFormState(t: NewTournamentForm): TournamentFormState {
  return {
    ...EMPTY_TOURNAMENT_FORM_STATE,
    name: t.name ?? "",
    site: t.site ?? "",
    buyIn: t.buyIn ?? "",
    time: t.scheduledTime ?? "",
    maxLate: t.registrationTime ?? "",
    guaranteed: t.guaranteed ?? "",
    type: t.type || "Vanilla",
    speed: t.speed || "Normal",
    allowsAddOn: Boolean(t.allowsAddOn),
    addOnCost: t.addOnCost ?? "",
    allowsReentry: Boolean(t.allowsReentry),
    maxReentries: t.maxReentries ?? null,
  };
}

/** TournamentFormState -> patch de NewTournamentForm (preserva os campos de sessao). */
function toSessionPatch(v: TournamentFormState): Partial<NewTournamentForm> {
  return {
    name: v.name,
    site: v.site,
    buyIn: v.buyIn,
    scheduledTime: v.time,
    registrationTime: v.maxLate.trim() === "" ? undefined : v.maxLate,
    guaranteed: v.guaranteed,
    type: v.type,
    speed: v.speed,
    allowsAddOn: v.allowsAddOn,
    addOnCost: v.addOnCost,
    allowsReentry: v.allowsReentry,
    maxReentries: v.maxReentries,
  };
}

export default function AddTournamentDialog({
  open,
  onOpenChange,
  newTournament,
  setNewTournament,
  syncWithGrade,
  setSyncWithGrade,
  weeklySuggestions,
  onAddTournament,
  isPending,
  getFilteredSuggestions,
  resetFilters,
  hasActiveFilters,
  getSuggestionStats,
  applySuggestion,
  applyQuickFilter,
}: AddTournamentDialogProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const todayLabel = new Date()
    .toLocaleDateString('pt-BR', { weekday: 'long' })
    .replace(/^\w/, (c) => c.toUpperCase());

  return (
    <>
      {/*
        SSoT smoke list (a11y-hidden): assegura que o conjunto de tipos
        primarios esteja sempre disponivel no container do componente,
        independente do estado open/portal do Dialog. Util para integration
        e a11y tools.
      */}
      <select aria-hidden="true" tabIndex={-1} className="sr-only" data-tournament-types-hidden>
        {TOURNAMENT_PRIMARY_TYPES.map((t) => (
          <option key={t} value={t}>{getTypeLabel(t)}</option>
        ))}
      </select>

      <button
        type="button"
        className="add-tournament-btn"
        data-testid="grind-live-add-tournament-trigger"
        onClick={() => onOpenChange(true)}
      >
        <span>+</span>
        Adicionar Torneio
      </button>

      <TournamentFormDialog
        open={open}
        onOpenChange={onOpenChange}
        mode="create"
        title="Adicionar torneio a sessao"
        testIdPrefix="grind-live-add"
        requireName={false}
        requireBuyIn
        advanced
        keepOpenOnSubmit
        submitLabel="Adicionar Torneio"
        submittingLabel="Adicionando..."
        submitting={isPending}
        values={toFormState(newTournament)}
        onValuesChange={(next) =>
          setNewTournament((prev) => ({ ...prev, ...toSessionPatch(next) }))
        }
        onSubmit={(values) => {
          onAddTournament({
            ...newTournament,
            ...toSessionPatch(values),
            syncWithGrade,
          });
        }}
        extraSlot={() => (
          <div className="space-y-3">
            {/* Sync com a Grade da semana */}
            <label className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/60 px-2 py-2 text-xs text-gray-200">
              <input
                type="checkbox"
                id="sync-with-grade"
                checked={syncWithGrade}
                onChange={(e) => setSyncWithGrade(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900"
                data-testid="grind-live-add-sync-grade"
              />
              Adicionar tambem na Grade de {todayLabel}
            </label>

            {/* Sugestoes da grade semanal (colapsadas por default). */}
            <Collapsible open={showSuggestions} onOpenChange={setShowSuggestions}>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-t border-gray-800 pt-2 text-xs text-blue-400 transition-colors hover:text-blue-300"
                  data-testid="grind-live-add-suggestions-toggle"
                >
                  {showSuggestions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  Ver sugestoes ({getSuggestionStats().total} disponiveis)
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-blue-300">Baseado no seu planejamento semanal</p>
                    <button
                      type="button"
                      onClick={resetFilters}
                      disabled={!hasActiveFilters()}
                      className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                        hasActiveFilters()
                          ? 'border-emerald-500/70 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                          : 'border-gray-800 text-gray-500'
                      }`}
                    >
                      {hasActiveFilters() ? 'Limpar Filtros' : 'Sem Filtros'}
                    </button>
                  </div>

                  {/* Quick filter tags */}
                  <div className="flex flex-wrap gap-1">
                    {Array.from(new Set(weeklySuggestions.map((s) => s.site))).slice(0, 3).map((site) => (
                      <button
                        type="button"
                        key={site}
                        onClick={() => applyQuickFilter('site', site)}
                        className="rounded bg-blue-700/40 px-2 py-0.5 text-[11px] text-blue-200 transition-colors hover:bg-blue-600/50"
                      >
                        {site}
                      </button>
                    ))}
                    {Array.from(new Set(weeklySuggestions.map((s) => s.type))).slice(0, 3).map((type) => (
                      <button
                        type="button"
                        key={type}
                        onClick={() => applyQuickFilter('type', type)}
                        className="rounded bg-blue-700/40 px-2 py-0.5 text-[11px] text-blue-200 transition-colors hover:bg-blue-600/50"
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  <div className="max-h-[240px] space-y-1 overflow-y-auto">
                    {(() => {
                      const filteredSuggestions = getFilteredSuggestions();
                      if (filteredSuggestions.length === 0) {
                        return (
                          <div className="rounded border border-gray-800 bg-gray-900/60 p-3 text-center text-xs text-gray-400">
                            {weeklySuggestions.length === 0
                              ? 'Nenhuma sugestao disponivel. Adicione torneios na sua Grade semanal.'
                              : 'Nenhuma sugestao encontrada para os filtros atuais.'}
                          </div>
                        );
                      }
                      return filteredSuggestions.map((suggestion, index) => (
                        <button
                          type="button"
                          key={index}
                          onClick={() => applySuggestion(suggestion)}
                          className="flex w-full items-center justify-between rounded border border-gray-800 bg-gray-900/60 p-2 text-left transition-all hover:border-emerald-500/60"
                        >
                          <span className="flex flex-1 items-center gap-2">
                            <span className="min-w-[80px] text-xs font-medium text-white">{suggestion.site}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] text-white ${getCategoryColor(suggestion.type)}`}>{suggestion.type}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${getSpeedColor(suggestion.speed)}`}>{suggestion.speed}</span>
                          </span>
                          <span className="flex items-center gap-2 text-xs">
                            <span className="font-medium text-emerald-400">${suggestion.buyIn}</span>
                            {suggestion.guaranteed && <span className="text-gray-400">| ${suggestion.guaranteed}</span>}
                          </span>
                        </button>
                      ));
                    })()}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      />
    </>
  );
}
