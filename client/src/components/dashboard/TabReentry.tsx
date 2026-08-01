import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RotateCcw, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { ChartContent } from './ChartWrapper';
import { num, formatUsd, formatPct } from "@/lib/dashboard-insights";
import type { DashboardFiltersState } from './types';

/**
 * Reentradas: onde muita banca queima sem o jogador enxergar.
 *
 * A régua da aba inteira é o INVESTIMENTO REAL — quem reentrou duas vezes pagou
 * três buy-ins. Todo ROI aqui já vem calculado sobre `buy_in * (1 + reentradas)`;
 * usar só o buy-in inflaria justamente a faixa onde mais se gasta.
 *
 * A pergunta que a aba responde não é "quantas vezes reentrei", é "reentrar me
 * dá dinheiro, e ONDE ele vaza quando não dá".
 */

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

interface Row {
  label: string;
  volume: number;
  reentriesTotal: number;
  profit: number;
  invested: number;
  reentryCost: number;
  roi: number;
  avgProfit: number;
  avgBuyin: number;
  avgField: number;
  itmRate: number;
  profitableRate: number;
  maxPrize: number;
}

function toRow(raw: any, label: string): Row {
  const volume = num(raw?.volume);
  return {
    label,
    volume,
    reentriesTotal: num(raw?.reentriesTotal),
    profit: num(raw?.profit),
    invested: num(raw?.invested),
    reentryCost: num(raw?.reentryCost),
    roi: num(raw?.roi),
    avgProfit: num(raw?.avgProfit),
    avgBuyin: num(raw?.avgBuyin),
    avgField: num(raw?.avgField),
    itmRate: volume > 0 ? (num(raw?.itmCount) / volume) * 100 : 0,
    profitableRate: volume > 0 ? (num(raw?.profitableCount) / volume) * 100 : 0,
    maxPrize: num(raw?.maxPrize),
  };
}

function Kpi({ label, value, hint, tone, testId }: {
  label: string; value: string; hint?: string; tone?: 'good' | 'bad' | 'neutral'; testId?: string;
}) {
  const color = tone === 'good' ? 'text-green-400' : tone === 'bad' ? 'text-red-400' : 'text-white';
  return (
    <Card className="bg-gradient-to-br from-gray-900/95 to-gray-800/90 border border-gray-700/50">
      <CardContent className="pt-6">
        <div className="text-sm text-gray-400 mb-1">{label}</div>
        <div className={`text-2xl font-bold ${color}`} data-testid={testId}>{value}</div>
        {hint && <div className="text-xs text-gray-500 mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

/** Tabela compacta reutilizada nos três recortes (site / ABI / velocidade). */
function BreakdownTable({ title, description, rows, testId }: {
  title: string; description: string; rows: Row[]; testId: string;
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50">
      <CardHeader className="pb-4">
        <CardTitle className="text-white text-lg font-bold">{title}</CardTitle>
        <CardDescription className="text-gray-400 text-sm">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid={testId}>
            <thead>
              <tr className="text-gray-400 border-b border-gray-700/50">
                <th className="text-left font-medium py-2 pr-3"> </th>
                <th className="text-right font-medium py-2 px-2">Torneios</th>
                <th className="text-right font-medium py-2 px-2">Reentradas</th>
                <th className="text-right font-medium py-2 px-2">Custo delas</th>
                <th className="text-right font-medium py-2 px-2">Lucro</th>
                <th className="text-right font-medium py-2 pl-2">ROI</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-b border-gray-800/50 last:border-0">
                  <td className="text-white py-2 pr-3">{row.label}</td>
                  <td className="text-right text-gray-300 py-2 px-2">{row.volume}</td>
                  <td className="text-right text-gray-300 py-2 px-2">{row.reentriesTotal}</td>
                  <td className="text-right text-amber-300 py-2 px-2">{formatUsd(row.reentryCost)}</td>
                  <td className={`text-right py-2 px-2 ${row.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatUsd(row.profit)}
                  </td>
                  <td className={`text-right py-2 pl-2 ${row.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPct(row.roi)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ReentryTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as Row;
  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-xl min-w-[240px]">
      <div className="text-foreground font-medium mb-1">{row.label}</div>
      <div className="space-y-0.5 text-sm">
        <div className="text-muted-foreground">ROI: {formatPct(row.roi)}</div>
        <div className={row.profit >= 0 ? 'text-green-400' : 'text-red-400'}>
          Lucro: {formatUsd(row.profit)}
        </div>
        <div className="text-muted-foreground">Torneios: {row.volume}</div>
        <div className="text-muted-foreground">Investido: {formatUsd(row.invested)}</div>
        <div className="text-muted-foreground">ITM: {row.itmRate.toFixed(1)}%</div>
        <div className="text-muted-foreground">Terminou no lucro: {row.profitableRate.toFixed(1)}%</div>
        <div className="text-muted-foreground">Buy-in médio: {formatUsd(row.avgBuyin)}</div>
        {row.avgField > 0 && <div className="text-muted-foreground">Field médio: {row.avgField}</div>}
      </div>
    </div>
  );
}

export function TabReentry({ reentryAnalytics, reentryLoading, filters }: TabReentryProps) {
  const payload = reentryAnalytics ?? {};
  const byBucket = new Map<string, any>();
  for (const row of Array.isArray(payload.buckets) ? payload.buckets : []) {
    const key = String(row?.bucket ?? '');
    if (key) byBucket.set(key, row);
  }

  const rows: Row[] = BUCKET_ORDER.map((bucket) =>
    toRow(byBucket.get(bucket), BUCKET_LABEL[bucket] ?? bucket),
  );

  const clean = rows[0];
  const withReentryRows = rows.slice(1);
  const withReentry = withReentryRows.reduce(
    (acc, r) => ({
      volume: acc.volume + r.volume,
      profit: acc.profit + r.profit,
      invested: acc.invested + r.invested,
      reentryCost: acc.reentryCost + r.reentryCost,
    }),
    { volume: 0, profit: 0, invested: 0, reentryCost: 0 },
  );
  const withReentryRoi = withReentry.invested > 0 ? (withReentry.profit / withReentry.invested) * 100 : 0;

  const totals = payload.totals ?? null;
  const totalVolume = num(totals?.volume);
  const totalReentries = num(totals?.reentriesTotal);
  const totalReentryCost = num(totals?.reentryCost);
  const entriesWithReentry = num(totals?.withReentry);
  const reentryShare = totalVolume > 0 ? (entriesWithReentry / totalVolume) * 100 : 0;

  const toRows = (list: any, key = 'label') =>
    (Array.isArray(list) ? list : [])
      .map((r: any) => toRow(r, String(r?.[key] ?? '-')))
      .filter((r) => r.volume > 0)
      .sort((a, b) => b.reentriesTotal - a.reentriesTotal);

  const bySite = toRows(payload.bySite);
  const byBuyin = (Array.isArray(payload.byBuyin) ? payload.byBuyin : [])
    .map((r: any) => toRow(r, String(r?.label ?? '-')))
    .filter((r: Row) => r.volume > 0);
  const bySpeed = toRows(payload.bySpeed);

  const top = (Array.isArray(payload.topTournaments) ? payload.topTournaments : [])
    .map((r: any) => ({ ...toRow(r, String(r?.name ?? '-')), site: String(r?.site ?? '') }))
    .filter((r: any) => r.reentriesTotal > 0);

  // Diferenca de ROI entre reentrar e nao reentrar — o numero que decide.
  const roiGap = withReentryRoi - clean.roi;
  const comparable = clean.volume >= 10 && withReentry.volume >= 10;

  return (
    <>
      <h3 className="text-xl font-bold text-white mb-6">Análise Por Reentradas</h3>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <Kpi
          label="Entradas com reentrada"
          value={`${entriesWithReentry}`}
          hint={`${reentryShare.toFixed(1)}% dos ${totalVolume} torneios`}
          testId="reentry-entries-with"
        />
        <Kpi
          label="Reentradas pagas"
          value={`${totalReentries}`}
          hint="total no recorte"
          testId="reentry-total"
        />
        <Kpi
          label="Custo só das reentradas"
          value={formatUsd(totalReentryCost)}
          hint="o gasto que não aparece no buy-in"
          tone="bad"
          testId="reentry-cost"
        />
        <Kpi
          label="Resultado com reentrada"
          value={formatUsd(withReentry.profit)}
          hint={`ROI ${formatPct(withReentryRoi)} em ${withReentry.volume} torneios`}
          tone={withReentry.profit >= 0 ? 'good' : 'bad'}
          testId="reentry-profit"
        />
        <Kpi
          label="Resultado sem reentrada"
          value={formatUsd(clean.profit)}
          hint={`ROI ${formatPct(clean.roi)} em ${clean.volume} torneios`}
          tone={clean.profit >= 0 ? 'good' : 'bad'}
          testId="reentry-clean-profit"
        />
      </div>

      {/* Veredito direto, com a ressalva de amostra quando cabe. */}
      <div className="mb-8 rounded-lg border border-gray-700/50 bg-gray-900/40 p-4" data-testid="reentry-verdict">
        {!comparable ? (
          <p className="text-sm text-gray-400 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            Ainda não dá para comparar reentrar x não reentrar neste recorte — são necessários pelo
            menos 10 torneios de cada lado. Amplie o período ou solte um filtro.
          </p>
        ) : roiGap >= 0 ? (
          <p className="text-sm text-green-300">
            Reentrar está pagando: ROI de {formatPct(withReentryRoi)} contra {formatPct(clean.roi)} sem
            reentrada — {Math.abs(roiGap).toFixed(1)} pontos a mais, já descontando o custo das reentradas.
          </p>
        ) : (
          <p className="text-sm text-red-300">
            Reentrar está custando: ROI de {formatPct(withReentryRoi)} contra {formatPct(clean.roi)} sem
            reentrada — {Math.abs(roiGap).toFixed(1)} pontos a menos. Você pagou {formatUsd(totalReentryCost)} em
            reentradas no recorte.
          </p>
        )}
      </div>

      <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 mb-8">
        <CardHeader className="pb-6">
          <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
            <RotateCcw className="h-7 w-7 text-blue-400" />
            ROI por Número de Reentradas
          </CardTitle>
          <CardDescription className="text-gray-300 text-base">
            O ROI já considera o custo das reentradas. Passe o mouse para ver ITM, buy-in e field médios.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="h-[360px]" data-testid="chart-reentry-roi">
            <ChartContent loading={reentryLoading} data={payload.buckets} filters={filters}>
              {rows.every((r) => r.volume === 0) ? (
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
                          key={entry.label}
                          fill={entry.roi >= 0 ? '#34d399' : '#f87171'}
                          fillOpacity={entry.volume >= 10 ? 1 : 0.3}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartContent>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Barras apagadas têm menos de 10 torneios — pouco para tirar conclusão.
          </p>
        </CardContent>
      </Card>

      {/* Onde ele reentra. */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
        <BreakdownTable
          title="Reentradas por site"
          description="Onde a reentrada aparece e quanto ela custa em cada lugar."
          rows={bySite}
          testId="reentry-by-site"
        />
        <BreakdownTable
          title="Reentradas por faixa de buy-in"
          description="Reentrar caro dobra o custo do erro."
          rows={byBuyin}
          testId="reentry-by-buyin"
        />
        <BreakdownTable
          title="Reentradas por velocidade"
          description="Reentrada concentrada em turbo/hyper costuma ser teimosia; em field grande com stack raso costuma ser matemática."
          rows={bySpeed}
          testId="reentry-by-speed"
        />

        {top.length > 0 && (
          <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50">
            <CardHeader className="pb-4">
              <CardTitle className="text-white text-lg font-bold">Onde você mais reentrou</CardTitle>
              <CardDescription className="text-gray-400 text-sm">
                Os 15 torneios que mais consumiram reentradas no recorte.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full text-sm" data-testid="reentry-top-tournaments">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr className="text-gray-400 border-b border-gray-700/50">
                      <th className="text-left font-medium py-2 pr-3">Torneio</th>
                      <th className="text-right font-medium py-2 px-2">Re.</th>
                      <th className="text-right font-medium py-2 px-2">Custo</th>
                      <th className="text-right font-medium py-2 pl-2">Lucro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((row: any, index: number) => (
                      <tr key={`${row.label}-${index}`} className="border-b border-gray-800/50 last:border-0">
                        <td className="text-white py-2 pr-3">
                          <div className="max-w-[260px] truncate" title={row.label}>{row.label}</div>
                          <div className="text-xs text-gray-500">{row.site} · {row.volume} entradas</div>
                        </td>
                        <td className="text-right text-gray-300 py-2 px-2">{row.reentriesTotal}</td>
                        <td className="text-right text-amber-300 py-2 px-2">{formatUsd(row.reentryCost)}</td>
                        <td className={`text-right py-2 pl-2 ${row.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatUsd(row.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <p className="text-xs text-gray-500 leading-relaxed">
        Reentrada não é erro por si só: em field mole com stack raso ela costuma ser lucrativa. O sinal
        de alerta é a faixa de 2 ou mais ficar bem abaixo da faixa sem reentrada, ou o custo se
        concentrar em turbo e em buy-in alto — aí é reentrada por teimosia, não por leitura de campo.
      </p>
    </>
  );
}
