import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface AnalyticsChartsProps {
  siteData: any[];
  buyinData: any[];
  categoryData: any[];
  dayData: any[];
}

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#f97316', '#06b6d4', '#84cc16'];

export default function AnalyticsCharts({ siteData, buyinData, categoryData, dayData }: AnalyticsChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Volume/Lucro por Site */}
      <div className="bg-slate-900 p-6 rounded-lg border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Performance por Site</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={siteData}>
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
            <Legend />
            <Bar dataKey="profit" fill="#10b981" name="Lucro ($)" />
            <Bar dataKey="volume" fill="#3b82f6" name="Volume" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ROI por Faixa de Buy-in */}
      <div className="bg-slate-900 p-6 rounded-lg border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">ROI por Faixa de Buy-in</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={buyinData}>
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
            />
            <Bar dataKey="roi" fill="#f59e0b" name="ROI (%)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Volume por Categoria */}
      <div className="bg-slate-900 p-6 rounded-lg border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Distribuição por Categoria</h3>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={categoryData}
              cx="50%"
              cy="50%"
              outerRadius={80}
              fill="#8884d8"
              dataKey="volume"
              label={({ category, volume }) => `${category}: ${volume}`}
            >
              {categoryData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1f2937', 
                border: '1px solid #374151',
                borderRadius: '8px',
                color: '#fff'
              }} 
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Lucro Médio por Dia da Semana */}
      <div className="bg-slate-900 p-6 rounded-lg border border-slate-700">
        <h3 className="text-lg font-semibold text-white mb-4">Lucro Médio por Dia da Semana</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={dayData}>
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
            <Line 
              type="monotone" 
              dataKey="avgProfit" 
              stroke="#10b981" 
              strokeWidth={2}
              name="Lucro Médio ($)"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}