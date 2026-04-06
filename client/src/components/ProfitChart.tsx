import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import type { ProfitChartProps, ComparisonDataItem, ComparisonChartDataItem, BigHitData } from './profit-chart/types';
import { parsePortugueseDate, generateAdaptiveXAxisTicks, generateTimeLabels } from './profit-chart/dateUtils';
import { BigHitMedal } from './profit-chart/BigHitMedal';
import { BigHitsList } from './profit-chart/BigHitsList';
import { ComparisonInterface } from './profit-chart/ComparisonInterface';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const medals = ['🥇', '🥈', '🥉'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const data = payload[0].payload;

  const formatFullDate = () => {
    try {
      if (data.fullDate) {
        return new Date(data.fullDate).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      const parsedDate = parsePortugueseDate(label);
      if (parsedDate) {
        return parsedDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
      }
      return label;
    } catch {
      return label;
    }
  };

  // Big Hit tooltip com detalhes do torneio
  if (data.isBigHit && data.bigHitTournament) {
    const t = data.bigHitTournament;
    const medal = medals[(data.bigHitRank || 1) - 1] || '🏅';
    let name = String(t.name || 'Torneio');
    name = name
      .replace(/\s*-\s*\d+-Day Event/gi, '')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const buyIn = parseFloat(String(t.buyIn || '0'));
    const prize = parseFloat(String(t.prize || t.result || '0'));
    const bounty = parseFloat(String(t.bounty || '0'));
    const totalProfit = prize + bounty;

    return (
      <div className="bg-gray-900 border-2 border-amber-500 rounded-lg p-4 shadow-xl min-w-[320px] max-w-[400px]">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">{medal}</span>
          <span className="text-amber-400 font-bold text-sm">BIG HIT #{data.bigHitRank}</span>
          <span className="text-gray-400 text-xs ml-auto">{formatFullDate()}</span>
        </div>
        <div className="text-white font-medium text-sm mb-2 leading-snug">{name}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mb-2">
          <div className="text-gray-400">Site:</div>
          <div className="text-white">{t.site || '--'}</div>
          <div className="text-gray-400">Buy-in:</div>
          <div className="text-white">{formatCurrency(buyIn)}</div>
          <div className="text-gray-400">Jogadores:</div>
          <div className="text-white">{t.fieldSize || '--'}</div>
          <div className="text-gray-400">Posicao:</div>
          <div className="text-white">{t.position || '--'}{t.fieldSize ? `/${t.fieldSize}` : ''}</div>
          {t.category && t.category !== 'Vanilla' && <>
            <div className="text-gray-400">Tipo:</div>
            <div className="text-white">{t.category}</div>
          </>}
          {t.speed && t.speed !== 'Normal' && <>
            <div className="text-gray-400">Velocidade:</div>
            <div className="text-white">{t.speed}</div>
          </>}
        </div>
        <div className="border-t border-gray-700 pt-2">
          <div className="text-emerald-400 text-lg font-bold">Profit: +{formatCurrency(totalProfit)}</div>
          <div className="text-gray-400 text-xs">Salto no dia: +{formatCurrency(data.profitJump || 0)}</div>
        </div>
      </div>
    );
  }

  // Tooltip padrao para pontos normais
  return (
    <div className="bg-gray-900 border border-emerald-500 rounded-lg p-4 shadow-xl min-w-[280px]">
      <div className="text-white font-medium mb-2">{formatFullDate()}</div>
      <div className="space-y-1 text-sm">
        <div className="text-emerald-400 text-lg font-bold">Lucro Acumulado: {formatCurrency(payload[0].value)}</div>
        <div className="text-gray-300">Volume: {data.count || 0} torneios</div>
        <div className="text-gray-300">Total Investido: {formatCurrency(data.buyins || 0)}</div>
        <div className="text-gray-300">Profit do Dia: {formatCurrency(data.profit || 0)}</div>
      </div>
    </div>
  );
};

export default function ProfitChart({ data, showComparison = false, tournaments = [], period = "all_time" }: ProfitChartProps) {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comparisonData, setComparisonData] = useState({
    period1: { from: '', to: '', data: [] as ComparisonDataItem[] },
    period2: { from: '', to: '', data: [] as ComparisonDataItem[] }
  });
  const [comparisonChartData, setComparisonChartData] = useState<ComparisonChartDataItem[]>([]);

  const { chartData, bigHits, bigHitsPercentage } = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { chartData: [], bigHits: [] as BigHitData[], bigHitsPercentage: 0 };
    }

    const timeLabels = generateTimeLabels(period);
    let cumulativeProfit = 0;

    const processedData = data.map((item, index) => {
      const profit = typeof item.profit === 'string' ? parseFloat(item.profit) : item.profit;
      const dateLabel = timeLabels[index] || new Date(item.date).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' });

      cumulativeProfit += profit;

      return {
        date: dateLabel,
        fullDate: item.date,
        profit,
        cumulative: cumulativeProfit,
        buyins: typeof item.buyins === 'string' ? parseFloat(item.buyins) : item.buyins,
        count: typeof item.count === 'string' ? parseInt(item.count) : item.count,
        index,
      };
    });

    // Big Hits: dias com salto de lucro significativo (apenas positivo)
    // Threshold adaptativo: usa o maior entre 3% do lucro total e o valor do ABI médio * 5
    const totalProfitCalc = Math.abs(cumulativeProfit);
    const dailyProfits = processedData.map((item, index) => {
      if (index === 0) return 0;
      return item.cumulative - processedData[index - 1].cumulative;
    }).filter(p => p > 0);
    const avgDailyProfit = dailyProfits.length > 0 ? dailyProfits.reduce((a, b) => a + b, 0) / dailyProfits.length : 0;
    // Threshold: 2x a média diária positiva, com mínimo de $50
    const bigHitThreshold = Math.max(avgDailyProfit * 2, 50);

    const detectedBigHits = processedData.filter((item, index) => {
      if (index === 0) return false;
      const jump = item.cumulative - processedData[index - 1].cumulative;
      // Apenas dias com lucro positivo significativo (não perdas)
      return jump >= bigHitThreshold;
    }).map(hit => {
      const hitDateStr = hit.fullDate.split('T')[0];
      const profitJump = hit.cumulative - (processedData[hit.index - 1]?.cumulative || 0);

      let dayTournaments = tournaments.filter(t => (t.datePlayed || t.date || '').split('T')[0] === hitDateStr);
      if (dayTournaments.length === 0) {
        const hitDate = new Date(hitDateStr);
        const oneDayBefore = new Date(hitDate.getTime() - 86400000);
        const oneDayAfter = new Date(hitDate.getTime() + 86400000);
        dayTournaments = tournaments.filter(t => {
          const td = new Date((t.datePlayed || t.date || '').split('T')[0]);
          return td >= oneDayBefore && td <= oneDayAfter;
        });
      }

      const bestMatch = dayTournaments.map(t => {
        const result = parseFloat(String(t.prize || t.result || '0'));
        const bounty = parseFloat(String(t.bounty || '0'));
        const tournamentProfit = result + bounty;
        const valueScore = Math.max(0, 100 - (Math.abs(tournamentProfit - profitJump) / profitJump) * 100);
        const positionBonus = t.position === 1 ? 50 : (t.position <= 3 ? 30 : (t.position <= 9 ? 15 : 0));
        return { tournament: t, score: valueScore + positionBonus, profit: tournamentProfit };
      }).filter(m => m.profit > 0).sort((a, b) => b.score - a.score)[0];

      return { ...hit, tournament: bestMatch?.tournament || null, isBigHit: true as const, profitJump };
    }).sort((a, b) => b.profitJump - a.profitJump);

    const bigHitsTotal = detectedBigHits.reduce((sum, hit) => sum + hit.profitJump, 0);

    // Marcar apenas os Top 3 big hits no gráfico (medalhas)
    const top3BigHits = detectedBigHits.slice(0, 3);
    const bigHitIndexMap = new Map<number, number>();
    top3BigHits.forEach((hit, rank) => {
      bigHitIndexMap.set(hit.index, rank + 1);
    });

    const chartDataWithBigHits = processedData.map(item => {
      const rank = bigHitIndexMap.get(item.index);
      if (rank !== undefined) {
        const hit = detectedBigHits.find(h => h.index === item.index);
        return { ...item, isBigHit: true, profitJump: hit?.profitJump || 0, bigHitRank: rank, bigHitTournament: hit?.tournament || null };
      }
      return item;
    });

    // Limitar a Top 3 para exibição
    const top3Hits = detectedBigHits.slice(0, 3);
    const top3Total = top3Hits.reduce((sum, hit) => sum + hit.profitJump, 0);

    return {
      chartData: chartDataWithBigHits,
      bigHits: top3Hits as BigHitData[],
      bigHitsPercentage: totalProfitCalc > 0 ? (top3Total / totalProfitCalc) * 100 : 0
    };
  }, [data, showComparison, tournaments]);

  const activeChartData = comparisonMode ? comparisonChartData : chartData;

  const calculateCumulativeData = (tourns: any[], _fromDate: string, _toDate: string): ComparisonDataItem[] => {
    const dailyProfits = tourns.reduce((acc: Record<string, number>, t) => {
      const date = (t.datePlayed || t.date).split('T')[0];
      const profit = parseFloat(t.prize || t.result || 0) + parseFloat(t.bounty || 0);
      if (!acc[date]) acc[date] = 0;
      acc[date] += profit;
      return acc;
    }, {});

    const tournamentDates = tourns.map(t => (t.datePlayed || t.date).split('T')[0]).sort();
    const startDate = new Date(Math.min(...tournamentDates.map(d => new Date(d).getTime())));
    const endDate = new Date(Math.max(...tournamentDates.map(d => new Date(d).getTime())));

    let cumulative = 0;
    const result = [];
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const dailyProfit = dailyProfits[dateStr] || 0;
      cumulative += dailyProfit;
      result.push({ date: dateStr, cumulative, daily: dailyProfit });
    }
    return result;
  };

  const normalizeComparisonData = (p1: ComparisonDataItem[], p2: ComparisonDataItem[]): ComparisonChartDataItem[] => {
    const maxLength = Math.max(p1.length, p2.length);
    return Array.from({ length: maxLength }, (_, i) => ({
      date: `Dia ${i + 1}`,
      cumulative: p1[i]?.cumulative || 0,
      cumulative2: p2[i]?.cumulative || 0,
      count: (p1[i] ? 1 : 0) + (p2[i] ? 1 : 0),
      profit: p1[i]?.daily || 0,
      buyins: 0,
      p1Cumulative: p1[i]?.cumulative || 0,
      p2Cumulative: p2[i]?.cumulative || 0,
    }));
  };

  const applyComparison = async (p1From: string, p1To: string, p2From: string, p2To: string) => {
    setLoading(true);
    try {
      let p1Tourns = tournaments.filter(t => { const d = t.datePlayed || t.date; return d >= p1From && d <= p1To; });
      let p2Tourns = tournaments.filter(t => { const d = t.datePlayed || t.date; return d >= p2From && d <= p2To; });

      // Fallback: split available tournaments if no data in ranges
      if (p1Tourns.length === 0 && p2Tourns.length === 0 && tournaments.length > 0) {
        const half = Math.floor(tournaments.length / 2);
        p1Tourns = tournaments.slice(0, half);
        p2Tourns = tournaments.slice(half);
      } else if (p2Tourns.length === 0 && p1Tourns.length > 0) {
        const half = Math.floor(p1Tourns.length / 2);
        p2Tourns = p1Tourns.slice(half);
        p1Tourns = p1Tourns.slice(0, half);
      }

      const period1Data = calculateCumulativeData(p1Tourns, p1From, p1To);
      const period2Data = calculateCumulativeData(p2Tourns, p2From, p2To);

      setComparisonData({
        period1: { from: p1From, to: p1To, data: period1Data },
        period2: { from: p2From, to: p2To, data: period2Data }
      });
      setComparisonChartData([...normalizeComparisonData(period1Data, period2Data)]);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleQuickComparison = async (type: string) => {
    const now = new Date();
    const ms = (days: number) => days * 86400000;
    let d1: number, d2: number;
    switch (type) {
      case 'month': d1 = 30; d2 = 60; break;
      case 'quarter': d1 = 90; d2 = 180; break;
      case 'semester': d1 = 180; d2 = 360; break;
      case 'year': d1 = 365; d2 = 730; break;
      default: return;
    }
    const p1From = new Date(now.getTime() - ms(d1)).toISOString().split('T')[0];
    const p1To = now.toISOString().split('T')[0];
    const p2From = new Date(now.getTime() - ms(d2)).toISOString().split('T')[0];
    const p2To = new Date(now.getTime() - ms(d1) - 1).toISOString().split('T')[0];

    setComparisonData({ period1: { from: p1From, to: p1To, data: [] }, period2: { from: p2From, to: p2To, data: [] } });
    setComparisonMode(true);
    await applyComparison(p1From, p1To, p2From, p2To);
  };

  const handleComparisonToggle = () => {
    setLoading(true);
    const newMode = !comparisonMode;
    setComparisonMode(newMode);
    if (!newMode) {
      setComparisonChartData([]);
      setComparisonData({ period1: { from: '', to: '', data: [] }, period2: { from: '', to: '', data: [] } });
    }
    setTimeout(() => setLoading(false), 300);
  };

  return (
    <Card className="bg-gradient-to-br from-gray-900/95 via-gray-800/90 to-gray-900/95 border border-gray-700/50 shadow-2xl backdrop-blur-sm ring-1 ring-white/10 hover:ring-emerald-500/30 transition-all duration-300 hover:shadow-emerald-500/10 hover:scale-[1.02]">
      <CardHeader className="pb-6">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-white text-2xl font-bold flex items-center gap-3">
              <span className="text-3xl">📈</span>
              Evolução do Lucro
            </CardTitle>
            <CardDescription className="text-gray-300 text-base mt-2">
              Evolução temporal do lucro acumulado com detecção de big hits
            </CardDescription>
          </div>
          <Button onClick={handleComparisonToggle} variant="outline" size="sm" disabled={loading}
            className="border-emerald-600 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all duration-300">
            <BarChart3 className="h-4 w-4 mr-2" />
            {loading ? 'Carregando...' : comparisonMode ? 'Ocultar Comparação' : 'Comparação'}
          </Button>
        </div>

        <div className="flex gap-6 mt-4 text-sm">
          <div className="stat-item">
            <span className="text-gray-400">Total:</span>
            <span className="text-white font-bold ml-2">{formatCurrency(chartData[chartData.length - 1]?.cumulative || 0)}</span>
          </div>
          <div className="stat-item">
            <span className="text-gray-400">Big Hits:</span>
            <span className="text-amber-400 font-bold ml-2">{bigHits.length}</span>
          </div>
          <div className="stat-item">
            <span className="text-gray-400">Dados:</span>
            <span className="text-white font-bold ml-2">{activeChartData.length}</span>
          </div>
        </div>

        <BigHitsList bigHits={bigHits} bigHitsPercentage={bigHitsPercentage} formatCurrency={formatCurrency} />
      </CardHeader>

      <CardContent className="pt-4">
        {comparisonMode && (
          <ComparisonInterface
            comparisonData={comparisonData}
            setComparisonData={setComparisonData}
            onQuickComparison={handleQuickComparison}
            onApplyComparison={applyComparison}
            loading={loading}
            formatCurrency={formatCurrency}
          />
        )}

        <div className="h-[650px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activeChartData} margin={{ top: 40, right: 50, left: 80, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} tickLine={false}
                tickFormatter={generateAdaptiveXAxisTicks(period || 'all', activeChartData)}
                interval="preserveStartEnd" domain={['dataMin', 'dataMax']} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickLine={false} tickFormatter={formatCurrency} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="cumulative" stroke="#10b981" strokeWidth={4}
                dot={comparisonMode ? false : <BigHitMedal />} connectNulls={true} name="Período 1"
                activeDot={{ r: 8, stroke: '#10b981', strokeWidth: 3, fill: '#ffffff', strokeOpacity: 1 }} />
              {comparisonMode && (
                <Line type="monotone" dataKey="cumulative2" stroke="#fb923c" strokeWidth={4}
                  connectNulls={true} dot={false} name="Período 2"
                  activeDot={{ r: 8, stroke: '#fb923c', strokeWidth: 3, fill: '#ffffff', strokeOpacity: 1 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
