import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';

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
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-2 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
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
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="site" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey="profit" fill="#24c25e" />
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
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-2 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="buyinRange" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name) => [
                  type === 'buyinProfit' ? `$${Number(value).toFixed(2)}` : `${Number(value).toFixed(1)}%`,
                  type === 'buyinProfit' ? 'Profit' : 'ROI'
                ]}
              />
              <Bar dataKey={type === 'buyinROI' ? 'roi' : 'profit'} fill="#24c25e">
                {type === 'buyinProfit' && data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'} 
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
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-2 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="category" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name) => [`$${Number(value).toFixed(2)}`, 'Profit']}
              />
              <Bar dataKey="profit">
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={Number(entry.profit) < 0 ? '#ef4444' : CHART_COLORS.categories[entry.category as keyof typeof CHART_COLORS.categories] || CHART_COLORS.default[index % CHART_COLORS.default.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'day':
      case 'dayVolume':
      case 'dayProfit':
      case 'dayROI':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="dayName" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey={type === 'day' || type === 'dayVolume' ? 'volume' : type === 'dayProfit' ? 'profit' : 'roi'} fill="#24c25e" />
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
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-2 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
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
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="speed" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name) => [`$${Number(value).toFixed(2)}`, 'Profit']}
              />
              <Bar dataKey="profit">
                {data.map((entry, index) => (
                  <Cell 
                    key={`speedProfit-cell-${index}`} 
                    fill={Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );



      // ETAPA 5: Monthly analytics
      case 'month':
      case 'monthVolume':
      case 'monthProfit':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="monthName" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey={type === 'month' || type === 'monthProfit' ? 'profit' : 'volume'} fill="#24c25e" />
            </BarChart>
          </ResponsiveContainer>
        );

      // ETAPA 5: Field elimination analytics
      case 'field':
      case 'fieldElimination':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="fieldRange" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey="volume" fill={CHART_COLORS.default[0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      // ETAPA 5: Final table positions
      case 'finalTable':
      case 'finalTablePositions':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="position" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey="volume" fill={CHART_COLORS.default[0]} />
            </BarChart>
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