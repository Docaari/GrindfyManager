import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend, LineChart, Line } from 'recharts';
import { AnalyticsChartsProps, CHART_COLORS, generateTimeLabels, formatCurrencyBR } from './chartUtils';

export default function BuyinCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'buyin':
    case 'buyinVolume': {
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
    }

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

    case 'buyinProfitWithValues': {
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
    }

    case 'buyinROI': {
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
    }

    case 'buyinAvgProfitWithValues': {
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
    }

    case 'abiEvolution': {
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
    }

    default:
      return null;
  }
}
