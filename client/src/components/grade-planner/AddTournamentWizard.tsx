/**
 * Sprint Flight-1 RF-17: Wizard manual de torneio refatorado.
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-17)
 *
 * Mudancas vs versao legada:
 *  - REMOVE inputs de flag legados (isFlight, flightDay, flightParentId,
 *    flightAdvanced).
 *  - ADICIONA toggle "Faz parte de uma serie multi-flight?".
 *  - SIM -> dropdown "Linkar existente" / "Criar nova".
 *  - "Criar nova" -> mini-form (name, totalDay1s, day2DateTime, stackMode).
 *  - Submit: usa endpoint POST /api/tournament-series + linka via seriesId.
 */

import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface AddTournamentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SeriesMode = null | 'link' | 'create';

export const AddTournamentWizard: React.FC<AddTournamentWizardProps> = ({
  open,
  onOpenChange,
}) => {
  const [seriesEnabled, setSeriesEnabled] = useState(false);
  const [seriesMode, setSeriesMode] = useState<SeriesMode>(null);
  const [newSeriesName, setNewSeriesName] = useState("");
  const [newSeriesTotalDay1s, setNewSeriesTotalDay1s] = useState(1);
  const [newSeriesDateTime, setNewSeriesDateTime] = useState("");
  const [newSeriesStackMode, setNewSeriesStackMode] = useState<'single' | 'combined'>('single');
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function toggleSeries(): void {
    setSeriesEnabled((prev) => !prev);
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    try {
      let createdSeriesId: string | null = null;
      if (seriesEnabled && seriesMode === 'create') {
        const series: any = await apiRequest("POST", "/api/tournament-series", {
          name: newSeriesName || "Serie",
          totalDay1s: newSeriesTotalDay1s,
          day2DateTime: newSeriesDateTime
            ? new Date(newSeriesDateTime).toISOString()
            : new Date().toISOString(),
          stackMode: newSeriesStackMode,
        });
        createdSeriesId = series?.id ?? null;
      }
      // Cria tournament (single-flight ou linkado a serie).
      await apiRequest("POST", "/api/tournaments", {
        name: "Tournament",
        seriesId: createdSeriesId,
      });
      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-series"] });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-white mb-4">Adicionar tournament</h2>

        <div className="mb-4">
          <button
            data-testid="add-tournament-series-toggle"
            type="button"
            onClick={toggleSeries}
            role="switch"
            aria-checked={seriesEnabled ? "true" : "false"}
            data-state={seriesEnabled ? "checked" : "unchecked"}
            className={`px-3 py-1 text-sm rounded ${
              seriesEnabled ? "bg-green-500/20 text-green-300" : "bg-gray-700 text-gray-300"
            }`}
          >
            Faz parte de uma serie multi-flight?
          </button>
        </div>

        {seriesEnabled && (
          <div className="space-y-3 mb-4 border-l border-gray-700 pl-3">
            <div className="flex gap-2">
              <button
                data-testid="add-tournament-series-mode-link"
                type="button"
                onClick={() => setSeriesMode('link')}
                className={`px-3 py-1 text-xs rounded ${
                  seriesMode === 'link'
                    ? "bg-green-500/20 text-green-300"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                Linkar a serie existente
              </button>
              <button
                data-testid="add-tournament-series-mode-create"
                type="button"
                onClick={() => setSeriesMode('create')}
                className={`px-3 py-1 text-xs rounded ${
                  seriesMode === 'create'
                    ? "bg-green-500/20 text-green-300"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                Criar nova serie
              </button>
            </div>

            {seriesMode === 'create' && (
              <div className="space-y-2">
                <input
                  data-testid="add-tournament-new-series-name"
                  type="text"
                  value={newSeriesName}
                  onChange={(e) => setNewSeriesName(e.target.value)}
                  placeholder="Nome da serie"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                />
                <input
                  data-testid="add-tournament-new-series-total-day1s"
                  type="number"
                  min={0}
                  value={newSeriesTotalDay1s}
                  onChange={(e) =>
                    setNewSeriesTotalDay1s(parseInt(e.target.value, 10) || 0)
                  }
                  placeholder="Total Day 1s"
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                />
                <input
                  data-testid="add-tournament-new-series-day2-datetime"
                  type="datetime-local"
                  value={newSeriesDateTime}
                  onChange={(e) => setNewSeriesDateTime(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                />
                <div className="flex gap-3 text-xs text-gray-200">
                  <label className="flex items-center gap-1">
                    <input
                      data-testid="add-tournament-new-series-stackmode-single"
                      type="radio"
                      checked={newSeriesStackMode === 'single'}
                      onChange={() => setNewSeriesStackMode('single')}
                    />
                    Single
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      data-testid="add-tournament-new-series-stackmode-combined"
                      type="radio"
                      checked={newSeriesStackMode === 'combined'}
                      onChange={() => setNewSeriesStackMode('combined')}
                    />
                    Combined
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Cancelar
          </button>
          <button
            data-testid="add-tournament-submit"
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

export default AddTournamentWizard;
