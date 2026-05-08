/**
 * StudyLogDialog — Sprint Estudos-Habito-1 (RF-1.1, RF-1.6).
 *
 * Form unico "Registrar Estudo" com 4 modos primarios + escape hatch + toggle
 * "Comecar agora cronometrado".
 *
 * P0 #4: rewrite com Radix Dialog primitives + autocomplete de themes via
 * Popover/Command + top-level imports + tipo Partial<InsertStudySessionV2>.
 *
 * Lessons aplicadas:
 *   #1  hooks first (todos os hooks antes de early return)
 *   #2  data-testid estaveis (study-log-mode-{mode}, study-log-theme-input, etc)
 *   #11 sem decorativos (so renderiza com data real)
 *   #13 apiRequest retorna JSON parseado direto
 */

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useThemeSearch } from "@/hooks/useThemeSearch";
import type { InsertStudySessionV2 } from "@shared/schema";

const MODES = [
  { value: "drill_gto", label: "Drill GTO" },
  { value: "tournament_review", label: "Review de Torneio" },
  { value: "hand_review", label: "Review de Maos" },
  { value: "lesson", label: "Aula" },
  { value: "other", label: "Outro" },
] as const;

type Mode = typeof MODES[number]["value"];

export interface StudyLogDialogProps {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
  defaultThemeId?: string | null;
  defaultDurationMinutes?: number;
}

function isThemeRequired(mode: Mode): boolean {
  return mode === "drill_gto" || mode === "other" || mode === "lesson";
}

export function StudyLogDialog({
  open,
  onClose,
  initialMode = "drill_gto",
  defaultThemeId = null,
  defaultDurationMinutes = 30,
}: StudyLogDialogProps) {
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [themeId, setThemeId] = React.useState<string | null>(defaultThemeId);
  const [themeLabel, setThemeLabel] = React.useState<string>("");
  const [themePopoverOpen, setThemePopoverOpen] = React.useState<boolean>(false);
  const [duration, setDuration] = React.useState<number>(defaultDurationMinutes);
  const [notes, setNotes] = React.useState<string>("");
  const [isLive, setIsLive] = React.useState<boolean>(false);
  const [tournamentId, setTournamentId] = React.useState<string>("");
  const [lessonId, setLessonId] = React.useState<string>("");
  const [starredHandIds, setStarredHandIds] = React.useState<string>("");
  const [drillPlatform, setDrillPlatform] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);

  // Autocomplete de themes (RF-1.1).
  const themeSearch = useThemeSearch();

  // Reset campos especificos ao trocar mode (mantem theme/notes/duration).
  React.useEffect(() => {
    setTournamentId("");
    setLessonId("");
    setStarredHandIds("");
    setDrillPlatform("");
  }, [mode]);

  // Lessons #1: early return DEPOIS dos hooks.
  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Partial<InsertStudySessionV2> & { source: string; status?: string } = {
        mode,
        source: isLive ? "manual_live" : "manual_post_hoc",
        status: isLive ? "running" : "completed",
        themeId: themeId || null,
        durationMinutes: duration,
        notes: notes || null,
      };
      if (mode === "tournament_review") (body as any).tournamentId = tournamentId || null;
      if (mode === "lesson") (body as any).lessonId = lessonId || null;
      if (mode === "hand_review") {
        (body as any).starredHandIds = starredHandIds
          ? starredHandIds.split(",").map((s) => s.trim()).filter(Boolean)
          : [];
      }
      if (mode === "drill_gto") (body as any).drillPlatform = drillPlatform || null;
      if (isLive) (body as any).startedAt = new Date().toISOString();

      await apiRequest("POST", "/api/study-sessions", body);
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/study-sessions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/users/me/study-habit"] });
      } catch {}
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Erro ao registrar sessao");
    } finally {
      setSubmitting(false);
    }
  }

  function selectTheme(item: { id: string; name: string }) {
    setThemeId(item.id);
    setThemeLabel(item.name);
    setThemePopoverOpen(false);
  }

  // Tema input renderizado uma vez (P0 #4 dedupe). Aparece em todos os modes
  // (em hand_review/tournament_review eh opcional, sinalizado na label).
  const themeRequired = isThemeRequired(mode);
  const themeLabelText = themeRequired ? "Tema" : "Tema (opcional)";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <form
          onSubmit={handleSubmit}
          data-testid="study-log-dialog"
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>Registrar Estudo</DialogTitle>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Modo</legend>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <label
                  key={m.value}
                  data-testid={`study-log-mode-${m.value}`}
                  className={`flex items-center gap-2 p-2 border rounded cursor-pointer ${
                    mode === m.value ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <input
                    type="radio"
                    name="study-log-mode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                  />
                  <span className="text-sm">{m.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <label className="text-sm font-medium">{themeLabelText}</label>
            <Popover open={themePopoverOpen} onOpenChange={setThemePopoverOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="study-log-theme-input"
                  onClick={() => setThemePopoverOpen((v) => !v)}
                  className="w-full p-2 border rounded text-left text-sm bg-background hover:bg-muted"
                >
                  {themeLabel || (themeRequired ? "Selecione um tema" : "Selecione um tema (opcional)")}
                </button>
              </PopoverTrigger>
              <PopoverContent className="p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Buscar tema..."
                    value={themeSearch.query}
                    onValueChange={themeSearch.setQuery}
                  />
                  <CommandList>
                    <CommandEmpty>Nenhum tema encontrado.</CommandEmpty>
                    <CommandGroup>
                      {themeSearch.results.map((t) => (
                        <CommandItem
                          key={t.id}
                          onSelect={() => selectTheme({ id: t.id, name: t.name })}
                        >
                          <span>{t.name}</span>
                          {t.isCurated && (
                            <span className="ml-auto text-xs text-muted-foreground">curated</span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {/* Hidden hidden input para serializar themeId em submit (form fallback). */}
            <input type="hidden" value={themeId ?? ""} readOnly />
          </div>

          {mode === "drill_gto" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Plataforma de drill</label>
              <input
                type="text"
                data-testid="study-log-drill-platform-input"
                value={drillPlatform}
                onChange={(e) => setDrillPlatform(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="gto_wizard / pio / monker / other"
              />
            </div>
          )}

          {mode === "tournament_review" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Torneio (opcional)</label>
              <input
                type="text"
                data-testid="study-log-tournament-input"
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="ID do torneio"
              />
            </div>
          )}

          {mode === "lesson" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Aula</label>
              <input
                type="text"
                data-testid="study-log-lesson-input"
                value={lessonId}
                onChange={(e) => setLessonId(e.target.value)}
                className="w-full p-2 border rounded"
                placeholder="ID da aula publicada"
              />
            </div>
          )}

          {mode === "hand_review" && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Spots (IDs separados por virgula)</label>
              <input
                type="text"
                data-testid="study-log-starred-hands-input"
                value={starredHandIds}
                onChange={(e) => setStarredHandIds(e.target.value)}
                className="w-full p-2 border rounded"
              />
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-sm font-medium">Duracao (min)</label>
              <input
                type="number"
                data-testid="study-log-duration-input"
                value={duration}
                min={1}
                max={1440}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full p-2 border rounded"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                data-testid="study-log-live-toggle"
                checked={isLive}
                onChange={(e) => setIsLive(e.target.checked)}
              />
              <span className="text-sm">Comecar cronometrado</span>
            </label>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Notas (max 500)</label>
            <textarea
              data-testid="study-log-notes-input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full p-2 border rounded h-20"
              maxLength={500}
            />
          </div>

          {error && (
            <div role="alert" className="text-sm text-destructive">
              {error}
            </div>
          )}

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              data-testid="study-log-cancel"
              className="px-4 py-2 border rounded"
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="study-log-submit"
              disabled={submitting}
              className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
            >
              {submitting ? "Registrando..." : isLive ? "Iniciar cronometro" : "Registrar"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default StudyLogDialog;
