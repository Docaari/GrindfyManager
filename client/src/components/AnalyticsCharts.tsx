import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip } from 'recharts';

interface AnalyticsChartsProps {
  type: string;
  data: any[];
}

const COLORS = ['#24c25e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'];

export default function AnalyticsCharts({ type, data }: AnalyticsChartsProps) {
  // Proteção contra dados undefined
  if (!data || !Array.isArray(data) || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-gray-400">
        <p>Sem dados disponíveis</p>
      </div>
    );
  }

  const renderChart = () => {
    switch (type) {
      case 'site':
      case 'siteProfit':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="site" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey={type === 'site' ? 'volume' : 'profit'} fill="#24c25e" />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'buyin':
      case 'buyinROI':
      case 'buyinProfit':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="buyinRange" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name) => [
                  type === 'buyinProfit' ? `$${Number(value).toFixed(2)}` : type === 'buyinROI' ? `${Number(value).toFixed(1)}%` : value,
                  type === 'buyinProfit' ? 'Profit' : type === 'buyinROI' ? 'ROI' : 'Volume'
                ]}
              />
              <Bar dataKey={type === 'buyin' ? 'volume' : type === 'buyinROI' ? 'roi' : 'profit'}>
                {type === 'buyinProfit' && data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'} 
                  />
                ))}
                {type !== 'buyinProfit' && <Bar fill="#24c25e" />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'category':
      case 'categoryProfit':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="category" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name) => [
                  type === 'category' ? value : `$${Number(value).toFixed(2)}`,
                  type === 'category' ? 'Volume' : 'Profit'
                ]}
              />
              <Bar dataKey={type === 'category' ? 'volume' : 'profit'}>
                {data.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={type === 'categoryProfit' && Number(entry.profit) < 0 ? '#ef4444' : COLORS[index % COLORS.length]} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'day':
      case 'dayVolume':
      case 'dayProfit':
      case 'dayROI':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="dayName" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey={type === 'day' || type === 'dayVolume' ? 'volume' : type === 'dayProfit' ? 'profit' : 'roi'} fill="#24c25e" />
            </BarChart>
          </ResponsiveContainer>
        );

      // ETAPA 4: Speed analytics
      case 'speed':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="speed" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name) => [value, 'Volume']}
              />
              <Bar dataKey="volume">
                {data.map((entry, index) => (
                  <Cell key={`speed-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      case 'speedProfit':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="speed" stroke="#9ca3af" fontSize={12} />
              <YAxis stroke="#9ca3af" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
                formatter={(value, name) => [`$${Number(value).toFixed(2)}`, 'Profit']}
              />
              <Bar dataKey="profit">
                {data.map((entry, index) => (
                  <Cell 
                    key={`speedProfit-cell-${index}`} 
                    fill={Number(entry.profit) >= 0 ? '#10b981' : '#ef4444'} 
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

      // ETAPA 5: Monthly analytics
      case 'month':
      case 'monthVolume':
      case 'monthProfit':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="monthName" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey={type === 'month' || type === 'monthProfit' ? 'profit' : 'volume'} fill="#24c25e" />
            </BarChart>
          </ResponsiveContainer>
        );

      // ETAPA 5: Field elimination analytics
      case 'field':
      case 'fieldElimination':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="fieldRange" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey="volume" fill="#24c25e" />
            </BarChart>
          </ResponsiveContainer>
        );

      // ETAPA 5: Final table positions
      case 'finalTable':
      case 'finalTablePositions':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="position" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }} 
              />
              <Bar dataKey="volume" fill="#24c25e" />
            </BarChart>
          </ResponsiveContainer>
        );
      
      default:
        return (
          <div className="h-64 flex items-center justify-center text-gray-400">
            <p>Tipo de gráfico não suportado</p>
          </div>
        );
    }
  };

  return renderChart();
}