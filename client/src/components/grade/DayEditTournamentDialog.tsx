// =============================================================================
// Sprint day-detail-manage-2 — Edit inline tournament.
// Sprint tournament-dialog-unification — passou a reusar o dialog canonico
// (components/tournament/TournamentFormDialog) em modo edit. Este arquivo fica
// com o que e do contexto "grade": hidratacao do snapshot, PUT
// /api/planned-tournaments/:id (semantica PATCH no guaranteed), telemetria
// coach.day_zoom_edit_save e invalidacoes. Testids day-zoom-edit-* iguais.
// =============================================================================

import * as React from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeEmit } from "@/lib/safe-emit";
import { DAYS_PT } from "@/lib/days-pt";
import { TournamentFormDialog } from "@/components/tournament/TournamentFormDialog";
import type { TournamentFormState } from "@/components/tournament/useTournamentDialogForm";

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

  // guaranteedUsd (FX-converted) tem prioridade; fallback guaranteed (raw) se
  // FX indisponivel. O PUT envia "guaranteed" — server normaliza via nativeToUsd.
  const initial = React.useMemo<Partial<TournamentFormState>>(() => {
    if (!tournament) return {};
    const initialBuyIn =
      tournament.buyinUsd != null
        ? String(tournament.buyinUsd)
        : tournament.buyIn != null
          ? String(tournament.buyIn)
          : "";
    const initialGtd =
      tournament.guaranteedUsd != null
        ? String(tournament.guaranteedUsd)
        : tournament.guaranteed != null
          ? String(tournament.guaranteed)
          : "";
    return {
      name: tournament.name ?? "",
      site: tournament.site ?? "",
      buyIn: initialBuyIn,
      time: tournament.time ?? "",
      maxLate: tournament.maxLate ?? tournament.registrationTime ?? "",
      guaranteed: initialGtd,
      type: tournament.type ?? "Vanilla",
      speed: tournament.speed ?? "Normal",
    };
  }, [tournament]);

  const handleSubmit = React.useCallback(
    async (values: TournamentFormState) => {
      if (!tournament) return;
      const buyInValue =
        values.buyIn.trim() === "" ? "0" : values.buyIn.replace(",", ".").trim();
      const maxLateValue =
        values.maxLate.trim() !== "" &&
        /^\d{1,2}:\d{1,2}$/.test(values.maxLate.trim())
          ? values.maxLate.trim()
          : null;

      const payload: Record<string, unknown> = {
        name: values.name.trim(),
        site: values.site.trim(),
        time: values.time,
        buyIn: buyInValue,
        registrationTime: maxLateValue,
        type: values.type,
        speed: values.speed,
      };
      // HIGH-4: semantica PATCH — quando o user limpa o campo guaranteed,
      // omitir do payload pra NAO sobrescrever valor existente com "0".
      const guaranteedTrimmed = values.guaranteed.trim();
      if (guaranteedTrimmed !== "") {
        payload.guaranteed = guaranteedTrimmed.replace(",", ".");
      }

      await apiRequest(
        "PUT",
        `/api/planned-tournaments/${tournament.id}`,
        payload,
      );

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
        slot: values.time,
        site: values.site.trim(),
      });

      onSaved?.();
    },
    [tournament, dayOfWeek, profileLetter, onSaved],
  );

  if (!tournament) return null;

  return (
    <TournamentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode="edit"
      title={`Editar torneio — ${DAYS_PT[dayOfWeek] ?? ""} (Perfil ${profileLetter})`}
      testIdPrefix="day-zoom-edit"
      knownSites={knownSites}
      initial={initial}
      hydrateKey={tournament.id}
      onSubmit={handleSubmit}
    />
  );
}

export default DayEditTournamentDialog;
