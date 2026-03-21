import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Clock, Target, Trophy, CheckCircle } from "lucide-react";
import { type StudyDashboardStats, type DailyRecommendationsData } from "./types";
import { formatTime } from "./utils";

interface StudyNotificationsProps {
  stats: StudyDashboardStats;
  dailyRecommendations: DailyRecommendationsData;
}

export function StudyNotifications({ stats, dailyRecommendations }: StudyNotificationsProps) {
  return (
    <>
      {/* Weekly goal notifications */}
      {stats.weeklyTime < 240 && (
        <Card className="bg-yellow-900/20 border-yellow-500/30 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Target className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-yellow-400 font-medium">Meta Semanal em Andamento</p>
                <p className="text-sm text-gray-400">
                  Você estudou {formatTime(stats.weeklyTime)} de 8h esta semana.
                  Continue focado para atingir sua meta!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {stats.weeklyTime >= 480 && (
        <Card className="bg-green-900/20 border-green-500/30 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-green-400 font-medium">🎯 Meta Semanal Atingida!</p>
                <p className="text-sm text-gray-400">
                  Parabéns! Você completou {formatTime(stats.weeklyTime)} de estudo esta semana.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily progress notifications */}
      {!dailyRecommendations.hasStudiedToday && (
        <Card className="bg-blue-900/20 border-blue-500/30 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-blue-400" />
              <div>
                <p className="text-blue-400 font-medium">Hora de Estudar!</p>
                <p className="text-sm text-gray-400">
                  Você ainda não estudou hoje. Que tal começar com uma sessão de {formatTime(60)}?
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {dailyRecommendations.hasStudiedToday && !dailyRecommendations.reachedDailyGoal && (
        <Card className="bg-orange-900/20 border-orange-500/30 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-orange-400" />
              <div>
                <p className="text-orange-400 font-medium">Continue Estudando!</p>
                <p className="text-sm text-gray-400">
                  Você já estudou {formatTime(dailyRecommendations.studiedToday)} hoje.
                  Faltam apenas {formatTime(dailyRecommendations.remainingTime)} para sua meta diária!
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {dailyRecommendations.reachedDailyGoal && (
        <Card className="bg-green-900/20 border-green-500/30 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <div>
                <p className="text-green-400 font-medium">🎉 Meta Diária Conquistada!</p>
                <p className="text-sm text-gray-400">
                  Excelente! Você completou {formatTime(dailyRecommendations.studiedToday)} de estudo hoje.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
