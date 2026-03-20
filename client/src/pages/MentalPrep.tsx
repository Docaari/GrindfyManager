import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { mapLogsToStats } from '@/lib/mentalPrepUtils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocation } from 'wouter';
import { usePermission } from '@/hooks/usePermission';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import AccessDenied from '@/components/AccessDenied';
import { Brain, Play, Settings, Star, Flame, Trophy } from 'lucide-react';

import type { MentalState, WarmUpActivity, Achievement, WarmUpStats, SessionCorrelation } from '@/components/mental-prep/types';
import { defaultActivities, defaultStats, defaultAchievements } from '@/components/mental-prep/data';
import { CustomizationDialog } from '@/components/mental-prep/CustomizationDialog';
import { AchievementsDialog } from '@/components/mental-prep/AchievementsDialog';
import { StatisticsDialog } from '@/components/mental-prep/StatisticsDialog';
import { CorrelationDialog } from '@/components/mental-prep/CorrelationDialog';
import { MeditationDialog } from '@/components/mental-prep/MeditationDialog';
import { VisualizationDialog } from '@/components/mental-prep/VisualizationDialog';
import { AudioLibraryDialog } from '@/components/mental-prep/AudioLibraryDialog';
import { WarmUpChecklist } from '@/components/mental-prep/WarmUpChecklist';
import { MentalStateCard } from '@/components/mental-prep/MentalStateCard';
import { PersonalNotesCard } from '@/components/mental-prep/PersonalNotesCard';
import { QuickHistoryCard } from '@/components/mental-prep/QuickHistoryCard';
import { GoalsCard } from '@/components/mental-prep/GoalsCard';

export default function MentalPrep() {
  const hasPermission = usePermission('mental_prep_access');
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activities, setActivities] = useState<WarmUpActivity[]>(defaultActivities);
  const [mentalState, setMentalState] = useState<MentalState>({
    energia: 5, foco: 5, confianca: 5, equilibrio: 5
  });
  const [showCustomization, setShowCustomization] = useState(false);
  const [finalScore, setFinalScore] = useState(0);

  // Dialog states
  const [showGamification, setShowGamification] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCorrelation, setShowCorrelation] = useState(false);
  const [showMeditationTimer, setShowMeditationTimer] = useState(false);
  const [showVisualizationSelection, setShowVisualizationSelection] = useState(false);
  const [showVisualizationGuide, setShowVisualizationGuide] = useState(false);
  const [showAudioLibrary, setShowAudioLibrary] = useState(false);

  // Notes
  const [personalNotes, setPersonalNotes] = useState('');

  // Backend integration
  const { data: preparationLogs = [], isLoading: logsLoading } = useQuery<any[]>({
    queryKey: ['/api/preparation-logs'],
    enabled: !!user,
  });

  const savePreparationMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/preparation-logs', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/preparation-logs'] });
    },
  });

  // Derive stats from real data
  const derivedStats = preparationLogs.length > 0 ? mapLogsToStats(preparationLogs) : null;
  const stats: WarmUpStats = derivedStats ? {
    ...defaultStats,
    totalSessions: derivedStats.totalSessions,
    averageScore: derivedStats.averageScore,
    currentStreak: derivedStats.currentStreak,
    scoreHistory: derivedStats.scoreHistory,
  } : defaultStats;

  // Derive achievements from real data
  const achievements: Achievement[] = derivedStats ? [
    {
      id: 'first-prep', title: 'Primeira Preparação', description: 'Complete sua primeira preparação',
      icon: Star, type: 'milestone' as const, requirement: 1,
      progress: Math.min(derivedStats.totalSessions, 1),
      completed: derivedStats.totalSessions >= 1,
      ...(derivedStats.totalSessions >= 1 ? { unlockedAt: new Date() } : {}),
    },
    {
      id: 'streak-3', title: 'Streak de 3', description: '3 dias seguidos de warm up',
      icon: Flame, type: 'consistency' as const, requirement: 3,
      progress: Math.min(derivedStats.currentStreak, 3),
      completed: derivedStats.currentStreak >= 3,
      ...(derivedStats.currentStreak >= 3 ? { unlockedAt: new Date() } : {}),
    },
    {
      id: 'streak-7', title: 'Streak de 7', description: '7 dias seguidos de warm up',
      icon: Flame, type: 'consistency' as const, requirement: 7,
      progress: Math.min(derivedStats.currentStreak, 7),
      completed: derivedStats.currentStreak >= 7,
      ...(derivedStats.currentStreak >= 7 ? { unlockedAt: new Date() } : {}),
    },
    {
      id: 'sessions-10', title: '10 Sessões', description: '10 sessões de warm up completadas',
      icon: Trophy, type: 'milestone' as const, requirement: 10,
      progress: Math.min(derivedStats.totalSessions, 10),
      completed: derivedStats.totalSessions >= 10,
      ...(derivedStats.totalSessions >= 10 ? { unlockedAt: new Date() } : {}),
    },
  ] : defaultAchievements;

  // Derive correlation data
  const hasEnoughCorrelationData = preparationLogs.length >= 3;
  const correlationData: SessionCorrelation[] = hasEnoughCorrelationData
    ? preparationLogs.slice(0, 7).map((log: any) => ({
        warmUpScore: log.mentalState,
        sessionProfit: 0, sessionVolume: 0, sessionROI: 0,
        sessionDate: new Date(log.createdAt).toISOString().split('T')[0],
      }))
    : [];

  // Recent logs for history
  const recentLogs = preparationLogs.length > 0
    ? [...preparationLogs]
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3)
    : [];

  // Score calculations
  const calculateChecklistScore = () => {
    const enabled = activities.filter(a => a.enabled);
    const completed = enabled.filter(a => a.completed);
    if (enabled.length === 0) return 0;
    const totalPoints = enabled.reduce((sum, a) => sum + (a.points * a.weight), 0);
    const earnedPoints = completed.reduce((sum, a) => sum + (a.points * a.weight), 0);
    return Math.round((earnedPoints / totalPoints) * 100);
  };

  const calculateMentalScore = () => {
    const { energia, foco, confianca, equilibrio } = mentalState;
    return Math.round(((energia + foco + confianca + equilibrio) / 4 / 10) * 100);
  };

  const calculateFinalScore = () => {
    return Math.round((calculateChecklistScore() * 0.6) + (calculateMentalScore() * 0.4));
  };

  useEffect(() => {
    setFinalScore(calculateFinalScore());
  }, [activities, mentalState]);

  // Early return for permission check — AFTER all hooks
  if (!hasPermission) {
    return <AccessDenied featureName="Preparação Mental" description="Acesse ferramentas de warm-up e preparação mental para suas sessões." currentPlan="free" requiredPlan="premium" pageName="Warm Up" onViewPlans={() => window.location.href = '/subscriptions'} />;
  }

  const getScoreColor = (score: number) => {
    if (score <= 40) return 'text-red-400';
    if (score <= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  const getScoreBackground = (score: number) => {
    if (score <= 40) return 'bg-red-900/20 border-red-600/30';
    if (score <= 70) return 'bg-yellow-900/20 border-yellow-600/30';
    return 'bg-green-900/20 border-green-600/30';
  };

  const getScoreFeedback = (score: number) => {
    if (score <= 30) return 'Preparação Insuficiente - Considere mais algumas atividades';
    if (score <= 60) return 'Preparação Moderada - Você está no caminho certo';
    if (score <= 80) return 'Boa Preparação - Pronto para uma sessão sólida';
    return 'Preparação Excelente - Estado ideal para grind';
  };

  const toggleActivity = (activityId: string) => {
    setActivities(prev => prev.map(a =>
      a.id === activityId ? { ...a, completed: !a.completed } : a
    ));
  };

  const updateActivityConfig = (activityId: string, field: keyof WarmUpActivity, value: any) => {
    setActivities(prev => prev.map(a =>
      a.id === activityId ? { ...a, [field]: value } : a
    ));
  };

  const formatWarmUpObservations = (completedActs: WarmUpActivity[], ms: MentalState, score: number) => {
    const obs = [];
    obs.push(`🎯 Preparação Geral: ${score}%`);
    if (completedActs.length > 0) {
      obs.push(`✅ Atividades Completadas: ${completedActs.map(a => a.name).join(', ')}`);
    }
    obs.push(`🧠 Estado Mental:`);
    obs.push(`  • Energia: ${ms.energia}%`);
    obs.push(`  • Foco: ${ms.foco}%`);
    obs.push(`  • Confiança: ${ms.confianca}%`);
    obs.push(`  • Equilíbrio: ${ms.equilibrio}%`);
    return obs.join('\n');
  };

  const startGrindSession = () => {
    const completedActs = activities.filter(a => a.completed);
    const warmUpData = {
      score: finalScore,
      activities: completedActs.map(a => a.name),
      mentalState,
      timestamp: new Date().toISOString(),
      observations: formatWarmUpObservations(completedActs, mentalState, finalScore)
    };

    savePreparationMutation.mutate(
      {
        mentalState: finalScore,
        focusLevel: mentalState.foco,
        confidenceLevel: mentalState.confianca,
        exercisesCompleted: completedActs.map(a => a.name),
        warmupCompleted: finalScore >= 50,
        notes: personalNotes || null,
      },
      {
        onSuccess: () => {
          localStorage.setItem('warmUpScore', finalScore.toString());
          localStorage.setItem('warmUpData', JSON.stringify(warmUpData));
          localStorage.setItem('warmUpIntegration', 'true');
          setLocation('/grind');
        },
        onError: (error: any) => {
          toast({
            title: 'Erro ao salvar preparação',
            description: error.message || 'Tente novamente',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-2 flex items-center justify-center gap-3">
          <Brain className="w-8 h-8 text-poker-accent" />
          Warm Up - Preparação Mental
        </h1>
        <p className="text-gray-400">Prepare-se mentalmente para uma sessão de grind de alta performance</p>
      </div>

      {/* Score Display */}
      <div className="mb-8 text-center">
        <div className={`inline-flex items-center gap-4 p-6 rounded-lg border ${getScoreBackground(finalScore)}`}>
          <div className="text-center">
            <div className={`text-6xl font-bold ${getScoreColor(finalScore)}`}>
              {finalScore}%
            </div>
            <div className="text-sm text-gray-400 mt-1">Nota Atual</div>
          </div>
          <div className="text-left max-w-md">
            <p className="text-sm text-gray-300">{getScoreFeedback(finalScore)}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center gap-4 mb-8 flex-wrap">
        <CustomizationDialog
          open={showCustomization}
          onOpenChange={setShowCustomization}
          activities={activities}
          onUpdateConfig={updateActivityConfig}
        />
        <AchievementsDialog
          open={showGamification}
          onOpenChange={setShowGamification}
          achievements={achievements}
        />
        <StatisticsDialog
          open={showStats}
          onOpenChange={setShowStats}
          stats={stats}
        />
        <CorrelationDialog
          open={showCorrelation}
          onOpenChange={setShowCorrelation}
          correlationData={correlationData}
          hasEnoughData={hasEnoughCorrelationData}
        />
        <Button
          onClick={startGrindSession}
          disabled={savePreparationMutation.isPending}
          className="bg-[#16a34a] bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8"
        >
          <Play className="w-4 h-4 mr-2" />
          {savePreparationMutation.isPending ? 'Salvando...' : `Iniciar Grind (${finalScore}%)`}
        </Button>
      </div>

      {/* Main Grid: Checklist + Mental State */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <WarmUpChecklist
          activities={activities}
          onToggleActivity={toggleActivity}
          checklistScore={calculateChecklistScore()}
        />
        <MentalStateCard
          mentalState={mentalState}
          onMentalStateChange={setMentalState}
          mentalScore={calculateMentalScore()}
        />
      </div>

      {/* Notes, History, Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <PersonalNotesCard notes={personalNotes} onNotesChange={setPersonalNotes} />
        <QuickHistoryCard recentLogs={recentLogs} isLoading={logsLoading} />
        <GoalsCard finalScore={finalScore} stats={stats} />
      </div>

      {/* Support Tools */}
      <Card className="bg-poker-surface border-gray-700 mt-8">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-poker-accent" />
            Ferramentas de Apoio
            <Badge variant="outline" className="ml-2 text-xs bg-green-900/20 text-green-400 border-green-600/30">Ativo</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MeditationDialog open={showMeditationTimer} onOpenChange={setShowMeditationTimer} />
            <VisualizationDialog
              showSelection={showVisualizationSelection}
              onSelectionChange={setShowVisualizationSelection}
              showGuide={showVisualizationGuide}
              onGuideChange={setShowVisualizationGuide}
            />
            <AudioLibraryDialog open={showAudioLibrary} onOpenChange={setShowAudioLibrary} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
