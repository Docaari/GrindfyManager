import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from "recharts";
import { Button } from "@/components/ui/button";
import { TrendingUp, BarChart3 } from "lucide-react";

interface Tournament {
  id: string;
  date: string;
  name: string;
  buyIn: number;
  result: number;
  bounty?: number;
  position: number;
  fieldSize: number;
  site: string;
  category: string;
  speed: string;
}

interface ProfitChartProps {
  data: Array<{
    date: string;
    profit: number;
    buyins: number;
    count: number;
    tournaments?: Tournament[];
  }>;
  showComparison?: boolean;
  tournaments?: Tournament[];
}

// Função para obter ícone baseado na posição
const getPositionIcon = (position: number): string => {
  if (position === 1) return "🥇";
  if (position === 2) return "🥈";
  if (position === 3) return "🥉";
  return "🏅";
};

// Tooltip customizado para big hits
const BigHitTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length > 0) {
    const data = payload[0].payload;
    const tournament = data.tournament;
    
    if (tournament && data.isBigHit) {
      const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'USD'
        }).format(value);
      };

      return (
        <div className="modern-tooltip bg-gray-900 border border-emerald-500 rounded-lg p-4 shadow-2xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{getPositionIcon(tournament.position)}</span>
            <span className="text-white font-bold text-lg">BIG HIT!</span>
          </div>
          <div className="space-y-1 text-sm">
            <div className="text-emerald-400 font-semibold">
              {new Date(tournament.date).toLocaleDateString('pt-BR')}
            </div>
            <div className="text-white font-medium">{tournament.name}</div>
            <div className="text-emerald-300 text-lg font-bold">
              {formatCurrency(tournament.result + (tournament.bounty || 0))}
            </div>
            <div className="text-gray-300">
              {tournament.position}º / {tournament.fieldSize}
            </div>
            <div className="flex gap-2 text-xs">
              <span className="bg-blue-600 px-2 py-1 rounded">{tournament.site}</span>
              <span className="bg-purple-600 px-2 py-1 rounded">{tournament.category}</span>
              <span className="bg-orange-600 px-2 py-1 rounded">{tournament.speed}</span>
            </div>
          </div>
        </div>
      );
    }
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-gray-900 border border-emerald-500 rounded-lg p-3 shadow-xl">
          <p className="text-white font-medium">{label}</p>
          <p className="text-emerald-400 text-lg font-bold">
            {formatCurrency(payload[0].value)}
          </p>
          {showComparison && payload[1] && (
            <p className="text-blue-400">
              Anterior: {formatCurrency(payload[1].value)}
            </p>
          )}
          <p className="text-gray-300 text-sm">
            Profit do dia: {formatCurrency(data.profit)}
          </p>
          <p className="text-gray-400 text-xs">
            {data.count} torneio{data.count !== 1 ? 's' : ''}
          </p>
        </div>
      );
    }
    return null;
  };

  const handleComparisonToggle = async () => {
    setLoading(true);
    setComparisonMode(!comparisonMode);
    // Simular loading para preparação futura
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
          <span className="text-emerald-400 font-bold ml-2">{bigHits.length}</span>
        </div>
        <div className="stat-item">
          <span className="text-gray-400">Dados:</span>
          <span className="text-blue-400 font-bold ml-2">{chartData.length} pontos</span>
        </div>
      </div>

      {/* Gráfico principal */}
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <defs>
              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.05}/>
              </linearGradient>
            </defs>
            
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#374151" 
              opacity={0.3}
            />
            
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
            
            {/* Linha principal do profit */}
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke="#10b981"
              strokeWidth={3}
              dot={false}
              activeDot={{ 
                r: 6, 
                stroke: '#10b981', 
                strokeWidth: 2,
                fill: '#059669'
              }}
              fill="url(#profitGradient)"
            />

            {/* Big Hits como ReferenceDots */}
            {bigHits.map((hit, index) => (
              <ReferenceDot
                key={`big-hit-${index}`}
                x={hit.date}
                y={hit.cumulative}
                r={8}
                fill="#f59e0b"
                stroke="#fbbf24"
                strokeWidth={3}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda de Big Hits */}
      {bigHits.length > 0 && (
        <div className="big-hits-legend mt-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-3 h-3 rounded-full bg-amber-500"></div>
            <span className="text-white font-medium text-sm">Big Hits Detectados:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {bigHits.slice(0, 3).map((hit, index) => (
              <div key={index} className="text-xs bg-gray-700 px-2 py-1 rounded">
                <span className="text-amber-400">{hit.date}</span>
                <span className="text-gray-300 ml-1">
                  +{formatCurrency(Math.abs(hit.profitJump))}
                </span>
              </div>
            ))}
            {bigHits.length > 3 && (
              <div className="text-xs text-gray-400">
                +{bigHits.length - 3} mais...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}