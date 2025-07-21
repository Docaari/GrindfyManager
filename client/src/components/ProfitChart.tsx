import React, { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProfitChartProps {
  data: Array<{
    date: string;
    profit: string | number;
    buyins: string | number;
    count: string | number;
  }>;
  showComparison?: boolean;
  tournaments?: Array<{
    id: string;
    name: string;
    site: string;
    category: string;
    speed: string;
    position: number;
    fieldSize: number;
    result: number;
    bounty?: number;
    date: string;
  }>;
}

interface BigHitDotProps {
  cx?: number;
  cy?: number;
  payload?: any;
}

const BigHitDot: React.FC<BigHitDotProps> = ({ cx, cy, payload }) => {
  if (payload?.isBigHit) {
    return (
      <g>
        <Dot
          cx={cx}
          cy={cy}
          r={8}
          fill="#f59e0b"
          stroke="#ffffff"
          strokeWidth={2}
          className="animate-pulse"
        />
        <Dot
          cx={cx}
          cy={cy}
          r={4}
          fill="#ffffff"
        />
      </g>
    );
  }
  return null;
};

export default function ProfitChart({ data, showComparison = false, tournaments = [] }: ProfitChartProps) {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [loading, setLoading] = useState(false);

  const { chartData, bigHits, totalProfit } = useMemo(() => {
    // Validação defensiva
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { chartData: [], bigHits: [], totalProfit: 0 };
    }

    let cumulativeProfit = 0;
    const processedData = data.map((item, index) => {
      const profit = typeof item.profit === 'string' ? parseFloat(item.profit) : item.profit;
      cumulativeProfit += profit;
      
      return {
        date: new Date(item.date).toLocaleDateString('pt-BR', { 
          month: 'short', 
          day: 'numeric' 
        }),
        fullDate: item.date,
        profit: profit,
        cumulative: cumulativeProfit,
        buyins: typeof item.buyins === 'string' ? parseFloat(item.buyins) : item.buyins,
        count: typeof item.count === 'string' ? parseInt(item.count) : item.count,
        index,
      };
    });

    // Calcular total do profit para detecção de big hits
    const totalProfitCalc = Math.abs(cumulativeProfit);
    const bigHitThreshold = totalProfitCalc * 0.10; // 10% do profit total

    // Detectar big hits e associar com tournaments
    const detectedBigHits = processedData.filter((item, index) => {
      if (index === 0) return false;
      
      const previousCumulative = processedData[index - 1].cumulative;
      const profitJump = Math.abs(item.cumulative - previousCumulative);
      
      return profitJump >= bigHitThreshold;
    }).map(hit => {
      // Encontrar torneio correspondente
      const tournament = tournaments.find(t => {
        const tournamentDate = new Date(t.date).toDateString();
        const hitDate = new Date(hit.fullDate).toDateString();
        return tournamentDate === hitDate;
      });

      return {
        ...hit,
        tournament,
        isBigHit: true,
        profitJump: hit.cumulative - (processedData[hit.index - 1]?.cumulative || 0)
      };
    });

    return {
      chartData: processedData,
      bigHits: detectedBigHits,
      totalProfit: totalProfitCalc
    };
  }, [data, showComparison, tournaments]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getPositionIcon = (position: number) => {
    if (position === 1) return '🥇';
    if (position === 2) return '🥈';
    if (position === 3) return '🥉';
    if (position <= 9) return '🏅';
    return '🎯';
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const isBigHit = bigHits.some(hit => hit.index === data.index);
      const bigHitInfo = bigHits.find(hit => hit.index === data.index);
      
      return (
        <div className={`modern-tooltip bg-gray-900 border ${isBigHit ? 'border-amber-500 bg-gradient-to-br from-amber-900/20 to-gray-900' : 'border-emerald-500'} rounded-lg p-4 shadow-xl min-w-[280px]`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-white font-medium">{label}</p>
            {isBigHit && <span className="text-amber-400 text-lg">🔥</span>}
          </div>
          
          <div className="space-y-2">
            <p className="text-emerald-400 text-lg font-bold">
              Lucro Acumulado: {formatCurrency(payload[0].value)}
            </p>
            
            <div className="text-sm space-y-1">
              <p className="text-gray-300">Volume: {data.count} torneios</p>
              <p className="text-gray-300">Total Investido: {formatCurrency(data.buyins)}</p>
              <p className="text-gray-300">Profit do Dia: {formatCurrency(data.profit)}</p>
            </div>

            {isBigHit && bigHitInfo && (
              <div className="border-t border-amber-500/30 pt-2 mt-3">
                <p className="text-amber-400 font-bold text-sm">🎯 BIG HIT DETECTADO</p>
                <p className="text-amber-300 text-xs">
                  Salto de {formatCurrency(bigHitInfo.profitJump)}
                </p>
                {bigHitInfo.tournament && (
                  <div className="mt-2 space-y-1">
                    <p className="text-white font-medium text-sm">{bigHitInfo.tournament.name}</p>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="px-2 py-1 rounded bg-yellow-600/20 text-yellow-300">
                        {getPositionIcon(bigHitInfo.tournament.position)} {bigHitInfo.tournament.position}º/{bigHitInfo.tournament.fieldSize}
                      </span>
                    </div>
                    <div className="flex gap-2 text-xs">
                      <span className="bg-blue-600/30 px-2 py-1 rounded">{bigHitInfo.tournament.site}</span>
                      <span className="bg-purple-600/30 px-2 py-1 rounded">{bigHitInfo.tournament.category}</span>
                      <span className="bg-orange-600/30 px-2 py-1 rounded">{bigHitInfo.tournament.speed}</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {showComparison && payload[1] && (
            <div className="border-t border-gray-600 pt-2 mt-3">
              <p className="text-blue-400 text-sm">
                Período Anterior: {formatCurrency(payload[1].value)}
              </p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const handleComparisonToggle = async () => {
    setLoading(true);
    setComparisonMode(!comparisonMode);
    setTimeout(() => {
      setLoading(false);
    }, 500);
  };

  return (
    <div className="modern-chart-container">
      {/* Header com botão de comparação */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-400" />
          <span className="text-white font-medium">Evolução do Lucro</span>
        </div>
        <Button
          onClick={handleComparisonToggle}
          variant="outline"
          size="sm"
          disabled={loading}
          className="modern-comparison-btn border-emerald-600 text-emerald-400 hover:bg-emerald-600 hover:text-white"
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          {loading ? 'Carregando...' : comparisonMode ? 'Ocultar Comparação' : 'Comparação'}
        </Button>
      </div>

      {/* Estatísticas rápidas */}
      <div className="flex gap-4 mb-6 text-sm">
        <div className="stat-item">
          <span className="text-gray-400">Total:</span>
          <span className="text-white font-bold ml-2">
            {formatCurrency(chartData[chartData.length - 1]?.cumulative || 0)}
          </span>
        </div>
        <div className="stat-item">
          <span className="text-gray-400">Big Hits:</span>
          <span className="text-amber-400 font-bold ml-2">{bigHits.length}</span>
        </div>
        <div className="stat-item">
          <span className="text-gray-400">Dados:</span>
          <span className="text-white font-bold ml-2">{chartData.length}</span>
        </div>
      </div>

      {/* Big Hits Legend */}
      {bigHits.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-500/30 rounded-lg p-3 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-400">🔥</span>
            <span className="text-amber-300 font-medium text-sm">Big Hits Detectados</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            {bigHits.slice(0, 4).map((hit, index) => (
              <div key={index} className="text-amber-200">
                {hit.date}: {formatCurrency(hit.profitJump)} 
                {hit.tournament && <span className="text-amber-400 ml-1">📈</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico principal */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height="85%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis 
              dataKey="date" 
              stroke="#9CA3AF"
              fontSize={12}
              tickLine={false}
            />
            <YAxis 
              stroke="#9CA3AF"
              fontSize={12}
              tickLine={false}
              tickFormatter={formatCurrency}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#10B981"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6, stroke: '#10B981', strokeWidth: 2, fill: '#fff' }}
            />
            {/* Big Hits como pontos especiais */}
            {bigHits.map((hit, index) => (
              <Line
                key={`bighit-${index}`}
                type="monotone"
                dataKey={(entry) => entry.index === hit.index ? entry.cumulative : null}
                stroke="transparent"
                dot={<BigHitDot />}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}