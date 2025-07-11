import { forwardRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, Edit3, TrendingUp, BarChart3, Clock } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface BreakFeedback {
  id: string;
  breakNumber: number;
  timestamp: string;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  notes: string;
}

interface BreakHistoryPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onEditBreak: (breakFeedback: BreakFeedback) => void;
  sessionBreaks: BreakFeedback[];
}

interface ChartData {
  breakNumber: number;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  timestamp: string;
}

export const BreakHistoryPopup = forwardRef<HTMLDivElement, BreakHistoryPopupProps>(({
  isOpen,
  onClose,
  onEditBreak,
  sessionBreaks
}, ref) => {
  const [activeMetrics, setActiveMetrics] = useState({
    foco: true,
    energia: true,
    confianca: true,
    inteligenciaEmocional: true,
    interferencias: true
  });

  if (!isOpen) return null;

  // Preparar dados para o gráfico
  const chartData: ChartData[] = sessionBreaks.map(breakFeedback => ({
    breakNumber: breakFeedback.breakNumber,
    foco: breakFeedback.foco,
    energia: breakFeedback.energia,
    confianca: breakFeedback.confianca,
    inteligenciaEmocional: breakFeedback.inteligenciaEmocional,
    interferencias: breakFeedback.interferencias,
    timestamp: breakFeedback.timestamp
  }));

  // Calcular estatísticas
  const calculateStats = () => {
    if (sessionBreaks.length === 0) return null;

    const totals = sessionBreaks.reduce((acc, breakFeedback) => {
      acc.foco += breakFeedback.foco;
      acc.energia += breakFeedback.energia;
      acc.confianca += breakFeedback.confianca;
      acc.inteligenciaEmocional += breakFeedback.inteligenciaEmocional;
      acc.interferencias += breakFeedback.interferencias;
      return acc;
    }, { foco: 0, energia: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 });

    const count = sessionBreaks.length;
    const averages = {
      foco: Math.round((totals.foco / count) * 10) / 10,
      energia: Math.round((totals.energia / count) * 10) / 10,
      confianca: Math.round((totals.confianca / count) * 10) / 10,
      inteligenciaEmocional: Math.round((totals.inteligenciaEmocional / count) * 10) / 10,
      interferencias: Math.round((totals.interferencias / count) * 10) / 10
    };

    // Encontrar melhor e pior break (baseado na média dos valores)
    const breakScores = sessionBreaks.map(breakFeedback => {
      const score = (breakFeedback.foco + breakFeedback.energia + breakFeedback.confianca + 
                    breakFeedback.inteligenciaEmocional + breakFeedback.interferencias) / 5;
      return { ...breakFeedback, score };
    });

    const bestBreak = breakScores.reduce((best, current) => 
      current.score > best.score ? current : best
    );
    const worstBreak = breakScores.reduce((worst, current) => 
      current.score < worst.score ? current : worst
    );

    return { averages, bestBreak, worstBreak, count };
  };

  const stats = calculateStats();

  const toggleMetric = (metric: keyof typeof activeMetrics) => {
    setActiveMetrics(prev => ({
      ...prev,
      [metric]: !prev[metric]
    }));
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 7) return 'bg-green-500/20 border-green-500';
    if (score >= 4) return 'bg-yellow-500/20 border-yellow-500';
    return 'bg-red-500/20 border-red-500';
  };

  const getPerformanceText = (score: number) => {
    if (score >= 7) return 'Excelente';
    if (score >= 4) return 'Bom';
    return 'Precisa Melhorar';
  };

  const metricColors = {
    foco: '#3b82f6',
    energia: '#ef4444',
    confianca: '#10b981',
    inteligenciaEmocional: '#f59e0b',
    interferencias: '#8b5cf6'
  };

  const metricLabels = {
    foco: 'Foco',
    energia: 'Energia',
    confianca: 'Confiança',
    inteligenciaEmocional: 'Int. Emocional',
    interferencias: 'Interferências'
  };

  return (
    <div 
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
    >
      <div 
        style={{
          backgroundColor: '#1f2937',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '1200px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid #374151'
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#16a249] rounded-full flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Histórico de Breaks</h2>
              <p className="text-sm text-gray-400">
                Feedback do Break &gt; Histórico • {stats?.count || 0} breaks registrados
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Conteúdo */}
        <div className="p-6 space-y-6">
          {sessionBreaks.length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-300 mb-2">
                Nenhum break registrado ainda
              </h3>
              <p className="text-gray-500">
                Os breaks registrados aparecerão aqui para análise
              </p>
            </div>
          ) : (
            <>
              {/* Estatísticas */}
              {stats && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-900/20 border border-blue-600/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-blue-400" />
                      <h4 className="text-sm font-medium text-blue-400">Médias Gerais</h4>
                    </div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-300">Foco:</span>
                        <span className="text-white font-medium">{stats.averages.foco}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Energia:</span>
                        <span className="text-white font-medium">{stats.averages.energia}/10</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-300">Confiança:</span>
                        <span className="text-white font-medium">{stats.averages.confianca}/10</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-green-900/20 border border-green-600/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-green-400" />
                      <h4 className="text-sm font-medium text-green-400">Melhor Break</h4>
                    </div>
                    <div className="text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-300">Break #{stats.bestBreak.breakNumber}</span>
                        <span className="text-white font-medium">{formatTime(stats.bestBreak.timestamp)}</span>
                      </div>
                      <div className="text-green-400 font-medium">
                        Média: {Math.round(stats.bestBreak.score * 10) / 10}/10
                      </div>
                    </div>
                  </div>

                  <div className="bg-red-900/20 border border-red-600/30 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-red-400" />
                      <h4 className="text-sm font-medium text-red-400">Pior Break</h4>
                    </div>
                    <div className="text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="text-gray-300">Break #{stats.worstBreak.breakNumber}</span>
                        <span className="text-white font-medium">{formatTime(stats.worstBreak.timestamp)}</span>
                      </div>
                      <div className="text-red-400 font-medium">
                        Média: {Math.round(stats.worstBreak.score * 10) / 10}/10
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filtros do Gráfico */}
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-3">Filtros do Gráfico</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(metricLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => toggleMetric(key as keyof typeof activeMetrics)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                        activeMetrics[key as keyof typeof activeMetrics]
                          ? 'bg-[#16a249] text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                      style={{
                        backgroundColor: activeMetrics[key as keyof typeof activeMetrics] 
                          ? metricColors[key as keyof typeof metricColors] 
                          : undefined
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gráfico */}
              <div className="bg-gray-900/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-300 mb-4">Evolução das Métricas</h4>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis 
                        dataKey="breakNumber" 
                        stroke="#9ca3af"
                        fontSize={12}
                        tickFormatter={(value) => `Break ${value}`}
                      />
                      <YAxis 
                        stroke="#9ca3af"
                        fontSize={12}
                        domain={[0, 10]}
                      />
                      <Tooltip 
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: '1px solid #374151',
                          borderRadius: '8px',
                          color: '#fff'
                        }}
                        formatter={(value, name) => [value, metricLabels[name as keyof typeof metricLabels]]}
                        labelFormatter={(label) => `Break ${label}`}
                      />
                      <Legend />
                      {Object.entries(metricColors).map(([key, color]) => (
                        activeMetrics[key as keyof typeof activeMetrics] && (
                          <Line 
                            key={key}
                            type="monotone" 
                            dataKey={key}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ r: 4 }}
                            activeDot={{ r: 6 }}
                            name={metricLabels[key as keyof typeof metricLabels]}
                          />
                        )
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Lista de Breaks */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-gray-300">Breaks Registrados</h4>
                <div className="space-y-2">
                  {sessionBreaks.map((breakFeedback) => {
                    const averageScore = (breakFeedback.foco + breakFeedback.energia + 
                                       breakFeedback.confianca + breakFeedback.inteligenciaEmocional + 
                                       breakFeedback.interferencias) / 5;
                    
                    return (
                      <div 
                        key={breakFeedback.id}
                        className={`border rounded-lg p-4 transition-all hover:shadow-md ${getPerformanceColor(averageScore)}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-white">
                                Break #{breakFeedback.breakNumber}
                              </span>
                              <span className="text-xs text-gray-400">
                                {formatTime(breakFeedback.timestamp)}
                              </span>
                            </div>
                            <div className="px-2 py-1 rounded-full bg-gray-700 text-xs text-gray-300">
                              {getPerformanceText(averageScore)}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEditBreak(breakFeedback)}
                            className="text-gray-400 hover:text-white"
                          >
                            <Edit3 className="w-4 h-4 mr-1" />
                            Editar
                          </Button>
                        </div>

                        <div className="grid grid-cols-5 gap-3 mb-3">
                          <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Foco</div>
                            <div className="text-sm font-medium text-white">{breakFeedback.foco}/10</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Energia</div>
                            <div className="text-sm font-medium text-white">{breakFeedback.energia}/10</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Confiança</div>
                            <div className="text-sm font-medium text-white">{breakFeedback.confianca}/10</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Int. Emocional</div>
                            <div className="text-sm font-medium text-white">{breakFeedback.inteligenciaEmocional}/10</div>
                          </div>
                          <div className="text-center">
                            <div className="text-xs text-gray-400 mb-1">Interferências</div>
                            <div className="text-sm font-medium text-white">{breakFeedback.interferencias}/10</div>
                          </div>
                        </div>

                        {breakFeedback.notes && (
                          <div className="pt-3 border-t border-gray-600">
                            <div className="text-xs text-gray-400 mb-1">Notas</div>
                            <div className="text-sm text-gray-300">{breakFeedback.notes}</div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-center p-4 border-t border-gray-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-600 text-gray-400 hover:bg-gray-800"
          >
            Fechar Histórico
          </Button>
        </div>
      </div>
    </div>
  );
});

BreakHistoryPopup.displayName = 'BreakHistoryPopup';