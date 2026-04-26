/**
 * RegisterTicketDialog — Sprint Tickets-1 (RF-03)
 *
 * Spec: docs/specs/satellite-tickets-management.md (RF-03)
 *
 * Dialog para registrar ticket manual (avulso). Usado tambem como recovery do
 * fluxo "Ganhei ticket" no satellite live (race recovery via initialValues).
 *
 * Contrato:
 *   - Submit POST /api/tickets com source='manual'
 *   - onSuccess: invalida ['/api/tickets'] + onOpenChange(false)
 *   - onError 4xx: mostra mensagem inline, nao fecha
 */

import { useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface RegisterTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValues?: {
    targetName?: string;
    targetSite?: string;
    targetTemplateId?: string;
    ticketValueUSD?: number | string;
    extraCashUSD?: number | string;
    expiresAt?: string;
    note?: string;
  };
}

export function RegisterTicketDialog(props: RegisterTicketDialogProps) {
  const { open, onOpenChange, initialValues } = props;

  const [targetName, setTargetName] = useState<string>(
    String(initialValues?.targetName ?? ""),
  );
  const [targetSite, setTargetSite] = useState<string>(
    String(initialValues?.targetSite ?? ""),
  );
  const [ticketValueUSD, setTicketValueUSD] = useState<string>(
    initialValues?.ticketValueUSD != null ? String(initialValues.ticketValueUSD) : "",
  );
  const [extraCashUSD, setExtraCashUSD] = useState<string>(
    initialValues?.extraCashUSD != null ? String(initialValues.extraCashUSD) : "",
  );
  const [expiresAt, setExpiresAt] = useState<string>(
    String(initialValues?.expiresAt ?? ""),
  );
  const [note, setNote] = useState<string>(String(initialValues?.note ?? ""));

  const [valueError, setValueError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [expiresError, setExpiresError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Sync initialValues quando o dialog reabre com novos defaults
  useEffect(() => {
    if (open) {
      setTargetName(String(initialValues?.targetName ?? ""));
      setTargetSite(String(initialValues?.targetSite ?? ""));
      setTicketValueUSD(
        initialValues?.ticketValueUSD != null ? String(initialValues.ticketValueUSD) : "",
      );
      setExtraCashUSD(
        initialValues?.extraCashUSD != null ? String(initialValues.extraCashUSD) : "",
      );
      setExpiresAt(String(initialValues?.expiresAt ?? ""));
      setNote(String(initialValues?.note ?? ""));
      setValueError(null);
      setTargetError(null);
      setExpiresError(null);
      setServerError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const validate = (): boolean => {
    let ok = true;
    setValueError(null);
    setTargetError(null);
    setExpiresError(null);

    const v = parseFloat(ticketValueUSD);
    if (!ticketValueUSD || !Number.isFinite(v) || v <= 0) {
      setValueError("Valor do ticket deve ser maior que 0");
      ok = false;
    }
    if (!targetName.trim()) {
      setTargetError("Informe o torneio alvo");
      ok = false;
    }
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) {
        setExpiresError("Data invalida");
        ok = false;
      } else if (d.getTime() <= Date.now()) {
        setExpiresError("Data de validade deve ser no futuro");
        ok = false;
      }
    }
    return ok;
  };

  async function onSubmit(e: React.FormEvent) {
    e?.preventDefault?.();
    if (!validate()) return;

    setSubmitting(true);
    setServerError(null);

    const body: any = {
      source: "manual",
      ticketValueUSD: parseFloat(ticketValueUSD),
      targetName: targetName.trim(),
    };
    if (targetSite.trim()) body.targetSite = targetSite.trim();
    if (extraCashUSD) {
      const ec = parseFloat(extraCashUSD);
      if (Number.isFinite(ec)) body.extraCashUSD = ec;
    }
    if (expiresAt) body.expiresAt = expiresAt;
    if (note) body.note = note;

    try {
      await apiRequest("POST", "/api/tickets", body);
      (queryClient as any).invalidateQueries({ queryKey: ["/api/tickets"] });
      onOpenChange(false);
    } catch (err: any) {
      setServerError(err?.message ?? "Erro ao registrar ticket");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="register-ticket-dialog" role="dialog" aria-modal="true">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 max-w-md mx-auto">
        <h2 className="text-lg font-semibold mb-4">Registrar ticket manualmente</h2>
        <form onSubmit={onSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-sm">Torneio alvo *</label>
              <input
                data-testid="register-ticket-target-name-input"
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
              />
              {targetError && (
                <span data-testid="register-ticket-target-error" className="text-xs text-red-400">
                  {targetError}
                </span>
              )}
            </div>
            <div>
              <label className="block text-sm">Site / Rede</label>
              <input
                data-testid="register-ticket-target-site-input"
                type="text"
                value={targetSite}
                onChange={(e) => setTargetSite(e.target.value)}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
              />
            </div>
            <div>
              <label className="block text-sm">Valor do ticket (USD) *</label>
              <input
                data-testid="register-ticket-value-input"
                type="number"
                step="0.01"
                value={ticketValueUSD}
                onChange={(e) => setTicketValueUSD(e.target.value)}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
              />
              {valueError && (
                <span data-testid="register-ticket-value-error" className="text-xs text-red-400">
                  {valueError}
                </span>
              )}
            </div>
            <div>
              <label className="block text-sm">Validade (opcional)</label>
              <input
                data-testid="register-ticket-expires-at-input"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
              />
              {expiresError && (
                <span data-testid="register-ticket-expires-error" className="text-xs text-red-400">
                  {expiresError}
                </span>
              )}
            </div>
            <div>
              <label className="block text-sm">Cash extra (USD)</label>
              <input
                data-testid="register-ticket-extra-cash-input"
                type="number"
                step="0.01"
                value={extraCashUSD}
                onChange={(e) => setExtraCashUSD(e.target.value)}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
              />
            </div>
            <div>
              <label className="block text-sm">Observacoes</label>
              <textarea
                data-testid="register-ticket-note-input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-2 py-1 bg-zinc-800 border border-zinc-700 rounded"
                rows={3}
                maxLength={500}
              />
            </div>
          </div>
          {serverError && (
            <div
              data-testid="register-ticket-server-error"
              className="mt-3 text-sm text-red-400"
            >
              {serverError}
            </div>
          )}
          <div className="mt-4 flex gap-2 justify-end">
            <button
              type="button"
              data-testid="register-ticket-cancel"
              onClick={() => onOpenChange(false)}
              className="px-3 py-1 border border-zinc-700 rounded"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              data-testid="register-ticket-submit"
              className="px-3 py-1 bg-emerald-600 rounded"
              disabled={submitting}
            >
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RegisterTicketDialog;
