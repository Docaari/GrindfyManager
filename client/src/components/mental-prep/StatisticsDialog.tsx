import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BarChart3, Flame, Activity } from 'lucide-react';
import type { WarmUpStats } from './types';

interface StatisticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stats: WarmUpStats;
}

export function StatisticsDialog({ open, onOpenChange, stats }: StatisticsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-gray-600 hover:bg-gray-700 text-[#000000] hover:text-white">
          <BarChart3 className="w-4 h-4 mr-2" />
          Estatísticas
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] bg-poker-surface border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-poker-accent" />
            Estatísticas do Warm Up
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Acompanhe sua evolução e estatísticas de preparação
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 max-h-[500px] overflow-y-auto">
          {/* Estatísticas Gerais */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600">
              <div className="text-2xl font-bold text-poker-accent">{stats.totalSessions}</div>
              <div className="text-sm text-gray-400">Sessões Total</div>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600">
              <div className="text-2xl font-bold text-green-400">{stats.averageScore.toFixed(1)}%</div>
              <div className="text-sm text-gray-400">Média de Score</div>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600">
              <div className="text-2xl font-bold text-yellow-400 flex items-center gap-1">
                <Flame className="w-5 h-5" />
                {stats.currentStreak}
              </div>
              <div className="text-sm text-gray-400">Sequência Atual</div>
            </div>
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600">
              <div className="text-2xl font-bold text-orange-400">{stats.longestStreak}</div>
              <div className="text-sm text-gray-400">Maior Sequência</div>
            </div>
          </div>

          {/* Estatísticas de Atividades */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Atividades Utilizadas</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-600">
                <div className="text-lg font-bold text-blue-400">{stats.totalMeditations}</div>
                <div className="text-sm text-gray-400">Meditações</div>
              </div>
              <div className="bg-gray-800/50 p-3 rounded-lg border border-gray-600">
                <div className="text-lg font-bold text-purple-400">{stats.totalVisualizations}</div>
                <div className="text-sm text-gray-400">Visualizações</div>
              </div>
            </div>
          </div>

          {/* Evolução do Score */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Evolução Recente</h3>
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-poker-accent" />
                <span className="text-sm text-gray-400">Últimas 7 sessões</span>
              </div>
              <div className="flex items-end gap-2 h-16">
                {stats.scoreHistory.slice(-7).map((score, index) => (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-poker-accent opacity-70 rounded-t"
                      style={{ height: `${(score.score / 100) * 100}%` }}
                    />
                    <div className="text-xs text-gray-400 mt-1">{score.score}%</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Estado Mental Médio */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-white">Estado Mental Médio</h3>
            <div className="space-y-2">
              {['energia', 'foco', 'confianca', 'equilibrio'].map(dimension => {
                const avg = stats.mentalStateEvolution.length > 0
                  ? stats.mentalStateEvolution.reduce((sum, state) => sum + Number(state[dimension as keyof typeof state]), 0) / stats.mentalStateEvolution.length
                  : 0;

                return (
                  <div key={dimension} className="flex items-center gap-3">
                    <div className="w-20 text-sm text-gray-400 capitalize">{dimension}</div>
                    <div className="flex-1">
                      <Progress value={avg} className="h-2" />
                    </div>
                    <div className="w-12 text-sm text-white">{avg.toFixed(0)}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
