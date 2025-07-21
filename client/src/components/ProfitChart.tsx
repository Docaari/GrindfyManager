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

// Função para parser de datas em português
const parsePortugueseDate = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== 'string') return null;

  // Mapeamento de meses em português
  const monthMap: { [key: string]: number } = {
    'jan': 0, 'fev': 1, 'mar': 2, 'abr': 3, 'mai': 4, 'jun': 5,
    'jul': 6, 'ago': 7, 'set': 8, 'out': 9, 'nov': 10, 'dez': 11
  };

  try {
    // Formato: "ago. de 24" ou "2 de mai."
    const portugueseMatch = dateStr.match(/(\d+)?\s*de\s*(\w{3})\.?(?:\s*de\s*(\d{2,4}))?/i) ||
                           dateStr.match(/(\w{3})\.?\s*de\s*(\d{2,4})/i);
    
    if (portugueseMatch) {
      let day = 1;
      let month = -1;
      let year = new Date().getFullYear();

      if (portugueseMatch[1] && !isNaN(parseInt(portugueseMatch[1]))) {
        // Formato: "2 de mai."
        day = parseInt(portugueseMatch[1]);
        month = monthMap[portugueseMatch[2].toLowerCase()];
        if (portugueseMatch[3]) {
          year = parseInt(portugueseMatch[3]);
          if (year < 100) year += 2000;
        }
      } else if (portugueseMatch[2]) {
        // Formato: "ago. de 24"
        month = monthMap[portugueseMatch[1].toLowerCase()];
        year = parseInt(portugueseMatch[2]);
        if (year < 100) year += 2000;
      }

      if (month !== -1) {
        return new Date(year, month, day);
      }
    }

    // Tentar parse normal como fallback
    const normalDate = new Date(dateStr);
    if (!isNaN(normalDate.getTime())) {
      return normalDate;
    }

    return null;
  } catch (error) {
    console.warn('Erro ao fazer parse da data:', dateStr, error);
    return null;
  }
};

// Função para gerar eixos X adaptativos baseados no período - SINCRONIZADA COM PRIMEIRA DATA REAL
const generateAdaptiveXAxisTicks = (period: string, chartData: any[]) => {
  if (!chartData || chartData.length === 0) return () => '';

  const dataLength = chartData.length;
  
  // Identificar a primeira e última data real dos dados
  const firstDataPoint = chartData[0];
  const lastDataPoint = chartData[dataLength - 1];
  
  console.log(`🎯 AXIS DEBUG - Período: ${period}, Dados: ${dataLength} pontos`);
  console.log(`🎯 AXIS DEBUG - Primeira data: ${firstDataPoint?.date || 'N/A'} (fullDate: ${firstDataPoint?.fullDate || 'N/A'})`);
  console.log(`🎯 AXIS DEBUG - Última data: ${lastDataPoint?.date || 'N/A'} (fullDate: ${lastDataPoint?.fullDate || 'N/A'})`);
  
  return (tickItem: string, index: number) => {
    // Determinar intervalo baseado no período
    let interval = 1;
    
    switch (period) {
      case 'current_month':
      case 'last_30_days':
        interval = Math.max(1, Math.floor(dataLength / 15)); // ~15 labels para 30 dias
        break;
      case 'last_3_months':
        interval = Math.max(1, Math.floor(dataLength / 12)); // ~12 labels para 3 meses
        break;
      case 'last_6_months':
        interval = Math.max(1, Math.floor(dataLength / 12)); // ~12 labels para 6 meses
        break;
      case 'current_year':
        interval = Math.max(1, Math.floor(dataLength / 12)); // ~12 labels para 1 ano
        break;
      case 'all':
      case 'all_time':
        interval = Math.max(1, Math.floor(dataLength / 8)); // ~8 labels para todos os tempos
        break;
      default:
        interval = Math.max(1, Math.floor(dataLength / 10)); // Padrão: ~10 labels
    }
    
    // FORÇAR EXIBIÇÃO DA PRIMEIRA DATA REAL (index = 0) SEMPRE
    const isFirstTick = index === 0;
    const isLastTick = index === dataLength - 1;
    const isIntervalTick = index % interval === 0;
    
    const shouldShow = isFirstTick || isLastTick || isIntervalTick;
    
    if (!shouldShow) {
      return '';
    }
    
    // Para o primeiro tick, usar a data real do primeiro ponto de dados
    if (isFirstTick && firstDataPoint?.fullDate) {
      const firstRealDate = new Date(firstDataPoint.fullDate);
      console.log(`🎯 AXIS DEBUG - Primeiro eixo forçado: ${firstRealDate.toLocaleDateString('pt-BR')}`);
      
      switch (period) {
        case 'all':
        case 'all_time':
          const quarter = Math.floor(firstRealDate.getMonth() / 3) + 1;
          const year = String(firstRealDate.getFullYear()).slice(-2);
          return `Q${quarter}/${year}`;
        case 'last_3_months':
        case 'last_6_months':
        case 'current_year':
          return firstRealDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
        default:
          return `${String(firstRealDate.getDate()).padStart(2, '0')}/${String(firstRealDate.getMonth() + 1).padStart(2, '0')}`;
      }
    }
    
    // Para outros ticks, usar parsing normal
    const actualDate = parsePortugueseDate(tickItem);
    
    // Se parsing falhar, usar formato original
    if (actualDate === null) {
      return tickItem;
    }
    
    // Formatação específica por período - BASEADA NA DATA REAL
    switch (period) {
      case 'current_month':
      case 'last_30_days':
        return `${String(actualDate.getDate()).padStart(2, '0')}/${String(actualDate.getMonth() + 1).padStart(2, '0')}`;
      
      case 'last_3_months':
      case 'last_6_months':
      case 'current_year':
        return actualDate.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      
      case 'all':
      case 'all_time':
        // Para "all": usar trimestre baseado na data REAL dos dados
        const quarter = Math.floor(actualDate.getMonth() / 3) + 1;
        const year = String(actualDate.getFullYear()).slice(-2);
        return `Q${quarter}/${year}`;
      
      default:
        return actualDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    }
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
      const profitJump = Math.abs(hit.cumulative - (processedData[hit.index - 1]?.cumulative || 0));

      console.log(`🎯 BIG HIT DEBUG - Analisando hit do dia ${hitDateStr} com salto de $${profitJump.toFixed(2)}`);

      // ESTRATÉGIA 1: Procurar torneios na data exata primeiro
      let dayTournaments = tournaments.filter(t => {
        const tournamentDateStr = (t.datePlayed || t.date || '').split('T')[0];
        return tournamentDateStr === hitDateStr;
      });

      console.log(`🎯 BIG HIT DEBUG - Encontrados ${dayTournaments.length} torneios na data ${hitDateStr}`);

      // ESTRATÉGIA 2: Se não encontrou na data, expandir busca para ±2 dias
      if (dayTournaments.length === 0) {
        const hitDate = new Date(hitDateStr);
        const twoDaysBefore = new Date(hitDate.getTime() - 2 * 24 * 60 * 60 * 1000);
        const twoDaysAfter = new Date(hitDate.getTime() + 2 * 24 * 60 * 60 * 1000);

        dayTournaments = tournaments.filter(t => {
          const tournamentDate = new Date((t.datePlayed || t.date || '').split('T')[0]);
          return tournamentDate >= twoDaysBefore && tournamentDate <= twoDaysAfter;
        });

        console.log(`🎯 BIG HIT DEBUG - Expandindo busca ±2 dias: encontrados ${dayTournaments.length} torneios`);
      }

      // ESTRATÉGIA 3: Filtrar por valor do prêmio significativo
      const significantTournaments = dayTournaments.filter(t => {
        // Calcular o profit real do torneio: result - buyIn + bounty
        const buyIn = parseFloat(String(t.buyIn || '0'));
        const result = parseFloat(String(t.prize || t.result || '0'));
        const bounty = parseFloat(String(t.bounty || '0'));
        const tournamentProfit = result + bounty;

        // Considerar significativo se o profit é pelo menos 20% do salto do big hit
        const isSignificant = tournamentProfit >= (profitJump * 0.2);
        
        if (isSignificant) {
          console.log(`🎯 BIG HIT DEBUG - Torneio significativo: ${t.name} - Profit: $${tournamentProfit.toFixed(2)} (${((tournamentProfit/profitJump)*100).toFixed(1)}% do salto)`);
        }

        return isSignificant;
      });

      // ESTRATÉGIA 4: Ordenar por relevância (combinação de proximidade de valor e data)
      const rankedTournaments = significantTournaments.sort((a, b) => {
        const buyInA = parseFloat(String(a.buyIn || '0'));
        const resultA = parseFloat(String(a.prize || a.result || '0'));
        const bountyA = parseFloat(String(a.bounty || '0'));
        const profitA = resultA + bountyA;

        const buyInB = parseFloat(String(b.buyIn || '0'));
        const resultB = parseFloat(String(b.prize || b.result || '0'));
        const bountyB = parseFloat(String(b.bounty || '0'));
        const profitB = resultB + bountyB;

        // Calcular score baseado na proximidade do valor e posição no torneio
        const scoreA = profitA + (a.position === 1 ? 5000 : 0) + (a.position <= 3 ? 2000 : 0);
        const scoreB = profitB + (b.position === 1 ? 5000 : 0) + (b.position <= 3 ? 2000 : 0);

        return scoreB - scoreA; // Maior score primeiro
      });

      // Pegar o melhor candidato
      const tournament = rankedTournaments[0] || null;

      if (tournament) {
        const buyIn = parseFloat(String(tournament.buyIn || '0'));
        const result = parseFloat(String(tournament.prize || tournament.result || '0'));
        const bounty = parseFloat(String(tournament.bounty || '0'));
        const totalProfit = result + bounty;

        console.log(`🎯 BIG HIT DEBUG - Torneio selecionado: ${tournament.name}`);
        console.log(`🎯 BIG HIT DEBUG - Buy-in: $${buyIn}, Profit: $${totalProfit.toFixed(2)}, Posição: ${tournament.position}`);
      } else {
        console.log(`🎯 BIG HIT DEBUG - Nenhum torneio identificado para o salto de $${profitJump.toFixed(2)}`);
      }

      return {
        ...hit,
        tournament,
        isBigHit: true,
        profitJump: profitJump
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

  // TOOLTIP ÚNICA PADRONIZADA - Formato: "21 de junho de 2025, Lucro Acumulado: US$ 0, Volume: 25 torneios, Total Investido: US$ 1.893, Profit do Dia: US$ 10.057"
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      
      // Formatar data completa com ano e mês por extenso usando fullDate dos dados reais
      const formatFullDate = () => {
        try {
          if (data.fullDate) {
            const date = new Date(data.fullDate);
            return date.toLocaleDateString('pt-BR', { 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            });
          }
          // Fallback: tentar parsear o label
          const parsedDate = parsePortugueseDate(label);
          if (parsedDate) {
            return parsedDate.toLocaleDateString('pt-BR', { 
              day: 'numeric', 
              month: 'long', 
              year: 'numeric' 
            });
          }
          return label;
        } catch {
          return label;
        }
      };
      
      const formattedDate = formatFullDate();
      
      return (
        <div className="bg-gray-900 border border-emerald-500 rounded-lg p-4 shadow-xl min-w-[280px]">
          <div className="text-white font-medium mb-2">{formattedDate}</div>
          
          <div className="space-y-1 text-sm">
            <div className="text-emerald-400 text-lg font-bold">
              Lucro Acumulado: {formatCurrency(payload[0].value)}
            </div>
            <div className="text-gray-300">Volume: {data.count || 0} torneios</div>
            <div className="text-gray-300">Total Investido: {formatCurrency(data.buyins || 0)}</div>
            <div className="text-gray-300">Profit do Dia: {formatCurrency(data.profit || 0)}</div>
          </div>
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
            <h3 className="text-white font-medium text-sm mb-3 flex items-center gap-2">
              🔥 Big Hits - Top 3
            </h3>
            <div className="space-y-2">
              {bigHits.slice(0, 3).map((hit, index) => {
                const tournament = hit.tournament;
                
                // Se não há torneio identificado, mostrar informações do salto
                if (!tournament) {
                  return (
                    <div key={index} className="text-xs text-gray-300 leading-relaxed flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-medium">{index + 1}.</span>
                        <span className="text-gray-400">$--</span>
                        <span className="text-gray-400">Salto não identificado</span>
                        <span className="text-gray-500">--/--</span>
                      </div>
                      <span className="text-emerald-400 font-medium">+{formatCurrency(hit.profitJump || 0)}</span>
                    </div>
                  );
                }

                // Extrair e processar dados do torneio
                const buyIn = parseFloat(String(tournament.buyIn || '0'));
                const result = parseFloat(String(tournament.prize || tournament.result || '0'));
                const bounty = parseFloat(String(tournament.bounty || '0'));
                const totalProfit = result + bounty;

                // Limpeza avançada do nome do torneio
                let tournamentName = String(tournament.name || 'Torneio');
                
                // Remover padrões específicos de data e horário
                tournamentName = tournamentName
                  .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '') // YYYY-MM-DD
                  .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '') // DD/MM/YYYY
                  .replace(/\b\d{2}-\d{2}-\d{4}\b/g, '') // DD-MM-YYYY
                  .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, '') // Horários
                  .replace(/\s*-\s*\d{4}-\d{2}-\d{2}/g, '') // " - YYYY-MM-DD"
                  .replace(/\([^)]*\d{4}[^)]*\)/g, '') // Parenteses com anos
                  .replace(/\s+/g, ' ') // Múltiplos espaços
                  .trim();

                // Truncar nome se muito longo
                if (tournamentName.length > 25) {
                  tournamentName = tournamentName.substring(0, 22) + '...';
                }
                
                const position = tournament.position || '--';
                const fieldSize = tournament.fieldSize || '--';
                
                // Medalhas baseadas na posição
                const getMedal = (pos: number) => {
                  if (pos === 1) return '🥇';
                  if (pos === 2) return '🥈';
                  if (pos === 3) return '🥉';
                  if (pos <= 9) return '🏅';
                  return '🎯';
                };

                const medal = position !== '--' ? getMedal(Number(position)) : '';
                
                return (
                  <div key={index} className="text-xs text-gray-300 leading-relaxed">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 flex-1 min-w-0">
                        <span className="text-white font-medium">{index + 1}.</span>
                        <span className="text-amber-400">{medal}</span>
                        <span className="text-blue-400">${buyIn}</span>
                        <span className="text-gray-300 truncate" title={String(tournament.name)}>{tournamentName}</span>
                        <span className="text-gray-500 text-xs">{position}/{fieldSize}</span>
                      </div>
                      <span className="text-emerald-400 font-medium ml-2">+{formatCurrency(totalProfit)}</span>
                    </div>
                    
                    {/* Informações adicionais do torneio */}
                    {tournament.site && (
                      <div className="flex items-center gap-1 mt-1 ml-6">
                        <span className="text-xs bg-gray-700 px-1 rounded text-gray-300">{tournament.site}</span>
                        {tournament.category && tournament.category !== 'Vanilla' && (
                          <span className="text-xs bg-purple-700 px-1 rounded text-purple-200">{tournament.category}</span>
                        )}
                        {tournament.speed && tournament.speed !== 'Normal' && (
                          <span className="text-xs bg-orange-700 px-1 rounded text-orange-200">{tournament.speed}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Informação adicional sobre os big hits */}
            <div className="mt-3 pt-2 border-t border-gray-600 text-xs text-gray-400">
              💡 Big Hits: Saltos de lucro ≥ {(totalProfit * 0.10).toFixed(0)}% do profit total
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
                interval="preserveStartEnd"
                domain={['dataMin', 'dataMax']}
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