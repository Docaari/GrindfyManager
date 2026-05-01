// =============================================================================
// Sprint Stats-V3 — HudOcrPreview (RF-10, RF-11)
//
// Render grid de stats extraidos pelo OCR + confidence + bulk actions + save.
// =============================================================================

import React from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { HUD_STAT_CATALOG } from "../../../../../shared/hud-stat-catalog";

interface ExtractionStat {
  id: string;
  label: string;
  value: number;
  confidence: number;
  matchedBy: string;
}

interface ExtractionUnmatched {
  label: string;
  value: number | string;
  confidence: number;
}

export interface ExtractionPayload {
  imageKey: string;
  ocrJobId?: string;
  stats: ExtractionStat[];
  unmatched: ExtractionUnmatched[];
  cached: boolean;
}

export interface HudOcrPreviewProps {
  layoutId: string;
  extraction: ExtractionPayload;
  onSaved: (snapshot: any) => void;
  onCancel: () => void;
}

interface RowState {
  accepted: boolean;
  value: number;
  catalogId: string; // pode trocar via dropdown
}

function confidenceClass(c: number): string {
  if (c >= 0.9) return "bg-emerald-700 text-emerald-100";
  if (c >= 0.7) return "bg-amber-700 text-amber-100";
  return "bg-red-700 text-red-100";
}

export default function HudOcrPreview({
  layoutId,
  extraction,
  onSaved,
  onCancel,
}: HudOcrPreviewProps) {
  const [rows, setRows] = React.useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    for (const s of extraction.stats) {
      initial[s.label] = {
        accepted: s.confidence >= 0.7,
        value: typeof s.value === "number" ? s.value : Number(s.value),
        catalogId: s.id,
      };
    }
    return initial;
  });
  const { toast } = useToast();

  const updateRow = (label: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [label]: { ...(prev[label] ?? { accepted: false, value: 0, catalogId: "" }), ...patch },
    }));
  };

  const bulkAcceptHigh = () => {
    setRows((prev) => {
      const next: Record<string, RowState> = { ...prev };
      for (const s of extraction.stats) {
        if (s.confidence >= 0.9) {
          next[s.label] = { ...(next[s.label] ?? {} as any), accepted: true };
        }
      }
      return next;
    });
  };

  const bulkRejectLow = () => {
    setRows((prev) => {
      const next: Record<string, RowState> = { ...prev };
      for (const s of extraction.stats) {
        if (s.confidence < 0.7) {
          next[s.label] = { ...(next[s.label] ?? {} as any), accepted: false };
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    // Construir values map a partir das rows aceitas
    const values: Record<string, number> = {};
    const ocrConfidence: Record<string, number> = {};
    for (const s of extraction.stats) {
      const r = rows[s.label];
      if (r?.accepted && r.catalogId) {
        values[r.catalogId] = r.value;
        ocrConfidence[r.catalogId] = s.confidence;
      }
    }
    try {
      const result = await apiRequest(
        "POST",
        "/api/stats-analyzer/snapshots/from-ocr",
        {
          layoutId,
          imageKey: extraction.imageKey,
          values,
          ocrConfidence,
          captureMethod: "ocr",
        },
      );
      try {
        queryClient.invalidateQueries({ queryKey: ["hud-stat-snapshots"] });
      } catch {
        /* best effort */
      }
      onSaved(result);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar snapshot OCR",
        description: err?.message ?? "Tente novamente.",
        variant: "destructive" as any,
      });
    }
  };

  const isEmpty = (extraction.stats?.length ?? 0) === 0 && (extraction.unmatched?.length ?? 0) === 0;
  if (isEmpty) {
    return (
      <div
        data-testid="ocr-preview-empty"
        className="p-6 text-center text-slate-400"
      >
        <p className="text-sm">Nenhuma stat foi extraida.</p>
        <p className="text-xs mt-2">Tente uma imagem com mais nitidez.</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 px-3 py-1 text-xs bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
        >
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-slate-900 border border-slate-800 rounded-md max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="text-sm font-semibold text-slate-100">Resultado OCR</h3>
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="ocr-bulk-accept-high"
            onClick={bulkAcceptHigh}
            className="px-2 py-1 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
          >
            Aceitar todos &ge; 0.9
          </button>
          <button
            type="button"
            data-testid="ocr-bulk-reject-low"
            onClick={bulkRejectLow}
            className="px-2 py-1 text-xs bg-red-700 text-white rounded hover:bg-red-600"
          >
            Rejeitar &lt; 0.7
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        {extraction.stats.map((s) => {
          const r = rows[s.label] ?? { accepted: false, value: s.value, catalogId: s.id };
          const showSuggestions = s.matchedBy === "fuzzy_lev" || s.matchedBy === "fuzzy_substring";
          return (
            <div
              key={s.label}
              data-testid={`ocr-preview-row-${s.label}`}
              className="grid grid-cols-12 gap-2 items-center px-2 py-1.5 bg-slate-950 rounded"
            >
              <span
                data-testid={`ocr-confidence-${s.label}`}
                className={`col-span-2 text-[10px] text-center rounded px-1.5 py-0.5 ${confidenceClass(s.confidence)}`}
              >
                {(s.confidence * 100).toFixed(0)}%
              </span>
              <span className="col-span-3 text-xs text-slate-200 truncate">
                {s.label}
              </span>
              <input
                type="number"
                step="0.1"
                data-testid={`ocr-preview-value-${s.label}`}
                value={String(r.value)}
                onChange={(e) =>
                  updateRow(s.label, { value: Number(e.target.value) })
                }
                className="col-span-2 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-100"
              />
              {showSuggestions ? (
                <select
                  data-testid={`ocr-preview-match-${s.label}`}
                  value={r.catalogId}
                  onChange={(e) =>
                    updateRow(s.label, { catalogId: e.target.value })
                  }
                  className="col-span-4 bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-100"
                >
                  {HUD_STAT_CATALOG.map((stat) => (
                    <option key={stat.id} value={stat.id}>
                      {stat.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="col-span-4 text-xs text-slate-400 truncate">
                  → {s.id} ({s.matchedBy})
                </span>
              )}
              <input
                type="checkbox"
                data-testid={`ocr-preview-accept-${s.label}`}
                checked={r.accepted}
                onChange={(e) => updateRow(s.label, { accepted: e.target.checked })}
                className="col-span-1"
              />
            </div>
          );
        })}
      </div>

      {extraction.unmatched && extraction.unmatched.length > 0 && (
        <div
          data-testid="ocr-preview-unmatched"
          className="border-t border-slate-800 pt-2"
        >
          <p className="text-xs text-slate-400 mb-1">Stats sem match no catalogo:</p>
          <ul className="text-xs text-slate-500">
            {extraction.unmatched.map((u, i) => (
              <li key={i}>
                {u.label}: {String(u.value)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-slate-800 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
        >
          Cancelar
        </button>
        <button
          type="button"
          data-testid="ocr-preview-save"
          onClick={handleSave}
          className="px-3 py-1.5 text-xs bg-emerald-700 text-white rounded hover:bg-emerald-600"
        >
          Salvar como snapshot
        </button>
      </div>
    </div>
  );
}
