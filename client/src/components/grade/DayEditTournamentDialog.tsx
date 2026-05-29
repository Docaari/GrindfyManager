// =============================================================================
// Sprint day-detail-manage-2 — Edit inline tournament
//
// Dialog Radix sobreposto pra editar torneio planejado existente. Pre-preenche
// campos com snapshot + PUT /api/planned-tournaments/:id. Emit
// coach.day_zoom_edit_save. Invalida day-detail + planned-tournaments.
// =============================================================================

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeEmit } from "@/lib/safe-emit";
import { DAYS_PT } from "@/lib/days-pt";
import { useTournamentDialogForm } from "./useTournamentDialogForm";

const TYPE_OPTIONS = ["Vanilla", "PKO", "Mystery", "Satellite", "Bounty"];
const SPEED_OPTIONS = ["Normal", "Turbo", "Hyper"];

export interface DayEditTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayOfWeek: number;
  profileLetter: "A" | "B" | "C";
  /** Snapshot do torneio sendo editado. */
  tournament: {
    id: string;
    name?: string;
    site?: string;
    buyinUsd?: number;
    buyIn?: string | number;
    time?: string;
    type?: string;
    speed?: string;
    maxLate?: string | null;
    registrationTime?: string | null;
    guaranteedUsd?: number;
    guaranteed?: string | number | null;
  } | null;
  knownSites?: string[];
  onSaved?: () => void;
}

export function DayEditTournamentDialog(
  props: DayEditTournamentDialogProps,
): React.ReactElement | null {
  const {
    open,
    onOpenChange,
    dayOfWeek,
    profileLetter,
    tournament,
    knownSites = [],
    onSaved,
  } = props;

  // MEDIUM-1: form state consolidado via useTournamentDialogForm.
  const { state: form, patch, reset } = useTournamentDialogForm();
  const { name, site, buyIn, time, maxLate, guaranteed, type, speed } = form;
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const hydratedIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (open && tournament && hydratedIdRef.current !== tournament.id) {
      hydratedIdRef.current = tournament.id;
      const initialBuyIn =
        tournament.buyinUsd != null
          ? String(tournament.buyinUsd)
          : tournament.buyIn != null
            ? String(tournament.buyIn)
            : "";
      // guaranteedUsd (FX-converted) tem prioridade; fallback guaranteed (raw)
      // se FX indisponivel. Payload PUT envia "guaranteed" sempre — server
      // normaliza via nativeToUsd.
      const initialGtd =
        tournament.guaranteedUsd != null
          ? String(tournament.guaranteedUsd)
          : tournament.guaranteed != null
            ? String(tournament.guaranteed)
            : "";
      reset({
        name: tournament.name ?? "",
        site: tournament.site ?? "",
        buyIn: initialBuyIn,
        time: tournament.time ?? "",
        maxLate: tournament.maxLate ?? tournament.registrationTime ?? "",
        guaranteed: initialGtd,
        type: tournament.type ?? "Vanilla",
        speed: tournament.speed ?? "Normal",
      });
      setError(null);
    }
    if (!open) hydratedIdRef.current = null;
  }, [open, tournament, reset]);

  const canSubmit =
    !!tournament &&
    name.trim().length > 0 &&
    site.trim().length > 0 &&
    /^\d{2}:\d{2}$/.test(time);

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit || !tournament) return;
    setSubmitting(true);
    setError(null);
    try {
      const buyInValue =
        buyIn.trim() === "" ? "0" : buyIn.replace(",", ".").trim();
      // HIGH-4: PATCH semantic — quando user limpa o campo guaranteed, omitir
      // do payload pra NAO sobrescrever valor existente com "0". Server trata
      // ausencia de key como "nao mudar".
      const guaranteedTrimmed = guaranteed.trim();
      const maxLateValue =
        maxLate.trim() !== "" && /^\d{1,2}:\d{1,2}$/.test(maxLate.trim())
          ? maxLate.trim()
          : null;
      const payload: Record<string, unknown> = {
        name: name.trim(),
        site: site.trim(),
        time,
        buyIn: buyInValue,
        registrationTime: maxLateValue,
        type,
        speed,
      };
      if (guaranteedTrimmed !== "") {
        payload.guaranteed = guaranteedTrimmed.replace(",", ".");
      }
      await apiRequest("PUT", `/api/planned-tournaments/${tournament.id}`, payload);
      try {
        queryClient.invalidateQueries?.({
          queryKey: ["day-detail", profileLetter, dayOfWeek],
        });
        queryClient.invalidateQueries?.({ queryKey: ["planned-tournaments"] });
        queryClient.invalidateQueries?.({
          queryKey: ["/api/planned-tournaments"],
        });
      } catch {
        /* ignore */
      }
      safeEmit("coach.day_zoom_edit_save", {
        feature: "day_zoom",
        tournamentId: tournament.id,
        dayOfWeek,
        profileLetter,
        slot: time,
        site: site.trim(),
      });
      onSaved?.();
      onOpenChange(false);
    } catch {
      setError("Falha ao salvar — tente novamente");
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    tournament,
    name,
    site,
    buyIn,
    time,
    maxLate,
    guaranteed,
    type,
    speed,
    dayOfWeek,
    profileLetter,
    onOpenChange,
    onSaved,
  ]);

  if (!open || !tournament) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm" />
        <DialogPrimitive.Content
          data-testid="day-zoom-edit-dialog"
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] w-[90vw] max-w-md rounded-xl border border-gray-700/80 bg-gradient-to-br from-gray-950 via-gray-950 to-gray-900 shadow-2xl shadow-emerald-900/10 p-0 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gradient-to-r from-emerald-900/30 via-gray-900/60 to-gray-900/60">
            <DialogPrimitive.Title asChild>
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <Pencil className="w-4 h-4 text-emerald-400" />
                Editar torneio — {DAYS_PT[dayOfWeek] ?? ""} (Perfil{" "}
                {profileLetter})
              </h2>
            </DialogPrimitive.Title>
            <button
              type="button"
              data-testid="day-zoom-edit-dialog-close"
              onClick={() => onOpenChange(false)}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nome *</label>
              <input
                type="text"
                data-testid="day-zoom-edit-input-name"
                value={name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Ex: Sunday Million"
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none transition"
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Plataforma *
                </label>
                <input
                  type="text"
                  list="day-zoom-edit-sites"
                  data-testid="day-zoom-edit-input-site"
                  value={site}
                  onChange={(e) => patch({ site: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none transition"
                />
                <datalist id="day-zoom-edit-sites">
                  {knownSites.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Buy-in USD
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="day-zoom-edit-input-buyin"
                  value={buyIn}
                  onChange={(e) => patch({ buyIn: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none transition"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Max Late (reg final)
                </label>
                <input
                  type="time"
                  data-testid="day-zoom-edit-input-maxlate"
                  value={maxLate}
                  onChange={(e) => patch({ maxLate: e.target.value })}
                  placeholder="opcional"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500/40 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Garantido USD
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="day-zoom-edit-input-guaranteed"
                  value={guaranteed}
                  onChange={(e) => patch({ guaranteed: e.target.value })}
                  placeholder="0"
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none transition"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Horario *
                </label>
                <input
                  type="time"
                  data-testid="day-zoom-edit-input-time"
                  value={time}
                  onChange={(e) => patch({ time: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none transition"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                <select
                  data-testid="day-zoom-edit-input-type"
                  value={type}
                  onChange={(e) => patch({ type: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none transition"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Velocidade
                </label>
                <select
                  data-testid="day-zoom-edit-input-speed"
                  value={speed}
                  onChange={(e) => patch({ speed: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 outline-none transition"
                >
                  {SPEED_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-800 bg-gray-900/60">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="day-zoom-edit-submit"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-900/30 transition"
            >
              {submitting ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default DayEditTournamentDialog;
