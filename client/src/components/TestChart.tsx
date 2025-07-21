import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';

// Dados de teste simples
const testData = [
  { name: 'PokerStars', value: 400 },
  { name: 'WPN', value: 300 },
  { name: 'GGPoker', value: 200 },
  { name: '888Poker', value: 150 }
];

export default function TestChart() {
  return (
    <div className="p-4 bg-gray-800 rounded-lg">
      <h3 className="text-white text-lg mb-4">Teste de Renderização - Recharts</h3>
      
      {/* Teste 1: Gráfico de Pizza Simples */}
      <div className="mb-8">
        <h4 className="text-white text-md mb-2">Teste 1: Gráfico de Pizza</h4>
        <div style={{ width: '100%', height: '300px' }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={testData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="value"
              >
                {testData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={`hsl(${index * 90}, 70%, 50%)`} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Teste 2: Gráfico de Barras Simples */}
      <div className="mb-8">
        <h4 className="text-white text-md mb-2">Teste 2: Gráfico de Barras</h4>
        <div style={{ width: '100%', height: '300px' }}>
          <ResponsiveContainer>
            <BarChart data={testData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Teste 3: Dimensões fixas */}
      <div className="mb-8">
        <h4 className="text-white text-md mb-2">Teste 3: Dimensões Fixas (400x300)</h4>
        <ResponsiveContainer width={400} height={300}>
          <BarChart data={testData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="value" fill="#82ca9d" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Status dos dados */}
      <div className="text-white">
        <h4>Status dos Dados:</h4>
        <pre className="bg-gray-700 p-2 rounded text-sm">
          {JSON.stringify(testData, null, 2)}
        </pre>
      </div>
    </div>
  );
}