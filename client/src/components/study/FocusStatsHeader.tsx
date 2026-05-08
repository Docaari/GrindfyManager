/**
 * FocusStatsHeader — Sprint Estudos-Habito-1 (RF-3.2).
 *
 * Header dedicado em /stats-analyzer mostrando ate 3 cards de stats foco
 * com auto-suggest empty state.
 *
 * data-testid:
 *   focus-stats-header (root)
 *   focus-stats-card-{stat_id}
 *   focus-stats-card-{stat_id}-swap
 *   focus-stats-empty
 *   focus-stats-empty-suggest
 *   focus-stats-empty-manual
 */

import * as React from "react";
import { tokens } from "@/lib/ui-tokens";

export interface FocusStatsHeaderItem {
  id: string;
  statId: string;
  statLabel: string;
  statUnit?: string;
  currentValue: number | null;
  previousValue?: number | null;
  delta?: number | null;
  deltaDirection?: "improving" | "degrading" | "neutral";
  theme?: { id: string; name: string; color: string; emoji?: string; progress?: number } | null;
  studyMinutesMonth?: number;
}

export interface FocusStatsHeaderProps {
  data: { items: FocusStatsHeaderItem[] };
  onSwap?: (item: FocusStatsHeaderItem) => void;
  onAutoSuggest?: () => void;
  onManualSelect?: () => void;
  onLinkTheme?: (item: FocusStatsHeaderItem) => void;
}

function deltaTone(direction?: string): string {
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

export function FocusStatsHeader({
  data,
  onSwap,
  onAutoSuggest,
  onManualSelect,
  onLinkTheme,
}: FocusStatsHeaderProps) {
  const items = Array.isArray(data?.items) ? data.items : [];

  if (items.length === 0) {
    return (
      <div data-testid="focus-stats-header" className="border border-border rounded-lg p-6 bg-card text-center">
        <div data-testid="focus-stats-empty">
          <p className="text-muted-foreground mb-4">
            Voce ainda nao escolheu suas 3 stats foco deste mes.
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              data-testid="focus-stats-empty-suggest"
              onClick={onAutoSuggest}
              className="px-4 py-2 bg-primary text-primary-foreground rounded font-medium"
            >
              Sugerir 3 stats baseadas nos seus leaks
            </button>
            <button
              type="button"
              data-testid="focus-stats-empty-manual"
              onClick={onManualSelect}
              className="px-4 py-2 border border-border rounded"
            >
              Escolher manualmente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="focus-stats-header" className="border border-border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Stats Foco</h3>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => {
          const hasTheme = !!item.theme;
          return (
            <div
              key={item.statId}
              data-testid={`focus-stats-card-${item.statId}`}
              className="border border-border rounded-lg p-3 bg-background"
            >
              <div className="text-xs text-muted-foreground">{item.statLabel}</div>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-semibold">
                  {item.currentValue ?? "-"}
                  {item.statUnit ?? ""}
                </span>
                {typeof item.delta === "number" && item.delta !== 0 && (
                  <span className={`text-sm ${deltaTone(item.deltaDirection)}`}>
                    {item.delta > 0 ? "+" : ""}{item.delta}%
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs">
                {hasTheme ? (
                  <span className="text-muted-foreground">
                    Tema:{" "}
                    <span className="font-medium" style={{ color: item.theme!.color }}>
                      {item.theme!.name}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onLinkTheme?.(item)}
                    className="text-primary hover:underline"
                  >
                    Sem tema · Vincular tema
                  </button>
                )}
              </div>
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  data-testid={`focus-stats-card-${item.statId}-swap`}
                  onClick={() => onSwap?.(item)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Trocar
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FocusStatsHeader;
