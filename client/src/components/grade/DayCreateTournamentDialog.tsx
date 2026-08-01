// =============================================================================
// Sprint day-detail-manage RF-01 — Dialog criar torneio direto no dia.
// Sprint tournament-dialog-unification — o markup virou o dialog canonico
// (components/tournament/TournamentFormDialog). Este arquivo permanece como o
// adaptador do contexto "grade": titulo com dia/perfil, POST em
// /api/planned-tournaments, telemetria coach.day_zoom_create_* e invalidacao
// das queries da grade. Os testids day-zoom-create-* seguem iguais.
// =============================================================================

import * as React from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeEmit } from "@/lib/safe-emit";
import { DAYS_PT } from "@/lib/days-pt";
import { TournamentFormDialog } from "@/components/tournament/TournamentFormDialog";
import type { TournamentFormState } from "@/components/tournament/useTournamentDialogForm";

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

  const handleSubmit = React.useCallback(
    async (values: TournamentFormState) => {
      const buyInValue =
        values.buyIn.trim() === "" ? "0" : values.buyIn.replace(",", ".").trim();
      const guaranteedValue =
        values.guaranteed.trim() === ""
          ? "0"
          : values.guaranteed.replace(",", ".").trim();
      const maxLateValue =
        values.maxLate.trim() !== "" &&
        /^\d{1,2}:\d{1,2}$/.test(values.maxLate.trim())
          ? values.maxLate.trim()
          : null;

      await apiRequest("POST", "/api/planned-tournaments", {
        name: values.name.trim(),
        site: values.site.trim(),
        dayOfWeek,
        time: values.time,
        buyIn: buyInValue,
        guaranteed: guaranteedValue,
        registrationTime: maxLateValue,
        type: values.type,
        speed: values.speed,
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
        site: values.site.trim(),
        buyIn: buyInValue,
        slot: values.time,
        type: values.type,
        speed: values.speed,
      });

      onSaved?.();
    },
    [dayOfWeek, profileLetter, onSaved],
  );

  return (
    <TournamentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title={`Criar torneio — ${DAYS_PT[dayOfWeek] ?? ""} (Perfil ${profileLetter})`}
      testIdPrefix="day-zoom-create"
      knownSites={knownSites}
      initial={{ site: knownSites[0] ?? "", time: suggestedSlot }}
      onOpened={() =>
        safeEmit("coach.day_zoom_create_open", {
          feature: "day_zoom",
          dayOfWeek,
          profileLetter,
          suggestedSlot,
        })
      }
      onSubmit={handleSubmit}
    />
  );
}

export default DayCreateTournamentDialog;
