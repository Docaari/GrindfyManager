import type { ComparisonDataItem } from './types';

interface ComparisonInterfaceProps {
  comparisonData: {
    period1: { from: string; to: string; data: ComparisonDataItem[] };
    period2: { from: string; to: string; data: ComparisonDataItem[] };
  };
  setComparisonData: React.Dispatch<React.SetStateAction<{
    period1: { from: string; to: string; data: ComparisonDataItem[] };
    period2: { from: string; to: string; data: ComparisonDataItem[] };
  }>>;
  onQuickComparison: (type: string) => void;
  onApplyComparison: (p1From: string, p1To: string, p2From: string, p2To: string) => void;
  loading: boolean;
  formatCurrency: (value: number) => string;
}

export function ComparisonInterface({ comparisonData, setComparisonData, onQuickComparison, onApplyComparison, loading, formatCurrency }: ComparisonInterfaceProps) {
  return (
    <>
      {/* Comparison Metrics */}
      {comparisonData.period1.data.length > 0 && (
        <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-4 h-4 bg-emerald-500 rounded-full"></div>
                <span className="text-emerald-400 font-medium">📈 PERÍODO 1 (Verde)</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Volume:</span>
                  <span className="text-white font-medium">10 torneios</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Profit:</span>
                  <span className="text-emerald-400 font-medium">{formatCurrency(comparisonData.period1.data[comparisonData.period1.data.length - 1]?.cumulative || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Período:</span>
                  <span className="text-gray-300">{comparisonData.period1.from} - {comparisonData.period1.to}</span>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
                <span className="text-orange-400 font-medium">📊 PERÍODO 2 (Laranja)</span>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Volume:</span>
                  <span className="text-white font-medium">10 torneios</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Profit:</span>
                  <span className="text-orange-400 font-medium">{formatCurrency(comparisonData.period2.data[comparisonData.period2.data.length - 1]?.cumulative || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Período:</span>
                  <span className="text-gray-300">{comparisonData.period2.from} - {comparisonData.period2.to}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Interface */}
      <div className="comparison-interface mt-6 p-6 bg-gray-800/50 rounded-xl border border-gray-700">
        <h4 className="text-white font-semibold mb-4 flex items-center gap-2">
          ⚙️ Configurar Comparação
        </h4>

        <div className="quick-buttons mb-6">
          <h5 className="text-gray-300 text-sm font-medium mb-3">Períodos Pré-definidos:</h5>
          <div className="flex flex-wrap gap-3">
            {[
              { type: 'month', label: '📅 Mês', color: 'bg-blue-600 hover:bg-blue-500' },
              { type: 'quarter', label: '📊 Trimestre', color: 'bg-purple-600 hover:bg-purple-500' },
              { type: 'semester', label: '📈 Semestre', color: 'bg-indigo-600 hover:bg-indigo-500' },
              { type: 'year', label: '🗓️ Ano', color: 'bg-green-600 hover:bg-green-500' },
            ].map(({ type, label, color }) => (
              <button key={type} onClick={() => onQuickComparison(type)} className={`${color} text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="manual-periods">
          <h5 className="text-gray-300 text-sm font-medium mb-3">Períodos Customizados:</h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { key: 'period1' as const, label: '📊 Período 1 (Verde)', color: 'green' },
              { key: 'period2' as const, label: '📈 Período 2 (Laranja)', color: 'orange' },
            ].map(({ key, label, color }) => (
              <div key={key} className={`period-config bg-${color}-900/20 border border-${color}-600/30 rounded-lg p-4`}>
                <h6 className={`text-${color}-400 font-medium mb-3 flex items-center gap-2`}>{label}</h6>
                <div className="space-y-3">
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">De:</label>
                    <input
                      type="date"
                      value={comparisonData[key].from}
                      onChange={(e) => setComparisonData(prev => ({ ...prev, [key]: { ...prev[key], from: e.target.value } }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm mb-1">Até:</label>
                    <input
                      type="date"
                      value={comparisonData[key].to}
                      onChange={(e) => setComparisonData(prev => ({ ...prev, [key]: { ...prev[key], to: e.target.value } }))}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 text-center">
            <button
              onClick={() => onApplyComparison(comparisonData.period1.from, comparisonData.period1.to, comparisonData.period2.from, comparisonData.period2.to)}
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {loading ? '🔄 Aplicando...' : '🔄 Aplicar Comparação'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
