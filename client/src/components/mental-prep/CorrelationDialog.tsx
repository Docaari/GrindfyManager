import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import type { SessionCorrelation } from './types';

interface CorrelationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  correlationData: SessionCorrelation[];
  hasEnoughData: boolean;
}

export function CorrelationDialog({ open, onOpenChange, correlationData, hasEnoughData }: CorrelationDialogProps) {
  const calculateCorrelation = () => {
    if (correlationData.length < 2) return 0;

    const scores = correlationData.map(d => d.warmUpScore);
    const profits = correlationData.map(d => d.sessionProfit);

    const meanScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const meanProfit = profits.reduce((sum, profit) => sum + profit, 0) / profits.length;

    let numerator = 0;
    let denominator1 = 0;
    let denominator2 = 0;

    for (let i = 0; i < scores.length; i++) {
      const scoreDiff = scores[i] - meanScore;
      const profitDiff = profits[i] - meanProfit;

      numerator += scoreDiff * profitDiff;
      denominator1 += scoreDiff * scoreDiff;
      denominator2 += profitDiff * profitDiff;
    }

    const correlation = numerator / Math.sqrt(denominator1 * denominator2);
    return isNaN(correlation) ? 0 : correlation;
  };

  const correlation = calculateCorrelation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gray-600 hover:bg-gray-700 text-[#000000] hover:text-white">
          <TrendingUp className="w-4 h-4 mr-2" />
          Performance
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-poker-accent" />
            Correlação com Performance
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Análise da correlação entre sua preparação e performance nas sessões
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 max-h-[500px] overflow-y-auto">
          {!hasEnoughData && (
            <div className="text-center py-8">
              <div className="text-gray-400 text-sm">Dados insuficientes para correlação</div>
              <div className="text-gray-500 text-xs mt-1">Complete pelo menos 3 sessões para ver correlação</div>
            </div>
          )}
          {hasEnoughData && (<>
            {/* Correlação Geral */}
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600">
              <h3 className="text-lg font-semibold text-white mb-3">Análise de Correlação</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-poker-accent">
                    {(correlation * 100).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-400">Correlação Geral</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400">
                    {correlationData.length > 0
                      ? `$${(correlationData.reduce((sum, d) => sum + d.sessionProfit, 0) / correlationData.length).toFixed(0)}`
                      : '$0'
                    }
                  </div>
                  <div className="text-sm text-gray-400">Lucro Médio</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm text-gray-400 mb-2">
                  {correlation > 0.3 ? (
                    <span className="text-green-400">✓ Correlação positiva forte - Sua preparação impacta positivamente nos resultados</span>
                  ) : correlation > 0.1 ? (
                    <span className="text-yellow-400">⚠ Correlação positiva moderada - Há alguma relação entre preparação e performance</span>
                  ) : (
                    <span className="text-red-400">⚠ Correlação baixa - Considere revisar sua estratégia de preparação</span>
                  )}
                </div>
              </div>
            </div>

            {/* Histórico de Sessões */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-white">Histórico de Sessões</h3>
              <div className="space-y-2">
                {correlationData.slice().reverse().map((session, index) => (
                  <div key={index} className="flex items-center gap-4 p-3 bg-gray-800/50 rounded-lg border border-gray-600">
                    <div className="flex-1">
                      <div className="text-sm text-gray-400">{session.sessionDate}</div>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Prep:</span>
                          <span className={`text-sm font-medium ${
                            session.warmUpScore >= 80 ? 'text-green-400' :
                            session.warmUpScore >= 60 ? 'text-yellow-400' : 'text-red-400'
                          }`}>
                            {session.warmUpScore}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">Volume:</span>
                          <span className="text-sm text-white">{session.sessionVolume}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-500">ROI:</span>
                          <span className={`text-sm font-medium ${
                            session.sessionROI > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {session.sessionROI.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${
                        session.sessionProfit > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {session.sessionProfit > 0 ? '+' : ''}${session.sessionProfit.toFixed(0)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Insights e Recomendações */}
            <div className="bg-blue-900/20 p-4 rounded-lg border border-blue-600/50">
              <h3 className="text-lg font-semibold text-white mb-2">💡 Insights</h3>
              <div className="space-y-2 text-sm">
                {correlationData.length > 0 && (
                  <>
                    <div className="text-gray-300">
                      • Sessões com preparação &gt;80%: {correlationData.filter(d => d.warmUpScore > 80).length} de {correlationData.length}
                    </div>
                    <div className="text-gray-300">
                      • Lucro médio com boa preparação (&gt;70%): $
                      {correlationData.filter(d => d.warmUpScore > 70).length > 0
                        ? correlationData.filter(d => d.warmUpScore > 70)
                            .reduce((sum, d) => sum + d.sessionProfit, 0) /
                          correlationData.filter(d => d.warmUpScore > 70).length
                        : 0
                      }
                    </div>
                    <div className="text-gray-300">
                      • Lucro médio com preparação baixa (&lt;60%): $
                      {correlationData.filter(d => d.warmUpScore < 60).length > 0
                        ? correlationData.filter(d => d.warmUpScore < 60)
                            .reduce((sum, d) => sum + d.sessionProfit, 0) /
                          correlationData.filter(d => d.warmUpScore < 60).length
                        : 0
                      }
                    </div>
                  </>
                )}
              </div>
            </div>
          </>)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
