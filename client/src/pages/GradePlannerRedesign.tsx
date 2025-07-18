import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Settings, 
  Trophy, 
  Clock, 
  Users, 
  TrendingUp,
  Target,
  ChevronRight,
  Zap,
  Award,
  BarChart3,
  Calendar
} from "lucide-react";
import { NewTournamentPlanningDialog } from "@/components/NewTournamentPlanningDialog";
import { cn } from "@/lib/utils";

interface PlannedTournament {
  id: string;
  userId: string;
  dayOfWeek: number;
  site: string;
  time: string;
  type: string;
  speed: string;
  name: string;
  buyIn: string;
  guaranteed: string;
  profileType: string;
  prioridade: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface DashboardStats {
  totalTournaments: number;
  totalInvestment: number;
  avgBuyIn: number;
  avgParticipants: number;
  vanilla: number;
  pko: number;
  mystery: number;
  normal: number;
  turbo: number;
  hyper: number;
  totalGrindTime: number;
}

const PROFILE_TYPES = {
  conservative: {
    name: "Conservador",
    color: "blue",
    description: "Foco em torneios de menor risco",
    icon: "🛡️"
  },
  aggressive: {
    name: "Agressivo", 
    color: "red",
    description: "Foco em torneios de maior risco/recompensa",
    icon: "⚡"
  }
};

export default function GradePlannerRedesign() {
  const [activeProfile, setActiveProfile] = useState<'conservative' | 'aggressive'>('conservative');
  const [showNewTournamentDialog, setShowNewTournamentDialog] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch planned tournaments
  const { data: plannedTournaments = [], isLoading: isLoadingTournaments } = useQuery({
    queryKey: ['/api/planned-tournaments'],
    queryFn: () => apiRequest('GET', '/api/planned-tournaments'),
  });

  // Filter tournaments by active profile
  const filteredTournaments = plannedTournaments.filter(
    (tournament: PlannedTournament) => {
      const profileTypeInt = activeProfile === 'conservative' ? 1 : 2;
      return tournament.profileType === profileTypeInt.toString() || tournament.profileType === profileTypeInt;
    }
  );

  // Calculate dashboard stats for active profile
  const dashboardStats: DashboardStats = {
    totalTournaments: filteredTournaments.length,
    totalInvestment: filteredTournaments.reduce((sum: number, t: PlannedTournament) => sum + parseFloat(t.buyIn || '0'), 0),
    avgBuyIn: filteredTournaments.length > 0 ? filteredTournaments.reduce((sum: number, t: PlannedTournament) => sum + parseFloat(t.buyIn || '0'), 0) / filteredTournaments.length : 0,
    avgParticipants: filteredTournaments.length > 0 ? filteredTournaments.reduce((sum: number, t: PlannedTournament) => sum + parseFloat(t.guaranteed || '0'), 0) / filteredTournaments.length : 0,
    vanilla: filteredTournaments.filter((t: PlannedTournament) => t.type === 'Vanilla').length,
    pko: filteredTournaments.filter((t: PlannedTournament) => t.type === 'PKO').length,
    mystery: filteredTournaments.filter((t: PlannedTournament) => t.type === 'Mystery').length,
    normal: filteredTournaments.filter((t: PlannedTournament) => t.speed === 'Normal').length,
    turbo: filteredTournaments.filter((t: PlannedTournament) => t.speed === 'Turbo').length,
    hyper: filteredTournaments.filter((t: PlannedTournament) => t.speed === 'Hyper').length,
    totalGrindTime: 0 // Placeholder for now
  };

  // Group tournaments by day
  const tournamentsByDay = Array.from({ length: 7 }, (_, dayIndex) => {
    const dayTournaments = filteredTournaments.filter((t: PlannedTournament) => t.dayOfWeek === dayIndex);
    return {
      day: dayIndex,
      dayName: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][dayIndex],
      dayAbbr: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dayIndex],
      tournaments: dayTournaments
    };
  });

  // Handle tournament deletion
  const deleteTournamentMutation = useMutation({
    mutationFn: (tournamentId: string) => apiRequest('DELETE', `/api/planned-tournaments/${tournamentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/planned-tournaments'] });
      toast({
        title: "Torneio removido",
        description: "O torneio foi removido com sucesso.",
      });
    },
    onError: (error) => {
      console.error('Error deleting tournament:', error);
      toast({
        title: "Erro ao remover torneio",
        description: "Ocorreu um erro ao remover o torneio.",
        variant: "destructive",
      });
    }
  });

  const handleAddTournament = (dayOfWeek: number) => {
    setSelectedDay(dayOfWeek);
    setShowNewTournamentDialog(true);
  };

  const handleDeleteTournament = (tournamentId: string) => {
    deleteTournamentMutation.mutate(tournamentId);
  };

  const getSiteColor = (site: string) => {
    const colors: { [key: string]: string } = {
      'PokerStars': 'bg-red-100 text-red-800',
      'GGPoker': 'bg-orange-100 text-orange-800',
      'PartyPoker': 'bg-purple-100 text-purple-800',
      'WPN': 'bg-blue-100 text-blue-800',
      'CoinPoker': 'bg-green-100 text-green-800',
      'Chico': 'bg-yellow-100 text-yellow-800',
      'Bodog': 'bg-pink-100 text-pink-800',
      '888poker': 'bg-indigo-100 text-indigo-800',
    };
    return colors[site] || 'bg-gray-100 text-gray-800';
  };

  const getTypeColor = (type: string) => {
    const colors: { [key: string]: string } = {
      'Vanilla': 'bg-blue-100 text-blue-800',
      'PKO': 'bg-orange-100 text-orange-800',
      'Mystery': 'bg-purple-100 text-purple-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getSpeedColor = (speed: string) => {
    const colors: { [key: string]: string } = {
      'Normal': 'bg-green-100 text-green-800',
      'Turbo': 'bg-yellow-100 text-yellow-800',
      'Hyper': 'bg-red-100 text-red-800',
    };
    return colors[speed] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-poker-bg to-gray-900 p-4">
      <div className="max-w-[1800px] mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Planejamento de Grade
              </h1>
              <p className="text-gray-400">
                Organize seus torneios por perfil de jogo
              </p>
            </div>
            <Button 
              onClick={() => setShowNewTournamentDialog(true)}
              className="bg-poker-red hover:bg-poker-red/90 text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Novo Torneio
            </Button>
          </div>
        </div>

        {/* Profile Selection */}
        <div className="mb-8">
          <div className="flex gap-4">
            {Object.entries(PROFILE_TYPES).map(([key, profile]) => (
              <button
                key={key}
                onClick={() => setActiveProfile(key as 'conservative' | 'aggressive')}
                className={cn(
                  "flex items-center gap-3 px-6 py-4 rounded-xl transition-all duration-200",
                  "border-2 min-w-[200px]",
                  activeProfile === key 
                    ? "border-poker-red bg-poker-red/10 text-white" 
                    : "border-gray-600 bg-gray-800 text-gray-400 hover:border-gray-500"
                )}
              >
                <span className="text-2xl">{profile.icon}</span>
                <div className="text-left">
                  <div className="font-semibold">{profile.name}</div>
                  <div className="text-sm opacity-75">{profile.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Dashboard Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">
                Total de Torneios
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {dashboardStats.totalTournaments}
              </div>
              <div className="text-sm text-gray-500">
                Perfil {PROFILE_TYPES[activeProfile].name}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">
                Investimento Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                ${dashboardStats.totalInvestment.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500">
                ABI: ${dashboardStats.avgBuyIn.toFixed(2)}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">
                Distribuição de Tipos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Badge className="bg-blue-100 text-blue-800">
                  V: {dashboardStats.vanilla}
                </Badge>
                <Badge className="bg-orange-100 text-orange-800">
                  PKO: {dashboardStats.pko}
                </Badge>
                <Badge className="bg-purple-100 text-purple-800">
                  M: {dashboardStats.mystery}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gray-800 border-gray-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-gray-400">
                Distribuição de Velocidade
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                <Badge className="bg-green-100 text-green-800">
                  N: {dashboardStats.normal}
                </Badge>
                <Badge className="bg-yellow-100 text-yellow-800">
                  T: {dashboardStats.turbo}
                </Badge>
                <Badge className="bg-red-100 text-red-800">
                  H: {dashboardStats.hyper}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weekly Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
          {tournamentsByDay.map((dayData) => (
            <Card key={dayData.day} className="bg-gray-800 border-gray-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-white flex items-center justify-between">
                  <span>{dayData.dayName}</span>
                  <Badge variant="outline" className="text-xs">
                    {dayData.tournaments.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {dayData.tournaments.map((tournament) => (
                      <div
                        key={tournament.id}
                        className="p-3 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <Badge className={cn("text-xs", getSiteColor(tournament.site))}>
                            {tournament.site}
                          </Badge>
                          <span className="text-xs text-gray-400">
                            {tournament.time}
                          </span>
                        </div>
                        
                        <div className="flex gap-1 mb-2">
                          <Badge className={cn("text-xs", getTypeColor(tournament.type))}>
                            {tournament.type}
                          </Badge>
                          <Badge className={cn("text-xs", getSpeedColor(tournament.speed))}>
                            {tournament.speed}
                          </Badge>
                        </div>
                        
                        <div className="text-sm text-white font-medium">
                          ${tournament.buyIn}
                        </div>
                        
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-400">
                            GTD: ${tournament.guaranteed}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteTournament(tournament.id)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    ))}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAddTournament(dayData.day)}
                      className="w-full mt-2 border-gray-600 text-gray-400 hover:text-white hover:bg-gray-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </Button>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add Tournament Dialog */}
        <NewTournamentPlanningDialog
          isOpen={showNewTournamentDialog}
          onClose={() => {
            setShowNewTournamentDialog(false);
            setSelectedDay(null);
          }}
          dayOfWeek={selectedDay}
          profileType={activeProfile}
        />
      </div>
    </div>
  );
}