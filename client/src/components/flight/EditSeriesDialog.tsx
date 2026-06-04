/**
 * Sprint Flight-1 RF-14: EditSeriesDialog (edit-in-place).
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-14)
 */

import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SeriesProp {
  id: string;
  userId?: string;
  name: string;
  network?: string | null;
  totalDay1s: number;
  day2DateTime: string | Date;
  day2Status: 'pending' | 'completed' | 'cancelled';
  stackMode: 'single' | 'combined';
  notes?: string | null;
}

interface EditSeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series: SeriesProp;
}

function toDateTimeLocal(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const EditSeriesDialog: React.FC<EditSeriesDialogProps> = ({
  open,
  onOpenChange,
  series,
}) => {
  const [name, setName] = useState(series.name);
  const [totalDay1s, setTotalDay1s] = useState(series.totalDay1s);
  const [datetime, setDatetime] = useState(toDateTimeLocal(series.day2DateTime));
  const [stackMode, setStackMode] = useState(series.stackMode);
  const [day2Status, setDay2Status] = useState(series.day2Status);
  const [notes, setNotes] = useState(series.notes ?? "");
  const [showStackWarning, setShowStackWarning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function handleStackChange(next: 'single' | 'combined'): void {
    setStackMode(next);
    if (series.day2Status === 'completed' && next !== series.stackMode) {
      setShowStackWarning(true);
    } else {
      setShowStackWarning(false);
    }
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const body: any = {
        name,
        totalDay1s,
        day2DateTime: new Date(datetime).toISOString(),
        stackMode,
        day2Status,
        notes: notes || null,
      };
      await apiRequest("PATCH", `/api/tournament-series/${series.id}`, body);
      queryClient.invalidateQueries({ queryKey: ["tournament-series"] });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? "Erro ao salvar a serie.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="edit-series-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-white mb-4">Editar serie</h2>

        <label className="block text-xs text-gray-400 mb-1">Nome</label>
        <input
          data-testid="edit-series-name-input"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
        />

        <label className="block text-xs text-gray-400 mb-1">Total Day 1s</label>
        <input
          data-testid="edit-series-total-day1s-input"
          type="number"
          min={0}
          value={totalDay1s}
          onChange={(e) => setTotalDay1s(parseInt(e.target.value, 10) || 0)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
        />

        <label className="block text-xs text-gray-400 mb-1">Day 2 datetime (UTC)</label>
        <input
          data-testid="edit-series-day2-datetime-input"
          type="datetime-local"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
        />

        <div className="mb-3">
          <label className="block text-xs text-gray-400 mb-1">Stack mode</label>
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-sm text-gray-200">
              <input
                data-testid="edit-series-stackmode-single"
                type="radio"
                checked={stackMode === 'single'}
                onChange={() => handleStackChange('single')}
              />
              Single
            </label>
            <label className="flex items-center gap-1 text-sm text-gray-200">
              <input
                data-testid="edit-series-stackmode-combined"
                type="radio"
                checked={stackMode === 'combined'}
                onChange={() => handleStackChange('combined')}
              />
              Combined
            </label>
          </div>
          {showStackWarning && (
            <p
              data-testid="edit-series-stackmode-warning"
              className="text-amber-400 text-xs mt-1"
            >
              Aviso: mudar stackMode em serie ja completed afeta P&L retroativo.
            </p>
          )}
        </div>

        <label className="block text-xs text-gray-400 mb-1">Status Day 2</label>
        <select
          data-testid="edit-series-day2-status-input"
          value={day2Status}
          onChange={(e) => setDay2Status(e.target.value as any)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
        >
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <label className="block text-xs text-gray-400 mb-1">Notas</label>
        <textarea
          data-testid="edit-series-notes-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-4"
        />

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            data-testid="edit-series-cancel"
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            data-testid="edit-series-submit"
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditSeriesDialog;
