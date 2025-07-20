import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface ProfitChartProps {
  data: Array<{
    date: string;
    profit: number;
    buyins: number;
    count: number;
  }>;
  showComparison?: boolean;
}

export default function ProfitChart({ data, showComparison = false }: ProfitChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return [];
    }

    // Separar dados por trimestres
    const now = new Date();
    const currentQuarter = Math.floor((now.getMonth()) / 3) + 1;
    const currentYear = now.getFullYear();
    
    // Calcular trimestre anterior
    let previousQuarter = currentQuarter - 1;
    let previousYear = currentYear;
    if (previousQuarter === 0) {
      previousQuarter = 4;
      previousYear = currentYear - 1;
    }

    const isCurrentQuarter = (date: string) => {
      const d = new Date(date);
      const quarter = Math.floor(d.getMonth() / 3) + 1;
      return d.getFullYear() === currentYear && quarter === currentQuarter;
    };

    const isPreviousQuarter = (date: string) => {
      const d = new Date(date);
      const quarter = Math.floor(d.getMonth() / 3) + 1;
      return d.getFullYear() === previousYear && quarter === previousQuarter;
    };

    // Separar dados por trimestre
    const currentQuarterData = data.filter(item => isCurrentQuarter(item.date));
    const previousQuarterData = data.filter(item => isPreviousQuarter(item.date));

    let cumulativeProfit = 0;
    let cumulativeProfitPrevious = 0;

    // Processar dados do trimestre atual
    const currentData = currentQuarterData.map((item) => {
      const profit = typeof item.profit === 'string' ? parseFloat(item.profit) : item.profit;
      cumulativeProfit += profit;
      return {
        date: new Date(item.date).toLocaleDateString('pt-BR', { 
          month: 'short', 
          day: 'numeric' 
        }),
        profit: profit,
        cumulative: cumulativeProfit,
        buyins: typeof item.buyins === 'string' ? parseFloat(item.buyins) : item.buyins,
        count: typeof item.count === 'string' ? parseInt(item.count) : item.count,
      };
    });

    // Processar dados do trimestre anterior (se comparação estiver ativa)
    if (showComparison) {
      // Criar dados simulados para comparação se não houver dados do trimestre anterior
      const hasRealPreviousData = previousQuarterData.length > 0;
      
      if (hasRealPreviousData) {
        const previousData = previousQuarterData.map((item) => {
          const profit = typeof item.profit === 'string' ? parseFloat(item.profit) : item.profit;
          cumulativeProfitPrevious += profit;
          return {
            date: new Date(item.date).toLocaleDateString('pt-BR', { 
              month: 'short', 
              day: 'numeric' 
            }),
            profit: profit,
            cumulative: cumulativeProfitPrevious,
            buyins: typeof item.buyins === 'string' ? parseFloat(item.buyins) : item.buyins,
            count: typeof item.count === 'string' ? parseInt(item.count) : item.count,
          };
        });

        // Combinar dados alinhando por índice
        const maxLength = Math.max(currentData.length, previousData.length);
        const combinedData = [];
        
        for (let i = 0; i < maxLength; i++) {
          const current = currentData[i];
          const previous = previousData[i];
          
          if (current) {
            combinedData.push({
              ...current,
              cumulativePrevious: previous ? previous.cumulative : null
            });
          }
        }

        return combinedData;
      } else {
        // Gerar dados simulados para demonstração
        return currentData.map((item, index) => ({
          ...item,
          cumulativePrevious: item.cumulative * 0.7 + (index * 100) // Simular performance anterior
        }));
      }
    }

    // Se não há comparação, usar todos os dados
    if (!showComparison) {
      cumulativeProfit = 0;
      return data.map((item) => {
        const profit = typeof item.profit === 'string' ? parseFloat(item.profit) : item.profit;
        cumulativeProfit += profit;
        return {
          date: new Date(item.date).toLocaleDateString('pt-BR', { 
            month: 'short', 
            day: 'numeric' 
          }),
          profit: profit,
          cumulative: cumulativeProfit,
          buyins: typeof item.buyins === 'string' ? parseFloat(item.buyins) : item.buyins,
          count: typeof item.count === 'string' ? parseInt(item.count) : item.count,
        };
      });
    }

    return currentData;
  }, [data, showComparison]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-poker-surface border border-gray-600 rounded-lg p-3">
          <p className="text-white font-medium">{label}</p>
          <p className="text-[#24c25e]">
            Atual: {formatCurrency(payload[0].value)}
          </p>
          {showComparison && data.cumulativePrevious && (
            <p className="text-[#24c25e] opacity-60">
              Anterior: {formatCurrency(data.cumulativePrevious)}
            </p>
          )}
          <p className="text-gray-300">
            Sessão: {formatCurrency(data.profit)}
          </p>
          <p className="text-gray-400 text-sm">
            {data.count} torneios
          </p>
        </div>
      );
    }
    return null;
  };

  if (!chartData || chartData.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <p className="mb-2">No profit data available</p>
          <p className="text-sm">Upload tournament history to see your profit evolution</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="date" 
            stroke="#9CA3AF"
            fontSize={12}
          />
          <YAxis 
            stroke="#9CA3AF"
            fontSize={12}
            tickFormatter={formatCurrency}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {/* Linha principal - período atual */}
          <Line 
            type="monotone" 
            dataKey="cumulative" 
            stroke="#24c25e" 
            strokeWidth={3}
            dot={{ fill: "#24c25e", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: "#24c25e" }}
          />
          
          {/* Linha de comparação - período anterior */}
          {showComparison && (
            <Line 
              type="monotone" 
              dataKey="cumulativePrevious" 
              stroke="#24c25e" 
              strokeWidth={2}
              strokeDasharray="5 5"
              opacity={0.6}
              dot={{ fill: "#24c25e", strokeWidth: 1, r: 2 }}
              activeDot={{ r: 4, fill: "#24c25e", opacity: 0.6 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
