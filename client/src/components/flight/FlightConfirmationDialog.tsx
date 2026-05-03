/**
 * Sprint Flight-1 RF-09: FlightConfirmationDialog (modal pos-upload).
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-09, D10, D11)
 *
 * Modal descartavel single-shot pos-upload. Lista candidates + form
 * "Criar nova" / "Linkar existente". Cancelar = entries ficam normais.
 */

import React, { useState, useMemo } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export interface FlightConfirmationCandidate {
  tournamentId: string;
  name: string;
  baseName: string;
  flightDay: string | null;
  site?: string;
  datePlayed?: string;
  buyIn?: string;
  suggestedSeriesId?: string | null;
}

interface FlightConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingFlightConfirmations: FlightConfirmationCandidate[];
}

interface RowState {
  isFlight: boolean; // default true
  newSeriesName: string;
  newSeriesTotalDay1s: number;
  newSeriesDateTime: string;
  newSeriesStackMode: 'single' | 'combined';
}

const BATCH_CAP = 50;

export const FlightConfirmationDialog: React.FC<FlightConfirmationDialogProps> = ({
  open,
  onOpenChange,
  pendingFlightConfirmations,
}) => {
  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const c of pendingFlightConfirmations) {
      init[c.tournamentId] = {
        isFlight: true,
        newSeriesName: c.baseName ?? c.name ?? '',
        newSeriesTotalDay1s: 1,
        newSeriesDateTime: '',
        newSeriesStackMode: 'single',
      };
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exceedsCap = pendingFlightConfirmations.length > BATCH_CAP;

  if (!open) return null;

  function toggleIsFlight(id: string): void {
    setRows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isFlight: !prev[id].isFlight },
    }));
  }

  function updateRow(id: string, patch: Partial<RowState>): void {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setError(null);
    try {
      // Quebra em batches de 50 (D11).
      const all = pendingFlightConfirmations.map((c) => {
        const row = rows[c.tournamentId];
        if (!row?.isFlight) {
          return { tournamentId: c.tournamentId, isFlight: false };
        }
        return {
          tournamentId: c.tournamentId,
          isFlight: true,
          seriesId: null,
          newSeries: {
            name: row.newSeriesName || c.baseName || c.name,
            totalDay1s: row.newSeriesTotalDay1s,
            day2DateTime: row.newSeriesDateTime
              ? new Date(row.newSeriesDateTime).toISOString()
              : new Date().toISOString(),
            stackMode: row.newSeriesStackMode,
          },
        };
      });

      const batches: any[][] = [];
      for (let i = 0; i < all.length; i += BATCH_CAP) {
        batches.push(all.slice(i, i + BATCH_CAP));
      }
      for (const batch of batches) {
        await apiRequest("POST", "/api/upload/confirm-flights", {
          confirmations: batch,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["tournament-series"] });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message ?? "Erro");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancel(): void {
    onOpenChange(false);
  }

  return (
    <div data-testid="flight-confirmation-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-semibold text-white mb-4">
          Confirmar series multi-flight
        </h2>

        {exceedsCap && (
          <p
            data-testid="flight-pagination-warning"
            className="text-amber-400 text-xs mb-3"
          >
            {pendingFlightConfirmations.length} candidates detectados — sera enviado em batches de {BATCH_CAP}.
          </p>
        )}

        <div className="space-y-3 mb-4">
          {pendingFlightConfirmations.map((c) => {
            const row = rows[c.tournamentId];
            return (
              <div
                key={c.tournamentId}
                data-testid={`flight-candidate-row-${c.tournamentId}`}
                className="border border-gray-700 rounded p-3 bg-gray-800/40"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm text-white">{c.baseName}</p>
                    <p className="text-xs text-gray-400">
                      {c.flightDay} — {c.site} — {c.buyIn}
                    </p>
                  </div>
                  <button
                    data-testid={`flight-toggle-isflight-${c.tournamentId}`}
                    type="button"
                    role="switch"
                    aria-checked={row?.isFlight ? "true" : "false"}
                    data-state={row?.isFlight ? "checked" : "unchecked"}
                    onClick={() => toggleIsFlight(c.tournamentId)}
                    className={`px-3 py-1 text-xs rounded ${
                      row?.isFlight
                        ? "bg-green-500/20 text-green-300"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {row?.isFlight ? "SIM" : "NAO"}
                  </button>
                </div>

                {row?.isFlight && (
                  <div data-testid={`flight-series-form-${c.tournamentId}`} className="space-y-2 mt-3">
                    <input
                      data-testid={`flight-new-series-name-${c.tournamentId}`}
                      type="text"
                      value={row.newSeriesName}
                      onChange={(e) =>
                        updateRow(c.tournamentId, { newSeriesName: e.target.value })
                      }
                      placeholder="Nome da serie"
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      data-testid={`flight-new-series-total-day1s-${c.tournamentId}`}
                      type="number"
                      min={0}
                      value={row.newSeriesTotalDay1s}
                      onChange={(e) =>
                        updateRow(c.tournamentId, {
                          newSeriesTotalDay1s: parseInt(e.target.value, 10) || 0,
                        })
                      }
                      placeholder="Total Day 1s"
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <input
                      data-testid={`flight-new-series-day2-datetime-${c.tournamentId}`}
                      type="datetime-local"
                      value={row.newSeriesDateTime}
                      onChange={(e) =>
                        updateRow(c.tournamentId, { newSeriesDateTime: e.target.value })
                      }
                      className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                    />
                    <div className="flex gap-3 text-xs text-gray-200">
                      <label className="flex items-center gap-1">
                        <input
                          data-testid={`flight-new-series-stackmode-single-${c.tournamentId}`}
                          type="radio"
                          checked={row.newSeriesStackMode === 'single'}
                          onChange={() =>
                            updateRow(c.tournamentId, { newSeriesStackMode: 'single' })
                          }
                        />
                        Single
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          data-testid={`flight-new-series-stackmode-combined-${c.tournamentId}`}
                          type="radio"
                          checked={row.newSeriesStackMode === 'combined'}
                          onChange={() =>
                            updateRow(c.tournamentId, { newSeriesStackMode: 'combined' })
                          }
                        />
                        Combined
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            data-testid="flight-cancel-btn"
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white"
          >
            Cancelar / Confirmar depois
          </button>
          <button
            data-testid="flight-confirm-all-btn"
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Confirmar todos
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlightConfirmationDialog;
