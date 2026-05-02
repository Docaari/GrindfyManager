// =============================================================================
// Sprint Stats-V3 — HudOcrPreview (RF-10, RF-11)
// Sprint Stats-V3.5 — section badge + override dropdown (ADR-067)
//
// Render grid de stats extraidos pelo OCR + confidence + bulk actions + save.
// V3.5: cada linha mostra badge `Secao: {HUD_GROUP_LABELS[section]}` quando
// section foi detectado. Dropdown de override permite ao user trocar a section
// (17 opcoes: 16 HudGroupId + "Sem secao"). Override re-roda fuzzyMatchStat
// client-side com novo sectionHint, exibindo o novo top match em tempo real.
// Ao salvar via from-ocr, frontend monta `sections: Record<statId, HudGroupId
// | null>` com a section vencedora por statId e envia no body.
// =============================================================================

import React from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HUD_STAT_CATALOG,
  HUD_GROUP_IDS,
  HUD_GROUP_LABELS,
  type HudGroupId,
} from "../../../../../shared/hud-stat-catalog";
import { fuzzyMatchStat } from "../../../../../shared/hud-fuzzy-match";

interface ExtractionStat {
  id: string;
  label: string;
  value: number;
  confidence: number;
  matchedBy: string;
  // V3.5 — section/rawSection auditados pelo backend.
  section?: HudGroupId | null;
  rawSection?: string | null;
}

interface ExtractionUnmatched {
  label: string;
  value: number | string;
  confidence: number;
  section?: HudGroupId | null;
  rawSection?: string | null;
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
  catalogId: string; // pode trocar via dropdown manual OU via override de section
  /**
   * V3.5: section atual (pode ser auto-detectado OR override manual). Quando
   * mudada, dispara re-ranking client-side.
   */
  section: HudGroupId | null;
  /**
   * V3.5 reviewer fix [LOW]: marca true quando user escolheu manualmente um
   * candidato no dropdown de suggestions. Quando true, override de section
   * NAO sobrescreve o catalogId — preserva escolha consciente do user.
   * Sticky (nao reseta ao trocar section novamente).
   */
  manualCatalogPick: boolean;
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
  // MEDIUM-4: state-key inclui index para evitar colisao de label duplicado.
  // Ex: dois raw labels com texto identico (variacao OCR) compartilhariam state
  // antes desta correcao, fazendo um sobrescrever o outro.
  const rowKeyFor = (label: string, index: number) => `${label}-${index}`;
  const [rows, setRows] = React.useState<Record<string, RowState>>(() => {
    const initial: Record<string, RowState> = {};
    for (let i = 0; i < extraction.stats.length; i++) {
      const s = extraction.stats[i];
      initial[rowKeyFor(s.label, i)] = {
        accepted: s.confidence >= 0.7,
        value: typeof s.value === "number" ? s.value : Number(s.value),
        catalogId: s.id,
        section: s.section ?? null,
        manualCatalogPick: false,
      };
    }
    return initial;
  });
  // V3.5 [ICE 36]: refs por rowKey para focar o select ao clicar no badge
  // "Sem secao". Evita query DOM acoplada a data-section-select.
  const sectionSelectRefs = React.useRef<Record<string, HTMLSelectElement | null>>({});
  const { toast } = useToast();

  const updateRow = (rowKey: string, patch: Partial<RowState>) => {
    setRows((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] ?? {
          accepted: false,
          value: 0,
          catalogId: "",
          section: null,
          manualCatalogPick: false,
        }),
        ...patch,
      },
    }));
  };

  /**
   * V3.5: ao alterar a section (override manual), re-roda fuzzyMatchStat
   * client-side com o novo sectionHint para encontrar o novo top match. Se
   * existir candidato in-group com score >= top legacy, troca catalogId pelo
   * novo top. Mantem catalogId original quando dropdown selecionar "Sem secao".
   *
   * Reviewer fix [LOW] V3.5: se user ja fez pick manual no dropdown de
   * suggestions (manualCatalogPick=true), NAO sobrescreve catalogId. Ainda
   * re-roda fuzzy para atualizar `candidates` (ranking secundario), mas a
   * selecao do user prevalece. Sticky — manualCatalogPick nao eh resetado
   * ao trocar section novamente.
   */
  const handleSectionOverride = (
    rowKey: string,
    rawLabel: string,
    nextSection: HudGroupId | null,
  ) => {
    const candidates = fuzzyMatchStat(rawLabel, HUD_STAT_CATALOG, {
      maxResults: 5,
      sectionHint: nextSection,
    });
    const top = candidates[0];
    setRows((prev) => {
      const current =
        prev[rowKey] ??
        ({
          accepted: false,
          value: 0,
          catalogId: "",
          section: null,
          manualCatalogPick: false,
        } as RowState);
      // Se user ja escolheu manualmente um candidato, preservar catalogId.
      const shouldUpdateCatalogId =
        !current.manualCatalogPick && top !== undefined;
      return {
        ...prev,
        [rowKey]: {
          ...current,
          section: nextSection,
          ...(shouldUpdateCatalogId ? { catalogId: top!.statId } : {}),
        },
      };
    });
  };

  const bulkAcceptHigh = () => {
    setRows((prev) => {
      const next: Record<string, RowState> = { ...prev };
      for (let i = 0; i < extraction.stats.length; i++) {
        const s = extraction.stats[i];
        const k = rowKeyFor(s.label, i);
        if (s.confidence >= 0.9) {
          const existing: RowState = next[k] ?? {
            accepted: false,
            value:
              typeof s.value === "number" ? s.value : Number(s.value),
            catalogId: s.id,
            section: s.section ?? null,
            manualCatalogPick: false,
          };
          next[k] = { ...existing, accepted: true };
        }
      }
      return next;
    });
  };

  const bulkRejectLow = () => {
    setRows((prev) => {
      const next: Record<string, RowState> = { ...prev };
      for (let i = 0; i < extraction.stats.length; i++) {
        const s = extraction.stats[i];
        const k = rowKeyFor(s.label, i);
        if (s.confidence < 0.7) {
          const existing: RowState = next[k] ?? {
            accepted: false,
            value:
              typeof s.value === "number" ? s.value : Number(s.value),
            catalogId: s.id,
            section: s.section ?? null,
            manualCatalogPick: false,
          };
          next[k] = { ...existing, accepted: false };
        }
      }
      return next;
    });
  };

  const handleSave = async () => {
    // Construir values map a partir das rows aceitas
    const values: Record<string, number> = {};
    const ocrConfidence: Record<string, number> = {};
    // V3.5: sections map (statId -> HudGroupId | null) com a section vencedora
    // por stat (auto-detectado OU override). Persistido em ocrRawResponse.sections.
    const sections: Record<string, HudGroupId | null> = {};
    for (let i = 0; i < extraction.stats.length; i++) {
      const s = extraction.stats[i];
      const r = rows[rowKeyFor(s.label, i)];
      if (r?.accepted && r.catalogId) {
        values[r.catalogId] = r.value;
        ocrConfidence[r.catalogId] = s.confidence;
        sections[r.catalogId] = r.section;
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
          sections,
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
        {extraction.stats.map((s, i) => {
          const rowKey = rowKeyFor(s.label, i);
          const r: RowState =
            rows[rowKey] ??
            {
              accepted: false,
              value: s.value,
              catalogId: s.id,
              section: s.section ?? null,
              manualCatalogPick: false,
            };
          const showSuggestions = s.matchedBy === "fuzzy_lev" || s.matchedBy === "fuzzy_substring";
          // V3.5: section atual (state) ou fallback para section vinda do backend.
          const currentSection: HudGroupId | null = r.section ?? s.section ?? null;
          const sectionLabel = currentSection
            ? HUD_GROUP_LABELS[currentSection]
            : "Sem secao";
          const sectionBadgeClass = currentSection
            ? "bg-emerald-900/40 text-emerald-200 border-emerald-700"
            : "bg-slate-800 text-slate-400 border-slate-700";
          // WIN 7 — Detectar match alterado manualmente + value out-of-range para o
          // novo target. Lookup do catalog (min/max) e do match original (s.id).
          const matchChanged = r.catalogId !== s.id;
          const catalogStat = HUD_STAT_CATALOG.find((c) => c.id === r.catalogId);
          const numericValue =
            typeof r.value === "number" ? r.value : Number(r.value);
          const valueOutOfRange =
            !!catalogStat &&
            Number.isFinite(numericValue) &&
            (numericValue < catalogStat.targetMin ||
              numericValue > catalogStat.targetMax);
          const valueInputClass = `col-span-2 bg-slate-800 border rounded px-2 py-0.5 text-xs text-slate-100 ${
            matchChanged && valueOutOfRange
              ? "border-red-500"
              : "border-slate-700"
          }`;
          const valueInputTitle =
            matchChanged && valueOutOfRange && catalogStat
              ? `Esperado ${catalogStat.targetMin}-${catalogStat.targetMax}`
              : undefined;
          return (
            <div
              key={rowKey}
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
                  updateRow(rowKey, { value: Number(e.target.value) })
                }
                title={valueInputTitle}
                className={valueInputClass}
              />
              {showSuggestions ? (
                <select
                  data-testid={`ocr-preview-match-${s.label}`}
                  value={r.catalogId}
                  onChange={(e) =>
                    updateRow(rowKey, {
                      catalogId: e.target.value,
                      // V3.5 reviewer fix [LOW]: marca pick manual sticky.
                      manualCatalogPick: true,
                    })
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
                onChange={(e) => updateRow(rowKey, { accepted: e.target.checked })}
                className="col-span-1"
              />
              {matchChanged && (
                <span
                  data-testid={`ocr-preview-match-warning-${s.label}`}
                  className="col-span-12 text-[10px] text-amber-400"
                >
                  [!] Match alterado manualmente - confira valor
                </span>
              )}
              {/* V3.5 [ICE 24]: aviso para low-confidence sem section. */}
              {s.confidence < 0.7 && !currentSection && (
                <span
                  data-testid={`ocr-preview-low-conf-no-section-${s.label}`}
                  className="col-span-12 text-[10px] text-amber-400"
                >
                  Defina secao para melhorar match
                </span>
              )}
              {/* V3.5 (ADR-067): badge de section + dropdown override.
                  V3.5 melhorias UX: badge auto-explicativa+clicavel (ICE 36),
                  a11y aria-label/role/live (ICE 27), indicador de override
                  + reset auto (ICE 18), tooltip shadcn no badge (ICE 22.5). */}
              <div
                data-testid={`ocr-preview-section-${s.label}`}
                className="col-span-12 flex items-center gap-2 pt-1 border-t border-slate-800/60"
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      {currentSection ? (
                        <span
                          data-testid={`ocr-preview-section-badge-${s.label}`}
                          role="status"
                          aria-live="polite"
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${sectionBadgeClass}`}
                        >
                          Secao: {sectionLabel}
                        </span>
                      ) : (
                        <button
                          type="button"
                          data-testid={`ocr-preview-section-badge-${s.label}`}
                          aria-label="Definir secao manualmente"
                          onClick={() => sectionSelectRefs.current[rowKey]?.focus()}
                          className={`text-[10px] px-1.5 py-0.5 rounded border ${sectionBadgeClass}`}
                        >
                          Secao: Secao nao detectada — clique para definir
                        </button>
                      )}
                    </TooltipTrigger>
                    <TooltipContent>
                      {s.rawSection
                        ? `Heading detectado: "${s.rawSection}"`
                        : "Nenhum heading detectado pelo OCR"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* V3.5 [ICE 18]: indicador de override + reset auto. */}
                {currentSection !== (s.section ?? null) && (
                  <>
                    <span
                      data-testid={`ocr-preview-section-override-indicator-${s.label}`}
                      className="w-1.5 h-1.5 rounded-full bg-amber-400"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      data-testid={`ocr-preview-section-reset-${s.label}`}
                      aria-label="Restaurar secao auto-detectada"
                      onClick={() =>
                        handleSectionOverride(rowKey, s.label, s.section ?? null)
                      }
                      className="text-[10px] text-amber-400 hover:text-amber-300"
                    >
                      ↺
                    </button>
                  </>
                )}
                <select
                  ref={(el) => {
                    sectionSelectRefs.current[rowKey] = el;
                  }}
                  data-testid={`ocr-preview-section-override-${s.label}`}
                  data-section-select={rowKey}
                  aria-label={`Secao de ${s.label}`}
                  value={currentSection ?? ""}
                  onChange={(e) =>
                    handleSectionOverride(
                      rowKey,
                      s.label,
                      e.target.value === ""
                        ? null
                        : (e.target.value as HudGroupId),
                    )
                  }
                  className="bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[10px] text-slate-200"
                >
                  <option value="">Sem secao</option>
                  {HUD_GROUP_IDS.map((g) => (
                    <option key={g} value={g}>
                      {HUD_GROUP_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>
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
