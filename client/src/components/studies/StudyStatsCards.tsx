import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { type StudyDashboardStats } from "./types";
import { formatTime, getScoreColor } from "./utils";

interface StudyStatsCardsProps {
  stats: StudyDashboardStats;
}

export function StudyStatsCards({ stats }: StudyStatsCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <Card className="bg-poker-surface border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-400">Cartões Ativos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-white">{stats.activeCards}</div>
          <p className="text-xs text-gray-400">de {stats.totalCards} totais</p>
        </CardContent>
      </Card>

      <Card className="bg-poker-surface border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-400">Tempo Investido</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-poker-accent">
            {formatTime(stats.weeklyTime)}
          </div>
          <p className="text-xs text-gray-400">esta semana</p>
          <div className="mt-2">
            <Progress value={(stats.weeklyTime / 480) * 100} className="h-1" />
            <p className="text-xs text-gray-500 mt-1">
              Meta: 8h semanais ({Math.round((stats.weeklyTime / 480) * 100)}%)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-poker-surface border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-400">Score Médio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`text-2xl font-bold ${getScoreColor(stats.avgKnowledgeScore)}`}>
            {stats.avgKnowledgeScore}%
          </div>
          <p className="text-xs text-gray-400">conhecimento geral</p>
        </CardContent>
      </Card>

      <Card className="bg-poker-surface border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-400">Concluídos</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-400">{stats.completedCards}</div>
          <p className="text-xs text-gray-400">estudos finalizados</p>
        </CardContent>
      </Card>
    </div>
  );
}
