import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Calendar, 
  Clock, 
  Plus, 
  BarChart3, 
  BookOpen, 
  Coffee, 
  User, 
  Settings,
  ChevronLeft,
  ChevronRight,
  Play,
  Zap,
  Users,
  TrendingUp,
  Edit,
  Trash2,
  Move,
  RefreshCw
} from "lucide-react";
import { format, startOfWeek, endOfWeek, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CalendarBlock {
  id: string;
  title: string;
  description?: string;
  type: 'grind' | 'study' | 'warmup' | 'personal' | 'commitment';
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  duration: number;
  color: string;
  icon: string;
  priority: number;
  tags: string[];
  isRecurring: boolean;
  isFixed: boolean;
  relatedId?: string;
  relatedType?: string;
}

interface WeeklyCalendar {
  id: string;
  title: string;
  description?: string;
  weekStart: Date;
  weekEnd: Date;
  blocks: CalendarBlock[];
}

const weekDays = [
  { id: 1, name: 'Segunda', short: 'Seg' },
  { id: 2, name: 'Terça', short: 'Ter' },
  { id: 3, name: 'Quarta', short: 'Qua' },
  { id: 4, name: 'Quinta', short: 'Qui' },
  { id: 5, name: 'Sexta', short: 'Sex' },
  { id: 6, name: 'Sábado', short: 'Sáb' },
  { id: 7, name: 'Domingo', short: 'Dom' }
];

const blockTypes = {
  grind: { 
    color: '#10b981', 
    icon: '🎯', 
    label: 'Grind' 
  },
  study: { 
    color: '#3b82f6', 
    icon: '📚', 
    label: 'Estudo' 
  },
  warmup: { 
    color: '#f59e0b', 
    icon: '🧘', 
    label: 'Warm-up' 
  },
  personal: { 
    color: '#8b5cf6', 
    icon: '🏠', 
    label: 'Pessoal' 
  },
  commitment: { 
    color: '#ef4444', 
    icon: '📅', 
    label: 'Compromisso' 
  }
};

export default function Calendario() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Calcular início e fim da semana
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Segunda-feira
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 }); // Domingo

  // Buscar calendário da semana atual
  const { data: currentCalendar, isLoading } = useQuery({
    queryKey: ['/api/calendar', format(weekStart, 'yyyy-MM-dd')],
    queryFn: async () => {
      const response = await apiRequest(`/api/calendar?weekStart=${format(weekStart, 'yyyy-MM-dd')}`);
      return response;
    },
    enabled: !!user,
  });

  // Buscar torneios planejados
  const { data: plannedTournaments } = useQuery({
    queryKey: ['/api/planned-tournaments'],
    enabled: !!user,
  });

  // Buscar study cards
  const { data: studyCards } = useQuery({
    queryKey: ['/api/study-cards'],
    enabled: !!user,
  });

  // Buscar compromissos do usuário
  const { data: userCommitments } = useQuery({
    queryKey: ['/api/user-commitments'],
    enabled: !!user,
  });

  // Mutação para gerar semana automaticamente
  const generateWeekMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/calendar/generate`, {
        method: 'POST',
        body: JSON.stringify({
          weekStart: format(weekStart, 'yyyy-MM-dd'),
          weekEnd: format(weekEnd, 'yyyy-MM-dd'),
        }),
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar'] });
      toast({
        title: "Semana gerada com sucesso!",
        description: "Sua agenda foi criada automaticamente com base nos dados da Grade e Estudos.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar semana",
        description: error.message || "Tente novamente mais tarde",
        variant: "destructive",
      });
    },
  });

  // Função para gerar semana
  const handleGenerateWeek = async () => {
    setIsGenerating(true);
    try {
      await generateWeekMutation.mutateAsync();
    } finally {
      setIsGenerating(false);
    }
  };

  // Calcular estatísticas da semana
  const calculateWeekStats = () => {
    if (!currentCalendar?.blocks) return {
      totalGrindHours: 0,
      totalStudyHours: 0,
      totalFreeHours: 0,
      blocksByType: {}
    };

    const blocks = currentCalendar.blocks;
    const stats = {
      totalGrindHours: 0,
      totalStudyHours: 0,
      totalFreeHours: 0,
      blocksByType: {} as Record<string, number>
    };

    blocks.forEach((block: CalendarBlock) => {
      const hours = block.duration / 60;
      
      if (block.type === 'grind') {
        stats.totalGrindHours += hours;
      } else if (block.type === 'study') {
        stats.totalStudyHours += hours;
      }

      stats.blocksByType[block.type] = (stats.blocksByType[block.type] || 0) + hours;
    });

    // Calcular horas livres (assumindo 16 horas úteis por dia)
    const totalPlannedHours = Object.values(stats.blocksByType).reduce((sum, hours) => sum + hours, 0);
    stats.totalFreeHours = Math.max(0, (16 * 7) - totalPlannedHours);

    return stats;
  };

  // Renderizar bloco no calendário
  const renderBlock = (block: CalendarBlock) => {
    const typeConfig = blockTypes[block.type];
    const startHour = parseInt(block.startTime.split(':')[0]);
    const startMinute = parseInt(block.startTime.split(':')[1]);
    const durationHours = block.duration / 60;
    
    // Calcular posição (assumindo grid de 24 horas)
    const topPosition = (startHour + startMinute / 60) * 60; // 60px por hora
    const height = durationHours * 60; // 60px por hora

    return (
      <div
        key={block.id}
        className="absolute left-1 right-1 rounded-lg border border-gray-600 cursor-pointer hover:shadow-lg transition-all duration-200"
        style={{
          backgroundColor: `${typeConfig.color}20`,
          borderColor: typeConfig.color,
          top: `${topPosition}px`,
          height: `${height}px`,
          minHeight: '30px'
        }}
        onClick={() => {
          setSelectedBlock(block);
          setIsDialogOpen(true);
        }}
      >
        <div className="p-2 h-full flex flex-col">
          <div className="flex items-center gap-1 text-xs font-medium text-white">
            <span>{typeConfig.icon}</span>
            <span className="truncate">{block.title}</span>
          </div>
          <div className="text-xs text-gray-300 mt-1">
            {block.startTime} - {block.endTime}
          </div>
          {block.description && (
            <div className="text-xs text-gray-400 mt-1 truncate">
              {block.description}
            </div>
          )}
        </div>
      </div>
    );
  };

  const weekStats = calculateWeekStats();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-poker-bg p-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-poker-green mx-auto mb-4"></div>
            <p className="text-gray-400">Carregando calendário...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-poker-bg p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Calendário Semanal</h1>
            <p className="text-gray-400">
              Semana de {format(weekStart, 'dd/MM', { locale: ptBR })} a {format(weekEnd, 'dd/MM/yyyy', { locale: ptBR })}
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Navegação de semana */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeek(prev => addDays(prev, -7))}
                className="border-gray-600 hover:bg-gray-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeek(new Date())}
                className="border-gray-600 hover:bg-gray-800"
              >
                Hoje
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentWeek(prev => addDays(prev, 7))}
                className="border-gray-600 hover:bg-gray-800"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Botão Gerar Semana */}
            <Button
              onClick={handleGenerateWeek}
              disabled={isGenerating}
              className="bg-poker-green hover:bg-poker-green/90 text-white"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Gerar Semana
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Dashboard de Resumo */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-poker-green" />
                Horas de Grind
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-poker-green">
                {weekStats.totalGrindHours.toFixed(1)}h
              </div>
              <p className="text-xs text-gray-400">Planejadas para a semana</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-blue-400" />
                Horas de Estudo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-400">
                {weekStats.totalStudyHours.toFixed(1)}h
              </div>
              <p className="text-xs text-gray-400">Distribuídas na semana</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-400" />
                Tempo Livre
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-400">
                {weekStats.totalFreeHours.toFixed(1)}h
              </div>
              <p className="text-xs text-gray-400">Disponível para outras atividades</p>
            </CardContent>
          </Card>

          <Card className="bg-poker-surface border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-white flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-purple-400" />
                Distribuição
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {Object.entries(weekStats.blocksByType).map(([type, hours]) => (
                  <div key={type} className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 capitalize">{blockTypes[type as keyof typeof blockTypes]?.label}</span>
                    <span className="text-white font-medium">{hours.toFixed(1)}h</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Calendário Semanal */}
        <Card className="bg-poker-surface border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-poker-green" />
              Agenda Semanal
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!currentCalendar ? (
              <div className="text-center py-12">
                <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-600" />
                <h3 className="text-xl font-semibold text-white mb-2">Nenhuma agenda criada</h3>
                <p className="text-gray-400 mb-6">
                  Gere automaticamente sua semana com base nos dados da Grade e Estudos
                </p>
                <Button onClick={handleGenerateWeek} className="bg-poker-green hover:bg-poker-green/90">
                  <Play className="h-4 w-4 mr-2" />
                  Gerar Primeira Semana
                </Button>
              </div>
            ) : (
              <div className="relative">
                {/* Grid do calendário */}
                <div className="grid grid-cols-8 gap-1 min-h-[600px]">
                  {/* Coluna de horas */}
                  <div className="border-r border-gray-600">
                    <div className="h-12 border-b border-gray-600 flex items-center justify-center text-xs font-medium text-gray-400">
                      Hora
                    </div>
                    {Array.from({ length: 24 }, (_, i) => (
                      <div key={i} className="h-[60px] border-b border-gray-700 flex items-center justify-center text-xs text-gray-500">
                        {i.toString().padStart(2, '0')}:00
                      </div>
                    ))}
                  </div>

                  {/* Colunas dos dias da semana */}
                  {weekDays.map((day) => (
                    <div key={day.id} className="border-r border-gray-600 relative">
                      {/* Header do dia */}
                      <div className="h-12 border-b border-gray-600 flex items-center justify-center">
                        <div className="text-center">
                          <div className="text-xs font-medium text-white">{day.short}</div>
                          <div className="text-xs text-gray-400">
                            {format(addDays(weekStart, day.id - 1), 'dd/MM')}
                          </div>
                        </div>
                      </div>

                      {/* Grid de horas */}
                      <div className="relative">
                        {Array.from({ length: 24 }, (_, i) => (
                          <div key={i} className="h-[60px] border-b border-gray-700" />
                        ))}

                        {/* Renderizar blocos do dia */}
                        {currentCalendar.blocks
                          ?.filter((block: CalendarBlock) => block.dayOfWeek === day.id)
                          .map((block: CalendarBlock) => renderBlock(block))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog para editar bloco */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="bg-poker-surface border-gray-700 max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Detalhes do Bloco</DialogTitle>
            </DialogHeader>
            
            {selectedBlock && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{blockTypes[selectedBlock.type].icon}</span>
                  <div>
                    <h3 className="font-semibold text-white">{selectedBlock.title}</h3>
                    <p className="text-sm text-gray-400">{blockTypes[selectedBlock.type].label}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Horário</div>
                    <div className="text-white">{selectedBlock.startTime} - {selectedBlock.endTime}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Duração</div>
                    <div className="text-white">{(selectedBlock.duration / 60).toFixed(1)}h</div>
                  </div>
                </div>

                {selectedBlock.description && (
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Descrição</div>
                    <div className="text-white text-sm">{selectedBlock.description}</div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="border-gray-600 hover:bg-gray-800">
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button variant="outline" size="sm" className="border-gray-600 hover:bg-gray-800">
                    <Move className="h-4 w-4 mr-2" />
                    Mover
                  </Button>
                  <Button variant="outline" size="sm" className="border-red-600 hover:bg-red-900/20 text-red-400">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Excluir
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}