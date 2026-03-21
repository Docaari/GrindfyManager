import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { AnalyticsChartsProps } from './chartUtils';

export default function PositionCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'field':
    case 'fieldElimination': {
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
                formatter={(value: any, name: any, props: any) => [
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

      );
    }

    case 'finalTable':
    case 'finalTablePositions': {
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
                formatter={(value: any, name: any, props: any) => [
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

      );
    }

    default:
      return null;
  }
}
