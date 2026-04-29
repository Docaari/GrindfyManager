// =============================================================================
// Sprint F3 — Stats Analyzer (root tab)
// Spec: Docs/specs/sprint-f3-stats-analyzer.md
// =============================================================================

import { useMemo, useState } from "react";
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
import { Plus, BarChart3, Settings, GitCompare } from "lucide-react";
import StatsSnapshotEditor, {
  type HudLayout,
} from "./StatsSnapshotEditor";
import StatsSnapshotList, {
  type HudStatSnapshot,
} from "./StatsSnapshotList";
import HudLayoutCustomizer from "./HudLayoutCustomizer";
import SnapshotComparator from "./SnapshotComparator";

export default function StatsAnalyzerTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [customizerMode, setCustomizerMode] = useState<"create" | "edit">("create");
  const [customizerLayout, setCustomizerLayout] = useState<HudLayout | null>(null);
  const [comparatorOpen, setComparatorOpen] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [filterLayoutId, setFilterLayoutId] = useState<string>("__all__");

  const layoutsQuery = useQuery<HudLayout[]>({
    queryKey: ["/api/hud-layouts"],
  });
  const layouts = layoutsQuery.data ?? [];

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
            Novo snapshot
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
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Filtrar:</span>
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
    </div>
  );
}
