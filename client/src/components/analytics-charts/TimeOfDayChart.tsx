import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { num, formatUsd, formatPct } from '@/lib/dashboard-insights';

/**
 * Desempenho por turno do dia.
 *
 * O backend (`/api/analytics/by-time-of-day`) já devolve os turnos convertidos
 * para o FUSO DO JOGADOR — um torneio das 22h no Brasil não pode aparecer como
 * madrugada só porque o banco guarda UTC.
 *
 * A barra mostra LUCRO (é o que o jogador enxerga), e o ROI vai no tooltip:
 * turno com pouco volume pode ter ROI espetacular e não significar nada.
 */

/** Ordem cronológica — o backend devolve agrupado, sem ordem garantida. */
const BUCKET_ORDER = ['madrugada', 'manha', 'tarde', 'noite-cedo', 'noite-nobre'] as const;

const BUCKET_LABEL: Record<string, string> = {
  'madrugada': 'Madrugada',
  'manha': 'Manhã',
  'tarde': 'Tarde',
  'noite-cedo': 'Início da noite',
  'noite-nobre': 'Horário nobre',
};

const BUCKET_HOURS: Record<string, string> = {
  'madrugada': '00h–06h',
  'manha': '06h–12h',
  'tarde': '12h–18h',
  'noite-cedo': '18h–21h',
  'noite-nobre': '21h–00h',
};

interface TimeOfDayChartProps {
  data: any;
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl min-w-[200px]">
      <div className="text-foreground font-medium mb-1">
        {row.label} <span className="text-muted-foreground text-xs">({row.hours})</span>
      </div>
      <div className="space-y-0.5 text-sm">
        <div className={row.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
          Lucro: {formatUsd(row.profit)}
        </div>
        <div className="text-muted-foreground">ROI: {formatPct(row.roi)}</div>
        <div className="text-muted-foreground">Torneios: {row.sample}</div>
        <div className="text-muted-foreground">Investido: {formatUsd(row.buyins)}</div>
      </div>
    </div>
  );
}

export function TimeOfDayChart({ data }: TimeOfDayChartProps) {
  const rows = Array.isArray(data) ? data : [];
  const byBucket = new Map<string, any>();
  for (const row of rows) {
    const key = String(row?.bucket ?? '');
    if (key) byBucket.set(key, row);
  }

  // Turno sem torneio entra zerado em vez de sumir — o buraco na rotina é
  // informação ("você nunca joga de manhã"), não ausência de dado.
  const chartData = BUCKET_ORDER.map((bucket) => {
    const row = byBucket.get(bucket);
    return {
      bucket,
      label: BUCKET_LABEL[bucket] ?? bucket,
      hours: BUCKET_HOURS[bucket] ?? '',
      sample: num(row?.sample),
      profit: num(row?.profit),
      buyins: num(row?.buyins),
      roi: num(row?.roi),
    };
  });

  const hasAny = chartData.some((d) => d.sample > 0);
  if (!hasAny) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        Nenhum torneio neste recorte.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
        <XAxis
          dataKey="label"
          stroke="#9ca3af"
          tick={{ fontSize: 12 }}
          interval={0}
          angle={-15}
          textAnchor="end"
          height={60}
        />
        <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={(v) => formatUsd(Number(v))} />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Bar dataKey="profit" radius={[4, 4, 0, 0]} data-testid="time-of-day-bar">
          {chartData.map((entry) => (
            <Cell
              key={entry.bucket}
              fill={entry.profit >= 0 ? '#34d399' : '#f87171'}
              fillOpacity={entry.sample > 0 ? 1 : 0.25}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default TimeOfDayChart;
