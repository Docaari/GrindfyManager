/**
 * Sprint Flight-1 RF-13: BackfillSeriesDialog (criar serie retroativa).
 *
 * Spec: docs/specs/sprint-flight-1.md (RF-13)
 *
 * Etapas:
 *  1. Form: criar serie via POST /api/tournament-series.
 *  2. Multi-select tournaments existentes + N PATCHs /api/tournaments/:id.
 */

import React, { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface BackfillSeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Helper test prop: pre-seleciona IDs para Etapa 2. */
  defaultSelectedTournamentIds?: string[];
}

export const BackfillSeriesDialog: React.FC<BackfillSeriesDialogProps> = ({
  open,
  onOpenChange,
  defaultSelectedTournamentIds = [],
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [network, setNetwork] = useState("PokerStars");
  const [totalDay1s, setTotalDay1s] = useState(1);
  const [day2DateTime, setDay2DateTime] = useState("");
  const [stackMode, setStackMode] = useState<'single' | 'combined'>('single');
  const [createdSeriesId, setCreatedSeriesId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>(defaultSelectedTournamentIds);
  const [partialFailures, setPartialFailures] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) return null;

  async function handleCreateSeries(): Promise<void> {
    setIsSubmitting(true);
    try {
      const body: any = {
        name: name || "Serie",
        network,
        totalDay1s,
        day2DateTime: day2DateTime
          ? new Date(day2DateTime).toISOString()
          : new Date().toISOString(),
        stackMode,
      };
      const created: any = await apiRequest("POST", "/api/tournament-series", body);
      setCreatedSeriesId(created?.id ?? null);
      setStep(2);
      queryClient.invalidateQueries({ queryKey: ["tournament-series"] });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLinkTournaments(): Promise<void> {
    if (!createdSeriesId) return;
    const failures: string[] = [];
    await Promise.all(
      selected.map(async (tid) => {
        try {
          await apiRequest("PATCH", `/api/tournaments/${tid}`, {
            seriesId: createdSeriesId,
          });
        } catch {
          failures.push(tid);
        }
      }),
    );
    if (failures.length > 0) {
      setPartialFailures(failures);
    } else {
      onOpenChange(false);
    }
    queryClient.invalidateQueries({ queryKey: ["tournaments"] });
  }

  return (
    <div data-testid="backfill-series-dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-white mb-4">
          Adicionar Series Retroativo
        </h2>

        {step === 1 && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Nome</label>
            <input
              data-testid="backfill-series-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
            />
            <label className="block text-xs text-gray-400 mb-1">Network</label>
            <input
              data-testid="backfill-series-network-input"
              type="text"
              value={network}
              onChange={(e) => setNetwork(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
            />
            <label className="block text-xs text-gray-400 mb-1">Total Day 1s</label>
            <input
              data-testid="backfill-series-total-day1s-input"
              type="number"
              min={0}
              value={totalDay1s}
              onChange={(e) => setTotalDay1s(parseInt(e.target.value, 10) || 0)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
            />
            <label className="block text-xs text-gray-400 mb-1">Day 2 datetime</label>
            <input
              data-testid="backfill-series-day2-datetime-input"
              type="datetime-local"
              value={day2DateTime}
              onChange={(e) => setDay2DateTime(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-3"
            />
            <div className="mb-4">
              <label className="block text-xs text-gray-400 mb-1">Stack mode</label>
              <div className="flex gap-2">
                <label className="flex items-center gap-1 text-sm text-gray-200">
                  <input
                    data-testid="backfill-series-stackmode-single"
                    type="radio"
                    checked={stackMode === 'single'}
                    onChange={() => setStackMode('single')}
                  />
                  Single
                </label>
                <label className="flex items-center gap-1 text-sm text-gray-200">
                  <input
                    data-testid="backfill-series-stackmode-combined"
                    type="radio"
                    checked={stackMode === 'combined'}
                    onChange={() => setStackMode('combined')}
                  />
                  Combined
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                data-testid="backfill-series-create-step1-btn"
                type="button"
                onClick={handleCreateSeries}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                Criar serie + Avancar
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm text-gray-300 mb-3">
              Serie criada. Selecione tournaments para linkar.
            </p>
            <div data-testid="backfill-series-multiselect" className="mb-4">
              {selected.length === 0 ? (
                <p className="text-xs text-gray-500">Nenhum tournament selecionado.</p>
              ) : (
                <ul className="text-xs text-gray-200 space-y-1">
                  {selected.map((id) => (
                    <li key={id}>{id}</li>
                  ))}
                </ul>
              )}
            </div>
            {partialFailures.length > 0 && (
              <p
                data-testid="backfill-series-partial-warning"
                className="text-amber-400 text-xs mb-3"
              >
                Falha em {partialFailures.length} link(s): {partialFailures.join(", ")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="px-4 py-2 text-sm text-gray-300 hover:text-white"
              >
                Fechar
              </button>
              <button
                data-testid="backfill-series-link-btn"
                type="button"
                onClick={handleLinkTournaments}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Linkar tournaments
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BackfillSeriesDialog;
