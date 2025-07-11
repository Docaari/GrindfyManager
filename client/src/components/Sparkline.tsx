import { ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';

interface SparklineProps {
  data: Array<{ value: number; date?: string }>;
  type?: 'line' | 'area';
  color?: string;
  height?: number;
  strokeWidth?: number;
  showDots?: boolean;
  trend?: 'up' | 'down' | 'neutral';
}

export default function Sparkline({ 
  data, 
  type = 'line', 
  color = '#24c25e', 
  height = 40,
  strokeWidth = 2,
  showDots = false,
  trend = 'neutral'
}: SparklineProps) {
  if (!data || data.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-gray-500 text-xs">-</div>;
  }

  const trendColor = trend === 'up' ? '#24c25e' : trend === 'down' ? '#ef4444' : color;
  
  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {type === 'area' ? (
          <AreaChart data={data}>
            <defs>
              <linearGradient id={`gradient-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={trendColor} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={trendColor} stopOpacity={0.1}/>
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke={trendColor}
              strokeWidth={strokeWidth}
              fill={`url(#gradient-${color.replace('#', '')})`}
              dot={showDots}
            />
          </AreaChart>
        ) : (
          <LineChart data={data}>
            <Line
              type="monotone"
              dataKey="value"
              stroke={trendColor}
              strokeWidth={strokeWidth}
              dot={showDots ? { fill: trendColor, strokeWidth: 1, r: 2 } : false}
              activeDot={false}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}