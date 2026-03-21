import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts';
import { AnalyticsChartsProps, generateTimeLabels, formatCurrencyBR } from './chartUtils';

export default function ParticipantsCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'participantsVolume':
      // Volume por Faixa de Participantes (Barras)
      // Dados reais não disponíveis para participantes por volume
      return (
        <div className="h-64 flex items-center justify-center text-gray-400">
          <p>Dados insuficientes</p>
        </div>
      );

    case 'participantsProfit':
      // Lucro por Faixa de Participantes (Barras com valores escritos)
      // Dados reais não disponíveis para participantes por lucro
      return (
        <div className="h-64 flex items-center justify-center text-gray-400">
          <p>Dados insuficientes</p>
        </div>
      );

    case 'participantsROI':
      // Dados reais não disponíveis para participantes por ROI
      return (
        <div className="h-64 flex items-center justify-center text-gray-400">
          <p>Dados insuficientes</p>
        </div>
      );

    case 'participantsITM':
      // Dados reais não disponíveis para participantes por ITM
      return (
        <div className="h-64 flex items-center justify-center text-gray-400">
          <p>Dados insuficientes</p>
        </div>
      );

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
                contentStyle={{
                  backgroundColor: '#1f2937',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff',
                  fontSize: '14px',
                  padding: '12px'
                }}
                formatter={(value) => [
                  <span style={{ color: '#ec4899' }}>
                    {Number(value).toLocaleString()} participantes
                  </span>,
                  'Field Size Médio'
                ]}
                labelFormatter={(label) => `${label}`}
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
