import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RegisterTicketDialog as TicketRecoveryDialog } from "@/components/tickets/RegisterTicketDialog";

export interface SatelliteResultDialogProps {
  tournament: any;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onAfterSave?: () => void;
}

export function SatelliteResultDialog({ tournament, open, onOpenChange, onAfterSave }: SatelliteResultDialogProps) {
  const rewardType: string | null = tournament?.satelliteRewardType ?? null;
  const [outcome, setOutcome] = useState<"ticket" | "cash" | "nopass" | null>(null);
  const [ticketValue, setTicketValue] = useState<string>(
    tournament?.satelliteTicketValue ? String(tournament.satelliteTicketValue) : "",
  );
  const [cashPrize, setCashPrize] = useState<string>("");
  const [position, setPosition] = useState<string>("");
  const [valueError, setValueError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryToast, setRecoveryToast] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    setValueError(null);
    setRecoveryToast(false);
    if (rewardType === "cash") setOutcome("cash");
    else if (rewardType === "ticket" || rewardType === "package") setOutcome("ticket");
    else setOutcome(null);
  }, [open, rewardType]);

  const ticketDisabled = rewardType === "cash";
  const cashDisabled = rewardType === "ticket" || rewardType === "package";

  function invalidate() {
    try { queryClient.invalidateQueries({ queryKey: ["/api/tickets"] }); } catch { /* noop */ }
    try { queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] }); } catch { /* noop */ }
    try { queryClient.invalidateQueries({ queryKey: ["/api/sessions"] }); } catch { /* noop */ }
  }

  async function onSubmit() {
    setValueError(null);
    setSubmitError(null);

    if (outcome === "ticket") {
      const v = parseFloat(ticketValue);
      if (!ticketValue || !Number.isFinite(v) || v <= 0) {
        setValueError("Valor do ticket obrigatorio");
        return;
      }

      setSubmitting(true);
      let putOk = false;
      try {
        await apiRequest("PUT", `/api/session-tournaments/${tournament.id}`, {
          status: "finished",
          prize: 0,
          position: position ? parseInt(position, 10) : undefined,
        });
        putOk = true;
      } catch (err: any) {
        setSubmitting(false);
        setSubmitError("Falha ao salvar resultado.");
        return;
      }

      const ticketBody: any = {
        source: "satellite_result",
        sourceSessionTournamentId: tournament.id,
        targetSite: tournament.site ?? undefined,
        ticketValueUSD: v,
      };
      if (tournament.satelliteTargetTemplateId) {
        ticketBody.targetTemplateId = tournament.satelliteTargetTemplateId;
      } else if (tournament.satelliteTargetName) {
        ticketBody.targetName = tournament.satelliteTargetName;
      } else {
        ticketBody.targetName = tournament.name ?? "Torneio alvo";
      }

      try {
        await apiRequest("POST", "/api/tickets", ticketBody);
        invalidate();
        setSubmitting(false);
        onAfterSave?.();
        onOpenChange(false);
      } catch (err: any) {
        setSubmitting(false);
        if (putOk) {
          setRecoveryToast(true);
          setSubmitError("Resultado salvo, mas falha ao criar ticket.");
        } else {
          setSubmitError("Falha ao criar ticket.");
        }
      }
      return;
    }

    if (outcome === "cash") {
      setSubmitting(true);
      try {
        await apiRequest("PUT", `/api/session-tournaments/${tournament.id}`, {
          status: "finished",
          prize: cashPrize ? parseFloat(cashPrize) : 0,
          position: position ? parseInt(position, 10) : undefined,
        });
        invalidate();
        setSubmitting(false);
        onAfterSave?.();
        onOpenChange(false);
      } catch (err: any) {
        setSubmitting(false);
        setSubmitError("Falha ao salvar resultado.");
      }
      return;
    }

    if (outcome === "nopass") {
      setSubmitting(true);
      try {
        await apiRequest("PUT", `/api/session-tournaments/${tournament.id}`, {
          status: "finished",
          prize: 0,
          position: position ? parseInt(position, 10) : undefined,
        });
        invalidate();
        setSubmitting(false);
        onAfterSave?.();
        onOpenChange(false);
      } catch (err: any) {
        setSubmitting(false);
        setSubmitError("Falha ao salvar resultado.");
      }
      return;
    }

    setSubmitError("Selecione um resultado.");
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-md" data-testid="satellite-result-dialog">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-white">Resultado do satelite</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-xs text-gray-400">
              {tournament?.name ?? ""} {tournament?.site ? `· ${tournament.site}` : ""}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                data-testid="satellite-outcome-ticket"
                onClick={() => setOutcome("ticket")}
                disabled={ticketDisabled}
                className={`flex-1 ${outcome === "ticket" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-800 hover:bg-zinc-700"} ${ticketDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Ganhei ticket
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="satellite-outcome-cash"
                onClick={() => setOutcome("cash")}
                disabled={cashDisabled}
                className={`flex-1 ${outcome === "cash" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-800 hover:bg-zinc-700"} ${cashDisabled ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                Ganhei cash
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="satellite-outcome-nopass"
                onClick={() => setOutcome("nopass")}
                className={`flex-1 ${outcome === "nopass" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-zinc-800 hover:bg-zinc-700"}`}
              >
                Nao passei
              </Button>
            </div>

            {outcome === "ticket" && (
              <div className="space-y-2">
                <div className="flex flex-col">
                  <label className="text-xs text-emerald-400 font-medium mb-1">Valor do ticket (USD)</label>
                  <Input
                    data-testid="satellite-ticket-value-input"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={ticketValue}
                    onChange={(e) => setTicketValue(e.target.value)}
                    className="border-gray-600 bg-gray-800 text-white h-10"
                  />
                  {valueError && (
                    <span data-testid="satellite-ticket-value-error" className="text-xs text-red-400 mt-1">
                      {valueError}
                    </span>
                  )}
                  {tournament?.satelliteTargetName && (
                    <span className="text-xs text-zinc-400 mt-1">Alvo: {tournament.satelliteTargetName}</span>
                  )}
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-white font-medium mb-1">Posicao (opcional)</label>
                  <Input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="border-gray-600 bg-gray-800 text-white h-10"
                  />
                </div>
              </div>
            )}

            {outcome === "cash" && (
              <div className="space-y-2">
                <div className="flex flex-col">
                  <label className="text-xs text-emerald-400 font-medium mb-1">Premio (cash)</label>
                  <Input
                    data-testid="satellite-cash-prize-input"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={cashPrize}
                    onChange={(e) => setCashPrize(e.target.value)}
                    className="border-gray-600 bg-gray-800 text-white h-10"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-xs text-white font-medium mb-1">Posicao (opcional)</label>
                  <Input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="border-gray-600 bg-gray-800 text-white h-10"
                  />
                </div>
              </div>
            )}

            {outcome === "nopass" && (
              <div className="space-y-2">
                <p className="text-sm text-zinc-400">Sem premio. Sem ticket.</p>
                <div className="flex flex-col">
                  <label className="text-xs text-white font-medium mb-1">Posicao (opcional)</label>
                  <Input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    className="border-gray-600 bg-gray-800 text-white h-10"
                  />
                </div>
              </div>
            )}

            {recoveryToast && (
              <div
                data-testid="satellite-ticket-recovery-toast"
                className="p-2 bg-amber-700/30 border border-amber-700 rounded text-xs"
              >
                Resultado salvo, mas falha ao criar ticket.{" "}
                <button
                  type="button"
                  data-testid="satellite-ticket-recovery-cta"
                  onClick={() => setRecoveryOpen(true)}
                  className="ml-1 underline"
                >
                  Registrar manualmente
                </button>
              </div>
            )}

            {submitError && !recoveryToast && (
              <div className="text-xs text-red-400">{submitError}</div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600"
              >
                Fechar
              </Button>
              <Button
                type="button"
                data-testid="satellite-result-submit"
                onClick={onSubmit}
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                {submitting ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {recoveryOpen && (
        <TicketRecoveryDialog
          open={recoveryOpen}
          onOpenChange={setRecoveryOpen}
          initialValues={{
            targetName: tournament?.satelliteTargetName ?? "",
            targetSite: tournament?.site ?? "",
            ticketValueUSD: ticketValue ? parseFloat(ticketValue) : undefined,
            note: `Vindo do satelite #${tournament?.id ?? ""}`,
          }}
        />
      )}
    </>
  );
}

export default SatelliteResultDialog;
