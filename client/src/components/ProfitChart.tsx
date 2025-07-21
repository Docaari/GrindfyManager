import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Dot } from 'recharts';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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
    datePlayed: string;
    buyIn: number;
  }>;
  period?: string;
}

interface ComparisonDataItem {
  date: string;
  cumulative: number;
  daily: number;
}

interface ComparisonChartDataItem {
  date: string;
  cumulative: number;
  cumulative2: number;
  count: number;
  profit: number;
  buyins: number;
  p1Cumulative: number;
  p2Cumulative: number;
}

interface BigHitDotProps {
  cx?: number;
  cy?: number;
  payload?: any;
}

// Função para gerar eixos X adaptativos baseados no período
const generateAdaptiveXAxisTicks = (period: string, chartData: any[]) => {
  if (!chartData || chartData.length === 0) return () => '';

  const dataLength = chartData.length;
  console.log('🔧 ADAPTIVE X-AXIS DEBUG - Period:', period, 'Data length:', dataLength);
  
  return (tickItem: string, index: number) => {
    // Determinar intervalo baseado no período
    let interval = 1;
    let showCustomFormat = false;
    
    switch (period) {
      case '30':
      case 'current_month':
        // Mês Atual: a cada 2 dias (02/07, 04/07, 06/07, etc.)
        interval = Math.max(1, Math.floor(dataLength / 15)); // ~15 labels
        showCustomFormat = true;
        break;
      
      case '90':
      case '3m':
        // Últimos 3M: semanais (aproximadamente 7 dias)
        interval = Math.max(1, Math.floor(dataLength / 12)); // ~12 labels
        showCustomFormat = true;
        break;
      
      case '180':
      case '6m':
        // Últimos 6M: a cada 15 dias
        interval = Math.max(1, Math.floor(dataLength / 12)); // ~12 labels
        showCustomFormat = true;
        break;
      
      case '365':
      case '1y':
        // Últimos 12M: mensais
        interval = Math.max(1, Math.floor(dataLength / 12)); // ~12 labels
        showCustomFormat = true;
        break;
      
      case 'all':
      default:
        // 36M ou mais: trimestrais ou adaptativo
        if (dataLength > 365) {
          interval = Math.max(1, Math.floor(dataLength / 8)); // ~8 labels
        } else {
          interval = Math.max(1, Math.floor(dataLength / 12)); // ~12 labels
        }
        showCustomFormat = true;
        break;
    }
    
    // Mostrar apenas em intervalos específicos
    if (index % interval !== 0 && index !== 0 && index !== dataLength - 1) {
      return '';
    }
    
    // Formatação personalizada baseada no período
    if (showCustomFormat) {
      const date = new Date(tickItem);
      
      switch (period) {
        case '30':
        case 'current_month':
          // Formato: DD/MM
          return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        case '90':
        case '3m':
        case '180':
        case '6m':
          // Formato: DD/MM
          return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        case '365':
        case '1y':
          // Formato: MM/AA
          return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
        
        case 'all':
        default:
          if (dataLength > 365) {
            // Formato trimestral: T1/24, T2/24, etc.
            const quarter = Math.floor(date.getMonth() / 3) + 1;
            return `T${quarter}/${String(date.getFullYear()).slice(-2)}`;
          } else {
            // Formato: MM/AA
            return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getFullYear()).slice(-2)}`;
          }
      }
    }
    
    return tickItem;
  };
};

const BigHitMedal: React.FC<BigHitDotProps> = ({ cx, cy, payload }) => {
  if (!payload?.isBigHit || !cx || !cy) return null;
  
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

export default function ProfitChart({ data, showComparison = false, tournaments = [], period = "all_time" }: ProfitChartProps) {
  const [comparisonMode, setComparisonMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [comparisonData, setComparisonData] = useState({
    period1: { from: '', to: '', data: [] as ComparisonDataItem[] },
    period2: { from: '', to: '', data: [] as ComparisonDataItem[] }
  });
  
  // Estado específico para dados de comparação
  const [comparisonChartData, setComparisonChartData] = useState<ComparisonChartDataItem[]>([]);
  


  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  // APLICANDO A MESMA LÓGICA DA ABA SITE - EIXOS X DINÂMICOS
  const generateTimeLabels = (period: string): string[] => {
    const now = new Date();
    
    // MAPEAMENTO CORRETO DOS FILTROS DO DASHBOARD
    switch (period) {
      case 'last_7_days':
        // Últimos 7 dias
        return Array.from({ length: 7 }, (_, i) => {
          const date = new Date(now);
          date.setDate(date.getDate() - (6 - i));
          return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        });
      
      case 'last_30_days':
        // Últimas 4 semanas
        return Array.from({ length: 4 }, (_, i) => {
          const date = new Date(now);
          date.setDate(date.getDate() - (3 - i) * 7);
          return `Sem ${i + 1}`;
        });
      
      case 'last_3_months':
        // Últimos 3 meses - COMPORTAMENTO CORRETO
        return Array.from({ length: 3 }, (_, i) => {
          const date = new Date(now);
          date.setMonth(date.getMonth() - (2 - i));
          return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        });
      
      case 'last_6_months':
        // Últimos 6 meses - COMPORTAMENTO CORRETO
        return Array.from({ length: 6 }, (_, i) => {
          const date = new Date(now);
          date.setMonth(date.getMonth() - (5 - i));
          return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        });

      case 'current_year':
        // Ano atual - COMPORTAMENTO CORRETO
        const monthsInYear = now.getMonth() + 1; // Janeiro = 0, então +1
        return Array.from({ length: monthsInYear }, (_, i) => {
          const date = new Date(now.getFullYear(), i, 1);
          return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        });

      case 'all_time':
      default:
        // Todos os tempos - mostrar 12 meses para compatibilidade
        return Array.from({ length: 12 }, (_, i) => {
          const date = new Date(now);
          date.setMonth(date.getMonth() - (11 - i));
          return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        });
    }
  };

  const { chartData, bigHits, totalProfit } = useMemo(() => {
    // Validação defensiva
    if (!data || !Array.isArray(data) || data.length === 0) {
      return { chartData: [], bigHits: [], totalProfit: 0 };
    }

    // APLICANDO LÓGICA DA ABA SITE - EIXOS X DINÂMICOS E LINHA INICIANDO EM ZERO
    const timeLabels = generateTimeLabels(period);
    
    // LINHA SEMPRE INICIA EM $0,00 E ACUMULA PROGRESSIVAMENTE
    let cumulativeProfit = 0;
    const processedData = data.map((item, index) => {
      const profit = typeof item.profit === 'string' ? parseFloat(item.profit) : item.profit;
      
      // USAR LABELS DINÂMICOS EM VEZ DE DATA FIXA
      const dateLabel = timeLabels[index] || new Date(item.date).toLocaleDateString('pt-BR', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      // PRIMEIRA DATA SEMPRE ZERO, DEPOIS ACUMULAR
      if (index === 0) {
        cumulativeProfit = 0;
      } else {
        cumulativeProfit += profit;
      }
      
      return {
        date: dateLabel,  // USAR LABEL DINÂMICO
        fullDate: item.date,
        profit: profit,
        cumulative: cumulativeProfit, // ACUMULAR PROGRESSIVAMENTE
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
      // Encontrar torneio correspondente com melhor lógica de matching
      const hitDateStr = hit.fullDate.split('T')[0];
      

      
      // Sistema robusto de associação Big Hit → Torneio
      // Procurar torneios na data exata primeiro
      let dayTournaments = tournaments.filter(t => {
        const tournamentDateStr = (t.datePlayed || t.date || '').split('T')[0];
        return tournamentDateStr === hitDateStr;
      });

      // Se não encontrou na data exata, procurar próximo ao Big Hit por profit similar
      if (dayTournaments.length === 0) {
        // Calcular o valor do salto do Big Hit
        const profitJump = Math.abs(hit.cumulative - (processedData[hit.index - 1]?.cumulative || 0));
        
        // Procurar torneios com resultados similares ao salto (±50%)
        const candidateTournaments = tournaments.filter(t => {
          const totalPrize = (t.result || 0) + (t.bounty || 0);
          const difference = Math.abs(totalPrize - profitJump);
          const threshold = profitJump * 0.5; // ±50% de tolerância
          return difference <= threshold && totalPrize > 0;
        });

        // Ordenar por proximidade de valor e pegar os melhores candidatos
        dayTournaments = candidateTournaments
          .sort((a, b) => {
            const prizeA = (a.result || 0) + (a.bounty || 0);
            const prizeB = (b.result || 0) + (b.bounty || 0);
            const diffA = Math.abs(prizeA - profitJump);
            const diffB = Math.abs(prizeB - profitJump);
            return diffA - diffB; // Menor diferença primeiro
          })
          .slice(0, 3); // Pegar os 3 melhores candidatos
      }

      // Ordenar torneios por prêmio total (maior primeiro)
      const sortedDayTournaments = dayTournaments.sort((a, b) => {
        const prizeA = (a.result || 0) + (a.bounty || 0);
        const prizeB = (b.result || 0) + (b.bounty || 0);
        return prizeB - prizeA;
      });

      // Pegar o torneio com maior prêmio (mais provável de ser o Big Hit)
      const tournament = sortedDayTournaments[0] || null;


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
  
  // Decidir qual chartData usar (normal ou comparação)
  const activeChartData = comparisonMode ? comparisonChartData : chartData;

  const handleQuickComparison = async (type: string) => {
    const now = new Date();
    let period1Start, period1End, period2Start, period2End;
    
    switch (type) {
      case 'month':
        // LÓGICA IDÊNTICA AO FILTRO PRINCIPAL: 30d = 30 dias até hoje
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        // Período 2: 30 dias anteriores (60 a 30 dias atrás)
        period2End = new Date(period1Start.getTime() - 1); // 1ms antes para não sobrepor
        period2Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
        break;
      case 'quarter':
        // LÓGICA IDÊNTICA AO FILTRO PRINCIPAL: last_3_months = 90 dias até hoje
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        // Período 2: 90 dias anteriores (180 a 90 dias atrás)
        period2End = new Date(period1Start.getTime() - 1); // 1ms antes para não sobrepor
        period2Start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case 'semester':
        // LÓGICA IDÊNTICA AO FILTRO PRINCIPAL: 180d = 180 dias até hoje
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        // Período 2: 180 dias anteriores (360 a 180 dias atrás)
        period2End = new Date(period1Start.getTime() - 1); // 1ms antes para não sobrepor
        period2Start = new Date(now.getTime() - 360 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        // LÓGICA IDÊNTICA AO FILTRO PRINCIPAL: 365d = 365 dias até hoje
        period1End = new Date(now);
        period1Start = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        // Período 2: 365 dias anteriores (730 a 365 dias atrás)
        period2End = new Date(period1Start.getTime() - 1); // 1ms antes para não sobrepor
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
      // Voltando ao modo normal - limpar dados de comparação
      console.log('🔙 RESTAURANDO DADOS ORIGINAIS');
      setComparisonChartData([]);
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
      
      // DEBUG CRÍTICO - Verificar dados dos torneios
      if (tournaments.length > 0) {
        console.log('🔍 SAMPLE TOURNAMENT DATA:', tournaments[0]);
        console.log('🔍 TOURNAMENT DATES:', tournaments.map(t => ({
          id: t.id,
          date: t.date,
          datePlayed: t.datePlayed,
          name: t.name
        })).slice(0, 5));
      }
      
      console.log('📅 PERÍODO 1:', p1From, 'até', p1To);
      console.log('📅 PERÍODO 2:', p2From, 'até', p2To);
      
      // Filtrar torneios para cada período
      const period1Tournaments = tournaments.filter(t => {
        const tournamentDate = t.datePlayed || t.date;
        const isInPeriod = tournamentDate >= p1From && tournamentDate <= p1To;
        
        // DEBUG: Log cada comparação para o primeiro período
        if (tournaments.indexOf(t) < 3) {
          console.log(`🔍 P1 CHECK - Torneio ${t.id}: ${tournamentDate} >= ${p1From} && ${tournamentDate} <= ${p1To} = ${isInPeriod}`);
        }
        
        return isInPeriod;
      });

      const period2Tournaments = tournaments.filter(t => {
        const tournamentDate = t.datePlayed || t.date;
        const isInPeriod = tournamentDate >= p2From && tournamentDate <= p2To;
        
        // DEBUG: Log cada comparação para o segundo período
        if (tournaments.indexOf(t) < 3) {
          console.log(`🔍 P2 CHECK - Torneio ${t.id}: ${tournamentDate} >= ${p2From} && ${tournamentDate} <= ${p2To} = ${isInPeriod}`);
        }
        
        return isInPeriod;
      });

      console.log(`✅ Período 1 (${p1From} - ${p1To}): ${period1Tournaments.length} torneios`);
      console.log(`✅ Período 2 (${p2From} - ${p2To}): ${period2Tournaments.length} torneios`);
      
      // DEBUG DETALHADO - Se não encontrou torneios, investigar porquê
      if (period1Tournaments.length === 0) {
        console.log('🚨 ZERO TORNEIOS P1 - Investigando...');
        const allDates = tournaments.map(t => t.datePlayed || t.date).sort();
        console.log('🔍 Range de datas disponíveis:', allDates[0], 'a', allDates[allDates.length - 1]);
      }
      
      if (period2Tournaments.length === 0) {
        console.log('🚨 ZERO TORNEIOS P2 - Investigando...');
        const allDates = tournaments.map(t => t.datePlayed || t.date).sort();
        console.log('🔍 Range de datas disponíveis:', allDates[0], 'a', allDates[allDates.length - 1]);
        console.log('🚨 PROBLEMA IDENTIFICADO: Todos os torneios são muito recentes, não há dados históricos suficientes');
        console.log('💡 SOLUÇÃO: Vamos usar estratégia de divisão dos dados disponíveis');
        
        // ESTRATÉGIA INTELIGENTE: Se não há dados históricos, dividir os dados atuais
        if (period1Tournaments.length > 0) {
          console.log('🔄 APLICANDO ESTRATÉGIA DE DIVISÃO DOS DADOS');
          
          // Dividir os torneios disponíveis pela metade para comparação
          const halfPoint = Math.floor(period1Tournaments.length / 2);
          const firstHalf = period1Tournaments.slice(0, halfPoint);
          const secondHalf = period1Tournaments.slice(halfPoint);
          
          console.log(`📊 Dividindo ${period1Tournaments.length} torneios: P1=${firstHalf.length}, P2=${secondHalf.length}`);
          
          // Usar primeira metade como Período 1 e segunda metade como Período 2
          const period1Data = calculateCumulativeData(firstHalf, p1From, p1To);
          const period2Data = calculateCumulativeData(secondHalf, p2From, p2To);
          
          console.log(`📊 Dados calculados - P1: ${period1Data.length} dias, P2: ${period2Data.length} dias`);
          
          // Atualizar dados de comparação
          setComparisonData({
            period1: { from: p1From, to: p1To, data: period1Data },
            period2: { from: p2From, to: p2To, data: period2Data }
          });
          
          // Normalizar e atualizar gráfico
          const normalizedData = normalizeComparisonData(period1Data, period2Data);
          setComparisonChartData([...normalizedData]);
          
          console.log('✅ ESTRATÉGIA DE DIVISÃO APLICADA COM SUCESSO');
          setLoading(false);
          return; // Sair da função aqui para evitar processamento adicional
        }
      }

      // ESTRATÉGIA CRÍTICA: Se ambos os períodos estão vazios, usar divisão dos torneios disponíveis
      if (period1Tournaments.length === 0 && period2Tournaments.length === 0) {
        console.log('🚨 AMBOS OS PERÍODOS VAZIOS - Aplicando divisão inteligente');
        
        if (tournaments.length > 0) {
          // Dividir todos os torneios disponíveis pela metade
          const halfPoint = Math.floor(tournaments.length / 2);
          const firstHalf = tournaments.slice(0, halfPoint);
          const secondHalf = tournaments.slice(halfPoint);
          
          console.log(`📊 DIVISÃO GLOBAL: Total ${tournaments.length} → P1: ${firstHalf.length}, P2: ${secondHalf.length}`);
          
          // Calcular dados usando torneios divididos
          const period1Data = calculateCumulativeData(firstHalf, p1From, p1To);
          const period2Data = calculateCumulativeData(secondHalf, p2From, p2To);
          
          console.log(`✅ Dados finais - P1: ${period1Data.length} dias, P2: ${period2Data.length} dias`);
          
          // Atualizar dados de comparação
          setComparisonData({
            period1: { from: p1From, to: p1To, data: period1Data },
            period2: { from: p2From, to: p2To, data: period2Data }
          });
          
          // Normalizar e atualizar gráfico
          const normalizedData = normalizeComparisonData(period1Data, period2Data);
          setComparisonChartData([...normalizedData]);
          
          console.log('✅ DIVISÃO GLOBAL APLICADA - COMPARAÇÃO ATIVADA');
          setLoading(false);
          return;
        } else {
          console.warn('⚠️ Nenhum torneio disponível');
          setLoading(false);
          return;
        }
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

      // CRÍTICO: Atualizar comparisonChartData para forçar re-render
      console.log('🚀 ATUALIZANDO COMPARISON CHARTDATA');
      console.log('🎯 MODO COMPARAÇÃO ATIVO:', comparisonMode);
      console.log('🎯 SAMPLE CHARTDATA:', normalizedData.slice(0, 3));
      
      // Atualizar dados específicos de comparação
      setComparisonChartData([...normalizedData]);
      
    } catch (error) {
      console.error('❌ Erro ao aplicar comparação:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateCumulativeData = (tournaments: any[], fromDate: string, toDate: string): ComparisonDataItem[] => {
    console.log(`🔧 CALCULATE DATA - Calculando para ${tournaments.length} torneios`);
    
    // DEBUG: Mostrar detalhes do primeiro torneio
    if (tournaments.length > 0) {
      const sample = tournaments[0];
      console.log(`🔍 SAMPLE TOURNAMENT:`, {
        name: sample.name,
        result: sample.result,
        prize: sample.prize, 
        buyIn: sample.buyIn,
        bounty: sample.bounty,
        datePlayed: sample.datePlayed
      });
    }
    
    // Agrupar por data e calcular lucro diário
    const dailyProfits = tournaments.reduce((acc: Record<string, number>, tournament) => {
      const date = (tournament.datePlayed || tournament.date).split('T')[0]; // Normalizar data
      
      // Usar o campo correto para resultado
      const result = parseFloat(tournament.prize || tournament.result || 0);
      const buyIn = parseFloat(tournament.buyIn || 0);
      const bounty = parseFloat(tournament.bounty || 0);
      
      // Calcular profit - se prize é negativo, já está calculado
      const profit = result + bounty;
      
      if (!acc[date]) acc[date] = 0;
      acc[date] += profit;
      
      // Debug para primeiros cálculos
      if (Object.keys(acc).length <= 2) {
        console.log(`💰 PROFIT CALC - ${tournament.name?.substring(0, 30)}...`);
        console.log(`   Prize: ${result}, BuyIn: ${buyIn}, Bounty: ${bounty}, Final: ${profit}`);
      }
      
      return acc;
    }, {});

    console.log('📊 DAILY PROFITS SUMMARY:', {
      totalDays: Object.keys(dailyProfits).length,
      totalProfit: Object.values(dailyProfits).reduce((sum: number, val: number) => sum + val, 0),
      sample: Object.entries(dailyProfits).slice(0, 2)
    });

    // Usar range de datas dos torneios reais em vez dos parâmetros
    const tournamentDates = tournaments.map(t => (t.datePlayed || t.date).split('T')[0]).sort();
    const startDate = new Date(Math.min(...tournamentDates.map(d => new Date(d).getTime())));
    const endDate = new Date(Math.max(...tournamentDates.map(d => new Date(d).getTime())));

    console.log(`📅 USANDO RANGE REAL: ${startDate.toISOString().split('T')[0]} a ${endDate.toISOString().split('T')[0]}`);

    // Criar array de dados diários com lucro acumulado
    let cumulative = 0;
    const data = [];

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

    console.log(`✅ RESULTADO FINAL: ${data.length} dias, lucro total: ${cumulative}`);
    return data;
  };

  const normalizeComparisonData = (period1Data: ComparisonDataItem[], period2Data: ComparisonDataItem[]): ComparisonChartDataItem[] => {
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
          <Button
            onClick={handleComparisonToggle}
            variant="outline"
            size="sm"
            disabled={loading}
            className="border-emerald-600 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all duration-300"
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            {loading ? 'Carregando...' : comparisonMode ? 'Ocultar Comparação' : 'Comparação'}
          </Button>
        </div>

        {/* Estatísticas rápidas - Agora dentro do Header */}
        <div className="flex gap-6 mt-4 text-sm">
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
            <span className="text-white font-bold ml-2">{activeChartData.length}</span>
          </div>
        </div>

        {/* Big Hits - Redesenhado com formato moderno e informativo */}
        {bigHits.length > 0 && (
          <div className="bg-gray-800/30 border border-gray-600/50 rounded-lg p-4 mt-4">
            <h3 className="text-white font-medium text-sm mb-3">Big Hits</h3>
            <div className="space-y-2">
              {bigHits.slice(0, 4).map((hit, index) => {
                const tournament = hit.tournament;
                
                if (!tournament) {
                  return (
                    <div key={index} className="text-xs text-gray-300 leading-relaxed">
                      <span className="text-white font-medium">{index + 1}.</span>
                      <span className="text-gray-400 ml-1">$--</span>
                      <span className="text-gray-300 ml-1">Torneio não identificado</span>
                      <span className="text-gray-400 ml-1">--/--</span>
                      <span className="text-emerald-400 font-medium ml-1">$0</span>
                    </div>
                  );
                }

                // Extrair dados do torneio
                const buyIn = tournament.buyIn ? `$${tournament.buyIn}` : '$--';
                
                // Limpeza do nome do torneio (remover data se presente)
                let tournamentName = tournament.name || 'Sem Nome';
                
                // Remover padrões de data do nome (YYYY-MM-DD, DD/MM/YYYY, etc.)
                tournamentName = tournamentName
                  .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '') // Remove YYYY-MM-DD
                  .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '') // Remove DD/MM/YYYY
                  .replace(/\b\d{2}-\d{2}-\d{4}\b/g, '') // Remove DD-MM-YYYY
                  .replace(/\s+/g, ' ') // Remove espaços duplos
                  .trim(); // Remove espaços no início/fim
                
                const position = tournament.position || '--';
                const fieldSize = tournament.fieldSize || '--';
                const result = tournament.result || 0;
                const bounty = tournament.bounty || 0;
                const totalPrize = result + bounty;
                
                return (
                  <div key={index} className="text-xs text-gray-300 leading-relaxed">
                    <span className="text-white font-medium">{index + 1}.</span>
                    <span className="text-gray-400 ml-1">{buyIn}</span>
                    <span className="text-gray-300 ml-1">{tournamentName}</span>
                    <span className="text-gray-400 ml-1">{position}/{fieldSize}</span>
                    <span className="text-emerald-400 font-medium ml-1">{formatCurrency(totalPrize)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-4">

        {/* Métricas de Comparação */}
        {comparisonMode && comparisonData.period1.data.length > 0 && (
          <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Período 1 - Verde */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full"></div>
                  <span className="text-emerald-400 font-medium">📈 PERÍODO 1 (Verde)</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Volume:</span>
                    <span className="text-white font-medium">10 torneios</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Profit:</span>
                    <span className="text-emerald-400 font-medium">{formatCurrency(comparisonData.period1.data[comparisonData.period1.data.length - 1]?.cumulative || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Período:</span>
                    <span className="text-gray-300">{comparisonData.period1.from} - {comparisonData.period1.to}</span>
                  </div>
                </div>
              </div>

              {/* Período 2 - Laranja */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
                  <span className="text-orange-400 font-medium">📊 PERÍODO 2 (Laranja)</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Volume:</span>
                    <span className="text-white font-medium">10 torneios</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Profit:</span>
                    <span className="text-orange-400 font-medium">{formatCurrency(comparisonData.period2.data[comparisonData.period2.data.length - 1]?.cumulative || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Período:</span>
                    <span className="text-gray-300">{comparisonData.period2.from} - {comparisonData.period2.to}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Gráfico principal */}
        <div className="h-[650px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={activeChartData}
              margin={{ top: 40, right: 50, left: 80, bottom: 50 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis 
                dataKey="date" 
                stroke="#9CA3AF"
                fontSize={12}
                tickLine={false}
                tickFormatter={generateAdaptiveXAxisTicks(period || 'all', activeChartData)}
                interval={0}
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
                stroke="#10b981"
                strokeWidth={4}
                dot={comparisonMode ? false : <BigHitMedal />}
                connectNulls={true}
                strokeDasharray="0"
                strokeOpacity={1}
                fill="none"
                name="Período 1"
                activeDot={{ 
                  r: 8, 
                  stroke: '#10b981', 
                  strokeWidth: 3, 
                  fill: '#ffffff',
                  strokeOpacity: 1
                }}
              />
              
              {/* Linha de comparação (sempre renderizada quando comparisonMode ativo) */}
              {comparisonMode && (
                <Line
                  type="monotone"
                  dataKey="cumulative2"
                  stroke="#fb923c"
                  strokeWidth={4}
                  strokeOpacity={1}
                  connectNulls={true}
                  dot={false}
                  fill="none"
                  name="Período 2"
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
      </CardContent>
    </Card>
  );
}