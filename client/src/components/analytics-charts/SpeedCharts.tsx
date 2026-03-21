import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, LineChart, Line } from 'recharts';
import { AnalyticsChartsProps, CHART_COLORS, generateTimeLabels, formatCurrencyBR } from './chartUtils';

export default function SpeedCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'speed':
    case 'speedVolume': {
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
    }

    case 'speedProfit':
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

    case 'speedROI': {
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
    }

    case 'speedAvgProfit': {
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
    }

    case 'speedEvolution': {
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
            monthData[speed] = totalProfit * progressRatio;
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
    }

    default:
      return null;
  }
}
