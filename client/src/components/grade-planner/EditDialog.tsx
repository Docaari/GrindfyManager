// =============================================================================
// Sprint tournament-dialog-unification — o "Editar Torneio" da grade passou a
// reusar o dialog canonico (components/tournament/TournamentFormDialog), o
// mesmo modal da criacao. Este arquivo virou o adaptador entre o form
// react-hook-form que a pagina ja mantinha (TournamentForm + zod) e o state do
// dialog canonico:
//   - hidrata o modal a partir dos valores do RHF / do torneio em edicao
//   - devolve no submit um TournamentForm completo (preserva os campos que o
//     modal nao mostra: gameType, startingStack, maxPlayers, blindLevel)
//   - repassa os erros do RHF (issues Zod do backend) como erros inline
//
// A assinatura das props NAO mudou — GradePlanner continua igual.
// =============================================================================

import * as React from "react";
import { UseFormReturn } from "react-hook-form";
import { type TournamentForm } from "./types";
import { TournamentFormDialog } from "@/components/tournament/TournamentFormDialog";
import type { TournamentFormState } from "@/components/tournament/useTournamentDialogForm";

interface EditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editForm: UseFormReturn<TournamentForm>;
  onSubmit: (data: TournamentForm) => void;
  onCancel: () => void;
  isPending: boolean;
  editingTournament?: any;
  onUpdateEnrichedFields?: (fields: { lateRegMinutes?: number | null; alertMinutesBefore?: number | null }) => void;
  showDayPicker?: boolean;
}

const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

export function EditDialog({
  open,
  onOpenChange,
  editForm,
  onSubmit,
  onCancel,
  isPending,
  editingTournament,
  onUpdateEnrichedFields,
}: EditDialogProps) {
  // Snapshot inicial: valores do RHF (fonte de verdade da pagina) + os campos
  // que so existem no registro (Max Late vem de registrationTime).
  const initial = React.useMemo<Partial<TournamentFormState>>(() => {
    const v = editForm.getValues();
    return {
      name: str(v.name),
      site: str(v.site),
      buyIn: str(v.buyIn),
      time: str(v.time),
      maxLate: str(v.registrationTime ?? editingTournament?.registrationTime),
      guaranteed: str(v.guaranteed),
      type: str(v.type) || "Vanilla",
      speed: str(v.speed) || "Normal",
      prioridade: Number(v.prioridade) || 2,
      allowsAddOn: Boolean(v.allowsAddOn),
      addOnCost: str(v.addOnCost),
      allowsReentry: Boolean(v.allowsReentry),
      maxReentries:
        v.maxReentries === null || v.maxReentries === undefined || v.maxReentries === ""
          ? null
          : Number(v.maxReentries),
      isFlight: Boolean(v.isFlight),
      isLive: Boolean(v.isLive),
      satelliteRewardType: str(v.satelliteRewardType),
      satelliteTicketValue: str(v.satelliteTicketValue),
      satelliteTargetName: str(v.satelliteTargetName),
      lateRegMinutes: str(v.lateRegMinutes ?? editingTournament?.lateRegMinutes),
      alertMinutesBefore: str(
        v.alertMinutesBefore ?? editingTournament?.alertMinutesBefore,
      ),
    };
    // editingTournament muda a cada abertura; editForm eh estavel (RHF).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTournament, open]);

  // Issues Zod do backend chegam via editForm.setError (mapZodIssuesToForm).
  const fieldErrors = React.useMemo(() => {
    const errs = editForm.formState.errors as Record<string, any>;
    const out: Partial<Record<keyof TournamentFormState, string>> = {};
    for (const key of [
      "name",
      "site",
      "buyIn",
      "time",
      "guaranteed",
    ] as const) {
      const msg = errs?.[key]?.message;
      if (typeof msg === "string" && msg) out[key] = msg;
    }
    return out;
  }, [editForm.formState.errors]);

  const handleSubmit = React.useCallback(
    (values: TournamentFormState) => {
      const previous = editForm.getValues();
      const toIntOrNull = (v: string): number | null => {
        const t = v.trim();
        if (t === "") return null;
        const n = parseInt(t, 10);
        return isNaN(n) ? null : n;
      };
      const lateReg = toIntOrNull(values.lateRegMinutes);
      const alert = toIntOrNull(values.alertMinutesBefore);

      // Back-compat: quem passa onUpdateEnrichedFields continua recebendo o
      // callback (com as mesmas faixas de validacao de antes).
      onUpdateEnrichedFields?.({
        lateRegMinutes:
          lateReg !== null && lateReg >= 0 && lateReg <= 2880 ? lateReg : null,
        alertMinutesBefore:
          alert !== null && alert >= 1 && alert <= 120 ? alert : null,
      });

      const isSatellite = values.type === "Satellite";
      const data: TournamentForm = {
        // preserva o que o modal nao edita (gameType, stack, mesa, blind...)
        ...previous,
        site: values.site.trim(),
        time: values.time,
        type: values.type,
        speed: values.speed,
        name: values.name.trim(),
        buyIn: values.buyIn.replace(",", ".").trim(),
        guaranteed: values.guaranteed.replace(",", ".").trim(),
        prioridade: Number(values.prioridade) || 2,
        registrationTime:
          values.maxLate.trim() !== "" &&
          /^\d{1,2}:\d{1,2}$/.test(values.maxLate.trim())
            ? values.maxLate.trim()
            : null,
        lateRegMinutes: lateReg,
        alertMinutesBefore: alert,
        allowsAddOn: values.allowsAddOn,
        addOnCost: values.allowsAddOn ? values.addOnCost || values.buyIn : null,
        allowsReentry: values.allowsReentry,
        maxReentries: values.allowsReentry ? values.maxReentries : null,
        isFlight: values.isFlight,
        isLive: values.isLive,
        satelliteRewardType: isSatellite
          ? ((values.satelliteRewardType || null) as TournamentForm["satelliteRewardType"])
          : null,
        satelliteTicketValue: isSatellite
          ? values.satelliteTicketValue || null
          : null,
        satelliteTargetName: isSatellite
          ? values.satelliteTargetName || null
          : null,
      };

      onSubmit(data);
    },
    [editForm, onSubmit, onUpdateEnrichedFields],
  );

  const enrichedInfo =
    editingTournament &&
    (editingTournament.startingStack ||
      editingTournament.maxPlayers ||
      editingTournament.gameType ||
      editingTournament.blindLevelMinutes) ? (
      <div className="space-y-0.5 text-[11px] text-gray-400">
        {editingTournament.gameType && (
          <div>
            Tipo de jogo:{" "}
            <span className="text-gray-200">{editingTournament.gameType}</span>
          </div>
        )}
        {editingTournament.startingStack && (
          <div>
            Stack inicial:{" "}
            <span className="text-gray-200">
              {editingTournament.startingStack}
            </span>
          </div>
        )}
        {editingTournament.maxPlayers && (
          <div>
            Max jogadores:{" "}
            <span className="text-gray-200">{editingTournament.maxPlayers}</span>
          </div>
        )}
        {editingTournament.blindLevelMinutes && (
          <div>
            Nivel de blind:{" "}
            <span className="text-gray-200">
              {editingTournament.blindLevelMinutes}min
            </span>
          </div>
        )}
      </div>
    ) : null;

  return (
    <TournamentFormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onCancel();
        onOpenChange(o);
      }}
      mode="edit"
      title="Editar torneio"
      testIdPrefix="grade-edit"
      initial={initial}
      hydrateKey={editingTournament?.id ?? null}
      requireName={false}
      advanced
      showPriority
      showModifiers
      showSatellite
      showEnriched
      enrichedInfo={enrichedInfo}
      fieldErrors={fieldErrors}
      submitting={isPending}
      submitLabel="Salvar alteracoes"
      onSubmit={handleSubmit}
    />
  );
}
