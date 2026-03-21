import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, LineChart, Line } from 'recharts';
import { AnalyticsChartsProps, CHART_COLORS, generateTimeLabels, formatCurrencyBR } from './chartUtils';

export default function SiteCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'site':
    case 'siteVolume': {
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
    }

    case 'siteProfit':
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

    case 'siteEvolution': {
      if (!data || data.length === 0) {
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Sem dados disponíveis para evolução</p>
          </div>
        );
      }

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
              monthData[site] = totalProfit * cumulativeRatio;
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
    }

    default:
      return null;
  }
}
