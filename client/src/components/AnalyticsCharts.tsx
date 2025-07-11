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
        
        // Calcular total para percentuais
        const siteTotal = siteChartData.reduce((sum, item) => sum + item.value, 0);
        
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">📊</span>
              <h3 className="text-white font-semibold">Volume por Site</h3>
            </div>
            <ResponsiveContainer width="100%" height="280">
              <PieChart>
                <Pie
                  data={siteChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ value, percent }) => {
                    const percentage = percent * 100;
                    return percentage > 20 ? `${percentage.toFixed(1)}%` : '';
                  }}
                  labelLine={false}
                  fill="#8884d8"
                >
                  {siteChartData.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={CHART_COLORS.sites[entry.name as keyof typeof CHART_COLORS.sites] || '#6b7280'}
                      stroke={entry.value === Math.max(...siteChartData.map(d => d.value)) ? '#ffffff' : 'none'}
                      strokeWidth={entry.value === Math.max(...siteChartData.map(d => d.value)) ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                  formatter={(value, name) => [
                    `${value} torneios`,
                    `${((value as number / siteTotal) * 100).toFixed(1)}%`
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ 
                    color: '#9ca3af', 
                    fontSize: '12px',
                    paddingTop: '10px'
                  }}
                />
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
        
        // Calcular total para percentuais
        const buyinTotal = buyinChartData.reduce((sum, item) => sum + item.value, 0);
        
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">💰</span>
              <h3 className="text-white font-semibold">Volume por Buy-in</h3>
            </div>
            <ResponsiveContainer width="100%" height="280">
              <PieChart>
                <Pie
                  data={buyinChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ value, percent }) => {
                    const percentage = percent * 100;
                    return percentage > 20 ? `${percentage.toFixed(1)}%` : '';
                  }}
                  labelLine={false}
                  fill="#8884d8"
                >
                  {buyinChartData.map((entry, index) => (
                    <Cell 
                      key={`buyin-cell-${index}`} 
                      fill={CHART_COLORS.buyins[index % CHART_COLORS.buyins.length]}
                      stroke={entry.value === Math.max(...buyinChartData.map(d => d.value)) ? '#ffffff' : 'none'}
                      strokeWidth={entry.value === Math.max(...buyinChartData.map(d => d.value)) ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                  formatter={(value, name) => [
                    `${value} torneios`,
                    `${((value as number / buyinTotal) * 100).toFixed(1)}%`
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ 
                    color: '#9ca3af', 
                    fontSize: '12px',
                    paddingTop: '10px'
                  }}
                />
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
        
        // Calcular total para percentuais
        const categoryTotal = categoryChartData.reduce((sum, item) => sum + item.value, 0);
        
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🎯</span>
              <h3 className="text-white font-semibold">Volume por Categoria</h3>
            </div>
            <ResponsiveContainer width="100%" height="280">
              <PieChart>
                <Pie
                  data={categoryChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ value, percent }) => {
                    const percentage = percent * 100;
                    return percentage > 20 ? `${percentage.toFixed(1)}%` : '';
                  }}
                  labelLine={false}
                  fill="#8884d8"
                >
                  {categoryChartData.map((entry, index) => (
                    <Cell 
                      key={`category-cell-${index}`} 
                      fill={CHART_COLORS.categories[entry.name as keyof typeof CHART_COLORS.categories] || '#6b7280'}
                      stroke={entry.value === Math.max(...categoryChartData.map(d => d.value)) ? '#ffffff' : 'none'}
                      strokeWidth={entry.value === Math.max(...categoryChartData.map(d => d.value)) ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                  formatter={(value, name) => [
                    `${value} torneios`,
                    `${((value as number / categoryTotal) * 100).toFixed(1)}%`
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ 
                    color: '#9ca3af', 
                    fontSize: '12px',
                    paddingTop: '10px'
                  }}
                />
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
        
        // Calcular total para percentuais
        const speedTotal = speedChartData.reduce((sum, item) => sum + item.value, 0);
        
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-lg p-4 shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">⚡</span>
              <h3 className="text-white font-semibold">Volume por Velocidade</h3>
            </div>
            <ResponsiveContainer width="100%" height="280">
              <PieChart>
                <Pie
                  data={speedChartData}
                  cx="50%"
                  cy="45%"
                  outerRadius={90}
                  dataKey="value"
                  label={({ value, percent }) => {
                    const percentage = percent * 100;
                    return percentage > 20 ? `${percentage.toFixed(1)}%` : '';
                  }}
                  labelLine={false}
                  fill="#8884d8"
                >
                  {speedChartData.map((entry, index) => (
                    <Cell 
                      key={`speed-cell-${index}`} 
                      fill={CHART_COLORS.speeds[entry.name as keyof typeof CHART_COLORS.speeds] || '#6b7280'}
                      stroke={entry.value === Math.max(...speedChartData.map(d => d.value)) ? '#ffffff' : 'none'}
                      strokeWidth={entry.value === Math.max(...speedChartData.map(d => d.value)) ? 2 : 0}
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px'
                  }}
                  formatter={(value, name) => [
                    `${value} torneios`,
                    `${((value as number / speedTotal) * 100).toFixed(1)}%`
                  ]}
                  labelFormatter={(label) => `${label}`}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ 
                    color: '#9ca3af', 
                    fontSize: '12px',
                    paddingTop: '10px'
                  }}
                />
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