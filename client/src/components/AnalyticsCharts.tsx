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
    // DEBUG: Log dos dados recebidos
    console.log('AnalyticsCharts - Type:', type);
    console.log('AnalyticsCharts - Data:', data);
    console.log('AnalyticsCharts - Data length:', data?.length);

    switch (type) {
      case 'site':
      case 'siteVolume':
        // DEBUG: Teste com dados fixos
        const testData = [
          { site: 'GGPoker', volume: 30 },
          { site: 'PokerStars', volume: 20 },
          { site: 'PartyPoker', volume: 15 }
        ];
        
        console.log('Renderizando gráfico siteVolume com dados:', testData);
        
        return (
          <div style={{ width: '100%', height: '300px', backgroundColor: '#1f2937', border: '1px solid #374151' }}>
            <div style={{ color: 'white', padding: '10px' }}>TESTE PIZZA SITE - Debug Mode</div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={testData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="volume"
                  label={({ site, percent }) => `${site}: ${(percent * 100).toFixed(1)}%`}
                  labelLine={false}
                >
                  {testData.map((entry, index) => (
                    <Cell 
                      key={`site-cell-${index}`} 
                      fill={CHART_COLORS.sites[entry.site as keyof typeof CHART_COLORS.sites] || CHART_COLORS.default[index % CHART_COLORS.default.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value, name) => [`${value} torneios`, 'Volume']}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ color: '#9ca3af', fontSize: '12px' }}
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
        // DEBUG: Teste com dados fixos
        const testBuyinData = [
          { buyinRange: '$5-$10', volume: 25 },
          { buyinRange: '$11-$20', volume: 35 },
          { buyinRange: '$21-$50', volume: 40 }
        ];
        
        console.log('Renderizando gráfico buyinVolume com dados:', testBuyinData);
        
        return (
          <div style={{ width: '100%', height: '300px', backgroundColor: '#1f2937', border: '1px solid #374151' }}>
            <div style={{ color: 'white', padding: '10px' }}>TESTE PIZZA BUYIN - Debug Mode</div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={testBuyinData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="volume"
                  label={({ buyinRange, percent }) => `${buyinRange}: ${(percent * 100).toFixed(1)}%`}
                  labelLine={false}
                >
                  {testBuyinData.map((entry, index) => (
                    <Cell 
                      key={`buyin-cell-${index}`} 
                      fill={CHART_COLORS.buyins[index % CHART_COLORS.buyins.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value, name) => [`${value} torneios`, 'Volume']}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ color: '#9ca3af', fontSize: '12px' }}
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
        // DEBUG: Teste com dados fixos
        const testCategoryData = [
          { category: 'Vanilla', volume: 50 },
          { category: 'PKO', volume: 30 },
          { category: 'Mystery', volume: 20 }
        ];
        
        console.log('Renderizando gráfico categoryVolume com dados:', testCategoryData);
        
        return (
          <div style={{ width: '100%', height: '300px', backgroundColor: '#1f2937', border: '1px solid #374151' }}>
            <div style={{ color: 'white', padding: '10px' }}>TESTE PIZZA CATEGORIA - Debug Mode</div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={testCategoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="volume"
                  label={({ category, percent }) => `${category}: ${(percent * 100).toFixed(1)}%`}
                  labelLine={false}
                >
                  {testCategoryData.map((entry, index) => (
                    <Cell 
                      key={`category-cell-${index}`} 
                      fill={CHART_COLORS.categories[entry.category as keyof typeof CHART_COLORS.categories] || CHART_COLORS.default[index % CHART_COLORS.default.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value, name) => [`${value} torneios`, 'Volume']}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ color: '#9ca3af', fontSize: '12px' }}
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
        // DEBUG: Teste com dados fixos
        const testSpeedData = [
          { speed: 'Normal', volume: 60 },
          { speed: 'Turbo', volume: 25 },
          { speed: 'Hyper', volume: 15 }
        ];
        
        console.log('Renderizando gráfico speedVolume com dados:', testSpeedData);
        
        return (
          <div style={{ width: '100%', height: '300px', backgroundColor: '#1f2937', border: '1px solid #374151' }}>
            <div style={{ color: 'white', padding: '10px' }}>TESTE PIZZA VELOCIDADE - Debug Mode</div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={testSpeedData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="volume"
                  label={({ speed, percent }) => `${speed}: ${(percent * 100).toFixed(1)}%`}
                  labelLine={false}
                >
                  {testSpeedData.map((entry, index) => (
                    <Cell 
                      key={`speed-cell-${index}`} 
                      fill={CHART_COLORS.speeds[entry.speed as keyof typeof CHART_COLORS.speeds] || CHART_COLORS.default[index % CHART_COLORS.default.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#1f2937', 
                    border: '1px solid #374151',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                  formatter={(value, name) => [`${value} torneios`, 'Volume']}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  wrapperStyle={{ color: '#9ca3af', fontSize: '12px' }}
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