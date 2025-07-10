import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
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
import { Play, Plus, Clock, DollarSign, Trophy, Target, Coffee, SkipForward, X, ChevronDown, ChevronUp, UserPlus, Award, Coins, Edit, XCircle, Undo2, PlayCircle, FileText, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface GrindSession {
  id: string;
  userId: string;
  date: string;
  status: string;
  preparationNotes?: string;
  preparationPercentage?: number;
  dailyGoals?: string;
  skipBreaksToday: boolean;
  objectiveCompleted?: boolean;
  finalNotes?: string;
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

const formatNumberWithDots = (num: string | number): string => {
  const numStr = String(num);
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

const generateTournamentName = (tournament: any): string => {
  if (tournament.name && tournament.name.trim()) {
    // Format guaranteed values in existing titles
    return tournament.name.replace(/\b(\d{4,})\b/g, (match: string) => formatNumberWithDots(match));
  }

  const guaranteed = tournament.guaranteed ? ` $${formatNumberWithDots(tournament.guaranteed)}` : '';
  return `${tournament.type || tournament.category || 'Vanilla'} $${formatNumberWithDots(tournament.buyIn)}${guaranteed} ${tournament.site}`;
};

export default function GrindSessionLive() {
  const [, setLocation] = useLocation();
  const [activeSession, setActiveSession] = useState<GrindSession | null>(null);
  const [showStartDialog, setShowStartDialog] = useState(false);
  const [showBreakDialog, setShowBreakDialog] = useState(false);
  const [showAddTournamentDialog, setShowAddTournamentDialog] = useState(false);
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [sessionObjectiveCompleted, setSessionObjectiveCompleted] = useState(false);
  const [sessionFinalNotes, setSessionFinalNotes] = useState("");
  const [showCompletedTournaments, setShowCompletedTournaments] = useState(false);
  const [preparationPercentage, setPreparationPercentage] = useState(50);
  const [preparationObservations, setPreparationObservations] = useState("");
  const [dailyGoals, setDailyGoals] = useState("");

  // Tournament states and dialogs
  const [registrationDialogs, setRegistrationDialogs] = useState<{[key: string]: boolean}>({});
  const [editDialogs, setEditDialogs] = useState<{[key: string]: boolean}>({});
  const [registrationData, setRegistrationData] = useState<{[key: string]: {prizeItm: string, bounty: string, position: string}}>({});
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [showPendingTournamentsDialog, setShowPendingTournamentsDialog] = useState(false);
  const [pendingTournaments, setPendingTournaments] = useState<any[]>([]);
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

  // Query for break feedbacks during the active session
  const { data: breakFeedbacks = [] } = useQuery({
    queryKey: [`/api/break-feedbacks`, activeSession?.id],
    queryFn: async () => {
      if (!activeSession?.id) return [];
      const response = await fetch(`/api/break-feedbacks?sessionId=${activeSession.id}`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to fetch break feedbacks");
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

        // Show break dialog at xx:54 (6 minutes before the hour)
        if (minutes === 54) {
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
      const response = await apiRequest("/api/grind-sessions", {
        method: "POST",
        body: JSON.stringify(sessionData),
      });
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
        userId: activeSession?.userId,
        sessionId: activeSession?.id,
        site: tournamentData.site,
        name: tournamentData.name || `${tournamentData.site} ${tournamentData.type || 'Tournament'}`,
        buyIn: tournamentData.buyIn,
        rebuys: 0,
        result: "0",
        bounty: "0",
        status: "upcoming",
        fromPlannedTournament: false,
        fieldSize: tournamentData.fieldSize ? parseInt(tournamentData.fieldSize) : null,
        position: null,
        startTime: null,
        endTime: null,
        time: tournamentData.scheduledTime || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        type: tournamentData.type || 'Vanilla',
        speed: tournamentData.speed || 'Normal',
        guaranteed: tournamentData.guaranteed || null
      };
      
      console.log('Creating manual tournament with data:', data);
      const response = await fetch("/api/session-tournaments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create tournament");
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      
      // Force refresh the current day data
      const currentDayOfWeek = new Date().getDay();
      queryClient.removeQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day", currentDayOfWeek] });
      
      setTimeout(() => {
        refetchTournaments();
      }, 100);
      
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
    onError: (error: any) => {
      console.error('Failed to create tournament:', error);
      toast({
        title: "Erro ao Adicionar Torneio",
        description: error.message || "Falha ao adicionar torneio à sessão",
        variant: "destructive",
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
      const response = await apiRequest(endpoint, {
        method: "PUT",
        body: JSON.stringify(data),
      });
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
    onError: (error: any) => {
      console.error('Update failed:', error);
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      });
      
      let errorMessage = "Falha ao atualizar torneio";
      if (error.message) {
        errorMessage += `: ${error.message}`;
      }
      
      toast({
        title: "Erro ao Atualizar Torneio",
        description: errorMessage,
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
      const response = await fetch("/api/break-feedbacks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error("Failed to save break feedback");
      }
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
      // Invalidate break feedbacks query to refresh the data
      queryClient.invalidateQueries({ queryKey: [`/api/break-feedbacks`, activeSession?.id] });
      toast({
        title: "Feedback Registrado",
        description: "Seu feedback do break foi registrado!",
      });
    },
  });

  // Function to check for pending tournaments
  const checkPendingTournaments = () => {
    const allTournaments = [
      ...(plannedTournaments || []),
      ...(sessionTournaments || [])
    ];
    
    console.log('checkPendingTournaments - All tournaments:', allTournaments.map(t => ({
      id: t.id,
      status: t.status,
      result: t.result,
      name: t.name
    })));
    
    // Find tournaments with status "registered" that don't have results (or result is 0)
    const pending = allTournaments.filter(t => {
      const isRegistered = t.status === 'registered';
      const hasNoResult = !t.result || t.result === '0' || t.result === '';
      console.log(`Tournament ${t.id}: status=${t.status}, result="${t.result}", isRegistered=${isRegistered}, hasNoResult=${hasNoResult}`);
      return isRegistered && hasNoResult;
    });
    
    console.log('checkPendingTournaments - Pending tournaments found:', pending.length);
    
    return pending;
  };

  // Function to finalize pending tournaments automatically
  const finalizePendingTournamentsMutation = useMutation({
    mutationFn: async (pendingTournaments: any[]) => {
      const promises = pendingTournaments.map(tournament => {
        const endpoint = tournament.id.startsWith('planned-') 
          ? `/api/planned-tournaments/${tournament.id.substring(8)}`
          : `/api/session-tournaments/${tournament.id}`;
        
        return apiRequest(endpoint, {
          method: "PUT",
          body: JSON.stringify({
            status: "completed",
            result: "0", // No prize
            bounty: "0", // No bounty
            endTime: new Date().toISOString(),
            position: null // Can remain empty
          }),
        });
      });
      
      return Promise.all(promises);
    },
    onSuccess: () => {
      // Refresh tournament data
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      
      toast({
        title: "Torneios Finalizados",
        description: "Torneios pendentes foram marcados como GG! automaticamente.",
      });
      
      // Now actually end the session
      endSessionMutation.mutate();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao Finalizar Torneios",
        description: "Não foi possível finalizar os torneios pendentes. Tente novamente.",
        variant: "destructive",
      });
    }
  });

  // End session mutation
  const endSessionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/grind-sessions/${activeSession?.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: "completed",
          endTime: new Date().toISOString(),
          objectiveCompleted: sessionObjectiveCompleted,
          finalNotes: sessionFinalNotes,
        }),
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Sessão Finalizada!",
        description: "Sua sessão foi concluída com sucesso. Redirecionando para o histórico...",
      });
      
      // Invalidate queries to refresh data and clear cache
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/grind-sessions/history"] });
      queryClient.removeQueries({ queryKey: ["/api/grind-sessions"] }); // Force cache removal
      
      // Redirect to grind history page
      setTimeout(() => {
        setLocation("/grind");
      }, 1000);
    },
  });

  // Function to handle session finalization with validation
  const handleSessionFinalization = () => {
    const pending = checkPendingTournaments();
    
    console.log('Session finalization triggered. Pending tournaments:', pending);
    
    if (pending.length > 0) {
      // Show warning dialog for pending tournaments
      console.log('Found pending tournaments, showing warning dialog');
      setPendingTournaments(pending);
      setShowPendingTournamentsDialog(true);
    } else {
      // No pending tournaments, proceed to session summary
      console.log('No pending tournaments, opening session summary');
      setShowSessionSummary(true);
    }
  };

  const handleStartSession = async () => {
    console.log('Starting new session - resetting all tournaments...');
    
    try {
      // Reset all tournaments using dedicated API
      const response = await fetch('/api/grind-sessions/reset-tournaments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        console.error('Failed to reset tournaments');
      } else {
        console.log('Successfully reset all tournaments to upcoming status');
        
        // Force refresh data after reset
        queryClient.invalidateQueries({ queryKey: ["/api/session-tournaments/by-day"] });
        queryClient.invalidateQueries({ queryKey: ["/api/planned-tournaments"] });
      }
    } catch (error) {
      console.error('Error resetting tournaments:', error);
    }
    
    const combinedPreparationNotes = `${preparationPercentage}% - ${preparationObservations}`;
    startSessionMutation.mutate({
      preparationNotes: combinedPreparationNotes,
      dailyGoals,
    });
  };

  const handleUpdateTournament = (tournament: any, field: string, value: any) => {
    console.log('handleUpdateTournament called with:', { id: tournament.id, field, value, currentRebuys: tournament.rebuys });
    
    // Handle rebuys increment correctly
    if (field === 'rebuys') {
      value = (tournament.rebuys || 0) + 1;
      console.log('Incrementing rebuys to:', value);
    }
    
    // Ensure proper data format
    const updateData = { [field]: value };
    
    // Handle special cases for data transformation
    if (field === 'position' && value !== null) {
      updateData[field] = parseInt(String(value)) || null;
    } else if (field === 'result' || field === 'bounty') {
      updateData[field] = String(value || '0');
    }
    
    console.log('Final update data:', updateData);
    
    updateTournamentMutation.mutate({
      id: tournament.id,
      data: updateData,
    });
  };

  const handleRebuyTournament = (tournament: any) => {
    console.log('Rebuy tournament called for:', tournament.id, 'Current rebuys:', tournament.rebuys);
    handleUpdateTournament(tournament, 'rebuys', (tournament.rebuys || 0) + 1);
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
  }

  // Calculate final session statistics for session summary
  const calculateFinalSessionStats = () => {
    const allTournaments = [
      ...(plannedTournaments || []),
      ...(sessionTournaments || [])
    ];
    const completedTournaments = allTournaments.filter(t => t.status === "finished" || t.status === "completed");
    
    console.log('calculateFinalSessionStats - Completed tournaments:', completedTournaments.map(t => ({
      id: t.id,
      status: t.status,
      buyIn: t.buyIn,
      rebuys: t.rebuys,
      result: t.result,
      bounty: t.bounty,
      name: t.name
    })));
    
    const volume = completedTournaments.length;
    const totalInvested = completedTournaments.reduce((sum, t) => {
      const buyIn = parseFloat(t.buyIn) || 0;
      const rebuys = t.rebuys || 0;
      const invested = buyIn * (1 + rebuys);
      console.log(`Tournament ${t.id}: buyIn=${buyIn}, rebuys=${rebuys}, invested=${invested}`);
      return sum + invested;
    }, 0);
    
    const totalResult = completedTournaments.reduce((sum, t) => {
      const result = parseFloat(t.result) || 0;
      console.log(`Tournament ${t.id}: result=${result}`);
      return sum + result;
    }, 0);
    
    const totalBounties = completedTournaments.reduce((sum, t) => {
      const bounty = parseFloat(t.bounty) || 0;
      console.log(`Tournament ${t.id}: bounty=${bounty}`);
      return sum + bounty;
    }, 0);
    
    // FIXED: Include bounties in profit calculation to match the live stats
    const profit = (totalResult + totalBounties) - totalInvested;
    console.log(`Final calculation: result=${totalResult}, bounties=${totalBounties}, invested=${totalInvested}, profit=${profit}`);
    
    const abiMed = volume > 0 ? totalInvested / volume : 0;
    const roi = totalInvested > 0 ? (profit / totalInvested) * 100 : 0;
    
    const fts = completedTournaments.filter(t => {
      const position = parseInt(t.position) || 999;
      const fieldSize = parseInt(t.fieldSize) || 0;
      return position <= 9 || (fieldSize > 0 && position <= fieldSize * 0.1);
    }).length;
    
    const cravadas = completedTournaments.filter(t => {
      const result = parseFloat(t.result) || 0;
      const buyIn = parseFloat(t.buyIn) || 0;
      return result > buyIn * 10;
    }).length;
    
    // Find best tournament (include bounties in calculation)
    const bestTournament = completedTournaments.reduce((best, current) => {
      const currentResult = parseFloat(current.result) || 0;
      const currentBounty = parseFloat(current.bounty) || 0;
      const currentInvested = (parseFloat(current.buyIn) || 0) * (1 + (current.rebuys || 0));
      const currentProfit = (currentResult + currentBounty) - currentInvested;
      
      if (!best) return current;
      
      const bestResult = parseFloat(best.result) || 0;
      const bestBounty = parseFloat(best.bounty) || 0;
      const bestInvested = (parseFloat(best.buyIn) || 0) * (1 + (best.rebuys || 0));
      const bestProfit = (bestResult + bestBounty) - bestInvested;
      
      return currentProfit > bestProfit ? current : best;
    }, null);
    
    return {
      volume,
      profit,
      abiMed,
      roi,
      fts,
      cravadas,
      bestTournament
    };
  };

  // Calculate break feedback averages
  const calculateBreakAverages = () => {
    if (!breakFeedbacks || breakFeedbacks.length === 0) {
      return { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 };
    }
    
    const totals = breakFeedbacks.reduce((acc, feedback) => {
      return {
        energia: acc.energia + feedback.energia,
        foco: acc.foco + feedback.foco,
        confianca: acc.confianca + feedback.confianca,
        inteligenciaEmocional: acc.inteligenciaEmocional + feedback.inteligenciaEmocional,
        interferencias: acc.interferencias + feedback.interferencias
      };
    }, { energia: 0, foco: 0, confianca: 0, inteligenciaEmocional: 0, interferencias: 0 });
    
    const count = breakFeedbacks.length;
    return {
      energia: totals.energia / count,
      foco: totals.foco / count,
      confianca: totals.confianca / count,
      inteligenciaEmocional: totals.inteligenciaEmocional / count,
      interferencias: totals.interferencias / count
    };
  };;

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
            className="border-poker-accent hover:bg-poker-accent hover:text-white text-[#121212]"
          >
            <Coffee className="w-4 h-4 mr-2" />
            Gerenciar Breaks
          </Button>
          <Button
            onClick={handleSessionFinalization}
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
                    onClick={() => {
                      if (!newTournament.site || !newTournament.buyIn) {
                        toast({
                          title: "Campos Obrigatórios",
                          description: "Site e Buy-in são obrigatórios",
                          variant: "destructive",
                        });
                        return;
                      }
                      addTournamentMutation.mutate(newTournament);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    disabled={addTournamentMutation.isPending || !newTournament.site || !newTournament.buyIn}
                  >
                    {addTournamentMutation.isPending ? "Adicionando..." : "Adicionar Torneio"}
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
                        <div key={tournament.id} className="relative">
                          <div className="p-2 bg-blue-900/20 rounded-lg border border-blue-600/30 relative">
                            {/* Botão desfazer no canto superior direito */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleUnregisterTournament(tournament.id)}
                              className="absolute top-1 right-1 p-1 h-5 w-5 text-gray-400 hover:text-gray-200 hover:bg-blue-800/50"
                            >
                              <Undo2 className="w-3 h-3" />
                            </Button>

                            <div className="flex items-center justify-between gap-3">
                              {/* Informações do torneio - compacta */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <PlayCircle className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                  <span className="font-bold text-blue-400 text-sm">
                                    {tournament.time}
                                  </span>
                                  <span className="font-medium text-white text-sm truncate">{generateTournamentName(tournament)}</span>
                                </div>
                                <div className="flex gap-1 text-xs">
                                  <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
                                    {tournament.site}
                                  </Badge>
                                  <Badge className="bg-gray-600 px-1.5 py-0.5 text-white">
                                    {tournament.type || 'Vanilla'}
                                  </Badge>
                                  <Badge className="bg-gray-700 px-1.5 py-0.5 text-white">
                                    {tournament.speed || 'Normal'}
                                  </Badge>
                                  {(tournament.rebuys || 0) > 0 && (
                                    <Badge className="bg-yellow-600 px-1.5 py-0.5 text-white">
                                      {(tournament.rebuys || 0) + 1}x
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {/* Campos de entrada compactos */}
                              <div className="flex items-center gap-2">
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-blue-300 text-center">Bounty</label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    className="bg-blue-800/50 border-blue-600 text-white h-6 w-14 text-xs p-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                </div>
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-blue-300 text-center">Prize</label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder="0"
                                    className="bg-blue-800/50 border-blue-600 text-white h-6 w-16 text-xs p-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                <div className="flex flex-col gap-1">
                                  <label className="text-xs text-blue-300 text-center">Pos</label>
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="0"
                                    className="bg-blue-800/50 border-blue-600 text-white h-6 w-12 text-xs p-1 text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
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
                                </div>
                              </div>

                              {/* Botões de ação */}
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRebuyTournament(tournament)}
                                  className="border-amber-600 bg-amber-900/30 text-amber-300 hover:bg-amber-800/50 h-6 px-2 text-xs"
                                  disabled={updateTournamentMutation.isPending}
                                >
                                  <Coins className="w-3 h-3 mr-1" />
                                  Rebuy{tournament.rebuys && tournament.rebuys > 0 ? ` (${tournament.rebuys})` : ''}
                                </Button>
                                <Button
                                  onClick={() => handleCompleteTournament(tournament.id, registrationData[tournament.id] || {})}
                                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-[#121212] h-7 px-3 font-bold text-xs shadow-lg transform hover:scale-105 transition-all"
                                >
                                  GG!
                                </Button>
                              </div>
                            </div>
                          </div>
                          {index < registered.length - 1 && <div className="h-px bg-blue-600/30 my-1" />}
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
                          <div className="p-3 bg-gray-800 rounded-lg">
                            <div className="flex justify-between items-center gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <Clock className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                  <span className="font-bold text-gray-300 text-sm">
                                    {tournament.time}
                                  </span>
                                  <span className="font-medium text-white text-sm truncate">{generateTournamentName(tournament)}</span>
                                </div>
                                <div className="flex gap-1 text-xs">
                                  <Badge className={`px-1.5 py-0.5 text-white ${getSiteColor(tournament.site)}`}>
                                    {tournament.site}
                                  </Badge>
                                  <Badge className={`px-1.5 py-0.5 text-white ${getCategoryColor(tournament.category || 'Vanilla')}`}>
                                    {tournament.category || 'Vanilla'}
                                  </Badge>
                                  <Badge className={`px-1.5 py-0.5 text-white ${getSpeedColor(tournament.speed || 'Normal')}`}>
                                    {tournament.speed || 'Normal'}
                                  </Badge>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  Buy-in: <span className="text-poker-green font-medium">${formatNumberWithDots(tournament.buyIn)}</span>
                                  {tournament.guaranteed && (
                                    <span className="ml-3">GTD: <span className="text-blue-400 font-medium">${formatNumberWithDots(tournament.guaranteed)}</span></span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingTournament(tournament);
                                    setShowEditTournamentDialog(true);
                                  }}
                                  className="border-blue-500 bg-blue-900/30 text-blue-200 hover:bg-blue-800/50 hover:text-blue-100 h-7 px-2 text-xs font-medium"
                                >
                                  <Edit className="w-3 h-3 mr-1" />
                                  Editar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleFoldTournament(tournament.id)}
                                  className="border-red-500 bg-red-900/30 text-red-200 hover:bg-red-800/50 hover:text-red-100 h-7 px-2 text-xs font-medium"
                                >
                                  <XCircle className="w-3 h-3 mr-1" />
                                  Fold
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => postponeTournament(tournament.id, 15)}
                                  className="border-orange-500 bg-orange-900/30 text-orange-200 hover:bg-orange-800/50 hover:text-orange-100 h-7 px-2 text-xs font-medium"
                                >
                                  +15min
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => handleRegisterTournament(tournament.id)}
                                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-7 px-2 text-xs font-medium shadow-sm"
                                >
                                  <UserPlus className="w-3 h-3 mr-1" />
                                  Registrar
                                </Button>
                              </div>
                            </div>
                          </div>
                          {index < upcoming.length - 1 && <div className="h-px bg-gray-600 my-1" />}
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
                                    Buy-in: <span className="text-poker-green font-semibold">${formatNumberWithDots(tournament.buyIn)}</span>
                                    {tournament.rebuys > 0 && (
                                      <span className="ml-4">Rebuys: <span className="text-yellow-400 font-semibold">{tournament.rebuys}</span></span>
                                    )}
                                    {tournament.result && parseFloat(tournament.result) > 0 && (
                                      <span className="ml-4">Prize: <span className="text-green-400 font-semibold">${formatNumberWithDots(tournament.result)}</span></span>
                                    )}
                                    {tournament.position && (
                                      <span className="ml-4">Posição: <span className="text-orange-400 font-semibold">{tournament.position}º</span></span>
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
                disabled={breakFeedbackMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold shadow-lg"
              >
                {breakFeedbackMutation.isPending ? "Salvando..." : "Salvar Feedback"}
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
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl flex items-center">
              <Coffee className="w-6 h-6 mr-3 text-poker-accent" />
              Gerenciamento de Breaks
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Visualize seus break feedbacks registrados durante a sessão
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Breaks Registrados */}
            <div>
              <h3 className="text-lg font-semibold text-poker-gold mb-4">Breaks Registrados Hoje</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {breakFeedbacks && breakFeedbacks.length > 0 ? (
                  breakFeedbacks.map((feedback: any) => (
                    <div key={feedback.id} className="p-4 bg-green-900/20 rounded-lg border border-green-600/30">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <Coffee className="w-4 h-4 text-green-400" />
                          <span className="text-white font-medium">
                            Break às {new Date(feedback.breakTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <Badge variant="outline" className="border-green-600 text-green-400">
                            Registrado
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Foco:</span>
                          <span className="text-white font-medium">{feedback.foco}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Energia:</span>
                          <span className="text-white font-medium">{feedback.energia}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Confiança:</span>
                          <span className="text-white font-medium">{feedback.confianca}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Int. Emocional:</span>
                          <span className="text-white font-medium">{feedback.inteligenciaEmocional}/10</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Interferências:</span>
                          <span className="text-white font-medium">{feedback.interferencias}/10</span>
                        </div>
                      </div>
                      {feedback.notes && (
                        <div className="mt-3 p-2 bg-gray-800/50 rounded text-sm">
                          <span className="text-gray-400">Notas:</span>
                          <p className="text-gray-300 mt-1">{feedback.notes}</p>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 bg-gray-800/30 rounded-lg text-center">
                    <Coffee className="w-8 h-8 text-gray-500 mx-auto mb-3" />
                    <p className="text-gray-400 text-sm">
                      Nenhum break registrado ainda nesta sessão
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      Os breaks aparecem automaticamente no minuto 54 de cada hora
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Gerar Novo Report */}
            <div className="border-t border-gray-700 pt-6">
              <Button
                onClick={() => {
                  setShowBreakManagementDialog(false);
                  setShowBreakDialog(true);
                }}
                className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-semibold py-3 h-12 shadow-lg"
              >
                <Plus className="w-5 h-5 mr-3" />
                Gerar Novo Report
              </Button>
              <p className="text-gray-500 text-xs text-center mt-2">
                Registre seu estado mental atual independente do horário
              </p>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <Button 
              onClick={() => setShowBreakManagementDialog(false)}
              variant="outline"
              className="border-gray-600 text-gray-300 hover:bg-gray-800"
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
              <div>
                <Label htmlFor="edit-result" className="text-blue-200">Resultado/Prize ($)</Label>
                <Input
                  id="edit-result"
                  type="number"
                  value={editingTournament.result || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, result: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                  placeholder="Valor ganho"
                />
              </div>
              <div>
                <Label htmlFor="edit-bounty" className="text-blue-200">Bounty ($)</Label>
                <Input
                  id="edit-bounty"
                  type="number"
                  value={editingTournament.bounty || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, bounty: e.target.value})}
                  className="bg-blue-800 border-blue-600 text-white"
                  placeholder="Valor de bounty"
                />
              </div>
              <div>
                <Label htmlFor="edit-position" className="text-blue-200">Posição</Label>
                <Input
                  id="edit-position"
                  type="number"
                  value={editingTournament.position || ""}
                  onChange={(e) => setEditingTournament({...editingTournament, position: e.target.value ? parseInt(e.target.value) : null})}
                  className="bg-blue-800 border-blue-600 text-white"
                  placeholder="Posição final"
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
                        time: editingTournament.time,
                        result: editingTournament.result || '0',
                        bounty: editingTournament.bounty || '0',
                        position: editingTournament.position || null
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

      {/* Session Summary Dialog */}
      <Dialog open={showSessionSummary} onOpenChange={setShowSessionSummary}>
        <DialogContent className="bg-poker-surface border-gray-700 text-white max-w-5xl max-h-[95vh] overflow-y-auto">
          <DialogHeader className="pb-6 border-b border-yellow-500/30 bg-gradient-to-r from-yellow-600/10 to-yellow-500/10 -m-6 mb-6 p-6">
            <DialogTitle className="text-3xl font-bold text-yellow-400 flex items-center justify-center gap-3">
              <Trophy className="w-8 h-8" />
              Resumo da Sessão
            </DialogTitle>
            <DialogDescription className="text-gray-300 text-lg text-center mt-2">
              Revise seu desempenho, registre suas observações e finalize sua sessão de grind
            </DialogDescription>
          </DialogHeader>
          
          {(() => {
            const finalStats = calculateFinalSessionStats();
            const breakAverages = calculateBreakAverages();
            
            return (
              <div className="space-y-6 p-6">
                {/* Performance Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <Card className="bg-blue-900/20 border-blue-600/30">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-blue-400">{finalStats.volume}</div>
                      <div className="text-sm text-gray-400">Volume</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-green-900/20 border-green-600/30">
                    <CardContent className="p-4 text-center">
                      <div className={`text-2xl font-bold ${finalStats.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        ${finalStats.profit.toFixed(2)}
                      </div>
                      <div className="text-sm text-gray-400">Profit</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-purple-900/20 border-purple-600/30">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-purple-400">${finalStats.abiMed.toFixed(2)}</div>
                      <div className="text-sm text-gray-400">ABI Médio</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-yellow-900/20 border-yellow-600/30">
                    <CardContent className="p-4 text-center">
                      <div className={`text-2xl font-bold ${finalStats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {finalStats.roi.toFixed(1)}%
                      </div>
                      <div className="text-sm text-gray-400">ROI</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-orange-900/20 border-orange-600/30">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-orange-400">{finalStats.fts}</div>
                      <div className="text-sm text-gray-400">FTs</div>
                    </CardContent>
                  </Card>
                  <Card className="bg-cyan-900/20 border-cyan-600/30">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl font-bold text-cyan-400">{finalStats.cravadas}</div>
                      <div className="text-sm text-gray-400">Cravadas</div>
                    </CardContent>
                  </Card>
                </div>

                {/* Best Tournament */}
                {finalStats.bestTournament && (
                  <Card className="bg-gradient-to-r from-yellow-600/20 to-yellow-500/20 border-yellow-500/50">
                    <CardHeader className="border-b border-yellow-500/30">
                      <CardTitle className="flex items-center gap-2 text-yellow-400 font-bold text-lg">
                        <Trophy className="w-6 h-6" />
                        Melhor Resultado do Dia
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-semibold text-white">{generateTournamentName(finalStats.bestTournament)}</div>
                          <div className="text-sm text-gray-400">
                            {finalStats.bestTournament.site} • Buy-in: ${finalStats.bestTournament.buyIn}
                            {finalStats.bestTournament.position && ` • Posição: ${finalStats.bestTournament.position}º`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-green-400">
                            ${((parseFloat(finalStats.bestTournament.result) || 0) - (parseFloat(finalStats.bestTournament.buyIn) || 0) * (1 + (finalStats.bestTournament.rebuys || 0))).toFixed(2)}
                          </div>
                          <div className="text-sm text-gray-400">Profit</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Break Feedback Averages */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader className="border-b border-gray-600">
                    <CardTitle className="flex items-center gap-2 text-white font-bold text-lg">
                      <Coffee className="w-6 h-6 text-poker-accent" />
                      Médias dos Break Feedbacks
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    {breakFeedbacks && breakFeedbacks.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="text-center bg-red-900/20 border border-red-600/30 rounded-lg p-3">
                          <div className="text-2xl font-bold text-red-400">{breakAverages.energia.toFixed(1)}</div>
                          <div className="text-sm text-gray-400">Energia</div>
                        </div>
                        <div className="text-center bg-blue-900/20 border border-blue-600/30 rounded-lg p-3">
                          <div className="text-2xl font-bold text-blue-400">{breakAverages.foco.toFixed(1)}</div>
                          <div className="text-sm text-gray-400">Foco</div>
                        </div>
                        <div className="text-center bg-green-900/20 border border-green-600/30 rounded-lg p-3">
                          <div className="text-2xl font-bold text-green-400">{breakAverages.confianca.toFixed(1)}</div>
                          <div className="text-sm text-gray-400">Confiança</div>
                        </div>
                        <div className="text-center bg-purple-900/20 border border-purple-600/30 rounded-lg p-3">
                          <div className="text-2xl font-bold text-purple-400">{breakAverages.inteligenciaEmocional.toFixed(1)}</div>
                          <div className="text-sm text-gray-400">Int. Emocional</div>
                        </div>
                        <div className="text-center bg-orange-900/20 border border-orange-600/30 rounded-lg p-3">
                          <div className="text-2xl font-bold text-orange-400">{breakAverages.interferencias.toFixed(1)}</div>
                          <div className="text-sm text-gray-400">Interferências</div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-gray-400 py-4">
                        Nenhum break feedback registrado nesta sessão
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Session Notes */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader className="border-b border-gray-600">
                    <CardTitle className="flex items-center gap-2 text-white font-bold text-lg">
                      <FileText className="w-6 h-6 text-poker-accent" />
                      Notas de Preparação
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-gray-800/50 p-4 rounded-lg">
                        <Label className="text-sm text-gray-400">Nível de Preparação</Label>
                        <div className="text-2xl font-bold text-poker-accent mt-1">{activeSession?.preparationPercentage || 0}%</div>
                        <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                          <div 
                            className="bg-poker-accent h-2 rounded-full transition-all duration-300" 
                            style={{ width: `${activeSession?.preparationPercentage || 0}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="bg-gray-800/50 p-4 rounded-lg">
                        <Label className="text-sm text-gray-400">Observações de Preparação</Label>
                        <div className="text-white mt-2 text-sm leading-relaxed">{activeSession?.preparationNotes || "Nenhuma observação registrada"}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Session Objective */}
                <Card className="bg-poker-surface border-gray-700">
                  <CardHeader className="border-b border-gray-600">
                    <CardTitle className="flex items-center gap-2 text-white font-bold text-lg">
                      <Target className="w-6 h-6 text-poker-accent" />
                      Objetivo da Sessão
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6 space-y-6">
                    <div className="bg-gray-800/50 p-4 rounded-lg">
                      <Label className="text-sm text-gray-400">Objetivo Definido</Label>
                      <div className="text-white mt-2 leading-relaxed">
                        {activeSession?.dailyGoals || "Nenhum objetivo foi definido para esta sessão"}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <Label className="text-sm text-gray-400 font-medium">Você cumpriu seu objetivo?</Label>
                      <div className="flex gap-4">
                        <Button
                          variant={sessionObjectiveCompleted ? "default" : "outline"}
                          onClick={() => setSessionObjectiveCompleted(true)}
                          className={`flex-1 py-3 ${sessionObjectiveCompleted 
                            ? "bg-green-600 hover:bg-green-700 text-white font-semibold" 
                            : "border-green-600 text-green-400 hover:bg-green-600 hover:text-white"
                          }`}
                        >
                          ✓ Sim, cumpri
                        </Button>
                        <Button
                          variant={sessionObjectiveCompleted === false ? "default" : "outline"}
                          onClick={() => setSessionObjectiveCompleted(false)}
                          className={`flex-1 py-3 ${sessionObjectiveCompleted === false
                            ? "bg-red-600 hover:bg-red-700 text-white font-semibold" 
                            : "border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
                          }`}
                        >
                          ✗ Não cumpri
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label className="text-sm text-gray-400 font-medium">Observações Finais</Label>
                      <Textarea
                        value={sessionFinalNotes}
                        onChange={(e) => setSessionFinalNotes(e.target.value)}
                        placeholder="Como foi sua sessão? O que você aprendeu? Quais foram os pontos altos e baixos?"
                        className="bg-gray-800 border-gray-600 text-white mt-2 min-h-[100px] resize-none"
                        rows={4}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex gap-4 pt-6 border-t border-gray-700">
                  <Button
                    variant="outline"
                    onClick={() => setShowSessionSummary(false)}
                    className="flex-1 py-3 border-gray-600 text-gray-300 hover:bg-gray-800 hover:text-white font-medium"
                  >
                    Voltar à Sessão
                  </Button>
                  <Button
                    onClick={handleSessionFinalization}
                    className="flex-1 py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-semibold shadow-lg"
                    disabled={endSessionMutation.isPending}
                  >
                    {endSessionMutation.isPending ? "Finalizando..." : "Finalizar Sessão"}
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Pending Tournaments Warning Dialog */}
      <Dialog open={showPendingTournamentsDialog} onOpenChange={setShowPendingTournamentsDialog}>
        <DialogContent className="bg-red-900 border-red-600 text-white max-w-2xl">
          <DialogHeader className="pb-6 border-b border-red-500/30">
            <DialogTitle className="text-2xl font-bold text-red-400 flex items-center gap-3">
              <AlertTriangle className="w-7 h-7" />
              Torneios Pendentes Detectados
            </DialogTitle>
            <DialogDescription className="text-red-200 text-base mt-2">
              Você possui torneios registrados sem resultados. Para finalizar a sessão, todos os torneios devem ser contabilizados.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 p-6">
            {/* Pending Tournaments List */}
            <Card className="bg-red-800/30 border-red-600/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-red-300 text-lg">
                  <Trophy className="w-5 h-5" />
                  Torneios Registrados Sem Resultados ({pendingTournaments.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingTournaments.map((tournament: any) => (
                  <div key={tournament.id} className="flex items-center justify-between p-3 bg-red-900/40 rounded-lg border border-red-600/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${getSiteColor(tournament.site)}`}></div>
                      <div>
                        <div className="font-medium text-white">{tournament.name || `${tournament.site} Tournament`}</div>
                        <div className="text-sm text-red-300">
                          {tournament.site} • Buy-in: ${tournament.buyIn}
                          {tournament.rebuys > 0 && ` • Rebuys: ${tournament.rebuys}`}
                        </div>
                      </div>
                    </div>
                    <Badge className="bg-red-600 text-white">Registrado</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Warning Message */}
            <div className="bg-red-800/50 border border-red-600/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-semibold text-red-300 mb-2">Política de Integridade de Dados</h4>
                  <p className="text-red-200 text-sm leading-relaxed">
                    Para manter a precisão dos seus dados, todos os torneios registrados devem ter seus resultados informados antes da finalização. 
                    Os torneios sem resultados serão automaticamente marcados como <strong>GG!</strong> com prize = $0.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-4 border-t border-red-600/30">
              <Button
                variant="outline"
                onClick={() => setShowPendingTournamentsDialog(false)}
                className="flex-1 py-3 border-red-500 text-red-300 hover:bg-red-800 hover:text-white font-medium"
              >
                Voltar e Preencher Resultados
              </Button>
              <Button
                onClick={() => {
                  finalizePendingTournamentsMutation.mutate(pendingTournaments);
                  setShowPendingTournamentsDialog(false);
                  setShowSessionSummary(false);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold"
                disabled={finalizePendingTournamentsMutation.isPending}
              >
                {finalizePendingTournamentsMutation.isPending ? "Finalizando..." : "Finalizar Automaticamente (GG!)"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}