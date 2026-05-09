/**
 * Sprint stats-themes-linking-1 — RF-05 ThemeStatsFocoSection.
 *
 * Section "Stats foco" no detalhe do tema. Mostra cards horizontais com
 * label + currentValue + range alvo + sparkline 30d.
 * Spec: Docs/specs/stats-themes-linking-1.md §RF-05.
 *
 * Props:
 *   - themeId: string
 *   - stats: StatPayloadEntry[] (shape de RF-03.2)
 *   - onConfigureClick?: () => void  (CTA empty state — opcional)
 */

import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

interface StatEntry {
  statId: string;
  label: string;
  groupId: string;
  groupLabel: string;
  currentValue: number | null;
  targetMin: number;
  targetMax: number;
  direction: string;
  unit: string;
  sparkline30d: number[];
  isCustom?: boolean;
}

interface ThemeStatsFocoSectionProps {
  themeId: string;
  stats: StatEntry[];
  onConfigureClick?: () => void;
}

type StatStatus = "ok" | "warn" | "alarm" | "no_data";

function classifyStatus(stat: StatEntry): StatStatus {
  if (stat.currentValue === null || stat.currentValue === undefined) {
    return "no_data";
  }
  const { currentValue, targetMin, targetMax, direction } = stat;
  let inRange = false;
  if (direction === "higher_better") {
    inRange = currentValue >= targetMin;
  } else if (direction === "lower_better") {
    inRange = currentValue <= targetMax;
  } else {
    inRange = currentValue >= targetMin && currentValue <= targetMax;
  }
  if (inRange) return "ok";
  // Desvio relativo: |outside_dist| / range_width.
  const range = targetMax - targetMin || 1;
  let outsideDist = 0;
  if (direction === "higher_better" && currentValue < targetMin) {
    outsideDist = targetMin - currentValue;
  } else if (direction === "lower_better" && currentValue > targetMax) {
    outsideDist = currentValue - targetMax;
  } else {
    if (currentValue < targetMin) outsideDist = targetMin - currentValue;
    else if (currentValue > targetMax) outsideDist = currentValue - targetMax;
  }
  const ratio = outsideDist / range;
  return ratio > 0.1 ? "alarm" : "warn";
}

function statusColor(status: StatStatus): string {
  if (status === "ok") return "#16a34a";
  if (status === "warn") return "#eab308";
  if (status === "alarm") return "#ef4444";
  return "#9ca3af";
}

function formatValue(value: number | null, unit: string): string {
  if (value === null || value === undefined) return "—";
  if (unit === "pct") return `${value.toFixed(1)}%`;
  if (unit === "bb") return `${value.toFixed(1)}bb`;
  if (unit === "count") return String(Math.round(value));
  return String(value);
}

function formatRange(min: number, max: number, _unit: string): string {
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  return `${fmt(min)} — ${fmt(max)}`;
}

function MiniSparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const chartData = useMemo(
    () => data.map((value, i) => ({ i, value })),
    [data],
  );
  if (!data || data.length === 0) {
    return (
      <div
        data-testid="sparkline-placeholder"
        style={{ width: "100%", height: 32, background: "#e5e7eb", borderRadius: 4 }}
      />
    );
  }
  return (
    <div style={{ width: "100%", height: 32 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ThemeStatsFocoSection({
  themeId: _themeId,
  stats,
  onConfigureClick,
}: ThemeStatsFocoSectionProps) {
  const [, setLocation] = useLocation();

  if (!stats || stats.length === 0) {
    return (
      <section className="rounded border border-dashed p-4">
        <div data-testid="theme-stats-foco-empty" className="space-y-2">
          <h3 className="font-medium">Stats foco</h3>
          <p className="text-sm text-muted-foreground">
            Nenhuma stat linkada — voce pode linkar stats nas Configuracoes
            deste tema.
          </p>
          <button
            type="button"
            onClick={() => onConfigureClick?.()}
            className="rounded border px-3 py-1 text-sm hover:bg-muted"
          >
            Configurar stats
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h3 className="font-medium">
        Stats foco <span className="text-muted-foreground">({stats.length})</span>
      </h3>
      <div className="space-y-2">
        {stats.map((stat) => {
          const status = classifyStatus(stat);
          const color = statusColor(status);
          return (
            <button
              key={stat.statId}
              type="button"
              data-testid={`theme-stats-foco-card-${stat.statId}`}
              data-status={status}
              onClick={() => setLocation(`/stats?focusStatId=${stat.statId}`)}
              className="flex w-full items-center gap-3 rounded border bg-card p-3 text-left hover:bg-muted/50"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                    {stat.groupLabel}
                  </span>
                  <span className="text-sm font-medium">{stat.label}</span>
                  {stat.isCustom && (
                    <span className="rounded bg-blue-500/10 px-1 py-0.5 text-[10px] text-blue-600">
                      Custom
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2 text-sm">
                  <span>Valor atual:</span>
                  <span
                    className="font-semibold"
                    style={{ color }}
                  >
                    {stat.currentValue === null
                      ? "Sem dados"
                      : formatValue(stat.currentValue, stat.unit)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Alvo: {formatRange(stat.targetMin, stat.targetMax, stat.unit)}
                </div>
              </div>
              <div className="w-32">
                <MiniSparkline
                  data={stat.sparkline30d ?? []}
                  color={color}
                />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default ThemeStatsFocoSection;
