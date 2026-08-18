// =============================================================================
// Sprint day-detail-manage RF-01 — Dialog criar torneio direto no dia.
// Sprint tournament-dialog-unification — o markup virou o dialog canonico
// (components/tournament/TournamentFormDialog). Este arquivo permanece como o
// adaptador do contexto "grade": titulo com dia/perfil, POST em
// /api/planned-tournaments, telemetria coach.day_zoom_create_* e invalidacao
// das queries da grade. Os testids day-zoom-create-* seguem iguais.
//
// Sprint grade-planner-library-and-multi-day (ADR-245 §Q7/Opcao A) — este
// adaptador tambem passou a ORQUESTRAR o lote multi-dia, porque e o unico lugar
// do codigo que sabe transformar TournamentFormState em corpo de
// POST /api/planned-tournaments. A capacidade e OPT-IN pela prop `multiDay`:
// sem ela (consumidor DayDetailZoom) o comportamento e o de hoje, byte-a-byte —
// 1 POST, nenhum toast proprio, telemetria sem daysCount.
// =============================================================================

import * as React from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { safeEmit } from "@/lib/safe-emit";
import { useToast } from "@/hooks/use-toast";
import { DAYS_PT } from "@/lib/days-pt";
import { TournamentFormDialog } from "@/components/tournament/TournamentFormDialog";
import type { TournamentFormState } from "@/components/tournament/useTournamentDialogForm";
import { WeekDaysPicker } from "@/components/grade-planner/WeekDaysPicker";
import { weekDays } from "@/components/grade-planner/types";
import {
  resolveMultiDayTargets,
  summarizeMultiDayResult,
  type DayProfile,
  type MultiDayTarget,
} from "@shared/grade-multi-day";

/** Rotulos curtos default do toast/picker (Dom..Sab). */
const DEFAULT_DAY_LABELS: readonly string[] = weekDays.map((d) => d.short);

export interface DayCreateMultiDayOptions {
  /** Dias ja marcados ao abrir. "+" da celula: [dia de origem]. Biblioteca: []. */
  initialDays?: number[];
  /** Mesma assinatura de GradePlanner.getActiveProfile. */
  getProfileForDay: (dayOfWeek: number) => DayProfile;
  /** Rotulos curtos indexados por dayOfWeek. Default: weekDays[].short. */
  dayLabels?: readonly string[];
  /**
   * RF-03/ADR-245 §D6 — id da linha de tournament_library que originou o modal.
   * Vai no payload de cada POST: faz o auto-populate da biblioteca pular
   * (decideLibraryAction -> skip) e alimenta o `alreadyInGrid` do Selector.
   */
  libraryTemplateId?: string;
}

export interface DayCreateTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Dia de origem. OPCIONAL desde o fluxo do card da biblioteca, que nao tem
   * dia de origem (ADR-245 §Q7). Sem `multiDay`, continua obrigatorio na
   * pratica: e o dia do unico POST.
   */
  dayOfWeek?: number;
  /** Perfil do dia de origem. Opcional pelo mesmo motivo de `dayOfWeek`. */
  profileLetter?: "A" | "B" | "C";
  /** Slot sugerido (HH:00). Pode ser sobrescrito pelo usuario. */
  suggestedSlot: string;
  /** Sites ja vistos na lista do dia — sugestoes priorizadas. */
  knownSites?: string[];
  /**
   * Prefill do formulario (RF-03: registro de tournament_library). Vence o
   * `suggestedSlot` no campo `time`.
   */
  initial?: Partial<TournamentFormState>;
  /** Liga a criacao em lote + o seletor de dias. Ausente = fluxo de hoje. */
  multiDay?: DayCreateMultiDayOptions;
  /** Callback pos-save bem sucedido. */
  onSaved?: () => void;
}

/** Converte o snapshot do form no corpo do POST (unico lugar que sabe isso). */
function buildPlannedPayload(
  values: TournamentFormState,
  target: { dayOfWeek: number; profile: "A" | "B" | "C" },
  libraryTemplateId?: string,
) {
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

  return {
    name: values.name.trim(),
    site: values.site.trim(),
    dayOfWeek: target.dayOfWeek,
    time: values.time,
    buyIn: buyInValue,
    guaranteed: guaranteedValue,
    registrationTime: maxLateValue,
    type: values.type,
    speed: values.speed,
    profile: target.profile,
    status: "upcoming",
    ...(libraryTemplateId ? { libraryTemplateId } : {}),
  };
}

/** Invalidacao das queries da grade. Chamada UMA vez por lote (ADR-245 §C5). */
function invalidateGradeQueries(createdTargets: readonly MultiDayTarget[]): void {
  try {
    queryClient.invalidateQueries?.({ queryKey: ["planned-tournaments"] });
    queryClient.invalidateQueries?.({ queryKey: ["/api/planned-tournaments"] });
    queryClient.invalidateQueries?.({ queryKey: ["/api/active-days"] });
    // O backend auto-popula tournament_library dentro de createPlannedTournament.
    queryClient.invalidateQueries?.({ queryKey: ["/api/tournament-library"] });
    for (const target of createdTargets) {
      queryClient.invalidateQueries?.({
        queryKey: ["day-detail", target.profile, target.dayOfWeek],
      });
    }
  } catch (err) {
    // Cache stale nao pode derrubar um lote ja persistido — mas some em
    // silencio se nao for logado (regra 03: log antes de qualquer fallback).
    console.error("[DayCreateTournamentDialog] falha ao invalidar cache", err);
  }
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
    initial,
    multiDay,
    onSaved,
  } = props;

  const { toast } = useToast();

  // State do lote — vive AQUI, nao em TournamentFormState (ADR-245 §D1): dias
  // sao conceito do lote, um planned_tournament tem um dayOfWeek, nao sete.
  const [selectedDays, setSelectedDays] = React.useState<number[]>(
    () => multiDay?.initialDays ?? [],
  );
  // Mensagem controlada: tem precedencia sobre o "Falha ao salvar" generico do
  // dialog canonico, e e ela que explica "nenhum dia valido".
  const [batchError, setBatchError] = React.useState<string | null>(null);

  // `initialDays` costuma ser array literal inline; ref evita re-resetar o
  // state a cada render do caller.
  const initialDaysRef = React.useRef(multiDay?.initialDays);
  initialDaysRef.current = multiDay?.initialDays;

  React.useEffect(() => {
    if (!open) return;
    setSelectedDays(initialDaysRef.current ?? []);
    setBatchError(null);
  }, [open]);

  const handleToggleDay = React.useCallback((day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }, []);

  const getProfileForDay = multiDay?.getProfileForDay;
  const dayLabels = multiDay?.dayLabels ?? DEFAULT_DAY_LABELS;
  const libraryTemplateId = multiDay?.libraryTemplateId;

  // ---------------------------------------------------------------------
  // Submit em lote (RF-04). Sequencial de proposito (ADR-245 §Q6/Opcao A):
  // os N POSTs do mesmo torneio disputam a mesma linha de tournament_library
  // no auto-populate, que e read-then-write sem unique constraint.
  // ---------------------------------------------------------------------
  const submitBatch = React.useCallback(
    async (values: TournamentFormState) => {
      if (!getProfileForDay) return;
      setBatchError(null);

      const { targets, skipped } = resolveMultiDayTargets(
        selectedDays,
        getProfileForDay,
      );

      if (targets.length === 0) {
        // Nenhum POST sai. O modal fica aberto porque o onSubmit lanca
        // (TournamentFormDialog.tsx:280) e a mensagem controlada vence o texto
        // generico de falha.
        const summary = summarizeMultiDayResult(
          { created: [], failed: [], skipped },
          dayLabels,
        );
        setBatchError(
          [summary.title, summary.description].filter(Boolean).join(" — "),
        );
        toast(summary);
        throw new Error("multi_day_no_valid_target");
      }

      const created: MultiDayTarget[] = [];
      const failed: MultiDayTarget[] = [];

      for (const target of targets) {
        try {
          await apiRequest(
            "POST",
            "/api/planned-tournaments",
            buildPlannedPayload(values, target, libraryTemplateId),
          );
          created.push(target);
        } catch (err) {
          // Falha parcial e tolerada: o dia que falhou vai nomeado no toast e
          // os ja criados permanecem. Log antes do fallback (regra 03).
          console.error(
            `[DayCreateTournamentDialog] POST falhou no dia ${target.dayOfWeek}`,
            err,
          );
          failed.push(target);
        }
      }

      invalidateGradeQueries(created);

      const eventDay = dayOfWeek ?? created[0]?.dayOfWeek;
      const eventProfile = profileLetter ?? created[0]?.profile;
      safeEmit("coach.day_zoom_create_save", {
        feature: "day_zoom",
        dayOfWeek: eventDay,
        profileLetter: eventProfile,
        site: values.site.trim(),
        buyIn: values.buyIn.replace(",", ".").trim(),
        slot: values.time,
        type: values.type,
        speed: values.speed,
        daysCount: targets.length,
        skippedCount: skipped.length,
      });

      const summary = summarizeMultiDayResult(
        {
          created: created.map((t) => t.dayOfWeek),
          failed: failed.map((t) => t.dayOfWeek),
          skipped,
        },
        dayLabels,
      );
      toast(summary);

      if (created.length === 0) {
        // Nunca reportar sucesso quando nada entrou: o modal fica aberto.
        setBatchError(
          [summary.title, summary.description].filter(Boolean).join(" — "),
        );
        throw new Error("multi_day_all_failed");
      }

      onSaved?.();
    },
    [
      getProfileForDay,
      selectedDays,
      dayLabels,
      libraryTemplateId,
      dayOfWeek,
      profileLetter,
      toast,
      onSaved,
    ],
  );

  // ---------------------------------------------------------------------
  // Submit de dia unico — o fluxo de hoje, intocado.
  // ---------------------------------------------------------------------
  const submitSingle = React.useCallback(
    async (values: TournamentFormState) => {
      if (dayOfWeek == null || !profileLetter) {
        throw new Error(
          "DayCreateTournamentDialog sem multiDay exige dayOfWeek e profileLetter",
        );
      }
      const payload = buildPlannedPayload(values, {
        dayOfWeek,
        profile: profileLetter,
      });

      await apiRequest("POST", "/api/planned-tournaments", payload);

      try {
        queryClient.invalidateQueries?.({ queryKey: ["planned-tournaments"] });
        queryClient.invalidateQueries?.({
          queryKey: ["/api/planned-tournaments"],
        });
        queryClient.invalidateQueries?.({
          queryKey: ["day-detail", profileLetter, dayOfWeek],
        });
      } catch (err) {
        console.error("[DayCreateTournamentDialog] falha ao invalidar cache", err);
      }

      safeEmit("coach.day_zoom_create_save", {
        feature: "day_zoom",
        dayOfWeek,
        profileLetter,
        site: values.site.trim(),
        buyIn: payload.buyIn,
        slot: values.time,
        type: values.type,
        speed: values.speed,
      });

      onSaved?.();
    },
    [dayOfWeek, profileLetter, onSaved],
  );

  const handleSubmit = React.useCallback(
    async (values: TournamentFormState) => {
      if (multiDay) {
        await submitBatch(values);
        return;
      }
      await submitSingle(values);
    },
    [multiDay, submitBatch, submitSingle],
  );

  const title =
    dayOfWeek != null && profileLetter
      ? `Criar torneio — ${DAYS_PT[dayOfWeek] ?? ""} (Perfil ${profileLetter})`
      : "Criar torneio";

  return (
    <TournamentFormDialog
      open={open}
      onOpenChange={onOpenChange}
      mode="create"
      title={title}
      testIdPrefix="day-zoom-create"
      knownSites={knownSites}
      initial={{ site: knownSites[0] ?? "", time: suggestedSlot, ...initial }}
      errorMessage={batchError}
      extraCanSubmit={multiDay ? selectedDays.length > 0 : undefined}
      extraSlot={
        multiDay && getProfileForDay
          ? () => (
              <WeekDaysPicker
                selectedDays={selectedDays}
                onToggleDay={handleToggleDay}
                getProfileForDay={getProfileForDay}
                dayLabels={dayLabels}
              />
            )
          : undefined
      }
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
