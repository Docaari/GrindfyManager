/**
 * FocusStatsBar — Sprint Estudos-Habito-1 (RF-4).
 *
 * Componente reutilizavel cross-product para exibir 3 stats foco do mes.
 *
 * data-testid:
 *   focus-stats-bar (root)
 *   focus-stats-bar-chip-{stat_id}
 *   focus-stats-bar-chip-ghost-{idx}
 *   focus-stats-bar-empty
 *   focus-stats-bar-cta
 *   focus-stats-bar-skeleton
 */

import * as React from "react";
import { useLocation } from "wouter";
import { tokens } from "@/lib/ui-tokens";

export type FocusStatsBarPlacement =
  | "home"
  | "grindLive"
  | "coach"
  | "estudos"
  | "statsAnalyzer";

export interface FocusStatsBarChipData {
  id: string;
  statId: string;
  statLabel: string;
  statUnit?: string;
  currentValue: number | null;
  delta?: number | null;
  deltaDirection?: "improving" | "degrading" | "neutral";
}

export interface FocusStatsBarProps {
  placement: FocusStatsBarPlacement;
  data?: FocusStatsBarChipData[] | null;
  visible?: boolean;
  loading?: boolean;
  error?: boolean;
  onChipClick?: (chip: FocusStatsBarChipData) => void;
}

function deltaColor(direction?: string): string {
  // P1 #13: usa tokens.color.delta (lesson #22) para consistencia com KPIs.
  switch (direction) {
    case "improving":
      return tokens.color.delta.positive;
    case "degrading":
      return tokens.color.delta.negative;
    default:
      return tokens.color.delta.neutral;
  }
}

export function FocusStatsBar({
  placement,
  data,
  visible = true,
  loading = false,
  error = false,
  onChipClick,
}: FocusStatsBarProps) {
  // Lessons #1: hooks first.
  const [, setLocation] = useLocation();
  if (!visible) return null;
  if (error) return null;
  if (loading) {
    return (
      <div
        data-testid="focus-stats-bar-skeleton"
        className="h-16 bg-muted/50 rounded animate-pulse"
        aria-hidden
      />
    );
  }

  const items = Array.isArray(data) ? data : [];
  const ghostCount = Math.max(0, 3 - items.length);

  if (items.length === 0) {
    return (
      <div data-testid="focus-stats-bar" className="px-3 py-2 border border-border rounded-lg bg-card">
        <div data-testid="focus-stats-bar-empty" className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>Voce ainda nao escolheu suas 3 stats foco do mes.</span>
          <a
            href="/estudos/stats"
            data-testid="focus-stats-bar-cta"
            className="text-primary hover:underline"
          >
            Selecionar 3 stats em /estudos/stats
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="focus-stats-bar"
      data-placement={placement}
      className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-card overflow-x-auto"
      style={{ maxHeight: 64 }}
    >
      {items.map((chip) => (
        <button
          key={chip.statId}
          type="button"
          data-testid={`focus-stats-bar-chip-${chip.statId}`}
          onClick={() => {
            // P0 #8: SPA-friendly navigation via wouter (lesson #19).
            // Mantem onChipClick override para tests + props customization.
            if (onChipClick) onChipClick(chip);
            else setLocation(`/estudos/stats?focus=${chip.statId}`);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-full text-sm whitespace-nowrap"
        >
          <span className="font-medium">{chip.statLabel}:</span>
          <span>{chip.currentValue}{chip.statUnit ?? ""}</span>
          {typeof chip.delta === "number" && chip.delta !== 0 && (
            <span className={deltaColor(chip.deltaDirection)}>
              {chip.delta > 0 ? "+" : ""}{chip.delta}%
            </span>
          )}
        </button>
      ))}

      {Array.from({ length: ghostCount }).map((_, idx) => (
        <div
          key={`ghost-${idx}`}
          data-testid={`focus-stats-bar-chip-ghost-${idx}`}
          className="px-3 py-1.5 border border-dashed rounded-full text-sm text-muted-foreground"
        >
          Slot livre
        </div>
      ))}

      {ghostCount > 0 && (
        <a
          href="/estudos/stats"
          data-testid="focus-stats-bar-cta"
          className="ml-auto text-xs text-primary hover:underline whitespace-nowrap"
        >
          Selecionar {ghostCount} {ghostCount === 1 ? "restante" : "restantes"}
        </a>
      )}
    </div>
  );
}

export default FocusStatsBar;
