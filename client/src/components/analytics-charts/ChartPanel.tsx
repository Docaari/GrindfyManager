/**
 * ChartPanel — moldura padrão dos gráficos de análise.
 *
 * Coloca no canto superior ESQUERDO a lista dos valores em número, para o
 * jogador ler o dado exato sem precisar passar o mouse item a item. O gráfico
 * continua ocupando a área toda; a lista flutua por cima com fundo translúcido.
 *
 * Uso:
 *   <ChartPanel items={[{ name: 'GGNetwork', value: 630, color: '#dc2626' }]} kind="number" unit="torneios">
 *     <ResponsiveContainer>...</ResponsiveContainer>
 *   </ChartPanel>
 */
import type { ReactNode } from "react";
import { formatChartValue, type ChartValueKind } from "./ChartTooltip";

export interface ChartPanelItem {
  name: string;
  value: number;
  color?: string;
}

interface ChartPanelProps {
  items: ChartPanelItem[];
  children: ReactNode;
  /** Formato dos valores da lista. */
  kind?: ChartValueKind;
  /** Sufixo curto (ex.: "torneios"). Some quando a lista fica longa. */
  unit?: string;
  /** Mostra o percentual de cada item sobre o total (útil em volume). */
  showPercent?: boolean;
  /** Quantos itens antes de virar rolagem. */
  maxVisible?: number;
  className?: string;
}

/**
 * Monta os itens da lista a partir dos dados do gráfico.
 * `palette` aceita mapa nome->cor (sites/categorias/velocidades) ou array
 * (buy-ins, posições) — no array a cor sai pelo índice, ciclando.
 */
export function panelItems(
  data: any[],
  nameKey: string,
  valueKey: string,
  palette?: Record<string, string> | readonly string[],
): ChartPanelItem[] {
  return (data ?? [])
    .map((row, i) => {
      const name = String(row?.[nameKey] ?? "");
      const value = Number(row?.[valueKey] ?? 0);
      let color: string | undefined;
      if (Array.isArray(palette)) color = palette[i % palette.length];
      else if (palette && typeof palette === "object") color = (palette as Record<string, string>)[name];
      return { name, value, color: color ?? "#9ca3af" };
    })
    .filter((i) => i.name !== "" && Number.isFinite(i.value));
}

export function ChartPanel({
  items,
  children,
  kind = "number",
  unit,
  showPercent = false,
  maxVisible = 8,
  className,
}: ChartPanelProps) {
  const valid = (items ?? []).filter(
    (i) => i && typeof i.name === "string" && Number.isFinite(Number(i.value)),
  );
  const total = valid.reduce((a, i) => a + Number(i.value), 0);

  // `h-full w-full` é obrigatório: vários gráficos usam
  // `<ResponsiveContainer height="100%">`, que mede o PAI. Sem herdar a altura,
  // este wrapper media 0 e o gráfico sumia da tela.
  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      {valid.length > 0 && (
        <div
          className="pointer-events-auto absolute left-0 top-0 z-10 rounded-lg border border-gray-700/70 bg-gray-900/80 px-3 py-2 shadow-lg backdrop-blur-sm"
          style={{ maxWidth: "45%" }}
          data-testid="chart-value-list"
        >
          <ul
            className="space-y-1 overflow-y-auto pr-1"
            style={{ maxHeight: `${Math.max(3, maxVisible) * 22}px` }}
          >
            {valid.map((item, i) => {
              const pct = showPercent && total > 0 ? (Number(item.value) / total) * 100 : null;
              return (
                <li
                  key={`${item.name}-${i}`}
                  className="flex items-center gap-2 whitespace-nowrap text-xs leading-tight"
                >
                  <span
                    className="inline-block h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: item.color ?? "#9ca3af" }}
                  />
                  <span className="max-w-[110px] truncate text-gray-300" title={item.name}>
                    {item.name}
                  </span>
                  <span className="ml-auto font-semibold text-white">
                    {formatChartValue(item.value, kind)}
                  </span>
                  {pct !== null && (
                    <span className="w-10 text-right text-gray-400">{pct.toFixed(1)}%</span>
                  )}
                </li>
              );
            })}
          </ul>
          {unit && valid.length <= maxVisible && (
            <div className="mt-1 border-t border-gray-700/70 pt-1 text-[10px] uppercase tracking-wide text-gray-500">
              {unit}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

export default ChartPanel;
