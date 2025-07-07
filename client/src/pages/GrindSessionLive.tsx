import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Play, Plus, Clock, DollarSign, Trophy, Target, Coffee, SkipForward, X, ChevronDown, ChevronUp, UserPlus, Award, Coins, Edit, XCircle, Undo2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GrindSession {
  id: string;
  userId: string;
  date: string;
  status: string;
  preparationNotes?: string;
  dailyGoals?: string;
  skipBreaksToday: boolean;
}

interface SessionTournament {
  id: string;
  sessionId: string;
  site: string;
  name?: string;
  buyIn: string;
  rebuys: number;
  result: string;
  position?: number;
  fieldSize?: number;
  status: string;
  fromPlannedTournament: boolean;
}

interface BreakFeedback {
  id: string;
  sessionId: string;
  breakTime: string;
  foco: number;
  energia: number;
  confianca: number;
  inteligenciaEmocional: number;
  interferencias: number;
  notes?: string;
}

// Helper functions for tournament categorization and colors
const getSiteColor = (site: string): string => {
  const colors: { [key: string]: string } = {
    'PokerStars': 'bg-red-600',
    'GGPoker': 'bg-orange-600',
    'GGNetwork': 'bg-orange-600',
    'PartyPoker': 'bg-pink-600',
    '888poker': 'bg-blue-600',
    'WPN': 'bg-purple-600',
    'Chico': 'bg-yellow-600',
    'iPoker': 'bg-green-600',
    'Bodog': 'bg-indigo-600',
    'CoinPoker': 'bg-amber-600',
    'Revolution': 'bg-teal-600'
  };
  return colors[site] || 'bg-gray-600';
};

const getCategoryColor = (category: string): string => {
  const colors: { [key: string]: string } = {
    'Vanilla': 'bg-blue-600',
    'PKO': 'bg-red-600',
    'Mystery': 'bg-purple-600'
  };
  return colors[category] || 'bg-gray-600';
};

const getSpeedColor = (speed: string): string => {
  const colors: { [key: string]: string } = {
    'Normal': 'bg-green-600',
    'Turbo': 'bg-yellow-600',
    'Hyper': 'bg-red-600'
  };
  return colors[speed] || 'bg-gray-600';
};

const generateTournamentName = (tournament: any): string => {
  if (tournament.name && tournament.name.trim()) {
    return tournament.name;
  }

  const guaranteed = tournament.guaranteed ? ` $${tournament.guaranteed}` : '';
  return `${tournament.type || tournament.category || 'Vanilla'} $${tournament.buyIn}${guaranteed} ${tournament.site}`;
};

export default function GrindSessionLive() {
  const [activeSession, setActiveSession] = useState<GrindSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [showAddTournamentDialog, setShowAddTournamentDialog] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showCompletedTournaments, setShowCompletedTournaments] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState(50);
  const [preparationObservations, setPreparationObservations] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");

  // Tournament states and dialogs
  const [registrationDialogs, setRegistrationDialogs] = useState<{[key: string]: boolean}>({});
  const [editDialogs, setEditDialogs] = useState<{[key: string]: boolean}>({});
  const [registrationData, setRegistrationData] = useState<{[key: string]: {prizeItm: string, bounty: string, position: string}}>({});
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [newTournament, setNewTournament] = useState({
    site: "",
    name: "",
    buyIn: "",
    type: "Vanilla",
    speed: "Normal",
    scheduledTime: "",
    fieldSize: "",
    rebuys: 0,
    result: "0",
    position: null,
    status: "upcoming"
  });

  // Break feedback form
  const [breakFeedback, setBreakFeedback] = useState({
    foco: 5,
    energia: 5,
    confianca: 5,
    inteligenciaEmocional: 5,
    interferencias: 5,
    notes: ""
  });



  const [showBreakManagementDialog, setShowBreakManagementDialog] = useState(false);
  const [sessionElapsedTime, setSessionElapsedTime] = useState("");
  const [showEditTournamentDialog, setShowEditTournamentDialog] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Timer for session elapsed time
  useEffect(() => {
    if (activeSession) {
      const updateElapsedTime = () => {
        const sessionStart = new Date(activeSession.date);
        const now = new Date();
        const diffMs = now.getTime() - sessionStart.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setSessionElapsedTime(`${hours}h ${minutes}m`);
      };

      updateElapsedTime();
      const interval = setInterval(updateElapsedTime, 60000); // Update every minute
      return () => clearInterval(interval);
    }
  }, [activeSession]);

  // Get current day of week (0 = Sunday, 1 = Monday, etc.)
  const currentDayOfWeek = new Date().getDay();

  // Fetch active session
  const { data: sessions } = useQuery({
    queryKey: ["/api/grind-sessions"],
    queryFn: async () => {
      const response = await fetch("/api/grind-sessions", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch sessions");
      return response.json();
    },
  });

  // Fetch planned tournaments for today
  const { data: plannedTournaments, refetch: refetchTournaments } = useQuery({
    queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek],
    queryFn: async () => {
      const response = await fetch(`/api/session-tournaments/by-day/${currentDayOfWeek}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch planned tournaments");
      const data = await response.json();
      console.log('Fresh tournament data from API:', data);
      return data;
    },
    staleTime: 0, // Always fetch fresh data
    cacheTime: 0, // Don't cache at all
  });

  // Fetch session tournaments
  const { data: sessionTournaments } = useQuery({
    queryKey: ["/api/session-tournaments", activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const response = await fetch(`/api/session-tournaments?sessionId=${activeSession.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch session tournaments");
      return response.json();
    },
    enabled: !!activeSession?.id,
  });

  // Check for active session on load
  useEffect(() => {
    if (sessions) {
      const todaySession = sessions.find((s: GrindSession) => 
        s.status === "active" && 
        new Date(s.date).toDateString() === new Date().toDateString()
      );
      setActiveSession(todaySession || null);
    }
  }, [sessions]);

  // Break timer simulation - show dialog every hour (for demo: every 5 seconds)
  useEffect(() => {
    if (activeSession && !activeSession.skipBreaksToday) {
      const timer = setInterval(() => {
        // Check if it's 14:55 or 15:55 (or every hour for demo)
        const now = new Date();
        const minutes = now.getMinutes();
        const hours = now.getHours();

        // Show break dialog at xx:55 (5 minutes before the hour)
        if (minutes === 55) {
          setShowBreakDialog(true);
        }
      }, 60000); // Check every minute

      return () => clearInterval(timer);
    }
  }, [activeSession]);

  // Start session mutation
  const startSessionMutation = useMutation({
    mutationFn: async (data: { preparationNotes: string; dailyGoals: string }) => {
      const sessionData = {
        date: new Date().toISOString(),
        status: "active",
        preparationNotes: data.preparationNotes,
        dailyGoals: data.dailyGoals,
        skipBreaksToday: false,
      };
      const response = await apiRequest("POST", "/api/grind-sessions", sessionData);
      return response.json();
    },
    onSuccess: (session) => {
      setActiveSession(session);
      setShowStartDialog(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      toast({
        title: "Sessão Iniciada",
        description: "Sua sessão de grind foi iniciada com sucesso!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add tournament mutation
  const addTournamentMutation = useMutation({
    mutationFn: async (tournamentData: any) => {
      const data = {
        site: tournamentData.site,
        name: tournamentData.name || `${tournamentData.site} ${tournamentData.type}`,
        buyIn: tournamentData.buyIn,
        rebuys: 0,
        result: "0",
        status: "upcoming",
        sessionId: activeSession?.id,
        fromPlannedTournament: false,
        fieldSize: null,
        position: null,
        startTime: null,
        endTime: null,
        time: tournamentData.scheduledTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        type: tournamentData.type,
        speed: tournamentData.speed,
        guaranteed: tournamentData.guaranteed
      };
      const response = await apiRequest("POST", "/api/session-tournaments", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      setShowAddTournamentDialog(false);
      setNewTournament({
        site: "",
        name: "",
        buyIn: "",
        type: "Vanilla",
        speed: "Normal",
        scheduledTime: "",
        fieldSize: "",
        rebuys: 0,
        result: "0",
        position: null,
        status: "upcoming"
      });
      toast({
        title: "Torneio Adicionado",
        description: "Torneio adicionado à sessão com sucesso!",
      });
    },
  });

  // Update tournament mutation
  const updateTournamentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      console.log('Update mutation called with:', { id, data });
      
      // Determine endpoint based on ID prefix
      let endpoint;
      let apiId;
      
      if (id.startsWith('planned-')) {
        // For planned tournaments, use the actual ID without prefix
        apiId = id.substring(8);
        endpoint = `/api/planned-tournaments/${apiId}`;
      } else {
        // For session tournaments, use the ID as-is
        apiId = id;
        endpoint = `/api/session-tournaments/${apiId}`;
      }

      console.log('Making API call to:', endpoint, 'with data:', data);
      const response = await apiRequest("PUT", endpoint, data);
      const result = await response.json();
      console.log('API response:', result);
      return result;
    },
    onSuccess: (result, variables) => {
      console.log('Update successful:', result);
      
      // Force immediate UI update with refetch
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      
      // Force refresh the current day data immediately
      const currentDayOfWeek = new Date().getDay();
      queryClient.removeQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      
      // Force immediate refetch
      setTimeout(() => {
        refetchTournaments();
      }, 100);
      
      toast({
        title: "Torneio Atualizado",
        description: "Status do torneio atualizado com sucesso!",
      });
    },
    onError: (error) => {
      console.error('Update failed:', error);
      toast({
        title: "Erro",
        description: "Falha ao atualizar torneio",
        variant: "destructive"
      });
    },
  });

  // Break feedback mutation
  const breakFeedbackMutation = useMutation({
    mutationFn: async (feedback: any) => {
      const data = {
        ...feedback,
        sessionId: activeSession?.id,
        breakTime: new Date().toISOString(),
      };
      const response = await apiRequest("POST", "/api/break-feedbacks", data);
      return response.json();
    },
    onSuccess: () => {
      setShowBreakDialog(false);
      setBreakFeedback({
        foco: 5,
        energia: 5,
        confianca: 5,
        inteligenciaEmocional: 5,
        interferencias: 5,
        notes: ""
      });
      toast({
        title: "Feedback Registrado",
        description: "Seu feedback do break foi registrado!",
      });
    },
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", `/api/grind-sessions/${activeSession?.id}`, {
        status: "completed",
        endTime: new Date().toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      // Don't show report on session start - only on session end
      setShowDailyReport(false);
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
    },
  });

  const handleStartSession = async () => {
    // Reset all tournaments to 'upcoming' status before starting session
    if (plannedTournaments) {
      const resetPromises = plannedTournaments.map(tournament => 
        updateTournamentMutation.mutateAsync({
          id: tournament.id.replace('planned-', ''),
          data: { 
            status: 'upcoming',
            result: '0',
            bounty: '0',
            position: null,
            rebuys: 0,
            startTime: null,
            endTime: null
          }
        })
      );
      
      try {
        await Promise.all(resetPromises);
      } catch (error) {
        console.error('Error resetting tournaments:', error);
      }
    }
    
    const combinedPreparationNotes = `${preparationPercentage}% - ${preparationObservations}`;
    startSessionMutation.mutate({
      preparationNotes: combinedPreparationNotes,
      dailyGoals,
    });
  };

  const handleUpdateTournament = (tournament: any, field: string, value: any) => {
    console.log('Update mutation called with:', { id: tournament.id, data: { [field]: value } });
    
    // Handle rebuys increment correctly
    if (field === 'rebuys') {
      value = (tournament.rebuys || 0) + 1;
    }
    
    updateTournamentMutation.mutate({
      id: tournament.id,
      data: { [field]: value },
    });
  };

  const handleRebuyTournament = (tournament: any) => {
    const newRebuys = (tournament.rebuys || 0) + 1;
    console.log('Rebuy tournament:', tournament.id, 'New rebuys:', newRebuys);
    
    updateTournamentMutation.mutate({
      id: tournament.id,
      data: { rebuys: newRebuys }
    });
  };

  // Functions to organize tournaments by status
  const organizeTournaments = (tournaments: any[] = []) => {
    const upcoming = tournaments.filter(t => 
      t.status === 'upcoming' || (!t.status && t.time)
    );

    const registered = tournaments.filter(t => 
      t.status === 'registered'
    );

    const completed = tournaments.filter(t => 
      t.status === 'completed' || t.status === 'finished'
    );

    return { registered, upcoming, completed };
  };

  const parseTime = (timeStr: string): number => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
  };

  const formatTime = (timeStr: string): string => {
    return timeStr;
  };

  const postponeTournament = (tournamentId: string, minutes: number) => {
    const tournament = plannedTournaments?.find((t: any) => t.id === tournamentId);
    if (tournament) {
      const [hours, mins] = tournament.time.split(':').map(Number);
      const totalMinutes = hours * 60 + mins + minutes;
      const newHours = Math.floor(totalMinutes / 60) % 24;
      const newMins = totalMinutes % 60;
      const newTime = `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}`;

      updateTournamentMutation.mutate({
        id: tournamentId,
        data: { time: newTime }
      });
    }
  };

  const handleRegisterTournament = (tournamentId: string) => {
    console.log('Registering tournament:', tournamentId);
    
    // Extract the actual ID if it's a planned tournament
    const actualId = tournamentId.startsWith('planned-') ? tournamentId.substring(8) : tournamentId;
    console.log('Actual tournament ID:', actualId);
    
    updateTournamentMutation.mutate({
      id: tournamentId, // Use the full ID to determine the endpoint
      data: { 
        status: 'registered',
        startTime: new Date().toISOString()
      }
    });
  };

  const handleUnregisterTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { status: 'upcoming' }
    });
  };

  const handleCompleteTournament = (tournamentId: string, data: any) => {
    const updateData = {
      status: 'finished',
      result: data.prizeItm || '0',  // Prize ITM
      bounty: data.bounty || '0',    // Bounty field
      position: data.position ? parseInt(data.position) : null,
      endTime: new Date().toISOString()
    };

    updateTournamentMutation.mutate({
      id: tournamentId,
      data: updateData
    });

    // Clear registration data for this tournament
    setRegistrationData(prev => {
      const updated = { ...prev };
      delete updated[tournamentId];
      return updated;
    });
  };

  const handleFoldTournament = (tournamentId: string) => {
    updateTournamentMutation.mutate({
      id: tournamentId,
      data: { status: 'folded' }
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "registered":
        return <Badge className="bg-blue-600">Registrado</Badge>;
      case "active":
        return <Badge className="bg-green-600">Ativo</Badge>;
      case "finished":
        return <Badge className="bg-gray-600">Finalizado</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getSiteColor = (site: string): string => {
    switch (site.toLowerCase()) {
      case 'pokerstars':
        return 'bg-red-600';
      case 'partypoker':
        return 'bg-orange-500';
      case '888poker':
        return 'bg-blue-600';
      case 'ggnetwork':
      case 'ggpoker':
        return 'bg-red-800';
      case 'wpn':
        return 'bg-green-800';
      case 'ipoker':
        return 'bg-orange-600';
      case 'coinpoker':
        return 'bg-pink-500';
      case 'chico':
        return 'bg-white text-black';
      case 'revolution':
        return 'bg-pink-800';
      case 'bodog':
        return 'bg-red-400';
      default:
        return 'bg-gray-600';
    }
  };

  const calculateSessionStats = () => {
    if (!plannedTournaments) return { 
      registros: 0, 
      reentradas: 0, 
      proximos: 0, 
      totalInvestido: 0, 
      profit: 0, 
      itm: 0, 
      itmPercent: 0, 
      roi: 0, 
      fts: 0, 
      cravadas: 0, 
      progressao: 0 
    };
    
    const allTournaments = plannedTournaments || [];
    const finishedTournaments = allTournaments.filter((t: any) => t.status === "finished");
    const registeredTournaments = allTournaments.filter((t: any) => t.status === "registered");
    const upcomingTournaments = allTournaments.filter((t: any) => t.status === "upcoming");
    
    const registros = registeredTournaments.length + finishedTournaments.length;
    const reentradas = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
      const rebuys = parseInt(t.rebuys) || 0;
      console.log('Tournament', t.id, 'rebuys:', rebuys);
      return sum + rebuys;
    }, 0);
    const proximos = upcomingTournaments.length;
    
    // Calcular total investido considerando rebuys
    const totalInvestido = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
      const buyIn = parseFloat(t.buyIn || '0');
      const rebuys = parseInt(t.rebuys) || 0;
      const invested = buyIn * (1 + rebuys);
      console.log('Tournament', t.id, 'buyIn:', buyIn, 'rebuys:', rebuys, 'invested:', invested);
      return sum + invested;
    }, 0);
    
    // Calcular profit: (Bounties + Prizes) - Total Investido
    const totalBounties = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => 
      sum + parseFloat(t.bounty || '0'), 0
    );
    const totalPrizes = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => 
      sum + parseFloat(t.result || '0'), 0
    );
    const investidoFinalizados = [...registeredTournaments, ...finishedTournaments].reduce((sum: number, t: any) => {
      const buyIn = parseFloat(t.buyIn || '0');
      const rebuys = t.rebuys || 0;
      return sum + (buyIn * (1 + rebuys));
    }, 0);
    const profit = (totalBounties + totalPrizes) - investidoFinalizados;
    
    // ITM deve considerar torneios com campo "Prize" (result) registrado > 0
    const itm = [...registeredTournaments, ...finishedTournaments].filter((t: any) => parseFloat(t.result || '0') > 0).length;
    const itmPercent = registros > 0 ? (itm / registros) * 100 : 0;
    const roi = investidoFinalizados > 0 ? (profit / investidoFinalizados) * 100 : 0;
    const fts = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
      const pos = parseInt(String(t.position)) || 0;
      return pos <= 9 && pos > 0;
    }).length;
    const cravadas = [...registeredTournaments, ...finishedTournaments].filter((t: any) => {
      const pos = parseInt(String(t.position)) || 0;
      return pos === 1;
    }).length;
    const progressao = allTournaments.length > 0 ? ((registros / allTournaments.length) * 100) : 0;

    return { 
      registros, 
      reentradas, 
      proximos, 
      totalInvestido, 
      profit, 
      itm, 
      itmPercent, 
      roi, 
      fts, 
      cravadas, 
      progressao 
    };
  };

  // Helper functions for tournament management
  // parseTime function already defined above

  // formatTime function already defined above

  const isBreakTime = (currentMinutes: number) => {
    // Break times: 14:55, 15:55, etc. (every hour at :55)
    return currentMinutes % 60 === 55 && (currentMinutes >= 14 * 60 + 55);
  };

  const getNextBreakTime = (currentMinutes: number) => {
    const nextBreakMinutes = Math.ceil(currentMinutes / 60) * 60 + 55;
    const hours = Math.floor(nextBreakMinutes / 60);
    const minutes = nextBreakMinutes % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  };

  // postponeTournament function already defined above

  const sortTournamentsByTime = (tournaments: any[]) => {
    return tournaments.sort((a, b) => {
      const timeA = parseTime(a.time || '00:00');
      const timeB = parseTime(b.time || '00:00');
      return timeA - timeB;
    });
  };

  const groupTournamentsByBreaks = (tournaments: any[]) => {
    const sortedTournaments = sortTournamentsByTime(tournaments);
    const groups: any[] = [];
    let currentGroup: any[] = [];
    let lastBreakTime = 0;

    sortedTournaments.forEach((tournament, index) => {
      const tournamentTime = parseTime(tournament.time || '00:00');
      const nextBreakTime = Math.ceil(tournamentTime / 60) * 60 + 55;

      if (index === 0 || nextBreakTime === lastBreakTime) {
        currentGroup.push(tournament);
      } else {
        if (currentGroup.length > 0) {
          groups.push({
            tournaments: [...currentGroup],
            breakTime: lastBreakTime
          });
        }
        currentGroup = [tournament];
      }
      lastBreakTime = nextBreakTime;
    });

    if (currentGroup.length > 0) {
      groups.push({
        tournaments: currentGroup,
        breakTime: lastBreakTime
      });
    }

    return groups;
  };

  const stats = calculateSessionStats();

  if (!activeSession) {
    return (
      <div className="p-6 text-white">
        <div className="mb-6">
          <h2 className="text-2xl font-bold mb-2">Grind Session</h2>
          <p className="text-gray-400">Inicie uma nova sessão de grind para rastrear seu desempenho em tempo real</p>
        </div>

        <Card className="bg-poker-surface border-gray-700 max-w-2xl mx-auto">
          <CardHeader className="text-center">
            <CardTitle className="text-white text-xl">Nenhuma Sessão Ativa</CardTitle>
            <CardDescription className="text-gray-400">
              Comece uma nova sessão para rastrear seus torneios e receber insights em tempo real
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Dialog open={showStartDialog} onOpenChange={setShowStartDialog}>
              <DialogTrigger asChild>
                <Button className="bg-green-600 hover:bg-green-700 text-white font-semibold px-8 py-3">
                  <Play className="w-4 h-4 mr-2" />
                  Iniciar Sessão
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-poker-surface border-gray-700 text-white">
                <DialogHeader>
                  <DialogTitle>Iniciar Nova Sessão</DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Prepare-se para sua sessão de grind com notas e objetivos
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="preparation-percentage">Preparação (%)</Label>
                    <div className="flex items-center space-x-4">
                      <Input
                        id="preparation-percentage"
                        type="number"
                        min="0"
                        max="100"
                        value={preparationPercentage}
                        onChange={(e) => setPreparationPercentage(Number(e.target.value))}
                        className="bg-gray-800 border-gray-600 text-white w-20"
                      />
                      <span className="text-white">%</span>
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="preparation-observations">Observações de Preparação</Label>
                    <Textarea
                      id="preparation-observations"
                      placeholder="Como você está se sentindo?"
                      value={preparationObservations}
                      onChange={(e) => setPreparationObservations(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <div>
                    <Label htmlFor="goals">Objetivos do Dia</Label>
                    <Textarea
                      id="goals"
                      placeholder="Quais são seus objetivos para hoje?"
                      value={dailyGoals}
                      onChange={(e) => setDailyGoals(e.target.value)}
                      className="bg-gray-800 border-gray-600 text-white"
                    />
                  </div>
                  <Button 
                    onClick={handleStartSession} 
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
                    disabled={startSessionMutation.isPending}
                  >
                    {startSessionMutation.isPending ? "Iniciando..." : "Iniciar Sessão"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      {/* Session Objectives */}
      {activeSession?.dailyGoals && (
        <Card className="bg-poker-surface border-gray-700 mb-4">
          <CardContent className="pt-4">
            <div className="flex items-center space-x-2 mb-2">
              <Target className="w-4 h-4 text-poker-accent" />
              <span className="text-sm font-semibold text-poker-accent">Objetivos da Sessão</span>
            </div>
            <p className="text-gray-300 text-sm">{activeSession.dailyGoals}</p>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">Sessão Ativa</h2>
            <p className="text-gray-400">
              Iniciada às {new Date(activeSession.date).toLocaleTimeString()}
            </p>
          </div>
          {sessionElapsedTime && (
            <Badge variant="outline" className="text-poker-accent border-poker-accent text-lg px-3 py-1">
              {sessionElapsedTime}
            </Badge>
          )}
        </div>
        <div className="flex space-x-2">
          <Button
            onClick={() => setShowBreakManagementDialog(true)}
            variant="outline"
            className="border-poker-accent text-poker-accent hover:bg-poker-accent hover:text-white"
          >
            <Coffee className="w-4 h-4 mr-2" />
            Gerenciar Breaks
          </Button>
          <Button
            onClick={() => endSessionMutation.mutate()}
            variant="destructive"
            className="bg-red-600 hover:bg-red-700"
          >
            Finalizar Sessão
          </Button>
        </div>
      </div>

      {/* Session Stats - Grade 2x2 + Progressão */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4">
            <div className="text-center mb-2">
              <div className="text-2xl font-bold text-blue-400">{stats.registros}</div>
              <div className="text-sm text-gray-400">Registros</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-yellow-400">{stats.reentradas}</div>
              <div className="text-xs text-gray-400">Reentradas</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4">
            <div className="text-center mb-2">
              <div className="text-2xl font-bold text-green-400">${stats.totalInvestido.toFixed(2)}</div>
              <div className="text-sm text-gray-400">Total Investido</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-bold ${stats.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${stats.profit.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400">Profit</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4">
            <div className="text-center mb-2">
              <div className="text-2xl font-bold text-purple-400">{stats.itmPercent.toFixed(1)}%</div>
              <div className="text-sm text-gray-400">ITM %</div>
            </div>
            <div className="text-center">
              <div className={`text-xl font-bold ${stats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {stats.roi.toFixed(1)}%
              </div>
              <div className="text-xs text-gray-400">ROI %</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4">
            <div className="text-center mb-2">
              <div className="text-2xl font-bold text-orange-400">{stats.fts}</div>
              <div className="text-sm text-gray-400">FTs</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-yellow-500">{stats.cravadas}</div>
              <div className="text-xs text-gray-400">Cravadas</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-poker-surface border-gray-700">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-cyan-400">{stats.progressao.toFixed(1)}%</div>
            <div className="text-sm text-gray-400">Progressão</div>
            <div className="text-xs text-gray-500 mt-1">{stats.proximos} próximos</div>
          </CardContent>
        </Card>
      </div>

      {/* Tournament List */}
      <Card className="bg-poker-surface border-gray-700 mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-white">Torneios de Hoje</CardTitle>
            <Dialog open={showAddTournamentDialog} onOpenChange={setShowAddTournamentDialog}>
              <DialogTrigger asChild>
                <Button className="bg-blue-600 hover:bg-blue-700 px-6 py-3 text-lg font-semibold">
                  <Plus className="w-5 h-5 mr-2" />
                  Adicionar Torneio
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-blue-900 border-blue-600 text-white max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="text-xl">Adicionar Novo Torneio</DialogTitle>
                  <DialogDescription className="text-blue-200">
                    Complete as informações do torneio para adicionar à sua sessão
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-blue-200">Nome do Torneio (opcional)</Label>
                    <Input
                      value={newTournament.name}
                      onChange={(e) => setNewTournament({...newTournament, name: e.target.value})}
                      className="bg-blue-800 border-blue-600 text-white"
                      placeholder="Deixe vazio para gerar automaticamente"
                    />
                  </div>
                  <div>
                    <Label className="text-blue-200">Site</Label>
                    <select
                      value={newTournament.site}
                      onChange={(e) => setNewTournament({...newTournament, site: e.target.value})}
                      className="w-full p-2 bg-blue-800 border border-blue-600 rounded-md text-white"
                    >
                      <option value="">Selecione o site</option>
                      <option value="PokerStars">PokerStars</option>
                      <option value="GGPoker">GGPoker</option>
                      <option value="PartyPoker">PartyPoker</option>
                      <option value="888poker">888poker</option>
                      <option value="WPN">WPN</option>
                      <option value="Chico">Chico</option>
                      <option value="iPoker">iPoker</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-blue-200">Buy-in ($)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={newTournament.buyIn}
                      onChange={(e) => setNewTournament({...newTournament, buyIn: e.target.value})}
                      className="bg-blue-800 border-blue-600 text-white"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
```text
                    <Label className="text-blue-200">Tipo</Label>
                    <select
                      value={newTournament.type}
                      onChange={(e) => setNewTournament({...newTournament, type: e.target.value})}
                      className="w-full p-2 bg-blue-800 border border-blue-600 rounded-md text-white"
                    >
                      <option value="Vanilla">Vanilla</option>
                      <option value="PKO">PKO</option>
                      <option value="Mystery">Mystery</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-blue-200">Velocidade</Label>
                    <select
                      value={newTournament.speed}
                      onChange={(e) => setNewTournament({...newTournament, speed: e.target.value})}
                      className="w-full p-2 bg-blue-800 border border-blue-600 rounded-md text-white"
                    >
                      <option value="Normal">Normal</option>
                      <option value="Turbo">Turbo</option>
                      <option value="Hyper">Hyper</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-blue-200">Horário (opcional)</Label>
                    <Input
                      type="time"
                      value={newTournament.scheduledTime}
                      onChange={(e) => setNewTournament({...newTournament, scheduledTime: e.target.value})}
                      className="bg-blue-800 border-blue-600 text-white"
                    />
                  </div>
                </div>
                <div className="flex space-x-2 mt-6">
                  <Button 
                    onClick={() => setShowAddTournamentDialog(false)}
                    variant="outline"
                    className="flex-1 border-blue-600 text-blue-200 hover:bg-blue-800"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={() => addTournamentMutation.mutate(newTournament)}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={!newTournament.site || !newTournament.buyIn}
                  >
                    Adicionar Torneio
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Organize tournaments by status */}
            {(() => {
              const allTournaments = [
                ...(plannedTournaments || []),
                ...(sessionTournaments || [])
              ];
              const { registered, upcoming, completed } = organizeTournaments(allTournaments);
              
              console.log('Tournament organization:', {
                upcoming: upcoming.map(t => ({ id: t.id, status: t.status, name: t.name })),
                registered: registered.map(t => ({ id: t.id, status: t.status, name: t.name })),
                completed: completed.map(t => ({ id: t.id, status: t.status, name: t.name }))
              });

              return (
                <>
                  {/* Registered Tournaments (Top) */}
                  {registered.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-600">
                        <UserPlus className="w-4 h-4 text-blue-400" />
                        <h3 className="font-semibold text-blue-400">Registrados ({registered.length})</h3>
                      </div>
                      {registered.map((tournament: any, index: number) => (
                        <div key={tournament.id}>
                          <div className="p-3 bg-blue-900/20 rounded-lg border border-blue-600/30">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3 flex-1">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-5 h-5 text-poker-accent flex-shrink-0" />
                                  <span className="font-bold text-poker-accent text-lg">
                                    {tournament.time}
                                  </span>
                                </div>
                                <span className="font-semibold text-white text-sm">{generateTournamentName(tournament)}</span>
                                <div className="flex items-center gap-1">
                                  <Badge className={`text-xs px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
                                    {tournament.site}
                                  </Badge>
                                  <Badge className="bg-gray-600 text-xs px-1.5 py-0.5 text-white">
                                    {tournament.type || 'Vanilla'}
                                  </Badge>
                                  <Badge className="bg-gray-700 text-xs px-1.5 py-0.5 text-white">
                                    {tournament.speed || 'Normal'}
                                  </Badge>
                                  {(tournament.rebuys || 0) > 0 && (
                                    <Badge className="bg-yellow-600 text-xs px-1.5 py-0.5 text-white">
                                      {(tournament.rebuys || 0) + 1} entradas
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {/* Registration fields inline */}
                                <Input
                                  type="number"
                                  placeholder="Bounty"
                                  className="bg-gray-800 border-gray-600 text-white h-8 w-20 text-xs"
                                  value={registrationData[tournament.id]?.bounty || ''}
                                  onChange={(e) => setRegistrationData({
                                    ...registrationData,
                                    [tournament.id]: {
                                      ...registrationData[tournament.id],
                                      bounty: e.target.value,
                                      prizeItm: registrationData[tournament.id]?.prizeItm || '',
                                      position: registrationData[tournament.id]?.position || ''
                                    }
                                  })}
                                />
                                <Input
                                  type="number"
                                  placeholder="Prize"
                                  className="bg-gray-800 border-gray-600 text-white h-8 w-20 text-xs"
                                  value={registrationData[tournament.id]?.prizeItm || ''}
                                  onChange={(e) => setRegistrationData({
                                    ...registrationData,
                                    [tournament.id]: {
                                      ...registrationData[tournament.id],
                                      prizeItm: e.target.value,
                                      bounty: registrationData[tournament.id]?.bounty || '',
                                      position: registrationData[tournament.id]?.position || ''
                                    }
                                  })}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-400">Posição (opcional)</Label>
                                <div className="flex gap-1">
                                  <Input
                                    type="number"
                                    placeholder="0"
                                    className="bg-gray-800 border-gray-600 text-white h-8 text-xs flex-1"
                                    value={registrationData[tournament.id]?.position || ''}
                                    onChange={(e) => setRegistrationData({
                                      ...registrationData,
                                      [tournament.id]: {
                                        ...registrationData[tournament.id],
                                        position: e.target.value,
                                        bounty: registrationData[tournament.id]?.bounty || '',
                                        prizeItm: registrationData[tournament.id]?.prizeItm || ''
                                      }
                                    })}
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const newRebuys = (tournament.rebuys || 0) + 1;
                                      console.log('Rebuy tournament:', tournament.id, 'Current rebuys:', tournament.rebuys, 'New rebuys:', newRebuys);
                                      handleUpdateTournament(tournament, 'rebuys', newRebuys);
                                    }}
                                    className="border-yellow-500 text-yellow-300 hover:bg-yellow-700 h-8 px-3"
                                  >
                                    <Coins className="w-4 h-4 mr-1" />
                                    Rebuy{tournament.rebuys && tournament.rebuys > 0 ? ` (${tournament.rebuys})` : ''}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleUnregisterTournament(tournament.id)}
                                    className="border-gray-500 text-gray-300 hover:bg-gray-700 h-8 px-2"
                                  >
                                    <Undo2 className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    onClick={() => handleCompleteTournament(tournament.id, registrationData[tournament.id] || {})}
                                    className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white h-10 px-6 font-bold text-lg shadow-lg transform hover:scale-105 transition-all"
                                  >
                                    GG!
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                          {index < registered.length - 1 && <div className="h-px bg-gray-600 my-2" />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Upcoming Tournaments */}
                  {upcoming.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-600">
                        <Clock className="w-4 h-4 text-gray-400" />
                        <h3 className="font-semibold text-gray-400">Próximos ({upcoming.length})</h3>
                      </div>
                      {upcoming.map((tournament: any, index: number) => (
                        <div key={tournament.id}>
                          <div className="p-4 bg-gray-800 rounded-lg">
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-5 h-5 text-poker-accent flex-shrink-0" />
                                    <span className="font-bold text-poker-accent text-lg">
                                      {tournament.time}
                                    </span>
                                  </div>
                                  <span className="font-semibold text-white">{generateTournamentName(tournament)}</span>
                                </div>
                                <div className="flex items-center gap-2 mb-2 ml-7">
                                  <Badge className={`text-xs px-2 py-1 text-white ${getSiteColor(tournament.site)}`}>
                                    {tournament.site}
                                  </Badge>
                                  <Badge className={`text-xs px-2 py-1 text-white ${getCategoryColor(tournament.category || 'Vanilla')}`}>
                                    {tournament.category || 'Vanilla'}
                                  </Badge>
                                  <Badge className={`text-xs px-2 py-1 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
                                    {tournament.speed || 'Normal'}
                                  </Badge>
                                </div>
                                <div className="text-sm text-gray-300 ml-7">
                                  Buy-in: <span className="text-poker-green font-semibold">${tournament.buyIn}</span>
                                  {tournament.guaranteed && (
                                    <span className="ml-4">Garantido: <span className="text-blue-400 font-semibold">${tournament.guaranteed}</span></span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingTournament(tournament);
                                    setShowEditTournamentDialog(true);
                                  }}
                                  className="border-blue-600 text-blue-200 hover:bg-blue-800"
                                >
                                  <Edit className="w-4 h-4 mr-1" />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFoldTournament(tournament.id)}
                                  className="border-red-500 text-red-300 hover:bg-red-700"
                                >
                                  <XCircle className="w-4 h-4 mr-1" />
                                  Fold
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => postponeTournament(tournament.id, 15)}
                                  className="border-gray-500 text-gray-300 hover:bg-gray-700"
                                >
                                  +15min
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleRegisterTournament(tournament.id)}
                                  className="bg-blue-600 hover:bg-blue-700 text-white"
                                >
                                  <UserPlus className="w-4 h-4 mr-1" />
                                  Registrar
                                </Button>
                              </div>
                            </div>
                          </div>
                          {index < upcoming.length - 1 && <div className="h-px bg-gray-600 my-2" />}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Completed Tournaments Toggle */}
                  {completed.length > 0 && (
                    <Collapsible open={showCompletedTournaments} onOpenChange={setShowCompletedTournaments}>
                      <CollapsibleTrigger asChild>
                        <div className="flex items-center justify-between p-3 bg-gray-900 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors">
                          <div className="flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-poker-gold" />
                            <span className="font-semibold text-white">Torneios Concluídos</span>
                            <Badge variant="outline" className="text-gray-400">
                              {completed.length}
                            </Badge>
                          </div>
                          {showCompletedTournaments ? (
                            <ChevronUp className="w-4 h-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="space-y-3 mt-3">
                        {completed.map((tournament: any, index: number) => (
                          <div key={tournament.id}>
                            <div className="p-4 bg-green-900/20 rounded-lg border border-green-600/30">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <Clock className="w-4 h-4 text-poker-accent flex-shrink-0" />
                                    <span className="font-semibold text-poker-accent">
                                      {tournament.time}
                                    </span>
                                    <span className="font-semibold text-white">{generateTournamentName(tournament)}</span>
                                  </div>
                                  <div className="text-sm text-gray-300 ml-7">
                                    Buy-in: <span className="text-poker-green font-semibold">${tournament.buyIn}</span>
                                    {tournament.rebuys > 0 && (
                                      <span className="ml-4">Rebuys: <span className="text-yellow-400 font-semibold">{tournament.rebuys}</span></span>
                                    )}
                                    {tournament.result && parseFloat(tournament.result) > 0 && (
                                      <span className="ml-4">Prize: <span className="text-green-400 font-semibold">${tournament.result}</span></span>
                                    )}
                                    {tournament.position && (
                                      <span className="ml-4">Posição: <span className="text-orange-400 font-semibold">{tournament.position}º</span></span>
                                    )}
                                    {tournament.position && (
                                      <span className="ml-4">Posição: <span className="text-purple-400 font-semibold">{tournament.position}</span></span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setEditingTournament(tournament);
                                      setShowEditTournamentDialog(true);
                                    }}
                                    className="border-blue-600 text-blue-200 hover:bg-blue-800"
                                  >
                                    <Edit className="w-4 h-4 mr-1" />
                                    Editar
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleUnregisterTournament(tournament.id)}
                                    className="border-gray-500 text-gray-300 hover:bg-gray-700"
                                  >
                                    <Undo2 className="w-4 h-4 mr-1" />
                                    Desfazer
                                  </Button>
                                </div>
                              </div>
                            </div>
                            {index < completed.length - 1 && <div className="h-px bg-gray-600 my-2" />}
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </>
              );
            })()}
          </div>
        </CardContent>
      </Card>

      {/* Break Feedback Dialog */}
      <Dialog open={showBreakDialog} onOpenChange={setShowBreakDialog}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Coffee className="w-5 h-5 mr-2" />
              Feedback do Break
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Como você está se sentindo neste momento? (0-10)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {[
              { key: "foco", label: "Foco" },
              { key: "energia", label: "Energia" },
              { key: "confianca", label: "Confiança" },
              { key: "inteligenciaEmocional", label: "Inteligência Emocional" },
              { key: "interferencias", label: "Interferências (0=muitas, 10=nenhuma)" },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label>{label}</Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={breakFeedback[key as keyof typeof breakFeedback]}
                  onChange={(e) => 
                    setBreakFeedback({
                      ...breakFeedback,
                      [key]: parseInt(e.target.value) || 0
                    })
                  }
                  className="bg-gray-800 border-gray-600 text-white"
                />
              </div>
            ))}
            <div>
              <Label>Notas (opcional)</Label>
              <Textarea
                value={breakFeedback.notes}
                onChange={(e) => setBreakFeedback({...breakFeedback, notes: e.target.value})}
                className="bg-gray-800 border-gray-600 text-white"
                placeholder="Como você está se sentindo? Alguma observação?"
              />
            </div>
            <div className="flex space-x-2">
              <Button
                onClick={() => breakFeedbackMutation.mutate(breakFeedback)}
                className="flex-1 bg-poker-accent hover:bg-poker-accent/90"
              >
                Salvar Feedback
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBreakDialog(false)}
                className="border-gray-600 text-gray-400 hover:bg-gray-800"
              >
                <SkipForward className="w-4 h-4 mr-2" />
                Pular
              </Button>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                // Update session to skip breaks today
                setShowBreakDialog(false);
                toast({
                  title: "Breaks Desabilitados",
                  description: "Não mostraremos mais feedbacks de break hoje",
                });
              }}
              className="w-full text-yellow-400 hover:bg-yellow-900/20"
            >
              Pular Todos Hoje
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Daily Report Dialog */}
      <Dialog open={showDailyReport} onOpenChange={setShowDailyReport}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center">
              <Trophy className="w-5 h-5 mr-2" />
              Relatório do Dia
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Resumo da sua sessão de grind
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Session Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-poker-gold">{stats.volume}</div>
                <div className="text-sm text-gray-400">Volume</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">${stats.profit.toFixed(2)}</div>
                <div className="text-sm text-gray-400">Lucro</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {stats.volume > 0 ? ((stats.profit / stats.buyins) * 100).toFixed(1) : 0}%
                </div>
                <div className="text-sm text-gray-400">ROI</div>
              </div>
            </div>

            <Separator className="bg-gray-600" />

            {/* Preparation Notes */}
            {activeSession.preparationNotes && (
              <div>
                <h4 className="font-semibold mb-2">Notas de Preparação</h4>
                <p className="text-gray-300 bg-gray-800 p-3 rounded">
                  {activeSession.preparationNotes}
                </p>
              </div>
            )}

            {/* Daily Goals */}
            {activeSession.dailyGoals && (
              <div>
                <h4 className="font-semibold mb-2">Objetivos do Dia</h4>
                <p className="text-gray-300 bg-gray-800 p-3 rounded">
                  {activeSession.dailyGoals}
                </p>
              </div>
            )}

            <Button
              onClick={() => {
                setShowDailyReport(false);
                setActiveSession(null);
              }}
              className="w-full bg-poker-accent hover:bg-poker-accent/90"
            >
              Finalizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Break Management Dialog */}
      <Dialog open={showBreakManagementDialog} onOpenChange={setShowBreakManagementDialog}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl">Gerenciamento de Breaks</DialogTitle>
            <DialogDescription className="text-gray-400">
              Visualize e edite seus breaks programados e registrados
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Breaks Programados */}
            <div>
              <h3 className="text-lg font-semibold text-poker-accent mb-3">Breaks Programados</h3>
              <div className="space-y-2">
                {groupTournamentsByBreaks(plannedTournaments || []).map((group, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <Coffee className="w-4 h-4 text-poker-accent" />
                      <span className="text-white">Break {Math.floor(group.breakTime / 60)}:{(group.breakTime % 60).toString().padStart(2, '0')}</span>
                      <span className="text-gray-400 text-sm">
                        ({group.tournaments.length} torneios antes)
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                        <Edit className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                      <Button size="sm" variant="outline" className="border-red-500 text-red-300 hover:bg-red-700">
                        <XCircle className="w-4 h-4 mr-1" />
                        Remover
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Breaks Registrados */}
            <div>
              <h3 className="text-lg font-semibold text-poker-gold mb-3">Breaks Registrados</h3>
              <div className="space-y-2">
                {/* Simular alguns breaks registrados para demonstração */}
                <div className="flex items-center justify-between p-3 bg-green-900/20 rounded-lg border border-green-600/30">
                  <div className="flex items-center gap-3">
                    <Coffee className="w-4 h-4 text-green-400" />
                    <span className="text-white">Break 15:55</span>
                    <span className="text-green-400 text-sm">Concluído</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-sm text-gray-300">
                      Foco: 8/10 | Energia: 7/10 | Confiança: 9/10
                    </div>
                    <Button size="sm" variant="outline" className="border-gray-600 text-gray-300 hover:bg-gray-700">
                      <Edit className="w-4 h-4 mr-1" />
                      Ver/Editar
                    </Button>
                  </div>
                </div>
                <div className="p-3 bg-gray-800 rounded-lg">
                  <div className="text-center text-gray-400 text-sm">
                    Nenhum break registrado ainda hoje
                  </div>
                </div>
              </div>
            </div>

            {/* Adicionar Novo Break */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-3">Adicionar Novo Break</h3>
              <div className="flex gap-3">
                <Input
                  type="time"
                  className="bg-gray-800 border-gray-600 text-white"
                  placeholder="Horário do break"
                />
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar Break
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <Button 
              onClick={() => setShowBreakManagementDialog(false)}
              className="bg-poker-accent hover:bg-poker-accent/90"
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Tournament Dialog */}
      <Dialog open={showEditTournamentDialog} onOpenChange={setShowEditTournamentDialog}>
        <DialogContent className="max-w-md mx-auto bg-blue-900 border-blue-600">
          <DialogHeader>
            <DialogTitle className="text-blue-100">Editar Torneio</DialogTitle>
          </DialogHeader>
          {editingTournament && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="edit-site" className="text-blue-200">Site</Label>
                <Select value={editingTournament.site || ""} onValueChange={(value) => setEditingTournament({...editingTournament, site: value})}>
                  <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                    <SelectValue placeholder="Selecione o site" />
                  </SelectTrigger>
                  <SelectContent className="bg-blue-800 border-blue-600">
                    <SelectItem value="PokerStars">PokerStars</SelectItem>
                    <SelectItem value="GGNetwork">GGNetwork</SelectItem>
                    <SelectItem value="PartyPoker">PartyPoker</SelectItem>
                    <SelectItem value="888Poker">888Poker</SelectItem>
                    <SelectItem value="WPN">WPN</SelectItem>
                    <SelectItem value="iPoker">iPoker</SelectItem>
                    <SelectItem value="Chico">Chico</SelectItem>
                    <SelectItem value="CoinPoker">CoinPoker</SelectItem>
                    <SelectItem value="Revolution">Revolution</SelectItem>
                    <SelectItem value="Bodog">Bodog</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-type" className="text-blue-200">Tipo</Label>
                <Select value={editingTournament.type || editingTournament.category || ""} onValueChange={(value) => setEditingTournament({...editingTournament, type: value, category: value})}>
                  <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent className="bg-blue-800 border-blue-600">
                    <SelectItem value="Vanilla">Vanilla</SelectItem>
                    <SelectItem value="PKO">PKO</SelectItem>
                    <SelectItem value="Mystery">Mystery</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-speed" className="text-blue-200">Velocidade</Label>
                <Select value={editingTournament.speed || ""} onValueChange={(value) => setEditingTournament({...editingTournament, speed: value})}>
                  <SelectTrigger className="bg-blue-800 border-blue-600 text-white">
                    <SelectValue placeholder="Selecione a velocidade" />
                  </SelectTrigger>
                  <SelectContent className="bg-blue-800 border-blue-600">
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Turbo">Turbo</SelectItem>
                    <SelectItem value="Hyper">Hyper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-buyIn" className="text-blue-200">Buy-in ($)</Label>
                <Input
                  id="edit-buyIn"
                  type="number"
                  value={editingTournament.buyIn || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, buyIn: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-guaranteed" className="text-blue-200">Garantido ($)</Label>
                <Input
                  id="edit-guaranteed"
                  type="number"
                  value={editingTournament.guaranteed || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, guaranteed: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                />
              </div>
              <div>
                <Label htmlFor="edit-time" className="text-blue-200">Horário</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editingTournament.time || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, time: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                />
              </div>
              <div className="flex space-x-2 mt-6">
                <Button 
                  onClick={() => setShowEditTournamentDialog(false)}
                  variant="outline"
                  className="flex-1 border-blue-600 text-blue-200 hover:bg-blue-800"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={() => {
                    console.log('Edit tournament mutation called with:', editingTournament);
                    updateTournamentMutation.mutate({
                      id: editingTournament.id,
                      data: {
                        site: editingTournament.site,
                        type: editingTournament.type,
                        category: editingTournament.category || editingTournament.type,
                        speed: editingTournament.speed,
                        buyIn: editingTournament.buyIn,
                        guaranteed: editingTournament.guaranteed,
                        time: editingTournament.time
                      }
                    });
                    setShowEditTournamentDialog(false);
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                >
                  Salvar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}