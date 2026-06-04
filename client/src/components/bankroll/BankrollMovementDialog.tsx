/**
 * BankrollMovementDialog — Aporte / Saque / Ajuste manual (RF-06)
 *
 * Spec: docs/specs/bankroll-management.md
 * Sequence: docs/architecture/flows/bankroll/sequence-configure.md (Cenario C)
 */
import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Reason = "deposit" | "withdrawal" | "manual_adjustment";

const REASONS: Array<{ value: Reason; label: string }> = [
  { value: "deposit", label: "Deposito" },
  { value: "withdrawal", label: "Saque" },
  { value: "manual_adjustment", label: "Ajuste" },
];

export function BankrollMovementDialog({ open, onOpenChange }: Props) {
  const [delta, setDelta] = useState<string>("");
  const [reason, setReason] = useState<Reason>("deposit");
  const [note, setNote] = useState<string>("");
  const [occurredAt, setOccurredAt] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  async function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);

    const deltaNum = parseFloat(delta);
    if (!Number.isFinite(deltaNum) || deltaNum === 0) {
      setError("Delta deve ser diferente de zero");
      return;
    }

    if (occurredAt) {
      const when = new Date(occurredAt + "T00:00:00");
      if (when.getTime() > Date.now()) {
        setError("Data nao pode estar no futuro");
        return;
      }
    }

    const body: any = {
      delta: deltaNum,
      reason,
    };
    if (note.trim()) body.note = note.trim();
    if (occurredAt) body.occurredAt = new Date(occurredAt).toISOString();

    try {
      setSubmitting(true);
      await apiRequest("POST", "/api/bankroll/snapshot", body);
      // Invalida caches
      try {
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/history"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bankroll/consolidated"] });
      } catch {}
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao registrar movimento");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="bankroll-movement-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="bg-card rounded-lg p-6 w-full max-w-md shadow-lg space-y-3"
      >
        <h2 className="text-lg font-semibold">Registrar movimento de banca</h2>

        <div>
          <label className="text-sm font-medium" htmlFor="bankroll-delta">
            Delta (USD - negativo para saque)
          </label>
          <input
            id="bankroll-delta"
            type="number"
            step="0.01"
            data-testid="bankroll-movement-delta-input"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            className="w-full border rounded px-2 py-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="bankroll-reason">
            Motivo
          </label>
          <select
            id="bankroll-reason"
            data-testid="bankroll-movement-reason-select"
            value={reason}
            onChange={(e) => setReason(e.target.value as Reason)}
            className="w-full border rounded px-2 py-1"
          >
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="bankroll-note">
            Nota (opcional)
          </label>
          <textarea
            id="bankroll-note"
            data-testid="bankroll-movement-note-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="w-full border rounded px-2 py-1"
          />
        </div>

        <div>
          <label className="text-sm font-medium" htmlFor="bankroll-date">
            Data (opcional)
          </label>
          <input
            id="bankroll-date"
            type="date"
            data-testid="bankroll-movement-occurred-at-input"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full border rounded px-2 py-1"
          />
        </div>

        {error && (
          <div
            data-testid="bankroll-movement-error"
            className="text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 rounded border"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-testid="bankroll-movement-submit"
            disabled={submitting}
            className="px-4 py-2 rounded bg-primary text-primary-foreground"
          >
            {submitting ? "Enviando..." : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default BankrollMovementDialog;
