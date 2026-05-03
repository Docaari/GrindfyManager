/**
 * Sprint Flight-1 RF-11: MarkBaggedDialog (DRY 3 contextos).
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-11, D5)
 *
 * Reusavel em TournamentLibrary, /flight/:id, TournamentDetail.
 */

import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface SeriesProp {
  id: string;
  name?: string;
  network?: string | null;
  day2DateTime?: string | Date | null;
  day2Status?: 'pending' | 'completed' | 'cancelled';
  stackMode?: 'single' | 'combined';
}

interface TournamentProp {
  id: string;
  name?: string;
  seriesId?: string | null;
  baggedAt?: Date | string | null;
}

interface MarkBaggedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series: SeriesProp;
  tournament: TournamentProp;
}

function toDateTimeLocal(value: string | Date | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  // datetime-local format: "YYYY-MM-DDTHH:mm".
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export const MarkBaggedDialog: React.FC<MarkBaggedDialogProps> = ({
  open,
  onOpenChange,
  series,
  tournament,
}) => {
  const [datetime, setDatetime] = useState<string>(toDateTimeLocal(series.day2DateTime));
  const [stackMode, setStackMode] = useState<'single' | 'combined'>(series.stackMode ?? 'single');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      const body: any = { tournamentId: tournament.id };
      if (datetime) body.day2DateTime = new Date(datetime).toISOString();
      if (stackMode) body.stackMode = stackMode;
      await apiRequest("POST", `/api/tournament-series/${series.id}/mark-bagged`, body);
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-series"] });
      queryClient.invalidateQueries({ queryKey: ["planned-tournaments"] });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? "Erro");
      // 409 mantem dialog aberto.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="mark-bagged-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-white mb-4">
          Marcar Day 1 bagged
        </h2>
        <p className="text-sm text-gray-400 mb-4">{tournament.name ?? tournament.id}</p>

        <label className="block text-xs text-gray-400 mb-1">Data/hora Day 2</label>
        <input
          data-testid="mark-bagged-day2-datetime"
          type="datetime-local"
          value={datetime}
          onChange={(e) => setDatetime(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-4"
        />

        <div data-testid="mark-bagged-stackmode" className="mb-4">
          <label className="block text-xs text-gray-400 mb-1">Stack mode</label>
          <div className="flex gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="radio"
                value="single"
                checked={stackMode === 'single'}
                onChange={() => setStackMode('single')}
              />
              Single
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-200">
              <input
                type="radio"
                value="combined"
                checked={stackMode === 'combined'}
                onChange={() => setStackMode('combined')}
              />
              Combined
            </label>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            data-testid="mark-bagged-cancel"
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            data-testid="mark-bagged-submit"
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarkBaggedDialog;
