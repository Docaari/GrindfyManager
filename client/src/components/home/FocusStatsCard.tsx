/**
 * Sprint home-reform-4 / Item 7 — RF-06 (FocusStatsCard).
 *
 * Spec : Docs/specs/home-reform-4-item-7-focus-stats.md §RF-06 + §RF-09
 * ADRs : 116, 117, 118
 *
 * Renderiza 3 stats foco do mes na zona "Estudos" da Home. Estados:
 *   - loading (skeleton)
 *   - empty (CTA "Defina suas 3 stats foco do mes")
 *   - parcial (1/2 items + slots vazios)
 *   - completo (3 items)
 *   - stat removida do catalog (warning + botao remover)
 *   - tema removido (placeholder)
 *
 * Lessons aplicadas:
 *   #1  hooks ANTES de early return
 *   #2  data-testid estaveis
 *   #11 sem actions decorativas
 *   #13 apiRequest retorna JSON parseado
 */

import React, { useEffect, useRef } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { emit } from "@/lib/tracker";
import { tokens } from "@/lib/ui-tokens";

interface FocusStatTheme {
  id: string;
  name: string;
  color: string | null;
  emoji: string | null;
  progress: number | null;
}

interface FocusStatItem {
  id: string;
  statId: string;
  statLabel: string;
  statUnit: string | null;
  currentValue: number | null;
  previousValue: number | null;
  delta: number | null;
  deltaDirection: "improving" | "degrading" | "neutral" | null;
  theme: FocusStatTheme | null;
  studyMinutesMonth: number;
}

interface FocusStatsResponse {
  month: string;
  previousMonth: string;
  items: FocusStatItem[];
  meta: { limitReached: boolean; generatedAt: string };
}

function formatValue(value: number | null, unit: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }
  const fixed = Number.isInteger(value) ? value.toString() : value.toFixed(1);
  if (unit === "pct") return `${fixed}%`;
  if (unit === "bb") return `${fixed} bb`;
  return fixed;
}

function formatDelta(delta: number | null, unit: string | null): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return "—";
  }
  const sign = delta > 0 ? "+" : "";
  const abs = Math.abs(delta);
  const fixed = abs < 10 ? delta.toFixed(1) : delta.toFixed(0);
  const value = `${sign}${fixed}`;
  if (unit === "pct") return `${value}pp`;
  if (unit === "bb") return `${value} bb`;
  return value;
}

function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0min";
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

function deltaColorClass(direction: FocusStatItem["deltaDirection"]): string {
  // LOW-18 reviewer: usa tokens canonicos para consistencia entre KPIs.
  if (direction === "improving") return tokens.color.delta.positive;
  if (direction === "degrading") return tokens.color.delta.negative;
  return tokens.color.delta.neutral;
}

function EmptyFocusStatSlot({ idx }: { idx: number }): JSX.Element {
  return (
    <Link href="/estudos/stats">
      <a
        href="/estudos/stats"
        data-testid={`home-focus-stats-slot-empty-${idx}`}
        onClick={() =>
          emit("focus_stats_cta_define_click", { source: "slot" })
        }
        className="block rounded-md border border-dashed border-border bg-card/40 p-3 opacity-60 hover:opacity-100 transition"
      >
        <div className="text-sm font-medium text-muted-foreground">
          Adicionar stat
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          + Marcar foco do mes
        </div>
      </a>
    </Link>
  );
}

function FocusStatsCardItem({
  item,
  index,
  onRemove,
}: {
  item: FocusStatItem;
  index: number;
  onRemove: (id: string) => void;
}): JSX.Element {
  const statRemoved = item.statLabel === item.statId;
  const valueText = formatValue(item.currentValue, item.statUnit);
  const deltaText = formatDelta(item.delta, item.statUnit);

  return (
    <div
      data-testid={`focus-stat-item-${item.statId}`}
      className="rounded-md border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">
            {item.statLabel}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-wide border border-border rounded px-1.5 py-0.5 text-muted-foreground">
          Foco · {index + 1}
        </span>
      </div>

      {statRemoved ? (
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs">
          <div className="text-amber-600">
            Stat removida do catalogo
          </div>
          <button
            type="button"
            data-testid={`home-focus-stats-cta-remove-${item.id}`}
            onClick={() => onRemove(item.id)}
            className="mt-1 text-[11px] underline"
          >
            Remover marcacao
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            {item.currentValue === null ? (
              <span className="text-sm text-muted-foreground italic">
                Sem dado este mes
              </span>
            ) : (
              <>
                <span className="text-2xl font-bold">{valueText}</span>
                <span className={`text-sm ${deltaColorClass(item.deltaDirection)}`}>
                  {deltaText}
                </span>
                {item.previousValue !== null && item.delta !== null ? (
                  <span className="text-[11px] text-muted-foreground">
                    (vs {formatValue(item.previousValue, item.statUnit)} mes anterior)
                  </span>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-3 border-t border-border pt-2">
            {item.theme ? (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {item.theme.emoji ? (
                    <span className="text-base" aria-hidden>
                      {item.theme.emoji}
                    </span>
                  ) : null}
                  {/*
                   * Quando o nome do tema eh identico ao label da stat, omitimos
                   * a duplicacao visual (e quebra `getByText` ambiguo) — o
                   * usuario ja le o nome no header. Mantemos apenas o emoji
                   * + minutos.
                   */}
                  {item.theme.name && item.theme.name !== item.statLabel ? (
                    <span className="text-sm truncate">{item.theme.name}</span>
                  ) : null}
                  <span className="text-xs text-muted-foreground">
                    {item.studyMinutesMonth > 0 ? (
                      `${formatMinutes(item.studyMinutesMonth)} este mes`
                    ) : (
                      <em>0min — comece agora</em>
                    )}
                  </span>
                </div>
                <Link href={`/estudos/temas/${item.theme.id}`}>
                  <a
                    href={`/estudos/temas/${item.theme.id}`}
                    data-testid={`home-focus-stats-cta-study-${item.theme.id}`}
                    aria-label={`Estudar tema ${item.theme.name}`}
                    onClick={() =>
                      emit("focus_stats_cta_studynow_click", {
                        themeId: item.theme?.id,
                        statId: item.statId,
                      })
                    }
                    className="text-xs px-2 py-1 rounded-md border border-border hover:bg-accent shrink-0"
                  >
                    Estudar agora →
                  </a>
                </Link>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground italic">
                Tema removido
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function FocusStatsCard(): JSX.Element {
  const qc = useQueryClient();
  const viewEmittedRef = useRef(false);

  const { data, isLoading, isError, refetch } = useQuery<FocusStatsResponse>({
    queryKey: ["/api/home/focus-stats"],
    queryFn: () => apiRequest("GET", "/api/home/focus-stats"),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/focus-stats/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/home/focus-stats"] });
    },
  });

  // Tracker view emit — somente quando data carrega (lesson #1).
  useEffect(() => {
    if (!data || viewEmittedRef.current) return;
    viewEmittedRef.current = true;
    emit("home_focus_stats_view", {
      itemsCount: Array.isArray(data.items) ? data.items.length : 0,
    });
  }, [data]);

  if (isLoading) {
    return (
      <div
        data-testid="home-focus-stats-loading"
        className="rounded-lg border border-border bg-card p-4 space-y-2"
      >
        <div className="h-4 w-32 bg-muted/40 animate-pulse rounded" />
        <div className="h-20 bg-muted/40 animate-pulse rounded" />
        <div className="h-20 bg-muted/40 animate-pulse rounded" />
        <div className="h-20 bg-muted/40 animate-pulse rounded" />
      </div>
    );
  }

  // MEDIUM-3 reviewer: erro 5xx separado de empty-state. Antes mascarava como
  // empty (data === undefined era tratado como items=[]).
  if (isError) {
    return (
      <div
        data-testid="home-focus-stats-error"
        className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Foco do Mes</h3>
        </div>
        <p className="text-sm text-rose-300 mb-3">
          Falha ao carregar stats foco. Verifique sua conexao.
        </p>
        <button
          type="button"
          data-testid="home-focus-stats-retry"
          onClick={() => refetch()}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-rose-500/50 text-sm hover:bg-rose-500/15"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  const items = Array.isArray(data?.items) ? data!.items : [];

  if (items.length === 0) {
    return (
      <div
        data-testid="home-focus-stats-empty"
        className="rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold">Foco do Mes</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-3">
          Defina suas 3 stats foco do mes para acompanhar seu progresso e
          vincular a temas de estudo.
        </p>
        <Link href="/estudos/stats">
          <a
            href="/estudos/stats"
            data-testid="home-focus-stats-cta-define"
            onClick={() =>
              emit("focus_stats_cta_define_click", { source: "empty" })
            }
            className="inline-flex items-center justify-center px-3 py-1.5 rounded-md border border-border text-sm hover:bg-accent"
          >
            Ir para Stats Analyzer
          </a>
        </Link>
      </div>
    );
  }

  const slotsToFill = Math.max(0, 3 - items.length);

  return (
    <div
      data-testid="home-focus-stats-card"
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Foco do Mes</h3>
        <span className="text-[11px] text-muted-foreground">
          {items.length}/3
        </span>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <FocusStatsCardItem
            key={item.id}
            item={item}
            index={idx}
            onRemove={(id) => removeMutation.mutate(id)}
          />
        ))}
        {Array.from({ length: slotsToFill }).map((_, i) => (
          <EmptyFocusStatSlot key={`slot-${i}`} idx={items.length + i} />
        ))}
      </div>
    </div>
  );
}
