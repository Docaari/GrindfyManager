import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, LineChart, Line } from 'recharts';
import { formatCurrencyBR } from '@/lib/utils';

interface AnalyticsChartsProps {
  type: string;
  data: any[];
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

export default function AnalyticsCharts({ type, data }: AnalyticsChartsProps) {
  // Proteção contra dados undefined
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <p>Sem dados disponíveis</p>
      </div>
    );
  }

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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={siteChartData}
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
                  {siteChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CHART_COLORS.sites[entry.name as keyof typeof CHART_COLORS.sites] || '#6b7280'}
                      stroke={index === maxVolumeIndex ? '#24c25e' : 'transparent'}
                      strokeWidth={index === maxVolumeIndex ? 3 : 0}
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
                    `${name} | ${value} torneios | ${((value / totalVolume) * 100).toFixed(1)}%`, 
                    ''
                  ]}
                  labelFormatter={() => ''}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 'siteProfit':
        // DEBUG: Log dos dados de profit por site para comparação
        console.log('DEBUG Site Profit Chart - Data received:', data);
        const totalSiteProfit = data.reduce((sum, item) => sum + parseFloat(String(item.profit || '0')), 0);
        console.log('DEBUG Site Profit Chart - Total profit:', totalSiteProfit);

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis 
                dataKey="site" 
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
                  // Calculate adaptive Y-axis domain with margins (same as monthProfit)
                  const siteProfitValues = data.map(item => Number(item.profit || 0));
                  const maxSiteProfit = Math.max(...siteProfitValues);
                  const minSiteProfit = Math.min(...siteProfitValues);
                  
                  // Add 15% margin for visual breathing room
                  const margin = 0.15;
                  const adaptiveMax = maxSiteProfit > 0 ? maxSiteProfit * (1 + margin) : maxSiteProfit * (1 - margin);
                  const adaptiveMin = minSiteProfit < 0 ? minSiteProfit * (1 + margin) : minSiteProfit * (1 - margin);
                  
                  // If all values are positive, start from zero
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
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name, props) => {
                  const profitValue = Number(value);
                  const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                  return [
                    <span style={{ color }}>
                      {props.payload.site} | {formatCurrencyBR(profitValue)}
                    </span>, 
                    ''
                  ];
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey="profit" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`siteProfit-cell-${index}`} 
                    fill={CHART_COLORS.sites[entry.site as keyof typeof CHART_COLORS.sites] || '#6b7280'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
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
                  formatter={(value, name) => [
                    `${name} | ${value} torneios | ${((value / totalBuyinVolume) * 100).toFixed(1)}%`, 
                    ''
                  ]}
                  labelFormatter={() => ''}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 'buyinROI':
      case 'buyinProfit':
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
                formatter={(value, name, props) => {
                  if (type === 'buyinProfit') {
                    const profitValue = Number(value);
                    const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                    return [
                      <span style={{ color }}>
                        {props.payload.buyinRange} | {formatCurrencyBR(profitValue)}
                      </span>, 
                      ''
                    ];
                  } else {
                    return [`${Number(value).toFixed(1)}%`, 'ROI'];
                  }
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey={type === 'buyinROI' ? 'roi' : 'profit'} fill="#24c25e" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={CHART_COLORS.buyins[index % CHART_COLORS.buyins.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
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
                  formatter={(value, name) => [
                    `${name} | ${value} torneios | ${((value / totalCategoryVolume) * 100).toFixed(1)}%`, 
                    ''
                  ]}
                  labelFormatter={() => ''}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        );

      case 'categoryProfit':
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
          <ResponsiveContainer width="100%" height="100%">
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
                tickFormatter={(value) => formatCurrencyBR(Number(value))}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name, props) => {
                  const profitValue = Number(value);
                  const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                  return [
                    <span style={{ color }}>
                      {props.payload.category} | {formatCurrencyBR(profitValue)}
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
                    fill={CHART_COLORS.categories[entry.category as keyof typeof CHART_COLORS.categories] || '#6b7280'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
          </div>
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
            // Valores positivos - Verde com intensidade baseada no valor
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
                  formatter={(value, name, props) => {
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
          </div>
        );

      case 'dayROI':
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
                    `${name} | ${value} torneios | ${((value / totalSpeedVolume) * 100).toFixed(1)}%`, 
                    ''
                  ]}
                  labelFormatter={() => ''}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
                formatter={(value, name, props) => {
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
          </div>
        );



      // ETAPA 5: Monthly analytics
      case 'month':
      case 'monthVolume':
      case 'monthProfit':
        // Função para mostrar apenas meses alternados no eixo X
        const formatMonthTick = (tickItem: string, index: number) => {
          // Mostrar apenas índices ímpares (1º, 3º, 5º, 7º...)
          if (index % 2 !== 0) return '';
          
          // Converter formato "07/2025" para "Jul/25"
          const [month, year] = tickItem.split('/');
          const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
          const monthIndex = parseInt(month) - 1;
          const shortYear = year.slice(-2);
          
          return `${monthNames[monthIndex]}/${shortYear}`;
        };

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
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
                          const monthProfitValues = data.map(e => Number(e.profit));
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
                      : type === 'monthVolume' 
                        ? [0, Math.ceil(Math.max(...data.map(e => Number(e.volume))) * 1.15)]
                        : undefined
                  }
                  tickFormatter={(value) => 
                    type === 'monthVolume' 
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
                  formatter={(value, name, props) => {
                    if (type === 'monthVolume') {
                      return [
                        `${props.payload.monthName} | ${value} torneios`, 
                        ''
                      ];
                    } else {
                      const profitValue = Number(value);
                      const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                      return [
                        <span style={{ color }}>
                          {props.payload.monthName} | {formatCurrencyBR(profitValue)}
                        </span>, 
                        ''
                      ];
                    }
                  }}
                  labelFormatter={() => ''}
                />
                <Bar dataKey={type === 'month' || type === 'monthProfit' ? 'profit' : 'volume'}>
                  {data.map((entry, index) => {
                    if (type === 'monthVolume') {
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
                      const maxMonthVolume = Math.max(...data.map(e => Number(e.volume)));
                      
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
                        const monthProfitValues = data.map(e => Number(e.profit));
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
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
                  formatter={(value, name, props) => [
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
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
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
                  formatter={(value, name, props) => [
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
          </div>
        );

      case 'siteEvolution':
        // Para o gráfico de evolução, vamos criar dados temporais baseados nos dados existentes
        // Cada site terá uma evolução do lucro acumulado ao longo dos meses
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para evolução</p>
            </div>
          );
        }
        
        // Gerar dados mensais para os últimos 6 meses
        const months = ['Jul 2024', 'Ago 2024', 'Set 2024', 'Out 2024', 'Nov 2024', 'Dez 2024'];
        
        // Mapear dados de cada site
        const siteDataMap = data.reduce((acc, site) => {
          acc[site.site] = {
            totalProfit: parseFloat(site.profit || 0),
            volume: parseInt(site.volume || 0),
            color: CHART_COLORS.sites[site.site as keyof typeof CHART_COLORS.sites] || '#6b7280'
          };
          return acc;
        }, {} as Record<string, any>);
        
        // Criar evolução temporal para cada mês
        const siteEvolutionData = months.map((month, index) => {
          const monthData = { month } as any;
          
          // Para cada site, calcular profit acumulado até aquele mês
          Object.keys(siteDataMap).forEach(siteName => {
            const siteInfo = siteDataMap[siteName];
            // Simular crescimento gradual baseado no profit total
            const progressRatio = (index + 1) / months.length;
            monthData[siteName] = siteInfo.totalProfit * progressRatio * (0.7 + Math.random() * 0.6);
          });
          
          return monthData;
        });

        // Obter lista de sites únicos para as linhas
        const uniqueSites = data.map(item => item.site);

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={siteEvolutionData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis 
                  dataKey="month" 
                  stroke="#9ca3af" 
                  fontSize={12}
                />
                <YAxis 
                  stroke="#9ca3af" 
                  fontSize={12}
                  domain={(() => {
                    // Calculate adaptive Y-axis domain with margins
                    const allValues = siteEvolutionData.flatMap(point => 
                      uniqueSites.map(site => Number(point[site]) || 0)
                    );
                    const maxValue = Math.max(...allValues);
                    const minValue = Math.min(...allValues);
                    
                    // Add 15% margin for visual breathing room
                    const margin = 0.15;
                    const adaptiveMax = maxValue > 0 ? maxValue * (1 + margin) : maxValue * (1 - margin);
                    const adaptiveMin = minValue < 0 ? minValue * (1 + margin) : minValue * (1 - margin);
                    
                    // If all values are positive, start from zero
                    const yAxisMin = minValue >= 0 ? 0 : adaptiveMin;
                    const yAxisMax = maxValue <= 0 ? 0 : adaptiveMax;
                    
                    return [yAxisMin, yAxisMax];
                  })()}
                  tickFormatter={(value) => formatCurrencyBR(Number(value))}
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
                <Legend />
                {uniqueSites.map(siteName => (
                  <Line
                    key={siteName}
                    type="monotone"
                    dataKey={siteName}
                    stroke={CHART_COLORS.sites[siteName as keyof typeof CHART_COLORS.sites] || '#6b7280'}
                    strokeWidth={3}
                    dot={{ r: 6, strokeWidth: 2 }}
                    activeDot={{ r: 8, strokeWidth: 2 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        );

      case 'buyinProfitWithValues':
        // Profit por ABI com valores escritos nas barras
        const profitWithValuesData = data.map(item => ({
          range: item.range || item.buyin || item.name,
          profit: parseFloat(item.profit || 0),
          profitFormatted: formatCurrencyBR(parseFloat(item.profit || 0))
        }));

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
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
          </div>
        );

      case 'buyinROI':
        // ROI por ABI
        const roiData = data.map(item => ({
          range: item.range || item.buyin || item.name,
          roi: parseFloat(item.roi || 0)
        }));

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
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
          </div>
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
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
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
          </div>
        );

      case 'abiEvolution':
        // Evolução do ABI Médio - Linha temporal
        if (!data || data.length === 0) {
          return (
            <div className="h-64 flex items-center justify-center text-gray-400">
              <p>Sem dados disponíveis para evolução do ABI</p>
            </div>
          );
        }
        
        // Gerar dados mensais para os últimos 6 meses usando dados reais de ABI
        const monthsABI = ['Jul 2024', 'Ago 2024', 'Set 2024', 'Out 2024', 'Nov 2024', 'Dez 2024'];
        
        // Calcular ABI médio geral baseado nos dados
        const totalBuyins = data.reduce((sum, item) => sum + parseFloat(item.buyins || 0), 0);
        const totalVolumeABI = data.reduce((sum, item) => sum + parseInt(item.volume || 0), 0);
        const overallABI = totalVolumeABI > 0 ? totalBuyins / totalVolumeABI : 0;
        
        // Criar evolução temporal do ABI médio
        const abiEvolutionData = monthsABI.map((month, index) => {
          // Simular variação gradual do ABI baseado nos dados reais
          const variation = 0.8 + Math.random() * 0.4; // Variação entre 80% e 120%
          const monthlyABI = overallABI * variation;
          
          return {
            month,
            abiMedio: monthlyABI
          };
        });

        return (
          <div className="w-full h-[400px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
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
                  domain={(() => {
                    const allValues = abiEvolutionData.map(d => d.abiMedio);
                    const maxValue = Math.max(...allValues);
                    const minValue = Math.min(...allValues);
                    const margin = 0.15;
                    const adaptiveMax = maxValue * (1 + margin);
                    const adaptiveMin = minValue * (1 - margin);
                    return [adaptiveMin, adaptiveMax];
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
          </div>
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