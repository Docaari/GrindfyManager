import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RotateCcw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChartContent } from './ChartWrapper';
import { num, formatUsd, formatPct } from "@/lib/dashboard-insights";
import type { DashboardFiltersState } from './types';

/**
 * Reentradas: onde muita banca queima sem o jogador enxergar.
 *
 * A régua desta aba é o INVESTIMENTO REAL — quem reentrou duas vezes pagou três
 * buy-ins. O ROI aqui já vem calculado sobre `buy_in * (1 + reentradas)`; usar só
 * o buy-in inflaria justamente a faixa onde mais se gasta.
 */

/** Ordem fixa: o eixo tem que crescer, não vir na ordem que o banco agrupou. */
const BUCKET_ORDER = ['sem-reentrada', '1-reentrada', '2-reentradas', '3-mais'] as const;

const BUCKET_LABEL: Record<string, string> = {
  'sem-reentrada': 'Sem reentrada',
  '1-reentrada': '1 reentrada',
  '2-reentradas': '2 reentradas',
  '3-mais': '3 ou mais',
};

interface TabReentryProps {
  reentryAnalytics: any;
  reentryLoading: boolean;
  filters: DashboardFiltersState;
}

function ReentryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl min-w-[220px]">
      <div className="text-foreground font-medium mb-1">{row.label}</div>
      <div className="space-y-0.5 text-sm">
        <div className={row.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
          Lucro: {formatUsd(row.profit)}
        </div>
        <div className="text-muted-foreground">ROI: {formatPct(row.roi)}</div>
        <div className="text-muted-foreground">Torneios: {row.volume}</div>
        <div className="text-muted-foreground">Investido: {formatUsd(row.invested)}</div>
        <div className="text-muted-foreground">ITM: {row.itmRate.toFixed(1)}%</div>
      </div>
    </div>
  );
}

export function TabReentry({ reentryAnalytics, reentryLoading, filters }: TabReentryProps) {
  const byBucket = new Map<string, any>();
  for (const row of Array.isArray(reentryAnalytics) ? reentryAnalytics : []) {
    const key = String(row?.bucket ?? '');
    if (key) byBucket.set(key, row);
  }

  const rows = BUCKET_ORDER.map((bucket) => {
    const row = byBucket.get(bucket);
    const volume = num(row?.volume);
    return {
      bucket,
      label: BUCKET_LABEL[bucket] ?? bucket,
      volume,
      profit: num(row?.profit),
      invested: num(row?.invested),
      roi: num(row?.roi),
      reentriesTotal: num(row?.reentriesTotal),
      itmRate: volume > 0 ? (num(row?.itmCount) / volume) * 100 : 0,
    };
  });

  const withData = rows.filter((r) => r.volume > 0);
  const totalReentries = rows.reduce((sum, r) => sum + r.reentriesTotal, 0);
  const reentryInvested = rows.filter((r) => r.bucket !== 'sem-reentrada').reduce((s, r) => s + r.invested, 0);
  const reentryProfit = rows.filter((r) => r.bucket !== 'sem-reentrada').reduce((s, r) => s + r.profit, 0);
  const clean = rows.find((r) => r.bucket === 'sem-reentrada');

  return (
    <>
      <h3 className="text-xl font-bold text-white mb-8">Análise Por Reentradas</h3>

      {/* Resumo: o número que interessa é quanto a reentrada devolveu. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-gray-700/50">
          <CardContent className="pt-6">
            <div className="text-sm text-gray-400 mb-1">Reentradas pagas</div>
            <div className="text-3xl font-bold text-white" data-testid="reentry-total">{totalReentries}</div>
            <div className="text-xs text-gray-500 mt-1">no recorte selecionado</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-gray-700/50">
          <CardContent className="pt-6">
            <div className="text-sm text-gray-400 mb-1">Resultado com reentrada</div>
            <div
              className={`text-3xl font-bold ${reentryProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}
              data-testid="reentry-profit"
            >
              {formatUsd(reentryProfit)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              sobre {formatUsd(reentryInvested)} investidos
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-gray-700/50">
          <CardContent className="pt-6">
            <div className="text-sm text-gray-400 mb-1">Resultado sem reentrada</div>
            <div
              className={`text-3xl font-bold ${(clean?.profit ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}
              data-testid="reentry-clean-profit"
            >
              {formatUsd(clean?.profit ?? 0)}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              ROI {formatPct(clean?.roi ?? 0)} em {clean?.volume ?? 0} torneios
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10">
        <CardHeader className="pb-6">
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <RotateCcw className="h-7 w-7 text-blue-400" />
            ROI por Número de Reentradas
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            O ROI já considera o custo das reentradas — quem reentrou duas vezes pagou três buy-ins.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[400px]" data-testid="chart-reentry-roi">
            <ChartContent loading={reentryLoading} data={reentryAnalytics} filters={filters}>
              {withData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Nenhum torneio neste recorte.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="label" stroke="#9ca3af" tick={{ fontSize: 12 }} interval={0} />
                    <YAxis stroke="#9ca3af" tick={{ fontSize: 12 }} tickFormatter={(v) => `${Number(v).toFixed(0)}%`} />
                    <Tooltip content={<ReentryTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                      {rows.map((entry) => (
                        <Cell
                          key={entry.bucket}
                          fill={entry.roi >= 0 ? '#34d399' : '#f87171'}
                          fillOpacity={entry.volume > 0 ? 1 : 0.2}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartContent>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-gray-500 mt-4 leading-relaxed">
        Reentrada não é erro por si só: em field mole com stack raso ela costuma ser lucrativa.
        O sinal de alerta é a faixa de 2 ou mais reentradas ficar bem abaixo da faixa sem
        reentrada — indica reentrada por teimosia, não por leitura de campo.
      </p>
    </>
  );
}
