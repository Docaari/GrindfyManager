/**
 * ChartTooltip — tooltip único de todos os gráficos de análise.
 *
 * PROBLEMA QUE RESOLVE
 * Cada gráfico declarava seu próprio `<Tooltip contentStyle={...} formatter={...} />`.
 * Vários usavam `formatter={(v, name) => [texto, '']}`: com o nome vazio o Recharts
 * ainda desenha o separador, saindo `": GGNetwork | 630 torneios | 51.8%"`. Pior,
 * sem `itemStyle` o texto herda a cor da fatia — em cores escuras (WPN #166534,
 * GGNetwork #dc2626) ficava ilegível sobre o fundo escuro do card.
 *
 * Agora o conteúdo é um componente React: rótulo em branco, valores com peso, e a
 * cor da série aparece só no marcador (bolinha), nunca no texto.
 */
import type { TooltipProps } from "recharts";
import { formatCurrencyBR } from "./chartUtils";

export type ChartValueKind = "number" | "currency" | "percent" | "duration";

export function formatChartValue(value: unknown, kind: ChartValueKind): string {
  // null/undefined/"" = dado AUSENTE, não zero (lesson #7). `Number(null)` é 0,
  // então sem esta guarda um campo vazio virava "$0,00" e mentia para o jogador.
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  switch (kind) {
    case "currency":
      return formatCurrencyBR(n);
    case "percent":
      return `${n.toFixed(1)}%`;
    case "duration": {
      const total = Math.round(n);
      const h = Math.floor(total / 3600);
      const m = Math.round((total % 3600) / 60);
      return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
    }
    default:
      return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
}

export interface ChartTooltipProps extends TooltipProps<any, any> {
  /** Como formatar o valor de cada série. */
  kind?: ChartValueKind;
  /** Sufixo textual (ex.: "torneios"). */
  unit?: string;
  /** Quando informado, mostra o percentual do valor sobre este total. */
  total?: number;
  /** Rótulo alternativo quando o gráfico não tem `label` (ex.: pizza). */
  labelFromPayload?: boolean;
}

export function ChartTooltip({
  active,
  payload,
  label,
  kind = "number",
  unit,
  total,
  labelFromPayload,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  // Em pizza o `label` vem vazio; o nome da fatia está no payload.
  const heading = labelFromPayload
    ? (payload[0]?.name ?? payload[0]?.payload?.name ?? "")
    : label;

  return (
    <div
      className="rounded-lg border border-gray-600 bg-gray-900/95 px-3 py-2 shadow-xl backdrop-blur-sm"
      style={{ minWidth: 150 }}
      data-testid="chart-tooltip"
    >
      {heading !== undefined && heading !== null && String(heading) !== "" && (
        <div className="mb-1.5 text-sm font-semibold text-white">{String(heading)}</div>
      )}
      <ul className="space-y-1">
        {payload.map((entry: any, i: number) => {
          const value = entry?.value;
          const pct =
            typeof total === "number" && total > 0 && Number.isFinite(Number(value))
              ? ((Number(value) / total) * 100).toFixed(1)
              : null;
          // Em pizza a cor vem do payload da fatia; em barra/linha, de `color`.
          const dot = entry?.color ?? entry?.payload?.fill ?? "#9ca3af";
          const serieName = labelFromPayload ? "" : (entry?.name ?? "");
          return (
            <li key={i} className="flex items-center gap-2 text-sm leading-tight">
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: dot }}
              />
              {serieName !== "" && <span className="text-gray-300">{String(serieName)}</span>}
              <span className="ml-auto font-semibold text-white">
                {formatChartValue(value, kind)}
                {unit ? <span className="ml-1 font-normal text-gray-400">{unit}</span> : null}
              </span>
              {pct !== null && <span className="text-xs text-gray-400">({pct}%)</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default ChartTooltip;
