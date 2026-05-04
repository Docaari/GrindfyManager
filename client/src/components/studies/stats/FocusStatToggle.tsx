/**
 * Sprint home-reform-4 / Item 7 — RF-05.
 *
 * Botao para marcar/desmarcar uma stat HUD como foco do mes corrente.
 * Renderizado em cada stat row do StatsAnalyzerTab (HudGroupedView, list view).
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-05
 * ADRs : 116, 118
 *
 * 3 estados visuais:
 *   1. Nao marcada + slot disponivel (<3 marcacoes): outline + icone Star
 *      vazio. Click abre dialog.
 *   2. Nao marcada + slot lotado (3 marcacoes): disabled + tooltip.
 *   3. Marcada: estado solid (Star fill amber) + tooltip com nome do tema.
 *      Renderiza botao "Remover foco" auxiliar.
 *
 * Lessons aplicadas:
 *   #1  hooks ANTES de early return
 *   #2  data-testid estaveis
 *   #11 sem actions decorativas
 *   #13 apiRequest retorna JSON parseado
 *
 * MEDIUM-5 reviewer: substitui placeholders [F]/[ ] por <Star /> lucide;
 * troca `title=` nativo por Radix <Tooltip>. INFO-19 reviewer: skeleton
 * inline durante loading evita layout shift.
 */

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import FocusStatThemePickerDialog from "./FocusStatThemePickerDialog";

interface FocusStatItem {
  id: string;
  statId: string;
  statLabel: string;
  theme: { id: string; name: string } | null;
}

interface FocusStatsResponse {
  month: string;
  previousMonth: string;
  items: FocusStatItem[];
  meta: { limitReached: boolean; generatedAt: string };
}

interface Props {
  statId: string;
  statLabel: string;
}

export default function FocusStatToggle({ statId, statLabel }: Props): JSX.Element {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<FocusStatsResponse>({
    queryKey: ["/api/home/focus-stats"],
    queryFn: () => apiRequest("GET", "/api/home/focus-stats"),
    staleTime: 30_000,
  });

  const items = Array.isArray(data?.items) ? data!.items : [];
  const existingItem = items.find((i) => i.statId === statId) ?? null;
  const limitReached = items.length >= 3;
  const isMarked = existingItem !== null;
  const themeName = existingItem?.theme?.name ?? "";

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/focus-stats/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/home/focus-stats"] });
      toast({ title: "Stat removida do foco" });
    },
    onError: () => {
      toast({
        title: "Erro ao remover foco",
        variant: "destructive",
      });
    },
  });

  // INFO-19 reviewer: skeleton inline com mesmo footprint visual do botao
  // pra evitar layout shift quando data carrega.
  if (isLoading || data === undefined) {
    return (
      <span
        data-testid="focus-stat-toggle-skeleton"
        className="inline-block w-24 h-7 bg-muted/40 animate-pulse rounded"
        aria-hidden
      />
    );
  }

  if (isMarked) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="inline-flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                data-testid={`focus-stat-toggle-${statId}`}
                aria-pressed="true"
                aria-label={`Foco do mes — tema: ${themeName}`}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              >
                <Star className="w-3.5 h-3.5" fill="currentColor" aria-hidden />
                Foco do mes
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <span>Foco do mes — tema: {themeName}</span>
            </TooltipContent>
          </Tooltip>
          <button
            type="button"
            data-testid={`focus-stat-remove-${statId}`}
            aria-label="Remover foco"
            onClick={() => existingItem && removeMutation.mutate(existingItem.id)}
            disabled={removeMutation.isPending}
            className="text-xs underline text-muted-foreground hover:text-foreground"
          >
            Remover
          </button>
        </div>
      </TooltipProvider>
    );
  }

  const disabled = limitReached;
  const tooltipText = disabled
    ? "Voce ja tem 3 stats foco. Remova uma para adicionar."
    : "Marcar como foco do mes";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-testid={`focus-stat-toggle-${statId}`}
            aria-pressed="false"
            aria-disabled={disabled}
            disabled={disabled}
            aria-label={tooltipText}
            onClick={() => {
              if (!disabled) setDialogOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-border hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Star className="w-3.5 h-3.5" aria-hidden />
            Marcar foco
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span>{tooltipText}</span>
        </TooltipContent>
      </Tooltip>
      {dialogOpen ? (
        <FocusStatThemePickerDialog
          open={dialogOpen}
          statId={statId}
          statLabel={statLabel}
          onOpenChange={setDialogOpen}
        />
      ) : null}
    </TooltipProvider>
  );
}
