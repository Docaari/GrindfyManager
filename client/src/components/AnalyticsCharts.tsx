import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';
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
        // Cores de azul variadas por dia da semana
        const dayVolumeColors = [
          '#1e40af', // Domingo - Azul escuro
          '#2563eb', // Segunda - Azul
          '#3b82f6', // Terça - Azul médio
          '#60a5fa', // Quarta - Azul claro
          '#93c5fd', // Quinta - Azul mais claro
          '#1d4ed8', // Sexta - Azul vibrante
          '#1e3a8a', // Sábado - Azul muito escuro
        ];

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dayName" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af" 
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
                      fill={dayVolumeColors[parseInt(entry.dayOfWeek)] || '#3b82f6'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'dayProfit':
        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="dayName" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af" 
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
                      fill={Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'} 
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
                  domain={type === 'monthProfit' ? [-5000, 10000] : undefined}
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
                  {data.map((entry, index) => (
                    <Cell 
                      key={`month-cell-${index}`} 
                      fill={
                        type === 'monthVolume' 
                          ? `hsl(214, ${70 + (index * 5) % 30}%, ${50 + (index * 3) % 20}%)` // Gradiente azul
                          : Number(entry.profit) >= 0 ? '#10b981' : '#ef4444' // Verde/Vermelho para profit
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      // ETAPA 5: Field elimination analytics
      case 'field':
      case 'fieldElimination':
        // Gradiente laranja - mais escuro = eliminação mais cedo
        const fieldColors = [
          '#ea580c', // Top 5% - Laranja mais escuro (eliminação mais cedo)
          '#f97316', // 6-15% - Laranja médio
          '#fb923c', // 16-30% - Laranja
          '#fdba74', // 31-50% - Laranja claro
          '#fed7aa', // 51%+ - Laranja muito claro
        ];

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="fieldRange" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af" 
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
                <Bar dataKey="volume">
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
        // Gradiente dourado - mais dourado = posições melhores
        const finalTableColors = {
          1: '#fbbf24', // 1º lugar - Dourado brilhante
          2: '#f59e0b', // 2º lugar - Dourado
          3: '#d97706', // 3º lugar - Dourado escuro
          4: '#b45309', // 4º lugar - Bronze dourado
          5: '#92400e', // 5º lugar - Bronze
          6: '#78350f', // 6º lugar - Bronze escuro
          7: '#451a03', // 7º lugar - Marrom dourado
          8: '#365314', // 8º lugar - Marrom
          9: '#1a2e05', // 9º lugar - Marrom escuro
        };

        return (
          <div className="w-full h-[350px] bg-gray-900 rounded-xl p-6 shadow-lg border border-gray-700/50">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
                <XAxis dataKey="position" stroke="#9ca3af" />
                <YAxis 
                  stroke="#9ca3af" 
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
                      fill={finalTableColors[entry.position as keyof typeof finalTableColors] || '#f59e0b'}
                    />
                  ))}
                </Bar>
              </BarChart>
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