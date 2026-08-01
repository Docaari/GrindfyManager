import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Layers, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { num, formatUsd, formatPct } from "@/lib/dashboard-insights";

/**
 * ROI por quantidade de mesas abertas ao mesmo tempo.
 *
 * Responde "multitablear mais me faz ganhar ou perder?".
 *
 * RESSALVA QUE PRECISA APARECER NA TELA: a duração que o export traz é a do
 * EVENTO, não o tempo que o jogador ficou na mesa — quem busta cedo continua
 * contando até o torneio acabar. Então o número de mesas é um TETO. Serve para
 * comparar "muitas em paralelo x poucas", não para afirmar "eu jogo 4,2 mesas".
 * Esconder isso seria vender precisão que o dado não tem.
 */

const BUCKET_ORDER = ['1', '2-3', '4-6', '7+'] as const;

const BUCKET_LABEL: Record<string, string> = {
  '1': '1 mesa',
  '2-3': '2 a 3',
  '4-6': '4 a 6',
  '7+': '7 ou mais',
};

interface SimultaneousTablesCardProps {
  data: any;
}

function SimultaneousTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl min-w-[200px]">
      <div className="text-foreground font-medium mb-1">{row.label} em paralelo</div>
      <div className="space-y-0.5 text-sm">
        <div className="text-muted-foreground">ROI: {formatPct(row.roi)}</div>
        <div className={row.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
          Lucro: {formatUsd(row.profit)}
        </div>
        <div className="text-muted-foreground">Torneios: {row.volume}</div>
        <div className="text-muted-foreground">Investido: {formatUsd(row.invested)}</div>
      </div>
    </div>
  );
}

export function SimultaneousTablesCard({ data }: SimultaneousTablesCardProps) {
  if (!data) return null;

  const sample = num(data.sample);
  if (sample <= 0) return null;

  const byBucket = new Map<string, any>();
  for (const row of Array.isArray(data.buckets) ? data.buckets : []) {
    const key = String(row?.bucket ?? '');
    if (key) byBucket.set(key, row);
  }

  const rows = BUCKET_ORDER.map((bucket) => {
    const row = byBucket.get(bucket);
    return {
      bucket,
      label: BUCKET_LABEL[bucket] ?? bucket,
      volume: num(row?.volume),
      profit: num(row?.profit),
      invested: num(row?.invested),
      roi: num(row?.roi),
    };
  });

  const coverage = num(data.coverage);
  const total = num(data.total);

  // Comparação direta só entre faixas com volume que sustente.
  const usable = rows.filter((r) => r.volume >= 10);
  const best = usable.length >= 2 ? [...usable].sort((a, b) => b.roi - a.roi)[0] : null;
  const worst = usable.length >= 2 ? [...usable].sort((a, b) => a.roi - b.roi)[0] : null;

  return (
    <Card
      className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10"
      data-testid="simultaneous-tables-card"
    >
      <CardHeader className="pb-6">
        <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
          <Layers className="h-7 w-7 text-blue-400" />
          Mesas Simultâneas x ROI
        </CardTitle>
        <CardDescription className="text-gray-300 text-base">
          Como seu retorno muda conforme o número de torneios rodando ao mesmo tempo.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {best && worst && best.bucket !== worst.bucket && (
          <p className="text-sm text-gray-300" data-testid="simultaneous-summary">
            Melhor retorno com <strong className="text-white">{best.label}</strong> ({formatPct(best.roi)});
            pior com <strong className="text-white">{worst.label}</strong> ({formatPct(worst.roi)}).
          </p>
        )}

        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 12 }} interval={0} />
              <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
              <Tooltip content={<SimultaneousTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                {rows.map((entry) => (
                  <Cell
                    key={entry.bucket}
                    fill={entry.roi >= 0 ? '#34d399' : '#f87171'}
                    fillOpacity={entry.volume >= 10 ? 1 : 0.3}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-gray-500 flex items-start gap-1.5" data-testid="simultaneous-caveat">
          <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
          A duração que o histórico traz é a do evento, não o tempo que você ficou na mesa — quem
          busta cedo continua contando até o torneio acabar. Trate como <strong>teto</strong>: serve
          para comparar muitas mesas contra poucas, não para cravar quantas você joga.
          {coverage < 99 && ` Medido em ${sample} dos ${total} torneios do recorte.`}
        </p>
      </CardContent>
    </Card>
  );
}
