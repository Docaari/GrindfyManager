import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock } from 'lucide-react';

interface QuickHistoryCardProps {
  recentLogs: any[];
  isLoading: boolean;
}

export function QuickHistoryCard({ recentLogs, isLoading }: QuickHistoryCardProps) {
  return (
    <Card className="bg-poker-surface border-gray-700">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-poker-accent" />
          Histórico Rápido
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-gray-800/50 rounded-lg p-3 border border-gray-600 animate-pulse">
                  <div className="h-4 bg-gray-700 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-gray-700 rounded w-2/3" />
                </div>
              ))}
            </div>
          ) : recentLogs.length > 0 ? (
            recentLogs.map((log: any, index: number) => {
              const score = log.mentalState;
              const dateLabel = new Date(log.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
              const scoreColor = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
              const feedback = score >= 80 ? 'Excelente preparacao!' : score >= 60 ? 'Preparacao moderada' : 'Preparacao insuficiente';
              return (
                <div key={log.id || index} className="bg-gray-800/50 rounded-lg p-3 border border-gray-600">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-400">{dateLabel}</span>
                    <span className={`text-sm font-bold ${scoreColor}`}>{score}%</span>
                  </div>
                  <div className="text-xs text-gray-500">{feedback}</div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-gray-500 text-center py-4">
              Nenhum historico de preparacao ainda
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
