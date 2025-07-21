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

const BigHitMedal: React.FC<BigHitDotProps> = ({ cx, cy, payload }) => {
  if (!payload?.isBigHit) return null;
  
  const profit = Math.abs(payload.profitJump || 0);
  const medal = profit >= 1000 ? '🥇' : profit >= 500 ? '🥈' : profit >= 200 ? '🥉' : '🏅';
  
  return (
    <g>
      {/* Background circle para contraste */}
      <circle
        cx={cx}
        cy={cy}
        r={16}
        fill="rgba(0, 0, 0, 0.9)"
        stroke="#FFD700"
        strokeWidth={2}
        className="drop-shadow-lg"
      />
      {/* Medalha emoji */}
      <text
        x={cx}
        y={cy + 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="20"
        className="pointer-events-none select-none"
        style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}
      >
        {medal}
      </text>
    </g>
  );
};

export default function ProfitChart({ data, showComparison = false, tournaments = [] }: ProfitChartProps) {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comparisonData, setComparisonData] = useState({
    period1: { from: '', to: '', data: [] },
    period2: { from: '', to: '', data: [] }
  });

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

  const handleQuickComparison = async (type: string) => {
    const now = new Date();
    let period1Start, period1End, period2Start, period2End;
    
    switch (type) {
      case 'month':
        // CORRETO: Período 1: (Hoje - 30 dias) até Hoje, Período 2: (Hoje - 60 dias) até (Hoje - 30 dias)
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        period2End = new Date(period1Start.getTime() - 24 * 60 * 60 * 1000); // Um dia antes do início do período 1
        period2Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        // CORRETO: Período 1: (Hoje - 90 dias) até Hoje, Período 2: (Hoje - 180 dias) até (Hoje - 90 dias)
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        period2End = new Date(period1Start.getTime() - 24 * 60 * 60 * 1000); // Um dia antes do início do período 1
        period2Start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'semester':
        // CORRETO: Período 1: (Hoje - 180 dias) até Hoje, Período 2: (Hoje - 360 dias) até (Hoje - 180 dias)
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        period2End = new Date(period1Start.getTime() - 24 * 60 * 60 * 1000); // Um dia antes do início do período 1
        period2Start = new Date(now.getTime() - 360 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        // CORRETO: Período 1: (Hoje - 365 dias) até Hoje, Período 2: (Hoje - 730 dias) até (Hoje - 365 dias)
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        period2End = new Date(period1Start.getTime() - 24 * 60 * 60 * 1000); // Um dia antes do início do período 1
        period2Start = new Date(now.getTime() - 730 * 24 * 60 * 60 * 1000);
        break;
    }
    
    const p1From = period1Start?.toISOString().split('T')[0] || '';
    const p1To = period1End?.toISOString().split('T')[0] || '';
    const p2From = period2Start?.toISOString().split('T')[0] || '';
    const p2To = period2End?.toISOString().split('T')[0] || '';
    
    console.log(`BOTÃO ${type.toUpperCase()}:`);
    console.log(`Período 1: ${p1From} a ${p1To}`);
    console.log(`Período 2: ${p2From} a ${p2To}`);
    
    setComparisonData({
      period1: { from: p1From, to: p1To, data: [] },
      period2: { from: p2From, to: p2To, data: [] }
    });
    
    setComparisonMode(true);
    
    // Aplicar comparação automaticamente
    await applyComparison(p1From, p1To, p2From, p2To);
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
    const newMode = !comparisonMode;
    
    console.log(`🔄 TOGGLE COMPARAÇÃO: ${comparisonMode ? 'DESATIVANDO' : 'ATIVANDO'}`);
    
    setComparisonMode(newMode);
    
    if (!newMode) {
      // Voltando ao modo normal - restaurar dados originais
      console.log('🔙 RESTAURANDO DADOS ORIGINAIS');
      setChartData([...data]); // Force new array reference
      setComparisonData({
        period1: { from: '', to: '', data: [] },
        period2: { from: '', to: '', data: [] }
      });
    }
    
    setTimeout(() => {
      setLoading(false);
    }, 300);
  };

  const applyComparison = async (p1From: string, p1To: string, p2From: string, p2To: string) => {
    setLoading(true);
    try {
      console.log('🔄 INICIANDO COMPARAÇÃO');
      console.log('Tournaments disponíveis:', tournaments.length);
      
      // Filtrar torneios para cada período
      const period1Tournaments = tournaments.filter(t => {
        const tournamentDate = t.datePlayed;
        return tournamentDate >= p1From && tournamentDate <= p1To;
      });

      const period2Tournaments = tournaments.filter(t => {
        const tournamentDate = t.datePlayed;
        return tournamentDate >= p2From && tournamentDate <= p2To;
      });

      console.log(`✅ Período 1 (${p1From} - ${p1To}): ${period1Tournaments.length} torneios`);
      console.log(`✅ Período 2 (${p2From} - ${p2To}): ${period2Tournaments.length} torneios`);

      // Verificar se há dados suficientes
      if (period1Tournaments.length === 0 && period2Tournaments.length === 0) {
        console.warn('⚠️ Nenhum torneio encontrado nos períodos selecionados');
        return;
      }

      // Calcular dados acumulados para cada período
      const period1Data = calculateCumulativeData(period1Tournaments, p1From, p1To);
      const period2Data = calculateCumulativeData(period2Tournaments, p2From, p2To);

      console.log('📊 Dados período 1:', period1Data.length, 'dias');
      console.log('📊 Dados período 2:', period2Data.length, 'dias');

      // Normalizar os dados para o mesmo número de dias
      const normalizedData = normalizeComparisonData(period1Data, period2Data);

      console.log('🎯 Dados normalizados:', normalizedData.length, 'dias');
      console.log('🎯 Primeiro item normalizado:', normalizedData[0]);

      // Atualizar estado da comparação
      setComparisonData({
        period1: { from: p1From, to: p1To, data: period1Data },
        period2: { from: p2From, to: p2To, data: period2Data }
      });

      // CRÍTICO: Atualizar chartData para forçar re-render
      console.log('🚀 ATUALIZANDO CHARTDATA PARA COMPARAÇÃO');
      setChartData([...normalizedData]); // Force new array reference
      
    } catch (error) {
      console.error('❌ Erro ao aplicar comparação:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCumulativeData = (tournaments: any[], fromDate: string, toDate: string) => {
    // Agrupar por data e calcular lucro diário
    const dailyProfits = tournaments.reduce((acc, tournament) => {
      const date = tournament.datePlayed;
      const profit = (tournament.result || 0) + (tournament.bounty || 0) - tournament.buyIn;
      
      if (!acc[date]) acc[date] = 0;
      acc[date] += profit;
      return acc;
    }, {});

    // Criar array de dados diários com lucro acumulado
    let cumulative = 0;
    const data = [];
    const startDate = new Date(fromDate);
    const endDate = new Date(toDate);

    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0];
      const dailyProfit = dailyProfits[dateStr] || 0;
      cumulative += dailyProfit;
      
      data.push({
        date: dateStr,
        cumulative,
        daily: dailyProfit
      });
    }

    return data;
  };

  const normalizeComparisonData = (period1Data: any[], period2Data: any[]) => {
    const maxLength = Math.max(period1Data.length, period2Data.length);
    const normalizedData = [];

    console.log(`Normalizando dados - P1: ${period1Data.length} dias, P2: ${period2Data.length} dias, Max: ${maxLength}`);

    for (let i = 0; i < maxLength; i++) {
      const day = i + 1;
      const p1Value = period1Data[i]?.cumulative || 0;
      const p2Value = period2Data[i]?.cumulative || 0;
      
      normalizedData.push({
        date: `Dia ${day}`,
        cumulative: p1Value, // Período 1 - Linha Verde
        cumulative2: p2Value, // Período 2 - Linha Laranja
        count: (period1Data[i] ? 1 : 0) + (period2Data[i] ? 1 : 0),
        profit: period1Data[i]?.daily || 0,
        buyins: 0,
        // Metadados para debug
        p1Cumulative: p1Value,
        p2Cumulative: p2Value
      });
    }

    console.log('Dados normalizados (primeiros 5):', normalizedData.slice(0, 5));
    return normalizedData;
  };

  return (
    <div className="profit-chart-wrapper">
      {/* Header com botão de comparação */}
      <div className="chart-header flex justify-between items-center mb-6">
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
      <div className="chart-wrapper-enhanced">
        <ResponsiveContainer width="100%" height={650}>
          <LineChart
            data={chartData}
            margin={{ top: 40, right: 50, left: 80, bottom: 50 }}
            width={undefined}
            height={undefined}
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
            {!comparisonMode && (
              <Tooltip content={<CustomTooltip />} />
            )}
            <Line
              type="monotone"
              dataKey="cumulative"
              stroke={comparisonMode ? '#10b981' : '#10B981'}
              strokeWidth={4}
              dot={<BigHitMedal />}
              connectNulls={true}
              strokeDasharray="0"
              strokeOpacity={1}
              fill="none"
              activeDot={{ 
                r: 8, 
                stroke: '#10B981', 
                strokeWidth: 3, 
                fill: '#ffffff',
                strokeOpacity: 1
              }}
            />
            
            {/* Linha de comparação (quando ativo) */}
            {comparisonMode && comparisonData.period2.data.length > 0 && (
              <Line
                type="monotone"
                dataKey="cumulative2"
                stroke="#fb923c"
                strokeWidth={4}
                strokeOpacity={0.8}
                connectNulls={true}
                dot={false}
                activeDot={{ 
                  r: 8, 
                  stroke: '#fb923c', 
                  strokeWidth: 3, 
                  fill: '#ffffff',
                  strokeOpacity: 1
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Interface de Comparação */}
      {comparisonMode && (
        <div className="comparison-interface mt-6 p-6 bg-gray-800/50 rounded-xl border border-gray-700">
          <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
            ⚙️ Configurar Comparação
          </h4>
          
          {/* Botões Rápidos */}
          <div className="quick-buttons mb-6">
            <h5 className="text-gray-300 text-sm font-medium mb-3">Períodos Pré-definidos:</h5>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => handleQuickComparison('month')}
                className="quick-btn bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                📅 Mês
              </button>
              <button
                onClick={() => handleQuickComparison('quarter')}
                className="quick-btn bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                📊 Trimestre
              </button>
              <button
                onClick={() => handleQuickComparison('semester')}
                className="quick-btn bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                📈 Semestre
              </button>
              <button
                onClick={() => handleQuickComparison('year')}
                className="quick-btn bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                🗓️ Ano
              </button>
            </div>
          </div>

          {/* Campos Manuais */}
          <div className="manual-periods">
            <h5 className="text-gray-300 text-sm font-medium mb-3">Períodos Customizados:</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Período 1 */}
              <div className="period-config bg-green-900/20 border border-green-600/30 rounded-lg p-4">
                <h6 className="text-green-400 font-medium mb-3 flex items-center gap-2">
                  📊 Período 1 (Verde)
                </h6>
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">De:</label>
                    <input
                      type="date"
                      value={comparisonData.period1.from}
                      onChange={(e) => setComparisonData(prev => ({
                        ...prev,
                        period1: { ...prev.period1, from: e.target.value }
                      }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Até:</label>
                    <input
                      type="date"
                      value={comparisonData.period1.to}
                      onChange={(e) => setComparisonData(prev => ({
                        ...prev,
                        period1: { ...prev.period1, to: e.target.value }
                      }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Período 2 */}
              <div className="period-config bg-orange-900/20 border border-orange-600/30 rounded-lg p-4">
                <h6 className="text-orange-400 font-medium mb-3 flex items-center gap-2">
                  📈 Período 2 (Laranja)
                </h6>
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">De:</label>
                    <input
                      type="date"
                      value={comparisonData.period2.from}
                      onChange={(e) => setComparisonData(prev => ({
                        ...prev,
                        period2: { ...prev.period2, from: e.target.value }
                      }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Até:</label>
                    <input
                      type="date"
                      value={comparisonData.period2.to}
                      onChange={(e) => setComparisonData(prev => ({
                        ...prev,
                        period2: { ...prev.period2, to: e.target.value }
                      }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Botão Aplicar */}
            <div className="mt-4 text-center">
              <button
                onClick={() => applyComparison(
                  comparisonData.period1.from,
                  comparisonData.period1.to,
                  comparisonData.period2.from,
                  comparisonData.period2.to
                )}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? '🔄 Aplicando...' : '🔄 Aplicar Comparação'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}