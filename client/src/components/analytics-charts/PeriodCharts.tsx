import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';
import { AnalyticsChartsProps, formatCurrencyBR } from './chartUtils';

export default function PeriodCharts({ type, data, period = "all" }: AnalyticsChartsProps) {
  switch (type) {
    case 'day':
    case 'dayVolume': {
      // Função para calcular cor baseada no volume
      const getDayVolumeColor = (volume: number, maxVolume: number) => {
        const ratio = volume / maxVolume;

        if (ratio >= 0.9) return '#1e3a8a'; // Volume mais alto - azul muito escuro
        if (ratio >= 0.75) return '#1e40af'; // Volume alto - azul escuro
        if (ratio >= 0.6) return '#2563eb'; // Volume médio-alto - azul
        if (ratio >= 0.45) return '#3b82f6'; // Volume médio - azul padrão
        if (ratio >= 0.3) return '#60a5fa'; // Volume médio-baixo - azul claro
        if (ratio >= 0.15) return '#93c5fd'; // Volume baixo - azul muito claro
        return '#dbeafe'; // Volume mais baixo - azul clarissimo
      };

      // Calcular volume máximo para os dias da semana
      const maxDayVolume = Math.max(...data.map(entry => Number(entry.volume)));

      return (

          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="dayName" stroke="#9ca3af" />
              <YAxis
                stroke="#9ca3af"
                domain={[0, Math.ceil(maxDayVolume * 1.15)]}
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
                    fill={getDayVolumeColor(Number(entry.volume), maxDayVolume)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

      );
    }

    case 'dayProfit': {
      // Check if this is the simple format (with 'day' key) or the original format (with 'dayName' key)
      const hasDay = data[0] && 'day' in data[0];

      if (hasDay) {
        // Simple day profit format
        const dayProfitData = data.map(item => ({
          day: item.day || item.name,
          profit: parseFloat(item.profit || 0)
        }));

        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dayProfitData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis
                dataKey="day"
                stroke="#9ca3af"
                fontSize={12}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={12}
                domain={(() => {
                  const allValues = dayProfitData.map(d => d.profit);
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
                {dayProfitData.map((entry, index) => (
                  <Cell
                    key={`dayProfit-cell-${index}`}
                    fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'}
                  />
                ))}
              </Bar>
              </BarChart>
            </ResponsiveContainer>
        );
      }

      // Original dayProfit format (with dayName key)
      // Calcular limites adaptativos do eixo Y para dayProfit
      const profitValues = data.map(entry => Number(entry.profit));
      const maxProfit = Math.max(...profitValues);
      const minProfit = Math.min(...profitValues);

      // Adicionar margem de 15% para respiração visual
      const margin = 0.15;
      const adaptiveMax = maxProfit > 0 ? maxProfit * (1 + margin) : maxProfit * (1 - margin);
      const adaptiveMin = minProfit < 0 ? minProfit * (1 + margin) : minProfit * (1 - margin);

      // Se todos os valores são positivos, começar do zero
      const yAxisMin = minProfit >= 0 ? 0 : adaptiveMin;
      const yAxisMax = maxProfit <= 0 ? 0 : adaptiveMax;

      // Função para calcular cor baseada no valor do profit
      const getDayProfitColor = (profit: number) => {
        if (profit >= 0) {
          // Valores positivos - Verde com intensidade baseada no código
          if (maxProfit <= 0) return '#4ade80'; // Se não há profits positivos, usar verde claro

          const ratio = profit / maxProfit;
          if (ratio >= 0.8) return '#166534'; // Verde escuro - profit muito alto
          if (ratio >= 0.6) return '#15803d'; // Verde médio-escuro - profit alto
          if (ratio >= 0.4) return '#16a34a'; // Verde médio - profit médio
          if (ratio >= 0.2) return '#22c55e'; // Verde padrão - profit baixo
          return '#4ade80'; // Verde claro - profit muito baixo
        } else {
          // Valores negativos - Vermelho com intensidade baseada no valor absoluto
          if (minProfit >= 0) return '#fca5a5'; // Se não há prejuízos, usar vermelho claro

          const ratio = Math.abs(profit) / Math.abs(minProfit);
          if (ratio >= 0.8) return '#b91c1c'; // Vermelho muito escuro - prejuízo extremo
          if (ratio >= 0.6) return '#dc2626'; // Vermelho escuro - prejuízo muito alto
          if (ratio >= 0.4) return '#ef4444'; // Vermelho padrão - prejuízo alto
          if (ratio >= 0.2) return '#f87171'; // Vermelho médio-claro - prejuízo médio
          return '#fca5a5'; // Vermelho claro - prejuízo pequeno
        }
      };

      return (

          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
              <XAxis dataKey="dayName" stroke="#9ca3af" />
              <YAxis
                stroke="#9ca3af"
                domain={[yAxisMin, yAxisMax]}
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
                    fill={getDayProfitColor(Number(entry.profit))}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

      );
    }

    case 'dayROI':
      return (

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

      );

    case 'month':
    case 'monthProfit': {
      // Função para mostrar apenas meses alternados no eixo X
      const formatMonthTick = (tickItem: string, index: number) => {
        // Mostrar apenas índices ímpares (1º, 3º, 5º, 7º...)
        if (index % 2 !== 0) return '';

        // Converter formato "07/2025" para "Jul/25"
        const tickParts = tickItem.split('/');
        const month = tickParts[0] || '01';
        const year = tickParts[1] || '2025';
        const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        const monthIndex = parseInt(month) - 1;
        const shortYear = year && year.length >= 2 ? year.slice(-2) : '25';

        return `${monthNames[monthIndex]}/${shortYear}`;
      };

      // CORREÇÃO: Ordenar dados cronologicamente para monthProfit
      const sortedData = type === 'monthProfit' ? [...data].reverse() : data;

      return (

          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sortedData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
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
                domain={
                  type === 'monthProfit'
                    ? (() => {
                        // Calcular limites adaptativos para profit mensal
                        const monthProfitValues = sortedData.map(e => Number(e.profit));
                        const maxMonthProfit = Math.max(...monthProfitValues);
                        const minMonthProfit = Math.min(...monthProfitValues);

                        // Adicionar margem de 15% para respiração visual
                        const margin = 0.15;
                        const adaptiveMax = maxMonthProfit > 0 ? maxMonthProfit * (1 + margin) : maxMonthProfit * (1 - margin);
                        const adaptiveMin = minMonthProfit < 0 ? minMonthProfit * (1 + margin) : minMonthProfit * (1 - margin);

                        // Se todos os valores são positivos, começar do zero
                        const yAxisMin = minMonthProfit >= 0 ? 0 : adaptiveMin;
                        const yAxisMax = maxMonthProfit <= 0 ? 0 : adaptiveMax;

                        return [yAxisMin, yAxisMax];
                      })()
                    : type.includes('Volume')
                      ? [0, Math.ceil(Math.max(...sortedData.map(e => Number(e.volume))) * 1.15)]
                      : undefined
                }
                tickFormatter={(value) =>
                  type.includes('Volume')
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
                formatter={(value: any, name: any, props: any) => {
                  if (type.includes('Volume')) {
                    return [
                      `${props.payload?.monthName} | ${value} torneios`,
                      ''
                    ];
                  } else {
                    const profitValue = Number(value);
                    const color = profitValue >= 0 ? '#10b981' : '#ef4444';
                    return [
                      <span style={{ color }}>
                        {props.payload?.monthName} | {formatCurrencyBR(profitValue)}
                      </span>,
                      ''
                    ];
                  }
                }}
                labelFormatter={() => ''}
              />
              <Bar dataKey={type.includes('Profit') ? 'profit' : 'volume'}>
                {sortedData.map((entry, index) => {
                  if (type.includes('Volume')) {
                    // Função para calcular cor baseada no volume mensal
                    const getMonthVolumeColor = (volume: number, maxVolume: number) => {
                      const ratio = volume / maxVolume;

                      if (ratio >= 0.9) return '#1e3a8a'; // Volume mais alto - azul muito escuro
                      if (ratio >= 0.75) return '#1e40af'; // Volume alto - azul escuro
                      if (ratio >= 0.6) return '#2563eb'; // Volume médio-alto - azul
                      if (ratio >= 0.45) return '#3b82f6'; // Volume médio - azul padrão
                      if (ratio >= 0.3) return '#60a5fa'; // Volume médio-baixo - azul claro
                      if (ratio >= 0.15) return '#93c5fd'; // Volume baixo - azul muito claro
                      return '#dbeafe'; // Volume mais baixo - azul clarissimo
                    };

                    // Calcular volume máximo para os meses
                    const maxMonthVolume = Math.max(...sortedData.map(e => Number(e.volume)));

                    return (
                      <Cell
                        key={`month-cell-${index}`}
                        fill={getMonthVolumeColor(Number(entry.volume), maxMonthVolume)}
                      />
                    );
                  } else {
                    // Função para calcular cor baseada no valor do profit mensal
                    const getMonthProfitColor = (profit: number) => {
                      // Calcular máximo e mínimo profits para os meses
                      const monthProfitValues = sortedData.map(e => Number(e.profit));
                      const maxMonthProfit = Math.max(...monthProfitValues);
                      const minMonthProfit = Math.min(...monthProfitValues);

                      if (profit >= 0) {
                        // Valores positivos - Verde com intensidade baseada no valor
                        if (maxMonthProfit <= 0) return '#4ade80'; // Se não há profits positivos, usar verde claro

                        const ratio = profit / maxMonthProfit;
                        if (ratio >= 0.8) return '#166534'; // Verde escuro - profit muito alto
                        if (ratio >= 0.6) return '#15803d'; // Verde médio-escuro - profit alto
                        if (ratio >= 0.4) return '#16a34a'; // Verde médio - profit médio
                        if (ratio >= 0.2) return '#22c55e'; // Verde padrão - profit baixo
                        return '#4ade80'; // Verde claro - profit muito baixo
                      } else {
                        // Valores negativos - Vermelho com intensidade baseada no valor absoluto
                        if (minMonthProfit >= 0) return '#fca5a5'; // Se não há prejuízos, usar vermelho claro

                        const ratio = Math.abs(profit) / Math.abs(minMonthProfit);
                        if (ratio >= 0.8) return '#b91c1c'; // Vermelho muito escuro - prejuízo extremo
                        if (ratio >= 0.6) return '#dc2626'; // Vermelho escuro - prejuízo muito alto
                        if (ratio >= 0.4) return '#ef4444'; // Vermelho padrão - prejuízo alto
                        if (ratio >= 0.2) return '#f87171'; // Vermelho médio-claro - prejuízo médio
                        return '#fca5a5'; // Vermelho claro - prejuízo pequeno
                      }
                    };

                    return (
                      <Cell
                        key={`month-cell-${index}`}
                        fill={getMonthProfitColor(Number(entry.profit))}
                      />
                    );
                  }
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

      );
    }

    case 'monthVolume': {
      // Volume Mensal - CORRIGIDO: ORDEM CRONOLÓGICA
      const monthVolumeData = data.map(item => ({
        month: item.monthName || item.month,
        volume: parseInt(item.volume || 0)
      })).slice(-12) // Últimos 12 meses
      .reverse(); // CORREÇÃO: Inverter para ordem cronológica (mais antigo → mais recente)

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthVolumeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis
              dataKey="month"
              stroke="#9ca3af"
              fontSize={12}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value) => [`${value} torneios`, 'Volume']}
            />
            <Bar dataKey="volume" radius={[4, 4, 0, 0]} fill="#3b82f6">
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case 'quarterVolume': {
      // Volume por Trimestre - Novo gráfico
      if (!data || data.length === 0) {
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Sem dados disponíveis para trimestres</p>
          </div>
        );
      }

      // Gerar dados trimestrais dinâmicos baseados no período
      const currentYear = new Date().getFullYear();
      const quarterVolumeData = [];

      // Calcular volume total baseado no período selecionado
      const totalVolumeQuarter = data.reduce((sum, item) => sum + parseInt(item.volume || 0), 0);

      if (period === '365' || period === 'all') {
        // Para período anual, mostrar 4 trimestres
        for (let q = 1; q <= 4; q++) {
          quarterVolumeData.push({
            quarter: `Q${q} ${currentYear}`,
            volume: Math.floor(totalVolumeQuarter / 4)
          });
        }
      } else {
        // Para períodos menores, mostrar trimestres relevantes
        const numQuarters = period === '90' ? 1 : period === '30' ? 1 : 2;
        for (let q = 1; q <= numQuarters; q++) {
          quarterVolumeData.push({
            quarter: `Q${q} ${currentYear}`,
            volume: Math.floor(totalVolumeQuarter / numQuarters)
          });
        }
      }

      // CORREÇÃO: Ordenar dados cronologicamente (mais antigo → mais recente)
      const sortedQuarterVolumeData = [...quarterVolumeData].reverse();

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sortedQuarterVolumeData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis
              dataKey="quarter"
              stroke="#9ca3af"
              fontSize={12}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={12}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff'
              }}
              formatter={(value) => [`${value} torneios`, 'Volume']}
            />
            <Bar dataKey="volume" radius={[4, 4, 0, 0]} fill="#3b82f6">
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    }

    case 'quarterProfit': {
      // Profit por Trimestre - Novo gráfico
      if (!data || data.length === 0) {
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Sem dados disponíveis para trimestres</p>
          </div>
        );
      }

      // Gerar dados trimestrais dinâmicos baseados no período
      const currentYearProfit = new Date().getFullYear();
      const quarterProfitData = [];

      // Calcular profit total baseado no período selecionado
      const totalProfitQuarter = data.reduce((sum, item) => sum + parseFloat(item.profit || 0), 0);

      if (period === '365' || period === 'all') {
        // Para período anual, mostrar 4 trimestres
        for (let q = 1; q <= 4; q++) {
          quarterProfitData.push({
            quarter: `Q${q} ${currentYearProfit}`,
            profit: totalProfitQuarter / 4
          });
        }
      } else {
        // Para períodos menores, mostrar trimestres relevantes
        const numQuarters = period === '90' ? 1 : period === '30' ? 1 : 2;
        for (let q = 1; q <= numQuarters; q++) {
          quarterProfitData.push({
            quarter: `Q${q} ${currentYearProfit}`,
            profit: totalProfitQuarter / numQuarters
          });
        }
      }

      // CORREÇÃO: Ordenar dados cronologicamente (mais antigo → mais recente)
      const sortedQuarterProfitData = [...quarterProfitData].reverse();

      return (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sortedQuarterProfitData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.2} />
            <XAxis
              dataKey="quarter"
              stroke="#9ca3af"
              fontSize={12}
            />
            <YAxis
              stroke="#9ca3af"
              fontSize={12}
              domain={(() => {
                const allValues = sortedQuarterProfitData.map(d => d.profit);
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
              {sortedQuarterProfitData.map((entry, index) => (
                <Cell
                  key={`quarterProfit-cell-${index}`}
                  fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'}
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
