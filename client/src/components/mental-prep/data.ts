import {
  Droplets,
  Dumbbell,
  Sparkles,
  Eye,
  Utensils,
  Flame,
  Star,
  Brain,
  Headphones,
  Trophy,
} from 'lucide-react';
import type { AudioTrack, VisualizationStep, Achievement, WarmUpStats, SessionCorrelation, WarmUpActivity } from './types';

export const sampleAudioTracks: AudioTrack[] = [
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

export const defaultAchievements: Achievement[] = [
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

export const defaultStats: WarmUpStats = {
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

export const sessionCorrelationData: SessionCorrelation[] = [
  { warmUpScore: 85, sessionProfit: 1250, sessionVolume: 45, sessionROI: 15.2, sessionDate: '2025-01-01' },
  { warmUpScore: 72, sessionProfit: 850, sessionVolume: 38, sessionROI: 12.8, sessionDate: '2025-01-02' },
  { warmUpScore: 90, sessionProfit: 1680, sessionVolume: 52, sessionROI: 18.5, sessionDate: '2025-01-03' },
  { warmUpScore: 65, sessionProfit: 420, sessionVolume: 28, sessionROI: 8.2, sessionDate: '2025-01-04' },
  { warmUpScore: 78, sessionProfit: 1120, sessionVolume: 42, sessionROI: 14.1, sessionDate: '2025-01-05' },
  { warmUpScore: 82, sessionProfit: 1350, sessionVolume: 48, sessionROI: 16.8, sessionDate: '2025-01-06' },
  { warmUpScore: 88, sessionProfit: 1580, sessionVolume: 55, sessionROI: 17.9, sessionDate: '2025-01-07' }
];

export const visualization6Minutes: VisualizationStep[] = [
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

export const visualization12Minutes: VisualizationStep[] = [
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

export const defaultActivities: WarmUpActivity[] = [
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
