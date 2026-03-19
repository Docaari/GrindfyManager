import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { usePermission } from "@/hooks/usePermission";
import AccessDenied from "@/components/AccessDenied";
import { 
  BookOpen, 
  Plus, 
  Brain, 
  Target, 
  Clock, 
  Trophy, 
  TrendingUp, 
  FileText, 
  Video, 
  Link,
  Users,
  Calendar,
  CalendarDays,
  BarChart3,
  Settings,
  Search,
  Filter,
  ChevronRight,
  Star,
  Play,
  Pause,
  RotateCcw,
  Upload,
  ExternalLink,
  CheckCircle,
  Circle,
  Eye,
  Edit,
  Trash2,
  Download
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { type StudyCard } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = [
  "3bet", "4bet", "River Play", "ICM", "Bubble Play", "Final Table", 
  "Tournament Strategy", "Cash Game", "Short Stack", "Big Stack", "Psychology"
];

const STUDY_TEMPLATES = [
  {
    id: "3bet-defense",
    title: "3bet Defense Strategy",
    category: "3bet",
    difficulty: "Intermediário",
    priority: "Alta",
    description: "Aprenda a defender contra 3bets com ranges otimizados",
    objectives: "Melhorar win rate contra 3bets em 15%",
    estimatedTime: 8
  },
  {
    id: "icm-basics",
    title: "ICM Fundamentos",
    category: "ICM",
    difficulty: "Iniciante",
    priority: "Alta",
    description: "Conceitos básicos de Independent Chip Model",
    objectives: "Entender cálculos de ICM pressure",
    estimatedTime: 6
  },
  {
    id: "river-bluffs",
    title: "River Bluff Sizing",
    category: "River Play",
    difficulty: "Avançado",
    priority: "Média",
    description: "Otimização de sizing em river bluffs",
    objectives: "Aumentar bluff success rate em 10%",
    estimatedTime: 12
  },
  {
    id: "psychology-tilt",
    title: "Controle de Tilt",
    category: "Psychology",
    difficulty: "Iniciante",
    priority: "Alta",
    description: "Técnicas para gerenciar tilt durante sessões",
    objectives: "Reduzir episódios de tilt em 80%",
    estimatedTime: 4
  },
  {
    id: "short-stack-push",
    title: "Short Stack Push/Fold",
    category: "Short Stack",
    difficulty: "Intermediário",
    priority: "Média",
    description: "Charts de push/fold para stacks curtos",
    objectives: "Memorizar ranges de 10-20bb",
    estimatedTime: 10
  }
];

const createStudyCardSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  category: z.string().min(1, "Categoria é obrigatória"),
  difficulty: z.enum(["Iniciante", "Intermediário", "Avançado"]),
  estimatedTime: z.number().min(1, "Tempo estimado deve ser maior que 0"),
  priority: z.enum(["Baixa", "Média", "Alta"]),
  objectives: z.string().optional(),
  // Campos de planejamento semanal
  studyDays: z.array(z.string()).optional(),
  studyStartTime: z.string().optional(),
  studyDuration: z.number().optional(),
  isRecurring: z.boolean().optional(),
  weeklyFrequency: z.number().optional(),
  studyDescription: z.string().optional(),
});

type CreateStudyCardData = z.infer<typeof createStudyCardSchema>;

const PRIORITIES = [
  { value: "critico", label: "Crítico", color: "bg-red-500" },
  { value: "alto", label: "Alto", color: "bg-orange-500" },
  { value: "medio", label: "Médio", color: "bg-yellow-500" },
  { value: "baixo", label: "Baixo", color: "bg-green-500" }
];

// Session Timer Component
function StudySessionTimer({ cardId, onTimeUpdate }: { cardId: string; onTimeUpdate: (time: number) => void }) {
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [time, setTime] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;

    if (isActive && !isPaused) {
      interval = setInterval(() => {
        setTime(time => time + 1);
      }, 1000);
    } else if (!isActive && time !== 0) {
      if (interval) clearInterval(interval);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, isPaused, time]);

  const handleStart = () => {
    setIsActive(true);
    setIsPaused(false);
    toast({
      title: "Sessão de estudo iniciada",
      description: "Foque no seu aprendizado!",
    });
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    setIsActive(false);
    setIsPaused(false);
    onTimeUpdate(time);
    toast({
      title: "Sessão finalizada",
      description: `Tempo total: ${formatTime(time / 60)}`,
    });
    setTime(0);
  };

  const formatTimeDisplay = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-white font-semibold mb-2">Cronômetro de Estudo</h4>
          <div className="text-2xl font-mono text-poker-accent">
            {formatTimeDisplay(time)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isActive ? (
            <Button
              onClick={handleStart}
              className="bg-green-600 hover:bg-green-700 text-white"
              size="sm"
            >
              <Play className="w-4 h-4 mr-2" />
              Iniciar
            </Button>
          ) : (
            <>
              <Button
                onClick={handlePause}
                variant="outline"
                className="text-white border-gray-600 hover:bg-gray-700"
                size="sm"
              >
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </Button>
              <Button
                onClick={handleStop}
                className="bg-red-600 hover:bg-red-700 text-white"
                size="sm"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Parar
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface StudyDashboardStats {
  totalCards: number;
  activeCards: number;
  completedCards: number;
  totalTimeInvested: number;
  avgKnowledgeScore: number;
  weeklyTime: number;
  monthlyTime: number;
}

function StudyPlanningTab({ card }: { card: StudyCard }) {
  const getDayLabel = (dayKey: string) => {
    const dayLabels: { [key: string]: string } = {
      'monday': 'Segunda-feira',
      'tuesday': 'Terça-feira',
      'wednesday': 'Quarta-feira',
      'thursday': 'Quinta-feira',
      'friday': 'Sexta-feira',
      'saturday': 'Sábado',
      'sunday': 'Domingo'
    };
    return dayLabels[dayKey] || dayKey;
  };

  const hasPlanning = card.studyDays && card.studyDays.length > 0;

  if (!hasPlanning) {
    return (
      <div className="text-center py-8">
        <Calendar className="w-12 h-12 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400">Nenhum planejamento semanal configurado</p>
        <p className="text-sm text-gray-500 mt-2">
          Configure um planejamento ao editar este cartão de estudo
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        {/* Dias da Semana */}
        <Card className="bg-gray-800 border-gray-600">
          <CardHeader>
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              Dias de Estudo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {(card.studyDays ?? []).map((day) => (
                <Badge key={day} variant="secondary" className="text-poker-accent">
                  {getDayLabel(day)}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Horário e Duração */}
        {(card.studyStartTime || card.studyDuration) && (
          <div className="grid grid-cols-2 gap-4">
            {card.studyStartTime && (
              <Card className="bg-gray-800 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Horário
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300">{card.studyStartTime}</p>
                </CardContent>
              </Card>
            )}

            {card.studyDuration && (
              <Card className="bg-gray-800 border-gray-600">
                <CardHeader>
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Duração
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300">{formatTime(card.studyDuration)}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Recorrência */}
        {card.isRecurring && (
          <Card className="bg-gray-800 border-gray-600">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                Estudo Recorrente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300">
                {card.weeklyFrequency ? `${card.weeklyFrequency}x por semana` : 'Sim'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Descrição */}
        {card.studyDescription && (
          <Card className="bg-gray-800 border-gray-600">
            <CardHeader>
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Descrição
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-300">{card.studyDescription}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Informação para o futuro */}
      <div className="mt-6 p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-5 h-5 text-blue-400" />
          <h4 className="text-blue-400 font-medium">Calendário Inteligente</h4>
        </div>
        <p className="text-sm text-blue-300">
          Estas configurações serão utilizadas pelo futuro Calendário Inteligente para:
        </p>
        <ul className="text-sm text-blue-300 mt-2 space-y-1">
          <li>• Criar blocos automáticos de estudo</li>
          <li>• Respeitar seus horários preferidos</li>
          <li>• Evitar conflitos com torneios planejados</li>
        </ul>
      </div>
    </div>
  );
}

function StudyProgressTab({ card }: { card: StudyCard }) {
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [timeToAdd, setTimeToAdd] = useState(0);
  const [knowledgeScore, setKnowledgeScore] = useState(card.knowledgeScore || 0);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: correlationData, isLoading, error } = useQuery({
    queryKey: ['/api/study-correlation', card.id],
    queryFn: () => apiRequest('GET', `/api/study-correlation/${card.id}`),
    enabled: !!card.id,
  });

  const updateProgressMutation = useMutation({
    mutationFn: async (data: { timeToAdd: number; knowledgeScore: number }) => {
      return apiRequest('POST', `/api/study-cards/${card.id}/progress`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/study-correlation', card.id] });
      toast({
        title: "Progresso atualizado!",
        description: "Dados de estudo atualizados com sucesso.",
      });
      setShowProgressDialog(false);
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar progresso",
        description: "Não foi possível atualizar o progresso do estudo.",
        variant: "destructive",
      });
    },
  });

  const handleUpdateProgress = () => {
    updateProgressMutation.mutate({ timeToAdd, knowledgeScore });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poker-accent mx-auto mb-4"></div>
          <p className="text-gray-400">Analisando correlação...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">Progresso & Correlação</h3>
        <Button
          onClick={() => setShowProgressDialog(true)}
          className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
        >
          <TrendingUp className="w-4 h-4 mr-2" />
          Atualizar Progresso
        </Button>
      </div>

      {/* Study Timer */}
      <StudySessionTimer
        cardId={card.id}
        onTimeUpdate={(timeSeconds) => {
          const timeMinutes = Math.floor(timeSeconds / 60);
          updateProgressMutation.mutate({
            timeToAdd: timeMinutes,
            knowledgeScore: card.knowledgeScore || 0,
          });
        }}
      />

      {/* Current Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-gray-700 border-gray-600">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-poker-accent/10 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-poker-accent" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Tempo Investido</p>
                <p className="text-xl font-bold text-white">{formatTime(card.timeInvested || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-700 border-gray-600">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-500/10 rounded-full flex items-center justify-center">
                <Brain className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-gray-400">Conhecimento</p>
                <p className="text-xl font-bold text-green-400">{card.knowledgeScore || 0}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Correlation Analysis */}
      {correlationData && (
        <Card className="bg-gray-700 border-gray-600">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-poker-accent" />
              Análise de Correlação com Desempenho
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-gray-800 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Antes do Estudo</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Torneios:</span>
                    <span className="text-white">{correlationData?.before?.count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ROI:</span>
                    <span className={(correlationData?.before?.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {correlationData?.before?.roi || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Lucro:</span>
                    <span className={(correlationData?.before?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      ${correlationData?.before?.profit || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gray-800 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-300 mb-3">Após o Estudo</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Torneios:</span>
                    <span className="text-white">{correlationData?.after?.count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">ROI:</span>
                    <span className={(correlationData?.after?.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      {correlationData?.after?.roi || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Lucro:</span>
                    <span className={(correlationData?.after?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                      ${correlationData?.after?.profit || 0}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Improvement Insights */}
            <div className="p-4 bg-poker-accent/10 rounded-lg">
              <h4 className="text-sm font-semibold text-poker-accent mb-3">Insights de Melhoria</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Melhoria no ROI:</span>
                  <span className={(correlationData?.improvement?.roi || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {(correlationData?.improvement?.roi || 0) >= 0 ? '+' : ''}{correlationData?.improvement?.roi || 0}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Melhoria no Lucro:</span>
                  <span className={(correlationData?.improvement?.profit || 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {(correlationData?.improvement?.profit || 0) >= 0 ? '+' : ''}${correlationData?.improvement?.profit || 0}
                  </span>
                </div>
                {correlationData?.insight?.hasImprovement && (
                  <div className="mt-3 p-3 bg-green-900/20 rounded-lg">
                    <p className="text-green-400 text-sm">
                      {correlationData?.insight?.significantImprovement 
                        ? '🎯 Melhoria significativa detectada! Este estudo está tendo impacto positivo no seu desempenho.'
                        : '📈 Melhoria detectada. Continue investindo tempo neste estudo.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Progress Update Dialog */}
      <Dialog open={showProgressDialog} onOpenChange={setShowProgressDialog}>
        <DialogContent className="bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-white">Atualizar Progresso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-white">Tempo a Adicionar (minutos)</Label>
              <Input
                type="number"
                value={timeToAdd}
                onChange={(e) => setTimeToAdd(parseInt(e.target.value) || 0)}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="60"
              />
            </div>
            <div>
              <Label className="text-white">Nível de Conhecimento (%)</Label>
              <Input
                type="number"
                value={knowledgeScore}
                onChange={(e) => setKnowledgeScore(parseInt(e.target.value) || 0)}
                className="bg-gray-800 border-gray-600 text-white"
                min="0"
                max="100"
                placeholder="70"
              />
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowProgressDialog(false)}
              className="text-white border-gray-600"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleUpdateProgress}
              disabled={updateProgressMutation.isPending}
              className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            >
              {updateProgressMutation.isPending ? 'Salvando...' : 'Atualizar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Studies() {
  const hasPermission = usePermission('studies_access');
  
  if (!hasPermission) {
    return <AccessDenied featureName="Estudos" description="Acesse o centro de estudos e desenvolvimento" currentPlan="free" requiredPlan="pro" pageName="Estudos" onViewPlans={() => { window.location.href = '/subscriptions'; }} />;
  }
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<StudyCard | null>(null);
  const { toast } = useToast();

  // Fetch study cards
  const { data: studyCards = [], isLoading } = useQuery<StudyCard[]>({
    queryKey: ["/api/study-cards"],
  });

  const createStudyCardMutation = useMutation({
    mutationFn: async (data: CreateStudyCardData) => {
      return await apiRequest('POST', '/api/study-cards', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-cards'] });
      toast({
        title: "Sucesso!",
        description: "Card de estudo criado com sucesso.",
      });
      setShowCreateDialog(false);
    },
    onError: (error) => {
      console.error('Error creating study card:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar card de estudo. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Calculate real dashboard stats from study cards
  const dashboardStats: StudyDashboardStats = {
    totalCards: studyCards.length,
    activeCards: studyCards.filter((card: StudyCard) => card.status === 'active').length,
    completedCards: studyCards.filter((card: StudyCard) => card.status === 'completed').length,
    totalTimeInvested: studyCards.reduce((total: number, card: StudyCard) => total + (card.timeInvested || 0), 0),
    avgKnowledgeScore: studyCards.length > 0 
      ? Math.round(studyCards.reduce((total: number, card: StudyCard) => total + (card.knowledgeScore || 0), 0) / studyCards.length)
      : 0,
    weeklyTime: studyCards.reduce((total: number, card: StudyCard) => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return card.updatedAt && new Date(card.updatedAt) > weekAgo ? total + (card.timeInvested || 0) : total;
    }, 0),
    monthlyTime: studyCards.reduce((total: number, card: StudyCard) => {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return card.updatedAt && new Date(card.updatedAt) > monthAgo ? total + (card.timeInvested || 0) : total;
    }, 0),
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  const calculateWeeklyProgress = (cards: StudyCard[]) => {
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weeklyData = weekDays.map(day => ({ day, time: 0, sessions: 0 }));

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    cards.forEach(card => {
      if (card.updatedAt && new Date(card.updatedAt) > oneWeekAgo) {
        const dayIndex = new Date(card.updatedAt).getDay();
        weeklyData[dayIndex].time += card.timeInvested || 0;
        weeklyData[dayIndex].sessions += 1;
      }
    });

    return weeklyData;
  };

  const calculateDailyRecommendations = (cards: StudyCard[]) => {
    const today = new Date();
    const todayStudy = cards.filter(card => {
      if (!card.updatedAt) return false;
      const cardDate = new Date(card.updatedAt);
      return cardDate.toDateString() === today.toDateString();
    });

    const totalTimeToday = todayStudy.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
    const remainingTime = Math.max(0, 60 - totalTimeToday); // 1 hour daily goal

    return {
      studiedToday: totalTimeToday,
      remainingTime,
      hasStudiedToday: totalTimeToday > 0,
      reachedDailyGoal: totalTimeToday >= 60
    };
  };

  const calculateStudyEfficiency = (cards: StudyCard[]) => {
    const completedCards = cards.filter(c => c.status === 'completed');
    if (completedCards.length === 0) return { efficiency: 0, avgTimePerCard: 0 };

    const totalTime = completedCards.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
    const avgTimePerCard = totalTime / completedCards.length;

    // Calculate efficiency based on time invested vs expected time
    const efficiency = completedCards.reduce((acc, card) => {
      const expectedTime = ((card as any).estimatedTime || 0) * 60; // TODO: type properly - Convert to minutes
      const actualTime = card.timeInvested || 0;
      const cardEfficiency = expectedTime > 0 ? Math.min(100, (expectedTime / actualTime) * 100) : 0;
      return acc + cardEfficiency;
    }, 0) / completedCards.length;

    return { efficiency, avgTimePerCard };
  };

  const generatePersonalizedRecommendations = (cards: StudyCard[]) => {
    const recommendations = [];

    // Time-based recommendations
    const totalTime = cards.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
    if (totalTime < 240) { // Less than 4 hours
      recommendations.push({
        type: 'time',
        priority: 'high',
        title: 'Aumente o Tempo de Estudo',
        description: 'Você investiu apenas ' + formatTime(totalTime) + ' até agora. Tente dedicar pelo menos 1h por dia.',
        action: 'Criar cronograma de estudos'
      });
    }

    // Category balance recommendations
    const categories = Array.from(new Set(cards.map(c => c.category)));
    if (categories.length < 3) {
      recommendations.push({
        type: 'variety',
        priority: 'medium',
        title: 'Diversifique suas Categorias',
        description: 'Você está focado em poucas áreas. Considere estudar outras categorias importantes.',
        action: 'Adicionar estudo de ICM ou Psychology'
      });
    }

    // Completion rate recommendations
    const completionRate = cards.length > 0 ? (cards.filter(c => c.status === 'completed').length / cards.length) * 100 : 0;
    if (completionRate < 30) {
      recommendations.push({
        type: 'completion',
        priority: 'high',
        title: 'Melhore a Taxa de Conclusão',
        description: `Apenas ${Math.round(completionRate)}% dos seus estudos foram concluídos. Foque em finalizar estudos em andamento.`,
        action: 'Revisar estudos ativos'
      });
    }

    return recommendations;
  };

  const calculateStudyTrends = (cards: StudyCard[]) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const recentCards = cards.filter(card => 
      card.updatedAt && new Date(card.updatedAt) > thirtyDaysAgo
    );

    const weeklyData = [];
    for (let i = 0; i < 4; i++) {
      const weekStart = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);

      const weekCards = recentCards.filter(card => {
        if (!card.updatedAt) return false;
        const cardDate = new Date(card.updatedAt);
        return cardDate >= weekStart && cardDate < weekEnd;
      });

      const weekTime = weekCards.reduce((sum, card) => sum + (card.timeInvested || 0), 0);
      const weekScore = weekCards.length > 0 
        ? weekCards.reduce((sum, card) => sum + (card.knowledgeScore || 0), 0) / weekCards.length 
        : 0;

      weeklyData.unshift({
        week: `Sem ${4 - i}`,
        time: weekTime,
        score: Math.round(weekScore),
        cards: weekCards.length
      });
    }

    return weeklyData;
  };

  const calculateNextStudyRecommendation = (cards: StudyCard[]) => {
    const activeCards = cards.filter(c => c.status === 'active');
    if (activeCards.length === 0) return null;

    // Sort by priority and progress
    const sortedCards = activeCards.sort((a, b) => {
      const priorityScore = (priority: string) => {
        switch (priority) {
          case 'Alta': return 3;
          case 'Média': return 2;
          case 'Baixa': return 1;
          default: return 0;
        }
      };

      const aScore = priorityScore(a.priority) * 10 + (100 - (a.knowledgeScore || 0));
      const bScore = priorityScore(b.priority) * 10 + (100 - (b.knowledgeScore || 0));

      return bScore - aScore;
    });

    return sortedCards[0];
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    return "text-red-400";
  };

  const calculateStudyStreak = (cards: StudyCard[]) => {
    const today = new Date();
    let streak = 0;
    let currentDate = new Date(today);

    while (true) {
      const hasStudyToday = cards.some(card => {
        if (!card.updatedAt) return false;
        const cardDate = new Date(card.updatedAt);
        return cardDate.toDateString() === currentDate.toDateString() && (card.timeInvested || 0) > 0;
      });

      if (hasStudyToday) {
        streak++;
        currentDate.setDate(currentDate.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  };

  const calculateCategoryPerformance = (cards: StudyCard[]) => {
    const categoryStats = cards.reduce((acc, card) => {
      if (!acc[card.category]) {
        acc[card.category] = { totalTime: 0, avgScore: 0, count: 0 };
      }
      acc[card.category].totalTime += card.timeInvested || 0;
      acc[card.category].avgScore += card.knowledgeScore || 0;
      acc[card.category].count++;
      return acc;
    }, {} as Record<string, { totalTime: number; avgScore: number; count: number }>);

    return Object.entries(categoryStats).map(([category, stats]) => ({
      category,
      totalTime: stats.totalTime,
      avgScore: Math.round(stats.avgScore / stats.count),
      count: stats.count
    })).sort((a, b) => b.totalTime - a.totalTime);
  };

  const calculateAchievements = (cards: StudyCard[], stats: StudyDashboardStats) => {
    const achievements = [];

    // Time-based achievements
    if (stats.totalTimeInvested >= 100) achievements.push({
      title: "Centúria",
      description: "100+ horas de estudo",
      icon: "🏆",
      color: "text-yellow-400"
    });

    if (stats.totalTimeInvested >= 50) achievements.push({
      title: "Dedicado",
      description: "50+ horas de estudo",
      icon: "⭐",
      color: "text-blue-400"
    });

    // Streak achievements
    if (studyStreak >= 7) achievements.push({
      title: "Consistência",
      description: "7 dias seguidos estudando",
      icon: "🔥",
      color: "text-orange-400"
    });

    // Knowledge achievements
    if (stats.avgKnowledgeScore >= 90) achievements.push({
      title: "Expert",
      description: "90%+ conhecimento médio",
      icon: "🧠",
      color: "text-purple-400"
    });

    // Completion achievements
    if (stats.completedCards >= 5) achievements.push({
      title: "Finalizador",
      description: "5+ estudos concluídos",
      icon: "✅",
      color: "text-green-400"
    });

    return achievements;
  };

  const getPriorityColor = (priority: string) => {
    const priorityConfig = PRIORITIES.find(p => p.value === priority);
    return priorityConfig?.color || "bg-gray-500";
  };

  const exportStudyData = () => {
    const csvData = studyCards.map((card: StudyCard) => ({
      Titulo: card.title,
      Categoria: card.category,
      Dificuldade: (card as any).difficulty || '', // TODO: type properly
      Prioridade: card.priority,
      Status: card.status,
      'Tempo Investido (min)': card.timeInvested || 0,
      'Score Conhecimento': card.knowledgeScore || 0,
      'Data Criacao': card.createdAt ? new Date(card.createdAt).toLocaleDateString('pt-BR') : '',
      'Ultima Atualizacao': card.updatedAt ? new Date(card.updatedAt).toLocaleDateString('pt-BR') : '',
      Objetivos: card.objectives || '',
      Descricao: card.description || ''
    }));

    const csvContent = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map((row: Record<string, any>) => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `grindfy_estudos_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Dados exportados!",
      description: "Arquivo CSV baixado com sucesso.",
    });
  };

  const filteredCards = studyCards.filter((card: StudyCard) => {
    const matchesCategory = !selectedCategory || selectedCategory === "all" || card.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      card.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Calculate advanced statistics
  const studyStreak = calculateStudyStreak(studyCards);
  const categoryPerformance = calculateCategoryPerformance(studyCards);
  const achievements = calculateAchievements(studyCards, dashboardStats);
  const weeklyProgress = calculateWeeklyProgress(studyCards);
  const dailyRecommendations = calculateDailyRecommendations(studyCards);
  const studyEfficiency = calculateStudyEfficiency(studyCards);
  const personalizedRecommendations = generatePersonalizedRecommendations(studyCards);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-poker-bg flex items-center justify-center">
        <div className="text-poker-gold text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poker-bg text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-poker-accent" />
              Estudos
            </h1>
            <p className="text-gray-400 mt-2">
              Centro de conhecimento e desenvolvimento contínuo
            </p>
          </div>

          <div className="flex items-center gap-3">
            {studyCards.length > 0 && (
              <Button
                variant="outline"
                onClick={exportStudyData}
                className="text-white border-gray-600 hover:bg-gray-700"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
            )}
            <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
              <DialogTrigger asChild>
                <Button className="hover:bg-poker-accent/90 text-black font-semibold bg-[#16a249]">
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Estudo
                </Button>
              </DialogTrigger>
            </Dialog>
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Cartões Ativos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{dashboardStats.activeCards}</div>
              <p className="text-xs text-gray-400">de {dashboardStats.totalCards} totais</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Tempo Investido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-poker-accent">
                {formatTime(dashboardStats.weeklyTime)}
              </div>
              <p className="text-xs text-gray-400">esta semana</p>
              <div className="mt-2">
                <Progress value={(dashboardStats.weeklyTime / 480) * 100} className="h-1" />
                <p className="text-xs text-gray-500 mt-1">
                  Meta: 8h semanais ({Math.round((dashboardStats.weeklyTime / 480) * 100)}%)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Score Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(dashboardStats.avgKnowledgeScore)}`}>
                {dashboardStats.avgKnowledgeScore}%
              </div>
              <p className="text-xs text-gray-400">conhecimento geral</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Concluídos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">{dashboardStats.completedCards}</div>
              <p className="text-xs text-gray-400">estudos finalizados</p>
            </CardContent>
          </Card>
        </div>

        {/* Create Study Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-[600px] bg-poker-surface border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-white">Criar Novo Cartão de Estudo</DialogTitle>
              <DialogDescription className="text-gray-400">
                Organize seu aprendizado com objetivos claros e métricas mensuráveis
              </DialogDescription>
            </DialogHeader>
            <CreateStudyCardForm 
              onClose={() => setShowCreateDialog(false)} 
              onSubmit={createStudyCardMutation.mutate}
            />
          </DialogContent>
        </Dialog>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Cartões Ativos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{dashboardStats.activeCards}</div>
              <p className="text-xs text-gray-400">de {dashboardStats.totalCards} totais</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Tempo Investido</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-poker-accent">
                {formatTime(dashboardStats.weeklyTime)}
              </div>
              <p className="text-xs text-gray-400">esta semana</p>
              <div className="mt-2">
                <Progress value={(dashboardStats.weeklyTime / 480) * 100} className="h-1" />
                <p className="text-xs text-gray-500 mt-1">
                  Meta: 8h semanais ({Math.round((dashboardStats.weeklyTime / 480) * 100)}%)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Score Médio</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getScoreColor(dashboardStats.avgKnowledgeScore)}`}>
                {dashboardStats.avgKnowledgeScore}%
              </div>
              <p className="text-xs text-gray-400">conhecimento geral</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-400">Concluídos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-400">{dashboardStats.completedCards}</div>
              <p className="text-xs text-gray-400">estudos finalizados</p>
            </CardContent>
          </Card>
        </div>

        {/* Study Notifications */}
        {dashboardStats.weeklyTime < 240 && (
          <Card className="bg-yellow-900/20 border-yellow-500/30 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Target className="w-5 h-5 text-yellow-500" />
                <div>
                  <p className="text-yellow-400 font-medium">Meta Semanal em Andamento</p>
                  <p className="text-sm text-gray-400">
                    Você estudou {formatTime(dashboardStats.weeklyTime)} de 8h esta semana. 
                    Continue focado para atingir sua meta!
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {dashboardStats.weeklyTime >= 480 && (
          <Card className="bg-green-900/20 border-green-500/30 mb-6">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-green-400 font-medium">🎯 Meta Semanal Atingida!</p>
                  <p className="text-sm text-gray-400">
                    Parabéns! Você completou {formatTime(dashboardStats.weeklyTime)} de estudo esta semana.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Daily Progress Notifications */}
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

        {/* Advanced Analytics */}
        {studyCards.length > 0 && (
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
        )}

        {/* Study Efficiency Analysis */}
        {studyCards.length > 0 && (
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
        )}

        {/* Achievements Section */}
        {achievements.length > 0 && (
          <Card className="bg-poker-surface border-gray-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-poker-accent" />
                Conquistas Desbloqueadas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {achievements.map((achievement, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                    <div className="text-2xl">{achievement.icon}</div>
                    <div>
                      <p className={`font-semibold ${achievement.color}`}>
                        {achievement.title}
                      </p>
                      <p className="text-sm text-gray-400">
                        {achievement.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Buscar estudos..."
              className="pl-10 bg-poker-surface border-gray-600 text-white"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-48 bg-poker-surface border-gray-600 text-white">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent className="bg-poker-surface border-gray-600">
              <SelectItem value="all">Todas</SelectItem>
              {CATEGORIES.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Study Recommendations */}
        {studyCards.length > 0 && (
          <Card className="bg-poker-surface border-gray-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Brain className="w-5 h-5 text-poker-accent" />
                Recomendações Inteligentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {studyCards
                  .filter((card: StudyCard) => card.status === 'active')
                  .sort((a: StudyCard, b: StudyCard) => {
                    // Prioriza por: alta prioridade, baixo progresso, menos tempo investido
                    const priorityScore = { 'Alta': 3, 'Média': 2, 'Baixa': 1 };
                    const aScore = (priorityScore[a.priority as keyof typeof priorityScore] || 0) * 100 - (a.knowledgeScore || 0) - (a.timeInvested || 0) / 60;
                    const bScore = (priorityScore[b.priority as keyof typeof priorityScore] || 0) * 100 - (b.knowledgeScore || 0) - (b.timeInvested || 0) / 60;
                    return bScore - aScore;
                  })
                  .slice(0, 3)
                  .map((card: StudyCard, index: number) => (
                    <div key={card.id} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-poker-accent/10 rounded-full flex items-center justify-center">
                          <span className="text-poker-accent text-sm font-bold">{index + 1}</span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{card.title}</p>
                          <p className="text-gray-400 text-sm">
                            {card.category} • {card.knowledgeScore || 0}% progresso
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedCard(card)}
                        className="text-white border-gray-600 hover:bg-gray-700"
                      >
                        Estudar
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
        </Card>
        )}

        {/* Study Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCards.map((card: StudyCard) => (
            <Card 
              key={card.id} 
              className="bg-poker-surface border-gray-700 hover:border-poker-accent/50 transition-colors cursor-pointer"
              onClick={() => setSelectedCard(card)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge className={`${getPriorityColor(card.priority)} text-white`}>
                    {PRIORITIES.find(p => p.value === card.priority)?.label}
                  </Badge>
                  <Badge variant="outline" className="text-white border-gray-400">
                    {card.category}
                  </Badge>
                </div>
                <CardTitle className="text-white text-lg">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Progresso</span>
                    <span className={`font-semibold ${getScoreColor(card.knowledgeScore || 0)}`}>
                      {card.knowledgeScore || 0}%
                    </span>
                  </div>
                  <Progress value={card.knowledgeScore || 0} className="h-2" />

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">Tempo investido</span>
                    <span className="text-white">{formatTime(card.timeInvested || 0)}</span>
                  </div>

                  {card.currentStat && card.targetStat && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">Stat atual</span>
                      <span className="text-white">
                        {card.currentStat}% → {card.targetStat}%
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Empty State */}
        {filteredCards.length === 0 && (
          <div className="text-center py-12">
            <Brain className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-400 mb-2">
              {searchQuery || selectedCategory ? "Nenhum estudo encontrado" : "Nenhum estudo criado"}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchQuery || selectedCategory ? 
                "Tente ajustar os filtros ou criar um novo estudo" : 
                "Comece criando seu primeiro cartão de estudo"
              }
            </p>
            <Button 
              onClick={() => setShowCreateDialog(true)}
              className="hover:bg-poker-accent/90 text-black font-semibold bg-[#16a249]"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Primeiro Estudo
            </Button>
          </div>
        )}
      </div>

      {/* Study Card Detail Dialog */}
      <Dialog open={!!selectedCard} onOpenChange={() => setSelectedCard(null)}>
        <DialogContent className="sm:max-w-[800px] bg-poker-surface border-gray-700">
          {selectedCard && (
            <StudyCardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const WEEK_DAYS = [
  { key: 'monday', label: 'Segunda-feira' },
  { key: 'tuesday', label: 'Terça-feira' },
  { key: 'wednesday', label: 'Quarta-feira' },
  { key: 'thursday', label: 'Quinta-feira' },
  { key: 'friday', label: 'Sexta-feira' },
  { key: 'saturday', label: 'Sábado' },
  { key: 'sunday', label: 'Domingo' }
];

function WeeklyStudyPlanForm({ form }: { form: any }) {
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);

  const handleDayToggle = (dayKey: string) => {
    const newDays = selectedDays.includes(dayKey)
      ? selectedDays.filter(d => d !== dayKey)
      : [...selectedDays, dayKey];

    setSelectedDays(newDays);
    form.setValue('studyDays', newDays);
  };

  const handleRecurringToggle = (checked: boolean) => {
    setIsRecurring(checked);
    form.setValue('isRecurring', checked);
  };

  return (
    <div className="space-y-4">
      {/* Dias da Semana */}
      <div>
        <FormLabel className="text-white text-sm font-medium mb-3 block">
          Dias sugeridos para estudo
        </FormLabel>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {WEEK_DAYS.map((day) => (
            <div key={day.key} className="flex items-center space-x-2">
              <Checkbox
                id={day.key}
                checked={selectedDays.includes(day.key)}
                onCheckedChange={() => handleDayToggle(day.key)}
                className="border-gray-600"
              />
              <Label 
                htmlFor={day.key} 
                className="text-sm text-white cursor-pointer"
              >
                {day.label}
              </Label>
            </div>
          ))}
        </div>
      </div>

      {/* Horário e Duração - só aparecem se pelo menos um dia foi selecionado */}
      {selectedDays.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="studyStartTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Horário de início</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="time"
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="10:00"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="studyDuration"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Duração (minutos)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="15"
                    max="480"
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="90"
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 60)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* Estudo Recorrente */}
      {selectedDays.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Switch
              id="recurring"
              checked={isRecurring}
              onCheckedChange={handleRecurringToggle}
            />
            <Label htmlFor="recurring" className="text-white">
              Estudo recorrente
            </Label>
          </div>

          {isRecurring && (
            <FormField
              control={form.control}
              name="weeklyFrequency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-white">Frequência por semana</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="1"
                      max="7"
                      className="bg-gray-800 border-gray-600 text-white w-24"
                      placeholder="2"
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 2)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
      )}

      {/* Descrição do Estudo */}
      {selectedDays.length > 0 && (
        <FormField
          control={form.control}
          name="studyDescription"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Descrição opcional</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: Aula da Apollo, Teoria ICM, etc."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}

function CreateStudyCardForm({ onClose, onSubmit }: { onClose: () => void; onSubmit: (data: CreateStudyCardData) => void }) {
  const form = useForm<CreateStudyCardData>({
    resolver: zodResolver(createStudyCardSchema),
    defaultValues: {
      title: "",
      description: "",
      category: "",
      difficulty: "Intermediário",
      estimatedTime: 30,
      priority: "Média",
      objectives: "",
      studyDays: [],
      studyStartTime: "",
      studyDuration: 60,
      isRecurring: false,
      weeklyFrequency: 2,
      studyDescription: "",
    },
  });

  const handleFormSubmit = (data: CreateStudyCardData) => {
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Título do Estudo</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: Defesa contra 3bet"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Categoria</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    {CATEGORIES.map(category => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="difficulty"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Dificuldade</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione a dificuldade" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    <SelectItem value="Iniciante">Iniciante</SelectItem>
                    <SelectItem value="Intermediário">Intermediário</SelectItem>
                    <SelectItem value="Avançado">Avançado</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Prioridade</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione a prioridade" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    <SelectItem value="Baixa">Baixa</SelectItem>
                    <SelectItem value="Média">Média</SelectItem>
                    <SelectItem value="Alta">Alta</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="estimatedTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Tempo estimado (min)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="number"
                    min="1"
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="30"
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Descrição</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva o que você quer estudar..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="objectives"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Objetivos</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Liste seus objetivos de aprendizado..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Seção de Planejamento Semanal */}
        <div className="space-y-4 border-t border-gray-700 pt-4">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Planejamento Semanal (Opcional)
          </h3>

          <WeeklyStudyPlanForm form={form} />
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button type="submit" className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold">
            Criar Estudo
          </Button>
        </div>
      </form>
    </Form>
  );
}

function StudyCardDetail({ card, onClose }: { card: StudyCard; onClose: () => void }) {
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showAddNote, setShowAddNote] = useState(false);

  const { toast } = useToast();

  // Fetch materials, notes, and flash cards for this study card
  const { data: materials = [] } = useQuery<any[]>({
    queryKey: ['/api/study-materials', card.id],
  });

  const { data: notes = [] } = useQuery<any[]>({
    queryKey: ['/api/study-notes', card.id],
  });



  return (
    <div className="space-y-6">
      <DialogHeader>
        <div className="flex items-center justify-between">
          <DialogTitle className="text-white flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-poker-accent" />
            {card.title}
          </DialogTitle>
          <Badge className={`${getPriorityColor(card.priority)} text-white`}>
            {PRIORITIES.find(p => p.value === card.priority)?.label}
          </Badge>
        </div>
        <DialogDescription className="text-gray-400">
          {card.description}
        </DialogDescription>
      </DialogHeader>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-gray-800">
          <TabsTrigger value="overview" className="text-white">Visão Geral</TabsTrigger>
          <TabsTrigger value="materials" className="text-white">Materiais</TabsTrigger>
          <TabsTrigger value="notes" className="text-white">Anotações</TabsTrigger>
          <TabsTrigger value="planning" className="text-white">Planejamento</TabsTrigger>
          <TabsTrigger value="progress" className="text-white">Progresso</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Progresso</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-poker-accent mb-2">
                  {card.knowledgeScore || 0}%
                </div>
                <Progress value={card.knowledgeScore || 0} className="h-2" />
              </CardContent>
            </Card>

            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Tempo Investido</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">
                  {formatTime(card.timeInvested || 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {card.objectives && (
            <Card className="bg-gray-800 border-gray-600">
              <CardHeader>
                <CardTitle className="text-white text-sm">Objetivos</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-300 whitespace-pre-wrap">{card.objectives}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="materials" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Materiais de Estudo</h3>
            <Dialog open={showAddMaterial} onOpenChange={setShowAddMaterial}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Material
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Adicionar Material de Estudo</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Adicione links, arquivos ou aulas para organizar seus materiais de estudo
                  </DialogDescription>
                </DialogHeader>
                <AddMaterialForm studyCardId={card.id} onClose={() => setShowAddMaterial(false)} />
              </DialogContent>
            </Dialog>
          </div>

          {materials.length > 0 ? (
            <div className="space-y-3">
              {materials.map((material: any) => (
                <MaterialCard key={material.id} material={material} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Video className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhum material adicionado ainda</p>
              <p className="text-sm text-gray-500 mt-2">
                Adicione aulas, artigos, vídeos ou arquivos para organizar seus estudos
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">Anotações</h3>
            <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
              <DialogTrigger asChild>
                <Button className="bg-poker-accent hover:bg-poker-accent/90 text-black">
                  <Plus className="w-4 h-4 mr-2" />
                  Nova Anotação
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-900 border-gray-700 max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-white">Nova Anotação</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Crie anotações para registrar insights e descobertas importantes
                  </DialogDescription>
                </DialogHeader>
                <AddNoteForm studyCardId={card.id} onClose={() => setShowAddNote(false)} />
              </DialogContent>
            </Dialog>
          </div>

          {notes.length > 0 ? (
            <div className="space-y-3">
              {notes.map((note: any) => (
                <NoteCard key={note.id} note={note} />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400">Nenhuma anotação criada ainda</p>
              <p className="text-sm text-gray-500 mt-2">
                Registre insights, descobertas e pontos importantes dos seus estudos
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="planning" className="space-y-4">
          <StudyPlanningTab card={card} />
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          <StudyProgressTab card={card} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getPriorityColor(priority: string) {
  const priorityConfig = PRIORITIES.find(p => p.value === priority);
  return priorityConfig?.color || "bg-gray-500";
}

function formatTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Schema for material creation
const createMaterialSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  type: z.enum(["video", "article", "file", "link"]),
  url: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["not_started", "in_progress", "completed"]).default("not_started"),
});

type CreateMaterialData = z.infer<typeof createMaterialSchema>;

function AddMaterialForm({ studyCardId, onClose }: { studyCardId: string; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<CreateMaterialData>({
    resolver: zodResolver(createMaterialSchema),
    defaultValues: {
      title: "",
      type: "video",
      url: "",
      description: "",
      status: "not_started",
    },
  });

  const createMaterialMutation = useMutation({
    mutationFn: async (data: CreateMaterialData) => {
      return await apiRequest('POST', `/api/study-cards/${studyCardId}/materials`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-materials', studyCardId] });
      toast({
        title: "Material adicionado!",
        description: "Material de estudo criado com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating material:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar material. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateMaterialData) => {
    createMaterialMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Título</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    className="bg-gray-800 border-gray-600 text-white"
                    placeholder="Ex: Aula sobre 3bet ranges"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-white">Tipo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent className="bg-poker-surface border-gray-600">
                    <SelectItem value="video">📹 Vídeo/Aula</SelectItem>
                    <SelectItem value="article">📄 Artigo</SelectItem>
                    <SelectItem value="file">📎 Arquivo</SelectItem>
                    <SelectItem value="link">🔗 Link</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="url"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">URL/Link</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="https://..."
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Descrição</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva o conteúdo do material..."
                  rows={3}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            disabled={createMaterialMutation.isPending}
          >
            {createMaterialMutation.isPending ? "Criando..." : "Adicionar Material"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function MaterialCard({ material }: { material: any }) {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case "video": return <Video className="w-5 h-5 text-red-500" />;
      case "article": return <FileText className="w-5 h-5 text-blue-500" />;
      case "file": return <Download className="w-5 h-5 text-green-500" />;
      case "link": return <ExternalLink className="w-5 h-5 text-purple-500" />;
      default: return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle className="w-5 h-5 text-green-500" />;
      case "in_progress": return <Clock className="w-5 h-5 text-yellow-500" />;
      default: return <Circle className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed": return "Concluído";
      case "in_progress": return "Em andamento";
      default: return "Não iniciado";
    }
  };

  return (
    <Card className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getTypeIcon(material.type)}
            <div>
              <h4 className="font-semibold text-white">{material.title}</h4>
              {material.description && (
                <p className="text-sm text-gray-400 mt-1">{material.description}</p>
              )}
              {material.url && (
                <a
                  href={material.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-poker-accent hover:text-poker-accent/80 mt-1 inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3 h-3" />
                  Abrir link
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {getStatusIcon(material.status)}
              <span className="ml-1">{getStatusLabel(material.status)}</span>
            </Badge>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Eye className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Schema for note creation
const createNoteSchema = z.object({
  title: z.string().min(1, "Título é obrigatório"),
  content: z.string().min(1, "Conteúdo é obrigatório"),
  tags: z.string().optional(),
});

type CreateNoteData = z.infer<typeof createNoteSchema>;

function AddNoteForm({ studyCardId, onClose }: { studyCardId: string; onClose: () => void }) {
  const { toast } = useToast();
  const form = useForm<CreateNoteData>({
    resolver: zodResolver(createNoteSchema),
    defaultValues: {
      title: "",
      content: "",
      tags: "",
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: CreateNoteData) => {
      return await apiRequest('POST', `/api/study-cards/${studyCardId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/study-notes', studyCardId] });
      toast({
        title: "Anotação criada!",
        description: "Anotação adicionada com sucesso.",
      });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating note:', error);
      toast({
        title: "Erro",
        description: "Erro ao criar anotação. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: CreateNoteData) => {
    createNoteMutation.mutate(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Título</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: Descobertas sobre 3bet calling ranges"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="content"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Conteúdo</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Descreva suas descobertas, insights e pontos importantes..."
                  rows={8}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-white">Tags (opcional)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Ex: 3bet, ranges, BTN vs BB"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-white border-gray-600">
            Cancelar
          </Button>
          <Button 
            type="submit" 
            className="bg-poker-accent hover:bg-poker-accent/90 text-black font-semibold"
            disabled={createNoteMutation.isPending}
          >
            {createNoteMutation.isPending ? "Criando..." : "Criar Anotação"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function NoteCard({ note }: { note: any }) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Card className="bg-gray-800 border-gray-600 hover:bg-gray-750 transition-colors">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-poker-accent" />
              <h4 className="font-semibold text-white">{note.title}</h4>
            </div>
            <p className="text-gray-300 whitespace-pre-wrap mb-3">{note.content}</p>
            {note.tags && (
              <div className="flex flex-wrap gap-1 mb-2">
                {note.tags.split(',').map((tag: string, index: number) => (
                  <Badge key={index} variant="secondary" className="text-xs bg-gray-700">
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-500">
              {formatDate(note.createdAt)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <Edit className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}