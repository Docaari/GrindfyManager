import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLocation } from 'wouter';
import { 
  Brain, 
  Settings, 
  Play, 
  Droplets, 
  Dumbbell, 
  Sparkles, 
  Eye, 
  Utensils,
  Zap,
  Target,
  TrendingUp,
  Heart,
  CheckCircle2,
  Circle,
  Timer,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  BookOpen,
  Music,
  Headphones,
  ArrowRight,
  ArrowLeft,
  Info
} from 'lucide-react';

interface WarmUpActivity {
  id: string;
  name: string;
  icon: React.ComponentType<any>;
  points: number;
  enabled: boolean;
  completed: boolean;
  weight: number;
  category: 'physical' | 'mental' | 'practical';
}

interface MentalState {
  energia: number;
  foco: number;
  confianca: number;
  equilibrio: number;
}

interface MeditationTimer {
  duration: number;
  timeLeft: number;
  isRunning: boolean;
  isCompleted: boolean;
}

interface AudioTrack {
  id: string;
  title: string;
  category: 'motivacional' | 'hipnose' | 'foco';
  duration: string;
  description: string;
  url?: string;
}

interface VisualizationStep {
  id: string;
  title: string;
  content: string;
  duration: number;
}

// Dados de exemplo para áudios
const sampleAudioTracks: AudioTrack[] = [
  {
    id: 'motivacional-1',
    title: 'Mindset de Crescimento',
    category: 'motivacional',
    duration: '12:30',
    description: 'Desenvolva uma mentalidade de crescimento e superação'
  },
  {
    id: 'motivacional-2',
    title: 'Foco em Resultados',
    category: 'motivacional',
    duration: '8:45',
    description: 'Mantenha o foco nos seus objetivos e metas'
  },
  {
    id: 'hipnose-1',
    title: 'Relaxamento Profundo',
    category: 'hipnose',
    duration: '15:20',
    description: 'Técnica de relaxamento para reduzir ansiedade'
  },
  {
    id: 'hipnose-2',
    title: 'Confiança e Autoestima',
    category: 'hipnose',
    duration: '18:15',
    description: 'Fortaleça sua confiança e autoestima'
  },
  {
    id: 'foco-1',
    title: 'Concentração Profunda',
    category: 'foco',
    duration: '10:00',
    description: 'Melhore sua capacidade de concentração'
  },
  {
    id: 'foco-2',
    title: 'Estado de Flow',
    category: 'foco',
    duration: '20:30',
    description: 'Entre em estado de flow para máxima performance'
  }
];

// Dados de exemplo para visualização
const visualizationSteps: VisualizationStep[] = [
  {
    id: 'step-1',
    title: 'Preparação',
    content: 'Encontre um local tranquilo, sente-se confortavelmente e feche os olhos. Respire profundamente 3 vezes.',
    duration: 60
  },
  {
    id: 'step-2',
    title: 'Relaxamento',
    content: 'Relaxe cada parte do seu corpo, começando pelos pés e subindo até a cabeça. Sinta cada músculo relaxando.',
    duration: 120
  },
  {
    id: 'step-3',
    title: 'Visualização de Sucesso',
    content: 'Imagine-se jogando com total confiança e foco. Visualize-se tomando decisões corretas e lucrativas.',
    duration: 180
  },
  {
    id: 'step-4',
    title: 'Gerenciamento de Bad Beats',
    content: 'Visualize situações adversas e veja-se mantendo a calma, respirando profundamente e mantendo o foco.',
    duration: 120
  },
  {
    id: 'step-5',
    title: 'Finalização',
    content: 'Ancorе essa sensação de confiança e foco. Quando estiver pronto, abra os olhos e mantenha essa energia.',
    duration: 60
  }
];

const defaultActivities: WarmUpActivity[] = [
  {
    id: 'banho-gelado',
    name: 'Banho Gelado',
    icon: Droplets,
    points: 10,
    enabled: true,
    completed: false,
    weight: 2,
    category: 'physical'
  },
  {
    id: 'atividade-fisica',
    name: 'Atividade Física',
    icon: Dumbbell,
    points: 15,
    enabled: true,
    completed: false,
    weight: 3,
    category: 'physical'
  },
  {
    id: 'hidratacao',
    name: 'Hidratação',
    icon: Droplets,
    points: 8,
    enabled: true,
    completed: false,
    weight: 1,
    category: 'physical'
  },
  {
    id: 'meditacao',
    name: 'Meditação',
    icon: Sparkles,
    points: 20,
    enabled: true,
    completed: false,
    weight: 4,
    category: 'mental'
  },
  {
    id: 'visualizacao',
    name: 'Visualização',
    icon: Eye,
    points: 15,
    enabled: true,
    completed: false,
    weight: 3,
    category: 'mental'
  },
  {
    id: 'preparacao-pratica',
    name: 'Preparação Prática',
    icon: Utensils,
    points: 8,
    enabled: true,
    completed: false,
    weight: 2,
    category: 'practical'
  }
];

export default function MentalPrep() {
  const [, setLocation] = useLocation();
  const [activities, setActivities] = useState<WarmUpActivity[]>(defaultActivities);
  const [mentalState, setMentalState] = useState<MentalState>({
    energia: 50,
    foco: 50,
    confianca: 50,
    equilibrio: 50
  });
  const [showCustomization, setShowCustomization] = useState(false);
  const [finalScore, setFinalScore] = useState(0);
  
  // Fase 2 - Ferramentas de Apoio
  const [showMeditationTimer, setShowMeditationTimer] = useState(false);
  const [showVisualizationGuide, setShowVisualizationGuide] = useState(false);
  const [showAudioLibrary, setShowAudioLibrary] = useState(false);
  
  // Timer de Meditação
  const [meditationTimer, setMeditationTimer] = useState<MeditationTimer>({
    duration: 10 * 60, // 10 minutos em segundos
    timeLeft: 10 * 60,
    isRunning: false,
    isCompleted: false
  });
  const [timerSound, setTimerSound] = useState(true);
  const timerRef = useRef<NodeJS.Timeout>();
  
  // Guia de Visualização
  const [currentVisualizationStep, setCurrentVisualizationStep] = useState(0);
  const [visualizationRunning, setVisualizationRunning] = useState(false);
  const [visualizationTimeLeft, setVisualizationTimeLeft] = useState(0);
  const visualizationRef = useRef<NodeJS.Timeout>();
  
  // Biblioteca de Áudios
  const [selectedAudioCategory, setSelectedAudioCategory] = useState<'motivacional' | 'hipnose' | 'foco'>('motivacional');
  const [currentAudio, setCurrentAudio] = useState<AudioTrack | null>(null);
  const [audioFavorites, setAudioFavorites] = useState<string[]>([]);

  // Calcular pontuação do checklist
  const calculateChecklistScore = () => {
    const enabledActivities = activities.filter(a => a.enabled);
    const completedActivities = enabledActivities.filter(a => a.completed);
    
    if (enabledActivities.length === 0) return 0;
    
    const totalPossiblePoints = enabledActivities.reduce((sum, activity) => sum + (activity.points * activity.weight), 0);
    const earnedPoints = completedActivities.reduce((sum, activity) => sum + (activity.points * activity.weight), 0);
    
    return Math.round((earnedPoints / totalPossiblePoints) * 100);
  };

  // Calcular pontuação do estado mental
  const calculateMentalScore = () => {
    const { energia, foco, confianca, equilibrio } = mentalState;
    return Math.round((energia + foco + confianca + equilibrio) / 4);
  };

  // Calcular pontuação final
  const calculateFinalScore = () => {
    const checklistScore = calculateChecklistScore();
    const mentalScore = calculateMentalScore();
    return Math.round((checklistScore * 0.6) + (mentalScore * 0.4));
  };

  // Atualizar pontuação final quando algo muda
  useEffect(() => {
    setFinalScore(calculateFinalScore());
  }, [activities, mentalState]);

  // Timer de Meditação - useEffect para countdown
  useEffect(() => {
    if (meditationTimer.isRunning && meditationTimer.timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setMeditationTimer(prev => ({
          ...prev,
          timeLeft: prev.timeLeft - 1
        }));
      }, 1000);
    } else if (meditationTimer.timeLeft === 0 && meditationTimer.isRunning) {
      setMeditationTimer(prev => ({
        ...prev,
        isRunning: false,
        isCompleted: true
      }));
      if (timerSound) {
        // Aqui poderia tocar um som de finalização
        console.log('Meditação concluída!');
      }
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [meditationTimer.isRunning, meditationTimer.timeLeft, timerSound]);

  // Guia de Visualização - useEffect para step countdown
  useEffect(() => {
    if (visualizationRunning && visualizationTimeLeft > 0) {
      visualizationRef.current = setTimeout(() => {
        setVisualizationTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (visualizationTimeLeft === 0 && visualizationRunning) {
      // Avançar para próximo step ou finalizar
      if (currentVisualizationStep < visualizationSteps.length - 1) {
        setCurrentVisualizationStep(prev => prev + 1);
        setVisualizationTimeLeft(visualizationSteps[currentVisualizationStep + 1].duration);
      } else {
        setVisualizationRunning(false);
        setVisualizationTimeLeft(0);
      }
    }
    return () => {
      if (visualizationRef.current) clearTimeout(visualizationRef.current);
    };
  }, [visualizationRunning, visualizationTimeLeft, currentVisualizationStep]);

  // Função para obter cor baseada na pontuação
  const getScoreColor = (score: number) => {
    if (score <= 40) return 'text-red-400';
    if (score <= 70) return 'text-yellow-400';
    return 'text-green-400';
  };

  // Função para obter cor de fundo baseada na pontuação
  const getScoreBackground = (score: number) => {
    if (score <= 40) return 'bg-red-900/20 border-red-600/30';
    if (score <= 70) return 'bg-yellow-900/20 border-yellow-600/30';
    return 'bg-green-900/20 border-green-600/30';
  };

  // Função para obter feedback textual
  const getScoreFeedback = (score: number) => {
    if (score <= 30) return 'Preparação Insuficiente - Considere mais algumas atividades';
    if (score <= 60) return 'Preparação Moderada - Você está no caminho certo';
    if (score <= 80) return 'Boa Preparação - Pronto para uma sessão sólida';
    return 'Preparação Excelente - Estado ideal para grind';
  };

  // Toggle atividade
  const toggleActivity = (activityId: string) => {
    setActivities(prev => prev.map(activity => 
      activity.id === activityId 
        ? { ...activity, completed: !activity.completed }
        : activity
    ));
  };

  // Atualizar configuração de atividade
  const updateActivityConfig = (activityId: string, field: keyof WarmUpActivity, value: any) => {
    setActivities(prev => prev.map(activity => 
      activity.id === activityId 
        ? { ...activity, [field]: value }
        : activity
    ));
  };

  // Funções para Timer de Meditação
  const startMeditationTimer = () => {
    setMeditationTimer(prev => ({ ...prev, isRunning: true, isCompleted: false }));
  };

  const pauseMeditationTimer = () => {
    setMeditationTimer(prev => ({ ...prev, isRunning: false }));
  };

  const resetMeditationTimer = () => {
    setMeditationTimer(prev => ({
      ...prev,
      timeLeft: prev.duration,
      isRunning: false,
      isCompleted: false
    }));
  };

  const setMeditationDuration = (minutes: number) => {
    const seconds = minutes * 60;
    setMeditationTimer({
      duration: seconds,
      timeLeft: seconds,
      isRunning: false,
      isCompleted: false
    });
  };

  // Funções para Guia de Visualização
  const startVisualization = () => {
    setCurrentVisualizationStep(0);
    setVisualizationTimeLeft(visualizationSteps[0].duration);
    setVisualizationRunning(true);
  };

  const pauseVisualization = () => {
    setVisualizationRunning(false);
  };

  const nextVisualizationStep = () => {
    if (currentVisualizationStep < visualizationSteps.length - 1) {
      setCurrentVisualizationStep(prev => prev + 1);
      setVisualizationTimeLeft(visualizationSteps[currentVisualizationStep + 1].duration);
    }
  };

  const previousVisualizationStep = () => {
    if (currentVisualizationStep > 0) {
      setCurrentVisualizationStep(prev => prev - 1);
      setVisualizationTimeLeft(visualizationSteps[currentVisualizationStep - 1].duration);
    }
  };

  // Funções para Biblioteca de Áudios
  const toggleAudioFavorite = (audioId: string) => {
    setAudioFavorites(prev => 
      prev.includes(audioId) 
        ? prev.filter(id => id !== audioId)
        : [...prev, audioId]
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Iniciar sessão de grind com pontuação
  const startGrindSession = () => {
    // Redirecionar para a página de grind session que irá usar o sistema existente
    // A pontuação será passada via localStorage para integração
    localStorage.setItem('warmUpScore', finalScore.toString());
    localStorage.setItem('warmUpData', JSON.stringify({
      score: finalScore,
      activities: activities.filter(a => a.completed).map(a => a.name),
      mentalState: mentalState,
      timestamp: new Date().toISOString()
    }));
    setLocation('/grind');
  };

  const completedActivities = activities.filter(a => a.enabled && a.completed).length;
  const totalActivities = activities.filter(a => a.enabled).length;

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
      <div className="flex justify-center gap-4 mb-8">
        <Dialog open={showCustomization} onOpenChange={setShowCustomization}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
              <Settings className="w-4 h-4 mr-2" />
              Personalizar Warm Up
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Personalizar Atividades</DialogTitle>
              <DialogDescription className="text-gray-400">
                Ative ou desative as atividades do checklist de preparação conforme sua preferência.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {activities.map(activity => (
                <div key={activity.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded border border-gray-600">
                  <div className="flex items-center gap-3">
                    <activity.icon className="w-5 h-5 text-poker-accent" />
                    <div>
                      <div className="font-medium text-white">{activity.name}</div>
                      <div className="text-sm text-gray-400">{activity.points} pontos</div>
                    </div>
                  </div>
                  <Switch
                    checked={activity.enabled}
                    onCheckedChange={(checked) => updateActivityConfig(activity.id, 'enabled', checked)}
                  />
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        <Button 
          onClick={startGrindSession}
          className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8"
          disabled={finalScore < 30}
        >
          <Play className="w-4 h-4 mr-2" />
          Iniciar Grind ({finalScore}%)
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Checklist de Preparação */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-poker-accent" />
              Checklist de Preparação
              <Badge variant="outline" className="ml-auto">
                {completedActivities}/{totalActivities}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Progress Bar */}
              <div className="mb-6">
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>Progresso</span>
                  <span>{calculateChecklistScore()}%</span>
                </div>
                <Progress value={calculateChecklistScore()} className="h-2" />
              </div>

              {/* Activities Grid */}
              <div className="grid grid-cols-1 gap-3">
                {activities.filter(a => a.enabled).map(activity => (
                  <div 
                    key={activity.id}
                    className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                      activity.completed 
                        ? 'bg-green-900/20 border-green-600/50 hover:bg-green-900/30' 
                        : 'bg-gray-800/50 border-gray-600 hover:bg-gray-800/70'
                    }`}
                    onClick={() => toggleActivity(activity.id)}
                  >
                    <div className="relative">
                      {activity.completed ? (
                        <CheckCircle2 className="w-6 h-6 text-green-400" />
                      ) : (
                        <Circle className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <activity.icon className={`w-5 h-5 ${activity.completed ? 'text-green-400' : 'text-poker-accent'}`} />
                    <div className="flex-1">
                      <div className={`font-medium ${activity.completed ? 'text-green-400' : 'text-white'}`}>
                        {activity.name}
                      </div>
                      <div className="text-sm text-gray-400">
                        {activity.points * activity.weight} pontos
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Estado Mental */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-poker-accent" />
              Estado Mental
              <Badge variant="outline" className="ml-auto">
                {calculateMentalScore()}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Energia */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-red-400" />
                    <Label className="text-white">Energia</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.energia)}`}>
                    {mentalState.energia}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.energia]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, energia: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Foco */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-blue-400" />
                    <Label className="text-white">Foco</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.foco)}`}>
                    {mentalState.foco}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.foco]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, foco: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Confiança */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-400" />
                    <Label className="text-white">Confiança</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.confianca)}`}>
                    {mentalState.confianca}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.confianca]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, confianca: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>

              {/* Equilíbrio Emocional */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-purple-400" />
                    <Label className="text-white">Equilíbrio</Label>
                  </div>
                  <span className={`font-bold ${getScoreColor(mentalState.equilibrio)}`}>
                    {mentalState.equilibrio}%
                  </span>
                </div>
                <Slider
                  value={[mentalState.equilibrio]}
                  onValueChange={(value) => setMentalState(prev => ({ ...prev, equilibrio: value[0] }))}
                  max={100}
                  step={5}
                  className="w-full"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Ferramentas de Apoio - Fase 2 */}
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
            <Dialog open={showMeditationTimer} onOpenChange={setShowMeditationTimer}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Timer Meditação
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] bg-poker-surface border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Timer de Meditação</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Configure e inicie sua sessão de meditação
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Seletor de Duração */}
                  <div className="space-y-2">
                    <Label className="text-white">Duração</Label>
                    <div className="flex gap-2 flex-wrap">
                      {[5, 10, 15, 20, 30].map(minutes => (
                        <Button
                          key={minutes}
                          variant={meditationTimer.duration === minutes * 60 ? "default" : "outline"}
                          size="sm"
                          onClick={() => setMeditationDuration(minutes)}
                          disabled={meditationTimer.isRunning}
                        >
                          {minutes}min
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Display do Timer */}
                  <div className="text-center">
                    <div className="text-6xl font-bold text-poker-accent mb-2">
                      {formatTime(meditationTimer.timeLeft)}
                    </div>
                    <div className="text-sm text-gray-400">
                      {meditationTimer.isCompleted ? 'Meditação concluída!' : 
                       meditationTimer.isRunning ? 'Meditando...' : 'Pronto para começar'}
                    </div>
                  </div>

                  {/* Controles */}
                  <div className="flex justify-center gap-2">
                    <Button
                      onClick={meditationTimer.isRunning ? pauseMeditationTimer : startMeditationTimer}
                      disabled={meditationTimer.timeLeft === 0 && meditationTimer.isCompleted}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {meditationTimer.isRunning ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                      {meditationTimer.isRunning ? 'Pausar' : 'Iniciar'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={resetMeditationTimer}
                      className="border-gray-600 hover:bg-gray-700"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  </div>

                  {/* Opções */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={timerSound}
                        onCheckedChange={setTimerSound}
                        id="timer-sound"
                      />
                      <Label htmlFor="timer-sound" className="text-white">Som de finalização</Label>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => setTimerSound(!timerSound)}
                      size="sm"
                      className="border-gray-600 hover:bg-gray-700"
                    >
                      {timerSound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </Button>
                  </div>

                  {/* Dicas de Meditação */}
                  <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600">
                    <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                      <Info className="w-4 h-4" />
                      Dicas para Meditar
                    </h4>
                    <ul className="text-sm text-gray-300 space-y-1">
                      <li>• Encontre um local tranquilo e confortável</li>
                      <li>• Mantenha a postura ereta mas relaxada</li>
                      <li>• Foque na respiração naturalmente</li>
                      <li>• Quando a mente divagar, gentilmente volte ao foco</li>
                      <li>• Seja paciente e consistente</li>
                    </ul>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showVisualizationGuide} onOpenChange={setShowVisualizationGuide}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
                  <Eye className="w-4 h-4 mr-2" />
                  Guia Visualização
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Guia de Visualização</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Exercício guiado de visualização para poker
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  {/* Progress */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Progresso</span>
                      <span className="text-poker-accent">
                        {currentVisualizationStep + 1} / {visualizationSteps.length}
                      </span>
                    </div>
                    <Progress 
                      value={((currentVisualizationStep + 1) / visualizationSteps.length) * 100} 
                      className="h-2"
                    />
                  </div>

                  {/* Step Content */}
                  <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-600 min-h-[200px]">
                    <h3 className="text-xl font-semibold text-white mb-3">
                      {visualizationSteps[currentVisualizationStep]?.title}
                    </h3>
                    <p className="text-gray-300 leading-relaxed mb-4">
                      {visualizationSteps[currentVisualizationStep]?.content}
                    </p>
                    {visualizationRunning && (
                      <div className="text-center">
                        <div className="text-2xl font-bold text-poker-accent">
                          {formatTime(visualizationTimeLeft)}
                        </div>
                        <div className="text-sm text-gray-400">tempo restante</div>
                      </div>
                    )}
                  </div>

                  {/* Controls */}
                  <div className="flex justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={previousVisualizationStep}
                      disabled={currentVisualizationStep === 0}
                      className="border-gray-600 hover:bg-gray-700"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Anterior
                    </Button>
                    <Button
                      onClick={visualizationRunning ? pauseVisualization : startVisualization}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {visualizationRunning ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                      {visualizationRunning ? 'Pausar' : 'Iniciar'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={nextVisualizationStep}
                      disabled={currentVisualizationStep === visualizationSteps.length - 1}
                      className="border-gray-600 hover:bg-gray-700"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      Próximo
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showAudioLibrary} onOpenChange={setShowAudioLibrary}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
                  <Headphones className="w-4 h-4 mr-2" />
                  Biblioteca de Áudios
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[700px] bg-poker-surface border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Biblioteca de Áudios</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Áudios motivacionais, de hipnose e foco para sua preparação
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Category Filter */}
                  <div className="flex gap-2">
                    {(['motivacional', 'hipnose', 'foco'] as const).map(category => (
                      <Button
                        key={category}
                        variant={selectedAudioCategory === category ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedAudioCategory(category)}
                        className="capitalize"
                      >
                        {category}
                      </Button>
                    ))}
                  </div>

                  {/* Audio List */}
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {sampleAudioTracks
                      .filter(track => track.category === selectedAudioCategory)
                      .map(track => (
                        <div
                          key={track.id}
                          className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-600"
                        >
                          <div className="flex-1">
                            <h4 className="font-semibold text-white">{track.title}</h4>
                            <p className="text-sm text-gray-400 mb-1">{track.description}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Music className="w-3 h-3" />
                              {track.duration}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleAudioFavorite(track.id)}
                              className={`border-gray-600 hover:bg-gray-700 ${
                                audioFavorites.includes(track.id) 
                                  ? 'text-yellow-400' 
                                  : 'text-gray-400'
                              }`}
                            >
                              ⭐
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => setCurrentAudio(track)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Reproduzir
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Current Audio Player */}
                  {currentAudio && (
                    <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-600">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-semibold text-white">Reproduzindo:</h4>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentAudio(null)}
                          className="border-gray-600 hover:bg-gray-700"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      <div className="text-sm text-gray-300 mb-2">{currentAudio.title}</div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="bg-green-600 hover:bg-green-700">
                          <Pause className="w-4 h-4 mr-2" />
                          Pausar
                        </Button>
                        <div className="flex-1 text-center text-sm text-gray-400">
                          {currentAudio.duration}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-gray-600 hover:bg-gray-700"
                        >
                          <Volume2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}