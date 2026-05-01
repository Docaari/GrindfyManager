// =============================================================================
// Sprint F3 + Stats-V3 — Stats Analyzer (root tab)
// Spec V1: Docs/specs/sprint-f3-stats-analyzer.md
// Spec V3: docs/specs/sprint-stats-v3.md
// =============================================================================

import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, BarChart3, Settings, GitCompare, ScanLine, ListOrdered } from "lucide-react";
import StatsSnapshotEditor, {
  type HudLayout,
} from "./StatsSnapshotEditor";
import StatsSnapshotList, {
  type HudStatSnapshot,
} from "./StatsSnapshotList";
import HudLayoutCustomizer from "./HudLayoutCustomizer";
import SnapshotComparator from "./SnapshotComparator";
import StatsWizardFirstUse from "./StatsWizardFirstUse";
import HudGroupedView from "./stats/HudGroupedView";
import HudFilters, { type HudFiltersState } from "./stats/HudFilters";
import HudComparisonView, {
  type CompareResponse,
} from "./stats/HudComparisonView";
import HudOcrUpload from "./stats/HudOcrUpload";
import HudOcrPreview, {
  type ExtractionPayload,
} from "./stats/HudOcrPreview";
import HudCustomStatDialog from "./stats/HudCustomStatDialog";
import { HUD_GROUP_IDS, type HudGroupId } from "@shared/hud-stat-catalog";

type ViewMode = "list" | "grouped" | "compare" | "ocr";

export default function StatsAnalyzerTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [customizerMode, setCustomizerMode] = useState<"create" | "edit">("create");
  const [customizerLayout, setCustomizerLayout] = useState<HudLayout | null>(null);
  const [comparatorOpen, setComparatorOpen] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [filterLayoutId, setFilterLayoutId] = useState<string>("__all__");
  const [view, setView] = useState<ViewMode>("grouped");
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);
  const [filters, setFilters] = useState<HudFiltersState>({
    searchQuery: "",
    activeGroups: new Set<HudGroupId>(HUD_GROUP_IDS),
    preset: null,
  });

  const [extraction, setExtraction] = useState<ExtractionPayload | null>(null);
  const [customStatOpen, setCustomStatOpen] = useState(false);
  const [customStatGroup, setCustomStatGroup] = useState<HudGroupId>("basics");
  const [compareSnap1, setCompareSnap1] = useState<string>("");
  const [compareSnap2, setCompareSnap2] = useState<string>("");

  const layoutsQuery = useQuery<HudLayout[]>({
    queryKey: ["/api/hud-layouts"],
  });
  const layouts = layoutsQuery.data ?? [];

  // RF-08: wizard primeiro uso quando layouts.length === 0 apos load
  useEffect(() => {
    if (
      !layoutsQuery.isLoading &&
      layoutsQuery.isSuccess &&
      layouts.length === 0 &&
      !wizardOpen
    ) {
      setWizardOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutsQuery.isLoading, layoutsQuery.isSuccess, layouts.length]);

  const snapshotsQuery = useQuery<HudStatSnapshot[]>({
    queryKey: [
      "/api/hud-stat-snapshots",
      filterLayoutId === "__all__" ? null : filterLayoutId,
    ],
    queryFn: async () => {
      const url =
        filterLayoutId === "__all__"
          ? "/api/hud-stat-snapshots"
          : `/api/hud-stat-snapshots?layoutId=${encodeURIComponent(
              filterLayoutId,
            )}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao carregar snapshots.");
      return res.json();
    },
  });
  const snapshots = snapshotsQuery.data ?? [];

  const defaultLayout = useMemo(
    () => layouts.find((l) => l.isDefault) ?? layouts[0] ?? null,
    [layouts],
  );

  // Snapshot ativo para grouped view: ultimo se nenhum selecionado
  const activeSnapshot = useMemo(() => {
    if (snapshots.length === 0) return null;
    if (activeSnapshotId) {
      return snapshots.find((s) => s.id === activeSnapshotId) ?? snapshots[0];
    }
    return snapshots[0];
  }, [snapshots, activeSnapshotId]);

  const activeLayout = useMemo(() => {
    if (!activeSnapshot) return defaultLayout;
    return layouts.find((l) => l.id === activeSnapshot.layoutId) ?? defaultLayout;
  }, [activeSnapshot, layouts, defaultLayout]);

  // Snapshots filtrados pelo layout ativo (compare view)
  const layoutSnapshots = useMemo(() => {
    if (!activeLayout) return [];
    return snapshots
      .filter((s) => s.layoutId === activeLayout.id)
      .map((s) => ({
        id: s.id,
        capturedAt: s.capturedAt,
        source: s.source,
      }));
  }, [snapshots, activeLayout]);

  useEffect(() => {
    if (view !== "compare") return;
    if (layoutSnapshots.length < 2) return;
    if (!compareSnap1 || !layoutSnapshots.find((s) => s.id === compareSnap1)) {
      setCompareSnap1(layoutSnapshots[layoutSnapshots.length - 1].id);
    }
    if (!compareSnap2 || !layoutSnapshots.find((s) => s.id === compareSnap2)) {
      setCompareSnap2(layoutSnapshots[0].id);
    }
  }, [view, layoutSnapshots, compareSnap1, compareSnap2]);

  const compareQuery = useQuery<CompareResponse | null>({
    queryKey: [
      "/api/stats-analyzer/snapshots/compare",
      activeLayout?.id,
      compareSnap1,
      compareSnap2,
    ],
    enabled:
      view === "compare" &&
      !!activeLayout?.id &&
      !!compareSnap1 &&
      !!compareSnap2 &&
      compareSnap1 !== compareSnap2,
    queryFn: async () => {
      const url = `/api/stats-analyzer/snapshots/compare?layoutId=${encodeURIComponent(activeLayout!.id)}&snap1=${encodeURIComponent(compareSnap1)}&snap2=${encodeURIComponent(compareSnap2)}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Falha ao comparar snapshots.");
      return res.json();
    },
  });

  const deleteSnapshot = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/hud-stat-snapshots/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hud-stat-snapshots"] });
      toast({ title: "Snapshot removido" });
    },
    onError: (err: any) => {
      toast({
        title: "Erro",
        description: err?.message ?? "Falha ao remover.",
        variant: "destructive",
      });
    },
  });

  const isLoading = layoutsQuery.isLoading || snapshotsQuery.isLoading;

  return (
    <div className="space-y-5" data-testid="stats-analyzer-tab">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-poker-accent" />
            Stats Analyzer
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Registre stats HUD do seu tracker e compare evolucao.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            data-testid="stats-customize-layout"
            variant="outline"
            onClick={() => {
              setCustomizerMode("create");
              setCustomizerLayout(null);
              setCustomizerOpen(true);
            }}
            className="border-gray-700 text-gray-200"
          >
            <Settings className="w-4 h-4 mr-2" />
            Novo layout
          </Button>
          <Button
            data-testid="stats-new-snapshot"
            onClick={() => setEditorOpen(true)}
            disabled={!defaultLayout}
            className="bg-[#16a249] text-black font-semibold hover:bg-poker-accent/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Novo snapshot manual
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 bg-gray-700 rounded" />
          ))}
        </div>
      ) : layouts.length === 0 ? (
        <div
          data-testid="stats-no-layouts"
          className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6 text-center"
        >
          <p className="text-gray-400 text-sm">
            Nenhum layout encontrado. Use um template para comecar.
          </p>
        </div>
      ) : (
        <>
          {/* View tabs */}
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 pb-2">
            <button
              data-testid="stats-view-grouped"
              onClick={() => setView("grouped")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                view === "grouped"
                  ? "bg-poker-accent text-black font-semibold"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <BarChart3 className="w-4 h-4 inline mr-1" />
              Hand2Note view
            </button>
            <button
              data-testid="stats-view-ocr"
              onClick={() => setView("ocr")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                view === "ocr"
                  ? "bg-poker-accent text-black font-semibold"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <ScanLine className="w-4 h-4 inline mr-1" />
              Capturar via print
            </button>
            <button
              data-testid="stats-view-compare"
              onClick={() => setView("compare")}
              disabled={layoutSnapshots.length < 2}
              className={`px-3 py-1.5 text-sm rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
                view === "compare"
                  ? "bg-poker-accent text-black font-semibold"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <GitCompare className="w-4 h-4 inline mr-1" />
              Comparar 3-way
            </button>
            <button
              data-testid="stats-view-list"
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-sm rounded-md transition ${
                view === "list"
                  ? "bg-poker-accent text-black font-semibold"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              <ListOrdered className="w-4 h-4 inline mr-1" />
              Lista
            </button>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">Filtrar layout:</span>
              <Select
                value={filterLayoutId}
                onValueChange={setFilterLayoutId}
              >
                <SelectTrigger
                  data-testid="stats-filter-layout"
                  className="w-56 bg-gray-800 border-gray-700 text-white"
                >
                  <SelectValue placeholder="Todos os layouts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os layouts</SelectItem>
                  {layouts.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                      {l.isDefault ? " (default)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active snapshot selector — visible em grouped view */}
          {view === "grouped" && snapshots.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs text-gray-500">Snapshot:</span>
              <Select
                value={activeSnapshot?.id ?? ""}
                onValueChange={(v) => setActiveSnapshotId(v)}
              >
                <SelectTrigger
                  data-testid="stats-active-snapshot"
                  className="w-72 bg-gray-800 border-gray-700 text-white"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {snapshots.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {new Date(s.capturedAt).toLocaleString("pt-BR")} ({s.source})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Filters bar — grouped + compare */}
          {(view === "grouped" || view === "compare") && (
            <HudFilters
              filters={filters}
              onChange={setFilters}
              snapshot={activeSnapshot ?? null}
            />
          )}

          {/* GROUPED VIEW */}
          {view === "grouped" && activeLayout && activeSnapshot && (
            <HudGroupedView
              layout={activeLayout as any}
              snapshot={activeSnapshot as any}
              filters={filters}
              comparisonMode="single"
              onAddCustom={(g) => {
                setCustomStatGroup(g);
                setCustomStatOpen(true);
              }}
            />
          )}
          {view === "grouped" && (!activeLayout || !activeSnapshot) && (
            <div
              data-testid="stats-grouped-empty"
              className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-8 text-center"
            >
              <p className="text-gray-400 text-sm mb-3">
                Crie seu primeiro snapshot para ver o layout Hand2Note.
              </p>
              <Button
                onClick={() => setView("ocr")}
                className="bg-poker-accent text-black"
              >
                <ScanLine className="w-4 h-4 mr-2" />
                Capturar via print
              </Button>
            </div>
          )}

          {/* OCR VIEW */}
          {view === "ocr" && activeLayout && (
            <div className="space-y-4">
              {!extraction ? (
                <HudOcrUpload
                  layoutId={activeLayout.id}
                  onExtracted={(ex) => setExtraction(ex)}
                />
              ) : (
                <HudOcrPreview
                  layoutId={activeLayout.id}
                  extraction={extraction}
                  onSaved={() => {
                    setExtraction(null);
                    queryClient.invalidateQueries({
                      queryKey: ["/api/hud-stat-snapshots"],
                    });
                    setView("grouped");
                    toast({ title: "Snapshot OCR salvo!" });
                  }}
                  onCancel={() => setExtraction(null)}
                />
              )}
            </div>
          )}

          {/* COMPARE 3-WAY VIEW */}
          {view === "compare" && activeLayout && (
            <HudComparisonView
              layoutId={activeLayout.id}
              snapshots={layoutSnapshots}
              selectedSnap1Id={compareSnap1}
              selectedSnap2Id={compareSnap2}
              onSelectSnap1={setCompareSnap1}
              onSelectSnap2={setCompareSnap2}
              compareResponse={compareQuery.data ?? null}
            />
          )}

          {/* LIST VIEW (legacy) */}
          {view === "list" && (
            <>
              {compareSelection.length === 2 && (
                <div
                  data-testid="compare-bar"
                  className="bg-gray-800/80 border border-poker-accent/40 rounded-md px-3 py-2 flex items-center justify-between"
                >
                  <span className="text-sm text-gray-200">
                    2 snapshots selecionados
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setCompareSelection([])}
                      data-testid="compare-clear"
                    >
                      Limpar
                    </Button>
                    <Button
                      size="sm"
                      data-testid="compare-open"
                      onClick={() => setComparatorOpen(true)}
                      className="bg-poker-accent text-black"
                    >
                      <GitCompare className="w-4 h-4 mr-1" />
                      Comparar
                    </Button>
                  </div>
                </div>
              )}

              <StatsSnapshotList
                snapshots={snapshots}
                layouts={layouts}
                onDelete={(id) => deleteSnapshot.mutate(id)}
                onCompare={(id) => {
                  setCompareSelection((sel) => {
                    if (sel.includes(id)) return sel.filter((x) => x !== id);
                    if (sel.length >= 2) return [sel[1], id];
                    return [...sel, id];
                  });
                }}
                selectedForCompare={compareSelection}
              />
            </>
          )}
        </>
      )}

      <StatsSnapshotEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        layout={defaultLayout}
      />
      <HudLayoutCustomizer
        open={customizerOpen}
        onOpenChange={setCustomizerOpen}
        layout={customizerLayout}
        mode={customizerMode}
      />
      <SnapshotComparator
        open={comparatorOpen}
        onOpenChange={setComparatorOpen}
        ids={
          compareSelection.length === 2
            ? [compareSelection[0], compareSelection[1]]
            : null
        }
      />
      <StatsWizardFirstUse
        open={wizardOpen}
        onOpenChange={setWizardOpen}
      />

      {activeLayout && (
        <HudCustomStatDialog
          layoutId={activeLayout.id}
          groupId={customStatGroup}
          open={customStatOpen}
          onOpenChange={setCustomStatOpen}
          onCreated={() => {
            queryClient.invalidateQueries({
              queryKey: ["/api/hud-layouts"],
            });
          }}
        />
      )}

    </div>
  );
}
