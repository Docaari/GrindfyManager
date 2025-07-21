import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';

const LineChartTest = () => {
  // Dados super simples para testar LineChart especificamente
  const testData = [
    { month: 'Jan', PokerStars: 1000, WPN: 500 },
    { month: 'Fev', PokerStars: 1200, WPN: 600 },
    { month: 'Mar', PokerStars: 800, WPN: 700 },
    { month: 'Abr', PokerStars: 1500, WPN: 900 }
  ];

  return (
    <div className="bg-red-900/20 p-4 rounded-lg border border-red-500">
      <h3 className="text-white mb-4">🔧 TESTE CRÍTICO: LineChart Isolado</h3>
      
      <div className="bg-gray-800 p-4 rounded">
        <h4 className="text-red-400 text-sm mb-2">❌ Gráfico de Linha (Problema):</h4>
        <div style={{ width: '100%', height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={testData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#fff" fontSize={12} />
              <YAxis stroke="#fff" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1f2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#fff'
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="PokerStars" 
                stroke="#0088FE" 
                strokeWidth={2}
                dot={{ fill: '#0088FE', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                type="monotone" 
                dataKey="WPN" 
                stroke="#00C49F" 
                strokeWidth={2}
                dot={{ fill: '#00C49F', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      <p className="text-yellow-400 text-xs mt-2">
        ⚠️ Se este gráfico não aparecer, confirmamos o problema específico nos componentes LineChart.
      </p>
    </div>
  );
}

export default LineChartTest;