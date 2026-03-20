import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { MentalSlider } from '@/components/MentalSlider';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useLocation } from 'wouter';
import { usePermission } from '@/hooks/usePermission';
import AccessDenied from '@/components/AccessDenied';
import { 
  Brain, 
  Settings, 
  Play, 
  Droplets, 
  Dumbbell, 
  Sparkles, 
  Eye, 
  Utensils,
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
  Info,
  X,
  Trophy,
  Flame,
  BarChart3,
  Calendar,
  Clock,
  Award,
  Star,
  Activity,
  Zap
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

interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  type: 'consistency' | 'performance' | 'activity' | 'milestone';
  requirement: number;
  progress: number;
  completed: boolean;
  unlockedAt?: Date;
}

interface WarmUpStats {
  totalSessions: number;
  averageScore: number;
  currentStreak: number;
  longestStreak: number;
  totalMeditations: number;
  totalVisualizations: number;
  totalAudiosPlayed: number;
  scoreHistory: { date: string; score: number }[];
  activityCompletion: { [key: string]: number };
  mentalStateEvolution: { date: string; energia: number; foco: number; confianca: number; equilibrio: number }[];
}

interface SessionCorrelation {
  warmUpScore: number;
  sessionProfit: number;
  sessionVolume: number;
  sessionROI: number;
  sessionDate: string;
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
// Dados de exemplo para conquistas
const defaultAchievements: Achievement[] = [
  {
    id: 'consistency-7',
    title: 'Consistência',
    description: '7 dias seguidos de warm up',
    icon: Flame,
    type: 'consistency',
    requirement: 7,
    progress: 3,
    completed: false
  },
  {
    id: 'perfect-5',
    title: 'Preparação Perfeita',
    description: '5 sessões com 100% de pontuação',
    icon: Star,
    type: 'performance',
    requirement: 5,
    progress: 2,
    completed: false
  },
  {
    id: 'zen-master',
    title: 'Zen Master',
    description: '30 meditações completadas',
    icon: Brain,
    type: 'activity',
    requirement: 30,
    progress: 15,
    completed: false
  },
  {
    id: 'visualizer',
    title: 'Visualizador',
    description: '20 visualizações realizadas',
    icon: Eye,
    type: 'activity',
    requirement: 20,
    progress: 8,
    completed: false
  },
  {
    id: 'audio-lover',
    title: 'Amante de Áudio',
    description: '50 áudios reproduzidos',
    icon: Headphones,
    type: 'activity',
    requirement: 50,
    progress: 23,
    completed: false
  },
  {
    id: 'milestone-100',
    title: 'Centenário',
    description: '100 sessões de warm up',
    icon: Trophy,
    type: 'milestone',
    requirement: 100,
    progress: 42,
    completed: false
  }
];

// Dados de exemplo para estatísticas
const defaultStats: WarmUpStats = {
  totalSessions: 42,
  averageScore: 76.5,
  currentStreak: 3,
  longestStreak: 9,
  totalMeditations: 15,
  totalVisualizations: 8,
  totalAudiosPlayed: 23,
  scoreHistory: [
    { date: '2025-01-01', score: 65 },
    { date: '2025-01-02', score: 72 },
    { date: '2025-01-03', score: 78 },
    { date: '2025-01-04', score: 85 },
    { date: '2025-01-05', score: 79 },
    { date: '2025-01-06', score: 82 },
    { date: '2025-01-07', score: 88 }
  ],
  activityCompletion: {
    'banho-gelado': 35,
    'atividade-fisica': 28,
    'meditacao': 40,
    'visualizacao': 32,
    'hidratacao': 41,
    'drills': 25,
    'preparacao-dia': 38
  },
  mentalStateEvolution: [
    { date: '2025-01-01', energia: 60, foco: 55, confianca: 50, equilibrio: 58 },
    { date: '2025-01-02', energia: 65, foco: 60, confianca: 55, equilibrio: 62 },
    { date: '2025-01-03', energia: 70, foco: 65, confianca: 60, equilibrio: 68 },
    { date: '2025-01-04', energia: 75, foco: 70, confianca: 65, equilibrio: 72 },
    { date: '2025-01-05', energia: 72, foco: 68, confianca: 62, equilibrio: 70 },
    { date: '2025-01-06', energia: 78, foco: 72, confianca: 68, equilibrio: 75 },
    { date: '2025-01-07', energia: 80, foco: 75, confianca: 70, equilibrio: 78 }
  ]
};

// Dados de exemplo para correlação com performance
const sessionCorrelationData: SessionCorrelation[] = [
  { warmUpScore: 85, sessionProfit: 1250, sessionVolume: 45, sessionROI: 15.2, sessionDate: '2025-01-01' },
  { warmUpScore: 72, sessionProfit: 850, sessionVolume: 38, sessionROI: 12.8, sessionDate: '2025-01-02' },
  { warmUpScore: 90, sessionProfit: 1680, sessionVolume: 52, sessionROI: 18.5, sessionDate: '2025-01-03' },
  { warmUpScore: 65, sessionProfit: 420, sessionVolume: 28, sessionROI: 8.2, sessionDate: '2025-01-04' },
  { warmUpScore: 78, sessionProfit: 1120, sessionVolume: 42, sessionROI: 14.1, sessionDate: '2025-01-05' },
  { warmUpScore: 82, sessionProfit: 1350, sessionVolume: 48, sessionROI: 16.8, sessionDate: '2025-01-06' },
  { warmUpScore: 88, sessionProfit: 1580, sessionVolume: 55, sessionROI: 17.9, sessionDate: '2025-01-07' }
];

const visualization6Minutes: VisualizationStep[] = [
  {
    id: 'step-1',
    title: 'Acalmar a Mente e o Corpo',
    content: 'Encontre um local tranquilo, sente-se confortavelmente e feche os olhos. Respire profundamente 3 vezes, sentindo cada respiração relaxando seu corpo. Solte todos os pensamentos e se concentre apenas no momento presente.',
    duration: 60
  },
  {
    id: 'step-2',
    title: 'Clareza de Intenção',
    content: 'Defina mentalmente seu objetivo para esta sessão. Visualize-se entrando no grind com total clareza mental, sabendo exatamente o que deseja alcançar. Sinta a determinação crescendo dentro de você.',
    duration: 60
  },
  {
    id: 'step-3',
    title: 'Visualização Técnica',
    content: 'Imagine-se jogando com perfeita técnica. Visualize-se tomando decisões corretas em situações complexas, lendo seus oponentes com precisão, aplicando ranges corretos e fazendo plays lucrativos. Sinta a confiança em seu conhecimento técnico.',
    duration: 120
  },
  {
    id: 'step-4',
    title: 'Estado Emocional Ideal',
    content: 'Visualize-se mantendo o equilíbrio emocional em todas as situações. Veja-se lidando com bad beats com calma, celebrando vitórias sem euforia excessiva, mantendo sempre o foco no próximo decision point. Sinta essa estabilidade emocional.',
    duration: 90
  },
  {
    id: 'step-5',
    title: 'Ancoragem Final',
    content: 'Ancorе todas essas sensações positivas. Crie um gesto físico simples (como apertar o punho) para ativar esse estado mental durante o jogo. Quando estiver pronto, abra os olhos mantendo essa energia focada.',
    duration: 30
  }
];

const visualization12Minutes: VisualizationStep[] = [
  {
    id: 'step-1',
    title: 'Acalmar a mente e o corpo',
    content: 'Encontre um local tranquilo e confortável. Sente-se com a coluna ereta mas relaxada. Feche os olhos suavemente. Respire profundamente pelo nariz, segure por 3 segundos e expire pela boca. Repita 5 vezes. Sinta cada respiração liberando tensões. Permita que todos os pensamentos externos se dissipem naturalmente.',
    duration: 120
  },
  {
    id: 'step-2',
    title: 'Clareza de Intenção',
    content: 'Conecte-se com seus objetivos mais profundos no poker. Visualize não apenas o lucro, mas o crescimento como jogador. Sinta sua paixão pelo jogo, pela estratégia, pela competição saudável. Defina claramente sua intenção para esta sessão: jogar seu A-game, tomar decisões baseadas em lógica, manter disciplina emocional. Sinta essa intenção se fortalecendo.',
    duration: 120
  },
  {
    id: 'step-3',
    title: 'Visualização Técnica e Estratégica',
    content: 'Imagine-se nas mesas, aplicando perfeitamente todos os conceitos estudados. Visualize-se calculando pot odds rapidamente, lendo tells com precisão, aplicando ranges corretos em cada posição. Veja-se fazendo 3-bets no timing certo, defendendo blinds adequadamente, fazendo calls e folds corretos. Sinta o conhecimento técnico fluindo naturalmente através de suas decisões.',
    duration: 240
  },
  {
    id: 'step-4',
    title: 'Estado Emocional Ideal',
    content: 'Visualize cenários desafiadores: bad beats, coolers, downswings. Veja-se reagindo com total controle emocional. Respire profundamente diante de cada adversidade. Sinta sua mente permanecendo clara e focada. Visualize-se aproveitando cada situação para aprender e crescer. Mantenha a perspectiva de longo prazo, sabendo que cada decisão correta é uma vitória, independente do resultado.',
    duration: 180
  },
  {
    id: 'step-5',
    title: 'Ancoragem Final',
    content: 'Integre todas essas sensações em seu ser. Crie uma ancoragem física tocando seu peito e respirando profundamente - este será seu "botão de reset" durante o jogo. Visualize-se terminando a sessão com satisfação pelo seu desempenho. Sinta-se pronto, confiante e equilibrado. Quando abrir os olhos, mantenha essa energia e leve-a para as mesas.',
    duration: 60
  }
];

const defaultActivities: WarmUpActivity[] = [
  {
    id: 'banho-gelado',
    name: 'Banho Gelado',
    icon: Droplets,
    points: 15,
    enabled: true,
    completed: false,
    weight: 2,
    category: 'physical'
  },
  {
    id: 'atividade-fisica',
    name: 'Atividade Física',
    icon: Dumbbell,
    points: 30,
    enabled: true,
    completed: false,
    weight: 3,
    category: 'physical'
  },
  {
    id: 'hidratacao',
    name: 'Hidratação',
    icon: Droplets,
    points: 30,
    enabled: true,
    completed: false,
    weight: 1,
    category: 'physical'
  },
  {
    id: 'meditacao',
    name: 'Meditação',
    icon: Sparkles,
    points: 30,
    enabled: true,
    completed: false,
    weight: 4,
    category: 'mental'
  },
  {
    id: 'visualizacao',
    name: 'Visualização',
    icon: Eye,
    points: 30,
    enabled: true,
    completed: false,
    weight: 3,
    category: 'mental'
  },
  {
    id: 'preparacao-pratica',
    name: 'Preparação Prática',
    icon: Utensils,
    points: 60,
    enabled: true,
    completed: false,
    weight: 2,
    category: 'practical'
  }
];

export default function MentalPrep() {
  const hasPermission = usePermission('mental_prep_access');
  const [, setLocation] = useLocation();
  const [activities, setActivities] = useState<WarmUpActivity[]>(defaultActivities);
  const [mentalState, setMentalState] = useState<MentalState>({
    energia: 5,
    foco: 5,
    confianca: 5,
    equilibrio: 5
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
  const [visualizationDuration, setVisualizationDuration] = useState<6 | 12>(6);
  const [showVisualizationSelection, setShowVisualizationSelection] = useState(false);
  const visualizationRef = useRef<NodeJS.Timeout>();
  
  // Biblioteca de Áudios
  const [selectedAudioCategory, setSelectedAudioCategory] = useState<'motivacional' | 'hipnose' | 'foco'>('motivacional');
  const [currentAudio, setCurrentAudio] = useState<AudioTrack | null>(null);
  const [audioFavorites, setAudioFavorites] = useState<string[]>([]);
  
  // Estados para Fase 3 - Gamificação
  const [achievements, setAchievements] = useState<Achievement[]>(defaultAchievements);
  const [stats, setStats] = useState<WarmUpStats>(defaultStats);
  const [correlationData] = useState<SessionCorrelation[]>(sessionCorrelationData);
  const [showGamification, setShowGamification] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showCorrelation, setShowCorrelation] = useState(false);
  
  // ETAPA 7 - Novos recursos
  const [personalNotes, setPersonalNotes] = useState('');
  const [personalGoals, setPersonalGoals] = useState({
    targetScore: 80,
    targetConsistency: 7,
    focusAreas: ['Meditação', 'Visualização']
  });

  // Calcular pontuação do checklist
  const calculateChecklistScore = () => {
    const enabledActivities = activities.filter(a => a.enabled);
    const completedActivities = enabledActivities.filter(a => a.completed);
    
    if (enabledActivities.length === 0) return 0;
    
    const totalPossiblePoints = enabledActivities.reduce((sum, activity) => sum + (activity.points * activity.weight), 0);
    const earnedPoints = completedActivities.reduce((sum, activity) => sum + (activity.points * activity.weight), 0);
    
    return Math.round((earnedPoints / totalPossiblePoints) * 100);
  };

  // Calcular pontuação do estado mental (escala 1-10 convertida para 0-100)
  const calculateMentalScore = () => {
    const { energia, foco, confianca, equilibrio } = mentalState;
    const avg = (energia + foco + confianca + equilibrio) / 4;
    return Math.round((avg / 10) * 100);
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
      if (currentVisualizationStep < (visualizationDuration === 6 ? visualization6Minutes : visualization12Minutes).length - 1) {
        setCurrentVisualizationStep(prev => prev + 1);
        setVisualizationTimeLeft((visualizationDuration === 6 ? visualization6Minutes : visualization12Minutes)[currentVisualizationStep + 1].duration);
      } else {
        setVisualizationRunning(false);
        setVisualizationTimeLeft(0);
      }
    }
    return () => {
      if (visualizationRef.current) clearTimeout(visualizationRef.current);
    };
  }, [visualizationRunning, visualizationTimeLeft, currentVisualizationStep]);

  // Early return for permission check — AFTER all hooks (React rules)
  if (!hasPermission) {
    return <AccessDenied featureName="Preparação Mental" description="Acesse ferramentas de warm-up e preparação mental para suas sessões." currentPlan="free" requiredPlan="premium" pageName="Warm Up" onViewPlans={() => window.location.href = '/subscriptions'} />;
  }

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
  const currentVisualizationSteps = visualizationDuration === 6 ? visualization6Minutes : visualization12Minutes;
  
  const startVisualization = () => {
    setCurrentVisualizationStep(0);
    setVisualizationTimeLeft(currentVisualizationSteps[0].duration);
    setVisualizationRunning(true);
  };

  const pauseVisualization = () => {
    setVisualizationRunning(false);
  };

  const nextVisualizationStep = () => {
    if (currentVisualizationStep < currentVisualizationSteps.length - 1) {
      setCurrentVisualizationStep(prev => prev + 1);
      setVisualizationTimeLeft(currentVisualizationSteps[currentVisualizationStep + 1].duration);
    }
  };

  const previousVisualizationStep = () => {
    if (currentVisualizationStep > 0) {
      setCurrentVisualizationStep(prev => prev - 1);
      setVisualizationTimeLeft(currentVisualizationSteps[currentVisualizationStep - 1].duration);
    }
  };

  const selectVisualizationDuration = (duration: 6 | 12) => {
    setVisualizationDuration(duration);
    setCurrentVisualizationStep(0);
    setVisualizationRunning(false);
    setVisualizationTimeLeft(duration === 6 ? visualization6Minutes[0].duration : visualization12Minutes[0].duration);
    setShowVisualizationSelection(false);
    setShowVisualizationGuide(true);
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

  // Iniciar sessão de grind com integração sofisticada
  const startGrindSession = () => {
    // Preparar dados estruturados para integração
    const completedActivities = activities.filter(a => a.completed);
    const warmUpData = {
      score: finalScore,
      activities: completedActivities.map(a => a.name),
      mentalState: mentalState,
      timestamp: new Date().toISOString(),
      // Preparar observações formatadas para o campo de observações
      observations: formatWarmUpObservations(completedActivities, mentalState, finalScore)
    };
    
    // Executar funções de gamificação da Fase 3
    checkAchievements(finalScore, completedActivities);
    updateStats(finalScore, completedActivities, mentalState);
    
    // Salvar dados no localStorage para integração
    localStorage.setItem('warmUpScore', finalScore.toString());
    localStorage.setItem('warmUpData', JSON.stringify(warmUpData));
    localStorage.setItem('warmUpIntegration', 'true');
    
    // Redirecionar para a página de grind
    setLocation('/grind');
  };

  // Funcões de Gamificação da Fase 3
  const checkAchievements = (newScore: number, completedActivities: WarmUpActivity[]) => {
    const updatedAchievements = [...achievements];
    let hasNewAchievements = false;
    
    // Verificar conquista de pontuação perfeita
    if (newScore >= 100) {
      const perfectAchievement = updatedAchievements.find(a => a.id === 'perfect-5');
      if (perfectAchievement && !perfectAchievement.completed) {
        perfectAchievement.progress = Math.min(perfectAchievement.progress + 1, perfectAchievement.requirement);
        if (perfectAchievement.progress >= perfectAchievement.requirement) {
          perfectAchievement.completed = true;
          perfectAchievement.unlockedAt = new Date();
          hasNewAchievements = true;
        }
      }
    }
    
    // Verificar conquista de atividades específicas
    const meditationCompleted = completedActivities.find(a => a.id === 'meditacao');
    if (meditationCompleted) {
      const zenAchievement = updatedAchievements.find(a => a.id === 'zen-master');
      if (zenAchievement && !zenAchievement.completed) {
        zenAchievement.progress = Math.min(zenAchievement.progress + 1, zenAchievement.requirement);
        if (zenAchievement.progress >= zenAchievement.requirement) {
          zenAchievement.completed = true;
          zenAchievement.unlockedAt = new Date();
          hasNewAchievements = true;
        }
      }
    }
    
    const visualizationCompleted = completedActivities.find(a => a.id === 'visualizacao');
    if (visualizationCompleted) {
      const visualizerAchievement = updatedAchievements.find(a => a.id === 'visualizer');
      if (visualizerAchievement && !visualizerAchievement.completed) {
        visualizerAchievement.progress = Math.min(visualizerAchievement.progress + 1, visualizerAchievement.requirement);
        if (visualizerAchievement.progress >= visualizerAchievement.requirement) {
          visualizerAchievement.completed = true;
          visualizerAchievement.unlockedAt = new Date();
          hasNewAchievements = true;
        }
      }
    }
    
    setAchievements(updatedAchievements);
    return hasNewAchievements;
  };
  
  const updateStats = (newScore: number, completedActivities: WarmUpActivity[], mentalState: MentalState) => {
    const updatedStats = { ...stats };
    
    // Atualizar estatísticas gerais
    updatedStats.totalSessions += 1;
    updatedStats.averageScore = ((updatedStats.averageScore * (updatedStats.totalSessions - 1)) + newScore) / updatedStats.totalSessions;
    
    // Simular streak (em uma implementação real, seria baseado em datas)
    if (newScore >= 60) {
      updatedStats.currentStreak += 1;
      updatedStats.longestStreak = Math.max(updatedStats.longestStreak, updatedStats.currentStreak);
    } else {
      updatedStats.currentStreak = 0;
    }
    
    // Atualizar contadores de atividades
    if (completedActivities.find(a => a.id === 'meditacao')) {
      updatedStats.totalMeditations += 1;
    }
    if (completedActivities.find(a => a.id === 'visualizacao')) {
      updatedStats.totalVisualizations += 1;
    }
    
    // Atualizar histórico de pontuação
    const today = new Date().toISOString().split('T')[0];
    updatedStats.scoreHistory.push({ date: today, score: newScore });
    if (updatedStats.scoreHistory.length > 30) {
      updatedStats.scoreHistory.shift();
    }
    
    // Atualizar evolução do estado mental
    updatedStats.mentalStateEvolution.push({
      date: today,
      energia: mentalState.energia,
      foco: mentalState.foco,
      confianca: mentalState.confianca,
      equilibrio: mentalState.equilibrio
    });
    if (updatedStats.mentalStateEvolution.length > 30) {
      updatedStats.mentalStateEvolution.shift();
    }
    
    setStats(updatedStats);
  };
  
  // Calcular correlação com performance
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

  // Função auxiliar para formatar observações do warm up
  const formatWarmUpObservations = (completedActivities: WarmUpActivity[], mentalState: MentalState, score: number) => {
    const observations = [];
    
    // Adicionar score geral
    observations.push(`🎯 Preparação Geral: ${score}%`);
    
    // Adicionar atividades completadas
    if (completedActivities.length > 0) {
      observations.push(`✅ Atividades Completadas: ${completedActivities.map(a => a.name).join(', ')}`);
    }
    
    // Adicionar estado mental
    observations.push(`🧠 Estado Mental:`);
    observations.push(`  • Energia: ${mentalState.energia}%`);
    observations.push(`  • Foco: ${mentalState.foco}%`);
    observations.push(`  • Confiança: ${mentalState.confianca}%`);
    observations.push(`  • Equilíbrio: ${mentalState.equilibrio}%`);
    
    return observations.join('\n');
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
      <div className="flex justify-center gap-4 mb-8 flex-wrap">
        <Dialog open={showCustomization} onOpenChange={setShowCustomization}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-gray-600 hover:bg-gray-700 text-[#000000] hover:text-white">
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

        {/* Botões da Fase 3 - Gamificação */}
        <Dialog open={showGamification} onOpenChange={setShowGamification}>
          <DialogTrigger asChild>
            <Button variant="outline" className="border-gray-600 hover:bg-gray-700 text-[#000000] hover:text-white">
              <Trophy className="w-4 h-4 mr-2" />
              Conquistas
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                Conquistas e Gamificação
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                Acompanhe seu progresso e desbloqueie conquistas especiais
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {achievements.map(achievement => {
                const Icon = achievement.icon;
                const progressPercentage = Math.min((achievement.progress / achievement.requirement) * 100, 100);
                
                return (
                  <div
                    key={achievement.id}
                    className={`p-4 rounded-lg border ${
                      achievement.completed 
                        ? 'bg-yellow-900/20 border-yellow-600/50' 
                        : 'bg-gray-800/50 border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Icon className={`w-6 h-6 ${achievement.completed ? 'text-yellow-400' : 'text-gray-400'}`} />
                      <div className="flex-1">
                        <h3 className={`font-semibold ${achievement.completed ? 'text-yellow-400' : 'text-white'}`}>
                          {achievement.title}
                          {achievement.completed && <span className="ml-2 text-xs">✓</span>}
                        </h3>
                        <p className="text-sm text-gray-400">{achievement.description}</p>
                      </div>
                      <Badge variant={achievement.completed ? "default" : "outline"} className="text-xs">
                        {achievement.type}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>Progresso</span>
                        <span>{achievement.progress}/{achievement.requirement}</span>
                      </div>
                      <Progress value={progressPercentage} className="h-2" />
                      {achievement.completed && achievement.unlockedAt && (
                        <div className="text-xs text-yellow-400">
                          Desbloqueado em {achievement.unlockedAt.toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showStats} onOpenChange={setShowStats}>
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

        <Dialog open={showCorrelation} onOpenChange={setShowCorrelation}>
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
              {/* Correlação Geral */}
              <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-600">
                <h3 className="text-lg font-semibold text-white mb-3">Análise de Correlação</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-poker-accent">
                      {(calculateCorrelation() * 100).toFixed(1)}%
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
                    {calculateCorrelation() > 0.3 ? (
                      <span className="text-green-400">✓ Correlação positiva forte - Sua preparação impacta positivamente nos resultados</span>
                    ) : calculateCorrelation() > 0.1 ? (
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
            </div>
          </DialogContent>
        </Dialog>

        <Button 
          onClick={startGrindSession}
          className="bg-[#16a34a] bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold px-8"
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
              <Badge variant="outline" className="ml-auto text-white border-gray-400">
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
              <Badge variant="outline" className="ml-auto text-white border-gray-400">
                {calculateMentalScore()}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <MentalSlider
                label="Energia"
                icon="⚡"
                value={mentalState.energia}
                onChange={(val) => setMentalState(prev => ({ ...prev, energia: val }))}
              />
              <MentalSlider
                label="Foco"
                icon="🎯"
                value={mentalState.foco}
                onChange={(val) => setMentalState(prev => ({ ...prev, foco: val }))}
              />
              <MentalSlider
                label="Confiança"
                icon="📈"
                value={mentalState.confianca}
                onChange={(val) => setMentalState(prev => ({ ...prev, confianca: val }))}
              />
              <MentalSlider
                label="Equilíbrio"
                icon="💜"
                value={mentalState.equilibrio}
                onChange={(val) => setMentalState(prev => ({ ...prev, equilibrio: val }))}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ETAPA 7 - Novos Recursos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        {/* Notas Pessoais */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-poker-accent" />
              Notas Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <textarea
                  value={personalNotes}
                  onChange={(e) => setPersonalNotes(e.target.value)}
                  placeholder="Registre suas observações antes do grind..."
                  maxLength={200}
                  className="w-full h-32 p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-poker-accent"
                />
                <div className="absolute bottom-2 right-2 text-xs text-gray-500">
                  {personalNotes.length}/200
                </div>
              </div>
              <div className="text-sm text-gray-400">
                Suas observações serão incluídas nos dados de preparação
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Histórico Rápido */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-poker-accent" />
              Histórico Rápido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Última sessão */}
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-400">Hoje</span>
                  <span className="text-sm font-bold text-green-400">85%</span>
                </div>
                <div className="text-xs text-gray-500">
                  Ótimo trabalho, continue assim!
                </div>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-400">Ontem</span>
                  <span className="text-sm font-bold text-yellow-400">72%</span>
                </div>
                <div className="text-xs text-gray-500">
                  Preparação moderada, pode melhorar
                </div>
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-600">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-400">Anteontem</span>
                  <span className="text-sm font-bold text-red-400">45%</span>
                </div>
                <div className="text-xs text-gray-500">
                  Precisamos ser mais profissionais
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sistema de Metas */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-poker-accent" />
              Metas Pessoais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Meta de Score */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white text-sm">Score Alvo</Label>
                  <span className="text-poker-accent font-bold">{personalGoals.targetScore}%</span>
                </div>
                <div className="relative w-full h-2 bg-gray-700 rounded-full">
                  <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-poker-accent to-green-400 rounded-full transition-all duration-200"
                    style={{ width: `${Math.min(100, (finalScore / personalGoals.targetScore) * 100)}%` }}
                  />
                </div>
              </div>

              {/* Meta de Consistência */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-white text-sm">Consistência</Label>
                  <span className="text-poker-accent font-bold">3/{personalGoals.targetConsistency}</span>
                </div>
                <div className="relative w-full h-2 bg-gray-700 rounded-full">
                  <div
                    className="absolute top-0 left-0 h-full bg-gradient-to-r from-yellow-500 to-yellow-400 rounded-full transition-all duration-200"
                    style={{ width: `${(3 / personalGoals.targetConsistency) * 100}%` }}
                  />
                </div>
              </div>

              {/* Áreas de Foco */}
              <div className="space-y-2">
                <Label className="text-white text-sm">Áreas de Foco</Label>
                <div className="flex flex-wrap gap-2">
                  {personalGoals.focusAreas.map((area, index) => (
                    <Badge key={index} variant="outline" className="text-poker-accent border-poker-accent">
                      {area}
                    </Badge>
                  ))}
                </div>
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
                      {[3, 6, 12, 18].map(minutes => (
                        <Button
                          key={minutes}
                          variant={meditationTimer.duration === minutes * 60 ? "default" : "outline"}
                          size="sm"
                          onClick={() => setMeditationDuration(minutes)}
                          disabled={meditationTimer.isRunning}
                          className={meditationTimer.duration === minutes * 60 ? "bg-[#16a34a]" : ""}
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

            <Dialog open={showVisualizationSelection} onOpenChange={setShowVisualizationSelection}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-gray-600 hover:bg-gray-700">
                  <Eye className="w-4 h-4 mr-2" />
                  Guia Visualização
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] bg-poker-surface border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">Escolha a Duração</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Selecione a duração do exercício de visualização
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 gap-4">
                    <Button
                      onClick={() => selectVisualizationDuration(6)}
                      className="h-auto p-6 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-3xl font-bold">6min</div>
                        <div className="flex-1">
                          <div className="font-semibold text-lg mb-1">Visualização Rápida</div>
                          <div className="text-sm opacity-90">Preparação essencial com 5 etapas focadas</div>
                        </div>
                      </div>
                    </Button>
                    <Button
                      onClick={() => selectVisualizationDuration(12)}
                      className="h-auto p-6 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-left"
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-3xl font-bold">12min</div>
                        <div className="flex-1">
                          <div className="font-semibold text-lg mb-1">Visualização Profunda</div>
                          <div className="text-sm opacity-90">Preparação completa com técnicas avançadas</div>
                        </div>
                      </div>
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showVisualizationGuide} onOpenChange={setShowVisualizationGuide}>
              <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
                <DialogHeader>
                  <DialogTitle className="text-white">
                    Guia de Visualização - {visualizationDuration} minutos
                  </DialogTitle>
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
                        {currentVisualizationStep + 1} / {currentVisualizationSteps.length}
                      </span>
                    </div>
                    <Progress 
                      value={((currentVisualizationStep + 1) / currentVisualizationSteps.length) * 100} 
                      className="h-2"
                    />
                  </div>

                  {/* Step Content */}
                  <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-600 min-h-[200px]">
                    <h3 className="text-xl font-semibold text-white mb-3">
                      {currentVisualizationSteps[currentVisualizationStep]?.title}
                    </h3>
                    <p className="text-gray-300 leading-relaxed mb-4">
                      {currentVisualizationSteps[currentVisualizationStep]?.content}
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
                      disabled={currentVisualizationStep === currentVisualizationSteps.length - 1}
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
                    Em breve - Biblioteca de áudios para sua preparação
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
                        disabled
                      >
                        {category}
                      </Button>
                    ))}
                  </div>

                  {/* Placeholder Content */}
                  <div className="bg-gray-800/50 rounded-lg p-8 border border-gray-600 text-center">
                    <Headphones className="w-16 h-16 mx-auto text-gray-500 mb-4" />
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Biblioteca de Áudios em Desenvolvimento
                    </h3>
                    <p className="text-gray-400 mb-4">
                      Este recurso será disponibilizado em breve. Teremos áudios motivacionais, de hipnose e foco para sua preparação mental.
                    </p>
                    <div className="text-sm text-gray-500">
                      Versão 2.0 - Em breve
                    </div>
                  </div>

                  {/* Audio List Placeholder */}
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {sampleAudioTracks
                      .filter(track => track.category === selectedAudioCategory)
                      .map(track => (
                        <div
                          key={track.id}
                          className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-600 opacity-50"
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
                              className="border-gray-600 hover:bg-gray-700 text-gray-400"
                              disabled
                            >
                              ⭐
                            </Button>
                            <Button
                              size="sm"
                              className="bg-gray-600 hover:bg-gray-700"
                              disabled
                            >
                              <Play className="w-4 h-4 mr-2" />
                              Reproduzir
                            </Button>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}