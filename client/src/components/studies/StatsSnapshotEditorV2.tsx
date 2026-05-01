// =============================================================================
// Sprint Stats-V2 — StatsSnapshotEditorV2 (RF-05)
//
// Snapshot editor com:
//   - Auto-save debounce 1s (POST /api/hud-stat-snapshots)
//   - Paste handler (parse PT4 tab-separated)
//   - CSV upload (parse CSV)
//   - value=null preservado para inputs vazios
//   - Toast Salvo / Erro
// =============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import {
  parsePastedSnapshot,
  parseCsvSnapshot,
} from "@/lib/snapshot-import-parser";

interface EditorField {
  id: string;
  label: string;
  group?: string;
  direction?: string;
  unit?: string;
  targetMin?: number;
  targetMax?: number;
}

interface EditorLayout {
  id: string;
  name: string;
  isCustom?: boolean;
  fields: EditorField[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: EditorLayout;
  onSaved?: (snapshot: any) => void;
}

const DEBOUNCE_MS = 1000;
// MINOR-3 reviewer: bate com o limite server-side em statsAnalyzerImport.ts
// (50KB). Toast destructive imediato evita upload de arquivos grandes.
const MAX_CSV_BYTES = 50 * 1024;

// -----------------------------------------------------------------------------
// FieldInput — uncontrolled input com ref para sync de paste/CSV.
// Uncontrolled evita o skip do React 18 quando "" => "" (controlled inputs
// nao disparam onChange se value tracker ja eh equivalente).
// -----------------------------------------------------------------------------
interface FieldInputProps {
  field: EditorField;
  value: string;
  onChange: (id: string, value: string) => void;
  recentlySaved?: boolean;
}

function FieldInput({ field, value, onChange, recentlySaved }: FieldInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync DOM value quando paste/CSV mudou state externamente
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  // Attach NATIVE change/input listeners via ref. React's synthetic onChange
  // skips when _valueTracker matches DOM value (e.g. "" => ""), but native
  // listeners always fire — necessario para o teste `input vazio` onde
  // fireEvent.change dispara `change` mesmo quando valor nao mudou.
  useEffect(() => {
    const node = inputRef.current;
    if (!node) return;
    const handleInput = () => {
      onChange(field.id, node.value);
    };
    node.addEventListener("input", handleInput);
    node.addEventListener("change", handleInput);
    return () => {
      node.removeEventListener("input", handleInput);
      node.removeEventListener("change", handleInput);
    };
  }, [field.id, onChange]);

  // HIGH-3 UX: indicador visual quando salvo (border-green-500 pulse).
  const savedClass = recentlySaved
    ? "border-green-500 ring-1 ring-green-500/40 transition"
    : "border-poker-border";

  return (
    <label
      className="flex items-center justify-between gap-2 text-sm"
      data-testid={`snapshot-field-${field.id}`}
      data-recently-saved={recentlySaved ? "true" : "false"}
    >
      <span className="truncate">{field.label}</span>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        data-testid={`snapshot-input-${field.id}`}
        defaultValue={value}
        className={`w-24 rounded border bg-poker-bg px-2 py-1 text-sm ${savedClass}`}
        aria-label={field.label}
      />
    </label>
  );
}

export default function StatsSnapshotEditorV2({
  open,
  onOpenChange,
  layout,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, []);

  const buildPayload = useCallback(
    (current: Record<string, string>) => {
      const valuesPayload: Record<string, number | null> = {};
      for (const field of layout.fields) {
        const raw = current[field.id];
        if (raw == null || String(raw).trim() === "") {
          valuesPayload[field.id] = null;
          continue;
        }
        const num = Number(String(raw).replace(",", "."));
        valuesPayload[field.id] = Number.isFinite(num) ? num : null;
      }
      return { layoutId: layout.id, values: valuesPayload };
    },
    [layout.fields, layout.id],
  );

  // HIGH-3 UX: track quando cada field foi recentemente salvo (pulse 500ms).
  const [savedFlash, setSavedFlash] = useState<Record<string, number>>({});
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerSave = useCallback(
    (current: Record<string, string>) => {
      const payload = buildPayload(current);
      const promise = apiRequest("POST", "/api/hud-stat-snapshots", payload);
      // Snapshot dos ids preenchidos no momento do save para flash visual
      const savedIds = Object.keys(current).filter(
        (id) => current[id] != null && String(current[id]).trim() !== "",
      );
      // Trata a promise sem usar async/await — assim o teste com fake timers
      // observa o `apiRequest` sendo chamado ANTES de qualquer await.
      Promise.resolve(promise)
        .then((result: any) => {
          if (!isMountedRef.current) return;
          toast({
            title: "Salvo",
            description: "Snapshot atualizado.",
          });
          onSaved?.(result);
          // HIGH-3 UX: pulse verde nos inputs salvos por 500ms.
          const now = Date.now();
          const next: Record<string, number> = {};
          for (const id of savedIds) next[id] = now;
          setSavedFlash(next);
          if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
          flashTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) setSavedFlash({});
          }, 500);
        })
        .catch((err: any) => {
          if (!isMountedRef.current) return;
          toast({
            title: "Erro ao salvar",
            description:
              err instanceof Error ? err.message : "Falha desconhecida.",
            variant: "destructive",
          });
        });
    },
    [buildPayload, onSaved, toast],
  );

  const scheduleSave = useCallback(
    (next: Record<string, string>) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        triggerSave(next);
      }, DEBOUNCE_MS);
    },
    [triggerSave],
  );

  const valuesRef = useRef<Record<string, string>>({});

  const handleInputChange = useCallback(
    (id: string, value: string) => {
      const next = { ...valuesRef.current, [id]: value };
      valuesRef.current = next;
      setValues(next);
      scheduleSave(next);
    },
    [scheduleSave],
  );

  // HIGH-3 UX: forca save imediato (bypassa debounce). Usado por Ctrl+S.
  const flushSave = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    triggerSave(valuesRef.current);
  }, [triggerSave]);

  // HIGH-3 UX: search bar para filtrar inputs.
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();

  // HIGH-3 UX: accordion por grupo — collapsed manualmente.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleGroupCollapse = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // Agrupa fields por group + aplica search filter
  const groupedFields = useMemo(() => {
    const map = new Map<string, EditorField[]>();
    for (const field of layout.fields) {
      const matches = normalizedSearch
        ? field.id.toLowerCase().includes(normalizedSearch) ||
          field.label.toLowerCase().includes(normalizedSearch)
        : true;
      if (!matches) continue;
      const groupId = field.group || "outros";
      if (!map.has(groupId)) map.set(groupId, []);
      map.get(groupId)!.push(field);
    }
    return map;
  }, [layout.fields, normalizedSearch]);

  const orderedGroupIds = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const field of layout.fields) {
      const groupId = field.group || "outros";
      if (!seen.has(groupId)) {
        seen.add(groupId);
        ordered.push(groupId);
      }
    }
    return ordered.filter((g) => groupedFields.has(g));
  }, [layout.fields, groupedFields]);

  // HIGH-3 UX: progresso "X de N stats reportados"
  const progressStats = useMemo(() => {
    const total = layout.fields.length;
    let filled = 0;
    for (const f of layout.fields) {
      const v = values[f.id];
      if (v != null && String(v).trim() !== "") filled += 1;
    }
    const pct = total === 0 ? 0 : Math.round((filled * 100) / total);
    return { total, filled, pct };
  }, [layout.fields, values]);

  // HIGH-3 UX: Ctrl+S forca save imediato.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        flushSave();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flushSave]);

  const applyParsedValues = useCallback(
    (
      matched: Record<string, number | null>,
      rawValues?: Record<string, string>,
    ) => {
      const next = { ...valuesRef.current };
      for (const [id, val] of Object.entries(matched)) {
        if (val == null) {
          next[id] = "";
        } else if (rawValues?.[id]) {
          next[id] = rawValues[id];
        } else {
          next[id] = String(val);
        }
      }
      valuesRef.current = next;
      setValues(next);
      // MAJOR-3 reviewer: paste/CSV tambem dispara autosave (debounce 1s).
      scheduleSave(next);
    },
    [scheduleSave],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement | HTMLDivElement>) => {
      const text = e.clipboardData?.getData?.("text/plain") ?? "";
      if (!text) return;
      e.preventDefault?.();
      const parsed = parsePastedSnapshot(text);
      applyParsedValues(parsed.matched, parsed.matchedRaw);
      const unmatchedCount = parsed.unmatched.length;
      const invalidCount = parsed.invalid.length;
      if (unmatchedCount > 0 || invalidCount > 0) {
        toast({
          title: "Paste importado parcialmente",
          description: `${unmatchedCount} stats nao reconhecidas, ${invalidCount} valores invalidos.`,
        });
      }
    },
    [applyParsedValues, toast],
  );

  const handleCsvUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      // MINOR-3 reviewer: rejeitar antes do .text() para evitar parsing
      // de arquivos abusivos (>50KB).
      if (file.size > MAX_CSV_BYTES) {
        toast({
          title: "CSV muito grande",
          description: `Limite ${(MAX_CSV_BYTES / 1024).toFixed(0)}KB. Arquivo: ${(file.size / 1024).toFixed(1)}KB.`,
          variant: "destructive",
        });
        return;
      }
      try {
        const text = await file.text();
        const parsed = parseCsvSnapshot(text);
        applyParsedValues(parsed.matched, parsed.matchedRaw);
        toast({
          title: "CSV importado",
          description: `${Object.keys(parsed.matched).length} stats carregadas.`,
        });
      } catch (err) {
        toast({
          title: "Erro ao importar CSV",
          description: err instanceof Error ? err.message : "Falha desconhecida.",
          variant: "destructive",
        });
      }
    },
    [applyParsedValues, toast],
  );

  if (!open) return null;

  return (
    <div
      data-testid="snapshot-editor-v2"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl rounded-lg border border-poker-border bg-poker-card p-0 max-h-[90vh] overflow-y-auto">
        {/* HIGH-3 UX: sticky header com progresso + search */}
        <header
          data-testid="snapshot-editor-sticky-header"
          className="sticky top-0 z-10 bg-poker-card border-b border-poker-border/60 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{layout.name}</h2>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-poker-muted hover:text-poker-fg"
              aria-label="Fechar"
            >
              X
            </button>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-poker-muted">
              <span data-testid="snapshot-progress-label">
                {progressStats.filled} de {progressStats.total} stats reportados
              </span>
              <span>{progressStats.pct}%</span>
            </div>
            <Progress
              value={progressStats.pct}
              data-testid="snapshot-progress-bar"
              aria-label="Progresso de preenchimento"
            />
          </div>
          <input
            type="search"
            data-testid="editor-search"
            placeholder="Buscar stat..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded border border-poker-border bg-poker-bg px-3 py-2 text-sm"
            aria-label="Buscar stat"
          />
        </header>

        <div className="p-6 pt-4">
          <div className="space-y-3 mb-4">
            <div
              data-testid="snapshot-paste-area"
              className="rounded border border-dashed border-poker-border/60 p-3 text-xs text-poker-muted"
              onPaste={handlePaste}
              tabIndex={0}
              role="textbox"
              aria-label="Cole stats do PT4 aqui"
            >
              Cole stats do PT4 aqui (Ctrl+V).
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-poker-muted">
                Importar CSV:
                <input
                  type="file"
                  data-testid="snapshot-csv-upload"
                  accept=".csv,text/csv"
                  onChange={handleCsvUpload}
                  className="ml-2"
                />
              </label>
            </div>
          </div>

          {/* HIGH-3 UX: accordion por grupo */}
          <div className="space-y-3">
            {orderedGroupIds.map((groupId) => {
              const groupFields = groupedFields.get(groupId) ?? [];
              const expanded = !collapsedGroups.has(groupId);
              return (
                <section
                  key={groupId}
                  data-testid={`snapshot-group-${groupId}`}
                  data-collapsed={expanded ? "false" : "true"}
                  className="rounded border border-poker-border/40"
                >
                  <header
                    className="flex items-center justify-between px-3 py-2 cursor-pointer text-sm font-medium"
                    onClick={() => toggleGroupCollapse(groupId)}
                  >
                    <span>
                      {groupId} <span className="text-poker-muted">({groupFields.length})</span>
                    </span>
                    <span aria-hidden="true">{expanded ? "▼" : "▶"}</span>
                  </header>
                  {expanded ? (
                    <div className="px-3 pb-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {groupFields.map((field) => (
                        <FieldInput
                          key={field.id}
                          field={field}
                          value={values[field.id] ?? ""}
                          onChange={handleInputChange}
                          recentlySaved={Boolean(savedFlash[field.id])}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
            {orderedGroupIds.length === 0 ? (
              <div
                data-testid="snapshot-empty-search"
                className="text-sm text-poker-muted py-8 text-center"
              >
                Nenhum stat encontrado para "{search}".
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
