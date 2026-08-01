import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { num, formatUsd, formatPct } from "@/lib/dashboard-insights";

/**
 * Onde o jogador cai dentro do field.
 *
 * `posição / tamanho do field` = quanto do campo ainda restava na eliminação.
 * Sair em 300º de 1000 é cair com 30% do field restante.
 *
 * Substitui o gráfico antigo desta aba, que se chamava "Eliminação por Field"
 * mas mostrava VOLUME POR TAMANHO de field — ou seja, respondia outra pergunta
 * (e a mesma da aba Participantes).
 *
 * Cor por significado, não por gradiente bonito: a faixa de 10-20% é a zona da
 * bolha/ITM, onde cair muito é o alarme de verdade.
 */

const BUCKET_ORDER = ['0-1%', '1-5%', '5-10%', '10-20%', '20-30%', '30-50%', '50-75%', '75-100%'] as const;

/** Faixas em que cair é esperado (a maior parte do field morre cedo). */
const EXPECTED = new Set(['30-50%', '50-75%', '75-100%']);
/** Zona da bolha: cair aqui é o que mais custa dinheiro. */
const BUBBLE_ZONE = new Set(['10-20%', '20-30%']);

interface EliminationChartProps {
  data: any;
}

function EliminationTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl min-w-[220px]">
      <div className="text-foreground font-medium mb-1">
        Caiu com {row.bucket} do field restante
      </div>
      <div className="space-y-0.5 text-sm">
        <div className="text-muted-foreground">Torneios: {row.volume} ({row.share.toFixed(1)}%)</div>
        <div className={row.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
          Lucro: {formatUsd(row.profit)}
        </div>
        <div className="text-muted-foreground">ROI: {formatPct(row.roi)}</div>
        <div className="text-muted-foreground">ITM: {row.itmRate.toFixed(1)}%</div>
      </div>
    </div>
  );
}

export function EliminationChart({ data }: EliminationChartProps) {
  const byBucket = new Map<string, any>();
  for (const row of Array.isArray(data) ? data : []) {
    const key = String(row?.bucket ?? '');
    if (key) byBucket.set(key, row);
  }

  const total = Array.from(byBucket.values()).reduce((sum, r) => sum + num(r?.volume), 0);

  const rows = BUCKET_ORDER.map((bucket) => {
    const row = byBucket.get(bucket);
    const volume = num(row?.volume);
    return {
      bucket,
      volume,
      share: total > 0 ? (volume / total) * 100 : 0,
      profit: num(row?.profit),
      roi: num(row?.roi),
      itmRate: volume > 0 ? (num(row?.itmCount) / volume) * 100 : 0,
    };
  });

  if (total === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Nenhum torneio com posição e tamanho de field neste recorte.
      </div>
    );
  }

  const colorFor = (bucket: string) =>
    BUBBLE_ZONE.has(bucket) ? '#f59e0b'   // âmbar: zona que custa caro
    : EXPECTED.has(bucket) ? '#6b7280'    // cinza: cair aqui é o normal
    : '#34d399';                          // verde: chegou perto do topo

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis dataKey="bucket" stroke="#9ca3af" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={50} />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} />
        <Tooltip content={<EliminationTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
          {rows.map((entry) => (
            <Cell key={entry.bucket} fill={colorFor(entry.bucket)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default EliminationChart;
