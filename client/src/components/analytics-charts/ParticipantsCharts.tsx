import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, LineChart, Line, Legend } from 'recharts';
import { ChartTooltip } from './ChartTooltip';
import { ChartPanel, panelItems } from './ChartPanel';
import { AnalyticsChartsProps, generateTimeLabels, formatCurrencyBR, CHART_COLORS } from './chartUtils';
// ADR-243: cor por FAIXA DE FIELD vem da mesma fonte que define os limites,
// para rótulo e cor nunca divergirem entre backend e gráfico.
import { FIELD_SIZE_BUCKET_COLORS } from '@shared/field-size-buckets';

export default function ParticipantsCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'participantsVolume': {
      // Volume por Faixa de Eliminação (proxy para field size relativo)
      const volumeData = data.map((item: any) => ({
        name: item.fieldRange,
        value: parseInt(item.volume) || 0
      })).filter((item: any) => item.value > 0);

      const totalVolume = volumeData.reduce((sum, item) => sum + item.value, 0);

      if (volumeData.length === 0) {
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Sem dados de volume por faixa</p>
          </div>
        );
      }

      const maxVolumeIndex = volumeData.findIndex(item =>
        item.value === Math.max(...volumeData.map(d => d.value))
      );

      return (
        <ChartPanel items={panelItems(volumeData, 'name', 'value', FIELD_SIZE_BUCKET_COLORS)} kind="number" showPercent unit="torneios">
        <ResponsiveContainer width="100%" height={400}>
            <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <Pie
                data={volumeData}
                cx="50%"
                cy="50%"
                outerRadius={90}
                dataKey="value"
                fill="#ec4899"
                label={({ percent }) => {
                  const percentage = percent * 100;
                  return percentage > 15 ? `${percentage.toFixed(1)}%` : '';
                }}
                labelLine={false}
              >
                {volumeData.map((entry: any, index: number) => (
                  <Cell
                    key={`volume-cell-${index}`}
                    fill={FIELD_SIZE_BUCKET_COLORS[entry.name] ?? CHART_COLORS.buyins[index % CHART_COLORS.buyins.length]}
                    stroke={index === maxVolumeIndex ? '#24c25e' : 'transparent'}
                    strokeWidth={index === maxVolumeIndex ? 3 : 0}
                  />
                ))}
              </Pie>
              <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    content={<ChartTooltip kind="number" unit="torneios" labelFromPayload />}
                  />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartPanel>
      );
    }

    case 'participantsProfit': {
      // Lucro por Faixa de Eliminação
      const profitData = data.map((item: any) => ({
        range: item.fieldRange,
        profit: parseFloat(item.profit) || 0,
        volume: parseInt(item.volume) || 0
      })).filter((item: any) => item.volume > 0);

      if (profitData.length === 0) {
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Sem dados de lucro por faixa</p>
          </div>
        );
      }

      const profitValues = profitData.map(d => d.profit);
      const maxProfit = Math.max(...profitValues);
      const minProfit = Math.min(...profitValues);
      const margin = 0.15;
      const adaptiveMax = maxProfit > 0 ? maxProfit * (1 + margin) : maxProfit * (1 - margin);
      const adaptiveMin = minProfit < 0 ? minProfit * (1 + margin) : minProfit * (1 - margin);
      const yAxisMin = minProfit >= 0 ? 0 : adaptiveMin;
      const yAxisMax = maxProfit <= 0 ? 0 : adaptiveMax;

      return (
        <ChartPanel items={panelItems(profitData, 'range', 'profit', FIELD_SIZE_BUCKET_COLORS)} kind="currency">
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={profitData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis
                dataKey="range"
                stroke="#9ca3af"
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                domain={[yAxisMin, yAxisMax]}
                tickFormatter={(value) => formatCurrencyBR(Number(value))}
              />
              <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    content={<ChartTooltip kind="currency" />}
                  />
              <Bar dataKey="profit" fill="#ec4899" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {profitData.map((entry: any, index: number) => (
                  <Cell
                    key={`profit-cell-${index}`}
                    fill={entry.profit >= 0 ? '#10b981' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      );
    }

    case 'participantsROI': {
      // ROI por Faixa de Eliminação
      const roiData = data.map((item: any) => ({
        range: item.fieldRange,
        roi: parseFloat(item.roi) || 0,
        volume: parseInt(item.volume) || 0
      })).filter((item: any) => item.volume > 0);

      if (roiData.length === 0) {
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Sem dados de ROI por faixa</p>
          </div>
        );
      }

      const roiValues = roiData.map(d => d.roi);
      const maxROI = Math.max(...roiValues);
      const minROI = Math.min(...roiValues);
      const roiMargin = 0.15;
      const roiAdaptiveMax = maxROI > 0 ? maxROI * (1 + roiMargin) : maxROI * (1 - roiMargin);
      const roiAdaptiveMin = minROI < 0 ? minROI * (1 + roiMargin) : minROI * (1 - roiMargin);
      const roiYAxisMin = minROI >= 0 ? 0 : roiAdaptiveMin;
      const roiYAxisMax = maxROI <= 0 ? 0 : roiAdaptiveMax;

      return (
        <ChartPanel items={panelItems(roiData, 'range', 'roi', FIELD_SIZE_BUCKET_COLORS)} kind="percent">
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={roiData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis
                dataKey="range"
                stroke="#9ca3af"
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                domain={[roiYAxisMin, roiYAxisMax]}
                tickFormatter={(value) => `${value.toFixed(1)}%`}
              />
              <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    content={<ChartTooltip kind="percent" />}
                  />
              <Bar dataKey="roi" fill="#ec4899" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {roiData.map((entry: any, index: number) => (
                  <Cell
                    key={`roi-cell-${index}`}
                    fill={entry.roi >= 0 ? '#3b82f6' : '#f59e0b'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      );
    }

    case 'participantsITM': {
      // ADR-243: ITM REAL vindo do backend (`itmRate`, calculado sobre entradas
      // com `gross_prize > 0`). O código anterior inventava o valor a partir do
      // rótulo da faixa — 'Top 5%' virava 95% fixo, sem olhar o dado.
      const itmData = data
        .map((item: any) => ({
          range: item.fieldRange,
          itmRate: parseFloat(item.itmRate) || 0,
          volume: parseInt(item.volume) || 0,
        }))
        .filter((item: any) => item.volume > 0);

      if (itmData.length === 0) {
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Sem dados de ITM por faixa</p>
          </div>
        );
      }

      return (
        <ChartPanel items={panelItems(itmData, 'range', 'itmRate', FIELD_SIZE_BUCKET_COLORS)} kind="percent">
        <ResponsiveContainer width="100%" height={400}>
            <BarChart data={itmData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis
                dataKey="range"
                stroke="#9ca3af"
                fontSize={12}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                domain={[0, 100]}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                    cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                    content={<ChartTooltip kind="percent" />}
                  />
              <Bar dataKey="itmRate" fill="#ec4899" maxBarSize={60} radius={[4, 4, 0, 0]}>
                {itmData.map((entry: any, index: number) => (
                  <Cell
                    key={`itm-cell-${index}`}
                    fill={entry.itmRate >= 50 ? '#10b981' : entry.itmRate >= 25 ? '#f59e0b' : '#ef4444'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      );
    }

    case 'fieldSizeEvolution': {
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
          let realAvgFieldSize = 0;

          if (monthData.avgFieldSize) {
            realAvgFieldSize = Math.round(parseFloat(monthData.avgFieldSize));
          } else {
            // Se não há avgFieldSize, usar valor baseado no volume (conservador)
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
                  cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                  content={<ChartTooltip kind="number" />}
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
    }

    default:
      return null;
  }
}
