// =============================================================================
// Sprint day-detail-manage RF-01 — Dialog criar torneio direto no dia
//
// Dialog sobreposto Radix com campos minimos (name, site, buyIn, time, type,
// speed) pre-preenchidos com dayOfWeek + profile + slot sugerido. POST direto
// em /api/planned-tournaments + invalidate queries. Emit telemetria
// coach.day_zoom_create_open + coach.day_zoom_create_save.
// =============================================================================

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeEmit } from "@/lib/safe-emit";
import { DAYS_PT } from "@/lib/days-pt";
import { useTournamentDialogForm } from "./useTournamentDialogForm";

const COMMON_SITES = [
  "PokerStars",
  "GGNetwork",
  "WPN",
  "PartyPoker",
  "888poker",
  "Bodog",
  "CoinPoker",
  "Chico",
  "Revolution",
  "iPoker",
];

const TYPE_OPTIONS = ["Vanilla", "PKO", "Mystery", "Satellite", "Bounty"];
const SPEED_OPTIONS = ["Normal", "Turbo", "Hyper"];

export interface DayCreateTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dayOfWeek: number;
  profileLetter: "A" | "B" | "C";
  /** Slot sugerido (HH:00). Pode ser sobrescrito pelo usuario. */
  suggestedSlot: string;
  /** Sites ja vistos na lista do dia — sugestoes priorizadas. */
  knownSites?: string[];
  /** Callback pos-save bem sucedido. */
  onSaved?: () => void;
}

export function DayCreateTournamentDialog(
  props: DayCreateTournamentDialogProps,
): React.ReactElement | null {
  const {
    open,
    onOpenChange,
    dayOfWeek,
    profileLetter,
    suggestedSlot,
    knownSites = [],
    onSaved,
  } = props;

  // MEDIUM-1: form state consolidado via useTournamentDialogForm.
  const { state: form, patch, reset } = useTournamentDialogForm({
    site: knownSites[0] ?? "",
    time: suggestedSlot,
  });
  const { name, site, buyIn, time, maxLate, guaranteed, type, speed } = form;
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const openedRef = React.useRef(false);

  // Reset on (re)open.
  React.useEffect(() => {
    if (open && !openedRef.current) {
      openedRef.current = true;
      reset({
        site: knownSites[0] ?? "",
        time: suggestedSlot,
      });
      setError(null);
      safeEmit("coach.day_zoom_create_open", {
        feature: "day_zoom",
        dayOfWeek,
        profileLetter,
        suggestedSlot,
      });
    } else if (!open) {
      openedRef.current = false;
    }
  }, [open, dayOfWeek, profileLetter, suggestedSlot, knownSites, reset]);

  const sitesForList = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of knownSites) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    for (const s of COMMON_SITES) {
      if (!seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }, [knownSites]);

  const canSubmit =
    name.trim().length > 0 &&
    site.trim().length > 0 &&
    /^\d{2}:\d{2}$/.test(time);

  const handleSubmit = React.useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const buyInValue =
        buyIn.trim() === "" ? "0" : buyIn.replace(",", ".").trim();
      const guaranteedValue =
        guaranteed.trim() === ""
          ? "0"
          : guaranteed.replace(",", ".").trim();
      const maxLateValue =
        maxLate.trim() !== "" && /^\d{1,2}:\d{1,2}$/.test(maxLate.trim())
          ? maxLate.trim()
          : null;
      await apiRequest("POST", "/api/planned-tournaments", {
        name: name.trim(),
        site: site.trim(),
        dayOfWeek,
        time,
        buyIn: buyInValue,
        guaranteed: guaranteedValue,
        registrationTime: maxLateValue,
        type,
        speed,
        profile: profileLetter,
        status: "upcoming",
      });
      try {
        queryClient.invalidateQueries?.({ queryKey: ["planned-tournaments"] });
        queryClient.invalidateQueries?.({
          queryKey: ["/api/planned-tournaments"],
        });
        queryClient.invalidateQueries?.({
          queryKey: ["day-detail", profileLetter, dayOfWeek],
        });
      } catch {
        /* ignore */
      }
      safeEmit("coach.day_zoom_create_save", {
        feature: "day_zoom",
        dayOfWeek,
        profileLetter,
        site: site.trim(),
        buyIn: buyInValue,
        slot: time,
        type,
        speed,
      });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      setError("Falha ao salvar — tente novamente");
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
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

  if (!open) return null;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/70" />
        <DialogPrimitive.Content
          data-testid="day-zoom-create-dialog"
          className="fixed left-[50%] top-[50%] z-[60] translate-x-[-50%] translate-y-[-50%] w-[90vw] max-w-md rounded-lg border border-gray-700 bg-gray-950 shadow-xl p-0 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/60">
            <DialogPrimitive.Title asChild>
              <h2 className="text-base font-semibold text-white">
                Criar torneio — {DAYS_PT[dayOfWeek] ?? ""} (Perfil {profileLetter})
              </h2>
            </DialogPrimitive.Title>
            <button
              type="button"
              data-testid="day-zoom-create-dialog-close"
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
                data-testid="day-zoom-create-input-name"
                value={name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Ex: Sunday Million"
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
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
                  list="day-zoom-create-sites"
                  data-testid="day-zoom-create-input-site"
                  value={site}
                  onChange={(e) => patch({ site: e.target.value })}
                  placeholder="PokerStars"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
                />
                <datalist id="day-zoom-create-sites">
                  {sitesForList.map((s) => (
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
                  data-testid="day-zoom-create-input-buyin"
                  value={buyIn}
                  onChange={(e) => patch({ buyIn: e.target.value })}
                  placeholder="11.00"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
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
                  data-testid="day-zoom-create-input-time"
                  value={time}
                  onChange={(e) => patch({ time: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Tipo</label>
                <select
                  data-testid="day-zoom-create-input-type"
                  value={type}
                  onChange={(e) => patch({ type: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
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
                  data-testid="day-zoom-create-input-speed"
                  value={speed}
                  onChange={(e) => patch({ speed: e.target.value })}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
                >
                  {SPEED_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Max Late (reg final)
                </label>
                <input
                  type="time"
                  data-testid="day-zoom-create-input-maxlate"
                  value={maxLate}
                  onChange={(e) => patch({ maxLate: e.target.value })}
                  placeholder="opcional"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-amber-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Garantido USD
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  data-testid="day-zoom-create-input-guaranteed"
                  value={guaranteed}
                  onChange={(e) => patch({ guaranteed: e.target.value })}
                  placeholder="0"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:border-emerald-500 outline-none"
                />
              </div>
            </div>

            {error && (
              <div
                data-testid="day-zoom-create-error"
                className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded px-2 py-1.5"
              >
                {error}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-800 bg-gray-900/40">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1.5 text-sm text-gray-300 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="button"
              data-testid="day-zoom-create-submit"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="px-3 py-1.5 text-sm bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export default DayCreateTournamentDialog;
