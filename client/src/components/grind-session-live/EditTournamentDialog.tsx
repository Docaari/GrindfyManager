// =============================================================================
// Sprint tournament-dialog-unification — o "Editar Torneio" do grind ao vivo
// passou a reusar o dialog canonico (components/tournament/
// TournamentFormDialog). Aqui ficou o que e da sessao:
//   - mapeamento do objeto `editingTournament` (modo controlado — a pagina
//     continua dona do state, como antes)
//   - campos de RESULTADO da sessao (prize, bounty, posicao, re-entradas
//     feitas) e o opt-in de gravar o horario de registro na biblioteca
//   - payload do onSave identico ao anterior (coercao Add-on/Satellite inclusa)
//
// A assinatura das props NAO mudou — GrindSessionLive continua igual.
// =============================================================================

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrencyForSite } from "@shared/platform-currency";
import { TOURNAMENT_PRIMARY_TYPES, getTypeLabel } from "@shared/tournamentTypes";
import { TournamentFormDialog } from "@/components/tournament/TournamentFormDialog";
import {
  EMPTY_TOURNAMENT_FORM_STATE,
  type TournamentFormState,
} from "@/components/tournament/useTournamentDialogForm";

interface EditTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTournament: any;
  setEditingTournament: (tournament: any) => void;
  onSave: (id: string, data: any, opts?: { scope?: 'session' | 'permanent'; persistRegistrationTimeToLibrary?: boolean }) => void;
}

const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v);

function toFormState(t: any): TournamentFormState {
  return {
    ...EMPTY_TOURNAMENT_FORM_STATE,
    name: str(t?.name),
    site: str(t?.site),
    buyIn: str(t?.buyIn),
    time: str(t?.time),
    maxLate: str(t?.registrationTime),
    guaranteed: str(t?.guaranteed),
    type: str(t?.type || t?.category) || "Vanilla",
    speed: str(t?.speed) || "Normal",
    allowsAddOn: Boolean(t?.allowsAddOn),
    addOnCost: str(t?.addOnCost),
    allowsReentry: Boolean(t?.allowsReentry),
    maxReentries:
      t?.maxReentries === null || t?.maxReentries === undefined || t?.maxReentries === ""
        ? null
        : Number(t.maxReentries),
    isFlight: Boolean(t?.isFlight),
    isLive: Boolean(t?.isLive),
    satelliteRewardType: str(t?.satelliteRewardType),
    satelliteTicketValue: str(t?.satelliteTicketValue),
    satelliteTargetName: str(t?.satelliteTargetName),
    lateRegMinutes: str(t?.lateRegMinutes),
    alertMinutesBefore: str(t?.alertMinutesBefore),
  };
}

export default function EditTournamentDialog({
  open,
  onOpenChange,
  editingTournament,
  setEditingTournament,
  onSave,
}: EditTournamentDialogProps) {
  const currency = getCurrencyForSite(editingTournament?.site || "");
  const doneReentries = parseInt(String(editingTournament?.reentries ?? 0)) || 0;

  const patchSession = (diff: Record<string, unknown>) =>
    setEditingTournament({ ...editingTournament, ...diff });

  return (
    <>
      {/*
        Acessibilidade + SSoT smoke: lista hidden dos tipos primarios para
        garantir que cada tipo aparece no DOM mesmo com o dialog fechado
        (o <select> do modal vive dentro de um portal Radix).
      */}
      <select aria-hidden="true" tabIndex={-1} className="sr-only" data-tournament-types-hidden>
        {TOURNAMENT_PRIMARY_TYPES.map((t) => (
          <option key={t} value={t}>{t} - {getTypeLabel(t)}</option>
        ))}
      </select>

      {editingTournament && (
        <TournamentFormDialog
          open={open}
          onOpenChange={onOpenChange}
          mode="edit"
          title="Editar torneio da sessao"
          testIdPrefix="grind-live-edit"
          requireName={false}
          advanced
          showModifiers
          showSatellite
          showEnriched
          enrichedInfo={
            (editingTournament.startingStack ||
              editingTournament.maxPlayers ||
              editingTournament.gameType ||
              editingTournament.blindLevelMinutes) ? (
              <div className="space-y-0.5 text-[11px] text-gray-400">
                {editingTournament.gameType && (
                  <div>Tipo de jogo: <span className="text-gray-200">{editingTournament.gameType}</span></div>
                )}
                {editingTournament.startingStack && (
                  <div>Stack inicial: <span className="text-gray-200">{editingTournament.startingStack}</span></div>
                )}
                {editingTournament.maxPlayers && (
                  <div>Max jogadores: <span className="text-gray-200">{editingTournament.maxPlayers}</span></div>
                )}
                {editingTournament.blindLevelMinutes && (
                  <div>Nivel de blind: <span className="text-gray-200">{editingTournament.blindLevelMinutes}min</span></div>
                )}
              </div>
            ) : null
          }
          values={toFormState(editingTournament)}
          onValuesChange={(next) => {
            // Regra da sessao (spec 3 caso 9): nao da pra desmarcar re-entry
            // depois que ja houve re-entrada registrada.
            const blockedUncheck =
              Boolean(editingTournament.allowsReentry) &&
              !next.allowsReentry &&
              doneReentries > 0;
            patchSession({
              name: next.name,
              site: next.site,
              buyIn: next.buyIn,
              time: next.time,
              registrationTime: next.maxLate.trim() === "" ? null : next.maxLate,
              guaranteed: next.guaranteed,
              type: next.type,
              category: next.type,
              speed: next.speed,
              allowsAddOn: next.allowsAddOn,
              addOnCost: next.addOnCost,
              // Desmarcar add-on limpa o add-on ja pago (spec 2 caso 2).
              addOnTaken: next.allowsAddOn ? editingTournament.addOnTaken : false,
              allowsReentry: blockedUncheck ? true : next.allowsReentry,
              maxReentries: next.allowsReentry ? next.maxReentries : null,
              isFlight: next.isFlight,
              isLive: next.isLive,
              satelliteRewardType: next.satelliteRewardType || null,
              satelliteTicketValue: next.satelliteTicketValue || null,
              satelliteTargetName: next.satelliteTargetName || null,
              lateRegMinutes:
                next.lateRegMinutes.trim() === ""
                  ? null
                  : parseInt(next.lateRegMinutes, 10),
              alertMinutesBefore:
                next.alertMinutesBefore.trim() === ""
                  ? null
                  : parseInt(next.alertMinutesBefore, 10),
            });
          }}
          extraSlot={() => (
            <div className="space-y-3">
              {/* Horario de registro na biblioteca (so pra torneio vindo de template) */}
              {editingTournament.libraryTemplateId && (
                <label className="flex items-center gap-2 rounded border border-gray-800 bg-gray-900/60 px-2 py-2 text-[11px] text-gray-300">
                  <input
                    type="checkbox"
                    checked={Boolean(editingTournament._persistRegistrationTimeToLibrary)}
                    onChange={(e) =>
                      patchSession({ _persistRegistrationTimeToLibrary: e.target.checked })
                    }
                    className="h-3.5 w-3.5 rounded border-gray-700 bg-gray-900"
                    data-testid="edit-checkbox-persist-regtime-library"
                  />
                  Salvar o Max Late tambem na biblioteca (permanente)
                </label>
              )}

              {/* Resultado da sessao — nao existe na criacao, so aqui. */}
              <div className="space-y-2 rounded border border-gray-800 p-2">
                <div className="text-[11px] font-medium uppercase tracking-wider text-emerald-400">
                  Resultado
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="mb-1 block text-xs text-gray-400">
                      Premio ({currency.symbol})
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={editingTournament.result ?? ""}
                      onChange={(e) => patchSession({ result: e.target.value })}
                      className="h-8 border-gray-700 bg-gray-900 text-sm text-white"
                      data-testid="edit-input-result"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-gray-400">
                      Bounty ({currency.symbol})
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      value={editingTournament.bounty ?? ""}
                      onChange={(e) => patchSession({ bounty: e.target.value })}
                      className="h-8 border-gray-700 bg-gray-900 text-sm text-white"
                      data-testid="edit-input-bounty"
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-gray-400">Posicao</Label>
                    <Input
                      type="number"
                      min="1"
                      value={editingTournament.position ?? ""}
                      onChange={(e) =>
                        patchSession({
                          position: e.target.value ? parseInt(e.target.value) : null,
                        })
                      }
                      className="h-8 border-gray-700 bg-gray-900 text-sm text-white"
                      data-testid="edit-input-position"
                    />
                  </div>
                </div>
                {editingTournament.allowsReentry && (
                  <div>
                    <Label className="mb-1 block text-xs text-gray-400">
                      Re-entradas feitas
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      max={editingTournament.maxReentries ?? undefined}
                      value={editingTournament.reentries ?? 0}
                      onChange={(e) =>
                        patchSession({ reentries: parseInt(e.target.value) || 0 })
                      }
                      className="h-8 border-gray-700 bg-gray-900 text-sm text-white"
                      data-testid="edit-input-reentries"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          onSubmit={(values) => {
            // Sprint 2026-05-07: type=Add-on coerce allowsAddOn=true
            const isAddOnType = values.type === "Add-on";
            const allowsAddOnFinal = Boolean(values.allowsAddOn) || isAddOnType;
            const isSatellite = values.type === "Satellite";
            const toIntOrNull = (v: string): number | null => {
              const t = v.trim();
              if (t === "") return null;
              const n = parseInt(t, 10);
              return isNaN(n) ? null : n;
            };
            onSave(
              editingTournament.id,
              {
                name: values.name,
                site: values.site,
                type: values.type,
                category: editingTournament.category || values.type,
                speed: values.speed,
                buyIn: values.buyIn,
                guaranteed: values.guaranteed,
                time: values.time,
                registrationTime:
                  values.maxLate.trim() === "" ? null : values.maxLate.trim(),
                result: editingTournament.result || "0",
                bounty: editingTournament.bounty || "0",
                position: editingTournament.position || null,
                lateRegMinutes: toIntOrNull(values.lateRegMinutes),
                alertMinutesBefore: toIntOrNull(values.alertMinutesBefore),
                // Add-on + Re-entry (ADR-014) — coerencia com type=Add-on
                allowsAddOn: allowsAddOnFinal,
                addOnCost: allowsAddOnFinal
                  ? values.addOnCost || values.buyIn
                  : null,
                addOnTaken: Boolean(editingTournament.addOnTaken),
                allowsReentry: Boolean(values.allowsReentry),
                maxReentries: values.allowsReentry ? values.maxReentries ?? null : null,
                reentries: values.allowsReentry ? doneReentries : 0,
                // Sprint 2026-05-07 Migration 0051 — modificadores ortogonais
                isFlight: Boolean(values.isFlight),
                isLive: Boolean(values.isLive),
                satelliteRewardType: isSatellite
                  ? values.satelliteRewardType || null
                  : null,
                satelliteTicketValue: isSatellite
                  ? values.satelliteTicketValue || null
                  : null,
                satelliteTargetName: isSatellite
                  ? values.satelliteTargetName || null
                  : null,
              },
              {
                persistRegistrationTimeToLibrary: Boolean(
                  editingTournament._persistRegistrationTimeToLibrary,
                ),
              },
            );
          }}
        />
      )}
    </>
  );
}
