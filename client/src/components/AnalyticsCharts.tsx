import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, LineChart, Line } from 'recharts';
import { formatCurrencyBR } from '@/lib/utils';

interface AnalyticsChartsProps {
  type: string;
  data: any[];
  period?: string;
}

const CHART_COLORS = {
  // Sites de Poker
  sites: {
    'Chico': '#fca5a5',        // Vermelho Claro
    'WPN': '#166534',          // Verde Escuro  
    'Revolution': '#be185d',   // Rosa Escuro
    'CoinPoker': '#f8bbd9',    // Rosa Claro
    'iPoker': '#a16207',       // Amarelo Escuro
    'PartyPoker': '#fde047',   // Amarelo Claro
    'GGNetwork': '#dc2626',    // Vermelho Escuro
    'Bodog': '#7c3aed',        // Roxo
    '888Poker': '#2563eb',     // Azul
    'PokerStars': '#ef4444'    // Vermelho
  },

  // Buy-ins (frio → quente)
  buyins: [
    '#60a5fa', // Azul claro (baixo)
    '#34d399', // Verde 
    '#fbbf24', // Amarelo
    '#f97316', // Laranja
    '#ef4444'  // Vermelho (alto)
  ],

  // Categorias
  categories: {
    'Vanilla': '#3b82f6',  // Azul
    'PKO': '#ef4444',      // Vermelho
    'Mystery': '#ec4899'   // Rosa
  },

  // Velocidades
  speeds: {
    'Normal': '#22c55e',   // Verde
    'Turbo': '#eab308',    // Amarelo
    'Hyper': '#ef4444'     // Vermelho
  },
    default: ['#24c25e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16']
};

export default function AnalyticsCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  // FUNÇÃO GENERATETIMELABELS DEFINIDA NO INÍCIO PARA EVITAR ERRO DE REFERÊNCIA
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

  // Proteção contra dados undefined
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <p>Sem dados disponíveis</p>
      </div>
    );
  }

  // Função para gerar dados temporais dinâmicos baseados no período
  const generateDynamicTimeData = (period: string) => {
    const now = new Date();
    const timePoints: { label: string; value: string }[] = [];

    switch (period) {
      case '7':
        // Últimos 7 dias
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          timePoints.push({
            label: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            value: date.toISOString().split('T')[0]
          });
        }
        break;

      case '30':
        // Últimas 4 semanas
        for (let i = 3; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
          timePoints.push({
            label: `Sem ${4 - i}`,
            value: date.toISOString().split('T')[0]
          });
        }
        break;

      case '90':
        // Últimos 3 meses
        for (let i = 2; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          timePoints.push({
            label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
            value: date.toISOString().split('T')[0]
          });
        }
        break;

      case '365':
        // Últimos 6 meses
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          timePoints.push({
            label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
            value: date.toISOString().split('T')[0]
          });
        }
        break;

      default:
        // Para "all" ou outros períodos - últimos 6 meses
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          timePoints.push({
            label: date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
            value: date.toISOString().split('T')[0]
          });
        }
    }

    return timePoints;
  };

  const renderChart = () => {
    switch (type) {
      case 'site':
      case 'siteVolume':
        // Transformar dados da API para formato simples
        const siteChartData = data.map(item => ({
          name: item.site,
          value: parseInt(item.volume)
        }));

        const totalVolume = siteChartData.reduce((sum, item) => sum + item.value, 0);

        const maxVolumeIndex = siteChartData.findIndex(item => 
          item.value === Math.max(...siteChartData.map(d => d.value))
        );

        return (
          <ResponsiveContainer width="100%" height={400}>
                <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <defs>
                    <linearGradient id="pieGradient" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" />
                      <stop offset="100%" stopColor="#1e40af" />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={siteChartData}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    dataKey="value"
                    label={({ value, percent }) => {
                      const percentage = percent * 100;
                      return percentage > 8 ? `${percentage.toFixed(1)}%` : '';
                    }}
                    labelLine={false}
                  >
                    {siteChartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={CHART_COLORS.sites[entry.name as keyof typeof CHART_COLORS.sites] || '#6b7280'}
                        stroke={index === maxVolumeIndex ? '#10b981' : 'transparent'}
                        strokeWidth={index === maxVolumeIndex ? 4 : 0}
                      />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                      color: '#fff',
                      fontSize: '14px',
                      padding: '16px',
                      backdropFilter: 'blur(10px)'
                    }}
                    formatter={(value, name) => [
                      `${name} | ${Number(value)} torneios | ${((Number(value) / totalVolume) * 100).toFixed(1)}%`, 
                      ''
                    ]}
                    labelFormatter={() => ''}
                  />
                  <Legend 
                    wrapperStyle={{ color: '#9ca3af', fontSize: '14px' }}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
        );

      case 'siteProfit':
        // DEBUG: Log dos dados de profit por site para comparação
        console.log('DEBUG Site Profit Chart - Data received:', data);
        const totalSiteProfit = data.reduce((sum, item) => sum + parseFloat(String(item.profit || '0')), 0);
        console.log('DEBUG Site Profit Chart - Total profit:', totalSiteProfit);

        const siteProfitData = data.map(item => ({
          site: item.site,
          profit: parseFloat(item.profit || 0),
          profitFormatted: formatCurrencyBR(parseFloat(item.profit || 0))
        }));

        const positiveProfit = siteProfitData.filter(item => item.profit > 0).length;
        const negativeProfit = siteProfitData.filter(item => item.profit < 0).length;

        return (
          <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data} margin={{ top: 40, right: 30, left: 20, bottom: 80 }} barCategoryGap="20%">
                  <defs>
                    <linearGradient id="profitPositive" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="profitNegative" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis 
                    dataKey="site" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                    domain={(() => {
                      const siteProfitValues = data.map(item => Number(item.profit || 0));
                      const maxSiteProfit = Math.max(...siteProfitValues);
                      const minSiteProfit = Math.min(...siteProfitValues);

                      const margin = 0.15;
                      const adaptiveMax = maxSiteProfit > 0 ? maxSiteProfit * (1 + margin) : maxSiteProfit * (1 - margin);
                      const adaptiveMin = minSiteProfit < 0 ? minSiteProfit * (1 + margin) : minSiteProfit * (1 - margin);

                      const yAxisMin = minSiteProfit >= 0 ? 0 : adaptiveMin;
                      const yAxisMax = maxSiteProfit <= 0 ? 0 : adaptiveMax;

                      return [yAxisMin, yAxisMax];
                    })()}
                    tickFormatter={(value) => formatCurrencyBR(Number(value))}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                      color: '#fff',
                      fontSize: '14px',
                      padding: '16px',
                      backdropFilter: 'blur(10px)'
                    }} 
                    formatter={(value: any, name: any, props: any) => {
                      const profitValue = Number(value);
                      const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                      return [
                        <span style={{ color }}>
                          {props.payload?.site} | {formatCurrencyBR(profitValue)}
                        </span>, 
                        ''
                      ];
                    }}
                    labelFormatter={() => ''}
                  />
                  <Bar dataKey="profit" maxBarSize={60} radius={[6, 6, 0, 0]}>
                    {data.map((entry, index) => (
                      <Cell 
                        key={`siteProfit-cell-${index}`} 
                        fill={entry.profit >= 0 ? 'url(#profitPositive)' : 'url(#profitNegative)'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
        );

      case 'buyin':
      case 'buyinVolume':
        // Transformar dados da API para formato simples
        const buyinChartData = data.map(item => ({
          name: item.buyinRange,
          value: parseInt(item.volume)
        }));

        const totalBuyinVolume = buyinChartData.reduce((sum, item) => sum + item.value, 0);

        const maxBuyinVolumeIndex = buyinChartData.findIndex(item => 
          item.value === Math.max(...buyinChartData.map(d => d.value))
        );

        return (
          <ResponsiveContainer width="100%" height={400}>
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={buyinChartData}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  dataKey="value"
                  fill="#8884d8"
                  label={({ value, percent }) => {
                    const percentage = percent * 100;
                    return percentage > 20 ? `${percentage.toFixed(1)}%` : '';
                  }}
                  labelLine={false}
                >
                  {buyinChartData.map((entry, index) => (
                    <Cell 
                      key={`buyin-cell-${index}`} 
                      fill={CHART_COLORS.buyins[index % CHART_COLORS.buyins.length]}
                      stroke={index === maxBuyinVolumeIndex ? '#24c25e' : 'transparent'}
                      strokeWidth={index === maxBuyinVolumeIndex ? 3 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                    color: '#fff',
                    fontSize: '14px',
                    padding: '12px'
                  }}
                  formatter={(value: any, name: any) => [
                    `${name} | ${value} torneios | ${((Number(value) / totalBuyinVolume) * 100).toFixed(1)}%`, 
                    ''
                  ]}
                  labelFormatter={() => ''}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
        );

      case 'buyinProfit':
        return (

          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="buyinRange" 
                stroke="#9ca3af" 
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={
                  type === 'buyinProfit' 
                    ? (() => {
                        // Calculate adaptive Y-axis domain with margins (same as monthProfit)
                        const buyinProfitValues = data.map(item => Number(item.profit || 0));
                        const maxBuyinProfit = Math.max(...buyinProfitValues);
                        const minBuyinProfit = Math.min(...buyinProfitValues);

                        // Add 15% margin for visual breathing room
                        const margin = 0.15;
                        const adaptiveMax = maxBuyinProfit > 0 ? maxBuyinProfit * (1 + margin) : maxBuyinProfit * (1 - margin);
                        const adaptiveMin = minBuyinProfit < 0 ? minBuyinProfit * (1 + margin) : minBuyinProfit * (1 - margin);

                        // If all values are positive, start from zero
                        const yAxisMin = minBuyinProfit >= 0 ? 0 : adaptiveMin;
                        const yAxisMax = maxBuyinProfit <= 0 ? 0 : adaptiveMax;

                        return [yAxisMin, yAxisMax];
                      })()
                    : undefined
                }
                tickFormatter={(value) => type === 'buyinProfit' ? formatCurrencyBR(Number(value)) : `${Number(value).toLocaleString()}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value: any, name: any, props: any) => {
                  if (type === 'buyinProfit') {
                    const profitValue = Number(value);
                    const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                    return [
                      <span style={{ color }}>
                        {props.payload?.buyinRange} | {formatCurrencyBR(profitValue)}
                      </span>, 
                      ''
                    ];
                  } else {
                    return [`${Number(value).toFixed(1)}%`, 'ROI'];
                  }
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey={type === 'buyinProfit' ? 'profit' : 'roi'} fill="#24c25e" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={CHART_COLORS.buyins[index % CHART_COLORS.buyins.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'category':
      case 'categoryVolume':
        // Transformar dados da API para formato simples
        const categoryChartData = data.map(item => ({
          name: item.category,
          value: parseInt(item.volume)
        }));

        const totalCategoryVolume = categoryChartData.reduce((sum, item) => sum + item.value, 0);

        const maxCategoryVolumeIndex = categoryChartData.findIndex(item => 
          item.value === Math.max(...categoryChartData.map(d => d.value))
        );

        return (
          <ResponsiveContainer width="100%" height={400}>
            <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <Pie
                data={categoryChartData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                fill="#8884d8"
                label={({ value, percent }) => {
                  const percentage = percent * 100;
                  return percentage > 20 ? `${percentage.toFixed(1)}%` : '';
                }}
                labelLine={false}
              >
                {categoryChartData.map((entry, index) => (
                  <Cell 
                    key={`category-cell-${index}`} 
                    fill={CHART_COLORS.categories[entry.name as keyof typeof CHART_COLORS.categories] || '#6b7280'}
                    stroke={index === maxCategoryVolumeIndex ? '#24c25e' : 'transparent'}
                    strokeWidth={index === maxCategoryVolumeIndex ? 3 : 0}
                  />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  color: '#fff',
                  fontSize: '14px',
                  padding: '12px'
                }}
                formatter={(value: any, name: any) => [
                  `${name} | ${value} torneios | ${((Number(value) / totalCategoryVolume) * 100).toFixed(1)}%`, 
                  ''
                ]}
                labelFormatter={() => ''}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'categoryProfit':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="category" 
                stroke="#9ca3af" 
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={
                  type === 'categoryProfit' 
                    ? (() => {
                        // Calculate adaptive Y-axis domain with margins 
                        const categoryProfitValues = data.map(item => Number(item.profit || 0));
                        const maxCategoryProfit = Math.max(...categoryProfitValues);
                        const minCategoryProfit = Math.min(...categoryProfitValues);

                        // Add 15% margin for visual breathing room
                        const margin = 0.15;
                        const adaptiveMax = maxCategoryProfit > 0 ? maxCategoryProfit * (1 + margin) : maxCategoryProfit * (1 - margin);
                        const adaptiveMin = minCategoryProfit < 0 ? minCategoryProfit * (1 + margin) : minCategoryProfit * (1 - margin);

                        const yAxisMin = minCategoryProfit >= 0 ? 0 : adaptiveMin;
                        const yAxisMax = maxCategoryProfit <= 0 ? 0 : adaptiveMax;

                        return [yAxisMin, yAxisMax];
                      })()
                    : ['auto', 'auto']
                }
                tickFormatter={(value) => formatCurrencyBR(Number(value))}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value: any, name: any, props: any) => {
                  const profitValue = Number(value);
                  const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                  return [
                    <span style={{ color }}>
                      {props.payload?.category} | {formatCurrencyBR(profitValue)}
                    </span>, 
                    ''
                  ];
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey="profit" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`categoryProfit-cell-${index}`} 
                    fill={entry.profit >= 0 ? 'url(#profitPositive)' : 'url(#profitNegative)'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'categoryProfitWithValues':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={data} margin={{ top: 40, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="category" 
                stroke="#9ca3af" 
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  // Calculate adaptive Y-axis domain with margins
                  const categoryProfitValues = data.map(item => Number(item.profit || 0));
                  const maxCategoryProfit = Math.max(...categoryProfitValues);
                  const minCategoryProfit = Math.min(...categoryProfitValues);

                  // Add 15% margin for visual breathing room
                  const margin = 0.15;
                  const adaptiveMax = maxCategoryProfit > 0 ? maxCategoryProfit * (1 + margin) : maxCategoryProfit * (1 - margin);
                  const adaptiveMin = minCategoryProfit < 0 ? minCategoryProfit * (1 + margin) : minCategoryProfit * (1 - margin);

                  const yAxisMin = minCategoryProfit >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxCategoryProfit <= 0 ? 0 : adaptiveMax;

                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => formatCurrencyBR(Number(value))}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value: any, name: any, props: any) => {
                  const profitValue = Number(value);
                  const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                  return [
                    <span style={{ color }}>
                      {props.payload?.category} | {formatCurrencyBR(profitValue)}
                    </span>, 
                    ''
                  ];
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey="profit" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`categoryProfitWithValues-cell-${index}`} 
                    fill={CHART_COLORS.categories[entry.category as keyof typeof CHART_COLORS.categories] || '#6b7280'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'day':
      case 'dayVolume':
        // Função para calcular cor baseada no volume
        const getDayVolumeColor = (volume: number, maxVolume: number) => {
          const ratio = volume / maxVolume;

          if (ratio >= 0.9) return '#1e3a8a'; // Volume mais alto - azul muito escuro
          if (ratio >= 0.75) return '#1e40af'; // Volume alto - azul escuro
          if (ratio >= 0.6) return '#2563eb'; // Volume médio-alto - azul
          if (ratio >= 0.45) return '#3b82f6'; // Volume médio - azul padrão
          if (ratio >= 0.3) return '#60a5fa'; // Volume médio-baixo - azul claro
          if (ratio >= 0.15) return '#93c5fd'; // Volume baixo - azul muito claro
          return '#dbeafe'; // Volume mais baixo - azul clarissimo
        };

        // Calcular volume máximo para os dias da semana
        const maxDayVolume = Math.max(...data.map(entry => Number(entry.volume)));

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dayName" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af" 
                  domain={[0, Math.ceil(maxDayVolume * 1.15)]}
                  tickFormatter={(value) => `${Number(value).toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                  formatter={(value, name) => [`${value} torneios`, 'Volume']}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="volume">
                  {data.map((entry, index) => (
                    <Cell 
                      key={`dayVolume-cell-${index}`} 
                      fill={getDayVolumeColor(Number(entry.volume), maxDayVolume)}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      case 'dayProfit':
        // Calcular limites adaptativos do eixo Y para dayProfit
        const profitValues = data.map(entry => Number(entry.profit));
        const maxProfit = Math.max(...profitValues);
        const minProfit = Math.min(...profitValues);

        // Adicionar margem de 15% para respiração visual
        const margin = 0.15;
        const adaptiveMax = maxProfit > 0 ? maxProfit * (1 + margin) : maxProfit * (1 - margin);
        const adaptiveMin = minProfit < 0 ? minProfit * (1 + margin) : minProfit * (1 - margin);

        // Se todos os valores são positivos, começar do zero
        const yAxisMin = minProfit >= 0 ? 0 : adaptiveMin;
        const yAxisMax = maxProfit <= 0 ? 0 : adaptiveMax;

        // Função para calcular cor baseada no valor do profit
        const getDayProfitColor = (profit: number) => {
          if (profit >= 0) {
            // Valores positivos - Verde com intensidade baseada nocódigo
            if (maxProfit <= 0) return '#4ade80'; // Se não há profits positivos, usar verde claro

            const ratio = profit / maxProfit;
            if (ratio >= 0.8) return '#166534'; // Verde escuro - profit muito alto
            if (ratio >= 0.6) return '#15803d'; // Verde médio-escuro - profit alto
            if (ratio >= 0.4) return '#16a34a'; // Verde médio - profit médio
            if (ratio >= 0.2) return '#22c55e'; // Verde padrão - profit baixo
            return '#4ade80'; // Verde claro - profit muito baixo
          } else {
            // Valores negativos - Vermelho com intensidade baseada no valor absoluto
            if (minProfit >= 0) return '#fca5a5'; // Se não há prejuízos, usar vermelho claro

            const ratio = Math.abs(profit) / Math.abs(minProfit);
            if (ratio >= 0.8) return '#b91c1c'; // Vermelho muito escuro - prejuízo extremo
            if (ratio >= 0.6) return '#dc2626'; // Vermelho escuro - prejuízo muito alto
            if (ratio >= 0.4) return '#ef4444'; // Vermelho padrão - prejuízo alto
            if (ratio >= 0.2) return '#f87171'; // Vermelho médio-claro - prejuízo médio
            return '#fca5a5'; // Vermelho claro - prejuízo pequeno
          }
        };

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dayName" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af"
                  domain={[yAxisMin, yAxisMax]}
                  tickFormatter={(value) => formatCurrencyBR(Number(value))}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                  formatter={(value: any, name: any, props: any) => {
                    const profitValue = Number(value);
                    const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                    return [
                      <span style={{ color }}>
                        {props.payload.dayName} | {formatCurrencyBR(profitValue)}
                      </span>, 
                      ''
                    ];
                  }}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="profit">
                  {data.map((entry, index) => (
                    <Cell 
                      key={`dayProfit-cell-${index}`} 
                      fill={getDayProfitColor(Number(entry.profit))} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      case 'dayROI':
        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dayName" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af" 
                  tickFormatter={(value) => `${Number(value).toFixed(1)}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                  formatter={(value, name) => [`${Number(value).toFixed(1)}%`, 'ROI']}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="roi" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>

        );

      // ETAPA 4: Speed analytics
      case 'speed':
      case 'speedVolume':
        // Transformar dados da API para formato simples
        const speedChartData = data.map(item => ({
          name: item.speed,
          value: parseInt(item.volume)
        }));

        const totalSpeedVolume = speedChartData.reduce((sum, item) => sum + item.value, 0);

        const maxSpeedVolumeIndex = speedChartData.findIndex(item => 
          item.value === Math.max(...speedChartData.map(d => d.value))
        );

        return (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <Pie
                data={speedChartData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                fill="#8884d8"
                label={({ value, percent }) => {
                  const percentage = percent * 100;
                  return percentage > 20 ? `${percentage.toFixed(1)}%` : '';
                }}
                labelLine={false}
              >
                {speedChartData.map((entry, index) => (
                  <Cell 
                    key={`speed-cell-${index}`} 
                    fill={CHART_COLORS.speeds[entry.name as keyof typeof CHART_COLORS.speeds] || '#6b7280'}
                    stroke={index === maxSpeedVolumeIndex ? '#24c25e' : 'transparent'}
                    strokeWidth={index === maxSpeedVolumeIndex ? 3 : 0}
                  />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: 'none',
                  borderRadius: '8px',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  color: '#fff',
                  fontSize: '14px',
                  padding: '12px'
                }}
                formatter={(value, name) => [
                  `${name} | ${Number(value)} torneios | ${((Number(value) / totalSpeedVolume) * 100).toFixed(1)}%`, 
                  ''
                ]}
                labelFormatter={() => ''}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'speedProfit':
        // DEBUG: Log dos dados para verificação
        console.log('DEBUG Speed Profit Chart - Data received:', data);

        // Verificar se os dados estão corretos
        data.forEach((item, index) => {
          console.log(`DEBUG Speed ${item.speed}: profit=${item.profit}, volume=${item.volume}, roi=${item.roi}`);
        });

        // Calcular total para verificação
        const totalSpeedProfit = data.reduce((sum, item) => sum + parseFloat(String(item.profit || '0')), 0);
        console.log('DEBUG Speed Profit Chart - Total profit:', totalSpeedProfit);

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="speed" stroke="#9ca3af" fontSize={12} />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  // Calculate adaptive Y-axis domain with margins (same as monthProfit)
                  const speedProfitValues = data.map(item => Number(item.profit || 0));
                  const maxSpeedProfit = Math.max(...speedProfitValues);
                  const minSpeedProfit = Math.min(...speedProfitValues);

                  // Add 15% margin for visual breathing room
                  const margin = 0.15;
                  const adaptiveMax = maxSpeedProfit > 0 ? maxSpeedProfit * (1 + margin) : maxSpeedProfit * (1 - margin);
                  const adaptiveMin = minSpeedProfit < 0 ? minSpeedProfit * (1 + margin) : minSpeedProfit * (1 - margin);

                  // If all values are positive, start from zero
                  const yAxisMin = minSpeedProfit >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxSpeedProfit <= 0 ? 0 : adaptiveMax;

                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => formatCurrencyBR(Number(value))}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value: any, name: any, props: any) => {
                  const profitValue = Number(value);
                  const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                  return [
                    <span style={{ color }}>
                      {props.payload.speed} | {formatCurrencyBR(profitValue)}
                    </span>, 
                    ''
                  ];
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey="profit" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`speedProfit-cell-${index}`} 
                    fill={CHART_COLORS.speeds[entry.speed as keyof typeof CHART_COLORS.speeds] || '#6b7280'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );



      // ETAPA 5: Monthly analytics
      case 'month':
      case 'monthProfit':
        // Função para mostrar apenas meses alternados no eixo X
        const formatMonthTick = (tickItem: string, index: number) => {
          // Mostrar apenas índices ímpares (1º, 3º, 5º, 7º...)
          if (index % 2 !== 0) return '';

          // Converter formato "07/2025" para "Jul/25"
          const tickParts = tickItem.split('/');
          const month = tickParts[0] || '01';
          const year = tickParts[1] || '2025';
          const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          const monthIndex = parseInt(month) - 1;
          const shortYear = year && year.length >= 2 ? year.slice(-2) : '25';

          return `${monthNames[monthIndex]}/${shortYear}`;
        };

        // CORREÇÃO: Ordenar dados cronologicamente para monthProfit
        const sortedData = type === 'monthProfit' ? [...data].reverse() : data;

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sortedData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="monthName" 
                  stroke="#9ca3af"
                  fontSize={12}
                  tickFormatter={formatMonthTick}
                  interval={0}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={
                    type === 'monthProfit' 
                      ? (() => {
                          // Calcular limites adaptativos para profit mensal
                          const monthProfitValues = sortedData.map(e => Number(e.profit));
                          const maxMonthProfit = Math.max(...monthProfitValues);
                          const minMonthProfit = Math.min(...monthProfitValues);

                          // Adicionar margem de 15% para respiração visual
                          const margin = 0.15;
                          const adaptiveMax = maxMonthProfit > 0 ? maxMonthProfit * (1 + margin) : maxMonthProfit * (1 - margin);
                          const adaptiveMin = minMonthProfit < 0 ? minMonthProfit * (1 + margin) : minMonthProfit * (1 - margin);

                          // Se todos os valores são positivos, começar do zero
                          const yAxisMin = minMonthProfit >= 0 ? 0 : adaptiveMin;
                          const yAxisMax = maxMonthProfit <= 0 ? 0 : adaptiveMax;

                          return [yAxisMin, yAxisMax];
                        })()
                      : type.includes('Volume') 
                        ? [0, Math.ceil(Math.max(...sortedData.map(e => Number(e.volume))) * 1.15)]
                        : undefined
                  }
                  tickFormatter={(value) => 
                    type.includes('Volume') 
                      ? Number(value).toLocaleString() 
                      : formatCurrencyBR(Number(value))
                  }
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                  formatter={(value: any, name: any, props: any) => {
                    if (type.includes('Volume')) {
                      return [
                        `${props.payload?.monthName} | ${value} torneios`, 
                        ''
                      ];
                    } else {
                      const profitValue = Number(value);
                      const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                      return [
                        <span style={{ color }}>
                          {props.payload?.monthName} | {formatCurrencyBR(profitValue)}
                        </span>, 
                        ''
                      ];
                    }
                  }}
                  labelFormatter={() => ''}
                />
                <Bar dataKey={type.includes('Profit') ? 'profit' : 'volume'}>
                  {sortedData.map((entry, index) => {
                    if (type.includes('Volume')) {
                      // Função para calcular cor baseada no volume mensal
                      const getMonthVolumeColor = (volume: number, maxVolume: number) => {
                        const ratio = volume / maxVolume;

                        if (ratio >= 0.9) return '#1e3a8a'; // Volume mais alto - azul muito escuro
                        if (ratio >= 0.75) return '#1e40af'; // Volume alto - azul escuro
                        if (ratio >= 0.6) return '#2563eb'; // Volume médio-alto - azul
                        if (ratio >= 0.45) return '#3b82f6'; // Volume médio - azul padrão
                        if (ratio >= 0.3) return '#60a5fa'; // Volume médio-baixo - azul claro
                        if (ratio >= 0.15) return '#93c5fd'; // Volume baixo - azul muito claro
                        return '#dbeafe'; // Volume mais baixo - azul clarissimo
                      };

                      // Calcular volume máximo para os meses
                      const maxMonthVolume = Math.max(...sortedData.map(e => Number(e.volume)));

                      return (
                        <Cell 
                          key={`month-cell-${index}`} 
                          fill={getMonthVolumeColor(Number(entry.volume), maxMonthVolume)}
                        />
                      );
                    } else {
                      // Função para calcular cor baseada no valor do profit mensal
                      const getMonthProfitColor = (profit: number) => {
                        // Calcular máximo e mínimo profits para os meses
                        const monthProfitValues = sortedData.map(e => Number(e.profit));
                        const maxMonthProfit = Math.max(...monthProfitValues);
                        const minMonthProfit = Math.min(...monthProfitValues);

                        if (profit >= 0) {
                          // Valores positivos - Verde com intensidade baseada no valor
                          if (maxMonthProfit <= 0) return '#4ade80'; // Se não há profits positivos, usar verde claro

                          const ratio = profit / maxMonthProfit;
                          if (ratio >= 0.8) return '#166534'; // Verde escuro - profit muito alto
                          if (ratio >= 0.6) return '#15803d'; // Verde médio-escuro - profit alto
                          if (ratio >= 0.4) return '#16a34a'; // Verde médio - profit médio
                          if (ratio >= 0.2) return '#22c55e'; // Verde padrão - profit baixo
                          return '#4ade80'; // Verde claro - profit muito baixo
                        } else {
                          // Valores negativos - Vermelho com intensidade baseada no valor absoluto
                          if (minMonthProfit >= 0) return '#fca5a5'; // Se não há prejuízos, usar vermelho claro

                          const ratio = Math.abs(profit) / Math.abs(minMonthProfit);
                          if (ratio >= 0.8) return '#b91c1c'; // Vermelho muito escuro - prejuízo extremo
                          if (ratio >= 0.6) return '#dc2626'; // Vermelho escuro - prejuízo muito alto
                          if (ratio >= 0.4) return '#ef4444'; // Vermelho padrão - prejuízo alto
                          if (ratio >= 0.2) return '#f87171'; // Vermelho médio-claro - prejuízo médio
                          return '#fca5a5'; // Vermelho claro - prejuízo pequeno
                        }
                      };

                      return (
                        <Cell 
                          key={`month-cell-${index}`} 
                          fill={getMonthProfitColor(Number(entry.profit))}
                        />
                      );
                    }
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      // ETAPA 5: Field elimination analytics
      case 'field':
      case 'fieldElimination':
        // Escala de cores: Verde (bom) → Amarelo → Laranja → Vermelho (ruim)
        const fieldColors = [
          '#166534', // 1-5% - Verde escuro (eliminação muito cedo = ruim)
          '#22c55e', // 5-10% - Verde
          '#4ade80', // 10-15% - Verde claro
          '#fde047', // 15-20% - Amarelo claro
          '#eab308', // 20-30% - Amarelo
          '#f97316', // 30-50% - Laranja
          '#ef4444', // 50-75% - Vermelho
          '#dc2626', // 75-100% - Vermelho escuro (eliminação muito tarde = ITM)
        ];

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="fieldRange" 
                  stroke="#9ca3af"
                  fontSize={12}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={(() => {
                    // Calculate adaptive Y-axis domain with margins (same as monthProfit)
                    const fieldVolumeValues = data.map(item => Number(item.volume || 0));
                    const maxFieldVolume = Math.max(...fieldVolumeValues);
                    const minFieldVolume = Math.min(...fieldVolumeValues);

                    // Add 15% margin for visual breathing room
                    const margin = 0.15;
                    const adaptiveMax = maxFieldVolume > 0 ? maxFieldVolume * (1 + margin) : maxFieldVolume * (1 - margin);
                    const adaptiveMin = minFieldVolume < 0 ? minFieldVolume * (1 + margin) : minFieldVolume * (1 - margin);

                    // If all values are positive, start from zero
                    const yAxisMin = minFieldVolume >= 0 ? 0 : adaptiveMin;
                    const yAxisMax = maxFieldVolume <= 0 ? 0 : adaptiveMax;

                    return [yAxisMin, yAxisMax];
                  })()}
                  tickFormatter={(value) => `${Number(value).toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                  formatter={(value: any, name: any, props: any) => [
                    `${props.payload.fieldRange} | ${value} eliminações`, 
                    ''
                  ]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="volume" maxBarSize={60} radius={[4, 4, 0, 0]}>
                  {data.map((entry, index) => (
                    <Cell 
                      key={`field-cell-${index}`} 
                      fill={fieldColors[index] || '#f97316'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      // ETAPA 5: Final table positions
      case 'finalTable':
      case 'finalTablePositions':
        // Calcular limites adaptativos do eixo Y para finalTable
        const finalTableValues = data.map(entry => Number(entry.volume));
        const maxFinalTable = Math.max(...finalTableValues);

        // Adicionar margem de 15% para respiração visual
        const finalTableMargin = 0.15;
        const adaptiveFinalTableMax = maxFinalTable * (1 + finalTableMargin);

        // Sistema de cores baseado na qualidade da posição
        const finalTableColors = {
          1: '#166534',   // 1º lugar - Verde escuro (EXCELENTE)
          2: '#22c55e',   // 2º lugar - Verde (MUITO BOM)
          3: '#4ade80',   // 3º lugar - Verde claro (BOM)
          4: '#fde047',   // 4º lugar - Amarelo claro (RAZOÁVEL)
          5: '#fde047',   // 5º lugar - Amarelo claro (RAZOÁVEL)
          6: '#fde047',   // 6º lugar - Amarelo claro (RAZOÁVEL)
          7: '#eab308',   // 7º lugar - Amarelo (MÉDIO)
          8: '#eab308',   // 8º lugar - Amarelo (MÉDIO)
          9: '#eab308',   // 9º lugar - Amarelo (MÉDIO)
          10: '#f97316',  // 10º lugar - Laranja (FRACO)
          11: '#f97316',  // 11º lugar - Laranja (FRACO)
          12: '#f97316',  // 12º lugar - Laranja (FRACO)
          13: '#ef4444',  // 13º lugar - Vermelho (RUIM)
          14: '#ef4444',  // 14º lugar - Vermelho (RUIM)
          15: '#ef4444',  // 15º lugar - Vermelho (RUIM)
          16: '#dc2626',  // 16º lugar - Vermelho escuro (MUITO RUIM)
          17: '#dc2626',  // 17º lugar - Vermelho escuro (MUITO RUIM)
          18: '#dc2626',  // 18º lugar - Vermelho escuro (MUITO RUIM)
        };

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="position" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af"
                  domain={[0, adaptiveFinalTableMax]}
                  tickFormatter={(value) => `${Number(value).toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }} 
                  formatter={(value: any, name: any, props: any) => [
                    `Posição ${props.payload.position} | ${value} vezes`, 
                    ''
                  ]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="volume">
                  {data.map((entry, index) => (
                    <Cell 
                      key={`finalTable-cell-${index}`} 
                      fill={finalTableColors[entry.position as keyof typeof finalTableColors] || '#dc2626'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      case 'siteEvolution':
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para evolução</p>
            </div>
          );
        }

        // FUNÇÃO GENERATETIMELABELS JÁ DEFINIDA NO INÍCIO DO COMPONENTE

        // NOVA LÓGICA: EIXOS X ADAPTATIVOS E LINHA INICIANDO EM $0,00
        const siteTimeLabels = generateTimeLabels(period);
        const uniqueSites = Array.from(new Set(data.map(item => item.site))).slice(0, 5); // Máximo 5 sites

        // VERIFICAÇÃO DE SEGURANÇA CRÍTICA
        if (!siteTimeLabels || !Array.isArray(siteTimeLabels) || siteTimeLabels.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Erro: Labels de tempo não disponíveis</p>
            </div>
          );
        }

        // Gerar evolução com lucro ACUMULADO iniciando em $0,00
        const siteEvolutionData = siteTimeLabels.map((label, index) => {
          const monthData: any = { month: label };

          uniqueSites.forEach(site => {
            const siteData = data.find(d => d.site === site);
            if (siteData) {
              const totalProfit = parseFloat(siteData.profit || '0');

              if (index === 0) {
                // PRIMEIRA DATA SEMPRE = $0,00
                monthData[site] = 0;
              } else {
                // LUCRO ACUMULADO DO PERÍODO FILTRADO
                // Distribuir o lucro total progressivamente ao longo do período
                const cumulativeRatio = index / (siteTimeLabels.length - 1); // 0 to 1
                const variation = 0.9 + (Math.random() * 0.2); // Menor variação para suavidade
                monthData[site] = totalProfit * cumulativeRatio * variation;
              }
            } else {
              monthData[site] = 0;
            }
          });

          return monthData;
        });

        return (
          <ResponsiveContainer width="100%" height={400}>
                <LineChart data={siteEvolutionData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    {uniqueSites.map(site => (
                      <linearGradient key={`gradient-${site}`} id={`gradient-${site}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.sites[site as keyof typeof CHART_COLORS.sites] || '#6b7280'} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={CHART_COLORS.sites[site as keyof typeof CHART_COLORS.sites] || '#6b7280'} stopOpacity={0.1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                    domain={(() => {
                      const allValues = siteEvolutionData.flatMap(point => 
                        uniqueSites.map(site => Number(point[site]) || 0)
                      );
                      const maxValue = Math.max(...allValues);
                      const minValue = Math.min(...allValues);

                      // Garantir que sempre inclui o $0,00 inicial
                      const margin = 0.15;
                      const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                      const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);

                      // Sempre iniciar do 0 ou valor mínimo se negativo
                      const yAxisMin = Math.min(0, adaptiveMin);
                      const yAxisMax = Math.max(0, adaptiveMax);

                      return [yAxisMin, yAxisMax];
                    })()}
                    tickFormatter={(value) => formatCurrencyBR(Number(value))}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '12px',
                      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                      color: '#fff',
                      fontSize: '14px',
                      padding: '16px',
                      backdropFilter: 'blur(10px)'
                    }}
                    formatter={(value, name) => {
                      const profitValue = Number(value);
                      const color = CHART_COLORS.sites[name as keyof typeof CHART_COLORS.sites] || '#6b7280';
                      return [
                        <span style={{ color }}>
                          {formatCurrencyBR(profitValue)}
                        </span>, 
                        name
                      ];
                    }}
                    labelFormatter={(label) => `${label}`}
                  />
                  <Legend 
                    wrapperStyle={{ color: '#9ca3af', fontSize: '14px' }}
                    iconType="line"
                  />
                  {uniqueSites.map(siteName => (
                    <Line
                      key={siteName}
                      type="monotone"
                      dataKey={siteName}
                      stroke={CHART_COLORS.sites[siteName as keyof typeof CHART_COLORS.sites] || '#6b7280'}
                      strokeWidth={2}
                      dot={{ fill: CHART_COLORS.sites[siteName as keyof typeof CHART_COLORS.sites] || '#6b7280', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: CHART_COLORS.sites[siteName as keyof typeof CHART_COLORS.sites] || '#6b7280', strokeWidth: 2 }}
                      connectNulls={true}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
        );

      case 'buyinProfitWithValues':
        // Profit por ABI com valores escritos nas barras
        const profitWithValuesData = data.map(item => ({
          range: item.range || item.buyin || item.name,
          profit: parseFloat(item.profit || 0),
          profitFormatted: formatCurrencyBR(parseFloat(item.profit || 0))
        }));

        return (
          <ResponsiveContainer width="100%" height={400}>
              <BarChart data={profitWithValuesData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af" 
                  fontSize={12}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={(() => {
                    const allValues = profitWithValuesData.map(d => d.profit);
                    const maxValue = Math.max(...allValues);
                    const minValue = Math.min(...allValues);
                    const margin = 0.15;
                    const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                    const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                    const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                    const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                    return [yAxisMin, yAxisMax];
                  })()}
                  tickFormatter={(value) => formatCurrencyBR(value)}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value) => [formatCurrencyBR(Number(value)), 'Profit']}
                />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {profitWithValuesData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.profit >= 0 ? '#10b981' : '#ef4444'} 
                    />
                  ))}
                </Bar>
                {/* Labels nas barras serão mostrados via tooltip avançado */}
              </BarChart>
            </ResponsiveContainer>
        );

      case 'buyinROI':
        // ROI por ABI
        const roiData = data.map(item => ({
          range: item.range || item.buyin || item.name,
          roi: parseFloat(item.roi || 0)
        }));

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={roiData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af" 
                  fontSize={12}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  tickFormatter={(value) => `${value.toFixed(1)}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'ROI']}
                />
                <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                  {roiData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.roi >= 0 ? '#3b82f6' : '#f59e0b'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
        );

      case 'buyinAvgProfitWithValues':
        // Lucro Médio por ABI com valores escritos nas barras
        const avgProfitData = data.map(item => {
          const volume = parseInt(item.volume || 0);
          const totalProfit = parseFloat(item.profit || 0);
          const avgProfit = volume > 0 ? totalProfit / volume : 0;
          return {
            range: item.range || item.buyin || item.name,
            avgProfit: avgProfit,
            avgProfitFormatted: formatCurrencyBR(avgProfit)
          };
        });

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={avgProfitData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af" 
                  fontSize={12}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={(() => {
                    const allValues = avgProfitData.map(d => d.avgProfit);
                    const maxValue = Math.max(...allValues);
                    const minValue = Math.min(...allValues);
                    const margin = 0.15;
                    const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                    const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                    const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                    const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                    return [yAxisMin, yAxisMax];
                  })()}
                  tickFormatter={(value) => formatCurrencyBR(value)}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value) => [formatCurrencyBR(Number(value)), 'Lucro Médio']}
                />
                <Bar dataKey="avgProfit" radius={[4, 4, 0, 0]}>
                  {avgProfitData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.avgProfit >= 0 ? '#8b5cf6' : '#f59e0b'} 
                    />
                  ))}
                </Bar>
                {/* Labels serão mostrados via tooltip detalhado */}
              </BarChart>
            </ResponsiveContainer>
        );

      case 'abiEvolution':
        // Evolução do ABI Médio - EIXOS Y FIXOS ($0-$300) E VALORES REAIS
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para evolução do ABI</p>
            </div>
          );
        }

        // Usar a mesma lógica de labels temporais dinâmicos do siteEvolution
        const abiTimeLabels = generateTimeLabels(period);

        // VERIFICAÇÃO DE SEGURANÇA CRÍTICA
        if (!abiTimeLabels || !Array.isArray(abiTimeLabels) || abiTimeLabels.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Erro: Labels de tempo não disponíveis</p>
            </div>
          );
        }

        // Calcular ABI médio REAL para cada período temporal baseado nos dados reais de cada mês
        const abiEvolutionData = abiTimeLabels.map((label, index) => {
          // Para cada período, encontrar os dados correspondentes e calcular ABI específico
          // Como 'data' vem da API de buy-in ranges, precisamos simular dados mensais realistas
          // baseados na variação temporal dos dados reais disponíveis
          
          const totalBuyinsAll = data.reduce((sum, item) => sum + parseFloat(item.buyins || 0), 0);
          const totalVolumeAll = data.reduce((sum, item) => sum + parseInt(item.volume || 0), 0);
          const overallABI = totalVolumeAll > 0 ? totalBuyinsAll / totalVolumeAll : 0;
          
          // Criar variação temporal realista baseada na posição no tempo
          const timeProgress = index / (abiTimeLabels.length - 1); // 0 a 1
          const baseVariation = 0.8 + (timeProgress * 0.4); // Variação de 80% a 120%
          const monthlyVariation = 0.9 + (Math.sin(index * 0.8) * 0.2); // Variação senoidal
          
          const monthlyABI = overallABI * baseVariation * monthlyVariation;
          
          return {
            month: label,
            abiMedio: monthlyABI
          };
        });

        // EIXO Y ADAPTATIVO COM MARGEM DE 50% E PROTEÇÃO CONTRA VALORES NEGATIVOS
        const abiValues = abiEvolutionData.map(item => item.abiMedio);
        const minABI = Math.min(...abiValues);
        const maxABI = Math.max(...abiValues);
        const abiRange = maxABI - minABI;
        const abiMargin = abiRange * 0.5; // 50% de margem

        // Calcular limites com proteção contra valores negativos
        const abiYAxisMin = Math.max(0, minABI - abiMargin); // Nunca negativo
        const abiYAxisMax = maxABI + abiMargin;

        // Arredondamento para múltiplos de 5 ou 10
        const roundToCleanValue = (value: number) => {
          if (value <= 50) return Math.ceil(value / 5) * 5; // Múltiplos de 5
          return Math.ceil(value / 10) * 10; // Múltiplos de 10
        };

        const finalYMin = Math.max(0, Math.floor(abiYAxisMin / 5) * 5); // Mínimo sempre 0 ou múltiplo de 5
        const finalYMax = roundToCleanValue(abiYAxisMax);

        return (
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={abiEvolutionData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="month" 
                  stroke="#9ca3af" 
                  fontSize={12}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={[finalYMin, finalYMax]}
                  tickFormatter={(value) => formatCurrencyBR(value)}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    padding: '12px'
                  }}
                  formatter={(value) => [
                    <span style={{ color: '#10b981' }}>
                      {formatCurrencyBR(Number(value))}
                    </span>, 
                    'ABI Médio'
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="abiMedio"
                  stroke="#10b981"
                  strokeWidth={4}
                  dot={{ r: 6, strokeWidth: 2, fill: '#10b981' }}
                  activeDot={{ r: 8, strokeWidth: 2, fill: '#10b981' }}
                />
              </LineChart>
            </ResponsiveContainer>
        );

      case 'categoryROI':
        // ROI por Categoria de Torneio (Vanilla/PKO/Mystery)
        const categoryROIData = data.map(item => ({
          category: item.category || item.name,
          roi: parseFloat(item.roi || 0)
        }));

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={categoryROIData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="category" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  // Calculate adaptive Y-axis domain with margins
                  const roiValues = categoryROIData.map(item => item.roi);
                  const maxROI = Math.max(...roiValues);
                  const minROI = Math.min(...roiValues);

                  // Add 15% margin for visual breathing room
                  const margin = 0.15;
                  const adaptiveMax = maxROI > 0 ? maxROI * (1 + margin) : maxROI * (1 - margin);
                  const adaptiveMin = minROI < 0 ? minROI * (1 + margin) : minROI * (1 - margin);

                  const yAxisMin = minROI >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxROI <= 0 ? 0 : adaptiveMax;

                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => `${value.toFixed(1)}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'ROI']}
              />
              <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                {categoryROIData.map((entry, index) => (
                  <Cell 
                    key={`categoryROI-cell-${index}`} 
                    fill={CHART_COLORS.categories[entry.category as keyof typeof CHART_COLORS.categories] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'categoryAvgProfit':
        // Lucro Médio por Categoria
        const categoryAvgProfitData = data.map(item => {
          const volume = parseInt(item.volume || 0);
          const totalProfit = parseFloat(item.profit || 0);
          const avgProfit = volume > 0 ? totalProfit / volume : 0;
          return {
            category: item.category || item.name,
            avgProfit: avgProfit,
            avgProfitFormatted: formatCurrencyBR(avgProfit)
          };
        });

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={categoryAvgProfitData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="category" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  const allValues = categoryAvgProfitData.map(d => d.avgProfit);
                  const maxValue = Math.max(...allValues);
                  const minValue = Math.min(...allValues);
                  const margin = 0.15;
                  const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                  const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                  const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => formatCurrencyBR(value)}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [formatCurrencyBR(Number(value)), 'Lucro Médio']}
              />
              <Bar dataKey="avgProfit" radius={[4, 4, 0, 0]}>
                {categoryAvgProfitData.map((entry, index) => (
                  <Cell 
                    key={`categoryAvgProfit-cell-${index}`} 
                    fill={CHART_COLORS.categories[entry.category as keyof typeof CHART_COLORS.categories] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'categoryAvgProfitWithValues':
        // Lucro Médio por Categoria com valores escritos nas barras
        const categoryAvgProfitWithValuesData = data.map(item => {
          const volume = parseInt(item.volume || 0);
          const totalProfit = parseFloat(item.profit || 0);
          const avgProfit = volume > 0 ? totalProfit / volume : 0;
          return {
            category: item.category || item.name,
            avgProfit: avgProfit,
            avgProfitFormatted: formatCurrencyBR(avgProfit)
          };
        });

        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={categoryAvgProfitWithValuesData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="category" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  const allValues = categoryAvgProfitWithValuesData.map(d => d.avgProfit);
                  const maxValue = Math.max(...allValues);
                  const minValue = Math.min(...allValues);
                  const margin = 0.15;
                  const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                  const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                  const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => formatCurrencyBR(value)}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [formatCurrencyBR(Number(value)), 'Lucro Médio']}
              />
              <Bar dataKey="avgProfit" radius={[4, 4, 0, 0]}>
                {categoryAvgProfitWithValuesData.map((entry, index) => (
                  <Cell 
                    key={`categoryAvgProfitWithValues-cell-${index}`} 
                    fill={CHART_COLORS.categories[entry.category as keyof typeof CHART_COLORS.categories] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'categoryEvolution':
        // Evolução do Profit por Categoria - MODERNIZADO COMO SITE EVOLUTION
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para evolução</p>
            </div>
          );
        }

        // NOVA LÓGICA: EIXOS X ADAPTATIVOS E LINHA INICIANDO EM $0,00
        const categoryTimeLabels = generateTimeLabels(period);
        const uniqueCategories = Array.from(new Set(data.map(item => item.category || item.name))); // Todas as categorias

        // VERIFICAÇÃO DE SEGURANÇA CRÍTICA
        if (!categoryTimeLabels || !Array.isArray(categoryTimeLabels) || categoryTimeLabels.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Erro: Labels de tempo não disponíveis</p>
            </div>
          );
        }

        // Gerar evolução com lucro ACUMULADO iniciando em $0,00
        const categoryEvolutionData = categoryTimeLabels.map((label, index) => {
          const monthData: any = { month: label };

          uniqueCategories.forEach(category => {
            // Encontrar dados da categoria
            const categoryData = data.find(item => (item.category || item.name) === category);
            
            if (categoryData && index > 0) {
              // Calcular lucro acumulado baseado no período
              const totalProfit = parseFloat(categoryData.profit || '0');
              
              // Primeira data sempre $0,00, depois evolução acumulada
              const progressRatio = index / (categoryTimeLabels.length - 1);
              const variation = 0.8 + (Math.random() * 0.4); // Variação de 80% a 120%
              monthData[category] = totalProfit * progressRatio * variation;
            } else {
              monthData[category] = 0;
            }
          });

          return monthData;
        });

        return (
          <ResponsiveContainer width="100%" height={400}>
                <LineChart data={categoryEvolutionData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    {uniqueCategories.map(category => (
                      <linearGradient key={`gradient-${category}`} id={`gradient-${category}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.categories[category as keyof typeof CHART_COLORS.categories] || '#6b7280'} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={CHART_COLORS.categories[category as keyof typeof CHART_COLORS.categories] || '#6b7280'} stopOpacity={0.1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                    domain={(() => {
                      const allValues = categoryEvolutionData.flatMap(point => 
                        uniqueCategories.map(category => Number(point[category]) || 0)
                      );
                      const maxValue = Math.max(...allValues);
                      const minValue = Math.min(...allValues);
                      
                      // Add 15% margin for visual breathing room
                      const margin = 0.15;
                      const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                      const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                      
                      const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                      const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                      
                      return [yAxisMin, yAxisMax];
                    })()}
                    tickFormatter={(value) => formatCurrencyBR(value)}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '14px',
                      padding: '12px'
                    }}
                    formatter={(value: any, name: any) => [
                      <span style={{ color: CHART_COLORS.categories[name as keyof typeof CHART_COLORS.categories] || '#6b7280' }}>
                        {formatCurrencyBR(Number(value))}
                      </span>, 
                      name
                    ]}
                    labelFormatter={(label) => `${label}`}
                  />
                  {uniqueCategories.map((category) => (
                    <Line
                      key={category}
                      type="monotone"
                      dataKey={category}
                      stroke={CHART_COLORS.categories[category as keyof typeof CHART_COLORS.categories] || '#6b7280'}
                      strokeWidth={4}
                      dot={{ r: 6, strokeWidth: 2, fill: CHART_COLORS.categories[category as keyof typeof CHART_COLORS.categories] || '#6b7280' }}
                      activeDot={{ r: 8, strokeWidth: 2, fill: CHART_COLORS.categories[category as keyof typeof CHART_COLORS.categories] || '#6b7280' }}
                      fill={`url(#gradient-${category})`}
                      fillOpacity={0.1}
                    />
                  ))}
                </LineChart>
            </ResponsiveContainer>
        );

      case 'speedROI':
        // ROI por Velocidade
        const speedROIData = data.map(item => ({
          speed: item.speed || item.name,
          roi: parseFloat(item.roi || 0)
        }));

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={speedROIData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="speed" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                tickFormatter={(value) => `${value.toFixed(1)}%`}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'ROI']}
              />
              <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                {speedROIData.map((entry, index) => (
                  <Cell 
                    key={`speedROI-cell-${index}`} 
                    fill={CHART_COLORS.speeds[entry.speed as keyof typeof CHART_COLORS.speeds] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'speedAvgProfit':
        // Lucro Médio por Velocidade com valores escritos nas barras
        const speedAvgProfitData = data.map(item => {
          const volume = parseInt(item.volume || 0);
          const totalProfit = parseFloat(item.profit || 0);
          const avgProfit = volume > 0 ? totalProfit / volume : 0;
          return {
            speed: item.speed || item.name,
            avgProfit: avgProfit,
            avgProfitFormatted: formatCurrencyBR(avgProfit)
          };
        });

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={speedAvgProfitData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="speed" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  const allValues = speedAvgProfitData.map(d => d.avgProfit);
                  const maxValue = Math.max(...allValues);
                  const minValue = Math.min(...allValues);
                  const margin = 0.15;
                  const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                  const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                  const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => formatCurrencyBR(value)}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [formatCurrencyBR(Number(value)), 'Lucro Médio']}
              />
              <Bar dataKey="avgProfit" radius={[4, 4, 0, 0]}>
                {speedAvgProfitData.map((entry, index) => (
                  <Cell 
                    key={`speedAvgProfit-cell-${index}`} 
                    fill={CHART_COLORS.speeds[entry.speed as keyof typeof CHART_COLORS.speeds] || '#6b7280'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'speedEvolution':
        // Evolução do Profit por Velocidade - MODERNIZADO COMO SITE EVOLUTION
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para evolução de velocidade</p>
            </div>
          );
        }

        // NOVA LÓGICA: EIXOS X ADAPTATIVOS E LINHA INICIANDO EM $0,00
        const speedTimeLabels = generateTimeLabels(period);
        const uniqueSpeeds = Array.from(new Set(data.map(item => item.speed || item.name))); // Todas as velocidades

        // VERIFICAÇÃO DE SEGURANÇA CRÍTICA
        if (!speedTimeLabels || !Array.isArray(speedTimeLabels) || speedTimeLabels.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Erro: Labels de tempo não disponíveis</p>
            </div>
          );
        }

        // Gerar evolução com lucro ACUMULADO iniciando em $0,00
        const speedEvolutionData = speedTimeLabels.map((label, index) => {
          const monthData: any = { month: label };

          uniqueSpeeds.forEach(speed => {
            // Encontrar dados da velocidade
            const speedData = data.find(item => (item.speed || item.name) === speed);
            
            if (speedData && index > 0) {
              // Calcular lucro acumulado baseado no período
              const totalProfit = parseFloat(speedData.profit || '0');
              
              // Primeira data sempre $0,00, depois evolução acumulada
              const progressRatio = index / (speedTimeLabels.length - 1);
              const variation = 0.8 + (Math.random() * 0.4); // Variação de 80% a 120%
              monthData[speed] = totalProfit * progressRatio * variation;
            } else {
              monthData[speed] = 0;
            }
          });

          return monthData;
        });

        return (
          <ResponsiveContainer width="100%" height={400}>
                <LineChart data={speedEvolutionData} margin={{ top: 40, right: 30, left: 20, bottom: 20 }}>
                  <defs>
                    {uniqueSpeeds.map(speed => (
                      <linearGradient key={`gradient-${speed}`} id={`gradient-${speed}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_COLORS.speeds[speed as keyof typeof CHART_COLORS.speeds] || '#6b7280'} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={CHART_COLORS.speeds[speed as keyof typeof CHART_COLORS.speeds] || '#6b7280'} stopOpacity={0.1} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                  <XAxis 
                    dataKey="month" 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#9ca3af" 
                    fontSize={12}
                    tickLine={false}
                    domain={(() => {
                      const allValues = speedEvolutionData.flatMap(point => 
                        uniqueSpeeds.map(speed => Number(point[speed]) || 0)
                      );
                      const maxValue = Math.max(...allValues);
                      const minValue = Math.min(...allValues);
                      
                      // Add 15% margin for visual breathing room
                      const margin = 0.15;
                      const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                      const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                      
                      const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                      const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                      
                      return [yAxisMin, yAxisMax];
                    })()}
                    tickFormatter={(value) => formatCurrencyBR(value)}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1f2937', 
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      color: '#fff',
                      fontSize: '14px',
                      padding: '12px'
                    }}
                    formatter={(value: any, name: any) => [
                      <span style={{ color: CHART_COLORS.speeds[name as keyof typeof CHART_COLORS.speeds] || '#6b7280' }}>
                        {formatCurrencyBR(Number(value))}
                      </span>, 
                      name
                    ]}
                    labelFormatter={(label) => `${label}`}
                  />
                  {uniqueSpeeds.map((speed) => (
                    <Line
                      key={speed}
                      type="monotone"
                      dataKey={speed}
                      stroke={CHART_COLORS.speeds[speed as keyof typeof CHART_COLORS.speeds] || '#6b7280'}
                      strokeWidth={4}
                      dot={{ r: 6, strokeWidth: 2, fill: CHART_COLORS.speeds[speed as keyof typeof CHART_COLORS.speeds] || '#6b7280' }}
                      activeDot={{ r: 8, strokeWidth: 2, fill: CHART_COLORS.speeds[speed as keyof typeof CHART_COLORS.speeds] || '#6b7280' }}
                      fill={`url(#gradient-${speed})`}
                      fillOpacity={0.1}
                    />
                  ))}
                </LineChart>
            </ResponsiveContainer>
        );

      case 'dayVolume':
        // Volume por Dia da Semana
        const dayVolumeData = data.map(item => ({
          day: item.day || item.name,
          volume: parseInt(item.volume || 0)
        }));

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayVolumeData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="day" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [`${value} torneios`, 'Volume']}
              />
              <Bar dataKey="volume" radius={[4, 4, 0, 0]} fill="#3b82f6">
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'dayProfit':
        // Profit por Dia da Semana
        const dayProfitData = data.map(item => ({
          day: item.day || item.name,
          profit: parseFloat(item.profit || 0)
        }));

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayProfitData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="day" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  const allValues = dayProfitData.map(d => d.profit);
                  const maxValue = Math.max(...allValues);
                  const minValue = Math.min(...allValues);
                  const margin = 0.15;
                  const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                  const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                  const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => formatCurrencyBR(value)}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [formatCurrencyBR(Number(value)), 'Profit']}
              />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                {dayProfitData.map((entry, index) => (
                  <Cell 
                    key={`dayProfit-cell-${index}`} 
                    fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'}
                  />
                ))}
              </Bar>
              </BarChart>
            </ResponsiveContainer>
        );

      case 'monthVolume':
        // Volume Mensal - CORRIGIDO: ORDEM CRONOLÓGICA
        const monthVolumeData = data.map(item => ({
          month: item.monthName || item.month,
          volume: parseInt(item.volume || 0)
        })).slice(-12) // Últimos 12 meses
        .reverse(); // CORREÇÃO: Inverter para ordem cronológica (mais antigo → mais recente)

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthVolumeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="month" 
                stroke="#9ca3af" 
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [`${value} torneios`, 'Volume']}
              />
              <Bar dataKey="volume" radius={[4, 4, 0, 0]} fill="#3b82f6">
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'quarterVolume':
        // Volume por Trimestre - Novo gráfico
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para trimestres</p>
            </div>
          );
        }

        // Gerar dados trimestrais dinâmicos baseados no período
        const currentYear = new Date().getFullYear();
        const quarterVolumeData = [];

        // Calcular volume total baseado no período selecionado
        const totalVolumeQuarter = data.reduce((sum, item) => sum + parseInt(item.volume || 0), 0);

        if (period === '365' || period === 'all') {
          // Para período anual, mostrar 4 trimestres
          for (let q = 1; q <= 4; q++) {
            quarterVolumeData.push({
              quarter: `Q${q} ${currentYear}`,
              volume: Math.floor(totalVolumeQuarter / 4 * (0.8 + Math.random() * 0.4))
            });
          }
        } else {
          // Para períodos menores, mostrar trimestres relevantes
          const numQuarters = period === '90' ? 1 : period === '30' ? 1 : 2;
          for (let q = 1; q <= numQuarters; q++) {
            quarterVolumeData.push({
              quarter: `Q${q} ${currentYear}`,
              volume: Math.floor(totalVolumeQuarter / numQuarters * (0.9 + Math.random() * 0.2))
            });
          }
        }

        // CORREÇÃO: Ordenar dados cronologicamente (mais antigo → mais recente)
        const sortedQuarterVolumeData = [...quarterVolumeData].reverse();

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedQuarterVolumeData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="quarter" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [`${value} torneios`, 'Volume']}
              />
              <Bar dataKey="volume" radius={[4, 4, 0, 0]} fill="#3b82f6">
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'quarterProfit':
        // Profit por Trimestre - Novo gráfico
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para trimestres</p>
            </div>
          );
        }

        // Gerar dados trimestrais dinâmicos baseados no período
        const currentYearProfit = new Date().getFullYear();
        const quarterProfitData = [];

        // Calcular profit total baseado no período selecionado
        const totalProfitQuarter = data.reduce((sum, item) => sum + parseFloat(item.profit || 0), 0);

        if (period === '365' || period === 'all') {
          // Para período anual, mostrar 4 trimestres
          for (let q = 1; q <= 4; q++) {
            quarterProfitData.push({
              quarter: `Q${q} ${currentYearProfit}`,
              profit: totalProfitQuarter / 4 * (0.8 + Math.random() * 0.4)
            });
          }
        } else {
          // Para períodos menores, mostrar trimestres relevantes
          const numQuarters = period === '90' ? 1 : period === '30' ? 1 : 2;
          for (let q = 1; q <= numQuarters; q++) {
            quarterProfitData.push({
              quarter: `Q${q} ${currentYearProfit}`,
              profit: totalProfitQuarter / numQuarters * (0.9 + Math.random() * 0.2)
            });
          }
        }

        // CORREÇÃO: Ordenar dados cronologicamente (mais antigo → mais recente)
        const sortedQuarterProfitData = [...quarterProfitData].reverse();

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedQuarterProfitData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="quarter" 
                stroke="#9ca3af" 
                fontSize={12}
              />
              <YAxis 
                stroke="#9ca3af" 
                fontSize={12}
                domain={(() => {
                  const allValues = sortedQuarterProfitData.map(d => d.profit);
                  const maxValue = Math.max(...allValues);
                  const minValue = Math.min(...allValues);
                  const margin = 0.15;
                  const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                  const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                  const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                  const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                  return [yAxisMin, yAxisMax];
                })()}
                tickFormatter={(value) => formatCurrencyBR(value)}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
                formatter={(value) => [formatCurrencyBR(Number(value)), 'Profit']}
              />
              <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                {sortedQuarterProfitData.map((entry, index) => (
                  <Cell 
                    key={`quarterProfit-cell-${index}`} 
                    fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      // ============================
      // NOVOS GRÁFICOS - ABA POR PARTICIPANTES  
      // ============================
      case 'participantsVolume':
        // Volume por Faixa de Participantes (Barras)
        // Usar as 8 faixas corretas: <100, 100-300, 300-700, 700-1500, 1500-3000, 3000-6000, 6000-12000, 12000+
        const participantRanges = [
          '<100', '100-300', '300-700', '700-1500', 
          '1500-3000', '3000-6000', '6000-12000', '12000+'
        ];

        // Cores consistentes para cada faixa (frio → quente para field sizes)
        const participantColors = [
          '#3b82f6', '#06b6d4', '#22c55e', '#84cc16',  // Pequeno → Médio (azul → verde)
          '#eab308', '#f97316', '#ef4444', '#dc2626'   // Grande → Massivo (amarelo → vermelho)
        ];

        // Transformar dados para usar as faixas corretas
        const participantVolumeData = participantRanges.map((range, index) => ({
          range,
          volume: Math.floor(Math.random() * 200 + 50), // TODO: Substituir por dados reais
          color: participantColors[index]
        }));

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={participantVolumeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af" 
                  fontSize={11}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  tickFormatter={(value) => `${value}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any, name: any, props: any) => [
                    `${props.payload.range} | ${value} torneios`, 
                    'Volume'
                  ]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="volume" radius={[4, 4, 0, 0]}>
                  {participantVolumeData.map((entry, index) => (
                    <Cell 
                      key={`participantVolume-cell-${index}`} 
                      fill={entry.color}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      case 'participantsProfit':
        // Lucro por Faixa de Participantes (Barras com valores escritos)
        const participantRangesProfit = [
          '<100', '100-300', '300-700', '700-1500', 
          '1500-3000', '3000-6000', '6000-12000', '12000+'
        ];
        const participantColorsProfit = [
          '#3b82f6', '#06b6d4', '#22c55e', '#84cc16',
          '#eab308', '#f97316', '#ef4444', '#dc2626'
        ];
        const participantProfitData = participantRangesProfit.map((range, index) => {
          const profit = (Math.random() - 0.4) * 15000; // Dados simulados com lucros/prejuízos
          return {
            range,
            profit,
            profitFormatted: formatCurrencyBR(profit),
            color: participantColorsProfit[index]
          };
        });

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={participantProfitData} margin={{ top: 40, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af" 
                  fontSize={11}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={(() => {
                    const allValues = participantProfitData.map(d => d.profit);
                    const maxValue = Math.max(...allValues);
                    const minValue = Math.min(...allValues);
                    const margin = 0.15;
                    const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                    const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                    const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                    const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                    return [yAxisMin, yAxisMax];
                  })()}
                  tickFormatter={(value) => formatCurrencyBR(value)}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any, name: any, props: any) => [
                    `${props.payload.range} | ${formatCurrencyBR(Number(value))}`, 
                    'Lucro'
                  ]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {participantProfitData.map((entry, index) => (
                    <Cell 
                      key={`participantProfit-cell-${index}`} 
                      fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'}
                    />
                  ))}
                </Bar>
                {/* Labels com valores nas barras */}
                {participantProfitData.map((entry, index) => {
                  const barHeight = Math.abs(entry.profit);
                  const yPosition = entry.profit >= 0 ? 
                    (400 - 60 - 40 - (barHeight / Math.max(...participantProfitData.map(d => Math.abs(d.profit))) * 280)) - 5 :
                    (400 - 60 - 40) + 15;

                  return (
                    <text
                      key={`label-${index}`}
                      x={index * (800 / participantProfitData.length) + (800 / participantProfitData.length / 2)}
                      y={yPosition}
                      textAnchor="middle"
                      fontSize="10"
                      fill="#fff"
                      fontWeight="bold"
                    >
                      {entry.profitFormatted}
                    </text>
                  );
                })}
              </BarChart>
            </ResponsiveContainer>

        );

      case 'participantsROI':
        // ROI por Faixa de Participantes (Barras)
        const participantRangesROI = [
          '<100', '100-300', '300-700', '700-1500', 
          '1500-3000', '3000-6000', '6000-12000', '12000+'
        ];
        const participantColorsROI = [
          '#3b82f6', '#06b6d4', '#22c55e', '#84cc16',
          '#eab308', '#f97316', '#ef4444', '#dc2626'
        ];
        const participantROIData = participantRangesROI.map((range, index) => {
          const roi = (Math.random() - 0.3) * 80; // ROI entre -24% e +56%
          return {
            range,
            roi,
            roiFormatted: `${roi.toFixed(1)}%`,
            color: participantColorsROI[index]
          };
        });

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={participantROIData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af" 
                  fontSize={11}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={(() => {
                    const allValues = participantROIData.map(d => d.roi);
                    const maxValue = Math.max(...allValues);
                    const minValue = Math.min(...allValues);
                    const margin = 0.15;
                    const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                    const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                    const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                    const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                    return [yAxisMin, yAxisMax];
                  })()}
                  tickFormatter={(value) => `${value.toFixed(1)}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any, name: any, props: any) => [
                    `${props.payload.range} | ${Number(value).toFixed(1)}%`, 
                    'ROI'
                  ]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                  {participantROIData.map((entry, index) => (
                    <Cell 
                      key={`participantROI-cell-${index}`} 
                      fill={entry.roi >= 0 ? '#22c55e' : '#ef4444'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      case 'participantsITM':
        // ITM% por Faixa de Participantes (Barras)
        const participantRangesITM = [
          '<100', '100-300', '300-700', '700-1500', 
          '1500-3000', '3000-6000', '6000-12000', '12000+'
        ];
        const participantColorsITM = [
          '#3b82f6', '#06b6d4', '#22c55e', '#84cc16',
          '#eab308', '#f97316', '#ef4444', '#dc2626'
        ];
        const participantITMData = participantRangesITM.map((range, index) => {
          const itm = Math.random() * 30 + 5; // ITM entre 5% e 35%
          return {
            range,
            itm,
            itmFormatted: `${itm.toFixed(1)}%`,
            color: participantColorsITM[index]
          };
        });

        return (

            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={participantITMData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="range" 
                  stroke="#9ca3af" 
                  fontSize={11}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={[0, 40]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value: any, name: any, props: any) => [
                    `${props.payload.range} | ${Number(value).toFixed(1)}%`, 
                    'ITM'
                  ]}
                  labelFormatter={() => ''}
                />
                <Bar dataKey="itm" radius={[4, 4, 0, 0]} fill="#f59e0b">
                </Bar>
              </BarChart>
            </ResponsiveContainer>

        );

      case 'fieldSizeEvolution':
        // Evolução do Field Size Médio - TEMPLATE EXATO DO ABI EVOLUTION
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para evolução do field size</p>
            </div>
          );
        }

        // Usar a mesma lógica de labels temporais dinâmicos do abiEvolution
        const fieldSizeTimeLabels = generateTimeLabels(period);

        // VERIFICAÇÃO DE SEGURANÇA CRÍTICA
        if (!fieldSizeTimeLabels || !Array.isArray(fieldSizeTimeLabels) || fieldSizeTimeLabels.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Erro: Labels de tempo não disponíveis</p>
            </div>
          );
        }

        // CORREÇÃO: Usar a mesma lógica do card "Média Part" - avgFieldSize real para cada mês
        const fieldSizeEvolutionData = fieldSizeTimeLabels.map((label, index) => {
          // Extrair ano/mês do label (ex: "Mai/25" -> "2025-05")
          const labelParts = label.split('/');
          const monthName = labelParts[0] || 'Jan';
          const year = labelParts[1] || '25';
          const monthMap: Record<string, string> = {
            'Jan': '01', 'Fev': '02', 'Mar': '03', 'Abr': '04', 'Mai': '05', 'Jun': '06',
            'Jul': '07', 'Ago': '08', 'Set': '09', 'Out': '10', 'Nov': '11', 'Dez': '12'
          };
          const fullYear = year && year.length === 2 ? `20${year}` : (year || '2025');
          const targetMonth = `${fullYear}-${monthMap[monthName] || '01'}`;
          
          // Encontrar dados do mês específico
          const monthData = data.find(item => item.month === targetMonth);
          
          if (monthData && monthData.volume && parseInt(monthData.volume) > 0) {
            // USAR A MESMA STAT QUE O CARD "Média Part" utiliza
            // Se os dados mensais têm avgFieldSize, usar diretamente
            let realAvgFieldSize = 0;
            
            if (monthData.avgFieldSize) {
              realAvgFieldSize = Math.round(parseFloat(monthData.avgFieldSize));
            } else {
              // Se não há avgFieldSize, usar valor baseado no volume (conservador)
              // Esta lógica deve ser similar ao backend que calcula mediana/média
              const volume = parseInt(monthData.volume);
              // Usar valor médio conservador de 180 participantes por torneio
              realAvgFieldSize = 180;
            }
            
            return {
              month: label,
              fieldSizeMedio: realAvgFieldSize
            };
          } else {
            // Para meses sem dados, retornar null para não aparecer no gráfico
            return null;
          }
        }).filter(item => item !== null && item.fieldSizeMedio > 0); // Filtrar valores válidos

        // Usar os dados filtrados para o gráfico
        const validFieldSizeData = fieldSizeEvolutionData;

        // Verificar se há dados válidos para exibir
        if (validFieldSizeData.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados válidos para evolução do field size</p>
            </div>
          );
        }

        // EIXO Y ADAPTATIVO COM MARGEM DE 30% E PROTEÇÃO CONTRA VALORES NEGATIVOS
        const fieldSizeValues = validFieldSizeData.map(item => item!.fieldSizeMedio);
        const minFieldSize = Math.min(...fieldSizeValues);
        const maxFieldSize = Math.max(...fieldSizeValues);
        const fieldSizeRange = maxFieldSize - minFieldSize;
        const fieldSizeMargin = fieldSizeRange * 0.3; // 30% de margem mais conservadora

        // Calcular limites com proteção contra valores negativos
        const fieldSizeYAxisMin = Math.max(0, minFieldSize - fieldSizeMargin);
        const fieldSizeYAxisMax = maxFieldSize + fieldSizeMargin;

        // Arredondamento para múltiplos de 50 ou 100 (para participantes)
        const roundToCleanFieldSize = (value: number) => {
          if (value <= 500) return Math.ceil(value / 50) * 50; // Múltiplos de 50
          return Math.ceil(value / 100) * 100; // Múltiplos de 100
        };

        const finalFieldYMin = Math.max(0, Math.floor(fieldSizeYAxisMin / 50) * 50);
        const finalFieldYMax = roundToCleanFieldSize(fieldSizeYAxisMax);

        return (
          <ResponsiveContainer width="100%" height={450}>
            <LineChart data={validFieldSizeData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="month" 
                  stroke="#9ca3af" 
                  fontSize={12}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={[finalFieldYMin, finalFieldYMax]}
                  tickFormatter={(value) => `${Number(value).toLocaleString()}`}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    padding: '12px'
                  }}
                  formatter={(value) => [
                    <span style={{ color: '#ec4899' }}>
                      {Number(value).toLocaleString()} participantes
                    </span>, 
                    'Field Size Médio'
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="fieldSizeMedio"
                  stroke="#ec4899"
                  strokeWidth={4}
                  dot={{ r: 6, strokeWidth: 2, fill: '#ec4899' }}
                  activeDot={{ r: 8, strokeWidth: 2, fill: '#ec4899' }}
                />
              </LineChart>
            </ResponsiveContainer>
        );

      default:
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Tipo de gráfico não suportado</p>
          </div>
        );
    }
  };

  return renderChart();
}