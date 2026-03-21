import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, LineChart, Line } from 'recharts';
import { AnalyticsChartsProps, CHART_COLORS, generateTimeLabels, formatCurrencyBR } from './chartUtils';

export default function CategoryCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'category':
    case 'categoryVolume': {
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
    }

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

    case 'categoryROI': {
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
    }

    case 'categoryAvgProfit': {
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
    }

    case 'categoryAvgProfitWithValues': {
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
    }

    case 'categoryEvolution': {
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
            monthData[category] = totalProfit * progressRatio;
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
    }

    default:
      return null;
  }
}
