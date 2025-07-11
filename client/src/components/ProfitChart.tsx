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
    console.log('ProfitChart data:', data);
    if (!data || data.length === 0) {
      console.log('ProfitChart: No data available');
      return [];
    }

    let cumulativeProfit = 0;
    return data.map((item) => {
      cumulativeProfit += item.profit;
      return {
        date: new Date(item.date).toLocaleDateString('pt-BR', { 
          month: 'short', 
          day: 'numeric' 
        }),
        profit: item.profit,
        cumulative: cumulativeProfit,
        buyins: item.buyins,
        count: item.count,
      };
    });
  }, [data]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-poker-surface border border-gray-600 rounded-lg p-3">
          <p className="text-white font-medium">{label}</p>
          <p className="text-poker-gold">
            Cumulative: {formatCurrency(payload[0].value)}
          </p>
          <p className="text-gray-300">
            Session: {formatCurrency(payload[0].payload.profit)}
          </p>
          <p className="text-gray-400 text-sm">
            {payload[0].payload.count} tournaments
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
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
          <Line 
            type="monotone" 
            dataKey="cumulative" 
            stroke="#FFD700" 
            strokeWidth={2}
            dot={{ fill: "#FFD700", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: "#FFD700" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
