import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, CalendarDays, BarChart3, TrendingUp, Brain, CheckCircle } from "lucide-react";
import {
  type WeeklyProgressData,
  type StudyEfficiencyData,
  type PersonalizedRecommendation,
  type CategoryPerformanceData,
} from "./types";
import { formatTime, getScoreColor } from "./utils";

interface StudyAnalyticsProps {
  studyStreak: number;
  categoryPerformance: CategoryPerformanceData[];
  weeklyProgress: WeeklyProgressData[];
  studyEfficiency: StudyEfficiencyData;
  personalizedRecommendations: PersonalizedRecommendation[];
}

export function StudyAnalytics({
  studyStreak,
  categoryPerformance,
  weeklyProgress,
  studyEfficiency,
  personalizedRecommendations,
}: StudyAnalyticsProps) {
  return (
    <>
      {/* Streak, Categories, Weekly Progress */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Study Streak */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-poker-accent" />
              Sequência de Estudo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center">
              <div className="text-3xl font-bold text-poker-accent mb-2">
                {studyStreak} dias
              </div>
              <p className="text-sm text-gray-400">
                {studyStreak > 0 ? 'Mantendo o foco!' : 'Comece uma nova sequência hoje'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Category Performance */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-poker-accent" />
              Top Categorias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categoryPerformance.slice(0, 3).map((category, index) => (
                <div key={category.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-poker-accent/10 rounded-full flex items-center justify-center">
                      <span className="text-poker-accent text-xs font-bold">{index + 1}</span>
                    </div>
                    <span className="text-white text-sm">{category.category}</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white text-sm font-semibold">
                      {formatTime(category.totalTime)}
                    </div>
                    <div className={`text-xs ${getScoreColor(category.avgScore)}`}>
                      {category.avgScore}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Weekly Progress */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-poker-accent" />
              Progresso Semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {weeklyProgress.map((day, index) => (
                <div key={index} className="text-center">
                  <div className="text-xs text-gray-400 mb-1">{day.day}</div>
                  <div className="relative h-8 bg-gray-800 rounded">
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-poker-accent rounded"
                      style={{
                        height: `${Math.max(8, (day.time / 120) * 100)}%`,
                        minHeight: day.time > 0 ? '8px' : '0px'
                      }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{day.time}m</div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">Esta semana</span>
              <span className="text-poker-accent font-semibold">
                {formatTime(weeklyProgress.reduce((sum, day) => sum + day.time, 0))}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Efficiency & Recommendations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-poker-accent" />
              Análise de Eficiência
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Eficiência Geral</span>
                <span className={`font-semibold ${
                  studyEfficiency.efficiency >= 80 ? 'text-green-400' :
                  studyEfficiency.efficiency >= 60 ? 'text-yellow-400' : 'text-red-400'
                }`}>
                  {Math.round(studyEfficiency.efficiency)}%
                </span>
              </div>

              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    studyEfficiency.efficiency >= 80 ? 'bg-green-500' :
                    studyEfficiency.efficiency >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${studyEfficiency.efficiency}%` }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-400">Tempo Médio por Estudo</span>
                <span className="text-white font-semibold">
                  {formatTime(studyEfficiency.avgTimePerCard)}
                </span>
              </div>

              <div className="text-sm text-gray-400">
                {studyEfficiency.efficiency >= 80 ?
                  '🎯 Excelente eficiência! Você está estudando de forma otimizada.' :
                  studyEfficiency.efficiency >= 60 ?
                  '📈 Boa eficiência. Considere técnicas de estudo mais focadas.' :
                  '⚠️ Há espaço para melhorar. Tente sessões mais curtas e focadas.'
                }
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-poker-accent" />
              Recomendações Personalizadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {personalizedRecommendations.length > 0 ? (
                personalizedRecommendations.slice(0, 3).map((rec, index) => (
                  <div key={index} className="p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        rec.priority === 'high' ? 'bg-red-400' :
                        rec.priority === 'medium' ? 'bg-yellow-400' : 'bg-green-400'
                      }`} />
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{rec.title}</p>
                        <p className="text-gray-400 text-xs mt-1">{rec.description}</p>
                        <p className="text-poker-accent text-xs mt-1">→ {rec.action}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                  <p className="text-green-400 font-medium">Parabéns!</p>
                  <p className="text-gray-400 text-sm">Você está no caminho certo com seus estudos.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
